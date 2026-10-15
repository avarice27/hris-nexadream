export default defineEventHandler(event => getRoster(event, validatedQuery(event, rosterQuerySchema)))
