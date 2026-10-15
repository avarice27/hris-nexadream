export default defineEventHandler(event => cancelTenantPayment(event, getRouterParam(event, 'id') ?? ''))
