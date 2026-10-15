import type { H3Event } from 'h3'
import { z } from 'zod'
import { FEATURE_KEYS, LIMIT_KEYS, UNLIMITED, normalizeFeatures, normalizeLimits } from '#shared/utils/plans'
import type { Plan, Prisma } from '~~/generated/prisma/client'

// Paket = konfigurasi, bukan kode. Superadmin mengubah batas/fitur tanpa deploy.

const limitsSchema = z.object(Object.fromEntries(
  LIMIT_KEYS.map(key => [key, z.number().int('Batas harus bilangan bulat.').min(UNLIMITED, 'Batas minimal -1 (tanpa batas).')])
) as Record<(typeof LIMIT_KEYS)[number], z.ZodNumber>)

const featuresSchema = z.object(Object.fromEntries(
  FEATURE_KEYS.map(key => [key, z.boolean()])
) as Record<(typeof FEATURE_KEYS)[number], z.ZodBoolean>)

// Bentuk dasar TANPA nilai default: .partial() pada skema ber-default tetap mengisi default,
// sehingga PATCH sebagian diam-diam mereset urutan, mengaktifkan paket nonaktif, dan
// memublikasikan paket tersembunyi (bug yang tertangkap saat uji fase 7).
const planFields = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Slug hanya huruf kecil, angka, dan tanda hubung (2–40 karakter).'),
  name: z.string().trim().min(1, 'Nama paket wajib diisi.').max(60),
  description: z.string().trim().max(300).nullable().optional(),
  priceMonthly: z.number().min(0, 'Harga tidak boleh negatif.').max(1_000_000_000),
  priceYearly: z.number().min(0, 'Harga tidak boleh negatif.').max(10_000_000_000),
  currency: z.literal('IDR'),
  trialDays: z.number().int().min(0).max(90, 'Uji coba maksimal 90 hari.'),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  order: z.number().int().min(0).max(100),
  limits: limitsSchema,
  features: featuresSchema
})

/** Membuat paket: field opsional diisi default. */
export const planSchema = planFields.extend({
  currency: planFields.shape.currency.default('IDR'),
  isActive: planFields.shape.isActive.default(true),
  isPublic: planFields.shape.isPublic.default(true),
  order: planFields.shape.order.default(0)
})

/** Mengubah paket: hanya field yang dikirim yang berubah. */
export const planUpdateSchema = planFields.partial()

/** Bentuk publik/aman sebuah paket (harga sebagai number). */
export function toPlanView(plan: Plan) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthly: toAmount(plan.priceMonthly),
    priceYearly: toAmount(plan.priceYearly),
    currency: plan.currency,
    trialDays: plan.trialDays,
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    order: plan.order,
    limits: normalizeLimits(plan.limits),
    features: normalizeFeatures(plan.features)
  }
}

export function toAmount(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = Number(value.toString())
  return Number.isFinite(n) ? n : 0
}

/** Paket aktif & publik untuk dialog upgrade / halaman langganan. */
export async function listPurchasablePlans(event: H3Event) {
  const ctx = await requireTenantContext(event)
  const [plans, entitlements] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ order: 'asc' }, { priceMonthly: 'asc' }] }),
    getEntitlements(ctx.tenantId)
  ])
  return { items: plans.map(toPlanView), currentPlanSlug: entitlements.effectivePlanSlug }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminListPlans(event: H3Event) {
  await requirePermission(event, 'plans.read')
  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.subscription.groupBy({ by: ['planId'], _count: { _all: true } })
  ])
  const byPlan = new Map(counts.map(c => [c.planId, c._count._all]))
  return {
    items: plans.map(plan => ({ ...toPlanView(plan), subscriptionCount: byPlan.get(plan.id) ?? 0, updatedAt: plan.updatedAt.toISOString() })),
    defaultPlanSlug: await getSetting('billing.defaultPlanSlug'),
    trialPlanSlug: await getSetting('billing.trialPlanSlug')
  }
}

function auditBase(ctx: Awaited<ReturnType<typeof requirePermission>>) {
  return { audience: 'platform' as const, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, targetType: 'plan' }
}

export async function adminCreatePlan(event: H3Event, input: z.infer<typeof planSchema>) {
  const ctx = await requirePermission(event, 'plans.write')
  if (await prisma.plan.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
    throw conflict('Slug paket sudah dipakai.', { field: 'slug' })
  }
  const plan = await prisma.plan.create({
    data: {
      ...input,
      description: input.description || null,
      limits: input.limits as Prisma.InputJsonValue,
      features: input.features as Prisma.InputJsonValue
    }
  })
  await recordAudit(event, { ...auditBase(ctx), action: 'plan.create', targetId: plan.id, metadata: { slug: plan.slug } })
  return toPlanView(plan)
}

export async function adminUpdatePlan(event: H3Event, id: string, input: z.infer<typeof planUpdateSchema>) {
  const ctx = await requirePermission(event, 'plans.write')
  const existing = await prisma.plan.findUnique({ where: { id } })
  if (!existing) throw notFound('Paket tidak ditemukan.')

  if (input.slug && input.slug !== existing.slug) {
    if (await prisma.plan.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
      throw conflict('Slug paket sudah dipakai.', { field: 'slug' })
    }
    // Slug dirujuk pengaturan (paket bawaan & uji coba) dan riwayat langganan.
    const pinned = [await getSetting('billing.defaultPlanSlug'), await getSetting('billing.trialPlanSlug')]
    if (pinned.includes(existing.slug)) {
      throw conflict('Slug paket ini dipakai pengaturan penagihan (paket bawaan/uji coba). Ubah pengaturannya terlebih dahulu.', { field: 'slug' })
    }
  }
  if (input.isActive === false && existing.slug === await getSetting('billing.defaultPlanSlug')) {
    throw conflict('Paket bawaan (tujuan turun paket) tidak bisa dinonaktifkan.')
  }

  const { limits, features, description, ...rest } = input
  const plan = await prisma.plan.update({
    where: { id },
    data: {
      ...rest,
      ...(description !== undefined ? { description: description || null } : {}),
      ...(limits ? { limits: limits as Prisma.InputJsonValue } : {}),
      ...(features ? { features: features as Prisma.InputJsonValue } : {})
    }
  })
  // Semua tenant di paket ini kini basi.
  invalidateEntitlements()

  // Catat perubahan batas/fitur (nama kunci + nilai lama/baru — bukan data pribadi).
  const changes: Record<string, unknown> = {}
  if (limits) {
    const before = normalizeLimits(existing.limits)
    for (const key of LIMIT_KEYS) if (before[key] !== limits[key]) changes[`limits.${key}`] = [before[key], limits[key]]
  }
  if (features) {
    const before = normalizeFeatures(existing.features)
    for (const key of FEATURE_KEYS) if (before[key] !== features[key]) changes[`features.${key}`] = [before[key], features[key]]
  }
  for (const key of ['priceMonthly', 'priceYearly', 'trialDays', 'isActive', 'isPublic', 'slug', 'name'] as const) {
    if (rest[key] !== undefined) {
      const before = key.startsWith('price') ? toAmount(existing[key] as Prisma.Decimal) : existing[key]
      if (before !== rest[key]) changes[key] = [before, rest[key]]
    }
  }
  await recordAudit(event, { ...auditBase(ctx), action: 'plan.update', targetId: id, metadata: { slug: plan.slug, changes } })
  return toPlanView(plan)
}

export async function adminDeletePlan(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'plans.write')
  const plan = await prisma.plan.findUnique({ where: { id } })
  if (!plan) throw notFound('Paket tidak ditemukan.')
  if ([await getSetting('billing.defaultPlanSlug'), await getSetting('billing.trialPlanSlug')].includes(plan.slug)) {
    throw conflict('Paket bawaan atau paket uji coba tidak bisa dihapus.')
  }
  if (await prisma.subscription.count({ where: { planId: id } })) {
    throw conflict('Paket ini masih dipakai langganan. Nonaktifkan saja agar tidak bisa dibeli lagi.')
  }
  await prisma.plan.delete({ where: { id } })
  await recordAudit(event, { ...auditBase(ctx), action: 'plan.delete', targetId: id, metadata: { slug: plan.slug } })
  return { success: true }
}
