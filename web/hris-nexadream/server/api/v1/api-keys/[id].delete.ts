export default defineApiV1Handler(event => revokeApiKey(event, getRouterParam(event, 'id') ?? ''))
