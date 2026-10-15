export default defineEventHandler(event => getEmployee(event, getRouterParam(event, 'id') ?? ''))
