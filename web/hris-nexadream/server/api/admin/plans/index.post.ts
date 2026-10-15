export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, planSchema)
  return adminCreatePlan(event, body)
})
