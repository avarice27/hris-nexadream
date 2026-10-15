import type { H3Event } from 'h3'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { TIMEZONES } from '#shared/utils/settings'
import { TIME_PATTERN, digitsOnly, isValidNpwp, type LeavePolicyItem, type WorkCalendar } from '#shared/utils/identifiers'
import type { Prisma } from '~~/generated/prisma/client'
import { uniqueTenantSlug } from './registration'

// Pengaturan perusahaan (pemilik / Admin HR). Fitur berbayar hanya diminta saat opsi berbayar
// DIPILIH — pemilik yang turun paket tetap harus bisa mengganti nama perusahaannya.

const leavePolicyItem = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,30}$/, 'Kode cuti hanya huruf kecil, angka, dan garis bawah.'),
  name: z.string().trim().min(2, 'Nama jenis cuti minimal 2 karakter.').max(60),
  days: z.number().int().min(0).max(365).nullable(),
  eligibleAfterMonths: z.number().int().min(0).max(120)
})

export const tenantSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Nama perusahaan minimal 2 karakter.').max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP Indonesia yang valid.').nullable().optional(),
  email: z.union([z.literal(''), z.email('Masukkan alamat email yang valid.')]).nullable().optional(),
  timezone: z.enum(TIMEZONES).optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  /** '' = hapus NPWP; tidak dikirim = tidak berubah. */
  npwp: z.string().trim().refine(v => v === '' || isValidNpwp(v), 'NPWP harus 15 atau 16 digit.').optional(),
  workCalendar: z.object({
    workingDays: z.array(z.number().int().min(0).max(6)).min(1, 'Pilih minimal satu hari kerja.'),
    startTime: z.string().regex(TIME_PATTERN, 'Format jam HH:MM.'),
    endTime: z.string().regex(TIME_PATTERN, 'Format jam HH:MM.'),
    breakMinutes: z.number().int().min(0).max(240)
  }).refine(v => v.startTime < v.endTime, { message: 'Jam selesai harus setelah jam mulai.', path: ['endTime'] }).optional(),
  leavePolicy: z.array(leavePolicyItem).max(30).refine(
    items => new Set(items.map(i => i.code)).size === items.length,
    'Kode jenis cuti tidak boleh sama.'
  ).optional()
})

function toView(tenant: { id: string, name: string, slug: string, legalName: string | null, industry: string | null, phone: string | null, email: string | null, timezone: string, logoUrl: string | null, npwp: string | null, workCalendar: unknown, leavePolicy: unknown }) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    legalName: tenant.legalName,
    industry: tenant.industry,
    phone: tenant.phone,
    email: tenant.email,
    timezone: tenant.timezone,
    logoUrl: tenant.logoUrl,
    // NPWP tidak pernah dikirim mentah (D7): hanya versi bertopeng.
    npwpMasked: tenant.npwp ? maskIdentifier(decrypt(tenant.npwp, 'hr')) : null,
    workCalendar: tenant.workCalendar as WorkCalendar | null,
    leavePolicy: tenant.leavePolicy as LeavePolicyItem[] | null
  }
}

export async function getTenantSettings(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  return toView(ctx.tenant)
}

export async function updateTenantSettings(event: H3Event, input: z.infer<typeof tenantSettingsSchema>) {
  const ctx = await requireTenantAbility(event, 'settings.manage')
  const data: Prisma.TenantUpdateInput = {}
  if (input.name !== undefined && input.name !== ctx.tenant.name) {
    data.name = input.name
    data.slug = await uniqueTenantSlug(input.name, ctx.tenantId)
  }
  if (input.legalName !== undefined) data.legalName = input.legalName || null
  if (input.industry !== undefined) data.industry = input.industry || null
  if (input.phone !== undefined) data.phone = input.phone ? normalizeIndonesianPhone(input.phone) : null
  if (input.email !== undefined) data.email = input.email ? input.email.toLowerCase() : null
  if (input.timezone !== undefined) data.timezone = input.timezone
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl || null
  if (input.npwp !== undefined) data.npwp = input.npwp ? encrypt(digitsOnly(input.npwp), 'hr') : null
  if (input.workCalendar !== undefined) {
    data.workCalendar = { ...input.workCalendar, workingDays: [...new Set(input.workCalendar.workingDays)].sort() } as unknown as Prisma.InputJsonValue
  }
  if (input.leavePolicy !== undefined) data.leavePolicy = input.leavePolicy as unknown as Prisma.InputJsonValue

  const updated = await prisma.tenant.update({ where: { id: ctx.tenantId }, data })
  await recordAudit(event, {
    audience: 'tenant', action: 'tenant.settings_update', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant', targetId: ctx.tenantId,
    // Nama field saja — tidak pernah nilai (NPWP sensitif).
    metadata: { fields: Object.keys(input) }
  })
  return toView(updated)
}
