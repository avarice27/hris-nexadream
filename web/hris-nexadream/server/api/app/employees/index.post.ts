export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, employeeCreateSchema)
  return createEmployee(event, body)
})
