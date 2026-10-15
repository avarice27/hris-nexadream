export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, resetPasswordSchema)
  return applyPasswordReset(event, 'tenant', body.token, body.password)
})
