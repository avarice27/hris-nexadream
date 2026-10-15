export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, menuReorderSchema)
  return reorderMenus(event, body)
})
