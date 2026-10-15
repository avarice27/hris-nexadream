export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings.read')
  return settingsForAdmin()
})
