export default defineEventHandler(event => listDocuments(event, validatedQuery(event, documentListSchema)))
