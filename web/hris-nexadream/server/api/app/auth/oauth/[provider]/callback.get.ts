export default defineEventHandler(event => finishOAuth(event, getRouterParam(event, 'provider') ?? ''))
