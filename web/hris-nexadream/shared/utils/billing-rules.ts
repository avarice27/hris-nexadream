// Aturan tanggal langganan yang murni (tanpa DB) — dipakai server dan diuji unit.

export type PeriodValue = 'monthly' | 'yearly'

/** addMonths dalam UTC; tanggal 29–31 dijepit ke akhir bulan (31 Jan + 1 bulan = 28/29 Feb). */
export function periodEnd(from: Date, period: PeriodValue): Date {
  const months = period === 'yearly' ? 12 : 1
  const d = new Date(from.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

interface SubscriptionTimes {
  status: string
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  graceEndsAt?: Date | null
}

/** Apakah waktu berbayar benar-benar habis? Checkout yang ditinggal saat masih aktif bukan gagal bayar. */
export function isSubscriptionDue(s: SubscriptionTimes, now = new Date()): boolean {
  switch (s.status) {
    case 'trialing': return !s.trialEndsAt || s.trialEndsAt <= now
    case 'active': return !s.currentPeriodEnd || s.currentPeriodEnd <= now
    case 'past_due': return true
    default: return false
  }
}

/** Apakah langganan memberikan paketnya SAAT INI (selain itu: paket bawaan, bukan "tanpa akses"). */
export function subscriptionGrantsPlan(s: SubscriptionTimes, now = new Date()): boolean {
  switch (s.status) {
    case 'trialing': return !s.trialEndsAt || s.trialEndsAt > now
    case 'active': return true
    case 'cancelled': return Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now)
    case 'past_due': return Boolean(s.graceEndsAt && s.graceEndsAt > now)
    default: return false
  }
}

/** Bayar lebih awal menumpuk di atas sisa waktu: dasar = max(sekarang, akhir periode). */
export function renewalBase(currentPeriodEnd: Date | null, now = new Date()): Date {
  return currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now
}
