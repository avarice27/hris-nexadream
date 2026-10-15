export default defineApiV1Handler(event => myPayslip(event, getRouterParam(event, 'id') ?? ''))
