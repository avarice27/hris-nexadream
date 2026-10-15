export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, terminationSchema)
  return terminateEmployee(event, getRouterParam(event, 'id') ?? '', body)
})
