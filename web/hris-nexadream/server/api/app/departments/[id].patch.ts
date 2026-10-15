export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, departmentSchema.partial())
  return updateDepartment(event, getRouterParam(event, 'id') ?? '', body)
})
