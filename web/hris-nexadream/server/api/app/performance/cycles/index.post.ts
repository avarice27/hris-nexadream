export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, cycleSchema)
  return createCycle(event, body)
})
