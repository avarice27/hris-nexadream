export default defineEventHandler((event) => {
  const { year } = validatedQuery(event, balanceQuerySchema)
  return employeeLeaveBalances(event, getRouterParam(event, 'id') ?? '', year)
})
