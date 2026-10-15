export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, faqSchema)
  return createFaq(event, body)
})
