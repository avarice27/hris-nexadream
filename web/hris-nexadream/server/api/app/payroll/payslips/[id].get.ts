export default defineEventHandler(event => getPayslip(event, getRouterParam(event, 'id') ?? ''))
