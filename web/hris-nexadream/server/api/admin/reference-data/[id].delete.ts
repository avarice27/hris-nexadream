export default defineEventHandler(event => deleteReferenceData(event, getRouterParam(event, 'id') ?? ''))
