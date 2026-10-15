export default defineEventHandler(event => listTenantPayments(event, validatedQuery(event, paymentListSchema)))
