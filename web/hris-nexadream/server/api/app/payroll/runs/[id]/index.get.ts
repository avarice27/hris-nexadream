export default defineEventHandler(event => getPayrollRun(event, getRouterParam(event, 'id') ?? ''))
