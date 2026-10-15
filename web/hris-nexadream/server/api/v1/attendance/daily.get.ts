export default defineApiV1Handler(event => dailyAttendance(event, validatedQuery(event, dailyQuerySchema)), { apiKey: true })
