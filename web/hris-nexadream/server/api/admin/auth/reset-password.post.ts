export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, resetPasswordSchema)
  return applyPasswordReset(event, 'platform', body.token, body.password)
})
