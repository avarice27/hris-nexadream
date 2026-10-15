export default defineEventHandler(event => reimbursementReceiptUrl(event, getRouterParam(event, 'id') ?? ''))
