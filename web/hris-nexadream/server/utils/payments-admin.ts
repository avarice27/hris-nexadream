import type { H3Event } from 'h3'
import { z } from 'zod'
import { PAYMENT_PROVIDERS, PAYMENT_STATUSES, providerMeta } from '#shared/utils/payments'
import type { Prisma } from '~~/generated/prisma/client'
import { getGatewayCredentials, getPaymentDriver, isSupportedProvider, type WebhookPayload } from '../services/payments'

// Back-office pembayaran: kredensial gateway, daftar pembayaran & langganan, log callback + replay.

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export async function listGateways(event: H3Event) {
  await requirePermission(event, 'payments.read')
  const rows = await prisma.paymentGateway.findMany({ orderBy: { provider: 'asc' } })
  return {
    providers: PAYMENT_PROVIDERS,
    items: rows.map(row => ({
      id: row.id,
      provider: row.provider,
      label: row.label,
      isActive: row.isActive,
      isSandbox: row.isSandbox,
      merchantId: row.merchantId,
      baseUrl: row.baseUrl,
      orderPrefix: row.orderPrefix,
      // Rahasia tidak pernah dikembalikan mentah.
      serverKeyMasked: row.serverKey ? maskSecret(decrypt(row.serverKey)) : null,
      clientKeyMasked: row.clientKey ? maskSecret(decrypt(row.clientKey)) : null,
      hasServerKey: !!row.serverKey,
      hasClientKey: !!row.clientKey,
      updatedAt: row.updatedAt.toISOString()
    })),
    webhookUrlBase: `${await siteUrl()}/api/webhooks/payments`
  }
}

export const gatewayUpdateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  isSandbox: z.boolean().optional(),
  merchantId: z.string().trim().max(120).nullable().optional(),
  baseUrl: z.union([z.literal(''), z.url('Alamat harus berupa URL lengkap (https://…).')]).nullable().optional(),
  orderPrefix: z.union([z.literal(''), z.string().regex(/^[A-Za-z0-9_-]{1,12}$/, 'Prefiks hanya huruf, angka, - dan _ (maks 12).')]).nullable().optional(),
  /** '' = pertahankan nilai tersimpan */
  serverKey: z.string().max(500).optional(),
  clientKey: z.string().max(500).optional()
})

export async function updateGateway(event: H3Event, id: string, input: z.infer<typeof gatewayUpdateSchema>) {
  const ctx = await requirePermission(event, 'payments.write')
  const row = await prisma.paymentGateway.findUnique({ where: { id } })
  if (!row) throw notFound('Gateway tidak ditemukan.')
  const meta = providerMeta(row.provider)

  const data: Prisma.PaymentGatewayUpdateInput = {}
  if (input.label !== undefined) data.label = input.label
  if (input.isSandbox !== undefined) data.isSandbox = input.isSandbox
  if (input.merchantId !== undefined) data.merchantId = input.merchantId || null
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl ? input.baseUrl.replace(/\/+$/, '') : null
  if (input.orderPrefix !== undefined) data.orderPrefix = input.orderPrefix || null
  if (input.serverKey) data.serverKey = encrypt(input.serverKey.trim())
  if (input.clientKey) data.clientKey = encrypt(input.clientKey.trim())

  if (input.isActive === true) {
    if (!meta?.isImplemented || !isSupportedProvider(row.provider)) throw conflict('Penyedia ini belum didukung.')
    // Setiap field yang diwajibkan katalog harus ada (nilai baru atau tersimpan).
    const missing = (meta.fields ?? []).filter((field) => {
      const incoming = input[field.key as keyof typeof input]
      const stored = row[field.key as keyof typeof row]
      return !(typeof incoming === 'string' && incoming.trim()) && !(incoming === undefined && stored)
    })
    if (missing.length) throw conflict(`Lengkapi ${missing.map(f => f.label).join(', ')} sebelum mengaktifkan gateway.`)
  }
  if (input.isActive !== undefined) data.isActive = input.isActive

  await prisma.$transaction(async (tx) => {
    // Tepat satu gateway aktif.
    if (input.isActive === true) await tx.paymentGateway.updateMany({ where: { NOT: { id } }, data: { isActive: false } })
    await tx.paymentGateway.update({ where: { id }, data })
  })
  await recordAudit(event, {
    audience: 'platform', action: 'gateway.update', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, targetType: 'payment_gateway', targetId: id,
    // Nama field saja — tidak pernah nilai kunci.
    metadata: { fields: Object.keys(input), provider: row.provider, isActive: input.isActive }
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Daftar pembayaran & langganan
// ---------------------------------------------------------------------------

export const adminPaymentListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export async function adminListPayments(event: H3Event, query: z.infer<typeof adminPaymentListSchema>) {
  await requirePermission(event, 'payments.read')
  const where: Prisma.PaymentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [
          { orderId: { contains: query.search, mode: 'insensitive' } },
          { gatewayOrderId: { contains: query.search, mode: 'insensitive' } },
          { tenant: { name: { contains: query.search, mode: 'insensitive' } } }
        ] }
      : {})
  }
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit,
      include: { tenant: { select: { id: true, name: true } } }
    }),
    prisma.payment.count({ where })
  ])
  return {
    items: items.map(p => ({
      id: p.id, orderId: p.orderId, gatewayOrderId: p.gatewayOrderId, provider: p.provider, amount: p.amount,
      currency: p.currency, status: p.status, rawStatus: p.rawStatus, paymentType: p.paymentType, period: p.period,
      planSlug: p.planSlug, paidAt: p.paidAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), tenant: p.tenant
    })),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) }
  }
}

export const adminSubscriptionListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended']).optional(),
  planSlug: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export async function adminListSubscriptions(event: H3Event, query: z.infer<typeof adminSubscriptionListSchema>) {
  await requirePermission(event, 'subscriptions.read')
  const where: Prisma.SubscriptionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.planSlug ? { plan: { slug: query.planSlug } } : {}),
    ...(query.search ? { tenant: { name: { contains: query.search, mode: 'insensitive' } } } : {})
  }
  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit,
      include: { tenant: { select: { id: true, name: true, status: true } }, plan: { select: { slug: true, name: true } } }
    }),
    prisma.subscription.count({ where })
  ])
  return {
    items: items.map(s => ({
      id: s.id, status: s.status, period: s.period, plan: s.plan, tenant: s.tenant,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null, currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: s.graceEndsAt?.toISOString() ?? null, updatedAt: s.updatedAt.toISOString()
    })),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) }
  }
}

// ---------------------------------------------------------------------------
// Log callback + replay
// ---------------------------------------------------------------------------

export const webhookEventListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  state: z.enum(['processed', 'error', 'pending']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export async function adminListWebhookEvents(event: H3Event, query: z.infer<typeof webhookEventListSchema>) {
  await requirePermission(event, 'payments.read')
  const where: Prisma.PaymentWebhookEventWhereInput = {
    ...(query.search ? { orderId: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.state === 'processed' ? { processedAt: { not: null }, error: null } : {}),
    ...(query.state === 'error' ? { error: { not: null } } : {}),
    ...(query.state === 'pending' ? { processedAt: null } : {})
  }
  const [items, total] = await Promise.all([
    prisma.paymentWebhookEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.paymentWebhookEvent.count({ where })
  ])
  return {
    items: items.map(e => ({
      id: e.id, provider: e.provider, orderId: e.orderId,
      // Apa kata gateway (kata mentahnya) di samping apa yang kita lakukan.
      gatewayStatus: isSupportedProvider(e.provider) ? getPaymentDriver(e.provider).webhookStatus(e.payload as WebhookPayload) : null,
      processedAt: e.processedAt?.toISOString() ?? null, error: e.error, replayCount: e.replayCount,
      createdAt: e.createdAt.toISOString(), payload: e.payload
    })),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) }
  }
}

/** Replay = baca ulang status LIVE dari gateway lalu terapkan. Aman ditekan dua kali. */
export async function replayWebhookEvent(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'payments.write')
  const record = await prisma.paymentWebhookEvent.findUnique({ where: { id } })
  if (!record) throw notFound('Callback tidak ditemukan.')
  if (!isSupportedProvider(record.provider)) throw conflict('Penyedia callback ini tidak lagi didukung.')
  const creds = await getGatewayCredentials(record.provider)
  if (!creds) throw conflict('Kredensial penyedia ini belum diatur.')

  const driver = getPaymentDriver(record.provider)
  let resultError: string | null
  let applied = false
  try {
    const normalized = await normalizeCallback(driver, creds, record.payload as WebhookPayload)
    if (!normalized) {
      resultError = 'unknown order'
    } else {
      const result = await applyPayment(normalized)
      applied = result.applied
      resultError = result.applied || result.noop ? null : (result.reason ?? null)
    }
  } catch (error) {
    resultError = error instanceof Error ? error.message : String(error)
  }
  await prisma.paymentWebhookEvent.update({
    where: { id },
    data: { processedAt: resultError && resultError !== 'unknown order' ? record.processedAt : new Date(), error: resultError, replayCount: { increment: 1 } }
  })
  await recordAudit(event, {
    audience: 'platform', action: 'payment.webhook_replay', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, targetType: 'payment_webhook_event', targetId: id, metadata: { applied, error: resultError }
  })
  return { success: !resultError || resultError === 'unknown order', applied, error: resultError }
}
