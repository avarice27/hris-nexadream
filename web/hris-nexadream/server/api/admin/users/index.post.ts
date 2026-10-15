export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, staffInviteSchema)
  return inviteStaff(event, body)
})
