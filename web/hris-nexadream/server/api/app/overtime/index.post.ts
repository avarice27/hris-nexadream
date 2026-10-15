export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, overtimeSchema)
  return createOvertime(event, body)
})
