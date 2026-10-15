export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, messageUpdateSchema)
  return updateMessageStatus(event, getRouterParam(event, 'id') ?? '', body)
})
