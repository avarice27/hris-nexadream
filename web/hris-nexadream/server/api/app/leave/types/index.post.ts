export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, leaveTypeSchema)
  return createLeaveType(event, body)
})
