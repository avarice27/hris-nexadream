export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, updateMemberSchema)
  return updateMember(event, getRouterParam(event, 'id') ?? '', body)
})
