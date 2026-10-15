export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, branchSchema)
  return createBranch(event, body)
})
