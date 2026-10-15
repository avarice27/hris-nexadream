export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, selectBranchesSchema)
  return selectActiveBranches(event, body)
})
