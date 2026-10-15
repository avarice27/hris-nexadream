import type { H3Event } from 'h3'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { ASSIGNABLE_TENANT_ROLES, SEAT_TENANT_ROLES, TENANT_ROLE_PRESETS, type TenantRoleSlug } from '#shared/utils/tenant-abilities'
import { formatDateId } from '#shared/utils/format'
import type { Prisma } from '~~/generated/prisma/client'
import { hashPassword, startSession } from '../services/auth'

// Tim perusahaan: login Pemilik / Admin HR / Atasan yang memakai seat teamMembers.
// Login karyawan (ESS) diundang dari rekam karyawan (fase 11) dan tidak memakai seat.

const INVITE_TTL_MS = 7 * 86400_000
const INVITE_EXPIRED = 'Undangan sudah tidak berlaku. Minta undangan baru kepada pengundang.'

export const inviteMemberSchema = z.object({
  email: z.email('Masukkan alamat email yang valid.'),
  name: z.string().trim().max(80).optional(),
  role: z.enum(ASSIGNABLE_TENANT_ROLES as [TenantRoleSlug, ...TenantRoleSlug[]], 'Pilih peran Admin HR atau Atasan.'),
  branchIds: z.array(z.string()).max(100).optional()
})

export const updateMemberSchema = z.object({
  role: z.enum(ASSIGNABLE_TENANT_ROLES as [TenantRoleSlug, ...TenantRoleSlug[]]).optional(),
  branchIds: z.array(z.string()).max(100).optional(),
  isActive: z.boolean().optional()
})

export const acceptInvitationSchema = z.object({
  token: z.string().min(10, 'Tautan undangan tidak valid.'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`).optional()
})

/**
 * Cakupan kantor yang boleh disimpan: dibuang (= semua kantor) bila paket tidak punya
 * branchScopedRoles; disaring ke kantor milik tenant ini.
 */
export async function resolveBranchScope(tenantId: string, requested: string[] | undefined): Promise<string[]> {
  if (!requested?.length) return []
  if (!(await can(tenantId, 'branchScopedRoles'))) return []
  const owned = await prisma.branch.findMany({ where: { tenantId, id: { in: requested } }, select: { id: true } })
  return owned.map(b => b.id)
}

/** Login yang masih punya keanggotaan di tenant lain yang belum dihapus (aktif ATAU tidak). */
async function membershipElsewhere(tenantUserId: string, tenantId: string) {
  return prisma.tenantMembership.findFirst({
    where: { tenantUserId, NOT: { tenantId }, tenant: { deletedAt: null } },
    include: { tenant: { select: { name: true } } }
  })
}

// ---------------------------------------------------------------------------
// Daftar
// ---------------------------------------------------------------------------

export async function listTeam(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'team.manage')
  const now = new Date()
  const [members, invitations, seats, entitlements, essLogins] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: ctx.tenantId, role: { in: SEAT_TENANT_ROLES } },
      include: { tenantUser: true, branches: { select: { branchId: true } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }]
    }),
    prisma.tenantInvitation.findMany({
      where: { tenantId: ctx.tenantId, acceptedAt: null, revokedAt: null, role: { in: ['hr_admin', 'manager'] } },
      orderBy: { createdAt: 'desc' }
    }),
    teamSeatUsage(ctx.tenantId),
    getEntitlements(ctx.tenantId),
    prisma.tenantMembership.count({ where: { tenantId: ctx.tenantId, role: 'employee', isActive: true } })
  ])
  return {
    members: members.map(m => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      isSelf: m.tenantUserId === ctx.user.id,
      branchIds: m.branches.map(b => b.branchId),
      user: {
        id: m.tenantUser.id,
        name: m.tenantUser.name,
        email: m.tenantUser.email,
        phone: m.tenantUser.phone,
        avatarUrl: m.tenantUser.avatarUrl,
        lastLoginAt: m.tenantUser.lastLoginAt?.toISOString() ?? null
      },
      createdAt: m.createdAt.toISOString()
    })),
    invitations: invitations.map(i => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      branchIds: Array.isArray(i.branchIds) ? i.branchIds as string[] : [],
      expiresAt: i.expiresAt.toISOString(),
      isExpired: i.expiresAt <= now,
      createdAt: i.createdAt.toISOString()
    })),
    seats: { ...seats, limit: entitlements.limits.teamMembers },
    essLogins,
    branchScopeAvailable: entitlements.features.branchScopedRoles
  }
}

// ---------------------------------------------------------------------------
// Undang / batalkan
// ---------------------------------------------------------------------------

export async function inviteMember(event: H3Event, input: z.infer<typeof inviteMemberSchema>) {
  const ctx = await requireTenantAbility(event, 'team.manage')
  const email = input.email.trim().toLowerCase()
  if (email === ctx.user.email) throw conflict('Anda tidak bisa mengundang diri sendiri.', { field: 'email' })

  const existingUser = await prisma.tenantUser.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    const here = await prisma.tenantMembership.findFirst({ where: { tenantId: ctx.tenantId, tenantUserId: existingUser.id } })
    if (here) throw conflict('Email ini sudah menjadi anggota perusahaan Anda.', { field: 'email' })
    // Pengundang hanya diberi tahu BAHWA alamat ini milik perusahaan lain, tidak pernah yang MANA.
    if (await membershipElsewhere(existingUser.id, ctx.tenantId)) {
      throw conflict('Email ini sudah terhubung ke perusahaan lain. Gunakan email lain.', { field: 'email' })
    }
  }

  // Seat: undangan untuk email yang sama akan diganti, jadi tidak dihitung dua kali.
  const seats = await teamSeatUsage(ctx.tenantId)
  const replacing = await prisma.tenantInvitation.count({
    where: { tenantId: ctx.tenantId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, role: { in: ['hr_admin', 'manager'] } }
  })
  await assertWithinLimit(ctx.tenantId, 'teamMembers', seats.used - replacing)

  const branchIds = await resolveBranchScope(ctx.tenantId, input.branchIds)
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  const data = {
    name: input.name || null,
    role: input.role,
    branchIds: branchIds as Prisma.InputJsonValue,
    tokenHash: sha256(token),
    invitedById: ctx.user.id,
    expiresAt,
    acceptedAt: null,
    revokedAt: null,
    employeeId: null
  }
  const invitation = await prisma.tenantInvitation.upsert({
    where: { tenantId_email: { tenantId: ctx.tenantId, email } },
    update: data,
    create: { tenantId: ctx.tenantId, email, ...data }
  })
  invalidateEntitlements(ctx.tenantId)

  await sendTemplatedEmail({
    to: email,
    templateKey: 'tenant_invitation',
    params: {
      name: input.name || email,
      inviterName: ctx.user.name,
      tenantName: ctx.tenant.name,
      roleName: TENANT_ROLE_PRESETS[input.role].label,
      inviteUrl: `/app/auth/accept-invite?token=${token}`,
      expiresAt: formatDateId(expiresAt, ctx.tenant.timezone)
    }
  })
  await recordAudit(event, {
    audience: 'tenant', action: 'team.invite', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant_invitation', targetId: invitation.id,
    metadata: { email, role: input.role }
  })
  return { id: invitation.id, email, role: input.role, expiresAt: expiresAt.toISOString() }
}

export async function revokeInvitation(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'team.manage')
  const invitation = await prisma.tenantInvitation.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!invitation) throw notFound('Undangan tidak ditemukan.')
  if (invitation.acceptedAt) throw conflict('Undangan ini sudah diterima.')
  await prisma.tenantInvitation.update({ where: { id }, data: { revokedAt: new Date() } })
  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, {
    audience: 'tenant', action: 'team.invite_revoke', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant_invitation', targetId: id,
    metadata: { email: invitation.email }
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Ubah anggota
// ---------------------------------------------------------------------------

export async function updateMember(event: H3Event, membershipId: string, input: z.infer<typeof updateMemberSchema>) {
  const ctx = await requireTenantAbility(event, 'team.manage')
  const member = await prisma.tenantMembership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId },
    include: { tenantUser: { select: { name: true } } }
  })
  if (!member) throw notFound('Anggota tim tidak ditemukan.')
  if (member.role === 'owner') throw conflict('Peran dan akses Pemilik tidak bisa diubah di sini.')
  if (member.tenantUserId === ctx.user.id) throw conflict('Anda tidak bisa mengubah akses Anda sendiri.')
  if (member.role === 'employee') throw conflict('Akses karyawan dikelola dari data karyawan.')

  if (input.isActive === true && !member.isActive) {
    if (await membershipElsewhere(member.tenantUserId, ctx.tenantId).then(m => m?.isActive)) {
      throw conflict('Pengguna ini sudah aktif di perusahaan lain.')
    }
    const seats = await teamSeatUsage(ctx.tenantId)
    await assertWithinLimit(ctx.tenantId, 'teamMembers', seats.used)
  }

  const branchIds = input.branchIds !== undefined ? await resolveBranchScope(ctx.tenantId, input.branchIds) : null
  await prisma.$transaction(async (tx) => {
    await tx.tenantMembership.update({
      where: { id: member.id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      }
    })
    if (branchIds) {
      await tx.tenantMembershipBranch.deleteMany({ where: { membershipId: member.id } })
      if (branchIds.length) {
        await tx.tenantMembershipBranch.createMany({
          data: branchIds.map(branchId => ({ tenantId: ctx.tenantId, membershipId: member.id, branchId }))
        })
      }
    }
  })
  invalidateEntitlements(ctx.tenantId)

  const base = {
    audience: 'tenant' as const, actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId,
    impersonatorId: ctx.impersonatorId, targetType: 'tenant_membership', targetId: member.id
  }
  if (input.role && input.role !== member.role) await recordAudit(event, { ...base, action: 'team.role_change', metadata: { from: member.role, to: input.role } })
  if (branchIds) await recordAudit(event, { ...base, action: 'team.branch_change', metadata: { branchCount: branchIds.length } })
  if (input.isActive !== undefined && input.isActive !== member.isActive) {
    await recordAudit(event, { ...base, action: input.isActive ? 'team.reactivate' : 'team.deactivate', metadata: { name: member.tenantUser.name } })
  }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Terima undangan (publik — tautan email membuktikan kepemilikan alamat)
// ---------------------------------------------------------------------------

async function findUsableInvitation(token: string) {
  const invitation = await prisma.tenantInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { tenant: { select: { id: true, name: true, deletedAt: true, status: true, timezone: true } } }
  })
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date() || invitation.tenant.deletedAt) {
    throw httpError(400, 'VALIDATION_FAILED', INVITE_EXPIRED)
  }
  return invitation
}

export async function previewInvitation(event: H3Event, token: string) {
  await assertSharedRateLimit('tenant-invite-preview:ip', clientIp(event), 30, 15 * 60 * 1000)
  const invitation = await findUsableInvitation(token)
  const user = await prisma.tenantUser.findUnique({
    where: { email: invitation.email },
    select: { id: true, name: true, passwordHash: true, identities: { select: { id: true } } }
  })
  const elsewhere = user ? await membershipElsewhere(user.id, invitation.tenantId) : null
  return {
    email: invitation.email,
    name: user?.name ?? invitation.name,
    tenantName: invitation.tenant.name,
    role: invitation.role,
    roleLabel: TENANT_ROLE_PRESETS[invitation.role].label,
    expiresAt: invitation.expiresAt.toISOString(),
    hasAccount: !!user,
    // Kata sandi hanya diminta bila akun belum punya cara masuk sama sekali.
    needsPassword: !user || (!user.passwordHash && user.identities.length === 0),
    // Pemilik alamat boleh tahu nama perusahaan lain tersebut.
    blockedByTenantName: elsewhere?.tenant.name ?? null
  }
}

export async function acceptInvitation(event: H3Event, input: z.infer<typeof acceptInvitationSchema>) {
  await assertSharedRateLimit('tenant-invite-accept:ip', clientIp(event), 20, 15 * 60 * 1000)
  const invitation = await findUsableInvitation(input.token)
  const tenantId = invitation.tenantId
  const isSeatRole = invitation.role !== 'employee'

  if (isSeatRole) {
    const active = await prisma.tenantMembership.count({ where: { tenantId, isActive: true, role: { in: SEAT_TENANT_ROLES } } })
    await assertWithinLimit(tenantId, 'teamMembers', active)
  }

  const existing = await prisma.tenantUser.findUnique({
    where: { email: invitation.email },
    include: { identities: { select: { id: true } } }
  })
  if (existing) {
    const elsewhere = await membershipElsewhere(existing.id, tenantId)
    if (elsewhere) throw conflict(`Email ini masih terhubung ke ${elsewhere.tenant.name}. Satu akun hanya bisa terhubung ke satu perusahaan.`)
    if (!existing.isActive) throw forbidden('Akun ini dinonaktifkan. Hubungi tim dukungan kami.')
  }
  const needsPassword = !existing || (!existing.passwordHash && existing.identities.length === 0)
  if (needsPassword && !input.password) {
    throw httpError(400, 'VALIDATION_FAILED', 'Buat kata sandi untuk akun Anda.', { field: 'password' })
  }
  // Undangan TIDAK PERNAH menimpa kredensial yang sudah ada.
  const passwordHash = needsPassword && input.password ? await hashPassword(input.password) : null
  const branchIds = Array.isArray(invitation.branchIds) ? invitation.branchIds as string[] : []
  const now = new Date()

  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.tenantInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now }
    })
    if (claimed.count !== 1) throw httpError(400, 'VALIDATION_FAILED', INVITE_EXPIRED)

    const user = existing
      ? await tx.tenantUser.update({
          where: { id: existing.id },
          data: { ...(passwordHash ? { passwordHash } : {}), emailVerifiedAt: existing.emailVerifiedAt ?? now }
        })
      : await tx.tenantUser.create({
          data: { name: input.name, email: invitation.email, passwordHash, emailVerifiedAt: now }
        })

    const membership = await tx.tenantMembership.upsert({
      where: { tenantId_tenantUserId: { tenantId, tenantUserId: user.id } },
      update: { role: invitation.role, isActive: true, invitedById: invitation.invitedById },
      create: { tenantId, tenantUserId: user.id, role: invitation.role, invitedById: invitation.invitedById }
    })
    await tx.tenantMembershipBranch.deleteMany({ where: { membershipId: membership.id } })
    const validBranches = branchIds.length
      ? await tx.branch.findMany({ where: { tenantId, id: { in: branchIds } }, select: { id: true } })
      : []
    if (validBranches.length) {
      await tx.tenantMembershipBranch.createMany({
        data: validBranches.map(b => ({ tenantId, membershipId: membership.id, branchId: b.id }))
      })
    }
    // Undangan ESS: tautkan login ke rekam karyawan (satu fakta dengan penerimaan undangan).
    if (invitation.role === 'employee') await linkEmployeeOnAccept(tx, tenantId, invitation.employeeId, user.id)
    return user
  })

  invalidateEntitlements(tenantId)
  await recordAudit(event, {
    audience: 'tenant', action: 'team.invite_accept', actorId: user.id, actorName: user.name,
    tenantId, targetType: 'tenant_invitation', targetId: invitation.id, metadata: { role: invitation.role }
  })
  // Beri tahu pemilik (bel, tanpa email). Kegagalan ditelan.
  const owner = await prisma.tenantMembership.findFirst({ where: { tenantId, role: 'owner', isActive: true }, select: { tenantUserId: true } })
  if (owner) {
    await safeCreateNotification({
      audience: 'tenant', tenantUserId: owner.tenantUserId, tenantId, templateKey: 'team_invite_accepted',
      variables: { memberName: user.name, roleName: TENANT_ROLE_PRESETS[invitation.role].label }, channels: { email: false }
    })
  }
  return startSession(user.id, 'tenant', tenantId, !existing)
}
