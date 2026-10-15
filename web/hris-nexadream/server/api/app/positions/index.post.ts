export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, positionSchema)
  return createPosition(event, body)
})
