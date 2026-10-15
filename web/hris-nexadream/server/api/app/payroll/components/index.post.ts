export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, componentSchema)
  return createSalaryComponent(event, body)
})
