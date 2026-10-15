import type { H3Event } from 'h3'
import { z } from 'zod'
import { isAwaitingPayment } from '#shared/utils/payments'
import type { Payment } from '~~/generated/prisma/client'
import { getActiveGateway } from '../services/payments'

// Bacaan halaman /app/billing. Nama/kredensial gateway TIDAK PERNAH dikembalikan — hanya checkoutAvailable.

export function toPaymentView(payment: Payment) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    period: payment.period,
    planSlug: payment.planSlug,
    paymentType: payment.paymentType,
    redirectUrl: isAwaitingPayment(payment) ? payment.redirectUrl : null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString()
  }
}

export async function subscriptionOverview(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  const now = new Date()
  const [subscription, entitlements, plans, pending, gateway] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true } }),
    getEntitlements(ctx.tenantId),
    prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ order: 'asc' }, { priceMonthly: 'asc' }] }),
    // Daftar lengkap (tidak dipaginasi): tagihan di "halaman 2" justru yang bisa terbayar dua kali.
    prisma.payment.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['pending', 'challenge'] }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: 'desc' }
    }),
    getActiveGateway()
  ])
  return {
    subscription: subscription
      ? {
          status: subscription.status,
          period: subscription.period,
          planSlug: subscription.plan.slug,
          planName: subscription.plan.name,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
          cancelledAt: subscription.cancelledAt?.toISOString() ?? null
        }
      : null,
    entitlements,
    plans: plans.map(toPlanView),
    pendingPayments: pending.map(toPaymentView),
    needsBranchSelection: await needsBranchSelection(ctx.tenantId, ctx.tenant.downgradeResolvedAt),
    checkoutAvailable: !!gateway && !ctx.impersonatorId,
    impersonating: !!ctx.impersonatorId
  }
}

export const paymentListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
})

export async function listTenantPayments(event: H3Event, query: z.infer<typeof paymentListSchema>) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  const where = { tenantId: ctx.tenantId }
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.payment.count({ where })
  ])
  return { items: items.map(toPaymentView), meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) } }
}
