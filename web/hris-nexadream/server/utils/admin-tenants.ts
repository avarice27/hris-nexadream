import type { H3Event } from 'h3'
import { z } from 'zod'
import { BILLING_PERIODS } from '#shared/utils/payments'
import { formatDateId } from '#shared/utils/format'
import type { Prisma, SubscriptionStatus } from '~~/generated/prisma/client'

// Back-office: perusahaan. ATURAN D7: staf platform hanya melihat profil perusahaan, langganan,
// hitungan & metadata — TIDAK PERNAH baris data karyawan, gaji, atau dokumen.

export const tenantListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  planSlug: z.string().trim().max(40).optional(),
  subscriptionStatus: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended']).optional(),
  deleteRequested: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export async function adminListTenants(event: H3Event, query: z.infer<typeof tenantListSchema>) {
  await requirePermission(event, 'tenants.read')
  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.deleteRequested ? { deleteRequestedAt: { not: null } } : {}),
    ...(query.planSlug || query.subscriptionStatus
      ? { subscription: { ...(query.planSlug ? { plan: { slug: query.planSlug } } : {}), ...(query.subscriptionStatus ? { status: query.subscriptionStatus } : {}) } }
      : {}),
    ...(query.search
      ? { OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search.replace(/\D/g, '') || query.search } },
          { slug: { contains: query.search.toLowerCase() } }
        ] }
      : {})
  }
  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        subscription: { include: { plan: { select: { slug: true, name: true } } } },
        _count: { select: { branches: true, memberships: true } }
      }
    }),
    prisma.tenant.count({ where })
  ])
  return {
    items: items.map(t => ({
      id: t.id, name: t.name, slug: t.slug, email: t.email, phone: t.phone, status: t.status,
      onboarded: !!t.onboardingCompletedAt, deleteRequestedAt: t.deleteRequestedAt?.toISOString() ?? null,
      branchCount: t._count.branches, memberCount: t._count.memberships, createdAt: t.createdAt.toISOString(),
      subscription: t.subscription
        ? {
            status: t.subscription.status, plan: t.subscription.plan, period: t.subscription.period,
            trialEndsAt: t.subscription.trialEndsAt?.toISOString() ?? null,
            currentPeriodEnd: t.subscription.currentPeriodEnd?.toISOString() ?? null
          }
        : null
    })),
    meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) }
  }
}

export async function adminTenantDetail(event: H3Event, id: string) {
  await requirePermission(event, 'tenants.read')
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      branches: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      memberships: {
        where: { role: { in: ['owner', 'hr_admin', 'manager'] } },
        include: { tenantUser: { select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true, lastSeenAt: true } } },
        orderBy: { createdAt: 'asc' }
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 10 }
    }
  })
  if (!tenant || tenant.deletedAt) throw notFound('Perusahaan tidak ditemukan.')

  const [entitlements, usage, essLogins, deleteRequest, events] = await Promise.all([
    getEntitlements(id),
    usageSummary(id),
    prisma.tenantMembership.count({ where: { tenantId: id, role: 'employee', isActive: true } }),
    tenant.deleteRequestedAt
      ? prisma.auditLog.findFirst({ where: { tenantId: id, action: 'tenant.delete_request' }, orderBy: { createdAt: 'desc' } })
      : null,
    prisma.subscriptionEvent.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 10 })
  ])

  return {
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug, legalName: tenant.legalName, industry: tenant.industry,
      email: tenant.email, phone: tenant.phone, timezone: tenant.timezone, logoUrl: tenant.logoUrl, status: tenant.status,
      suspendedAt: tenant.suspendedAt?.toISOString() ?? null, suspendedReason: tenant.suspendedReason,
      // NPWP tidak pernah ditampilkan ke staf — cukup "sudah diisi" (D7).
      hasNpwp: !!tenant.npwp,
      onboardingCompletedAt: tenant.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: tenant.createdAt.toISOString()
    },
    subscription: tenant.subscription
      ? {
          status: tenant.subscription.status, period: tenant.subscription.period,
          plan: { slug: tenant.subscription.plan.slug, name: tenant.subscription.plan.name },
          trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: tenant.subscription.currentPeriodEnd?.toISOString() ?? null,
          graceEndsAt: tenant.subscription.graceEndsAt?.toISOString() ?? null,
          cancelledAt: tenant.subscription.cancelledAt?.toISOString() ?? null
        }
      : null,
    entitlements: { planName: entitlements.planName, effectivePlanSlug: entitlements.effectivePlanSlug, limits: entitlements.limits, features: entitlements.features },
    usage: { ...usage, essLogins },
    branches: tenant.branches.map(b => ({ id: b.id, name: b.name, timezone: b.timezone, isActive: b.isActive, isPrimary: b.isPrimary })),
    team: tenant.memberships.map(m => ({
      id: m.id, role: m.role, isActive: m.isActive,
      user: { ...m.tenantUser, lastLoginAt: m.tenantUser.lastLoginAt?.toISOString() ?? null, lastSeenAt: m.tenantUser.lastSeenAt?.toISOString() ?? null }
    })),
    payments: tenant.payments.map(p => ({
      id: p.id, orderId: p.orderId, status: p.status, amount: p.amount, planSlug: p.planSlug, period: p.period,
      paidAt: p.paidAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString()
    })),
    subscriptionEvents: events.map(e => ({ transition: e.transition, fromStatus: e.fromStatus, toStatus: e.toStatus, fromPlanSlug: e.fromPlanSlug, toPlanSlug: e.toPlanSlug, createdAt: e.createdAt.toISOString() })),
    deleteRequest: tenant.deleteRequestedAt
      ? {
          requestedAt: tenant.deleteRequestedAt.toISOString(),
          reason: tenant.deleteRequestReason,
          by: deleteRequest?.actorName ?? null
        }
      : null
  }
}

// ---------------------------------------------------------------------------
// Tindakan
// ---------------------------------------------------------------------------

export const suspendSchema = z.object({ reason: z.string().trim().min(5, 'Tulis alasan penangguhan (minimal 5 karakter).').max(500) })

async function ownerOf(tenantId: string) {
  return prisma.tenantMembership.findFirst({ where: { tenantId, role: 'owner' }, include: { tenantUser: { select: { id: true, name: true, email: true } } } })
}

export async function suspendTenant(event: H3Event, id: string, input: z.infer<typeof suspendSchema>) {
  const ctx = await requirePermission(event, 'tenants.write')
  const tenant = await prisma.tenant.findUnique({ where: { id } })
  if (!tenant || tenant.deletedAt) throw notFound('Perusahaan tidak ditemukan.')
  if (tenant.status === 'suspended') throw conflict('Perusahaan ini sudah ditangguhkan.')
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id }, data: { status: 'suspended', suspendedAt: new Date(), suspendedReason: input.reason } })
    await transitionSubscription({ tenantId: id, transition: 'suspend', force: true, tx })
  })
  const owner = await ownerOf(id)
  if (owner) await safeCreateNotification({ audience: 'tenant', tenantUserId: owner.tenantUserId, tenantId: id, templateKey: 'tenant_suspended' })
  await recordAudit(event, {
    audience: 'platform', action: 'tenant.suspend', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, tenantId: id, targetType: 'tenant', targetId: id, metadata: { reason: input.reason }
  })
  return { success: true }
}

export async function reinstateTenant(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'tenants.write')
  const tenant = await prisma.tenant.findUnique({ where: { id } })
  if (!tenant || tenant.deletedAt) throw notFound('Perusahaan tidak ditemukan.')
  if (tenant.status !== 'suspended') throw conflict('Perusahaan ini tidak sedang ditangguhkan.')
  const result = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id }, data: { status: 'active', suspendedAt: null, suspendedReason: null } })
    return transitionSubscription({ tenantId: id, transition: 'reinstate', force: true, tx })
  })
  // Dipulihkan tanpa sisa masa berbayar → paket bawaan; tegakkan batasnya.
  if (result.after.status === 'downgraded') await enforceDowngrade(id, { notify: false })
  await recordAudit(event, {
    audience: 'platform', action: 'tenant.reinstate', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, tenantId: id, targetType: 'tenant', targetId: id, metadata: { subscriptionStatus: result.after.status }
  })
  return { success: true, subscriptionStatus: result.after.status }
}

export const planOverrideSchema = z.object({
  planSlug: z.string().trim().min(1, 'Pilih paket.'),
  period: z.enum(BILLING_PERIODS),
  status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'downgraded']),
  currentPeriodEnd: z.iso.datetime({ offset: true, message: 'Tanggal akhir periode tidak valid.' }).nullable().optional(),
  note: z.string().trim().max(500).optional()
})

/**
 * Override paket (negosiasi / kompensasi). Sengaja MELEWATI penjaga transisi — inilah satu-satunya
 * penulis status selain transitionSubscription, dan tetap menulis SubscriptionEvent('admin_override').
 */
export async function overrideTenantPlan(event: H3Event, id: string, input: z.infer<typeof planOverrideSchema>) {
  const ctx = await requirePermission(event, 'subscriptions.write')
  const tenant = await prisma.tenant.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } })
  if (!tenant || tenant.deletedAt || !tenant.subscription) throw notFound('Perusahaan tidak ditemukan.')
  if (tenant.status === 'suspended') throw conflict('Pulihkan perusahaan terlebih dahulu sebelum mengubah paket.')
  const plan = await prisma.plan.findUnique({ where: { slug: input.planSlug } })
  if (!plan) throw notFound('Paket tidak ditemukan.')

  const now = new Date()
  const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null
  if ((input.status === 'active' || input.status === 'cancelled') && (!end || end <= now)) {
    throw httpError(400, 'VALIDATION_FAILED', 'Status aktif/dibatalkan membutuhkan tanggal akhir periode di masa depan.', { field: 'currentPeriodEnd' })
  }
  const before = tenant.subscription
  const status = input.status as SubscriptionStatus
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: before.id },
      data: {
        planId: plan.id,
        period: input.period,
        status,
        currentPeriodEnd: status === 'active' || status === 'cancelled' || status === 'past_due' ? end : null,
        trialEndsAt: status === 'trialing' ? (end ?? new Date(now.getTime() + plan.trialDays * 86400_000)) : null,
        graceEndsAt: status === 'past_due' ? new Date(now.getTime() + (await gracePeriodDays()) * 86400_000) : null,
        cancelledAt: status === 'cancelled' ? now : null,
        downgradedAt: status === 'downgraded' ? now : null
      }
    })
    await tx.subscriptionEvent.create({
      data: {
        tenantId: id, transition: 'admin_override', fromStatus: before.status, toStatus: status,
        fromPlanSlug: before.plan.slug, toPlanSlug: plan.slug, period: input.period
      }
    })
  })
  invalidateEntitlements(id)
  const enforced = await enforceDowngrade(id, { notify: false })
  await recordAudit(event, {
    audience: 'platform', action: 'subscription.plan_change', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, tenantId: id, targetType: 'subscription', targetId: before.id,
    metadata: { from: { plan: before.plan.slug, status: before.status }, to: { plan: plan.slug, status, period: input.period, currentPeriodEnd: end?.toISOString() ?? null }, note: input.note ?? null, enforced }
  })
  return { success: true, enforced }
}

/** Hapus lunak (superadmin). Pembersihan permanen dilakukan job terpisah setelah masa retensi. */
export async function softDeleteTenant(event: H3Event, id: string) {
  const ctx = await requireSuperAdmin(event)
  if (ctx.impersonatorId) throw forbidden('Tidak tersedia selama sesi impersonasi.')
  const tenant = await prisma.tenant.findUnique({ where: { id } })
  if (!tenant || tenant.deletedAt) throw notFound('Perusahaan tidak ditemukan.')
  const owner = await ownerOf(id)
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id }, data: { deletedAt: now, status: 'deleted' } })
    // Semua login keluar dari perusahaan ini (keanggotaan dinonaktifkan, tidak dihapus).
    await tx.tenantMembership.updateMany({ where: { tenantId: id }, data: { isActive: false } })
  })
  invalidateEntitlements(id)
  // Pesan terakhirnya: email (bel tidak akan terbaca lagi).
  if (owner) {
    await sendTemplatedEmail({
      to: owner.tenantUser.email,
      templateKey: 'tenant_deleted',
      params: { name: owner.tenantUser.name, tenantName: tenant.name, deletedAt: formatDateId(now, tenant.timezone) }
    })
  }
  await recordAudit(event, {
    audience: 'platform', action: 'tenant.delete', actorId: ctx.user.id, actorName: ctx.user.name,
    tenantId: id, targetType: 'tenant', targetId: id, metadata: { name: tenant.name, hadDeleteRequest: !!tenant.deleteRequestedAt }
  })
  return { success: true }
}
