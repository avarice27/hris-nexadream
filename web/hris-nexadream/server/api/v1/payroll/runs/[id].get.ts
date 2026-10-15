export default defineApiV1Handler(event => getPayrollRun(event, getRouterParam(event, 'id') ?? ''), { apiKey: true })
