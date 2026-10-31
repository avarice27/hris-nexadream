import type { H3Event } from 'h3'
import { z } from 'zod'
import { CSV_BOM, toCsv } from '#shared/utils/csv'
import { EXPORT_KINDS, EXPORT_KIND_LABELS, type ExportKind } from '#shared/utils/exports'
import { UNLIMITED } from '#shared/utils/plans'
import type { PayslipData } from '#shared/utils/payroll-rules'
import { addDaysToKey, dateKeyToDb, dbDateToKey, todayKey } from '#shared/utils/timezone'
import type { ExportJob } from '~~/generated/prisma/client'
import { deleteObject, uploadObject } from '../services/storage'

// Ekspor besar sebagai pekerjaan latar (Vercel serverless: tanpa proses panjang).
// Setiap langkah memproses BATCH baris berurutan id lalu menyimpan kursor; klien memanggil /step
// berulang, dan cron HR melanjutkan pekerjaan yang ditinggal. Isi sementara disimpan terenkripsi
// (kunci HR), hasil akhirnya berkas CSV PRIVAT di storage, diunduh lewat signed URL ≤ 5 menit,
// dan dihapus otomatis setelah EXPORT_TTL_HOURS. Cakupan seluruh perusahaan → hanya peran dengan
// reports.read (pemilik, Admin HR); slip gaji juga butuh payroll.read dan dicatat sebagai akses sensitif.

const BATCH = 1000
const MAX_ROWS = 200_000
export const EXPORT_TTL_HOURS = 24

export const exportCreateSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional()
}).superRefine((v, ctx) => {
  if (v.kind === 'attendance_records' || v.kind === 'leave_requests') {
    if (!v.from || !v.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Pilih rentang tanggal.' })
    else if (v.from > v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Tanggal akhir harus setelah tanggal awal.' })
    else if (addDaysToKey(v.from, 366) < v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Rentang maksimal 1 tahun.' })
  }
  if (v.kind === 'payslips' && !v.year) ctx.addIssue({ code: 'custom', path: ['year'], message: 'Pilih tahun.' })
})
type ExportParams = z.infer<typeof exportCreateSchema>

interface Batch { rows: unknown[][], nextCursor: string | null }

const HEADERS: Record<ExportKind, string[]> = {
  employees: ['NIP', 'Nama', 'Email', 'Kantor', 'Departemen', 'Jabatan', 'Jenis', 'Status', 'Tanggal masuk', 'Tanggal berhenti'],
  attendance_records: ['Tanggal', 'NIP', 'Nama', 'Masuk (UTC)', 'Pulang (UTC)', 'Status', 'Menit terlambat', 'Menit pulang cepat', 'Menit kerja', 'Sumber'],
  leave_requests: ['Kode', 'NIP', 'Nama', 'Jenis cuti', 'Mulai', 'Selesai', 'Hari', 'Status', 'Diajukan'],
  payslips: ['Periode', 'Kode slip', 'NIP', 'Nama', 'Departemen', 'Bruto', 'Potongan', 'PPh 21', 'Bersih', 'Metode pajak']
}

const after = (cursor: string | null) => cursor ? { id: { gt: cursor } } : {}
const iso = (d: Date | null) => d ? d.toISOString() : ''
const page = <T extends { id: string }>(items: T[], rows: unknown[][]): Batch => ({ rows, nextCursor: items.length === BATCH ? items.at(-1)!.id : null })

async function fetchBatch(job: ExportJob, params: ExportParams): Promise<Batch> {
  const tenantId = job.tenantId
  if (params.kind === 'employees') {
    const items = await prisma.employee.findMany({
      where: { tenantId, anonymizedAt: null, ...after(job.cursor) }, orderBy: { id: 'asc' }, take: BATCH,
      include: { branch: { select: { name: true } }, department: { select: { name: true } }, position: { select: { name: true } } }
    })
    return page(items, items.map(e => [e.employeeNumber, e.fullName, e.email ?? '', e.branch.name, e.department?.name ?? '', e.position?.name ?? '', e.employmentType, e.status, dbDateToKey(e.joinDate), e.endDate ? dbDateToKey(e.endDate) : '']))
  }
  if (params.kind === 'attendance_records') {
    const items = await prisma.attendanceRecord.findMany({
      where: { tenantId, workDate: { gte: dateKeyToDb(params.from!), lte: dateKeyToDb(params.to!) }, ...after(job.cursor) }, orderBy: { id: 'asc' }, take: BATCH,
      include: { employee: { select: { employeeNumber: true, fullName: true } } }
    })
    return page(items, items.map(r => [dbDateToKey(r.workDate), r.employee.employeeNumber, r.employee.fullName, iso(r.clockInAt), iso(r.clockOutAt), r.status, r.lateMinutes, r.earlyLeaveMinutes, r.workedMinutes, r.source]))
  }
  if (params.kind === 'leave_requests') {
    const items = await prisma.leaveRequest.findMany({
      where: { tenantId, startDate: { lte: dateKeyToDb(params.to!) }, endDate: { gte: dateKeyToDb(params.from!) }, ...after(job.cursor) }, orderBy: { id: 'asc' }, take: BATCH,
      include: { employee: { select: { employeeNumber: true, fullName: true } }, leaveType: { select: { name: true } } }
    })
    return page(items, items.map(l => [l.code, l.employee.employeeNumber, l.employee.fullName, l.leaveType.name, dbDateToKey(l.startDate), dbDateToKey(l.endDate), Number(l.days), l.status, l.createdAt.toISOString()]))
  }
  const items = await prisma.payslip.findMany({
    where: { tenantId, run: { periodYear: params.year!, status: { in: ['approved', 'paid_recorded'] } }, ...after(job.cursor) }, orderBy: { id: 'asc' }, take: BATCH,
    include: { run: { select: { periodYear: true, periodMonth: true } } }
  })
  return page(items, items.map((s) => {
    const d = decryptHrJson<PayslipData | null>(s.dataEncrypted, null)
    return [`${s.run.periodYear}-${String(s.run.periodMonth).padStart(2, '0')}`, s.code, s.employeeNumber, s.employeeName, s.departmentName ?? '', d?.gross ?? '', d?.totalDeductions ?? '', d?.pph21 ?? '', d?.net ?? '', d?.taxMethod ?? 'gross']
  }))
}

function toView(job: ExportJob) {
  return {
    id: job.id, kind: job.kind, kindLabel: EXPORT_KIND_LABELS[job.kind as ExportKind] ?? job.kind, params: job.params,
    status: job.status, rowCount: job.rowCount, error: job.error, ready: job.status === 'completed' && !!job.fileId,
    createdAt: job.createdAt.toISOString(), completedAt: job.completedAt?.toISOString() ?? null, expiresAt: job.expiresAt.toISOString()
  }
}

async function requireExportAccess(event: H3Event, kind: ExportKind) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  if (kind === 'payslips') await requireTenantAbility(event, 'payroll.read')
  return ctx
}

export async function createExportJob(event: H3Event, input: ExportParams) {
  const ctx = await requireExportAccess(event, input.kind)
  await requireEntitlement(event, 'export')
  // Rentang dijepit ke riwayat laporan paket (sama seperti laporan).
  if (input.from) {
    const days = await limit(ctx.tenantId, 'reportRetentionDays')
    const earliest = addDaysToKey(todayKey(ctx.tenant.timezone), -days)
    if (days !== UNLIMITED && input.from < earliest) input = { ...input, from: earliest }
  }
  const running = await prisma.exportJob.count({ where: { tenantId: ctx.tenantId, status: { in: ['queued', 'running'] } } })
  if (running >= 3) throw conflict('Masih ada 3 ekspor berjalan. Tunggu hingga selesai.')
  if (input.kind === 'payslips') await auditSensitiveRead(event, ctx, { employeeId: '*', fieldGroup: 'payslip' })
  const job = await prisma.exportJob.create({
    data: { tenantId: ctx.tenantId, requestedById: ctx.user.id, kind: input.kind, params: input, expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3600_000) }
  })
  await recordAudit(event, { audience: 'tenant', action: 'export.create', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'export_job', targetId: job.id, metadata: { kind: input.kind } })
  return toView(job)
}

/** Satu langkah: ambil satu batch, tambahkan ke CSV sementara; bila habis, unggah berkas akhir. */
export async function advanceExportJob(jobId: string): Promise<ExportJob> {
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } })
  if (job.status === 'completed' || job.status === 'failed') return job
  const params = exportCreateSchema.parse(job.params)
  try {
    const batch = await fetchBatch(job, params)
    const chunk = batch.rows.length ? toCsv([], batch.rows).replace(CSV_BOM, '').replace(/^\r\n/, '') : ''
    const partial = decryptHr(job.partialCsv) + chunk
    const rowCount = job.rowCount + batch.rows.length
    if (batch.nextCursor && rowCount < MAX_ROWS) {
      // Kursor maju hanya bila baris yang sama masih "running" dengan kursor lama (cegah dua langkah paralel).
      const moved = await prisma.exportJob.updateMany({
        where: { id: job.id, cursor: job.cursor, status: { in: ['queued', 'running'] } },
        data: { status: 'running', cursor: batch.nextCursor, partialCsv: encryptHr(partial), rowCount }
      })
      return moved.count ? prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } }) : job
    }
    const body = new TextEncoder().encode(toCsv(HEADERS[params.kind], []) + partial)
    const path = `tenants/${job.tenantId}/exports/${job.id}.csv`
    const stored = await uploadObject({ visibility: 'private', path, body, contentType: 'text/csv; charset=utf-8' })
    const file = await prisma.storedFile.create({
      data: { tenantId: job.tenantId, uploadedById: job.requestedById, audience: 'tenant', visibility: 'private', purpose: 'export', provider: stored.provider, path, contentType: 'text/csv', size: body.byteLength, originalName: `${params.kind}-${job.id}.csv` }
    })
    return await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'completed', fileId: file.id, partialCsv: null, cursor: null, rowCount, completedAt: new Date(), error: rowCount >= MAX_ROWS ? `Dibatasi ${MAX_ROWS.toLocaleString('id-ID')} baris pertama.` : null }
    })
  } catch (error) {
    console.error('[exports] step failed', job.id, error)
    return prisma.exportJob.update({ where: { id: job.id }, data: { status: 'failed', partialCsv: null, error: 'Ekspor gagal diproses. Silakan coba lagi.' } })
  }
}

async function loadOwnJob(event: H3Event, id: string) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  const job = await prisma.exportJob.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!job) throw notFound('Ekspor tidak ditemukan.')
  await requireExportAccess(event, job.kind as ExportKind)
  return { ctx, job }
}

export async function stepExportJob(event: H3Event, id: string) {
  const { job } = await loadOwnJob(event, id)
  return toView(await advanceExportJob(job.id))
}

export async function listExportJobs(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'reports.read')
  const jobs = await prisma.exportJob.findMany({ where: { tenantId: ctx.tenantId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 20 })
  return { items: jobs.map(toView) }
}

export async function exportDownloadUrl(event: H3Event, id: string) {
  const { ctx, job } = await loadOwnJob(event, id)
  if (job.status !== 'completed' || !job.fileId) throw conflict('Ekspor belum selesai.')
  await recordAudit(event, { audience: 'tenant', action: 'export.download', actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType: 'export_job', targetId: job.id, metadata: { kind: job.kind } })
  return signedFileUrl(ctx.tenantId, job.fileId)
}

/** Cron: lanjutkan pekerjaan yang ditinggal klien, lalu hapus ekspor kedaluwarsa beserta berkasnya. */
export async function processExportJobs(now = new Date()) {
  const pending = await prisma.exportJob.findMany({ where: { status: { in: ['queued', 'running'] }, expiresAt: { gt: now } }, orderBy: { createdAt: 'asc' }, take: 3, select: { id: true } })
  let steps = 0
  for (const { id } of pending) {
    for (let i = 0; i < 20; i++) {
      steps++
      const job = await advanceExportJob(id)
      if (job.status === 'completed' || job.status === 'failed') break
    }
  }
  const expired = await prisma.exportJob.findMany({ where: { expiresAt: { lt: now } }, take: 200, select: { id: true, fileId: true } })
  const fileIds = expired.map(e => e.fileId).filter((v): v is string => !!v)
  if (fileIds.length) {
    const files = await prisma.storedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, provider: true, visibility: true, path: true } })
    for (const f of files) await deleteObject(f.provider, f.visibility, f.path)
    await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } })
  }
  if (expired.length) await prisma.exportJob.deleteMany({ where: { id: { in: expired.map(e => e.id) } } })
  return { advanced: pending.length, steps, expired: expired.length }
}
