export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, taxInvoiceNumberSchema)
  return adminSetTaxInvoiceNumber(event, getRouterParam(event, 'id') ?? '', body)
})
