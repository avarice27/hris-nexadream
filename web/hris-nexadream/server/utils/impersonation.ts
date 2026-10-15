import type { H3Event } from 'h3'
import { z } from 'zod'
import { IMPERSONATION_TTL_SECONDS, bearerToken, issueSession, revokeSession } from '../services/auth'

// Masuk sebagai (impersonate). Tiga pintu, semuanya: alasan wajib, sesi 30 menit tanpa refresh,
// tidak boleh berantai, diaudit mulai & selesai, billing read-only, data sensitif diblokir (09 §0).

export const impersonationSchema = z.object({
  reason: z.string().trim().min(10, 'Tulis alasan minimal 10 karakter (atau nomor tiket dukungan).').max(500),
  tenantId: z.string().optional()
})

async function requireImpersonationAllowed(event: H3Event) {
  const ctx = await requirePermission(event, 'impersonation.use')
  if (ctx.impersonatorId) throw forbidden('Hentikan sesi impersonasi terlebih dahulu.')
  return ctx
}

async function issueTenantImpersonation(event: H3Event, staff: Awaited<ReturnType<typeof requireImpersonationAllowed>>, tenantUserId: string, tenantId: string, reason: string, door: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, deletedAt: true } })
  if (!tenant || tenant.deletedAt) throw notFound('Perusahaan tidak ditemukan.')
  const token = await issueSession({ sub: tenantUserId, aud: 'tenant', tid: tenantId, imp: staff.user.id }, { expiresInSeconds: IMPERSONATION_TTL_SECONDS })
  await recordAudit(event, {
    audience: 'platform', action: 'tenant.impersonate_start', actorId: staff.user.id, actorName: staff.user.name,
    tenantId, targetType: 'tenant_user', targetId: tenantUserId, metadata: { reason, door }
  })
  return {
    token,
    expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
    tenant: { id: tenant.id, name: tenant.name }
  }
}

/** Pintu 1: sebagai PEMILIK perusahaan. */
export async function impersonateTenantOwner(event: H3Event, tenantId: string, input: z.infer<typeof impersonationSchema>) {
  const staff = await requireImpersonationAllowed(event)
  const owner = await prisma.tenantMembership.findFirst({
    where: { tenantId, role: 'owner', isActive: true, tenantUser: { isActive: true } },
    select: { tenantUserId: true }
  })
  if (!owner) throw conflict('Perusahaan ini tidak punya pemilik aktif.')
  return issueTenantImpersonation(event, staff, owner.tenantUserId, tenantId, input.reason, 'tenant')
}

/** Pintu 2: sebagai login tertentu (keanggotaan aktif tertua bila tenantId tidak diberikan). */
export async function impersonateTenantUser(event: H3Event, tenantUserId: string, input: z.infer<typeof impersonationSchema>) {
  const staff = await requireImpersonationAllowed(event)
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantUserId, isActive: true, tenantUser: { isActive: true }, tenant: { deletedAt: null }, ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { tenantId: true }
  })
  if (!membership) throw conflict('Login ini tidak punya keanggotaan aktif.')
  return issueTenantImpersonation(event, staff, tenantUserId, membership.tenantId, input.reason, 'tenant_user')
}

/** Pintu 3: sebagai staf lain (hanya superadmin; tidak ke superadmin lain, tidak ke diri sendiri). */
export async function impersonateStaff(event: H3Event, userId: string, input: z.infer<typeof impersonationSchema>) {
  const staff = await requireImpersonator(event)
  if (userId === staff.user.id) throw conflict('Anda tidak bisa masuk sebagai diri sendiri.')
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
  if (!target || !target.isActive) throw notFound('Staf tidak ditemukan.')
  if (target.role.isSuperAdmin) throw forbidden('Tidak bisa masuk sebagai superadmin lain.')
  const token = await issueSession({ sub: target.id, aud: 'platform', imp: staff.user.id }, { expiresInSeconds: IMPERSONATION_TTL_SECONDS })
  await recordAudit(event, {
    audience: 'platform', action: 'user.impersonate_start', actorId: staff.user.id, actorName: staff.user.name,
    targetType: 'user', targetId: target.id, metadata: { reason: input.reason }
  })
  return { token, expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(), user: { id: target.id, name: target.name } }
}

export async function stopTenantImpersonation(event: H3Event) {
  const ctx = await requireTenantContext(event)
  if (!ctx.impersonatorId) throw httpError(400, 'VALIDATION_FAILED', 'Ini bukan sesi impersonasi.')
  await recordAudit(event, {
    audience: 'platform', action: 'tenant.impersonate_stop', actorId: ctx.impersonatorId,
    tenantId: ctx.tenantId, targetType: 'tenant_user', targetId: ctx.user.id
  })
  const token = bearerToken(event)
  if (token) await revokeSession(token)
  return { success: true }
}

export async function stopPlatformImpersonation(event: H3Event) {
  const ctx = await requirePlatformContext(event)
  if (!ctx.impersonatorId) throw httpError(400, 'VALIDATION_FAILED', 'Ini bukan sesi impersonasi.')
  await recordAudit(event, {
    audience: 'platform', action: 'user.impersonate_stop', actorId: ctx.impersonatorId, targetType: 'user', targetId: ctx.user.id
  })
  const token = bearerToken(event)
  if (token) await revokeSession(token)
  return { success: true }
}

/**
 * Pembacaan data sensitif (NIK, NPWP, gaji, slip, rekening, dokumen) selama impersonasi diblokir,
 * apa pun hak pemiliknya — kecuali staf memegang impersonation.viewSensitive secara eksplisit
 * (tanpa bypass superadmin). Bila diizinkan, dicatat sebagai impersonation.sensitive_read.
 */
export async function assertSensitiveReadAllowed(event: H3Event, detail: { fieldGroup: string, targetType: string, targetId: string }) {
  const ctx = await requireTenantContext(event)
  if (!ctx.impersonatorId) return
  const holder = await prisma.rolePermission.findFirst({
    where: { permission: { key: 'impersonation.viewSensitive' }, role: { users: { some: { id: ctx.impersonatorId, isActive: true } } } },
    select: { roleId: true }
  })
  if (!holder) throw forbidden('Data sensitif tidak dapat dibuka selama sesi dukungan (impersonasi).')
  await recordAudit(event, {
    audience: 'platform', action: 'impersonation.sensitive_read', actorId: ctx.impersonatorId, tenantId: ctx.tenantId,
    targetType: detail.targetType, targetId: detail.targetId, metadata: { fieldGroup: detail.fieldGroup }
  })
}
