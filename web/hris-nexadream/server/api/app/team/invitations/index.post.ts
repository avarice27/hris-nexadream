export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, inviteMemberSchema)
  return inviteMember(event, body)
})
