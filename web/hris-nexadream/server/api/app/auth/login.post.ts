export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, loginSchema)
  return loginWithPassword(event, 'tenant', body)
})
