export default defineEventHandler(event => listReviews(event, getRouterParam(event, 'id') ?? ''))
