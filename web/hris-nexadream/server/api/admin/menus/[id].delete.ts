export default defineEventHandler(event => deleteMenu(event, getRouterParam(event, 'id') ?? ''))
