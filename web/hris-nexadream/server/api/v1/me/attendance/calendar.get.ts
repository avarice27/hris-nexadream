export default defineApiV1Handler(event => myAttendanceCalendar(event, validatedQuery(event, rangeSchema)))
