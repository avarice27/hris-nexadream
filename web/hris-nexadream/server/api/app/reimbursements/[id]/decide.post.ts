export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, reimbursementDecisionSchema)
  return decideReimbursement(event, getRouterParam(event, 'id') ?? '', body)
})
