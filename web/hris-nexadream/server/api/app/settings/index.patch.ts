export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, tenantSettingsSchema)
  return updateTenantSettings(event, body)
})
