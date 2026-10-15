export default defineEventHandler(event => employeeAttendanceCalendar(event, getRouterParam(event, 'id') ?? '', validatedQuery(event, rangeSchema)))
