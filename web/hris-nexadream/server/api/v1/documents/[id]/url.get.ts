export default defineApiV1Handler(event => documentUrl(event, getRouterParam(event, 'id') ?? ''), { apiKey: true })
