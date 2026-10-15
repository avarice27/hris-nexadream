export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, apiKeyCreateSchema)
  return createApiKey(event, body)
})
