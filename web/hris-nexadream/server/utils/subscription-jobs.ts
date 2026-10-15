import { formatDateId, formatIDR } from '#shared/utils/format'
import { todayKey } from '#shared/utils/timezone'

// Pekerjaan harian langganan (dipanggil cron). Setiap langkah idempoten: menjalankannya dua kali
// tidak mengubah apa-apa. Batch dibatasi agar satu panggilan serverless tetap singkat.

const BATCH = 200

async function owner(tenantId: string) {
  return prisma.tenantMembership.findFirst({
    where: { tenantId, role: 'owner', isActive: true },
    select: { tenantUserId: true, tenant: { select: { name: true, timezone: true } } }
  })
}

async function downgrade(tenantId: string, transition: 'trial_expired' | 'grace_expired') {
  await transitionSubscription({ tenantId, transition, force: true })
  await enforceDowngrade(tenantId)
}

export async function runSubscriptionJobs() {
  const now = new Date()
  const summary = { trialExpired: 0, graceExpired: 0, cancelledEnded: 0, renewalsDue: 0, trialReminders: 0, reconcile: { checked: 0, updated: 0, errors: 0 }, errors: 0 }
  const safely = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (error) {
      summary.errors++
      console.error('[cron:subscriptions] step failed', error)
    }
  }

  // 1. Uji coba habis → paket bawaan.
  for (const s of await prisma.subscription.findMany({ where: { status: 'trialing', trialEndsAt: { lte: now } }, take: BATCH, select: { tenantId: true } })) {
    await safely(async () => {
      await downgrade(s.tenantId, 'trial_expired')
      summary.trialExpired++
    })
  }

  // 2. Masa tenggang habis → paket bawaan.
  for (const s of await prisma.subscription.findMany({ where: { status: 'past_due', graceEndsAt: { lte: now } }, take: BATCH, select: { tenantId: true } })) {
    await safely(async () => {
      await downgrade(s.tenantId, 'grace_expired')
      summary.graceExpired++
    })
  }

  // 3. Dibatalkan dan periodenya berakhir → paket bawaan.
  for (const s of await prisma.subscription.findMany({
    where: { status: 'cancelled', OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }] },
    take: BATCH,
    select: { tenantId: true }
  })) {
    await safely(async () => {
      await downgrade(s.tenantId, 'grace_expired')
      summary.cancelledEnded++
    })
  }

  // 4. Aktif tetapi periode habis tanpa pembayaran baru (hub tidak punya tagihan berulang)
  //    → masa tenggang, dengan pengingat untuk membayar.
  for (const s of await prisma.subscription.findMany({
    where: { status: 'active', currentPeriodEnd: { lte: now } },
    take: BATCH,
    include: { plan: true }
  })) {
    await safely(async () => {
      const result = await transitionSubscription({ tenantId: s.tenantId, transition: 'payment_failed', force: true })
      summary.renewalsDue++
      const o = await owner(s.tenantId)
      if (o && result.after.graceEndsAt) {
        const price = Math.round(Number((s.period === 'yearly' ? s.plan.priceYearly : s.plan.priceMonthly).toString()))
        await safeCreateNotification({
          audience: 'tenant', tenantUserId: o.tenantUserId, tenantId: s.tenantId, templateKey: 'payment_failed',
          variables: {
            amount: formatIDR(price), planName: s.plan.name, tenantName: o.tenant.name,
            graceEndsAt: formatDateId(result.after.graceEndsAt, o.tenant.timezone), billingUrl: '/app/billing'
          }
        })
      }
    })
  }

  // 5. Pengingat uji coba — sekali per hari (klaim tahan-lama, aman untuk instance paralel).
  if (await claimSettingValue('cron.trialReminderRanOn', todayKey('Asia/Jakarta'))) {
    const days = await getNumberSetting('billing.trialReminderDays')
    const until = new Date(now.getTime() + days * 86400_000)
    for (const s of await prisma.subscription.findMany({
      where: { status: 'trialing', trialEndsAt: { gt: now, lte: until } },
      take: BATCH,
      include: { plan: true }
    })) {
      await safely(async () => {
        const o = await owner(s.tenantId)
        if (!o || !s.trialEndsAt) return
        const daysLeft = Math.max(1, Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / 86400_000))
        await safeCreateNotification({
          audience: 'tenant', tenantUserId: o.tenantUserId, tenantId: s.tenantId, templateKey: 'trial_ending_soon',
          variables: {
            daysLeft, planName: s.plan.name, tenantName: o.tenant.name,
            trialEndsAt: formatDateId(s.trialEndsAt, o.tenant.timezone), billingUrl: '/app/billing'
          }
        })
        summary.trialReminders++
      })
    }
  }

  // 6. Rekonsiliasi pembayaran pending (callback yang terlewat).
  await safely(async () => {
    summary.reconcile = await reconcilePendingPayments()
  })

  return summary
}
