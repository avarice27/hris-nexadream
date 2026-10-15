export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, gatewayUpdateSchema)
  return updateGateway(event, getRouterParam(event, 'id') ?? '', body)
})
