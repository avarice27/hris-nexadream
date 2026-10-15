export default defineEventHandler(event => cancelLeave(event, getRouterParam(event, 'id') ?? '', true))
