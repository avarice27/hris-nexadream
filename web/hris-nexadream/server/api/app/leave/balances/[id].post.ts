export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, adjustmentSchema)
  return adjustLeaveBalance(event, getRouterParam(event, 'id') ?? '', body)
})
