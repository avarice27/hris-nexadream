export default defineEventHandler(event => adminRevokeApiClient(event, getRouterParam(event, 'id') ?? ''))
