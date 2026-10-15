export default defineEventHandler(event => cancelMyCorrection(event, getRouterParam(event, 'id') ?? ''))
