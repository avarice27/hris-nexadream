export default defineEventHandler(event => deleteBranch(event, getRouterParam(event, 'id') ?? ''))
