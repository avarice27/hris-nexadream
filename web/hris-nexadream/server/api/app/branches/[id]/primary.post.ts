export default defineEventHandler(event => setPrimaryBranch(event, getRouterParam(event, 'id') ?? ''))
