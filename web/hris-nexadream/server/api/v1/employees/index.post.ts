export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, employeeCreateSchema)
  return createEmployee(event, body)
}, { apiKey: true })
