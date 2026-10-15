export default defineEventHandler(async (event) => {
  const ctx = await requireTenantContext(event)
  const [entitlements, usage] = await Promise.all([getEntitlements(ctx.tenantId), usageSummary(ctx.tenantId)])
  return { ...entitlements, usage }
})
