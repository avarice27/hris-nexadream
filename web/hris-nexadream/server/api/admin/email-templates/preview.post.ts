export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, emailTemplatePreviewSchema)
  return previewEmailTemplate(event, body)
})
