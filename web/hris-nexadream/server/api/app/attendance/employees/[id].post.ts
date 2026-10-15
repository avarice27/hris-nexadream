export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, adminAttendanceSchema)
  return adminSetAttendance(event, getRouterParam(event, 'id') ?? '', body)
})
