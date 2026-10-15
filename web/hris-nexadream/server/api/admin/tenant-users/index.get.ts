export default defineEventHandler(event => listTenantUsers(event, validatedQuery(event, tenantUserListSchema)))
