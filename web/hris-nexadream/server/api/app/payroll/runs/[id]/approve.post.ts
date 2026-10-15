export default defineEventHandler(event => approvePayrollRun(event, getRouterParam(event, 'id') ?? ''))
