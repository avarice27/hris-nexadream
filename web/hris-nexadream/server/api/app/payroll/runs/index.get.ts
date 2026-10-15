export default defineEventHandler(event => listPayrollRuns(event, validatedQuery(event, listQuerySchema)))
