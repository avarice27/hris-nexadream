export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, loginSchema)
  return loginWithPassword(event, 'tenant', body)
})
