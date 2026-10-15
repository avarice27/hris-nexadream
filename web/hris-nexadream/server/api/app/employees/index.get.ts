export default defineEventHandler(event => listEmployees(event, validatedQuery(event, employeeListSchema)))
