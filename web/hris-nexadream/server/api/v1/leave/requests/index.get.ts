export default defineApiV1Handler(event => listLeaveRequests(event, validatedQuery(event, leaveListSchema)), { apiKey: true })
