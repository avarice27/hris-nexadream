export default defineEventHandler(event => adminPaymentInvoice(event, getRouterParam(event, 'id') ?? ''))
