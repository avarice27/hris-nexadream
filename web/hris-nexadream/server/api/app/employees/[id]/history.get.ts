export default defineEventHandler(event => employmentHistory(event, getRouterParam(event, 'id') ?? ''))
