export default defineEventHandler(event => listReimbursements(event, validatedQuery(event, requestListSchema)))
