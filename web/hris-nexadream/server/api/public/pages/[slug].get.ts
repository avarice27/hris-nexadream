export default defineEventHandler(event => publicPage(getRouterParam(event, 'slug') ?? ''))
