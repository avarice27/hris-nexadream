export default defineEventHandler(event => deleteHoliday(event, getRouterParam(event, 'id') ?? ''))
