export default defineEventHandler(event => startOAuth(event, getRouterParam(event, 'provider') ?? ''))
