export default defineEventHandler(event => stepExportJob(event, getRouterParam(event, 'id') ?? ''))
