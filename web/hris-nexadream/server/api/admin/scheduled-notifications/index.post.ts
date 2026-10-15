export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, broadcastSchema)
  return createBroadcast(event, body)
})
