export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, documentUpdateSchema)
  return updateDocument(event, getRouterParam(event, 'id') ?? '', body)
})
