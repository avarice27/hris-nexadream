export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, clockSchema)
  return clockOut(event, body)
})
