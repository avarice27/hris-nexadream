export default defineEventHandler(async event => ({ items: await adminMenusFor(event) }))
