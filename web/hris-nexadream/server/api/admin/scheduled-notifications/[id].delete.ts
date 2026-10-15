export default defineEventHandler(event => cancelBroadcast(event, getRouterParam(event, 'id') ?? ''))
