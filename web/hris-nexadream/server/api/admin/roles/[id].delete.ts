export default defineEventHandler(event => deleteRole(event, getRouterParam(event, 'id') ?? ''))
