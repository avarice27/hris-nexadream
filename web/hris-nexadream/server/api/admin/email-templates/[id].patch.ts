export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, emailTemplateUpdateSchema)
  return updateEmailTemplate(event, getRouterParam(event, 'id') ?? '', body)
})
