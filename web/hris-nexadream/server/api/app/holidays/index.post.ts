export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, holidaySchema)
  return createHoliday(event, body)
})
