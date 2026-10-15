export default defineEventHandler(event => deletePage(event, getRouterParam(event, 'id') ?? ''))
