export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, suspendSchema)
  return suspendTenant(event, getRouterParam(event, 'id') ?? '', body)
})
