export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, calculateSchema)
  return calculatePayrollChunk(event, getRouterParam(event, 'id') ?? '', body)
})
