import type { H3Event } from 'h3'
import { FEATURE_META, LIMIT_META, UNLIMITED, normalizeFeatures, normalizeLimits, type FeatureKey, type LimitKey, type PlanFeatures, type PlanLimits } from '#shared/utils/plans'
import { subscriptionGrantsPlan } from '#shared/utils/billing-rules'
import type { Plan } from '~~/generated/prisma/client'

// SATU-SATUNYA tempat Plan.limits / Plan.features dibaca. Jangan pernah bercabang pada slug paket.
// Cache 60 detik per tenant per instance (best-effort, Vercel). Pemeriksaan batas yang harus benar
// (assertWithinLimit) memakai hitungan langsung dari DB yang diberikan pemanggil.

export interface Entitlements {
  tenantId: string
  planSlug: string
  planName: string
  effectivePlanSlug: string
  status: string
  limits: PlanLimits
  features: PlanFeatures
  trialEndsAt: Date | null
  trialDaysRemaining: number | null
  graceEndsAt: Date | null
  currentPeriodEnd: Date | null
  isTrialing: boolean
  isInGrace: boolean
}

const TTL_MS = 60_000
const store = globalThis as unknown as { __entitlements?: Map<string, { value: Entitlements, at: number }> }
const cache = store.__entitlements ??= new Map()

async function fallbackPlan(): Promise<Plan> {
  const slug = await getSetting('billing.defaultPlanSlug')
  const plan = await prisma.plan.findUnique({ where: { slug } })
  if (!plan) throw httpError(500, 'INTERNAL', 'Paket bawaan belum dikonfigurasi. Hubungi tim dukungan.')
  return plan
}

export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
  const now = new Date()
  const grants = subscription ? subscriptionGrantsPlan(subscription, now) : false
  const effective = grants && subscription ? subscription.plan : await fallbackPlan()

  const trialEndsAt = subscription?.trialEndsAt ?? null
  const isTrialing = subscription?.status === 'trialing' && grants
  const value: Entitlements = {
    tenantId,
    planSlug: subscription?.plan.slug ?? effective.slug,
    planName: effective.name,
    effectivePlanSlug: effective.slug,
    status: subscription?.status ?? 'downgraded',
    limits: normalizeLimits(effective.limits),
    features: normalizeFeatures(effective.features),
    trialEndsAt,
    trialDaysRemaining: isTrialing && trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400_000)) : null,
    graceEndsAt: subscription?.graceEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    isTrialing,
    isInGrace: subscription?.status === 'past_due' && grants
  }
  cache.set(tenantId, { value, at: Date.now() })
  return value
}

export function invalidateEntitlements(tenantId?: string) {
  if (tenantId) cache.delete(tenantId)
  else cache.clear()
}

export async function can(tenantId: string, feature: FeatureKey): Promise<boolean> {
  return (await getEntitlements(tenantId)).features[feature]
}

export async function limit(tenantId: string, key: LimitKey): Promise<number> {
  return (await getEntitlements(tenantId)).limits[key]
}

export async function isWithinLimit(tenantId: string, key: LimitKey, currentCount: number): Promise<boolean> {
  const max = await limit(tenantId, key)
  return max === UNLIMITED || currentCount < max
}

/** 402 LIMIT_REACHED bila `currentCount` (hitungan langsung) sudah mencapai batas. */
export async function assertWithinLimit(tenantId: string, key: LimitKey, currentCount: number) {
  const entitlements = await getEntitlements(tenantId)
  const max = entitlements.limits[key]
  if (max === UNLIMITED || currentCount < max) return
  throw httpError(
    402,
    'LIMIT_REACHED',
    `Langganan ${entitlements.planName} hanya mengizinkan ${new Intl.NumberFormat('id-ID').format(max)} ${LIMIT_META[key].sentence}. Upgrade untuk menambah lagi.`,
    { limit: key, max, current: currentCount }
  )
}

/** 402 PLAN_REQUIRED. Panggil SETELAH pemeriksaan peran (403 lebih dulu). */
export async function requireEntitlement(event: H3Event, feature: FeatureKey) {
  const ctx = await requireTenantContext(event)
  if (!(await can(ctx.tenantId, feature))) {
    throw httpError(402, 'PLAN_REQUIRED', `Fitur ${FEATURE_META[feature].label} belum tersedia di langganan Anda. Upgrade untuk membukanya.`, { feature })
  }
  return ctx
}

export async function gracePeriodDays(): Promise<number> {
  return getNumberSetting('billing.gracePeriodDays')
}

// ---------------------------------------------------------------------------
// Hitungan pemakaian (dipakai pemeriksaan batas dan UI)
// ---------------------------------------------------------------------------

/** Seat tim = login owner/hr_admin/manager aktif + undangan tim yang masih berlaku. Login karyawan tidak dihitung. */
export async function teamSeatUsage(tenantId: string) {
  const now = new Date()
  const [active, pending] = await Promise.all([
    prisma.tenantMembership.count({ where: { tenantId, isActive: true, role: { in: ['owner', 'hr_admin', 'manager'] } } }),
    prisma.tenantInvitation.count({
      where: { tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now }, role: { in: ['hr_admin', 'manager'] } }
    })
  ])
  return { active, pending, used: active + pending }
}

export async function storageUsageBytes(tenantId: string): Promise<number> {
  // Berkas ekspor sementara (dihapus otomatis 24 jam) tidak dihitung ke kuota.
  const result = await prisma.storedFile.aggregate({ where: { tenantId, deletedAt: null, purpose: { not: 'export' } }, _sum: { size: true } })
  return result._sum.size ?? 0
}

/** Pemakaian untuk UI. Karyawan = rekam aktif/percobaan/cuti (LIMIT_META.employees). */
export async function usageSummary(tenantId: string) {
  const [branches, seats, storageBytes, employees] = await Promise.all([
    prisma.branch.count({ where: { tenantId, isActive: true } }),
    teamSeatUsage(tenantId),
    storageUsageBytes(tenantId),
    prisma.employee.count({ where: { tenantId, status: { in: ['active', 'probation', 'on_leave'] } } })
  ])
  return { employees, branches, teamMembers: seats.used, storageMb: Math.ceil(storageBytes / (1024 * 1024)) }
}
