export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, planUpdateSchema)
  return adminUpdatePlan(event, getRouterParam(event, 'id') ?? '', body)
})
