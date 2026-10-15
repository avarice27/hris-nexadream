export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, onboardingSchema)
  return completeOnboarding(event, body)
})
