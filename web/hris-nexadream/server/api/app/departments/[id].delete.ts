export default defineEventHandler(event => deleteDepartment(event, getRouterParam(event, 'id') ?? ''))
