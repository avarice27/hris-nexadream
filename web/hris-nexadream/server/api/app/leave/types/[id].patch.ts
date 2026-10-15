export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, leaveTypeSchema.partial())
  return updateLeaveType(event, getRouterParam(event, 'id') ?? '', body)
})
