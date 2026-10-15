import type { H3Event } from 'h3'
import { z } from 'zod'
import { BILLING_PERIODS, BILLING_PERIOD_LABELS, LOCAL_ORDER_PREFIX } from '#shared/utils/payments'
import { getActiveGateway, getGatewayCredentials, getPaymentDriver, requireActiveGateway } from '../services/payments'

// Checkout langganan (pemilik → platform). Gaji karyawan tidak pernah lewat sini (D5).

const CHECKOUT_TTL_MS = 60 * 60 * 1000

export const checkoutSchema = z.object({
  planSlug: z.string().trim().min(1, 'Pilih paket.'),
  period: z.enum(BILLING_PERIODS, 'Pilih periode bulanan atau tahunan.')
})

/** HR-<waktu base36>-<4 acak>: unik, ≤ 39 karakter, karakter aman untuk hub. */
export function generateOrderId(): string {
  const random = Array.from({ length: 4 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  return `${LOCAL_ORDER_PREFIX}-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`
}

export async function startCheckout(event: H3Event, input: z.infer<typeof checkoutSchema>) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  await requireNotImpersonating(event)
  assertRateLimit('checkout', ctx.tenantId, 20, 60 * 60 * 1000)

  const plan = await prisma.plan.findUnique({ where: { slug: input.planSlug } })
  if (!plan || !plan.isActive) throw notFound('Paket tidak ditemukan.')
  // Server yang menentukan harga — angka dari klien tidak pernah dipakai.
  const amount = Math.round(Number((input.period === 'yearly' ? plan.priceYearly : plan.priceMonthly).toString()))
  if (amount <= 0) throw httpError(400, 'VALIDATION_FAILED', 'Paket ini tidak bisa dibeli secara online. Hubungi kami untuk penawaran.')

  const gateway = requireActiveGateway(await getActiveGateway())
  const now = new Date()

  // Paket yang sama diminta dua kali = satu tagihan.
  const reusable = await prisma.payment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ['pending', 'challenge'] },
      planSlug: plan.slug,
      period: input.period,
      provider: gateway.driver.provider,
      redirectUrl: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: { createdAt: 'desc' }
  })
  if (reusable) {
    return { orderId: reusable.orderId, redirectUrl: reusable.redirectUrl!, amount: reusable.amount, expiresAt: reusable.expiresAt?.toISOString() ?? null, reused: true }
  }

  const orderId = generateOrderId()
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS)
  const base = await siteUrl()
  const charge = await gateway.driver.createCharge(gateway.creds, {
    orderId,
    amount,
    currency: plan.currency,
    itemName: `Langganan ${plan.name} (${BILLING_PERIOD_LABELS[input.period].toLowerCase()})`,
    customer: { name: ctx.user.name, email: ctx.user.email, phone: ctx.user.phone },
    // Hub menambahkan ?reference=…&result=…&status=… sendiri → URL tanpa query.
    successUrl: `${base}/app/billing/return`,
    failureUrl: `${base}/app/billing/return`,
    expiresAt,
    // Hanya id/slug — tidak pernah data pribadi (D7).
    metadata: { tenantId: ctx.tenantId, planSlug: plan.slug, period: input.period }
  })

  await prisma.payment.create({
    data: {
      tenantId: ctx.tenantId,
      subscriptionId: ctx.tenant.subscription?.id ?? null,
      orderId,
      gatewayOrderId: charge.gatewayOrderId ?? null,
      provider: gateway.driver.provider,
      amount,
      currency: plan.currency,
      status: 'pending',
      period: input.period,
      planSlug: plan.slug,
      redirectUrl: charge.redirectUrl,
      expiresAt,
      raw: (charge.raw ?? undefined) as never
    }
  })
  await recordAudit(event, {
    audience: 'tenant', action: 'payment.checkout', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, targetType: 'payment', targetId: orderId, metadata: { planSlug: plan.slug, period: input.period, amount }
  })
  return { orderId, redirectUrl: charge.redirectUrl, amount, expiresAt: expiresAt.toISOString(), reused: false }
}

/** Membatalkan tagihan yang belum selesai (mis. ganti paket di tengah checkout). Gateway yang memutuskan. */
export async function cancelTenantPayment(event: H3Event, paymentId: string) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  await requireNotImpersonating(event)
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, tenantId: ctx.tenantId } })
  if (!payment) throw notFound('Pembayaran tidak ditemukan.')
  if (payment.status !== 'pending' && payment.status !== 'challenge') {
    throw conflict('Pembayaran ini sudah diproses.')
  }

  let alreadyCancelled = false
  let status: string = 'cancelled'
  const creds = await getGatewayCredentials(payment.provider)
  if (creds) {
    const result = await getPaymentDriver(payment.provider).cancelCharge(creds, payment.orderId)
    alreadyCancelled = result.alreadyCancelled
    await applyPayment(result) // pembayaran yang baru saja lunas kembali "paid" dan tetap lunas
    status = result.status
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'cancelled', rawStatus: 'cancelled_locally' } })
  }
  await recordAudit(event, {
    audience: 'tenant', action: 'payment.cancel', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, targetType: 'payment', targetId: payment.orderId
  })
  return { success: true, orderId: payment.orderId, status, alreadyCancelled }
}

/**
 * Status pembayaran untuk halaman kembali dari gateway. Parameter redirect hanya tampilan —
 * yang dibaca adalah status di DB, disegarkan dari gateway bila masih pending.
 */
export async function tenantPaymentStatus(event: H3Event, orderId: string) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  let payment = await prisma.payment.findFirst({ where: { orderId, tenantId: ctx.tenantId } })
  if (!payment) throw notFound('Pembayaran tidak ditemukan.')
  if (payment.status === 'pending' || payment.status === 'challenge') {
    try {
      const creds = await getGatewayCredentials(payment.provider)
      if (creds) {
        await applyPayment(await getPaymentDriver(payment.provider).getStatus(creds, payment.orderId))
        payment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
      }
    } catch (error) {
      console.error('[checkout] status refresh failed', orderId, error)
    }
  }
  return { orderId: payment.orderId, status: payment.status, planSlug: payment.planSlug, period: payment.period, amount: payment.amount }
}
