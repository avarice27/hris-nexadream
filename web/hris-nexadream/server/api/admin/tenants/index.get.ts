export default defineEventHandler(event => adminListTenants(event, validatedQuery(event, tenantListSchema)))
