export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, impersonationSchema)
  return impersonateTenantOwner(event, getRouterParam(event, 'id') ?? '', body)
})
