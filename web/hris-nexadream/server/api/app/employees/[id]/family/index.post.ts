export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, familySchema)
  return createFamily(event, getRouterParam(event, 'id') ?? '', body)
})
