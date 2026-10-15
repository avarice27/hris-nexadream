export default defineEventHandler(event => cancelOvertime(event, getRouterParam(event, 'id') ?? ''))
