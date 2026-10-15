export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, loginSchema)
  return loginWithPassword(event, 'platform', body)
})
