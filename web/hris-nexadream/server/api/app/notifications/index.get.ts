export default defineEventHandler(event => listNotifications(event, 'tenant', validatedQuery(event, notificationListSchema)))
