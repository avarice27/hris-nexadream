export default defineApiV1Handler(async event => ok(await listApiKeys(event)))
