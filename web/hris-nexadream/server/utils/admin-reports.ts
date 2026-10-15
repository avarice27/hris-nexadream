import type { H3Event } from 'h3'
import { z } from 'zod'
import { addDaysToKey, startOfZonedDay, todayKey, zonedDateKey } from '#shared/utils/timezone'

// Dasbor & laporan platform. HANYA agregat — tidak pernah data domain per perusahaan (D7).
// Satu jam acuan: zona tampilan platform (display.timezone). Volume saat ini kecil, jadi
// pengelompokan dilakukan di JS; pindahkan ke SQL (AT TIME ZONE) bila datanya membesar.

const PAYING = new Set(['active', 'past_due', 'cancelled'])

function monthKey(dateKey: string) {
  return dateKey.slice(0, 7)
}

function startOfMonthKey(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`
}

function addMonthsToMonthStart(dateKey: string, months: number) {
  const [y, m] = dateKey.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return d.toISOString().slice(0, 10)
}

/** Senin dari minggu yang memuat dateKey. */
function startOfWeekKey(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Minggu
  return addDaysToKey(dateKey, -((weekday + 6) % 7))
}

export async function adminDashboard(event: H3Event) {
  await requirePermission(event, 'dashboard.read')
  const tz = await getSetting('display.timezone')
  const today = todayKey(tz)
  const monthStart = startOfZonedDay(startOfMonthKey(today), tz)
  const sixMonthsStart = startOfZonedDay(addMonthsToMonthStart(startOfMonthKey(today), -5), tz)

  // Dua batch kecil, bukan 11 kueri paralel: satu request serverless tidak boleh menghabiskan
  // kolam koneksi (Neon/pg pool) — ditemukan saat uji fase 8.
  const [tenantTotal, tenantActive, tenantSuspended, tenantNew, deleteRequests, unreadMessages] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.tenant.count({ where: { deletedAt: null, status: 'active' } }),
    prisma.tenant.count({ where: { deletedAt: null, status: 'suspended' } }),
    prisma.tenant.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
    prisma.tenant.count({ where: { deletedAt: null, deleteRequestedAt: { not: null } } }),
    prisma.contactMessage.count({ where: { status: 'new' } })
  ])
  const [subsByStatus, revenue, newestTenants, latestPayments, recentUsers] = await Promise.all([
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true }, where: { tenant: { deletedAt: null } } }),
    prisma.payment.aggregate({ where: { status: 'paid', paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.tenant.findMany({
      where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 6,
      select: { id: true, name: true, status: true, createdAt: true, subscription: { select: { status: true, plan: { select: { name: true } } } } }
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { createdAt: 'desc' }, take: 6,
      select: { id: true, orderId: true, amount: true, status: true, planSlug: true, createdAt: true, tenant: { select: { id: true, name: true } } }
    }),
    prisma.tenantUser.findMany({ where: { createdAt: { gte: sixMonthsStart } }, select: { createdAt: true } })
  ])

  const months: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) months[monthKey(addMonthsToMonthStart(startOfMonthKey(today), -i))] = 0
  for (const u of recentUsers) {
    const key = monthKey(zonedDateKey(u.createdAt, tz))
    if (key in months) months[key]!++
  }

  return {
    tenants: { total: tenantTotal, active: tenantActive, suspended: tenantSuspended, newThisMonth: tenantNew, deleteRequests },
    // Hitungan saja, lintas platform; diisi saat modul karyawan ada (fase 11).
    employeesActive: 0,
    subscriptions: Object.fromEntries(subsByStatus.map(s => [s.status, s._count._all])),
    revenueThisMonth: { amount: revenue._sum.amount ?? 0, count: revenue._count._all },
    unreadMessages,
    newestTenants: newestTenants.map(t => ({ id: t.id, name: t.name, status: t.status, createdAt: t.createdAt.toISOString(), subscriptionStatus: t.subscription?.status ?? null, planName: t.subscription?.plan.name ?? null })),
    latestPayments: latestPayments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    newTenantUsersByMonth: Object.entries(months).map(([month, count]) => ({ month, count }))
  }
}

export const reportQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('month'),
  limit: z.coerce.number().int().min(1).max(60).default(12)
})

export async function adminReportSummary(event: H3Event, query: z.infer<typeof reportQuerySchema>) {
  await requirePermission(event, 'reports.read')
  const tz = await getSetting('display.timezone')
  const today = todayKey(tz)

  // Kunci awal tiap ember, dari yang terlama.
  const bucketOf = (dateKey: string) => query.period === 'day' ? dateKey : query.period === 'week' ? startOfWeekKey(dateKey) : startOfMonthKey(dateKey)
  const current = bucketOf(today)
  const keys: string[] = []
  for (let i = query.limit - 1; i >= 0; i--) {
    keys.push(query.period === 'day' ? addDaysToKey(current, -i) : query.period === 'week' ? addDaysToKey(current, -7 * i) : addMonthsToMonthStart(current, -i))
  }
  const windowStart = startOfZonedDay(keys[0]!, tz)

  const [payments, events, signups, onboarded, firstEvent, book, plans] = await Promise.all([
    prisma.payment.findMany({ where: { status: 'paid', paidAt: { gte: windowStart } }, select: { amount: true, paidAt: true, planSlug: true, period: true, tenantId: true } }),
    prisma.subscriptionEvent.findMany({ where: { createdAt: { gte: windowStart } }, select: { transition: true, fromStatus: true, toStatus: true, createdAt: true } }),
    prisma.tenant.findMany({ where: { createdAt: { gte: windowStart } }, select: { id: true, createdAt: true } }),
    prisma.tenant.findMany({ where: { onboardingCompletedAt: { gte: windowStart } }, select: { onboardingCompletedAt: true } }),
    prisma.subscriptionEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.subscription.findMany({ where: { tenant: { deletedAt: null } }, select: { status: true, period: true, plan: { select: { slug: true, name: true, priceMonthly: true, priceYearly: true } } } }),
    prisma.plan.findMany({ select: { slug: true, name: true } })
  ])

  const empty = () => ({ revenue: 0, payments: 0, newPaid: 0, renewals: 0, churned: 0, trialsLapsed: 0, signups: 0, onboarded: 0 })
  const buckets = new Map(keys.map(k => [k, empty()]))
  const bucket = (date: Date) => buckets.get(bucketOf(zonedDateKey(date, tz)))

  const revenueByPlan: Record<string, number> = {}
  const revenueByPeriod: Record<string, number> = { monthly: 0, yearly: 0 }
  for (const p of payments) {
    const b = p.paidAt ? bucket(p.paidAt) : undefined
    if (!b) continue
    b.revenue += p.amount
    b.payments++
    revenueByPlan[p.planSlug ?? 'lainnya'] = (revenueByPlan[p.planSlug ?? 'lainnya'] ?? 0) + p.amount
    revenueByPeriod[p.period] = (revenueByPeriod[p.period] ?? 0) + p.amount
  }
  for (const e of events) {
    const b = bucket(e.createdAt)
    if (!b) continue
    if (e.transition === 'pay') {
      if (e.fromStatus && PAYING.has(e.fromStatus)) b.renewals++
      else b.newPaid++
    }
    if (e.toStatus === 'downgraded' && e.fromStatus && PAYING.has(e.fromStatus)) b.churned++
    if (e.transition === 'trial_expired') b.trialsLapsed++
  }
  for (const t of signups) {
    const b = bucket(t.createdAt)
    if (b) b.signups++
  }
  for (const t of onboarded) {
    const b = t.onboardingCompletedAt ? bucket(t.onboardingCompletedAt) : undefined
    if (b) b.onboarded++
  }

  const series = keys.map(key => ({ key, ...buckets.get(key)! }))
  const totals = series.reduce((acc, s) => {
    for (const k of Object.keys(acc) as Array<keyof typeof acc>) acc[k] += s[k]
    return acc
  }, empty())

  // Buku saat ini: MRR = bulanan pada harga + tahunan ÷ 12.
  let mrr = 0
  const byPlan: Record<string, { name: string, paying: number, trialing: number, mrr: number }> = {}
  const counts = { paying: 0, trialing: 0, pastDue: 0, free: 0 }
  for (const s of book) {
    const entry = byPlan[s.plan.slug] ??= { name: s.plan.name, paying: 0, trialing: 0, mrr: 0 }
    if (s.status === 'active' || s.status === 'past_due') {
      const monthly = s.period === 'yearly' ? Number(s.plan.priceYearly) / 12 : Number(s.plan.priceMonthly)
      mrr += monthly
      entry.mrr += monthly
      entry.paying++
      counts.paying++
      if (s.status === 'past_due') counts.pastDue++
    } else if (s.status === 'trialing') {
      entry.trialing++
      counts.trialing++
    } else if (s.status === 'downgraded') {
      counts.free++
    }
  }
  const paidTenants = new Set(payments.map(p => p.tenantId))
  const convertedSignups = signups.filter(t => paidTenants.has(t.id)).length
  const planNames = Object.fromEntries(plans.map(p => [p.slug, p.name]))

  return {
    period: query.period,
    timezone: tz,
    series,
    totals: { ...totals, averagePayment: totals.payments ? Math.round(totals.revenue / totals.payments) : 0 },
    revenueByPlan: Object.entries(revenueByPlan).map(([slug, amount]) => ({ slug, name: planNames[slug] ?? slug, amount })),
    revenueByPeriod,
    book: { mrr: Math.round(mrr), ...counts, byPlan: Object.entries(byPlan).map(([slug, v]) => ({ slug, ...v, mrr: Math.round(v.mrr) })) },
    conversion: { signups: signups.length, converted: convertedSignups, rate: signups.length ? convertedSignups / signups.length : 0 },
    // Sebelum tanggal ini churn "tidak diketahui", bukan nol.
    historySince: firstEvent?.createdAt.toISOString() ?? null
  }
}
