import type { H3Event } from 'h3'
import { createAuthHandoff, getRedirectProvider, signIn, type ExternalProfile, type SignInResult } from '../services/auth'

// Login Google/SSO dengan kode handoff (blueprint 03 §5). Token sesi tidak pernah lewat URL:
// callback hanya menerbitkan kode sekali pakai yang ditukar halaman /app/auth/callback.

const STATE_COOKIE = 'hn_oauth_state'
const REDIRECT_COOKIE = 'hn_oauth_redirect'
const COOKIE_PATH = '/api/app/auth/oauth'
const LOGIN_PATH = '/app/auth/login'

/** Kode galat pendek di URL; halaman login menerjemahkannya ke kalimat Bahasa Indonesia. */
export type OAuthErrorCode = 'unavailable' | 'cancelled' | 'state' | 'no_email' | 'unverified' | 'inactive' | 'registration_closed' | 'failed'

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
  maxAge: 600
})

/** Hanya path di dalam konsol (/app/...) yang boleh menjadi tujuan setelah login. */
export function safeOAuthRedirect(value: unknown): string {
  const path = typeof value === 'string' ? value : ''
  return /^\/app(?:\/[\w\-./?=&%]*)?$/.test(path) && !path.includes('//') ? path : ''
}

async function redirectUri(provider: string) {
  return `${await siteUrl()}${COOKIE_PATH}/${provider}/callback`
}

function failTo(event: H3Event, code: OAuthErrorCode) {
  return sendRedirect(event, `${LOGIN_PATH}?error=${code}`, 302)
}

export async function startOAuth(event: H3Event, providerName: string) {
  await assertSharedRateLimit('oauth:start:ip', clientIp(event), 20, 15 * 60_000)
  const provider = getRedirectProvider(providerName, 'tenant')
  if (!provider?.isConfigured()) return failTo(event, 'unavailable')
  const state = randomToken(24)
  setCookie(event, STATE_COOKIE, state, cookieOptions())
  const target = safeOAuthRedirect(getQuery(event).redirect)
  if (target) setCookie(event, REDIRECT_COOKIE, target, cookieOptions())
  else deleteCookie(event, REDIRECT_COOKIE, { path: COOKIE_PATH })
  return sendRedirect(event, provider.authorizationUrl({ redirectUri: await redirectUri(provider.name), state }), 302)
}

/**
 * Akun untuk profil eksternal:
 * 1. identitas (provider, subject) dikenal → pengguna itu;
 * 2. email terverifikasi cocok dengan akun → tautkan identitas baru;
 * 3. tidak ada → daftar sebagai pemilik perusahaan baru (tanpa kata sandi; HP di onboarding).
 * Email yang belum diverifikasi penyedia TIDAK PERNAH ditautkan ke akun yang ada.
 */
async function resolveExternalIdentity(event: H3Event, profile: ExternalProfile): Promise<{ tenantUserId: string, isNew: boolean } | OAuthErrorCode> {
  const known = await prisma.tenantUserIdentity.findUnique({
    where: { provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.subject } },
    include: { tenantUser: { select: { id: true, isActive: true } } }
  })
  if (known) {
    if (!known.tenantUser.isActive) return 'inactive'
    if (profile.email && profile.email !== known.email) {
      await prisma.tenantUserIdentity.update({ where: { id: known.id }, data: { email: profile.email } })
    }
    return { tenantUserId: known.tenantUserId, isNew: false }
  }
  if (!profile.email) return 'no_email'
  if (!profile.emailVerified) return 'unverified'

  const existing = await prisma.tenantUser.findUnique({ where: { email: profile.email }, select: { id: true, isActive: true, emailVerifiedAt: true } })
  if (existing) {
    if (!existing.isActive) return 'inactive'
    await prisma.tenantUserIdentity.create({
      data: { tenantUserId: existing.id, provider: profile.provider, providerAccountId: profile.subject, email: profile.email }
    })
    if (!existing.emailVerifiedAt) await prisma.tenantUser.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } })
    return { tenantUserId: existing.id, isNew: false }
  }

  try {
    const result = await registerOwner(event, {
      name: profile.name || profile.email.split('@')[0] || 'Pemilik',
      email: profile.email,
      emailVerified: true,
      avatarUrl: profile.avatarUrl
    })
    await prisma.tenantUserIdentity.create({
      data: { tenantUserId: result.user.id, provider: profile.provider, providerAccountId: profile.subject, email: profile.email }
    })
    return { tenantUserId: result.user.id, isNew: true }
  } catch (error) {
    if ((error as { data?: { code?: string } }).data?.code === 'REGISTRATION_CLOSED') return 'registration_closed'
    throw error
  }
}

export async function finishOAuth(event: H3Event, providerName: string) {
  const query = getQuery(event)
  const expectedState = getCookie(event, STATE_COOKIE)
  const target = safeOAuthRedirect(getCookie(event, REDIRECT_COOKIE))
  deleteCookie(event, STATE_COOKIE, { path: COOKIE_PATH })
  deleteCookie(event, REDIRECT_COOKIE, { path: COOKIE_PATH })

  const provider = getRedirectProvider(providerName, 'tenant')
  if (!provider?.isConfigured()) return failTo(event, 'unavailable')
  if (query.error) return failTo(event, 'cancelled')
  if (!expectedState || typeof query.state !== 'string' || query.state !== expectedState) return failTo(event, 'state')
  if (typeof query.code !== 'string' || !query.code) return failTo(event, 'failed')

  try {
    const profile = await provider.exchange({ code: query.code, redirectUri: await redirectUri(provider.name) })
    const identity = await resolveExternalIdentity(event, profile)
    if (typeof identity === 'string') return failTo(event, identity)
    const code = await createAuthHandoff(identity)
    const params = new URLSearchParams({ code })
    if (target) params.set('redirect', target)
    return sendRedirect(event, `/app/auth/callback?${params}`, 302)
  } catch (error) {
    console.error('[oauth] callback failed', providerName, error)
    return failTo(event, 'failed')
  }
}

/** Tukar kode handoff menjadi sesi tenant (dipanggil halaman /app/auth/callback). */
export async function exchangeHandoff(event: H3Event, code: string): Promise<SignInResult> {
  await assertSharedRateLimit('oauth:exchange:ip', clientIp(event), 30, 15 * 60_000)
  const result = await signIn({ code }, 'tenant', 'handoff')
  await recordAudit(event, {
    audience: 'tenant',
    action: 'auth.sign_in',
    actorId: result.user.id,
    actorName: result.user.name,
    tenantId: result.tenantId ?? null,
    metadata: { method: 'google' }
  })
  return result
}

/** Cron: buang kode handoff yang kedaluwarsa (berumur 120 detik). */
export async function pruneAuthHandoffs(now = new Date()) {
  const { count } = await prisma.authHandoff.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } } })
  return { deleted: count }
}
