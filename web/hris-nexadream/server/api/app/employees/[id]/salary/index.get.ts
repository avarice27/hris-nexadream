export default defineEventHandler(event => getSalaryHistory(event, getRouterParam(event, 'id') ?? ''))
