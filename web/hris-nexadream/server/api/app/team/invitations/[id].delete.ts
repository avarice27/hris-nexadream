export default defineEventHandler(event => revokeInvitation(event, getRouterParam(event, 'id') ?? ''))
