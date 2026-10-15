import type { Prisma } from '~~/generated/prisma/client'
import { deleteObject } from '../services/storage'

// Retensi & penghapusan data (UU PDP, 18 §2.1). Dijalankan oleh cron harian, idempoten, per batch kecil.
//
// Perusahaan yang dihapus (soft delete):
//   tahap 1 — setelah privacy.retentionMonths: hapus data operasional (absensi, cuti, dokumen + file,
//             keluarga, gaji, login tim…), anonimkan identitas karyawan. Catatan payroll & pajak
//             (payroll_runs, payslips) dan catatan pembayaran langganan TETAP disimpan.
//   tahap 2 — setelah privacy.financialRetentionYears: hapus catatan payroll & sisa data karyawan.
// Mantan karyawan di perusahaan aktif: setelah financialRetentionYears sejak berhenti → dianonimkan
// dan data turunannya dihapus.

const MONTH_MS = 30 * 86400_000
const YEAR_MS = 365 * 86400_000

/** Hapus objek penyimpanan + baris StoredFile (dipakai kedua tahap). */
async function purgeFiles(where: Prisma.StoredFileWhereInput) {
  const files = await prisma.storedFile.findMany({ where, select: { id: true, provider: true, visibility: true, path: true }, take: 2000 })
  for (const f of files) await deleteObject(f.provider, f.visibility, f.path)
  if (files.length) await prisma.storedFile.deleteMany({ where: { id: { in: files.map(f => f.id) } } })
  return files.length
}

const ANONYMIZED = {
  email: null, phone: null, gender: null, birthPlace: null, birthDate: null, religion: null, maritalStatus: null, address: null, photoUrl: null,
  nikEncrypted: null, npwpEncrypted: null, bpjsKesehatanNumberEncrypted: null, bpjsKetenagakerjaanNumberEncrypted: null,
  bankName: null, bankAccountNumberEncrypted: null, bankAccountName: null,
  emergencyContactName: null, emergencyContactPhone: null, emergencyContactRelation: null, tenantUserId: null, terminationReason: null
} satisfies Prisma.EmployeeUpdateManyMutationInput

/** Data turunan karyawan selain catatan payroll. */
async function deleteEmployeeOperationalData(where: { tenantId: string, employeeId?: { in: string[] } }) {
  const byEmployee = where.employeeId ? { employeeId: where.employeeId } : {}
  const base = { tenantId: where.tenantId, ...byEmployee }
  await prisma.attendanceRecord.deleteMany({ where: base })
  await prisma.attendanceCorrection.deleteMany({ where: base })
  await prisma.shiftAssignment.deleteMany({ where: base })
  await prisma.leaveLedger.deleteMany({ where: base })
  await prisma.leaveRequest.deleteMany({ where: base })
  await prisma.overtimeRequest.deleteMany({ where: base })
  await prisma.reimbursement.deleteMany({ where: base })
  await prisma.employeeFamily.deleteMany({ where: base })
  await prisma.employeeSalary.deleteMany({ where: base })
  await prisma.employmentHistory.deleteMany({ where: base })
  await prisma.performanceReview.deleteMany({ where: base })
  const docs = await prisma.employeeDocument.findMany({ where: base, select: { id: true, fileId: true } })
  if (docs.length) {
    await prisma.employeeDocument.deleteMany({ where: { id: { in: docs.map(d => d.id) } } })
    await purgeFiles({ id: { in: docs.map(d => d.fileId) } })
  }
}

async function purgeStage1(tenantId: string) {
  const subjectIds = [
    ...(await prisma.leaveRequest.findMany({ where: { tenantId }, select: { id: true } })),
    ...(await prisma.overtimeRequest.findMany({ where: { tenantId }, select: { id: true } })),
    ...(await prisma.reimbursement.findMany({ where: { tenantId }, select: { id: true } })),
    ...(await prisma.attendanceCorrection.findMany({ where: { tenantId }, select: { id: true } }))
  ].map(r => r.id)
  if (subjectIds.length) await prisma.approvalStep.deleteMany({ where: { tenantId, subjectId: { in: subjectIds } } })
  await deleteEmployeeOperationalData({ tenantId })
  await prisma.employeeDocument.deleteMany({ where: { tenantId } })
  await prisma.performanceCycle.deleteMany({ where: { tenantId } })
  await prisma.holiday.deleteMany({ where: { tenantId } })
  await prisma.leaveType.deleteMany({ where: { tenantId } })
  // Karyawan dianonimkan (baris tetap ada karena payslip merujuknya).
  await prisma.employee.updateMany({ where: { tenantId }, data: { ...ANONYMIZED, fullName: 'Data dihapus', managerId: null, shiftId: null, anonymizedAt: new Date() } })
  await prisma.shift.deleteMany({ where: { tenantId } })
  await purgeFiles({ tenantId })
  await prisma.notification.deleteMany({ where: { tenantId } })
  await prisma.apiClient.deleteMany({ where: { tenantId } })
  await prisma.tenantInvitation.deleteMany({ where: { tenantId } })
  await prisma.auditLog.deleteMany({ where: { tenantId } })
  await prisma.tenantHrSettings.deleteMany({ where: { tenantId } })
  // Login tim: keanggotaan dihapus; akun yang tidak punya keanggotaan lain ikut dihapus.
  const members = await prisma.tenantMembership.findMany({ where: { tenantId }, select: { id: true, tenantUserId: true } })
  await prisma.tenantMembershipBranch.deleteMany({ where: { tenantId } })
  await prisma.tenantMembership.deleteMany({ where: { tenantId } })
  for (const m of members) {
    const other = await prisma.tenantMembership.count({ where: { tenantUserId: m.tenantUserId } })
    if (!other) await prisma.tenantUser.delete({ where: { id: m.tenantUserId } }).catch(() => {})
  }
  // Identitas perusahaan: kontak dibuang; nama hukum & NPWP disimpan untuk catatan pembayaran langganan.
  await prisma.tenant.update({ where: { id: tenantId }, data: { email: null, phone: null, logoUrl: null, deleteRequestReason: null, dataPurgeStage: 1, dataPurgedAt: new Date() } })
}

async function purgeStage2(tenantId: string) {
  await prisma.payslip.deleteMany({ where: { tenantId } })
  await prisma.payrollRun.deleteMany({ where: { tenantId } })
  await prisma.salaryComponent.deleteMany({ where: { tenantId } })
  await prisma.employee.updateMany({ where: { tenantId }, data: { managerId: null } })
  await prisma.employee.deleteMany({ where: { tenantId } })
  await prisma.department.updateMany({ where: { tenantId }, data: { parentId: null } })
  await prisma.department.deleteMany({ where: { tenantId } })
  await prisma.position.deleteMany({ where: { tenantId } })
  await prisma.documentSequence.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.update({ where: { id: tenantId }, data: { name: 'Perusahaan dihapus', legalName: null, npwp: null, industry: null, dataPurgeStage: 2, dataPurgedAt: new Date() } })
}

export async function purgeDeletedTenants(now = new Date()) {
  const retentionMonths = await getNumberSetting('privacy.retentionMonths')
  const financialYears = await getNumberSetting('privacy.financialRetentionYears')
  const stage1 = await prisma.tenant.findMany({ where: { deletedAt: { not: null, lt: new Date(now.getTime() - retentionMonths * MONTH_MS) }, dataPurgeStage: 0 }, select: { id: true }, take: 3 })
  for (const t of stage1) await purgeStage1(t.id)
  const stage2 = await prisma.tenant.findMany({ where: { deletedAt: { not: null, lt: new Date(now.getTime() - financialYears * YEAR_MS) }, dataPurgeStage: 1 }, select: { id: true }, take: 3 })
  for (const t of stage2) await purgeStage2(t.id)
  return { stage1: stage1.length, stage2: stage2.length }
}

/** Mantan karyawan di perusahaan aktif yang berhenti lebih lama dari masa retensi keuangan. */
export async function anonymizeFormerEmployees(now = new Date()) {
  const financialYears = await getNumberSetting('privacy.financialRetentionYears')
  const cutoff = new Date(now.getTime() - financialYears * YEAR_MS)
  const due = await prisma.employee.findMany({ where: { status: 'terminated', anonymizedAt: null, endDate: { lt: cutoff } }, select: { id: true, tenantId: true, employeeNumber: true }, take: 200 })
  const byTenant = new Map<string, string[]>()
  for (const e of due) byTenant.set(e.tenantId, [...(byTenant.get(e.tenantId) ?? []), e.id])
  for (const [tenantId, ids] of byTenant) {
    await deleteEmployeeOperationalData({ tenantId, employeeId: { in: ids } })
    await prisma.payslip.deleteMany({ where: { tenantId, employeeId: { in: ids } } })
    await prisma.employee.updateMany({ where: { tenantId, managerId: { in: ids } }, data: { managerId: null } })
    for (const e of due.filter(x => ids.includes(x.id))) {
      await prisma.employee.update({ where: { id: e.id }, data: { ...ANONYMIZED, fullName: `Mantan karyawan ${e.employeeNumber}`, managerId: null, anonymizedAt: now } })
    }
  }
  return { anonymized: due.length }
}
