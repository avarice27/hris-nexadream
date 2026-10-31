export default defineEventHandler(async event => createExportJob(event, await readValidatedJson(event, exportCreateSchema)))
