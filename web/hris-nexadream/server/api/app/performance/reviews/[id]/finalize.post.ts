export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, finalizeSchema)
  return finalizeReview(event, getRouterParam(event, 'id') ?? '', body)
})
