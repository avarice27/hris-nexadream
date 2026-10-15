export default defineEventHandler(event => getReview(event, getRouterParam(event, 'id') ?? ''))
