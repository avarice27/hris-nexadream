export default defineApiV1Handler(event => myLeave(event, validatedQuery(event, balanceQuerySchema).year))
