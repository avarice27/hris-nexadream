export default defineEventHandler(event => listStaff(event, validatedQuery(event, staffListSchema)))
