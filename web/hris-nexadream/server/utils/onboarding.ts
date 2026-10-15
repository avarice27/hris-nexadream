import type { H3Event } from 'h3'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { TIMEZONES } from '#shared/utils/settings'
import { TIME_PATTERN, digitsOnly, isValidNpwp, type LeavePolicyItem, type WorkCalendar } from '#shared/utils/identifiers'
import type { Prisma } from '~~/generated/prisma/client'
import { allocateBranchCode, uniqueTenantSlug } from './registration'

// Onboarding perusahaan — wizard satu kali yang memblokir konsol sampai selesai. Idempoten:
// pemanggilan kedua memperbarui, tidak menggandakan. Dipakai /api/app/onboarding (dan nanti /api/v1).

export const onboardingSchema = z.object({
  companyName: z.string().trim().min(2, 'Nama perusahaan minimal 2 karakter.').max(120, 'Nama perusahaan terlalu panjang.'),
  legalName: z.string().trim().max(160, 'Nama badan hukum terlalu panjang.').optional(),
  industry: z.string().trim().max(80).optional(),
  phone: z.string().trim().refine(isValidIndonesianPhone, 'Masukkan nomor HP Indonesia yang valid.').optional(),
  npwp: z.string().trim().refine(v => v === '' || isValidNpwp(v), 'NPWP harus 15 atau 16 digit.').optional(),
  branchName: z.string().trim().min(2, 'Nama kantor minimal 2 karakter.').max(80),
  branchAddress: z.string().trim().max(300).optional(),
  timezone: z.enum(TIMEZONES).default('Asia/Jakarta'),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1, 'Pilih minimal satu hari kerja.').default([1, 2, 3, 4, 5]),
  workStartTime: z.string().regex(TIME_PATTERN, 'Format jam HH:MM.').default('08:00'),
  workEndTime: z.string().regex(TIME_PATTERN, 'Format jam HH:MM.').default('17:00'),
  breakMinutes: z.number().int().min(0).max(240).default(60),
  annualLeaveDays: z.number().int().min(0, 'Jatah cuti tidak boleh negatif.').max(60, 'Jatah cuti maksimal 60 hari.').default(12),
  acceptDataConsent: z.literal(true, 'Anda perlu menyetujui pemrosesan data pribadi karyawan.')
}).refine(v => v.workStartTime < v.workEndTime, { message: 'Jam selesai harus setelah jam mulai.', path: ['workEndTime'] })

export type OnboardingInput = z.infer<typeof onboardingSchema>

/** Templat kebijakan cuti bawaan platform (setting hr.defaultLeavePolicyTemplate). */
export async function defaultLeavePolicy(): Promise<LeavePolicyItem[]> {
  try {
    const parsed = JSON.parse(await getSetting('hr.defaultLeavePolicyTemplate'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Data awal untuk wizard: nilai yang tersimpan, kalau belum ada nilai bawaan platform. */
export async function onboardingState(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  const branch = await prisma.branch.findFirst({ where: { tenantId: ctx.tenantId, isPrimary: true } })
  const calendar = ctx.tenant.workCalendar as WorkCalendar | null
  const policy = (ctx.tenant.leavePolicy as LeavePolicyItem[] | null) ?? await defaultLeavePolicy()
  const workdays = Number(await getSetting('hr.defaultWorkdaysPerWeek')) === 6 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  return {
    companyName: ctx.tenant.name,
    legalName: ctx.tenant.legalName ?? '',
    industry: ctx.tenant.industry ?? '',
    needsPhone: !ctx.user.phone,
    hasNpwp: !!ctx.tenant.npwp,
    branchName: branch?.name ?? 'Kantor Pusat',
    branchAddress: branch?.address ?? '',
    timezone: branch?.timezone ?? ctx.tenant.timezone,
    workingDays: calendar?.workingDays ?? workdays,
    workStartTime: calendar?.startTime ?? await getSetting('hr.defaultWorkStart'),
    workEndTime: calendar?.endTime ?? await getSetting('hr.defaultWorkEnd'),
    breakMinutes: calendar?.breakMinutes ?? 60,
    annualLeaveDays: policy.find(p => p.code === 'annual')?.days ?? 12,
    completed: !!ctx.tenant.onboardingCompletedAt
  }
}

export async function completeOnboarding(event: H3Event, input: OnboardingInput) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  const { tenant, user } = ctx

  // 1. Nomor HP pemilik: pertahankan yang ada; jika belum ada (OAuth), wajib & unik.
  let newPhone: string | null = null
  if (!user.phone) {
    if (!input.phone) throw httpError(400, 'VALIDATION_FAILED', 'Nomor HP wajib diisi.', { field: 'phone' })
    newPhone = normalizeIndonesianPhone(input.phone)
    const taken = await prisma.tenantUser.findFirst({ where: { phone: newPhone, NOT: { id: user.id } }, select: { id: true } })
    if (taken) throw conflict('Nomor HP ini sudah dipakai akun lain.', { field: 'phone' })
  }

  const policy = (await defaultLeavePolicy()).map(item => item.code === 'annual' ? { ...item, days: input.annualLeaveDays } : item)
  const calendar: WorkCalendar = {
    workingDays: [...new Set(input.workingDays)].sort(),
    startTime: input.workStartTime,
    endTime: input.workEndTime,
    breakMinutes: input.breakMinutes
  }
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    if (newPhone) await tx.tenantUser.update({ where: { id: user.id }, data: { phone: newPhone } })

    const data: Prisma.TenantUpdateInput = {
      name: input.companyName,
      legalName: input.legalName || null,
      industry: input.industry || null,
      timezone: input.timezone,
      workCalendar: calendar as unknown as Prisma.InputJsonValue,
      // Kebijakan cuti hanya diisi sekali; setelah itu milik pengaturan perusahaan / modul cuti.
      leavePolicy: (tenant.leavePolicy ?? policy) as unknown as Prisma.InputJsonValue,
      dataConsentAcceptedAt: tenant.dataConsentAcceptedAt ?? now,
      onboardingCompletedAt: tenant.onboardingCompletedAt ?? now
    }
    if (input.companyName !== tenant.name) data.slug = await uniqueTenantSlug(input.companyName, tenant.id, tx)
    if (!tenant.phone) data.phone = newPhone ?? user.phone
    if (input.npwp) data.npwp = encrypt(digitsOnly(input.npwp), 'hr')
    await tx.tenant.update({ where: { id: tenant.id }, data })

    const primary = await tx.branch.findFirst({ where: { tenantId: tenant.id, isPrimary: true } })
    if (primary) {
      await tx.branch.update({
        where: { id: primary.id },
        data: { name: input.branchName, address: input.branchAddress || null, timezone: input.timezone, isActive: true }
      })
    } else {
      await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: input.branchName,
          address: input.branchAddress || null,
          timezone: input.timezone,
          isPrimary: true,
          code: await allocateBranchCode(tx)
        }
      })
    }
  })

  invalidateEntitlements(tenant.id)
  await recordAudit(event, {
    audience: 'tenant', action: 'tenant.onboarding_complete', actorId: user.id, actorName: user.name,
    tenantId: tenant.id, impersonatorId: ctx.impersonatorId, targetType: 'tenant', targetId: tenant.id
  })
  return { success: true }
}
