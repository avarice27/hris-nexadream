export default defineApiV1Handler(event => listHolidays(event, validatedQuery(event, holidayListSchema)), { apiKey: true })
