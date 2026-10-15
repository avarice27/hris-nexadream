export default defineEventHandler(event => listNotifications(event, 'platform', validatedQuery(event, notificationListSchema)))
