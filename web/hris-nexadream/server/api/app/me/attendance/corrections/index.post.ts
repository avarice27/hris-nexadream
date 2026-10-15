export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, correctionSchema)
  return requestCorrection(event, body)
})
