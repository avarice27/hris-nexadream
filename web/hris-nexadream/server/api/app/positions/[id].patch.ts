export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, positionSchema.partial())
  return updatePosition(event, getRouterParam(event, 'id') ?? '', body)
})
