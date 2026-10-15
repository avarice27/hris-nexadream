export default defineEventHandler(event => reinstateTenant(event, getRouterParam(event, 'id') ?? ''))
