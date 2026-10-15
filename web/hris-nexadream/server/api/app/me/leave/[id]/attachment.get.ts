export default defineEventHandler(event => leaveAttachmentUrl(event, getRouterParam(event, 'id') ?? ''))
