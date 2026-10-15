export default defineEventHandler(event => adminListWebhookEvents(event, validatedQuery(event, webhookEventListSchema)))
