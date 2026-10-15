export default defineEventHandler(event => inviteEmployeeToEss(event, getRouterParam(event, 'id') ?? ''))
