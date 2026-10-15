export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, decisionSchema)
  return decideLeave(event, getRouterParam(event, 'id') ?? '', body)
})
