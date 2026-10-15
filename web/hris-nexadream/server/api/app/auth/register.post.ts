export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, registrationSchema)
  return registerOwner(event, body)
})
