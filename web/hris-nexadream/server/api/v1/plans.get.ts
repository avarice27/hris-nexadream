export default defineApiV1Handler(async (event) => {
  const payload = ok(await publicV1Plans())
  if (handleETag(event, payload)) return null
  return payload
})
