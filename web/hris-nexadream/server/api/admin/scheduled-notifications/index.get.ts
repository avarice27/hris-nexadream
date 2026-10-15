export default defineEventHandler(event => listBroadcasts(event, validatedQuery(event, broadcastListSchema)))
