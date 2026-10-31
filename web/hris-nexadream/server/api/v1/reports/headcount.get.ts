export default defineApiV1Handler(event => headcountReport(event, validatedQuery(event, reportRangeSchema)), { apiKey: true })
