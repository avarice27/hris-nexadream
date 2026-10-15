export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, leaveRequestSchema)
  return createMyLeaveRequest(event, body)
})
