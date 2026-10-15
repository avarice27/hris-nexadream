export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, decisionSchema)
  return decideCorrection(event, getRouterParam(event, 'id') ?? '', body)
})
