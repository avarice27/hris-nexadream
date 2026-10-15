export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, apiKeyCreateSchema)
  return createApiKey(event, body)
})
