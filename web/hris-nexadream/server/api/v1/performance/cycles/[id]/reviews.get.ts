export default defineApiV1Handler(event => listReviews(event, getRouterParam(event, 'id') ?? ''), { apiKey: true })
