export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, markPaidSchema)
  return markPayrollPaid(event, getRouterParam(event, 'id') ?? '', body)
})
