export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, shiftSchema)
  return createShift(event, body)
})
