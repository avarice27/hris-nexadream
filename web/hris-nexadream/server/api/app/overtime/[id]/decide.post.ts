export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, decisionSchema)
  return decideOvertime(event, getRouterParam(event, 'id') ?? '', body)
})
