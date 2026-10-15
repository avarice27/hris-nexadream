export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, clockSchema)
  return clockIn(event, body)
})
