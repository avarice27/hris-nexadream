export default defineEventHandler(event => markNotificationRead(event, 'platform', getRouterParam(event, 'id') ?? ''))
