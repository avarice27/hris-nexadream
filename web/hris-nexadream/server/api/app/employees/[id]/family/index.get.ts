export default defineEventHandler(event => listFamily(event, getRouterParam(event, 'id') ?? ''))
