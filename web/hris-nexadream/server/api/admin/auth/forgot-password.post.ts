export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, forgotPasswordSchema)
  return requestPasswordReset(event, 'platform', body.email)
})
