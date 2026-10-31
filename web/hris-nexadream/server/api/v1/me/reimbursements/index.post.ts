export default defineApiV1Handler(async event => createReimbursement(event, { ...(await readValidatedJson(event, reimbursementSchema)), employeeId: undefined }))
