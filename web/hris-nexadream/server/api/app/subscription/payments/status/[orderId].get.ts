export default defineEventHandler(event => tenantPaymentStatus(event, getRouterParam(event, 'orderId') ?? ''))
