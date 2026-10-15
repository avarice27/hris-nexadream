export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, pageSchema)
  return createPage(event, body)
})
