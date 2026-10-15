export default defineEventHandler(event => markNotificationRead(event, 'tenant', getRouterParam(event, 'id') ?? ''))
