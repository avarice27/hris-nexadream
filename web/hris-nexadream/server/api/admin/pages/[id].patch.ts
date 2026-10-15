export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, pageUpdateSchema)
  return updatePage(event, getRouterParam(event, 'id') ?? '', body)
})
