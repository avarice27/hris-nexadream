export default defineEventHandler(event => attendanceReport(event, validatedQuery(event, reportRangeSchema)))
