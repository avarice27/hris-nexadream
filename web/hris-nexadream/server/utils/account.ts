import type { H3Event } from 'h3'
import { z } from 'zod'

// Hak data pemilik (UU PDP): ekspor dan permintaan penghapusan. Hanya pemilik (account.manage).

export const deleteRequestSchema = z.object({
  reason: z.string().trim().max(1000, 'Alasan terlalu panjang.').optional(),
  confirmation: z.literal(true, 'Centang konfirmasi untuk melanjutkan.')
})

/**
 * Ekspor JSON seluruh data milik perusahaan. Field sensitif (NPWP) didekripsi HANYA untuk pemilik.
 * Tabel domain HR (karyawan, absensi, cuti, payroll…) ditambahkan di sini saat modulnya dibangun.
 * Catatan serverless: untuk perusahaan besar, ganti dengan job ekspor (cron + storage + signed URL).
 */
export async function exportTenantData(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'account.manage')
  // Ekspor berisi NPWP tanpa samaran → data sensitif (D7): tidak boleh saat impersonasi tanpa hak eksplisit.
  await assertSensitiveReadAllowed(event, { fieldGroup: 'account_export', targetType: 'tenant', targetId: ctx.tenantId })
  assertRateLimit('account-export', ctx.tenantId, 5, 60 * 60 * 1000)
  const tenantId = ctx.tenantId

  // Dua gelombang (<= 5 query paralel) agar pool koneksi tidak habis.
  const [tenant, subscription, subscriptionEvents, branches] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.subscription.findUnique({ where: { tenantId }, include: { plan: { select: { slug: true, name: true } } } }),
    prisma.subscriptionEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.branch.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } })
  ])
  const [memberships, invitations, payments, notifications, files, auditLogs] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        tenantUser: { select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true } },
        branches: { select: { branchId: true } }
      }
    }),
    prisma.tenantInvitation.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true }
    }),
    prisma.payment.findMany({ where: { tenantId }, omit: { raw: true }, orderBy: { createdAt: 'desc' } }),
    prisma.notification.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.storedFile.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, purpose: true, contentType: true, size: true, originalName: true, createdAt: true } }),
    prisma.auditLog.findMany({
      where: { tenantId },
      select: { action: true, actorName: true, targetType: true, targetId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000
    })
  ])

  const { npwp, ...tenantRest } = tenant
  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'hrisnexadream.export.v1',
    tenant: { ...tenantRest, npwp: npwp ? decrypt(npwp, 'hr') : null },
    subscription,
    subscriptionEvents,
    branches,
    team: memberships.map(m => ({ role: m.role, isActive: m.isActive, branchIds: m.branches.map(b => b.branchId), user: m.tenantUser, createdAt: m.createdAt })),
    invitations,
    payments,
    notifications,
    files,
    activity: auditLogs,
    hr: await exportHrData(tenantId)
  }

  await recordAudit(event, {
    audience: 'tenant', action: 'account.export', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId, impersonatorId: ctx.impersonatorId, targetType: 'tenant', targetId: tenantId,
    metadata: { branches: branches.length, members: memberships.length }
  })

  const filename = `hrisnexadream-data-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.json`
  setResponseHeaders(event, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store'
  })
  return JSON.stringify(payload, null, 2)
}

/** Permintaan penghapusan: dicatat & diteruskan ke staf; bukan penghapusan langsung. */
export async function requestTenantDeletion(event: H3Event, input: z.infer<typeof deleteRequestSchema>) {
  const ctx = await requireTenantAbility(event, 'account.manage')
  await requireNotImpersonating(event)
  if (ctx.tenant.deleteRequestedAt) {
    throw conflict('Permintaan penghapusan sudah kami terima dan sedang diproses.')
  }
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { deleteRequestedAt: new Date(), deleteRequestReason: input.reason || null }
  })
  const slaDays = await getNumberSetting('privacy.deleteRequestSlaDays')
  await recordAudit(event, {
    audience: 'tenant', action: 'tenant.delete_request', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, targetType: 'tenant', targetId: ctx.tenantId, metadata: { reason: input.reason || null }
  })
  await notifyPlatform('tenants.write', {
    templateKey: 'admin_delete_request',
    tenantId: ctx.tenantId,
    variables: { tenantName: ctx.tenant.name, slaDays, tenantId: ctx.tenantId },
    channels: { email: false }
  })
  return { success: true, slaDays }
}

export async function accountStatus(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'account.manage')
  return {
    deleteRequestedAt: ctx.tenant.deleteRequestedAt?.toISOString() ?? null,
    slaDays: await getNumberSetting('privacy.deleteRequestSlaDays'),
    financialRetentionYears: await getNumberSetting('privacy.financialRetentionYears')
  }
}

/** Info publik (tanpa rahasia) untuk footer & halaman /hapus-akun. */
export async function publicSiteInfo() {
  return {
    company: await publicCompanyInfo(),
    privacy: {
      contact: await getSetting('privacy.dataProtectionOfficer'),
      deleteRequestSlaDays: await getNumberSetting('privacy.deleteRequestSlaDays'),
      auditRetentionDays: await getNumberSetting('privacy.auditRetentionDays'),
      backupRetentionDays: await getNumberSetting('privacy.backupRetentionDays'),
      financialRetentionYears: await getNumberSetting('privacy.financialRetentionYears')
    }
  }
}

/**
 * Data modul HR untuk ekspor akun (pemilik saja, sudah dijaga assertSensitiveReadAllowed di atas).
 * Data terenkripsi dibuka agar ekspor bisa dipakai di sistem lain (hak portabilitas UU PDP).
 * Query dijalankan berurutan — ekspor jarang, pool koneksi lebih penting.
 */
async function exportHrData(tenantId: string) {
  const where = { tenantId }
  const dec = (v: string | null | undefined) => (v ? decrypt(v, 'hr') : null)
  const employees = await prisma.employee.findMany({ where, orderBy: { employeeNumber: 'asc' } })
  return {
    departments: await prisma.department.findMany({ where }),
    positions: await prisma.position.findMany({ where }),
    holidays: await prisma.holiday.findMany({ where }),
    shifts: await prisma.shift.findMany({ where }),
    employees: employees.map(({ nikEncrypted, npwpEncrypted, bpjsKesehatanNumberEncrypted, bpjsKetenagakerjaanNumberEncrypted, bankAccountNumberEncrypted, ...e }) => ({
      ...e, nik: dec(nikEncrypted), npwp: dec(npwpEncrypted), bpjsKesehatanNumber: dec(bpjsKesehatanNumberEncrypted),
      bpjsKetenagakerjaanNumber: dec(bpjsKetenagakerjaanNumberEncrypted), bankAccountNumber: dec(bankAccountNumberEncrypted)
    })),
    employmentHistory: await prisma.employmentHistory.findMany({ where }),
    family: (await prisma.employeeFamily.findMany({ where })).map(({ nikEncrypted, ...f }) => ({ ...f, nik: dec(nikEncrypted) })),
    salaries: (await prisma.employeeSalary.findMany({ where })).map(({ dataEncrypted, ...r }) => ({ ...r, data: JSON.parse(dec(dataEncrypted) || 'null') })),
    attendance: await prisma.attendanceRecord.findMany({ where, orderBy: { workDate: 'asc' }, omit: { clockInPhotoFileId: true, clockOutPhotoFileId: true } }),
    attendanceCorrections: await prisma.attendanceCorrection.findMany({ where }),
    leaveTypes: await prisma.leaveType.findMany({ where }),
    leaveLedger: await prisma.leaveLedger.findMany({ where }),
    leaveRequests: await prisma.leaveRequest.findMany({ where }),
    overtime: await prisma.overtimeRequest.findMany({ where }),
    reimbursements: await prisma.reimbursement.findMany({ where }),
    salaryComponents: await prisma.salaryComponent.findMany({ where }),
    payrollRuns: await prisma.payrollRun.findMany({ where }),
    payslips: (await prisma.payslip.findMany({ where })).map(({ dataEncrypted, ...p }) => ({ ...p, data: JSON.parse(dec(dataEncrypted) || 'null') })),
    documents: await prisma.employeeDocument.findMany({ where: { tenantId, deletedAt: null } }),
    performanceCycles: await prisma.performanceCycle.findMany({ where }),
    performanceReviews: await prisma.performanceReview.findMany({ where })
  }
}
