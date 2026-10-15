export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, assignmentSchema)
  return assignShifts(event, body)
})
