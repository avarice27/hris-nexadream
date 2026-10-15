export default defineEventHandler(event => adminListApiClients(event, validatedQuery(event, adminApiClientListSchema)))
