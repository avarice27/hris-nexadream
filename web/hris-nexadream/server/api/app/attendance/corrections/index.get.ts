export default defineEventHandler(event => listCorrections(event, validatedQuery(event, correctionListSchema)))
