export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, salarySchema)
  return setSalary(event, getRouterParam(event, 'id') ?? '', body)
})
