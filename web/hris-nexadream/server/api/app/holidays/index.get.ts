export default defineEventHandler(event => listHolidays(event, validatedQuery(event, holidayListSchema)))
