export default defineEventHandler(event => myPayslip(event, getRouterParam(event, 'id') ?? ''))
