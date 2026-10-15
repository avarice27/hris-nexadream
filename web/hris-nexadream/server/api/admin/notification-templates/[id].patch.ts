export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, notificationTemplateUpdateSchema)
  return updateNotificationTemplate(event, getRouterParam(event, 'id') ?? '', body)
})
