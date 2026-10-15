export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, menuUpdateSchema)
  return updateMenu(event, getRouterParam(event, 'id') ?? '', body)
})
