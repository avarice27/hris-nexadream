export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, departmentSchema)
  return createDepartment(event, body)
})
