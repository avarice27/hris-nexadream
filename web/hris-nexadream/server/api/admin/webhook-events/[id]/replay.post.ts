export default defineEventHandler(event => replayWebhookEvent(event, getRouterParam(event, 'id') ?? ''))
