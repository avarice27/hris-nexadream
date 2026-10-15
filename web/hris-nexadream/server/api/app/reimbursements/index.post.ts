export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, reimbursementSchema)
  return createReimbursement(event, body)
})
