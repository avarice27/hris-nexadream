import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { kind } = validatedQuery(event, z.object({ kind: z.enum(['summary', 'bank']).default('summary') }))
  const csv = await exportPayrollRun(event, getRouterParam(event, 'id') ?? '', kind)
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="payroll-${kind}.csv"`)
  return csv
})
