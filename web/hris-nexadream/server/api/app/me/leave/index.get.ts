export default defineEventHandler((event) => {
  const { year } = validatedQuery(event, balanceQuerySchema)
  return myLeave(event, year)
})
