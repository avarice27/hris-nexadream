export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, leaveRequestSchema)
  return createLeaveRequestFor(event, body)
})
