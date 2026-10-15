import type { H3Event } from 'h3'
import { z } from 'zod'
import { EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_HEADERS, EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_STATUSES, isValidNik } from '#shared/utils/hr'
import { isValidNpwp, digitsOnly } from '#shared/utils/identifiers'
import { isPtkpStatus } from '#shared/utils/payroll-rules'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import { dateKeyToDb, dbDateToKey, isDateKey } from '#shared/utils/timezone'
import { parseCsv, toCsv } from '#shared/utils/csv'
import { EMPLOYMENT_STATUS_META } from '#shared/utils/status'

// Impor karyawan: pratinjau lalu simpan dengan SATU lintasan validasi yang sama (18 §1.7).
// Impor menulis data, bukan aktivitas: tanpa notifikasi, dicap importBatchId, jumlah statement tetap.

export const importSchema = z.object({ csv: z.string().min(1, 'File kosong.').max(2_000_000, 'File terlalu besar (maks. 2 MB).') })

const TYPE_ALIASES: Record<string, string> = {
  tetap: 'permanent', pkwtt: 'permanent', permanent: 'permanent',
  kontrak: 'contract', pkwt: 'contract', contract: 'contract',
  magang: 'internship', internship: 'internship',
  harian: 'daily', daily: 'daily',
  lepas: 'freelance', freelance: 'freelance'
}

interface ParsedRow {
  line: number
  employeeNumber: string | null
  fullName: string
  email: string | null
  phone: string | null
  gender: 'male' | 'female' | null
  birthDate: string | null
  joinDate: string
  employmentType: string
  branchId: string
  branchName: string
  departmentName: string | null
  positionName: string | null
  ptkpStatus: string
  nik: string | null
  npwp: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
  baseSalary: number | null
}

async function analyse(tenantId: string, branchScope: string[] | null, csv: string) {
  const rows = parseCsv(csv)
  if (rows.length < 2) throw httpError(400, 'VALIDATION_FAILED', 'File tidak berisi data. Gunakan templat yang disediakan.')
  const header = rows[0]!.map(h => h.toLowerCase())
  // Kolom dicocokkan dengan judul templat (atau kunci Inggrisnya).
  const index = Object.fromEntries(EMPLOYEE_IMPORT_COLUMNS.map((key) => {
    const i = header.findIndex(h => h === EMPLOYEE_IMPORT_HEADERS[key].toLowerCase() || h === key.toLowerCase())
    return [key, i]
  })) as Record<(typeof EMPLOYEE_IMPORT_COLUMNS)[number], number>
  if (index.fullName < 0 || index.joinDate < 0) throw httpError(400, 'VALIDATION_FAILED', 'Kolom "Nama lengkap" dan "Tanggal masuk" wajib ada. Gunakan templat yang disediakan.')
  if (rows.length - 1 > 1000) throw httpError(400, 'VALIDATION_FAILED', 'Maksimal 1.000 baris per impor.')

  const [branches, departments, positions, existingNumbers, existingEmails] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId, isActive: true, ...(branchScope ? { id: { in: branchScope } } : {}) }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { tenantId }, select: { name: true } }),
    prisma.position.findMany({ where: { tenantId }, select: { name: true } }),
    prisma.employee.findMany({ where: { tenantId }, select: { employeeNumber: true } }),
    prisma.employee.findMany({ where: { tenantId, email: { not: null } }, select: { email: true } })
  ])
  const branchByName = new Map(branches.map(b => [b.name.toLowerCase(), b]))
  const knownDepartments = new Set(departments.map(d => d.name.toLowerCase()))
  const knownPositions = new Set(positions.map(p => p.name.toLowerCase()))
  const takenNumbers = new Set(existingNumbers.map(e => e.employeeNumber.toLowerCase()))
  const takenEmails = new Set(existingEmails.map(e => e.email!.toLowerCase()))

  const result: Array<{ line: number, fullName: string, errors: string[], row: ParsedRow | null }> = []
  const newDepartments = new Set<string>()
  const newPositions = new Set<string>()

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const get = (key: (typeof EMPLOYEE_IMPORT_COLUMNS)[number]) => (index[key] >= 0 ? (cells[index[key]] ?? '').trim() : '')
    const errors: string[] = []
    const fullName = get('fullName')
    if (fullName.length < 2) errors.push('Nama wajib diisi.')
    const employeeNumber = get('employeeNumber') || null
    if (employeeNumber) {
      if (!/^[A-Za-z0-9._-]{1,30}$/.test(employeeNumber)) errors.push('NIP tidak valid.')
      else if (takenNumbers.has(employeeNumber.toLowerCase())) errors.push('NIP sudah dipakai.')
      else takenNumbers.add(employeeNumber.toLowerCase())
    }
    const email = get('email').toLowerCase() || null
    if (email) {
      if (!z.email().safeParse(email).success) errors.push('Email tidak valid.')
      else if (takenEmails.has(email)) errors.push('Email sudah dipakai karyawan lain.')
      else takenEmails.add(email)
    }
    const phoneRaw = get('phone')
    if (phoneRaw && !isValidIndonesianPhone(phoneRaw)) errors.push('No HP tidak valid.')
    const genderRaw = get('gender').toUpperCase()
    const gender = genderRaw === 'L' ? 'male' : genderRaw === 'P' ? 'female' : null
    if (genderRaw && !gender) errors.push('Jenis kelamin isi L atau P.')
    const birthDate = get('birthDate') || null
    if (birthDate && !isDateKey(birthDate)) errors.push('Tanggal lahir harus YYYY-MM-DD.')
    const joinDate = get('joinDate')
    if (!isDateKey(joinDate)) errors.push('Tanggal masuk harus YYYY-MM-DD.')
    const typeRaw = get('employmentType').toLowerCase()
    const employmentType = typeRaw ? TYPE_ALIASES[typeRaw] : 'permanent'
    if (!employmentType) errors.push('Jenis karyawan tidak dikenal.')
    const branchName = get('branchName')
    const branch = branchName ? branchByName.get(branchName.toLowerCase()) : (branches.length === 1 ? branches[0] : undefined)
    if (!branch) errors.push(branchName ? `Kantor "${branchName}" tidak ditemukan.` : 'Kantor wajib diisi.')
    const departmentName = get('departmentName') || null
    if (departmentName && !knownDepartments.has(departmentName.toLowerCase())) newDepartments.add(departmentName)
    const positionName = get('positionName') || null
    if (positionName && !knownPositions.has(positionName.toLowerCase())) newPositions.add(positionName)
    const ptkp = (get('ptkpStatus') || 'TK0').toUpperCase().replace('/', '')
    if (!isPtkpStatus(ptkp)) errors.push('PTKP harus TK0–TK3 atau K0–K3.')
    const nik = digitsOnly(get('nik')) || null
    if (nik && !isValidNik(nik)) errors.push('NIK harus 16 digit.')
    const npwp = digitsOnly(get('npwp')) || null
    if (npwp && !isValidNpwp(npwp)) errors.push('NPWP harus 15/16 digit.')
    const bankAccountNumber = digitsOnly(get('bankAccountNumber')) || null
    const salaryRaw = get('baseSalary').replace(/[.\s]/g, '').replace(',', '.')
    const baseSalary = salaryRaw ? Number(salaryRaw) : null
    if (salaryRaw && (!Number.isFinite(baseSalary) || (baseSalary ?? 0) < 0)) errors.push('Gaji pokok harus angka.')

    result.push({
      line,
      fullName,
      errors,
      row: errors.length
        ? null
        : {
            line, employeeNumber, fullName, email, phone: phoneRaw ? normalizeIndonesianPhone(phoneRaw) : null, gender, birthDate, joinDate,
            employmentType: employmentType!, branchId: branch!.id, branchName: branch!.name, departmentName, positionName, ptkpStatus: ptkp,
            nik, npwp, bankName: get('bankName') || null, bankAccountNumber, bankAccountName: get('bankAccountName') || null, baseSalary
          }
    })
  })

  const valid = result.filter(r => r.row).map(r => r.row!)
  const ent = await getEntitlements(tenantId)
  const used = await countedEmployees(tenantId)
  const overLimit = ent.limits.employees !== -1 && used + valid.length > ent.limits.employees
  return {
    rows: result.map(r => ({ line: r.line, fullName: r.fullName, errors: r.errors })),
    valid,
    validCount: valid.length,
    errorCount: result.length - valid.length,
    newDepartments: [...newDepartments],
    newPositions: [...newPositions],
    limit: { used, max: ent.limits.employees, overLimit }
  }
}

export async function previewEmployeeImport(event: H3Event, input: z.infer<typeof importSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  await requireEntitlement(event, 'import')
  const { valid: _valid, ...summary } = await analyse(ctx.tenantId, ctx.branchIds, input.csv)
  return summary
}

export async function commitEmployeeImport(event: H3Event, input: z.infer<typeof importSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  await requireEntitlement(event, 'import')
  const analysis = await analyse(ctx.tenantId, ctx.branchIds, input.csv)
  if (analysis.errorCount) throw httpError(400, 'VALIDATION_FAILED', `${analysis.errorCount} baris masih bermasalah. Perbaiki lalu unggah ulang.`)
  if (!analysis.validCount) throw httpError(400, 'VALIDATION_FAILED', 'Tidak ada baris untuk diimpor.')
  if (analysis.limit.overLimit) {
    throw httpError(402, 'LIMIT_REACHED', `Impor ini melebihi batas ${analysis.limit.max} karyawan pada paket Anda. Upgrade untuk menambah lagi.`, { limit: 'employees', max: analysis.limit.max, current: analysis.limit.used })
  }
  const batchId = `imp_${randomToken(8)}`
  const rows = analysis.valid
  const needNumbers = rows.filter(r => !r.employeeNumber).length

  const created = await prisma.$transaction(async (tx) => {
    if (analysis.newDepartments.length) await tx.department.createMany({ data: analysis.newDepartments.map(name => ({ tenantId: ctx.tenantId, name })), skipDuplicates: true })
    if (analysis.newPositions.length) await tx.position.createMany({ data: analysis.newPositions.map(name => ({ tenantId: ctx.tenantId, name })), skipDuplicates: true })
    const [departments, positions] = await Promise.all([
      tx.department.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } }),
      tx.position.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } })
    ])
    const depId = new Map(departments.map(d => [d.name.toLowerCase(), d.id]))
    const posId = new Map(positions.map(p => [p.name.toLowerCase(), p.id]))
    // Cadangkan rentang NIP otomatis dalam satu statement.
    let nextNumber = 0
    if (needNumbers) {
      await syncEmployeeNumberSequence(tx, ctx.tenantId)
      const reserved = await tx.$queryRaw<Array<{ lastValue: number }>>`
        INSERT INTO "document_sequences" ("tenantId", "prefix", "period", "lastValue") VALUES (${ctx.tenantId}, 'EMP', 'all', ${needNumbers})
        ON CONFLICT ("tenantId", "prefix", "period") DO UPDATE SET "lastValue" = "document_sequences"."lastValue" + ${needNumbers}
        RETURNING "lastValue"`
      nextNumber = Number(reserved[0]!.lastValue) - needNumbers + 1
    }
    const employees = await tx.employee.createManyAndReturn({
      data: rows.map(r => ({
        tenantId: ctx.tenantId,
        employeeNumber: r.employeeNumber ?? `EMP-${String(nextNumber++).padStart(4, '0')}`,
        fullName: r.fullName, email: r.email, phone: r.phone, gender: r.gender, birthDate: r.birthDate ? dateKeyToDb(r.birthDate) : null,
        joinDate: dateKeyToDb(r.joinDate), employmentType: r.employmentType as 'permanent', status: 'active' as const,
        branchId: r.branchId, departmentId: r.departmentName ? depId.get(r.departmentName.toLowerCase()) ?? null : null,
        positionId: r.positionName ? posId.get(r.positionName.toLowerCase()) ?? null : null, ptkpStatus: r.ptkpStatus,
        nikEncrypted: encryptHr(r.nik), npwpEncrypted: encryptHr(r.npwp), bankName: r.bankName, bankAccountNumberEncrypted: encryptHr(r.bankAccountNumber), bankAccountName: r.bankAccountName,
        importBatchId: batchId
      })),
      select: { id: true, joinDate: true, branchId: true, departmentId: true, positionId: true, employmentType: true }
    })
    await tx.employmentHistory.createMany({
      data: employees.map((e, i) => ({
        tenantId: ctx.tenantId, employeeId: e.id, effectiveFrom: e.joinDate, branchId: e.branchId, departmentId: e.departmentId, positionId: e.positionId,
        employmentType: e.employmentType, status: 'active' as const, branchName: rows[i]!.branchName, departmentName: rows[i]!.departmentName, positionName: rows[i]!.positionName,
        note: 'Impor data', createdById: ctx.user.id
      }))
    })
    const salaries = employees.map((e, i) => ({ e, salary: rows[i]!.baseSalary })).filter(x => x.salary !== null && x.salary > 0)
    if (salaries.length) {
      await tx.employeeSalary.createMany({
        data: salaries.map(({ e, salary }) => ({ tenantId: ctx.tenantId, employeeId: e.id, effectiveFrom: e.joinDate, dataEncrypted: encryptHrJson({ baseSalary: salary, items: [] }), note: 'Impor data', createdById: ctx.user.id }))
      })
    }
    return employees.length
  }, { timeout: 30_000 })

  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, { audience: 'tenant', action: 'employee.import', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'import_batch', targetId: batchId, metadata: { count: created } })
  return { created, batchId }
}

export function employeeImportTemplate(): string {
  return toCsv(EMPLOYEE_IMPORT_COLUMNS.map(k => EMPLOYEE_IMPORT_HEADERS[k]), [[
    'EMP-0101', 'Siti Rahmawati', 'siti@contoh.co.id', '081234567890', 'P', '1995-04-12', '2024-01-08', 'tetap',
    'Kantor Pusat', 'Keuangan', 'Staf Akuntansi', 'TK0', '', '', 'BCA', '', 'Siti Rahmawati', '6500000'
  ]])
}

export const employeeExportSchema = z.object({ status: z.enum([...EMPLOYMENT_STATUSES, 'current']).optional() })

/** Ekspor CSV tanpa data sensitif (NIK, NPWP, rekening, gaji tidak pernah ikut). */
export async function exportEmployeesCsv(event: H3Event, query: z.infer<typeof employeeExportSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.read')
  await requireEntitlement(event, 'export')
  const scope = await visibleEmployeesWhere(event, ctx)
  const status = query.status === 'current' ? { in: ['active', 'probation', 'on_leave'] as Array<'active'> } : query.status
  const rows = await prisma.employee.findMany({
    where: { AND: [scope, status ? { status } : {}] },
    orderBy: { fullName: 'asc' },
    take: 10_000,
    include: { branch: { select: { name: true } }, department: { select: { name: true } }, position: { select: { name: true } }, manager: { select: { fullName: true } } }
  })
  await recordAudit(event, { audience: 'tenant', action: 'employee.export', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'employee', targetId: 'all', metadata: { count: rows.length } })
  return toCsv(
    ['NIP', 'Nama lengkap', 'Email', 'No HP', 'Kantor', 'Departemen', 'Jabatan', 'Atasan', 'Jenis', 'Status', 'Tanggal masuk', 'Kontrak berakhir', 'Tanggal berhenti'],
    rows.map(e => [
      e.employeeNumber, e.fullName, e.email, e.phone, e.branch.name, e.department?.name, e.position?.name, e.manager?.fullName,
      EMPLOYMENT_TYPE_LABELS[e.employmentType], EMPLOYMENT_STATUS_META[e.status]?.label ?? e.status, dbDateToKey(e.joinDate),
      e.contractEndDate ? dbDateToKey(e.contractEndDate) : '', e.endDate ? dbDateToKey(e.endDate) : ''
    ])
  )
}
