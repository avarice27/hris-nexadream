export default defineApiV1Handler(event => attendanceReport(event, validatedQuery(event, reportRangeSchema)), { apiKey: true })
