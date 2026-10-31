export default defineEventHandler(event => exportDownloadUrl(event, getRouterParam(event, 'id') ?? ''))
