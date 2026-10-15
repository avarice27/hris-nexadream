import { getGatewayCredentials, getPaymentDriver, isSupportedProvider, type WebhookPayload } from '../../../services/payments'

// Penerima callback gateway. Tanpa middleware auth — driver yang menentukan apa yang bisa dipercaya.
// Setiap callback disimpan (dedupe) SEBELUM diterapkan; untuk hub, status dikonfirmasi ulang.
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider') ?? ''
  if (!isSupportedProvider(provider)) throw notFound()
  const payload = await readBody(event).catch(() => null) as WebhookPayload | null
  if (!payload || typeof payload !== 'object') throw httpError(400, 'VALIDATION_FAILED', 'Invalid payload.')

  const creds = await getGatewayCredentials(provider)
  if (!creds) throw httpError(503, 'INTERNAL', 'Payment provider not configured.')

  const driver = getPaymentDriver(provider)
  const headers = getRequestHeaders(event)
  if (driver.trustsWebhookPayload && !driver.verifyWebhook(creds, payload, headers)) {
    throw unauthenticated('Invalid signature.')
  }

  const gatewayOrderId = driver.webhookOrderId(payload)
  const dedupeKey = `${provider}:${sha256(driver.webhookDedupeSource(payload))}`
  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { dedupeKey } })
  if (existing?.processedAt) return { received: true, duplicate: true }

  const record = existing ?? await prisma.paymentWebhookEvent.create({
    data: { provider, dedupeKey, orderId: gatewayOrderId, payload: payload as never, headers: headers as never }
  })

  try {
    const normalized = await normalizeCallback(driver, creds, payload)
    if (!normalized) {
      // Pesanan platform lain di akun merchant bersama: simpan, jawab 200, tidak menerapkan apa pun.
      await prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: 'unknown order' } })
      return { received: true, applied: false }
    }
    const result = await applyPayment(normalized)
    await prisma.paymentWebhookEvent.update({
      where: { id: record.id },
      data: { processedAt: new Date(), orderId: gatewayOrderId ?? normalized.orderId, error: result.applied || result.noop ? null : (result.reason ?? null) }
    })
    return { received: true, applied: result.applied }
  } catch (error) {
    await prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { error: error instanceof Error ? error.message : String(error) } })
    throw httpError(500, 'INTERNAL', 'Callback processing failed.') // gateway mencoba ulang; baris disimpan untuk replay
  }
})
