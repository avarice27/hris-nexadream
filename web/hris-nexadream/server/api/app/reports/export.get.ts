export default defineEventHandler(async (event) => {
  const query = validatedQuery(event, reportExportSchema)
  const csv = await exportReportCsv(event, query)
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="laporan-${query.kind}.csv"`)
  return csv
})
