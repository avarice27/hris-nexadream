export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, leaveRequestSchema)
  return createMyLeaveRequest(event, body)
})
