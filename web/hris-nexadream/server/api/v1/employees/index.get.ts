export default defineApiV1Handler(event => listEmployees(event, validatedQuery(event, employeeListSchema)), { apiKey: true })
