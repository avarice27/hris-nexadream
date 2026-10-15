export default defineEventHandler(event => adminReportSummary(event, validatedQuery(event, reportQuerySchema)))
