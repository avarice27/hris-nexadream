export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, acceptInvitationSchema)
  return acceptInvitation(event, body)
})
