export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, shiftSchema.partial())
  return updateShift(event, getRouterParam(event, 'id') ?? '', body)
})
