import type { H3Event } from 'h3'
import { z } from 'zod'
import { formatLimit, UNLIMITED } from '#shared/utils/plans'
import type { BillingPeriodValue } from '#shared/utils/payments'
import { periodEnd, renewalBase } from '#shared/utils/billing-rules'
import type { Prisma, SubscriptionStatus } from '~~/generated/prisma/client'
import { getGatewayCredentials, getPaymentDriver } from '../services/payments'

// Mesin status langganan. ATURAN: HANYA transitionSubscription() yang menulis Subscription.status
// (pengecualian: signup & override superadmin yang diaudit), dan setiap penulisan menambah
// SubscriptionEvent di klien/transaksi yang sama. Lihat saas-blueprint/07.

export type SubscriptionTransition
  = | 'start_trial' | 'pay' | 'payment_failed' | 'grace_expired' | 'trial_expired'
    | 'cancel' | 'resume' | 'suspend' | 'reinstate'

const ALLOWED: Record<SubscriptionTransition, SubscriptionStatus[]> = {
  start_trial: ['downgraded', 'cancelled'],
  pay: ['trialing', 'active', 'past_due', 'cancelled', 'downgraded'],
  payment_failed: ['active', 'trialing', 'past_due'],
  grace_expired: ['past_due', 'cancelled'],
  trial_expired: ['trialing'],
  cancel: ['trialing', 'active', 'past_due'],
  resume: ['cancelled'],
  suspend: ['trialing', 'active', 'past_due', 'cancelled', 'downgraded'],
  reinstate: ['suspended']
}

export interface TransitionInput {
  tenantId: string
  transition: SubscriptionTransition
  planSlug?: string
  period?: BillingPeriodValue
  reason?: string
  /** lewati penjaga ALLOWED (job sistem, webhook, admin) */
  force?: boolean
  tx?: Prisma.TransactionClient
}

export async function transitionSubscription(input: TransitionInput) {
  const db = input.tx ?? prisma
  const subscription = await db.subscription.findUnique({ where: { tenantId: input.tenantId }, include: { plan: true } })
  if (!subscription) throw notFound('Langganan tidak ditemukan.')
  if (!input.force && !ALLOWED[input.transition].includes(subscription.status)) {
    throw conflict('Perubahan status langganan ini tidak diizinkan.', { from: subscription.status, transition: input.transition })
  }

  const now = new Date()
  const data: Prisma.SubscriptionUncheckedUpdateInput = {}
  let planId = subscription.planId
  let planSlug = subscription.plan.slug
  const period = (input.period ?? subscription.period) as BillingPeriodValue

  const usePlan = async (slug: string) => {
    const plan = await db.plan.findUnique({ where: { slug } })
    if (!plan) throw notFound(`Paket "${slug}" tidak ditemukan.`)
    planId = plan.id
    planSlug = plan.slug
    return plan
  }

  switch (input.transition) {
    case 'start_trial': {
      const plan = await usePlan(input.planSlug ?? await getSetting('billing.trialPlanSlug'))
      Object.assign(data, {
        planId, status: 'trialing', trialEndsAt: new Date(now.getTime() + plan.trialDays * 86400_000),
        graceEndsAt: null, downgradedAt: null, cancelledAt: null
      })
      break
    }
    case 'pay': {
      if (input.planSlug) await usePlan(input.planSlug)
      // Bayar lebih awal ditumpuk di atas sisa waktu — tidak ada hari yang hilang.
      const base = renewalBase(subscription.currentPeriodEnd, now)
      Object.assign(data, {
        planId, period, status: 'active', currentPeriodEnd: periodEnd(base, period),
        graceEndsAt: null, trialEndsAt: null, cancelledAt: null, downgradedAt: null
      })
      break
    }
    case 'payment_failed':
      Object.assign(data, { status: 'past_due', graceEndsAt: new Date(now.getTime() + (await gracePeriodDays()) * 86400_000) })
      break
    case 'trial_expired':
    case 'grace_expired':
      await usePlan(await getSetting('billing.defaultPlanSlug'))
      Object.assign(data, {
        planId, status: 'downgraded', downgradedAt: now,
        graceEndsAt: null, trialEndsAt: null, currentPeriodEnd: null
      })
      break
    case 'cancel':
      // Tetap aktif sampai currentPeriodEnd; cron menurunkan setelahnya.
      Object.assign(data, { status: 'cancelled', cancelledAt: now })
      break
    case 'resume':
      Object.assign(data, {
        status: subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? 'active' : 'trialing',
        cancelledAt: null
      })
      break
    case 'suspend':
      Object.assign(data, { status: 'suspended' })
      break
    case 'reinstate':
      Object.assign(data, { status: subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? 'active' : 'downgraded' })
      break
  }

  const updated = await db.subscription.update({ where: { id: subscription.id }, data })
  await db.subscriptionEvent.create({
    data: {
      tenantId: input.tenantId,
      transition: input.transition,
      fromStatus: subscription.status,
      toStatus: updated.status,
      fromPlanSlug: subscription.plan.slug,
      toPlanSlug: planSlug,
      period: updated.period
    }
  })
  invalidateEntitlements(input.tenantId)
  return { before: subscription, after: updated, planSlug }
}

// ---------------------------------------------------------------------------
// Penegakan setelah turun paket — DATA TIDAK PERNAH DIHAPUS
// ---------------------------------------------------------------------------

/**
 * Kantor melebihi batas → yang lebih baru dinonaktifkan (kantor utama dipertahankan), dan
 * downgradeResolvedAt dikosongkan DALAM transaksi yang sama agar dialog "pilih kantor" muncul.
 */
export async function enforceBranchLimit(tenantId: string): Promise<{ deactivated: number }> {
  const max = await limit(tenantId, 'branches')
  if (max === UNLIMITED) return { deactivated: 0 }
  const active = await prisma.branch.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true }
  })
  const excess = active.slice(Math.max(max, 1)).map(b => b.id)
  if (!excess.length) return { deactivated: 0 }
  await prisma.$transaction([
    prisma.branch.updateMany({ where: { id: { in: excess } }, data: { isActive: false } }),
    prisma.tenant.update({ where: { id: tenantId }, data: { downgradeResolvedAt: null } })
  ])
  invalidateEntitlements(tenantId)
  return { deactivated: excess.length }
}

/** Login Admin HR/Atasan melebihi seat → yang terbaru dinonaktifkan. Pemilik dan login karyawan tidak tersentuh. */
export async function enforceTeamSeatLimit(tenantId: string): Promise<{ deactivated: number }> {
  const max = await limit(tenantId, 'teamMembers')
  if (max === UNLIMITED) return { deactivated: 0 }
  const owners = await prisma.tenantMembership.count({ where: { tenantId, isActive: true, role: 'owner' } })
  const staff = await prisma.tenantMembership.findMany({
    where: { tenantId, isActive: true, role: { in: ['hr_admin', 'manager'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  })
  const keep = Math.max(0, max - owners)
  const excess = staff.slice(keep).map(m => m.id)
  // Undangan tim yang masih menunggu juga memakai seat → dicabut.
  const pending = await prisma.tenantInvitation.findMany({
    where: { tenantId, acceptedAt: null, revokedAt: null, role: { in: ['hr_admin', 'manager'] } },
    select: { id: true }
  })
  if (!excess.length && !pending.length) return { deactivated: 0 }
  await prisma.$transaction([
    prisma.tenantMembership.updateMany({ where: { id: { in: excess } }, data: { isActive: false } }),
    prisma.tenantInvitation.updateMany({ where: { id: { in: pending.map(p => p.id) } }, data: { revokedAt: new Date() } })
  ])
  invalidateEntitlements(tenantId)
  return { deactivated: excess.length }
}

/** Dijalankan setelah trial_expired / grace_expired / override admin. Tidak pernah melempar. */
export async function enforceDowngrade(tenantId: string, options: { notify?: boolean } = { notify: true }) {
  try {
    const branches = await enforceBranchLimit(tenantId)
    const team = await enforceTeamSeatLimit(tenantId)
    // enforceEmployeeLimit() — bersama modul karyawan (fase 11.2).
    const owner = await prisma.tenantMembership.findFirst({ where: { tenantId, role: 'owner', isActive: true }, select: { tenantUserId: true } })
    // Beri tahu pemilik tentang turun paket; bila ada yang dinonaktifkan, ia perlu memilih.
    if (owner && (options.notify || branches.deactivated > 0 || team.deactivated > 0)) {
      await safeCreateNotification({
        audience: 'tenant', tenantUserId: owner.tenantUserId, tenantId, templateKey: 'subscription_downgraded',
        variables: { branchSelectionUrl: '/app/branches' }
      })
    }
    return { branches: branches.deactivated, team: team.deactivated }
  } catch (error) {
    console.error('[subscriptions] enforceDowngrade failed', tenantId, error)
    return { branches: 0, team: 0 }
  }
}

export async function needsBranchSelection(tenantId: string, downgradeResolvedAt: Date | null): Promise<boolean> {
  if (downgradeResolvedAt) return false
  const max = await limit(tenantId, 'branches')
  if (max === UNLIMITED) return false
  return (await prisma.branch.count({ where: { tenantId } })) > max
}

export const selectBranchesSchema = z.object({
  branchIds: z.array(z.string()).min(1, 'Pilih minimal satu kantor.')
})

export async function selectActiveBranches(event: H3Event, input: z.infer<typeof selectBranchesSchema>) {
  const ctx = await requireTenantAbility(event, 'branches.manage')
  const ids = [...new Set(input.branchIds)]
  const max = await limit(ctx.tenantId, 'branches')
  if (max !== UNLIMITED && ids.length > max) {
    throw httpError(402, 'LIMIT_REACHED', `Paket Anda hanya mengizinkan ${formatLimit('branches', max)} kantor aktif.`, { limit: 'branches', max, current: ids.length })
  }
  const owned = await prisma.branch.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, isPrimary: true } })
  if (owned.length !== ids.length) throw notFound('Kantor tidak ditemukan.')
  const primaryKept = owned.some(b => b.isPrimary)

  await prisma.$transaction(async (tx) => {
    await tx.branch.updateMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, data: { isActive: true } })
    await tx.branch.updateMany({ where: { tenantId: ctx.tenantId, id: { notIn: ids } }, data: { isActive: false } })
    if (!primaryKept) {
      // Kantor utama harus aktif: pindahkan ke kantor terpilih pertama.
      await tx.branch.updateMany({ where: { tenantId: ctx.tenantId, isPrimary: true }, data: { isPrimary: false } })
      await tx.branch.update({ where: { id: ids[0]! }, data: { isPrimary: true } })
    }
    await tx.tenant.update({ where: { id: ctx.tenantId }, data: { downgradeResolvedAt: new Date() } })
  })
  invalidateEntitlements(ctx.tenantId)
  await recordAudit(event, {
    audience: 'tenant', action: 'branch.select_active', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, impersonatorId: ctx.impersonatorId, metadata: { count: ids.length }
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Pemilik: lihat, batalkan, lanjutkan
// ---------------------------------------------------------------------------

export async function cancelSubscription(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  await requireNotImpersonating(event)
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId } })
  if (subscription?.providerRef && subscription.provider) {
    try {
      const creds = await getGatewayCredentials(subscription.provider)
      if (creds) await getPaymentDriver(subscription.provider).cancelSubscription(creds, subscription.providerRef)
    } catch (error) {
      console.error('[subscriptions] gateway mandate cancel failed', error) // tidak memblokir transisi lokal
    }
  }
  const result = await transitionSubscription({ tenantId: ctx.tenantId, transition: 'cancel' })
  await recordAudit(event, {
    audience: 'tenant', action: 'subscription.downgrade', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: ctx.tenantId, metadata: { cancelledBy: 'owner', periodEnd: result.after.currentPeriodEnd?.toISOString() ?? null }
  })
  return { success: true, status: result.after.status, currentPeriodEnd: result.after.currentPeriodEnd?.toISOString() ?? null }
}

export async function resumeSubscription(event: H3Event) {
  const ctx = await requireTenantAbility(event, 'billing.manage')
  await requireNotImpersonating(event)
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId } })
  // Hanya bila masih ada waktu berbayar; tanpa itu, jalannya adalah checkout baru.
  if (!subscription?.currentPeriodEnd || subscription.currentPeriodEnd <= new Date()) {
    throw conflict('Masa langganan sudah berakhir. Pilih paket untuk berlangganan lagi.')
  }
  const result = await transitionSubscription({ tenantId: ctx.tenantId, transition: 'resume' })
  await recordAudit(event, { audience: 'tenant', action: 'subscription.resume', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId })
  return { success: true, status: result.after.status }
}
