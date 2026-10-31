import type { H3Event } from 'h3'
import { z } from 'zod'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS, MARITAL_STATUSES, RELIGIONS, isValidNik } from '#shared/utils/hr'
import { isValidNpwp, digitsOnly } from '#shared/utils/identifiers'
import { PTKP_STATUSES, TAX_METHODS } from '#shared/utils/payroll-rules'
import { dateKeyToDb, dbDateToKey, todayKey } from '#shared/utils/timezone'
import { formatDateId } from '#shared/utils/format'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import type { Employee, Prisma } from '~~/generated/prisma/client'

// 11.2 Master karyawan. Data pribadi terenkripsi & tersamar (D7); kantor/departemen/jabatan/atasan/
// jenis/status berlaku-tanggal lewat employment_history (18 §2.1).

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const optionalDate = dateKeySchema.nullable().optional()

const sensitiveFields = {
  nik: z.string().trim().refine(v => v === '' || isValidNik(v), 'NIK harus 16 digit.').nullable().optional(),
  npwp: z.string().trim().refine(v => v === '' || isValidNpwp(v), 'NPWP harus 15 atau 16 digit.').nullable().optional(),
  bpjsKesehatanNumber: z.string().trim().refine(v => v === '' || /^\d{13}$/.test(digitsOnly(v)), 'Nomor BPJS Kesehatan 13 digit.').nullable().optional(),
  bpjsKetenagakerjaanNumber: z.string().trim().refine(v => v === '' || /^\d{11}$/.test(digitsOnly(v)), 'Nomor BPJS Ketenagakerjaan 11 digit.').nullable().optional(),
  bankName: optionalText(60),
  bankAccountNumber: z.string().trim().refine(v => v === '' || /^\d{5,20}$/.test(digitsOnly(v)), 'Nomor rekening 5–20 digit.').nullable().optional(),
  bankAccountName: optionalText(100)
}

const profileFields = {
  fullName: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(120),
  email: z.email('Masukkan alamat email yang valid.').nullable().optional().or(z.literal('')),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP yang valid.').nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  birthPlace: optionalText(80),
  birthDate: optionalDate,
  religion: z.enum(RELIGIONS).nullable().optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
  ptkpStatus: z.enum(PTKP_STATUSES).optional(),
  taxMethod: z.enum(TAX_METHODS).optional(),
  address: optionalText(500),
  probationEndDate: optionalDate,
  contractEndDate: optionalDate,
  shiftId: z.string().nullable().optional(),
  bpjsKesehatanEnrolled: z.boolean().optional(),
  bpjsKetenagakerjaanEnrolled: z.boolean().optional(),
  pensionEnrolled: z.boolean().optional(),
  emergencyContactName: optionalText(100),
  emergencyContactPhone: optionalText(30),
  emergencyContactRelation: optionalText(50),
  ...sensitiveFields
}

export const employeeCreateSchema = z.object({
  ...profileFields,
  employeeNumber: z.string().trim().regex(/^[A-Za-z0-9._-]{1,30}$/, 'NIP hanya huruf, angka, titik, garis bawah, atau tanda hubung.').optional().or(z.literal('')),
  joinDate: dateKeySchema,
  employmentType: z.enum(EMPLOYMENT_TYPES).default('permanent'),
  status: z.enum(['active', 'probation']).default('active'),
  branchId: z.string().min(1, 'Pilih kantor.'),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional()
})

// PATCH: tanpa default (pelajaran fase 7).
export const employeeUpdateSchema = z.object(profileFields).partial()

export const employmentChangeSchema = z.object({
  effectiveFrom: dateKeySchema,
  branchId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  status: z.enum(['active', 'probation', 'on_leave', 'inactive']).optional(),
  note: optionalText(300)
})

export const terminationSchema = z.object({
  endDate: dateKeySchema,
  reason: z.string().trim().min(3, 'Tuliskan alasan berhenti.').max(300)
})

export const employeeListSchema = listQuerySchema.extend({
  status: z.enum([...EMPLOYMENT_STATUSES, 'current']).optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  contract: z.enum(['expiring']).optional()
})

function audit(event: H3Event, ctx: TenantContext, action: string, targetId: string, metadata?: Record<string, unknown>) {
  return recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'employee', targetId, metadata })
}

const keyOrNull = (d: Date | null | undefined) => (d ? dbDateToKey(d) : null)
const dbOrNull = (k: string | null | undefined) => (k ? dateKeyToDb(k) : null)

type EmployeeWithRelations = Employee & {
  branch?: { name: string } | null
  department?: { name: string } | null
  position?: { name: string } | null
  manager?: { id: string, fullName: string } | null
}

export function toEmployeeListItem(e: EmployeeWithRelations) {
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    fullName: e.fullName,
    email: e.email,
    phone: e.phone,
    photoUrl: e.photoUrl,
    status: e.status,
    employmentType: e.employmentType,
    joinDate: dbDateToKey(e.joinDate),
    contractEndDate: keyOrNull(e.contractEndDate),
    branchId: e.branchId,
    branchName: e.branch?.name ?? null,
    departmentName: e.department?.name ?? null,
    positionName: e.position?.name ?? null,
    managerName: e.manager?.fullName ?? null,
    hasLogin: !!e.tenantUserId
  }
}

export async function listEmployees(event: H3Event, query: z.infer<typeof employeeListSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.read')
  const scope = await visibleEmployeesWhere(event, ctx)
  const and: Prisma.EmployeeWhereInput[] = [scope]
  if (query.status === 'current') and.push({ status: { in: ['active', 'probation', 'on_leave'] } })
  else if (query.status) and.push({ status: query.status })
  if (query.branchId) and.push({ branchId: query.branchId })
  if (query.departmentId) and.push({ departmentId: query.departmentId })
  if (query.positionId) and.push({ positionId: query.positionId })
  if (query.contract === 'expiring') {
    const today = todayKey(ctx.tenant.timezone)
    and.push({ status: { notIn: ['terminated'] }, contractEndDate: { gte: dateKeyToDb(today), lte: new Date(dateKeyToDb(today).getTime() + 30 * 86400000) } })
  }
  if (query.search) {
    and.push({ OR: [{ fullName: { contains: query.search, mode: 'insensitive' } }, { employeeNumber: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] })
  }
  const where: Prisma.EmployeeWhereInput = { AND: and }
  const [items, total, counted, entitlements] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { branch: { select: { name: true } }, department: { select: { name: true } }, position: { select: { name: true } }, manager: { select: { id: true, fullName: true } } }
    }),
    prisma.employee.count({ where }),
    countedEmployees(ctx.tenantId),
    getEntitlements(ctx.tenantId)
  ])
  return {
    items: items.map(toEmployeeListItem),
    meta: listMeta(query.page, query.limit, total),
    usage: { used: counted, limit: entitlements.limits.employees }
  }
}

/** Pencarian singkat untuk pemilih (atasan, penerima dokumen…). Minimal 2 karakter. */
export async function searchEmployees(event: H3Event, q: string) {
  const ctx = await requireTenantAbility(event, 'employees.read')
  if (q.trim().length < 2) return { items: [] }
  const rows = await prisma.employee.findMany({
    where: { AND: [await visibleEmployeesWhere(event, ctx), { status: { not: 'terminated' } }, { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { employeeNumber: { contains: q, mode: 'insensitive' } }] }] },
    select: employeeBriefSelect,
    orderBy: { fullName: 'asc' },
    take: 15
  })
  return { items: rows.map(toEmployeeBrief) }
}

function maskedSensitive(e: Employee) {
  return {
    nik: maskIdentifier(decryptHr(e.nikEncrypted)) || null,
    npwp: maskIdentifier(decryptHr(e.npwpEncrypted)) || null,
    bpjsKesehatanNumber: maskIdentifier(decryptHr(e.bpjsKesehatanNumberEncrypted)) || null,
    bpjsKetenagakerjaanNumber: maskIdentifier(decryptHr(e.bpjsKetenagakerjaanNumberEncrypted)) || null,
    bankName: e.bankName,
    bankAccountNumber: maskIdentifier(decryptHr(e.bankAccountNumberEncrypted)) || null,
    bankAccountName: e.bankAccountName
  }
}

export async function getEmployee(event: H3Event, id: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.read', id)
  const full = await prisma.employee.findUniqueOrThrow({
    where: { id: employee.id },
    include: { branch: { select: { name: true, timezone: true } }, department: { select: { name: true } }, position: { select: { name: true } }, manager: { select: { id: true, fullName: true } }, shift: { select: { id: true, name: true } } }
  })
  const canSensitive = canTenantRole(ctx.role, 'employees.sensitive.read')
  const isSelf = full.tenantUserId === ctx.user.id
  let login: { email: string, isActive: boolean, role: string } | null = null
  if (full.tenantUserId) {
    const m = await prisma.tenantMembership.findFirst({ where: { tenantId: ctx.tenantId, tenantUserId: full.tenantUserId }, include: { tenantUser: { select: { email: true } } } })
    if (m) login = { email: m.tenantUser.email, isActive: m.isActive, role: m.role }
  }
  const pendingInvite = full.tenantUserId
    ? null
    : await prisma.tenantInvitation.findFirst({ where: { tenantId: ctx.tenantId, employeeId: full.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, expiresAt: true } })
  return {
    ...toEmployeeListItem(full),
    gender: full.gender,
    birthPlace: full.birthPlace,
    birthDate: keyOrNull(full.birthDate),
    religion: full.religion,
    maritalStatus: full.maritalStatus,
    ptkpStatus: full.ptkpStatus,
    taxMethod: full.taxMethod,
    address: full.address,
    probationEndDate: keyOrNull(full.probationEndDate),
    endDate: keyOrNull(full.endDate),
    terminationReason: full.terminationReason,
    departmentId: full.departmentId,
    positionId: full.positionId,
    managerId: full.managerId,
    shiftId: full.shiftId,
    shiftName: full.shift?.name ?? null,
    branchTimezone: full.branch.timezone,
    bpjsKesehatanEnrolled: full.bpjsKesehatanEnrolled,
    bpjsKetenagakerjaanEnrolled: full.bpjsKetenagakerjaanEnrolled,
    pensionEnrolled: full.pensionEnrolled,
    emergencyContactName: full.emergencyContactName,
    emergencyContactPhone: full.emergencyContactPhone,
    emergencyContactRelation: full.emergencyContactRelation,
    // Selalu tersamar; nilai asli hanya lewat POST …/reveal (diaudit).
    sensitive: canSensitive || isSelf ? maskedSensitive(full) : null,
    canRevealSensitive: canSensitive,
    login,
    pendingInvite: pendingInvite ? { email: pendingInvite.email, expiresAt: pendingInvite.expiresAt.toISOString() } : null
  }
}

export const revealSchema = z.object({ group: z.enum(['identity', 'bank']) })

/** Buka nilai asli satu grup data sensitif. Selalu diaudit; diblokir selama impersonasi. */
export async function revealEmployeeSensitive(event: H3Event, id: string, input: z.infer<typeof revealSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.sensitive.read', id)
  await auditSensitiveRead(event, ctx, { employeeId: employee.id, fieldGroup: input.group })
  if (input.group === 'identity') {
    return {
      nik: decryptHr(employee.nikEncrypted) || null,
      npwp: decryptHr(employee.npwpEncrypted) || null,
      bpjsKesehatanNumber: decryptHr(employee.bpjsKesehatanNumberEncrypted) || null,
      bpjsKetenagakerjaanNumber: decryptHr(employee.bpjsKetenagakerjaanNumberEncrypted) || null
    }
  }
  return { bankName: employee.bankName, bankAccountNumber: decryptHr(employee.bankAccountNumberEncrypted) || null, bankAccountName: employee.bankAccountName }
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------

/** undefined = tidak berubah; '' / null = hapus; nilai = enkripsi. */
function sensitiveData(input: Partial<Record<keyof typeof sensitiveFields, string | null | undefined>>) {
  const enc = (v: string | null | undefined, digits = true) => (v === undefined ? undefined : encryptHr(v ? (digits ? digitsOnly(v) : v) : null))
  return {
    nikEncrypted: enc(input.nik),
    npwpEncrypted: enc(input.npwp),
    bpjsKesehatanNumberEncrypted: enc(input.bpjsKesehatanNumber),
    bpjsKetenagakerjaanNumberEncrypted: enc(input.bpjsKetenagakerjaanNumber),
    bankAccountNumberEncrypted: enc(input.bankAccountNumber),
    bankName: input.bankName === undefined ? undefined : (input.bankName || null),
    bankAccountName: input.bankAccountName === undefined ? undefined : (input.bankAccountName || null)
  }
}

function profileData(input: z.infer<typeof employeeUpdateSchema>) {
  const text = (v: string | null | undefined) => (v === undefined ? undefined : (v || null))
  const date = (v: string | null | undefined) => (v === undefined ? undefined : dbOrNull(v))
  return {
    fullName: input.fullName,
    email: input.email === undefined ? undefined : (input.email ? input.email.toLowerCase() : null),
    phone: input.phone === undefined ? undefined : (input.phone ? normalizeIndonesianPhone(input.phone) : null),
    gender: input.gender,
    birthPlace: text(input.birthPlace),
    birthDate: date(input.birthDate),
    religion: input.religion,
    maritalStatus: input.maritalStatus,
    ptkpStatus: input.ptkpStatus,
    taxMethod: input.taxMethod,
    address: text(input.address),
    probationEndDate: date(input.probationEndDate),
    contractEndDate: date(input.contractEndDate),
    shiftId: input.shiftId,
    bpjsKesehatanEnrolled: input.bpjsKesehatanEnrolled,
    bpjsKetenagakerjaanEnrolled: input.bpjsKetenagakerjaanEnrolled,
    pensionEnrolled: input.pensionEnrolled,
    emergencyContactName: text(input.emergencyContactName),
    emergencyContactPhone: text(input.emergencyContactPhone),
    emergencyContactRelation: text(input.emergencyContactRelation),
    ...sensitiveData(input)
  }
}

/** Validasi relasi organisasi milik tenant yang sama. */
async function assertOrgRefs(tenantId: string, refs: { departmentId?: string | null, positionId?: string | null, shiftId?: string | null, managerId?: string | null }, selfId?: string) {
  const [dep, pos, shift, manager] = await Promise.all([
    refs.departmentId ? prisma.department.findFirst({ where: { id: refs.departmentId, tenantId }, select: { id: true } }) : true,
    refs.positionId ? prisma.position.findFirst({ where: { id: refs.positionId, tenantId }, select: { id: true } }) : true,
    refs.shiftId ? prisma.shift.findFirst({ where: { id: refs.shiftId, tenantId }, select: { id: true } }) : true,
    refs.managerId ? prisma.employee.findFirst({ where: { id: refs.managerId, tenantId }, select: { id: true, managerId: true } }) : true
  ])
  if (!dep) throw notFound('Departemen tidak ditemukan.')
  if (!pos) throw notFound('Jabatan tidak ditemukan.')
  if (!shift) throw notFound('Shift tidak ditemukan.')
  if (!manager) throw notFound('Atasan tidak ditemukan.')
  if (refs.managerId && selfId) {
    if (refs.managerId === selfId) throw httpError(400, 'VALIDATION_FAILED', 'Karyawan tidak bisa menjadi atasan dirinya sendiri.', { field: 'managerId' })
    // Cegah garis pelaporan melingkar.
    let cursor = (manager as { managerId: string | null }).managerId
    for (let depth = 0; cursor && depth < 30; depth++) {
      if (cursor === selfId) throw httpError(400, 'VALIDATION_FAILED', 'Garis pelaporan tidak boleh melingkar.', { field: 'managerId' })
      cursor = (await prisma.employee.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null
    }
  }
}

export async function assertEmployeeLimit(tenantId: string, extra = 1) {
  const used = await countedEmployees(tenantId)
  try {
    await assertWithinLimit(tenantId, 'employees', used + extra - 1)
  } catch (error) {
    const owner = await prisma.tenantMembership.findFirst({ where: { tenantId, role: 'owner', isActive: true }, select: { tenantUserId: true } })
    const ent = await getEntitlements(tenantId)
    if (owner) {
      await safeCreateNotification({ audience: 'tenant', tenantId, tenantUserId: owner.tenantUserId, templateKey: 'employee_limit_reached', variables: { planName: ent.planName, max: String(ent.limits.employees) }, channels: { email: false } })
    }
    throw error
  }
}

async function nextEmployeeNumber(tenantId: string): Promise<string> {
  await syncEmployeeNumberSequence(prisma, tenantId)
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = await nextSequence(prisma, tenantId, 'EMP', 'all')
    const candidate = `EMP-${String(n).padStart(4, '0')}`
    if (!await prisma.employee.findUnique({ where: { tenantId_employeeNumber: { tenantId, employeeNumber: candidate } }, select: { id: true } })) return candidate
  }
  throw conflict('Gagal membuat NIP otomatis. Isi NIP secara manual.')
}

async function snapshotNames(tenantId: string, ids: { branchId: string, departmentId: string | null, positionId: string | null }) {
  const [branch, dep, pos] = await Promise.all([
    prisma.branch.findFirst({ where: { id: ids.branchId, tenantId }, select: { name: true } }),
    ids.departmentId ? prisma.department.findUnique({ where: { id: ids.departmentId }, select: { name: true } }) : null,
    ids.positionId ? prisma.position.findUnique({ where: { id: ids.positionId }, select: { name: true } }) : null
  ])
  return { branchName: branch?.name ?? null, departmentName: dep?.name ?? null, positionName: pos?.name ?? null }
}

export async function createEmployee(event: H3Event, input: z.infer<typeof employeeCreateSchema>) {
  const ctx = await requireTenantAbility(event, 'employees.write')
  await requireBranchAccess(event, input.branchId)
  await assertOrgRefs(ctx.tenantId, input)
  await assertEmployeeLimit(ctx.tenantId)
  const employeeNumber = input.employeeNumber || await nextEmployeeNumber(ctx.tenantId)
  if (await prisma.employee.findUnique({ where: { tenantId_employeeNumber: { tenantId: ctx.tenantId, employeeNumber } }, select: { id: true } })) {
    throw conflict('NIP ini sudah dipakai karyawan lain.', { field: 'employeeNumber' })
  }
  const names = await snapshotNames(ctx.tenantId, { branchId: input.branchId, departmentId: input.departmentId ?? null, positionId: input.positionId ?? null })
  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        ...profileData(input),
        fullName: input.fullName,
        tenantId: ctx.tenantId,
        employeeNumber,
        joinDate: dateKeyToDb(input.joinDate),
        employmentType: input.employmentType,
        status: input.status,
        branchId: input.branchId,
        departmentId: input.departmentId || null,
        positionId: input.positionId || null,
        managerId: input.managerId || null
      }
    })
    await tx.employmentHistory.create({
      data: {
        tenantId: ctx.tenantId, employeeId: created.id, effectiveFrom: dateKeyToDb(input.joinDate), branchId: created.branchId, departmentId: created.departmentId,
        positionId: created.positionId, managerId: created.managerId, employmentType: created.employmentType, status: created.status, ...names, note: 'Mulai bekerja', createdById: ctx.user.id
      }
    })
    return created
  })
  invalidateEntitlements(ctx.tenantId)
  await audit(event, ctx, 'employee.create', employee.id, { employeeNumber })
  return { id: employee.id, employeeNumber }
}

export async function updateEmployee(event: H3Event, id: string, input: z.infer<typeof employeeUpdateSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  if (input.shiftId) await assertOrgRefs(ctx.tenantId, { shiftId: input.shiftId })
  await prisma.employee.update({ where: { id: employee.id }, data: profileData(input) })
  const sensitiveChanged = (Object.keys(sensitiveFields) as Array<keyof typeof sensitiveFields>).filter(k => input[k] !== undefined)
  await audit(event, ctx, 'employee.update', employee.id, { fields: Object.keys(input).filter(k => input[k as keyof typeof input] !== undefined), sensitiveChanged })
  return { success: true }
}

/** Perubahan kepegawaian berlaku-tanggal. Berlaku hari ini/lampau → salinan "saat ini" ikut diubah. */
export async function changeEmployment(event: H3Event, id: string, input: z.infer<typeof employmentChangeSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  if (input.branchId) await requireBranchAccess(event, input.branchId)
  await assertOrgRefs(ctx.tenantId, input, employee.id)
  if (employee.status === 'terminated') throw conflict('Karyawan sudah berhenti. Aktifkan kembali lebih dulu.')
  if (input.effectiveFrom < dbDateToKey(employee.joinDate)) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal berlaku tidak boleh sebelum tanggal masuk.', { field: 'effectiveFrom' })
  const next = {
    branchId: input.branchId ?? employee.branchId,
    departmentId: input.departmentId === undefined ? employee.departmentId : input.departmentId,
    positionId: input.positionId === undefined ? employee.positionId : input.positionId,
    managerId: input.managerId === undefined ? employee.managerId : input.managerId,
    employmentType: input.employmentType ?? employee.employmentType,
    status: input.status ?? employee.status
  }
  const reactivating = (employee.status === 'inactive') && next.status !== 'inactive'
  if (reactivating) await assertEmployeeLimit(ctx.tenantId)
  const names = await snapshotNames(ctx.tenantId, next)
  const applyNow = input.effectiveFrom <= todayKey(ctx.tenant.timezone)
  await prisma.$transaction(async (tx) => {
    await tx.employmentHistory.create({ data: { tenantId: ctx.tenantId, employeeId: employee.id, effectiveFrom: dateKeyToDb(input.effectiveFrom), ...next, ...names, note: input.note ?? null, createdById: ctx.user.id } })
    if (applyNow) await tx.employee.update({ where: { id: employee.id }, data: next })
  })
  invalidateEntitlements(ctx.tenantId)
  await audit(event, ctx, 'employee.employment_change', employee.id, { effectiveFrom: input.effectiveFrom, fields: Object.keys(input).filter(k => k !== 'note' && k !== 'effectiveFrom'), applied: applyNow })
  return { success: true, applied: applyNow }
}

/** Cron harian: terapkan perubahan berlaku-tanggal yang jatuh hari ini (idempoten). */
export async function applyDueEmploymentChanges(now = new Date()) {
  const today = dateKeyToDb(now.toISOString().slice(0, 10))
  // Baris riwayat terbaru yang sudah berlaku per karyawan; terapkan bila berbeda dari salinan.
  const due = await prisma.employmentHistory.findMany({
    where: { effectiveFrom: { lte: today }, createdAt: { gte: new Date(now.getTime() - 400 * 86400000) }, employee: { status: { not: 'terminated' } } },
    orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    distinct: ['employeeId'],
    take: 2000,
    include: { employee: true }
  })
  let applied = 0
  for (const row of due) {
    const e = row.employee
    if (e.branchId === row.branchId && e.departmentId === row.departmentId && e.positionId === row.positionId && e.managerId === row.managerId && e.employmentType === row.employmentType && e.status === row.status) continue
    await prisma.employee.update({ where: { id: e.id }, data: { branchId: row.branchId, departmentId: row.departmentId, positionId: row.positionId, managerId: row.managerId, employmentType: row.employmentType, status: row.status } })
    applied++
  }
  return { checked: due.length, applied }
}

export async function terminateEmployee(event: H3Event, id: string, input: z.infer<typeof terminationSchema>) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  if (employee.status === 'terminated') throw conflict('Karyawan sudah berstatus berhenti.')
  if (input.endDate < dbDateToKey(employee.joinDate)) throw httpError(400, 'VALIDATION_FAILED', 'Tanggal berhenti tidak boleh sebelum tanggal masuk.', { field: 'endDate' })
  const names = await snapshotNames(ctx.tenantId, employee)
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employee.id }, data: { status: 'terminated', endDate: dateKeyToDb(input.endDate), terminationReason: input.reason } })
    await tx.employmentHistory.create({
      data: { tenantId: ctx.tenantId, employeeId: employee.id, effectiveFrom: dateKeyToDb(input.endDate), branchId: employee.branchId, departmentId: employee.departmentId, positionId: employee.positionId, managerId: employee.managerId, employmentType: employee.employmentType, status: 'terminated', ...names, note: input.reason, createdById: ctx.user.id }
    })
    // Login ESS ikut dinonaktifkan (login tim — owner/HR/atasan — dikelola di halaman Tim).
    if (employee.tenantUserId) {
      await tx.tenantMembership.updateMany({ where: { tenantId: ctx.tenantId, tenantUserId: employee.tenantUserId, role: 'employee' }, data: { isActive: false } })
    }
    // Bawahan kehilangan atasan langsung → persetujuan jatuh ke Admin HR.
    await tx.employee.updateMany({ where: { tenantId: ctx.tenantId, managerId: employee.id }, data: { managerId: null } })
    await tx.tenantInvitation.updateMany({ where: { tenantId: ctx.tenantId, employeeId: employee.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
  })
  invalidateEntitlements(ctx.tenantId)
  await audit(event, ctx, 'employee.terminate', employee.id, { endDate: input.endDate })
  return { success: true }
}

export async function reactivateEmployee(event: H3Event, id: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  if (employee.status !== 'terminated' && employee.status !== 'inactive') throw conflict('Karyawan masih aktif.')
  await assertEmployeeLimit(ctx.tenantId)
  const today = todayKey(ctx.tenant.timezone)
  const names = await snapshotNames(ctx.tenantId, employee)
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employee.id }, data: { status: 'active', endDate: null, terminationReason: null } })
    await tx.employmentHistory.create({
      data: { tenantId: ctx.tenantId, employeeId: employee.id, effectiveFrom: dateKeyToDb(today), branchId: employee.branchId, departmentId: employee.departmentId, positionId: employee.positionId, managerId: employee.managerId, employmentType: employee.employmentType, status: 'active', ...names, note: 'Diaktifkan kembali', createdById: ctx.user.id }
    })
  })
  invalidateEntitlements(ctx.tenantId)
  await audit(event, ctx, 'employee.reactivate', employee.id)
  return { success: true }
}

export async function employmentHistory(event: H3Event, id: string) {
  const { employee } = await requireEmployeeAccess(event, 'employees.read', id)
  const rows = await prisma.employmentHistory.findMany({ where: { employeeId: employee.id }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] })
  return {
    items: rows.map(r => ({ id: r.id, effectiveFrom: dbDateToKey(r.effectiveFrom), branchName: r.branchName, departmentName: r.departmentName, positionName: r.positionName, employmentType: r.employmentType, status: r.status, note: r.note, createdAt: r.createdAt.toISOString() }))
  }
}

// ---------------------------------------------------------------------------
// Layanan mandiri (ESS)
// ---------------------------------------------------------------------------

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function inviteEmployeeToEss(event: H3Event, id: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  if (employee.status === 'terminated' || employee.status === 'inactive') throw conflict('Karyawan tidak aktif.')
  if (!employee.email) throw httpError(400, 'VALIDATION_FAILED', 'Isi email karyawan lebih dulu.', { field: 'email' })
  const email = employee.email.toLowerCase()

  const existingUser = await prisma.tenantUser.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    const linked = await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, tenantUserId: existingUser.id }, select: { id: true } })
    if (linked && linked.id !== employee.id) throw conflict('Email ini sudah terhubung ke karyawan lain.', { field: 'email' })
    const here = await prisma.tenantMembership.findFirst({ where: { tenantId: ctx.tenantId, tenantUserId: existingUser.id } })
    if (here) {
      // Sudah punya login di perusahaan ini (mis. Admin HR/atasan yang juga karyawan): tautkan langsung.
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({ where: { id: employee.id }, data: { tenantUserId: existingUser.id } })
        if (!here.isActive && here.role === 'employee') await tx.tenantMembership.update({ where: { id: here.id }, data: { isActive: true } })
      })
      await audit(event, ctx, 'employee.ess_link', employee.id)
      return { linked: true }
    }
    const elsewhere = await prisma.tenantMembership.findFirst({ where: { tenantUserId: existingUser.id, isActive: true, tenantId: { not: ctx.tenantId } } })
    if (elsewhere) throw conflict('Email ini sudah terhubung ke perusahaan lain. Gunakan email lain.', { field: 'email' })
  }
  if (employee.tenantUserId) throw conflict('Karyawan ini sudah punya akses.')

  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  const data = { name: employee.fullName, role: 'employee' as const, branchIds: [] as Prisma.InputJsonValue, tokenHash: sha256(token), invitedById: ctx.user.id, expiresAt, acceptedAt: null, revokedAt: null, employeeId: employee.id }
  const invitation = await prisma.tenantInvitation.upsert({
    where: { tenantId_email: { tenantId: ctx.tenantId, email } },
    update: data,
    create: { tenantId: ctx.tenantId, email, ...data }
  })
  await sendTemplatedEmail({
    to: email,
    templateKey: 'employee_invitation',
    params: { name: employee.fullName, inviterName: ctx.user.name, tenantName: ctx.tenant.name, inviteUrl: `/app/auth/accept-invite?token=${token}`, expiresAt: formatDateId(expiresAt, ctx.tenant.timezone) }
  })
  await audit(event, ctx, 'employee.ess_invite', employee.id, { invitationId: invitation.id })
  return { linked: false, expiresAt: expiresAt.toISOString() }
}

export async function revokeEssAccess(event: H3Event, id: string) {
  const { ctx, employee } = await requireEmployeeAccess(event, 'employees.write', id)
  await prisma.tenantInvitation.updateMany({ where: { tenantId: ctx.tenantId, employeeId: employee.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
  if (employee.tenantUserId) {
    if (employee.tenantUserId === ctx.user.id) throw conflict('Anda tidak bisa mencabut akses Anda sendiri.')
    // Hanya login berperan karyawan yang dinonaktifkan; login tim tetap, tautan dilepas.
    await prisma.tenantMembership.updateMany({ where: { tenantId: ctx.tenantId, tenantUserId: employee.tenantUserId, role: 'employee' }, data: { isActive: false } })
  }
  await audit(event, ctx, 'employee.ess_revoke', employee.id)
  return { success: true }
}

/** Dipanggil dalam transaksi acceptInvitation untuk undangan ESS. */
export async function linkEmployeeOnAccept(tx: Prisma.TransactionClient, tenantId: string, employeeId: string | null, tenantUserId: string) {
  if (!employeeId) throw httpError(400, 'VALIDATION_FAILED', 'Undangan karyawan tidak valid. Minta Admin HR mengirim ulang.')
  const employee = await tx.employee.findFirst({ where: { id: employeeId, tenantId } })
  if (!employee || employee.status === 'terminated') throw httpError(400, 'VALIDATION_FAILED', 'Data karyawan untuk undangan ini sudah tidak aktif.')
  if (employee.tenantUserId && employee.tenantUserId !== tenantUserId) throw conflict('Data karyawan ini sudah terhubung ke akun lain.')
  const other = await tx.employee.findFirst({ where: { tenantId, tenantUserId, id: { not: employeeId } }, select: { id: true } })
  if (other) throw conflict('Akun ini sudah terhubung ke karyawan lain.')
  await tx.employee.update({ where: { id: employeeId }, data: { tenantUserId } })
}

/** Data kepegawaian milik sendiri (ESS): hanya baca, data sensitif tersamar. */
export async function myEmployeeProfile(event: H3Event) {
  const { employee } = await requireOwnEmployee(event, 'self.profile')
  const full = await prisma.employee.findUniqueOrThrow({
    where: { id: employee.id },
    include: { branch: { select: { name: true } }, department: { select: { name: true } }, position: { select: { name: true } }, manager: { select: { id: true, fullName: true } } }
  })
  return {
    ...toEmployeeListItem(full),
    ptkpStatus: full.ptkpStatus,
    birthDate: keyOrNull(full.birthDate),
    probationEndDate: keyOrNull(full.probationEndDate),
    sensitive: maskedSensitive(full),
    emergencyContactName: full.emergencyContactName,
    emergencyContactPhone: full.emergencyContactPhone
  }
}
