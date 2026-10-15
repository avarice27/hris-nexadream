import { BILLING_PERIOD_LABELS, type BillingPeriodValue } from '#shared/utils/payments'
import { formatDateId, formatIDR } from '#shared/utils/format'
import type { Prisma } from '~~/generated/prisma/client'
import type { GatewayCredentials, NormalizedPayment, PaymentDriver, WebhookPayload } from '../services/payments'

// Menerapkan hasil pembayaran. Dipanggil webhook, replay admin, rekonsiliasi, dan pembatalan.
// Idempoten. "paid" + aktivasi paket adalah SATU FAKTA (satu transaksi); notifikasi di luar transaksi.

export interface ApplyResult { applied: boolean, noop?: boolean, reason?: string }

/** Callback hub tidak bisa diverifikasi → cari pembayaran kita lewat id gateway, lalu tanya statusnya. */
export async function normalizeCallback(driver: PaymentDriver, creds: GatewayCredentials, payload: WebhookPayload): Promise<NormalizedPayment | null> {
  if (driver.trustsWebhookPayload) return driver.normalizeWebhook(payload)
  const gatewayOrderId = driver.webhookOrderId(payload)
  if (!gatewayOrderId) throw new Error('Callback carried no order id.')
  // Cocokkan id berprefiks PERSIS — jangan pernah merekonstruksi dengan membuang prefiks.
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId }, select: { orderId: true } })
  if (!payment) return null // pesanan platform lain (akun merchant bersama)
  return driver.getStatus(creds, payment.orderId)
}

async function ownerOf(tenantId: string) {
  const owner = await prisma.tenantMembership.findFirst({
    where: { tenantId, role: 'owner', isActive: true },
    select: { tenantUserId: true, tenant: { select: { name: true, timezone: true } } }
  })
  return owner
}

export async function applyPayment(normalized: NormalizedPayment): Promise<ApplyResult> {
  const payment = await prisma.payment.findUnique({ where: { orderId: normalized.orderId } })
  if (!payment) return { applied: false, reason: 'unknown order' }
  if (payment.status === normalized.status) return { applied: false, noop: true }
  // 'paid' adalah terminal kecuali untuk refund.
  if (payment.status === 'paid' && normalized.status !== 'refunded') return { applied: false, noop: true }

  const paymentData: Prisma.PaymentUpdateInput = {
    status: normalized.status,
    rawStatus: normalized.rawStatus,
    paymentType: normalized.paymentType ?? payment.paymentType,
    paidAt: normalized.status === 'paid' ? (normalized.paidAt ?? new Date()) : payment.paidAt,
    raw: (normalized.raw ?? payment.raw ?? undefined) as Prisma.InputJsonValue | undefined
  }

  if (normalized.status === 'paid') {
    // Jumlah dari gateway harus sama dengan yang kita tagih — kalau tidak, jangan aktifkan paket.
    if (normalized.amount && normalized.amount !== payment.amount) {
      console.error('[payments] amount mismatch', payment.orderId, payment.amount, normalized.amount)
      await prisma.payment.update({ where: { id: payment.id }, data: { rawStatus: `amount_mismatch:${normalized.rawStatus}`, raw: paymentData.raw } })
      return { applied: false, reason: 'amount mismatch' }
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: paymentData })
      return transitionSubscription({
        tenantId: payment.tenantId,
        transition: 'pay',
        planSlug: payment.planSlug ?? undefined,
        period: payment.period as BillingPeriodValue,
        force: true,
        tx
      })
    })
    // Langganan baru berlaku — kantor/seat yang dinonaktifkan tidak otomatis aktif lagi:
    // pemilik memilih sendiri (data tetap ada).
    const owner = await ownerOf(payment.tenantId)
    if (owner) {
      const plan = await prisma.plan.findUnique({ where: { slug: result.planSlug }, select: { name: true } })
      await safeCreateNotification({
        audience: 'tenant', tenantUserId: owner.tenantUserId, tenantId: payment.tenantId, templateKey: 'payment_success',
        variables: {
          amount: formatIDR(payment.amount),
          planName: plan?.name ?? result.planSlug,
          periodLabel: BILLING_PERIOD_LABELS[payment.period as BillingPeriodValue],
          orderId: payment.orderId,
          periodEnd: formatDateId(result.after.currentPeriodEnd, owner.tenant.timezone),
          tenantName: owner.tenant.name,
          billingUrl: '/app/billing'
        }
      })
    }
    return { applied: true }
  }

  if (normalized.status === 'failed' || normalized.status === 'expired') {
    const graceEndsAt = await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: paymentData })
      const sub = await tx.subscription.findUnique({ where: { tenantId: payment.tenantId } })
      // Masuk masa tenggang HANYA bila waktu berbayar memang habis (checkout dini yang ditinggal ≠ gagal bayar).
      const enters = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status) && isSubscriptionDue(sub)
      if (!enters) return null
      const result = await transitionSubscription({ tenantId: payment.tenantId, transition: 'payment_failed', force: true, tx })
      return result.after.graceEndsAt
    })
    if (graceEndsAt) {
      const owner = await ownerOf(payment.tenantId)
      if (owner) {
        const plan = payment.planSlug ? await prisma.plan.findUnique({ where: { slug: payment.planSlug }, select: { name: true } }) : null
        await safeCreateNotification({
          audience: 'tenant', tenantUserId: owner.tenantUserId, tenantId: payment.tenantId, templateKey: 'payment_failed',
          variables: {
            amount: formatIDR(payment.amount), planName: plan?.name ?? '', tenantName: owner.tenant.name,
            graceEndsAt: formatDateId(graceEndsAt, owner.tenant.timezone), billingUrl: '/app/billing'
          }
        })
      }
    }
    return { applied: true }
  }

  await prisma.payment.update({ where: { id: payment.id }, data: paymentData })
  return { applied: true }
}
