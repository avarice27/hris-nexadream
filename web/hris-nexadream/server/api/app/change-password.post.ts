export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, changePasswordSchema)
  return changePassword(event, 'tenant', body)
})
