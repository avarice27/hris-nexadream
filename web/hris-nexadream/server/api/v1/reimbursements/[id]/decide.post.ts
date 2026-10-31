export default defineApiV1Handler(async event => decideReimbursement(event, getRouterParam(event, 'id') ?? '', await readValidatedJson(event, reimbursementDecisionSchema)))
