export default defineEventHandler(event => cancelReimbursement(event, getRouterParam(event, 'id') ?? ''))
