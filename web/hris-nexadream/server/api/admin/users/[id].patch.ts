export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, staffUpdateSchema)
  return updateStaff(event, getRouterParam(event, 'id') ?? '', body)
})
