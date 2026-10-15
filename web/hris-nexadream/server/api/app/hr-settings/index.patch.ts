export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, hrSettingsSchema)
  return updateHrSettings(event, body)
})
