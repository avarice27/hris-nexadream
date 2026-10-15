import type { H3Event } from 'h3'
import type { Prisma } from '~~/generated/prisma/client'

export interface AuditInput {
  audience: 'tenant' | 'platform'
  action: string
  actorId?: string | null
  actorName?: string | null
  impersonatorId?: string | null
  tenantId?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}

function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null
  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : null
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : null
  return [browser, os].filter(Boolean).join(' di ') || null
}

/**
 * Menulis satu baris audit. TIDAK PERNAH melempar error — kegagalan audit tidak boleh
 * menggagalkan aksi yang dicatatnya. Untuk aktor tenant, id disimpan di metadata.tenantUserId.
 * Jangan pernah memasukkan NILAI data sensitif ke metadata (hanya nama field).
 */
export async function recordAudit(event: H3Event | null, input: AuditInput): Promise<void> {
  try {
    const ip = event ? clientIp(event) : null
    const userAgent = event ? (getRequestHeader(event, 'user-agent') || null) : null
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) }
    if (input.action.startsWith('auth.') || input.action === 'tenant.register') {
      metadata.device = describeDevice(userAgent)
      metadata.ip = ip
    }
    if (input.audience === 'tenant' && input.actorId) {
      metadata.tenantUserId = input.actorId
    }
    await prisma.auditLog.create({
      data: {
        audience: input.audience,
        actorId: input.audience === 'platform' ? (input.actorId ?? null) : null,
        actorName: input.actorName ?? null,
        impersonatorId: input.impersonatorId ?? null,
        tenantId: input.tenantId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: metadata as Prisma.InputJsonValue,
        ip,
        userAgent
      }
    })
  } catch (error) {
    console.error('[audit] failed to record', input.action, error)
  }
}
