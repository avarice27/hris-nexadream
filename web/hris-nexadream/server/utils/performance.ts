import type { H3Event } from 'h3'
import { z } from 'zod'
import { dateKeyToDb, dbDateToKey } from '#shared/utils/timezone'
import type { PerformanceCycle, PerformanceReview, Prisma } from '~~/generated/prisma/client'

// 11.9 Penilaian kinerja dasar: siklus → satu review per karyawan (penilai = atasan langsung)
// → target berbobot → penilaian diri → penilaian atasan → skor akhir tertimbang (1–5).

export interface Goal { title: string, weight: number, selfScore?: number | null, score?: number | null, note?: string | null }

const goalSchema = z.object({
  title: z.string().trim().min(2, 'Judul target minimal 2 karakter.').max(150),
  weight: z.number().int().min(1).max(100),
  note: z.string().trim().max(300).nullable().optional()
})

export const cycleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  defaultGoals: z.array(goalSchema).max(10).optional()
}).refine(v => v.periodEnd >= v.periodStart, { message: 'Akhir periode tidak boleh sebelum awal.', path: ['periodEnd'] })

function audit(event: H3Event, ctx: TenantContext, action: string, targetType: string, targetId: string) {
  return recordAudit(event, { audience: 'tenant', action, actorId: ctx.user.id, actorName: ctx.user.name, impersonatorId: ctx.impersonatorId, tenantId: ctx.tenantId, targetType, targetId })
}

function toCycleView(c: PerformanceCycle, counts?: { total: number, completed: number }) {
  return { id: c.id, name: c.name, periodStart: dbDateToKey(c.periodStart), periodEnd: dbDateToKey(c.periodEnd), status: c.status, reviewCount: counts?.total ?? 0, completedCount: counts?.completed ?? 0 }
}

export async function listCycles(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'performance.read')
  const cycles = await prisma.performanceCycle.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { periodStart: 'desc' } })
  const counts = await prisma.performanceReview.groupBy({ by: ['cycleId', 'status'], where: { tenantId: ctx.tenantId }, _count: { _all: true } })
  return {
    items: cycles.map(c => toCycleView(c, {
      total: counts.filter(x => x.cycleId === c.id).reduce((s, x) => s + x._count._all, 0),
      completed: counts.find(x => x.cycleId === c.id && x.status === 'completed')?._count._all ?? 0
    })),
    featureAvailable: await can(ctx.tenantId, 'performanceReview')
  }
}

export async function createCycle(event: H3Event, input: z.infer<typeof cycleSchema>) {
  const ctx = await requireTenantAbility(event, 'performance.write')
  if (!seesAllEmployees(ctx)) throw forbidden()
  await requireEntitlement(event, 'performanceReview')
  const cycle = await prisma.performanceCycle.create({ data: { tenantId: ctx.tenantId, name: input.name, periodStart: dateKeyToDb(input.periodStart), periodEnd: dateKeyToDb(input.periodEnd) } })
  // Review dibuat langsung untuk karyawan aktif dalam cakupan; penilai = atasan langsung.
  const employees = await prisma.employee.findMany({ where: { AND: [await visibleEmployeesWhere(event, ctx), { status: { in: ['active', 'probation', 'on_leave'] } }] }, select: { id: true, managerId: true } })
  const goals = (input.defaultGoals ?? []).map(g => ({ ...g, selfScore: null, score: null })) as unknown as Prisma.InputJsonValue
  if (employees.length) {
    await prisma.performanceReview.createMany({ data: employees.map(e => ({ tenantId: ctx.tenantId, cycleId: cycle.id, employeeId: e.id, reviewerEmployeeId: e.managerId, goals })), skipDuplicates: true })
  }
  await audit(event, ctx, 'performance_cycle.create', 'performance_cycle', cycle.id)
  return toCycleView(cycle, { total: employees.length, completed: 0 })
}

export const cycleStatusSchema = z.object({ status: z.enum(['active', 'closed']) })

export async function setCycleStatus(event: H3Event, id: string, input: z.infer<typeof cycleStatusSchema>) {
  const ctx = await requireTenantAbility(event, 'performance.write')
  if (!seesAllEmployees(ctx)) throw forbidden()
  await requireEntitlement(event, 'performanceReview')
  const cycle = await prisma.performanceCycle.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!cycle) throw notFound('Siklus tidak ditemukan.')
  if (cycle.status === 'closed') throw conflict('Siklus sudah ditutup.')
  await prisma.performanceCycle.update({ where: { id }, data: { status: input.status } })
  await audit(event, ctx, `performance_cycle.${input.status === 'active' ? 'start' : 'close'}`, 'performance_cycle', id)
  return { success: true }
}

function weighted(goals: Goal[], key: 'score' | 'selfScore'): number | null {
  const scored = goals.filter(g => typeof g[key] === 'number')
  if (!scored.length || scored.length !== goals.length) return null
  const weight = scored.reduce((s, g) => s + g.weight, 0)
  return weight ? Math.round((scored.reduce((s, g) => s + (g[key] as number) * g.weight, 0) / weight) * 100) / 100 : null
}

type ReviewRow = PerformanceReview & { employee: { id: string, fullName: string, employeeNumber: string }, cycle: PerformanceCycle }

async function reviewView(r: ReviewRow, ctx: TenantContext, me: { id: string } | null) {
  const reviewer = r.reviewerEmployeeId ? await prisma.employee.findUnique({ where: { id: r.reviewerEmployeeId }, select: { fullName: true } }) : null
  const isReviewer = (!!me && r.reviewerEmployeeId === me.id) || (seesAllEmployees(ctx) && canTenantRole(ctx.role, 'performance.write'))
  const isSelf = !!me && r.employeeId === me.id
  return {
    id: r.id, cycle: toCycleView(r.cycle), employee: r.employee, reviewerName: reviewer?.fullName ?? null, status: r.status,
    goals: r.goals as unknown as Goal[], selfNote: r.selfNote, managerNote: r.managerNote, finalScore: r.finalScore === null ? null : Number(r.finalScore),
    selfSubmittedAt: r.selfSubmittedAt?.toISOString() ?? null, completedAt: r.completedAt?.toISOString() ?? null,
    canEditGoals: isReviewer && r.status === 'pending' && r.cycle.status !== 'closed',
    canSelfReview: isSelf && r.status === 'pending' && r.cycle.status === 'active' && (r.goals as unknown as Goal[]).length > 0,
    canFinalize: isReviewer && !isSelf && r.status !== 'completed' && r.cycle.status === 'active'
  }
}

const reviewInclude = { employee: { select: { id: true, fullName: true, employeeNumber: true } }, cycle: true } as const

export async function listReviews(event: H3Event, cycleId: string) {
  const ctx = await requireTenantAbility(event, 'performance.read')
  const me = await ownEmployee(event, ctx)
  const rows = await prisma.performanceReview.findMany({ where: { tenantId: ctx.tenantId, cycleId, ...(await employeeScopeWhere(event, ctx)) }, include: reviewInclude, orderBy: { employee: { fullName: 'asc' } } })
  return { items: await Promise.all(rows.map(r => reviewView(r, ctx, me))) }
}

async function loadReview(event: H3Event, id: string, ability: 'performance.read' | 'performance.self') {
  const ctx = await requireTenantAbility(event, ability)
  const me = await ownEmployee(event, ctx)
  const scope = ability === 'performance.self' ? { employeeId: me?.id ?? '__none__' } : await employeeScopeWhere(event, ctx)
  const review = await prisma.performanceReview.findFirst({ where: { id, tenantId: ctx.tenantId, ...scope }, include: reviewInclude })
  if (!review) throw notFound('Penilaian tidak ditemukan.')
  return { ctx, me, review }
}

export async function getReview(event: H3Event, id: string) {
  const { ctx, me, review } = await loadReview(event, id, 'performance.read')
  return reviewView(review, ctx, me)
}

export const goalsSchema = z.object({ goals: z.array(goalSchema).min(1, 'Minimal satu target.').max(10) })

export async function updateReviewGoals(event: H3Event, id: string, input: z.infer<typeof goalsSchema>) {
  const { ctx, me, review } = await loadReview(event, id, 'performance.read')
  if (!(await reviewView(review, ctx, me)).canEditGoals) throw forbidden('Target hanya bisa diubah penilai sebelum karyawan menilai diri.')
  await prisma.performanceReview.update({ where: { id }, data: { goals: input.goals.map(g => ({ ...g, selfScore: null, score: null })) as unknown as Prisma.InputJsonValue } })
  return { success: true }
}

const scoresSchema = z.array(z.number().int().min(1).max(5))

export const selfReviewSchema = z.object({ scores: scoresSchema, note: z.string().trim().max(1000).nullable().optional() })

export async function submitSelfReview(event: H3Event, id: string, input: z.infer<typeof selfReviewSchema>) {
  const { ctx, me, review } = await loadReview(event, id, 'performance.self')
  if (!(await reviewView(review, ctx, me)).canSelfReview) throw conflict('Penilaian diri tidak tersedia untuk review ini.')
  const goals = review.goals as unknown as Goal[]
  if (input.scores.length !== goals.length) throw httpError(400, 'VALIDATION_FAILED', 'Beri skor untuk setiap target.')
  await prisma.performanceReview.update({ where: { id }, data: { goals: goals.map((g, i) => ({ ...g, selfScore: input.scores[i] })) as unknown as Prisma.InputJsonValue, selfNote: input.note ?? null, status: 'self_submitted', selfSubmittedAt: new Date() } })
  return { success: true }
}

export const finalizeSchema = z.object({ scores: scoresSchema, note: z.string().trim().max(1000).nullable().optional() })

export async function finalizeReview(event: H3Event, id: string, input: z.infer<typeof finalizeSchema>) {
  const { ctx, me, review } = await loadReview(event, id, 'performance.read')
  if (!canTenantRole(ctx.role, 'performance.write') || !(await reviewView(review, ctx, me)).canFinalize) throw forbidden()
  await requireEntitlement(event, 'performanceReview')
  const goals = review.goals as unknown as Goal[]
  if (!goals.length || input.scores.length !== goals.length) throw httpError(400, 'VALIDATION_FAILED', 'Beri skor untuk setiap target.')
  const scored = goals.map((g, i) => ({ ...g, score: input.scores[i] }))
  await prisma.performanceReview.update({ where: { id }, data: { goals: scored as unknown as Prisma.InputJsonValue, managerNote: input.note ?? null, finalScore: weighted(scored, 'score'), status: 'completed', completedAt: new Date() } })
  await audit(event, ctx, 'performance_review.finalize', 'performance_review', id)
  return { success: true }
}

export async function myReviews(event: H3Event) {
  const { ctx, employee } = await requireOwnEmployee(event, 'performance.self')
  const rows = await prisma.performanceReview.findMany({ where: { employeeId: employee.id, cycle: { status: { not: 'draft' } } }, include: reviewInclude, orderBy: { createdAt: 'desc' }, take: 20 })
  return { items: await Promise.all(rows.map(r => reviewView(r, ctx, employee))) }
}
