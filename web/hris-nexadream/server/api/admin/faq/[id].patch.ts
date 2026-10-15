export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, faqUpdateSchema)
  return updateFaq(event, getRouterParam(event, 'id') ?? '', body)
})
