import type { H3Event } from 'h3'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { hashPassword, verifyPassword } from '../services/auth'

const RESET_TTL_MS = 2 * 60 * 60 * 1000

export const forgotPasswordSchema = z.object({
  email: z.email('Masukkan alamat email yang valid.')
})

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Tautan tidak valid.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
})

type Audience = 'tenant' | 'platform'

/** SELALU berhasil (tanpa enumerasi akun). Mengirim email hanya bila akun aktif ada. */
export async function requestPasswordReset(event: H3Event, audience: Audience, email: string): Promise<{ success: true }> {
  const normalized = email.trim().toLowerCase()
  await assertSharedRateLimit(`password-reset:${audience}`, normalized, 5, 60 * 60 * 1000)
  await assertSharedRateLimit(`password-reset:${audience}:ip`, clientIp(event), 20, 60 * 60 * 1000)

  const account = audience === 'platform'
    ? await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, name: true, isActive: true } })
    : await prisma.tenantUser.findUnique({ where: { email: normalized }, select: { id: true, name: true, isActive: true } })
  if (!account || !account.isActive) return { success: true }

  const token = randomToken(32)
  await prisma.passwordReset.create({
    data: {
      audience,
      userId: audience === 'platform' ? account.id : null,
      tenantUserId: audience === 'tenant' ? account.id : null,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS)
    }
  })

  const base = `${await siteUrl()}${audience === 'platform' ? '/admin' : '/app'}/auth/reset-password`
  await sendTemplatedEmail({
    to: normalized,
    templateKey: 'password_reset',
    params: { name: account.name, resetUrl: `${base}?token=${token}`, expiresInHours: 2 }
  })
  return { success: true }
}

export async function applyPasswordReset(event: H3Event, audience: Audience, token: string, password: string): Promise<{ success: true }> {
  await assertSharedRateLimit(`password-reset-apply:${audience}:ip`, clientIp(event), 20, 15 * 60 * 1000)
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.audience !== audience || row.usedAt || row.expiresAt < new Date()) {
    throw httpError(400, 'VALIDATION_FAILED', 'Tautan sudah tidak berlaku. Silakan minta tautan baru.')
  }
  const passwordHash = await hashPassword(password)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // Klaim atomik: hanya satu request yang bisa memakai token ini.
    const claimed = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } })
    if (claimed.count !== 1) {
      throw httpError(400, 'VALIDATION_FAILED', 'Tautan sudah tidak berlaku. Silakan minta tautan baru.')
    }
    if (audience === 'platform' && row.userId) {
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } })
      await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } })
    } else if (audience === 'tenant' && row.tenantUserId) {
      await tx.tenantUser.update({ where: { id: row.tenantUserId }, data: { passwordHash } })
      await tx.passwordReset.updateMany({ where: { tenantUserId: row.tenantUserId, usedAt: null }, data: { usedAt: now } })
    }
  })

  // Tandai dengan perusahaan agar muncul di log aktivitas pemilik.
  const membership = row.tenantUserId
    ? await prisma.tenantMembership.findFirst({ where: { tenantUserId: row.tenantUserId }, orderBy: { createdAt: 'asc' }, select: { tenantId: true } })
    : null
  await recordAudit(event, {
    audience,
    action: 'auth.password_reset',
    actorId: row.userId ?? row.tenantUserId,
    tenantId: membership?.tenantId ?? null,
    targetType: audience === 'platform' ? 'user' : 'tenant_user',
    targetId: row.userId ?? row.tenantUserId
  })
  return { success: true }
}

/** Ubah kata sandi saat sudah masuk. Akun OAuth-saja boleh MEMBUAT kata sandi tanpa sandi lama. */
export async function changePassword(
  event: H3Event,
  audience: Audience,
  input: z.infer<typeof changePasswordSchema>
): Promise<{ success: true }> {
  const tenantContext = audience === 'tenant' ? await requireTenantContext(event) : null
  const userId = tenantContext ? tenantContext.user.id : (await requirePlatformContext(event)).user.id

  const current = audience === 'platform'
    ? await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    : await prisma.tenantUser.findUnique({ where: { id: userId }, select: { passwordHash: true } })

  if (current?.passwordHash) {
    const ok = input.currentPassword ? await verifyPassword(input.currentPassword, current.passwordHash) : false
    if (!ok) throw httpError(400, 'VALIDATION_FAILED', 'Kata sandi saat ini salah.', { field: 'currentPassword' })
  }

  const passwordHash = await hashPassword(input.newPassword)
  if (audience === 'platform') {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  } else {
    await prisma.tenantUser.update({ where: { id: userId }, data: { passwordHash } })
  }
  await recordAudit(event, {
    audience,
    action: 'auth.password_change',
    actorId: userId,
    tenantId: tenantContext?.tenantId ?? null,
    impersonatorId: tenantContext?.impersonatorId ?? null,
    targetId: userId
  })
  return { success: true }
}
