export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, employeeUpdateSchema)
  return updateEmployee(event, getRouterParam(event, 'id') ?? '', body)
}, { apiKey: true })
