export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, cycleStatusSchema)
  return setCycleStatus(event, getRouterParam(event, 'id') ?? '', body)
})
