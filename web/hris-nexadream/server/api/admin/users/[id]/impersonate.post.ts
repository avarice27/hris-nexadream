export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, impersonationSchema)
  return impersonateStaff(event, getRouterParam(event, 'id') ?? '', body)
})
