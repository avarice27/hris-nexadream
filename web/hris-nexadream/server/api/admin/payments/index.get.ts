export default defineEventHandler(event => adminListPayments(event, validatedQuery(event, adminPaymentListSchema)))
