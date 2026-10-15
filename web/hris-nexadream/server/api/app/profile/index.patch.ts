export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, profileUpdateSchema)
  return updateTenantProfile(event, body)
})
