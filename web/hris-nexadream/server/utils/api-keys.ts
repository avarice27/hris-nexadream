import type { H3Event } from 'h3'
import { z } from 'zod'
import { isTenantRole } from '#shared/utils/tenant-abilities'

// API key perusahaan (fitur paket apiAccess), 12 §7.3.
// Format hn_live_<32 hex> (produksi) / hn_test_<32 hex>; hanya sha256 yang disimpan, plaintext tampil SEKALI.
// Scope: read, write (+ sensitive). Scope ditegakkan per metode HTTP di satu pintu (requireApiKey).

export const API_KEY_SCOPES = ['read', 'write', 'sensitive'] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export interface ApiKeyContext { id: string, name: string, scopes: ApiKeyScope[] }

function keyPrefixForEnv(): string {
  return process.env.NODE_ENV === 'production' && useRuntimeConfig().public.appEnv === 'production' ? 'hn_live_' : 'hn_test_'
}

async function assertKeysEnabled() {
  if (!(await getBooleanSetting('app.apiKeysEnabled'))) throw httpError(403, 'FORBIDDEN', 'API key sedang dinonaktifkan oleh Nexadream.')
}

/**
 * Autentikasi X-Api-Key. Konteks dibangun sebagai PEMILIK perusahaan (integrasi bertindak atas nama
 * perusahaan) dengan nama aktor "API: <nama key>" di log audit. Tanpa scope `sensitive`, kemampuan
 * yang membuka data pribadi/gaji ditolak oleh requireTenantAbility.
 */
export async function requireApiKey(event: H3Event): Promise<TenantContext> {
  if (event.context.tenantContext) return event.context.tenantContext
  const raw = getRequestHeader(event, 'x-api-key')?.trim() ?? ''
  if (!/^hn_(live|test)_[0-9a-f]{32}$/.test(raw)) throw httpError(401, 'INVALID_API_KEY', 'API key tidak valid.')
  await assertKeysEnabled()
  const key = await prisma.apiClient.findUnique({ where: { keyHash: sha256(raw) }, include: { tenant: { include: { subscription: { include: { plan: true } } } } } })
  if (!key || !key.isActive || key.revokedAt) throw httpError(401, 'INVALID_API_KEY', 'API key tidak valid atau sudah dicabut.')
  if (key.tenant.deletedAt) throw httpError(403, 'TENANT_DELETED', 'Akun perusahaan sudah dihapus.')
  if (key.tenant.status !== 'active') throw httpError(403, 'TENANT_SUSPENDED', 'Akun perusahaan sedang ditangguhkan.')
  if (!(await can(key.tenantId, 'apiAccess'))) throw httpError(402, 'PLAN_REQUIRED', 'Akses API tidak tersedia di paket perusahaan ini.', { feature: 'apiAccess' })
  const scopes = key.scopes.filter((s): s is ApiKeyScope => (API_KEY_SCOPES as readonly string[]).includes(s))
  const method = event.method.toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !scopes.includes('write')) {
    throw httpError(403, 'FORBIDDEN', 'API key ini hanya boleh membaca (scope write diperlukan).', { requiredScope: 'write' })
  }
  assertRateLimit('api-key', key.id, 600, 60_000)
  const owner = await prisma.tenantMembership.findFirst({ where: { tenantId: key.tenantId, role: 'owner', isActive: true }, include: { tenantUser: true, branches: { select: { branchId: true } } } })
  if (!owner || !isTenantRole(owner.role)) throw httpError(403, 'FORBIDDEN', 'Perusahaan ini tidak memiliki pemilik aktif.')
  const { tenantUser, branches: _b, ...membership } = owner
  const context: TenantContext = {
    user: { ...tenantUser, name: `API: ${key.name}` },
    tenant: key.tenant,
    membership,
    tenantId: key.tenantId,
    role: 'owner',
    branchIds: null,
    impersonatorId: null,
    claims: { sub: tenantUser.id, aud: 'tenant', tid: key.tenantId } as TenantContext['claims'],
    apiKey: { id: key.id, name: key.name, scopes }
  }
  event.context.tenantContext = context
  // Dicatat best-effort, tidak ditunggu.
  void prisma.apiClient.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return context
}

// --- Kelola key (hanya pemilik, lewat sesi login — key tidak bisa mengelola key) ----------------

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, 'Pilih minimal satu scope.').refine(s => s.includes('read'), 'Scope read wajib.')
})

async function requireOwnerSession(event: H3Event) {
  if (getRequestHeader(event, 'x-api-key')) throw forbidden('API key tidak bisa mengelola API key.')
  const ctx = await requireTenantAbility(event, 'billing.manage') // owner saja
  await requireNotImpersonating(event)
  return ctx
}

function toKeyView(k: { id: string, name: string, keyPrefix: string, scopes: string[], lastUsedAt: Date | null, isActive: boolean, revokedAt: Date | null, createdAt: Date }) {
  return { id: k.id, name: k.name, keyPrefix: k.keyPrefix, scopes: k.scopes, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, isActive: k.isActive && !k.revokedAt, revokedAt: k.revokedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }
}

export async function listApiKeys(event: H3Event) {
  const ctx = await requireOwnerSession(event)
  const rows = await prisma.apiClient.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' } })
  return { items: rows.map(toKeyView), featureAvailable: await can(ctx.tenantId, 'apiAccess'), enabled: await getBooleanSetting('app.apiKeysEnabled') }
}

export async function createApiKey(event: H3Event, input: z.infer<typeof apiKeyCreateSchema>) {
  const ctx = await requireOwnerSession(event)
  await requireEntitlement(event, 'apiAccess')
  await assertKeysEnabled()
  if (await prisma.apiClient.count({ where: { tenantId: ctx.tenantId, isActive: true, revokedAt: null } }) >= 10) throw conflict('Maksimal 10 API key aktif. Cabut key yang tidak dipakai.')
  const plaintext = `${keyPrefixForEnv()}${randomToken(16)}`
  const row = await prisma.apiClient.create({ data: { tenantId: ctx.tenantId, name: input.name, keyHash: sha256(plaintext), keyPrefix: plaintext.slice(0, 16), scopes: [...new Set(input.scopes)] } })
  await recordAudit(event, { audience: 'tenant', action: 'api_client.create', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId, targetType: 'api_client', targetId: row.id, metadata: { scopes: row.scopes } })
  // Plaintext hanya dikembalikan sekarang — tidak pernah lagi.
  return { ...toKeyView(row), key: plaintext }
}

export async function revokeApiKey(event: H3Event, id: string) {
  const ctx = await requireOwnerSession(event)
  const row = await prisma.apiClient.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!row) throw notFound('API key tidak ditemukan.')
  await prisma.apiClient.update({ where: { id }, data: { isActive: false, revokedAt: row.revokedAt ?? new Date() } })
  await recordAudit(event, { audience: 'tenant', action: 'api_client.revoke', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: ctx.tenantId, targetType: 'api_client', targetId: id })
  return { success: true }
}

// --- Admin (staf) ----------------------------------------------------------

export const adminApiClientListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'revoked']).optional()
})

export async function adminListApiClients(event: H3Event, query: z.infer<typeof adminApiClientListSchema>) {
  await requirePermission(event, 'api-clients.read')
  const where = {
    ...(query.status === 'active' ? { isActive: true, revokedAt: null } : query.status === 'revoked' ? { OR: [{ isActive: false }, { revokedAt: { not: null } }] } : {}),
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { keyPrefix: { contains: query.search } }, { tenant: { name: { contains: query.search, mode: 'insensitive' as const } } }] } : {})
  }
  const [rows, total] = await Promise.all([
    prisma.apiClient.findMany({ where, include: { tenant: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.apiClient.count({ where })
  ])
  return { items: rows.map(r => ({ ...toKeyView(r), tenant: r.tenant })), meta: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) } }
}

export async function adminRevokeApiClient(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'api-clients.write')
  const row = await prisma.apiClient.findUnique({ where: { id } })
  if (!row) throw notFound('API key tidak ditemukan.')
  await prisma.apiClient.update({ where: { id }, data: { isActive: false, revokedAt: row.revokedAt ?? new Date() } })
  await recordAudit(event, { audience: 'platform', action: 'api_client.revoke', actorId: ctx.user.id, actorName: ctx.user.name, tenantId: row.tenantId, targetType: 'api_client', targetId: id })
  return { success: true }
}
