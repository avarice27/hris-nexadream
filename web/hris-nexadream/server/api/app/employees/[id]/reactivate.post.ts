export default defineEventHandler(event => reactivateEmployee(event, getRouterParam(event, 'id') ?? ''))
