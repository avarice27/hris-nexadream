export default defineApiV1Handler(event => employeeAttendanceCalendar(event, getRouterParam(event, 'id') ?? '', validatedQuery(event, rangeSchema)), { apiKey: true })
