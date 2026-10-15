export default defineEventHandler(async (event) => {
  const csv = await exportEmployeesCsv(event, validatedQuery(event, employeeExportSchema))
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="karyawan.csv"')
  return csv
})
