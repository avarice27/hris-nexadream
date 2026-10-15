export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, componentSchema.partial())
  return updateSalaryComponent(event, getRouterParam(event, 'id') ?? '', body)
})
