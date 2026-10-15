export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, menuSchema)
  return createMenu(event, body)
})
