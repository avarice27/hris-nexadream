export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, selfReviewSchema)
  return submitSelfReview(event, getRouterParam(event, 'id') ?? '', body)
})
