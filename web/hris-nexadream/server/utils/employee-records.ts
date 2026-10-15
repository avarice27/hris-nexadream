import type { H3Event } from 'h3'
import { z } from 'zod'
import { FAMILY_RELATIONSHIPS, isValidNik } from '#shared/utils/hr'
import { dateKeyToDb, dbDateToKey } from '#shared/utils/timezone'

// Data turunan karyawan: keluarga (sensitif) dan gaji berlaku-tanggal (sensitif, terenkripsi).

function audit(event: H3Event, ctx: TenantContext, action: string, employeeId: string, metadata?: Record<string, unknown>) {
  return recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'employee', targetId: employeeId, metadata })
}

// --- Keluarga --------------------------------------------------------------

export const familySchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(120),
  relationship: z.enum(FAMILY_RELATIONSHIPS),
  birthDate: dateKeySchema.nullable().optional(),
  nik: z.string().trim().refine(v => v === '' || isValidNik(v), 'NIK harus 16 digit.').nullable().optional(),
  isDependent: z.boolean().optional()
})

export async function listFamily(event: H3Event, employeeId: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.sensitive.read', employeeId)
  await auditSensitiveRead(event, ctx, { employeeId: employee.id, fieldGroup: 'family' })
  const rows = await prisma.employeeFamily.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: 'asc' } })
  return { items: rows.map(r => ({ id: r.id, name: r.name, relationship: r.relationship, birthDate: r.birthDate ? dbDateToKey(r.birthDate) : null, nik: maskIdentifier(decryptHr(r.nikEncrypted)) || null, isDependent: r.isDependent })) }
}

export async function createFamily(event: H3Event, employeeId: string, input: z.infer<typeof familySchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', employeeId)
  const row = await prisma.employeeFamily.create({
    data: { tenantId: ctx.tenantId, employeeId: employee.id, name: input.name, relationship: input.relationship, birthDate: input.birthDate ? dateKeyToDb(input.birthDate) : null, nikEncrypted: encryptHr(input.nik), isDependent: input.isDependent ?? false }
  })
  await audit(event, ctx, 'employee.family_create', employee.id)
  return { id: row.id }
}

export async function updateFamily(event: H3Event, employeeId: string, familyId: string, input: Partial<z.infer<typeof familySchema>>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', employeeId)
  if (!await prisma.employeeFamily.findFirst({ where: { id: familyId, employeeId: employee.id } })) throw notFound('Data keluarga tidak ditemukan.')
  await prisma.employeeFamily.update({
    where: { id: familyId },
    data: {
      name: input.name, relationship: input.relationship, isDependent: input.isDependent,
      birthDate: input.birthDate === undefined ? undefined : (input.birthDate ? dateKeyToDb(input.birthDate) : null),
      nikEncrypted: input.nik === undefined ? undefined : encryptHr(input.nik)
    }
  })
  await audit(event, ctx, 'employee.family_update', employee.id)
  return { success: true }
}

export async function deleteFamily(event: H3Event, employeeId: string, familyId: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', employeeId)
  if (!await prisma.employeeFamily.findFirst({ where: { id: familyId, employeeId: employee.id } })) throw notFound('Data keluarga tidak ditemukan.')
  await prisma.employeeFamily.delete({ where: { id: familyId } })
  await audit(event, ctx, 'employee.family_delete', employee.id)
  return { success: true }
}

// --- Gaji (berlaku-tanggal) -------------------------------------------------

export interface SalaryData {
  baseSalary: number
  items: Array<{ componentId: string, amount: number }>
}

export const salarySchema = z.object({
  effectiveFrom: dateKeySchema,
  baseSalary: moneySchema,
  items: z.array(z.object({ componentId: z.string().min(1), amount: moneySchema })).max(30).default([]),
  note: z.string().trim().max(300).nullable().optional()
})

/** Gaji yang berlaku pada tanggal itu (untuk payroll). */
export async function salaryOn(employeeId: string, onDateKey: string): Promise<SalaryData | null> {
  const row = await prisma.employeeSalary.findFirst({ where: { employeeId, effectiveFrom: { lte: dateKeyToDb(onDateKey) } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] })
  return row ? decryptHrJson<SalaryData | null>(row.dataEncrypted, null) : null
}

export async function getSalaryHistory(event: H3Event, employeeId: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'payroll.read', employeeId)
  await requireEntitlement(event, 'payroll')
  await auditSensitiveRead(event, ctx, { employeeId: employee.id, fieldGroup: 'salary' })
  const [rows, components] = await Promise.all([
    prisma.employeeSalary.findMany({ where: { employeeId: employee.id }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], take: 50 }),
    prisma.salaryComponent.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, kind: true } })
  ])
  const names = new Map(components.map(c => [c.id, c]))
  return {
    items: rows.map((r) => {
      const data = decryptHrJson<SalaryData>(r.dataEncrypted, { baseSalary: 0, items: [] })
      return {
        id: r.id,
        effectiveFrom: dbDateToKey(r.effectiveFrom),
        baseSalary: data.baseSalary,
        items: data.items.map(i => ({ ...i, name: names.get(i.componentId)?.name ?? '(komponen dihapus)', kind: names.get(i.componentId)?.kind ?? 'earning' })),
        note: r.note,
        createdAt: r.createdAt.toISOString()
      }
    })
  }
}

export async function setSalary(event: H3Event, employeeId: string, input: z.infer<typeof salarySchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'payroll.write', employeeId)
  await requireEntitlement(event, 'payroll')
  const ids = [...new Set(input.items.map(i => i.componentId))]
  if (ids.length !== input.items.length) throw httpError(400, 'VALIDATION_FAILED', 'Satu komponen hanya boleh muncul sekali.')
  if (ids.length) {
    const found = await prisma.salaryComponent.count({ where: { tenantId: ctx.tenantId, id: { in: ids }, isActive: true } })
    if (found !== ids.length) throw notFound('Komponen gaji tidak ditemukan atau nonaktif.')
  }
  const data: SalaryData = { baseSalary: input.baseSalary, items: input.items.filter(i => i.amount > 0) }
  const row = await prisma.employeeSalary.create({
    data: { tenantId: ctx.tenantId, employeeId: employee.id, effectiveFrom: dateKeyToDb(input.effectiveFrom), dataEncrypted: encryptHrJson(data), note: input.note ?? null, createdById: ctx.user.id }
  })
  // Nominal tidak pernah masuk log audit.
  await audit(event, ctx, 'employee.salary_set', employee.id, { effectiveFrom: input.effectiveFrom, componentCount: data.items.length })
  return { id: row.id }
}
