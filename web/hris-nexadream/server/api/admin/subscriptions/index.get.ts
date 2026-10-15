export default defineEventHandler(event => adminListSubscriptions(event, validatedQuery(event, adminSubscriptionListSchema)))
