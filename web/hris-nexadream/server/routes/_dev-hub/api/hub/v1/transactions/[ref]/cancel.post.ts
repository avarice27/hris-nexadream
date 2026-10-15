import { findMock, requireMockKey, toHubJson } from '../../../../../../../dev-hub/store'

// MOCK hub (dev): POST /api/hub/v1/transactions/:ref/cancel
export default defineEventHandler((event) => {
  requireMockKey(event)
  const tx = findMock(getRouterParam(event, 'ref') ?? '')
  if (!tx) throw createError({ statusCode: 404, statusMessage: 'No transaction with that reference.' })
  if (tx.status === 'cancelled') return toHubJson(tx, { alreadyCancelled: true })
  if (tx.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'Payment can no longer be cancelled.' })
  tx.status = 'cancelled'
  tx.gatewayStatus = 'cancel'
  return toHubJson(tx, { alreadyCancelled: false })
})
