export default defineEventHandler(event => listAuditLogs(event, validatedQuery(event, auditListSchema)))
