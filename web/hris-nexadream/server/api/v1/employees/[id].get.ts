export default defineApiV1Handler(event => getEmployee(event, getRouterParam(event, 'id') ?? ''), { apiKey: true })
