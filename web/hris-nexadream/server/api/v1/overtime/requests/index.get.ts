export default defineApiV1Handler(event => listOvertime(event, validatedQuery(event, requestListSchema)), { apiKey: true })
