export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, familySchema.partial())
  return updateFamily(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'familyId') ?? '', body)
})
