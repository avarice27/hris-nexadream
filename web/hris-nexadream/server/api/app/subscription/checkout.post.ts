export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, checkoutSchema)
  return startCheckout(event, body)
})
