export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, planOverrideSchema)
  return overrideTenantPlan(event, getRouterParam(event, 'id') ?? '', body)
})
