export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, goalsSchema)
  return updateReviewGoals(event, getRouterParam(event, 'id') ?? '', body)
})
