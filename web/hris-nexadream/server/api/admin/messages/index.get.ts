export default defineEventHandler(event => listMessages(event, validatedQuery(event, messageListSchema)))
