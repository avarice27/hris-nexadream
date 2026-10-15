export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, employmentChangeSchema)
  return changeEmployment(event, getRouterParam(event, 'id') ?? '', body)
})
