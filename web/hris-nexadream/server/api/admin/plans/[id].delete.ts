export default defineEventHandler(event => adminDeletePlan(event, getRouterParam(event, 'id') ?? ''))
