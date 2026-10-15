import type { H3Event } from 'h3'
import { abilitiesFor, isTenantRole } from '#shared/utils/tenant-abilities'
import { credentialsProvider } from './providers/credentials'
import { jwtExpiresIn, jwtSessionDriver } from './sessions/jwt'
import type { Audience, AuthProvider, AuthUser, SessionClaims, SessionDriver, SignInResult } from './types'

// Fasad autentikasi — SATU-SATUNYA titik impor untuk kode bisnis.
// Tidak ada handler/halaman yang boleh tahu bahwa di bawahnya JWT + bcrypt.

export type { Audience, AuthUser, SessionClaims, SignInResult } from './types'
export { hashPassword, verifyPassword } from './providers/credentials'

const providers: Record<string, AuthProvider> = {
  [credentialsProvider.name]: credentialsProvider
}

const sessionDrivers: Record<string, SessionDriver> = {
  [jwtSessionDriver.name]: jwtSessionDriver
}

let selectedDriver: SessionDriver | null = null

export function getSessionDriver(): SessionDriver {
  if (selectedDriver) return selectedDriver
  const name = process.env.AUTH_SESSION_DRIVER || 'jwt'
  const driver = sessionDrivers[name]
  if (!driver) throw new Error(`Unknown AUTH_SESSION_DRIVER "${name}".`)
  selectedDriver = driver
  return driver
}

/** Lama sesi dalam detik, dari JWT_EXPIRES_IN ('7d', '12h', '3600'). */
export function sessionLifetimeSeconds(): number {
  const raw = jwtExpiresIn()
  const match = /^(\d+)\s*([smhd]?)$/.exec(raw.trim())
  if (!match) return 7 * 24 * 3600
  const value = Number(match[1])
  const unit = match[2] || 's'
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit as 's' | 'm' | 'h' | 'd']
  return value * factor
}

export async function issueSession(claims: SessionClaims, options?: { expiresInSeconds?: number }): Promise<string> {
  return await getSessionDriver().issue(claims, options)
}

/** Sesi impersonasi: pendek (30 menit), tanpa refresh. */
export const IMPERSONATION_TTL_SECONDS = 30 * 60

export async function revokeSession(token: string): Promise<void> {
  await getSessionDriver().revoke(token)
}

export function bearerToken(event: H3Event): string | null {
  const header = getRequestHeader(event, 'authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

export async function readSession(event: H3Event): Promise<SessionClaims | null> {
  if (event.context.sessionClaims !== undefined) return event.context.sessionClaims
  const token = bearerToken(event)
  const claims = token ? await getSessionDriver().verify(token) : null
  event.context.sessionClaims = claims
  return claims
}

/** "Siapa saya" untuk kedua audiens. Tidak pernah memuat passwordHash ke respons. */
export async function loadAuthUser(userId: string, audience: Audience, tenantId?: string): Promise<AuthUser | null> {
  if (audience === 'platform') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } }
    })
    if (!user || !user.isActive) return null
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      audience,
      role: { id: user.role.id, slug: user.role.slug, name: user.role.name, isSuperAdmin: user.role.isSuperAdmin },
      permissions: user.role.permissions.map(rp => rp.permission.key),
      hasPassword: true
    }
  }

  const user = await prisma.tenantUser.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) return null
  const membership = tenantId
    ? await prisma.tenantMembership.findFirst({ where: { tenantUserId: userId, tenantId, isActive: true } })
    : null
  const tenantRole = membership && isTenantRole(membership.role) ? membership.role : undefined
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    audience,
    tenantRole,
    abilities: tenantRole ? abilitiesFor(tenantRole) : [],
    hasPassword: !!user.passwordHash
  }
}

/** Membedakan "belum pernah bergabung" dari "dinonaktifkan oleh pemilik X". */
export async function noActiveMembershipMessage(tenantUserId: string, tenantId?: string): Promise<string> {
  const inactive = await prisma.tenantMembership.findFirst({
    where: { tenantUserId, isActive: false, ...(tenantId ? { tenantId } : {}) },
    include: { tenant: { select: { name: true } } }
  })
  if (inactive) {
    return `Akses Anda ke ${inactive.tenant.name} telah dinonaktifkan. Hubungi pemilik atau Admin HR perusahaan Anda.`
  }
  return 'Akun Anda belum terhubung ke perusahaan mana pun.'
}

/** Memilih tenant pertama yang bisa dipakai untuk login tenant; melempar 403 bila tidak ada. */
async function resolveSignInTenant(tenantUserId: string): Promise<string> {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantUserId, isActive: true },
    include: { tenant: { select: { id: true, deletedAt: true } } },
    orderBy: { createdAt: 'asc' }
  })
  if (memberships.length === 0) {
    throw httpError(403, 'FORBIDDEN', await noActiveMembershipMessage(tenantUserId))
  }
  const usable = memberships.find(m => !m.tenant.deletedAt)
  if (!usable) {
    throw httpError(403, 'TENANT_DELETED', 'Akun perusahaan Anda sudah dihapus.')
  }
  return usable.tenantId
}

export async function signIn(
  input: Record<string, unknown>,
  audience: Audience,
  providerName = 'credentials'
): Promise<SignInResult> {
  const provider = providers[providerName]
  if (!provider || !provider.supports.includes(audience)) {
    throw httpError(400, 'VALIDATION_FAILED', 'Metode masuk tidak didukung.')
  }
  const identity = await provider.authenticate(input, audience)
  const tenantId = audience === 'tenant' ? await resolveSignInTenant(identity.userId) : undefined
  const user = await loadAuthUser(identity.userId, audience, tenantId)
  if (!user) throw unauthenticated('Email atau kata sandi salah.')

  const token = await issueSession({ sub: user.id, aud: audience, tid: tenantId })
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds() * 1000).toISOString()

  const now = new Date()
  if (audience === 'platform') {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lastSeenAt: now } })
  } else {
    await prisma.tenantUser.update({ where: { id: user.id }, data: { lastLoginAt: now, lastSeenAt: now } })
  }

  return { token, expiresAt, user, tenantId, isNew: identity.isNew }
}

/** Menerbitkan sesi untuk pengguna yang identitasnya sudah terbukti (registrasi, terima undangan). */
export async function startSession(userId: string, audience: Audience, tenantId?: string, isNew?: boolean): Promise<SignInResult> {
  const user = await loadAuthUser(userId, audience, tenantId)
  if (!user) throw unauthenticated()
  const token = await issueSession({ sub: userId, aud: audience, tid: tenantId })
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds() * 1000).toISOString()
  return { token, expiresAt, user, tenantId, isNew }
}
