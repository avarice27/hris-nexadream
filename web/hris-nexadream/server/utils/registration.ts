import type { H3Event } from 'h3'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-rules'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { TIMEZONES } from '#shared/utils/settings'
import { formatDateId } from '#shared/utils/format'
import type { Prisma } from '~~/generated/prisma/client'
import { hashPassword, startSession, type SignInResult } from '../services/auth'

// Pendaftaran pemilik perusahaan — dipakai /api/app/auth/register (dan nanti /api/v1 + OAuth).
// Signup hanya menanyakan orangnya; detail perusahaan diisi di onboarding (fase 5).

export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.'),
  email: z.email('Masukkan alamat email yang valid.'),
  phone: z.string().trim().refine(isValidIndonesianPhone, 'Masukkan nomor HP Indonesia yang valid.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`),
  companyName: z.string().trim().max(120, 'Nama perusahaan terlalu panjang.').optional(),
  timezone: z.enum(TIMEZONES).default('Asia/Jakarta'),
  acceptTerms: z.literal(true, 'Anda perlu menyetujui syarat & ketentuan serta kebijakan privasi.')
})

export type RegistrationInput = z.infer<typeof registrationSchema>

/** Pendaftaran lewat penyedia eksternal (Google): tanpa kata sandi & HP — HP diisi di onboarding. */
export interface ExternalRegistrationInput {
  name: string
  email: string
  emailVerified: true
  avatarUrl?: string | null
  timezone?: RegistrationInput['timezone']
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export async function uniqueTenantSlug(name: string, excludeTenantId?: string, db: Prisma.TransactionClient = prisma): Promise<string> {
  const base = slugify(name) || 'perusahaan'
  let candidate = base
  for (let suffix = 2; suffix < 1000; suffix++) {
    const existing = await db.tenant.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!existing || existing.id === excludeTenantId) return candidate
    candidate = `${base}-${suffix}`
  }
  return `${base}-${randomToken(3)}`
}

/** Kode kantor pendek, unik di seluruh platform (mis. "K7Q2XD"). */
export async function allocateBranchCode(db: Prisma.TransactionClient = prisma): Promise<string> {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = Buffer.from(randomToken(6), 'hex')
    const code = Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
    const taken = await db.branch.findUnique({ where: { code }, select: { id: true } })
    if (!taken) return code
  }
  throw new Error('Could not allocate a unique branch code.')
}

export async function registerOwner(event: H3Event, input: RegistrationInput | ExternalRegistrationInput): Promise<SignInResult> {
  if (!(await getBooleanSetting('app.registrationOpen'))) {
    throw httpError(503, 'REGISTRATION_CLOSED', 'Pendaftaran sedang ditutup. Silakan coba lagi nanti.')
  }
  await assertSharedRateLimit('register:ip', clientIp(event), 10, 60 * 60 * 1000)

  const email = input.email.trim().toLowerCase()
  const phone = 'phone' in input ? normalizeIndonesianPhone(input.phone) : null
  const timezone = input.timezone ?? 'Asia/Jakarta'

  if (await prisma.tenantUser.findUnique({ where: { email }, select: { id: true } })) {
    throw conflict('Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.', { field: 'email' })
  }
  if (phone && await prisma.tenantUser.findUnique({ where: { phone }, select: { id: true } })) {
    throw conflict('Nomor HP ini sudah terdaftar.', { field: 'phone' })
  }

  // Satu uji coba per email (TrialClaim).
  const oneTrialPerEmail = await getBooleanSetting('billing.oneTrialPerEmail')
  const priorClaim = oneTrialPerEmail
    ? await prisma.trialClaim.findUnique({ where: { emailNormalized: email }, select: { id: true } })
    : null

  const trialPlan = await prisma.plan.findUnique({ where: { slug: await getSetting('billing.trialPlanSlug') } })
  const freePlan = await prisma.plan.findUnique({ where: { slug: await getSetting('billing.defaultPlanSlug') } })
  if (!freePlan) throw httpError(500, 'INTERNAL', 'Paket bawaan belum dikonfigurasi. Hubungi tim dukungan.')

  const grantTrial = !!trialPlan && trialPlan.isActive && trialPlan.trialDays > 0 && !priorClaim
  const plan = grantTrial ? trialPlan! : freePlan
  const now = new Date()
  const trialEndsAt = grantTrial ? new Date(now.getTime() + plan.trialDays * 86400_000) : null
  const passwordHash = 'password' in input ? await hashPassword(input.password) : null
  const tenantName = ('companyName' in input && input.companyName?.trim()) || input.name.trim()
  const emailVerifiedAt = 'emailVerified' in input ? now : null
  const avatarUrl = 'avatarUrl' in input ? input.avatarUrl ?? null : null

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const user = await tx.tenantUser.create({
      data: { name: input.name.trim(), email, phone, passwordHash, emailVerifiedAt, avatarUrl }
    })
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: await uniqueTenantSlug(tenantName, undefined, tx),
        email,
        phone,
        timezone,
        dataConsentAcceptedAt: now
      }
    })
    await tx.tenantMembership.create({ data: { tenantId: tenant.id, tenantUserId: user.id, role: 'owner' } })
    const status = grantTrial ? 'trialing' : 'downgraded'
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status,
        period: 'monthly',
        trialEndsAt,
        downgradedAt: grantTrial ? null : now
      }
    })
    await tx.subscriptionEvent.create({
      data: { tenantId: tenant.id, transition: 'signup', toStatus: status, toPlanSlug: plan.slug, period: 'monthly' }
    })
    if (grantTrial && oneTrialPerEmail) {
      await tx.trialClaim.create({ data: { emailNormalized: email, tenantId: tenant.id } })
    }
    await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Kantor Pusat',
        code: await allocateBranchCode(tx),
        timezone,
        isPrimary: true
      }
    })
    return { tenant, user }
  })

  // Setelah commit: perusahaan SUDAH ada. Efek samping (bel, email, bel staf) tidak boleh
  // menggagalkan pendaftaran — kegagalan apa pun dicatat dan ditelan.
  try {
    // Bel welcome/trial_started tanpa email; email sambutan dikirim terpisah dengan variabel lebih kaya.
    const recipient = { audience: 'tenant' as const, tenantUserId: user.id, tenantId: tenant.id, channels: { email: false } }
    await safeCreateNotification({ ...recipient, templateKey: 'welcome' })
    if (grantTrial && trialEndsAt) {
      await safeCreateNotification({
        ...recipient,
        templateKey: 'trial_started',
        variables: { planName: plan.name, trialEndsAt: formatDateId(trialEndsAt, tenant.timezone) }
      })
    }
    await sendTemplatedEmail({
      to: email,
      templateKey: 'welcome',
      params: { name: user.name, tenantName: tenant.name, loginUrl: '/app/auth/login' }
    })
    await notifyPlatform('tenants.read', {
      templateKey: 'admin_new_tenant',
      tenantId: tenant.id,
      variables: { tenantName: tenant.name, planName: plan.name, tenantId: tenant.id },
      channels: { email: false }
    })
  } catch (error) {
    console.error('[registration] post-commit side effects failed', tenant.id, error)
  }
  await recordAudit(event, {
    audience: 'tenant',
    action: 'tenant.register',
    actorId: user.id,
    actorName: user.name,
    tenantId: tenant.id,
    targetType: 'tenant',
    targetId: tenant.id,
    metadata: { planSlug: plan.slug, trial: grantTrial, method: passwordHash ? 'password' : 'external' }
  })

  return startSession(user.id, 'tenant', tenant.id, true)
}
