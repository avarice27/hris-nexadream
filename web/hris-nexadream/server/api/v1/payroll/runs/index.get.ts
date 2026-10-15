export default defineApiV1Handler(event => listPayrollRuns(event, validatedQuery(event, listQuerySchema)), { apiKey: true })
