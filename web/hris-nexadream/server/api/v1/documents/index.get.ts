export default defineApiV1Handler(event => listDocuments(event, validatedQuery(event, documentListSchema)), { apiKey: true })
