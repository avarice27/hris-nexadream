export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, acceptStaffInvitationSchema)
  return acceptStaffInvitation(event, body)
})
