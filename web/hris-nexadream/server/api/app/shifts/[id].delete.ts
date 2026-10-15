export default defineEventHandler(event => deleteShift(event, getRouterParam(event, 'id') ?? ''))
