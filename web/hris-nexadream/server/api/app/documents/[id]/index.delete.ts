export default defineEventHandler(event => deleteDocument(event, getRouterParam(event, 'id') ?? ''))
