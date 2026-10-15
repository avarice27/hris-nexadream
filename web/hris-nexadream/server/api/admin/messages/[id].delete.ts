export default defineEventHandler(event => deleteMessage(event, getRouterParam(event, 'id') ?? ''))
