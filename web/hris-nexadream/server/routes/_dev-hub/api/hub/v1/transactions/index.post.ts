import { MOCK_PREFIX, findMock, mockTransactions, requireMockKey, toHubJson, type MockTransaction } from '../../../../../../dev-hub/store'

// MOCK hub (dev): POST /api/hub/v1/transactions
export default defineEventHandler(async (event) => {
  requireMockKey(event)
  const body = await readBody(event) as Record<string, unknown> | null
  const reference = String(body?.reference ?? '')
  const amount = body?.amount
  if (!/^[\w.~-]{1,39}$/.test(reference) || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body.' })
  }
  const items = Array.isArray(body?.items) ? body.items as Array<{ price: number, quantity: number }> : null
  if (items && items.reduce((sum, i) => sum + i.price * i.quantity, 0) !== amount) {
    throw createError({ statusCode: 400, statusMessage: 'Item totals do not equal amount.' })
  }

  const origin = getRequestURL(event).origin
  const existing = findMock(reference)
  if (existing) {
    if (existing.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'Reference already used.' })
    return toHubJson(existing, { redirectUrl: `${origin}/_dev-hub/pay/${reference}`, token: null, clientKey: null, reused: true })
  }
  const tx: MockTransaction = {
    orderId: `${MOCK_PREFIX}-${reference}`,
    reference,
    amount,
    currency: String(body?.currency ?? 'IDR'),
    status: 'pending',
    gatewayStatus: 'pending',
    paymentType: null,
    settlementTime: null,
    finishUrl: typeof body?.finishUrl === 'string' ? body.finishUrl : null,
    metadata: (body?.metadata as Record<string, unknown>) ?? null,
    expiresAt: Date.now() + Math.min(43200, Math.max(1, Number(body?.expiryMinutes ?? 60))) * 60_000,
    createdAt: Date.now()
  }
  mockTransactions.set(reference, tx)
  return toHubJson(tx, { redirectUrl: `${origin}/_dev-hub/pay/${reference}`, token: null, clientKey: null, reused: false })
})
