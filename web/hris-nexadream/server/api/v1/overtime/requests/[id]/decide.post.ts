export default defineApiV1Handler(async event => decideOvertime(event, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, decisionSchema)))
