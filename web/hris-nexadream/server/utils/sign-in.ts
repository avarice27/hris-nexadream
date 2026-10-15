import type { H3Event } from 'h3'
import { z } from 'zod'
import { normalizeIndonesianPhone } from '#shared/utils/phone'
import { revokeSession, bearerToken, signIn, type Audience, type SignInResult } from '../services/auth'

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Masukkan email atau nomor HP.'),
  password: z.string().min(1, 'Masukkan kata sandi.')
})

function normalizeIdentifier(audience: Audience, identifier: string): string {
  const trimmed = identifier.trim()
  if (audience === 'platform' || trimmed.includes('@')) return trimmed.toLowerCase()
  return normalizeIndonesianPhone(trimmed)
}

async function tenantIdForIdentifier(identifier: string): Promise<string | null> {
  const user = identifier.includes('@')
    ? await prisma.tenantUser.findUnique({ where: { email: identifier }, select: { id: true } })
    : await prisma.tenantUser.findUnique({ where: { phone: identifier }, select: { id: true } })
  if (!user) return null
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantUserId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { tenantId: true }
  })
  return membership?.tenantId ?? null
}

/** Login dengan rate limit per identifier + per IP, dan audit berhasil/gagal. */
export async function loginWithPassword(event: H3Event, audience: Audience, input: z.infer<typeof loginSchema>): Promise<SignInResult> {
  const identifier = normalizeIdentifier(audience, input.identifier)
  const scope = `login:${audience}`
  await assertSharedRateLimit(scope, identifier, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowMs)
  await assertSharedRateLimit(`${scope}:ip`, clientIp(event), LOGIN_IP_RATE_LIMIT.limit, LOGIN_IP_RATE_LIMIT.windowMs)

  try {
    const result = await signIn({ identifier, password: input.password }, audience)
    await resetSharedRateLimit(scope, identifier)
    await recordAudit(event, {
      audience,
      action: 'auth.sign_in',
      actorId: result.user.id,
      actorName: result.user.name,
      tenantId: result.tenantId ?? null
    })
    return result
  } catch (error) {
    // Pemilik melihat percobaan login ke akun perusahaannya di log aktivitas.
    const tenantId = audience === 'tenant' ? await tenantIdForIdentifier(identifier).catch(() => null) : null
    await recordAudit(event, {
      audience,
      action: 'auth.sign_in_failed',
      tenantId,
      metadata: { identifier: audience === 'platform' ? identifier : undefined }
    })
    throw error
  }
}

export async function logout(event: H3Event, audience: Audience): Promise<{ success: true }> {
  const token = bearerToken(event)
  const claims = await tryGetSession(event)
  if (token && claims?.aud === audience) {
    await revokeSession(token)
    await recordAudit(event, {
      audience,
      action: 'auth.sign_out',
      actorId: claims.sub,
      tenantId: claims.tid ?? null,
      impersonatorId: claims.imp ?? null
    })
  }
  return { success: true }
}
