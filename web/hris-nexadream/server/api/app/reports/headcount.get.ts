export default defineEventHandler(event => headcountReport(event, validatedQuery(event, reportRangeSchema)))
