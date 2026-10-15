export default defineEventHandler(event => softDeleteTenant(event, getRouterParam(event, 'id') ?? ''))
