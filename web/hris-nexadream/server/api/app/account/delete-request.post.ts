export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, deleteRequestSchema)
  return requestTenantDeletion(event, body)
})
