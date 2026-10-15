export default defineEventHandler(event => listLeaveRequests(event, validatedQuery(event, leaveListSchema)))
