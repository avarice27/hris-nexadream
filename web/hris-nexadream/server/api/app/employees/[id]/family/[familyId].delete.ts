export default defineEventHandler(event => deleteFamily(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'familyId') ?? ''))
