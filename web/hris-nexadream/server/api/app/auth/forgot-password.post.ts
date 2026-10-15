export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, forgotPasswordSchema)
  return requestPasswordReset(event, 'tenant', body.email)
})
