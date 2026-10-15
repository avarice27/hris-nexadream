export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, roleSchema)
  return createRole(event, body)
})
