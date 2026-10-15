export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, branchUpdateSchema)
  return updateBranch(event, getRouterParam(event, 'id') ?? '', body)
})
