export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, impersonationSchema)
  return impersonateTenantUser(event, getRouterParam(event, 'id') ?? '', body)
})
