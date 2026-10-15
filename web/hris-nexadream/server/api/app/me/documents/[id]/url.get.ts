export default defineEventHandler(event => documentUrl(event, getRouterParam(event, 'id') ?? ''))
