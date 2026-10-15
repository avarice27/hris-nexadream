import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ApprovalSubject, ApproverType } from '#shared/utils/hr'
import type { TenantAbility } from '#shared/utils/tenant-abilities'
import type { ApprovalStep, Employee, Prisma } from '~~/generated/prisma/client'

// Satu mekanisme persetujuan (18 §2.1): request → langkah (atasan langsung, lalu opsional Admin HR)
// → disetujui / ditolak / dibatalkan. Penyetuju tidak bisa memutuskan pengajuannya sendiri.
// Owner/Admin HR boleh memutuskan langkah mana pun dalam cakupan kantornya (override, tercatat).

export const SUBJECT_ABILITY: Record<ApprovalSubject, TenantAbility> = {
  leave: 'leave.approve',
  overtime: 'overtime.approve',
  reimbursement: 'reimbursement.approve',
  attendance_correction: 'attendance.read'
}

const HR_SUBJECT_ABILITY: Record<ApprovalSubject, TenantAbility> = {
  leave: 'leave.approve',
  overtime: 'overtime.approve',
  reimbursement: 'reimbursement.approve',
  attendance_correction: 'attendance.write'
}

export const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(300).nullable().optional()
})
export type Decision = z.infer<typeof decisionSchema>

/** Atasan yang bisa memutuskan: punya login aktif di tenant ini. */
async function managerCanApprove(tenantId: string, managerId: string | null): Promise<Employee | null> {
  if (!managerId) return null
  const manager = await prisma.employee.findFirst({ where: { id: managerId, tenantId, status: { notIn: ['terminated', 'inactive'] }, tenantUserId: { not: null } } })
  if (!manager?.tenantUserId) return null
  const membership = await prisma.tenantMembership.findFirst({ where: { tenantId, tenantUserId: manager.tenantUserId, isActive: true, role: { in: ['owner', 'hr_admin', 'manager'] } } })
  return membership ? manager : null
}

export type PlannedSteps = Array<{ type: ApproverType, approverEmployeeId: string | null }>

/**
 * Tentukan rantai penyetuju SEBELUM transaksi dibuka (membaca pengaturan & data atasan).
 * Jangan pernah memanggil client global di dalam $transaction — koneksi pool tertahan.
 */
export async function planApprovalSteps(tenantId: string, subjectType: ApprovalSubject, employee: Employee): Promise<PlannedSteps> {
  const chain = await approvalChainFor(tenantId, subjectType)
  const manager = await managerCanApprove(tenantId, employee.managerId)
  const resolved: PlannedSteps = []
  for (const type of chain) {
    if (type === 'manager' && manager) resolved.push({ type: 'manager', approverEmployeeId: manager.id })
    else if (!resolved.some(r => r.type === 'hr')) resolved.push({ type: 'hr', approverEmployeeId: null })
  }
  if (!resolved.length) resolved.push({ type: 'hr', approverEmployeeId: null })
  return resolved
}

/** Tulis langkah yang sudah direncanakan (di dalam transaksi pengajuannya). */
export async function insertApprovalSteps(tx: Prisma.TransactionClient, input: { tenantId: string, subjectType: ApprovalSubject, subjectId: string, steps: PlannedSteps }) {
  await tx.approvalStep.createMany({
    data: input.steps.map((step, i) => ({ tenantId: input.tenantId, subjectType: input.subjectType, subjectId: input.subjectId, stepOrder: i + 1, approverType: step.type, approverEmployeeId: step.approverEmployeeId }))
  })
}

/** Langkah aktif = langkah 'pending' dengan urutan terkecil. */
export function currentStep(steps: ApprovalStep[]): ApprovalStep | null {
  return steps.filter(s => s.status === 'pending').sort((a, b) => a.stepOrder - b.stepOrder)[0] ?? null
}

export interface DeciderContext {
  ctx: TenantContext
  me: Employee | null
}

export function canDecideStep(d: DeciderContext, subjectType: ApprovalSubject, step: ApprovalStep, requester: { id: string, branchId: string }): boolean {
  if (d.me && d.me.id === requester.id) return false
  const branchOk = !d.ctx.branchIds || d.ctx.branchIds.includes(requester.branchId)
  if (seesAllEmployees(d.ctx) && branchOk && canTenantRole(d.ctx.role, HR_SUBJECT_ABILITY[subjectType])) return true
  if (step.approverType === 'manager') return !!d.me && step.approverEmployeeId === d.me.id && canTenantRole(d.ctx.role, SUBJECT_ABILITY[subjectType])
  return false
}

/**
 * Putuskan langkah aktif. Mengembalikan hasil akhir pengajuan: 'approved' (semua langkah selesai),
 * 'rejected', atau null (masih ada langkah berikutnya). Panggil di dalam transaksi pengajuan.
 */
export async function decideCurrentStep(tx: Prisma.TransactionClient, d: DeciderContext, input: { subjectType: ApprovalSubject, subjectId: string, requester: { id: string, branchId: string }, decision: Decision }) {
  const steps = await tx.approvalStep.findMany({ where: { subjectType: input.subjectType, subjectId: input.subjectId } })
  const step = currentStep(steps)
  if (!step) throw conflict('Pengajuan ini sudah diputuskan.')
  if (!canDecideStep(d, input.subjectType, step, input.requester)) {
    if (d.me?.id === input.requester.id) throw forbidden('Anda tidak bisa memutuskan pengajuan Anda sendiri.')
    throw forbidden('Anda bukan penyetuju langkah ini.')
  }
  const now = new Date()
  const claimed = await tx.approvalStep.updateMany({
    where: { id: step.id, status: 'pending' },
    data: { status: input.decision.decision, decidedByUserId: d.ctx.user.id, decidedByName: d.ctx.user.name, decidedAt: now, note: input.decision.note ?? null }
  })
  if (claimed.count !== 1) throw conflict('Pengajuan ini baru saja diputuskan orang lain. Muat ulang halaman.')
  if (input.decision.decision === 'rejected') {
    await tx.approvalStep.updateMany({ where: { subjectType: input.subjectType, subjectId: input.subjectId, status: 'pending' }, data: { status: 'cancelled' } })
    return 'rejected' as const
  }
  const remaining = steps.filter(s => s.status === 'pending' && s.id !== step.id)
  return remaining.length ? null : ('approved' as const)
}

export async function cancelApprovalSteps(tx: Prisma.TransactionClient, subjectType: ApprovalSubject, subjectId: string) {
  await tx.approvalStep.updateMany({ where: { subjectType, subjectId, status: 'pending' }, data: { status: 'cancelled' } })
}

export async function stepsFor(subjectType: ApprovalSubject, subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, ApprovalStep[]>()
  const rows = await prisma.approvalStep.findMany({ where: { subjectType, subjectId: { in: subjectIds } }, orderBy: { stepOrder: 'asc' } })
  const map = new Map<string, ApprovalStep[]>()
  for (const row of rows) map.set(row.subjectId, [...(map.get(row.subjectId) ?? []), row])
  return map
}

export function toStepView(step: ApprovalStep, approverNames: Map<string, string>) {
  return {
    order: step.stepOrder,
    approverType: step.approverType,
    approverName: step.approverEmployeeId ? approverNames.get(step.approverEmployeeId) ?? null : null,
    status: step.status,
    decidedByName: step.decidedByName,
    decidedAt: step.decidedAt?.toISOString() ?? null,
    note: step.note
  }
}

export async function approverNamesFor(steps: ApprovalStep[]) {
  const ids = [...new Set(steps.map(s => s.approverEmployeeId).filter((v): v is string => !!v))]
  if (!ids.length) return new Map<string, string>()
  const rows = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
  return new Map(rows.map(r => [r.id, r.fullName]))
}

/** Penerima notifikasi untuk langkah aktif (setelah commit). */
export async function approverRecipients(tenantId: string, step: { approverType: string, approverEmployeeId: string | null }, requesterBranchId: string): Promise<Array<{ tenantUserId: string, name: string }>> {
  if (step.approverType === 'manager' && step.approverEmployeeId) {
    const manager = await prisma.employee.findUnique({ where: { id: step.approverEmployeeId }, select: { tenantUserId: true, fullName: true } })
    return manager?.tenantUserId ? [{ tenantUserId: manager.tenantUserId, name: manager.fullName }] : []
  }
  const members = await prisma.tenantMembership.findMany({
    where: { tenantId, isActive: true, role: { in: ['owner', 'hr_admin'] } },
    include: { tenantUser: { select: { id: true, name: true } }, branches: { select: { branchId: true } } }
  })
  return members
    .filter(m => !m.branches.length || m.branches.some(b => b.branchId === requesterBranchId))
    .map(m => ({ tenantUserId: m.tenantUser.id, name: m.tenantUser.name }))
}

/** Kirim bel/email "menunggu persetujuan" ke penyetuju langkah aktif. Tidak pernah melempar. */
export async function notifyCurrentApprovers(tenantId: string, subjectType: ApprovalSubject, subjectId: string, requester: { fullName: string, branchId: string }, templateKey: string, variables: Record<string, string>) {
  try {
    const steps = await prisma.approvalStep.findMany({ where: { subjectType, subjectId } })
    const step = currentStep(steps)
    if (!step) return
    for (const r of await approverRecipients(tenantId, step, requester.branchId)) {
      await safeCreateNotification({ audience: 'tenant', tenantId, tenantUserId: r.tenantUserId, templateKey, variables: { approverName: r.name, employeeName: requester.fullName, ...variables } })
    }
  } catch (error) {
    console.error('[approvals] notify failed', error)
  }
}

/** Beri tahu pemohon tentang keputusan akhir. */
export async function notifyRequester(tenantId: string, employee: { tenantUserId: string | null, fullName: string }, templateKey: string, variables: Record<string, string>) {
  if (!employee.tenantUserId) return
  await safeCreateNotification({ audience: 'tenant', tenantId, tenantUserId: employee.tenantUserId, templateKey, variables: { name: employee.fullName, ...variables } })
}

/** Langkah aktif yang bisa diputuskan pengguna ini (kotak masuk persetujuan). */
export async function decidableSubjectIds(event: H3Event, ctx: TenantContext, subjectType: ApprovalSubject): Promise<string[]> {
  const me = await ownEmployee(event, ctx)
  const isHr = seesAllEmployees(ctx) && canTenantRole(ctx.role, HR_SUBJECT_ABILITY[subjectType])
  const managerSteps = me && canTenantRole(ctx.role, SUBJECT_ABILITY[subjectType])
    ? await prisma.approvalStep.findMany({ where: { tenantId: ctx.tenantId, subjectType, status: 'pending', approverType: 'manager', approverEmployeeId: me.id }, select: { subjectId: true } })
    : []
  const hrSteps = isHr ? await prisma.approvalStep.findMany({ where: { tenantId: ctx.tenantId, subjectType, status: 'pending', approverType: 'hr' }, select: { subjectId: true } }) : []
  const candidates = [...new Set([...managerSteps, ...hrSteps].map(s => s.subjectId))]
  if (!candidates.length) return []
  // Hanya bila langkah itu adalah langkah AKTIF.
  const all = await stepsFor(subjectType, candidates)
  return candidates.filter((id) => {
    const step = currentStep(all.get(id) ?? [])
    if (!step) return false
    if (step.approverType === 'manager') return step.approverEmployeeId === me?.id
    return isHr
  })
}
