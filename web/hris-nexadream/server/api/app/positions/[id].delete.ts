export default defineEventHandler(event => deletePosition(event, getRouterParam(event, 'id') ?? ''))
