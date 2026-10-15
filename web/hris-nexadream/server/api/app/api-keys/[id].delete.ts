export default defineEventHandler(event => revokeApiKey(event, getRouterParam(event, 'id') ?? ''))
