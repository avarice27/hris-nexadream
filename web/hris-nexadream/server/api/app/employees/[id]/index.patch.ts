export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, employeeUpdateSchema)
  return updateEmployee(event, getRouterParam(event, 'id') ?? '', body)
})
