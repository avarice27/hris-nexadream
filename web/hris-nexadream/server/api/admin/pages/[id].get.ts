export default defineEventHandler(event => getPage(event, getRouterParam(event, 'id') ?? ''))
