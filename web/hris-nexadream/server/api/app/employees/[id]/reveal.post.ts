export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, revealSchema)
  return revealEmployeeSensitive(event, getRouterParam(event, 'id') ?? '', body)
})
