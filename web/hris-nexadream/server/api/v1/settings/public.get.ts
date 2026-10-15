export default defineApiV1Handler(async (event) => {
  const payload = ok(await publicV1Settings())
  if (handleETag(event, payload)) return null
  return payload
}, { skipVersionGate: true })
