export default defineEventHandler(event => adminTenantDetail(event, getRouterParam(event, 'id') ?? ''))
