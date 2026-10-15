export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, referenceUpsertSchema)
  return upsertReferenceData(event, body)
})
