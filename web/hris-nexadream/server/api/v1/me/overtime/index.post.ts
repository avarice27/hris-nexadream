export default defineApiV1Handler(async event => createOvertime(event, { ...(await readValidatedJson(event, overtimeSchema)), employeeId: undefined }))
