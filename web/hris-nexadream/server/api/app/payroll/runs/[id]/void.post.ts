export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, voidSchema)
  return voidPayrollRun(event, getRouterParam(event, 'id') ?? '', body)
})
