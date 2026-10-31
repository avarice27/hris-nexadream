export default defineEventHandler(event => tenantPaymentInvoice(event, getRouterParam(event, 'id') ?? ''))
