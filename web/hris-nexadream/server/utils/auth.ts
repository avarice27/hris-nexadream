import type { H3Event } from 'h3'
import type { PermissionKey } from '#shared/utils/permissions'
import { SENSITIVE_ABILITIES, canTenantRole, isTenantRole, type TenantAbility, type TenantRoleSlug } from '#shared/utils/tenant-abilities'
import type { Plan, Subscription, Tenant, TenantMembership, TenantUser, User, Role } from '~~/generated/prisma/client'
import { loadAuthUser, noActiveMembershipMessage, readSession, type SessionClaims } from '../services/auth'

// Gatekeeper server. Setiap handler (atau util yang dipanggilnya) memulai dengan TEPAT SATU
// fungsi require* di bawah ini. Lihat saas-blueprint/03 §3 dan 04 §3.

export interface PlatformContext {
  user: User & { role: Role }
  permissions: Set<string>
  isSuperAdmin: boolean
  impersonatorId: string | null
  claims: SessionClaims
}

export interface TenantContext {
  user: TenantUser
  tenant: Tenant & { subscription: (Subscription & { plan: Plan }) | null }
  membership: TenantMembership
  tenantId: string
  role: TenantRoleSlug
  /** null = semua kantor (tidak dibatasi) */
  branchIds: string[] | null
  impersonatorId: string | null
  claims: SessionClaims
  /** Diisi bila request diautentikasi X-Api-Key (integrasi), bukan sesi login. */
  apiKey?: { id: string, name: string, scopes: Array<'read' | 'write' | 'sensitive'> }
}

/** Kemampuan yang tidak pernah boleh dipakai API key (langganan, akun, tim). */
const API_KEY_BLOCKED_ABILITIES: TenantAbility[] = ['billing.manage', 'account.manage', 'team.manage']

/**
 * Sesi impersonasi hanya sah selama staf yang memulainya masih aktif dan masih memegang
 * impersonation.use (atau superadmin). Staf yang dinonaktifkan langsung kehilangan sesi tsb.
 */
async function assertImpersonatorStillAllowed(staffId: string) {
  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    select: { isActive: true, role: { select: { isSuperAdmin: true, permissions: { where: { permission: { key: 'impersonation.use' } }, select: { roleId: true } } } } }
  })
  if (!staff?.isActive || (!staff.role.isSuperAdmin && staff.role.permissions.length === 0)) {
    throw unauthenticated('Sesi dukungan sudah tidak berlaku.')
  }
}

/** Hak eksplisit TANPA bypass superadmin — untuk hak yang sengaja tidak tersirat (impersonation.viewSensitive). */
export function hasExplicitPermission(context: PlatformContext, key: PermissionKey): boolean {
  return context.permissions.has(key)
}

/** Non-throwing: untuk endpoint yang aman diakses anonim. */
export async function tryGetSession(event: H3Event): Promise<SessionClaims | null> {
  return readSession(event)
}

// ---------------------------------------------------------------------------
// Platform (staf back-office)
// ---------------------------------------------------------------------------

export async function requirePlatformContext(event: H3Event): Promise<PlatformContext> {
  if (event.context.platformContext) return event.context.platformContext
  const claims = await readSession(event)
  if (!claims) throw unauthenticated()
  if (claims.aud !== 'platform') throw forbidden()

  if (claims.imp) await assertImpersonatorStillAllowed(claims.imp)
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { role: { include: { permissions: { include: { permission: { select: { key: true } } } } } } }
  })
  if (!user || !user.isActive) throw unauthenticated()

  const { permissions: rolePermissions, ...role } = user.role
  const context: PlatformContext = {
    user: { ...user, role },
    permissions: new Set(rolePermissions.map(rp => rp.permission.key)),
    isSuperAdmin: role.isSuperAdmin,
    impersonatorId: claims.imp ?? null,
    claims
  }
  event.context.platformContext = context
  void touchLastSeen('platform', user.id)
  return context
}

export async function requirePlatformUser(event: H3Event) {
  return (await requirePlatformContext(event)).user
}

export async function requirePermission(event: H3Event, key: PermissionKey): Promise<PlatformContext> {
  const context = await requirePlatformContext(event)
  if (!context.isSuperAdmin && !context.permissions.has(key)) throw forbidden()
  return context
}

export async function requireSuperAdmin(event: H3Event): Promise<PlatformContext> {
  const context = await requirePlatformContext(event)
  if (!context.isSuperAdmin) throw forbidden('Hanya superadmin yang dapat melakukan tindakan ini.')
  return context
}

/** Superadmin DAN tidak sedang impersonasi (tanpa rantai impersonasi). */
export async function requireImpersonator(event: H3Event): Promise<PlatformContext> {
  const context = await requireSuperAdmin(event)
  if (context.impersonatorId) throw forbidden('Hentikan sesi impersonasi terlebih dahulu.')
  return context
}

// ---------------------------------------------------------------------------
// Tenant (perusahaan)
// ---------------------------------------------------------------------------

export async function requireTenantContext(event: H3Event): Promise<TenantContext> {
  if (event.context.tenantContext) return event.context.tenantContext
  const claims = await readSession(event)
  if (!claims) throw unauthenticated()
  if (claims.aud !== 'tenant') throw forbidden()

  const user = await prisma.tenantUser.findUnique({ where: { id: claims.sub } })
  if (!user || !user.isActive) throw unauthenticated()
  if (claims.imp) await assertImpersonatorStillAllowed(claims.imp)

  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantUserId: user.id, isActive: true, ...(claims.tid ? { tenantId: claims.tid } : {}) },
    orderBy: { createdAt: 'asc' },
    include: {
      branches: { select: { branchId: true } },
      tenant: { include: { subscription: { include: { plan: true } } } }
    }
  })
  if (!membership) throw httpError(403, 'FORBIDDEN', await noActiveMembershipMessage(user.id, claims.tid))

  const { tenant, branches, ...membershipRow } = membership
  if (tenant.deletedAt) throw httpError(403, 'TENANT_DELETED', 'Akun perusahaan Anda sudah dihapus.')
  if (tenant.status === 'suspended') {
    throw httpError(403, 'TENANT_SUSPENDED', 'Akun perusahaan Anda sedang ditangguhkan. Hubungi tim dukungan kami.')
  }
  if (!isTenantRole(membershipRow.role)) throw forbidden()

  const context: TenantContext = {
    user,
    tenant,
    membership: membershipRow,
    tenantId: tenant.id,
    role: membershipRow.role,
    branchIds: branches.length > 0 ? branches.map(b => b.branchId) : null,
    impersonatorId: claims.imp ?? null,
    claims
  }
  event.context.tenantContext = context
  void touchLastSeen('tenant', user.id)
  return context
}

export async function requireTenantAbility(event: H3Event, ability: TenantAbility): Promise<TenantContext> {
  const context = await requireTenantContext(event)
  if (!canTenantRole(context.role, ability)) throw forbidden()
  if (context.apiKey) {
    if (API_KEY_BLOCKED_ABILITIES.includes(ability)) throw forbidden('Tindakan ini tidak tersedia lewat API key.')
    // Data pribadi & gaji (D7) hanya untuk key dengan scope `sensitive` yang dicentang pemilik.
    if ((SENSITIVE_ABILITIES as readonly TenantAbility[]).includes(ability) && !context.apiKey.scopes.includes('sensitive')) {
      throw httpError(403, 'FORBIDDEN', 'API key ini tidak memiliki scope sensitive.', { requiredScope: 'sensitive' })
    }
  }
  return context
}

/** Penulisan billing ditolak saat sesi impersonasi. */
export async function requireNotImpersonating(event: H3Event): Promise<void> {
  const claims = await readSession(event)
  if (claims?.imp) throw forbidden('Tindakan ini tidak tersedia selama sesi dukungan (impersonasi).')
}

/** Di-spread ke where Prisma: { tenantId, ...branchScopeWhere(ctx) }. */
export function branchScopeWhere(context: Pick<TenantContext, 'branchIds'>, field = 'branchId'): Record<string, unknown> {
  if (!context.branchIds) return {}
  return { [field]: { in: context.branchIds } }
}

/** 404 (bukan 403) untuk kantor milik tenant lain DAN kantor di luar cakupan. */
export async function requireBranchAccess(event: H3Event, branchId: string) {
  const context = await requireTenantContext(event)
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: context.tenantId } })
  if (!branch) throw notFound('Kantor tidak ditemukan.')
  if (context.branchIds && !context.branchIds.includes(branch.id)) throw notFound('Kantor tidak ditemukan.')
  return branch
}

/** Profil "siapa saya" tenant: pengguna + ringkasan perusahaan. */
export async function tenantProfile(event: H3Event) {
  const context = await requireTenantContext(event)
  const user = await loadAuthUser(context.user.id, 'tenant', context.tenantId)
  if (!user) throw unauthenticated()
  const { tenant } = context
  return {
    user,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      logoUrl: tenant.logoUrl,
      timezone: tenant.timezone,
      onboardingCompletedAt: tenant.onboardingCompletedAt?.toISOString() ?? null,
      // Setelah turun paket melewati batas kantor → pemilik wajib memilih kantor yang tetap aktif.
      needsBranchSelection: await needsBranchSelection(tenant.id, tenant.downgradeResolvedAt)
    },
    // Employee yang terhubung ke login ini (null = belum ditautkan).
    employeeId: (await prisma.employee.findFirst({ where: { tenantId: context.tenantId, tenantUserId: context.user.id }, select: { id: true } }))?.id ?? null,
    displayTimezone: tenant.timezone,
    impersonating: !!context.impersonatorId
  }
}
