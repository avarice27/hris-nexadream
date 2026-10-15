export default defineEventHandler(event => dailyAttendance(event, validatedQuery(event, dailyQuerySchema)))
