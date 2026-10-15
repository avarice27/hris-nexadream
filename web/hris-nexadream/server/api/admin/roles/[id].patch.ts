export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, roleUpdateSchema)
  return updateRole(event, getRouterParam(event, 'id') ?? '', body)
})
