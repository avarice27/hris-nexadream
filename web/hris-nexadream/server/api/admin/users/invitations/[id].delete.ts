export default defineEventHandler(event => revokeStaffInvitation(event, getRouterParam(event, 'id') ?? ''))
