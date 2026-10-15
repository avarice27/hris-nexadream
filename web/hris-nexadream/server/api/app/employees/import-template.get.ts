export default defineEventHandler(async (event) => {
  await requireTenantAbility(event, 'employees.write')
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="templat-impor-karyawan.csv"')
  return employeeImportTemplate()
})
