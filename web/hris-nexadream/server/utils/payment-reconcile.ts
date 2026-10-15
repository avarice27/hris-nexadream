import { getActiveGateway } from '../services/payments'

// Jaring pengaman: callback bisa terlewat. Baca ulang pembayaran pending ≤ 48 jam (maks 200,
// terlama dulu) dari gateway aktif dan terapkan. Idempoten; satu pesanan gagal tidak menghentikan yang lain.
export async function reconcilePendingPayments(): Promise<{ checked: number, updated: number, errors: number }> {
  const gateway = await getActiveGateway()
  if (!gateway) return { checked: 0, updated: 0, errors: 0 }
  const since = new Date(Date.now() - 48 * 3600_000)
  const pending = await prisma.payment.findMany({
    where: { status: { in: ['pending', 'challenge'] }, provider: gateway.driver.provider, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { orderId: true }
  })
  let updated = 0
  let errors = 0
  for (const payment of pending) {
    try {
      const result = await applyPayment(await gateway.driver.getStatus(gateway.creds, payment.orderId))
      if (result.applied) updated++
    } catch (error) {
      errors++
      console.error('[payments:reconcile] failed', payment.orderId, error)
    }
  }
  return { checked: pending.length, updated, errors }
}
