export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, contactSchema)
  return submitContactMessage(event, body)
})
