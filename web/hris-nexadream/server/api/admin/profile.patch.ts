export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, staffProfileSchema)
  return updateOwnStaffProfile(event, body)
})
