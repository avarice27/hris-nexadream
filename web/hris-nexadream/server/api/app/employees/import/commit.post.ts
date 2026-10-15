export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, importSchema)
  return commitEmployeeImport(event, body)
})
