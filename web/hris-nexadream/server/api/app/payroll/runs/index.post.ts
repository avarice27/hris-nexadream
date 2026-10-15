export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, runCreateSchema)
  return createPayrollRun(event, body)
})
