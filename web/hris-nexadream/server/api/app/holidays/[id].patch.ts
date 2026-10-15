export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, holidaySchema.partial())
  return updateHoliday(event, getRouterParam(event, 'id') ?? '', body)
})
