export default defineApiV1Handler(async (event) => {
  const body = await readValidatedJson(event, decisionSchema)
  return decideLeave(event, getRouterParam(event, 'id') ?? '', body)
})
