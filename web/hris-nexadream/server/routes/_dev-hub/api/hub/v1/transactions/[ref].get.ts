import { findMock, requireMockKey, toHubJson } from '../../../../../../dev-hub/store'

// MOCK hub (dev): GET /api/hub/v1/transactions/:ref
export default defineEventHandler((event) => {
  requireMockKey(event)
  const tx = findMock(getRouterParam(event, 'ref') ?? '')
  if (!tx) throw createError({ statusCode: 404, statusMessage: 'No transaction with that reference.' })
  return toHubJson(tx)
})
