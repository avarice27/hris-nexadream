export default defineEventHandler(async (event) => {
  const result = await healthCheck()
  setHeader(event, 'Cache-Control', 'no-store')
  if (!result.ok) setResponseStatus(event, 503)
  return result
})
