export default defineEventHandler(event => revokeEssAccess(event, getRouterParam(event, 'id') ?? ''))
