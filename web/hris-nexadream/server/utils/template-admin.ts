import type { H3Event } from 'h3'
import { z } from 'zod'
import { COMMON_EMAIL_VARIABLES, NOTIFICATION_LEVELS, renderTemplateString, sampleVariables, type TemplateVariable } from '#shared/utils/templates'
import { wrapEmailHtml } from '#shared/utils/email-brand'

// Editor templat di /admin. Kunci tidak dibuat/dihapus dari UI (dirujuk oleh kode).

function parseVariables(raw: unknown): TemplateVariable[] {
  return Array.isArray(raw) ? raw.filter((v): v is TemplateVariable => !!v && typeof v === 'object' && 'token' in v) : []
}

/** Token di salinan yang tidak ada di daftar variabel → akan dirender kosong. */
export function unknownTokens(sources: string[], variables: TemplateVariable[]): string[] {
  const known = new Set([...COMMON_EMAIL_VARIABLES, ...variables].map(v => v.token))
  const found = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(/\{\{\s*[#/]?\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(match[1]!)
  }
  return [...found].filter(token => !known.has(token))
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const emailTemplateUpdateSchema = z.object({
  subject: z.string().trim().min(1, 'Subjek wajib diisi.').max(200, 'Subjek terlalu panjang.'),
  body: z.string().trim().min(1, 'Isi email wajib diisi.').max(20000, 'Isi email terlalu panjang.'),
  isActive: z.boolean()
})

export const emailTemplatePreviewSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(20000),
  variables: z.array(z.object({ token: z.string(), label: z.string(), sample: z.string() })).default([])
})

export async function listEmailTemplates(event: H3Event) {
  await requirePermission(event, 'email-templates.read')
  const rows = await prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } })
  return {
    items: rows.map(row => ({ ...row, variables: parseVariables(row.variables), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    commonVariables: COMMON_EMAIL_VARIABLES
  }
}

export async function updateEmailTemplate(event: H3Event, id: string, input: z.infer<typeof emailTemplateUpdateSchema>) {
  const ctx = await requirePermission(event, 'email-templates.write')
  const existing = await prisma.emailTemplate.findUnique({ where: { id } })
  if (!existing) throw notFound('Templat tidak ditemukan.')
  const unknown = unknownTokens([input.subject, input.body], parseVariables(existing.variables))
  if (unknown.length) {
    throw httpError(400, 'VALIDATION_FAILED', `Variabel tidak dikenal: ${unknown.map(t => `{{${t}}}`).join(', ')}. Gunakan variabel dari daftar.`, { field: 'body' })
  }
  const updated = await prisma.emailTemplate.update({ where: { id }, data: input })
  await recordAudit(event, {
    audience: 'platform', action: 'template.update', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, targetType: 'email_template', targetId: id, metadata: { key: existing.key, isActive: input.isActive }
  })
  return { ...updated, variables: parseVariables(updated.variables) }
}

export async function previewEmailTemplate(event: H3Event, input: z.infer<typeof emailTemplatePreviewSchema>) {
  await requirePermission(event, 'email-templates.read')
  const params = { ...sampleVariables(input.variables), ...(await commonEmailVariables()) }
  const subject = renderTemplateString(input.subject, params)
  const html = wrapEmailHtml(renderTemplateString(input.body, params, true), await emailBrand(), subject)
  return { subject, html, unknownTokens: unknownTokens([input.subject, input.body], input.variables) }
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------

export const notificationTemplateUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(150, 'Judul terlalu panjang.'),
  body: z.string().trim().max(500, 'Isi terlalu panjang.'),
  actionLabel: z.string().trim().max(40, 'Label tombol terlalu panjang.').nullable().optional(),
  actionUrl: z.string().trim().max(300).refine(v => v === '' || v.startsWith('/'), 'Tautan harus diawali "/" (halaman di dalam aplikasi).').nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  level: z.enum(NOTIFICATION_LEVELS as [string, ...string[]]),
  isActive: z.boolean()
})

export async function listNotificationTemplates(event: H3Event) {
  await requirePermission(event, 'notification-templates.read')
  const rows = await prisma.notificationTemplate.findMany({ orderBy: { name: 'asc' } })
  return { items: rows.map(row => ({ ...row, variables: parseVariables(row.variables), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) }
}

export async function updateNotificationTemplate(event: H3Event, id: string, input: z.infer<typeof notificationTemplateUpdateSchema>) {
  const ctx = await requirePermission(event, 'notification-templates.write')
  const existing = await prisma.notificationTemplate.findUnique({ where: { id } })
  if (!existing) throw notFound('Templat tidak ditemukan.')
  const unknown = unknownTokens([input.title, input.body, input.actionUrl ?? ''], parseVariables(existing.variables))
  if (unknown.length) {
    throw httpError(400, 'VALIDATION_FAILED', `Variabel tidak dikenal: ${unknown.map(t => `{{${t}}}`).join(', ')}. Gunakan variabel dari daftar.`, { field: 'body' })
  }
  const updated = await prisma.notificationTemplate.update({
    where: { id },
    data: {
      title: input.title,
      body: input.body,
      actionLabel: input.actionLabel || null,
      actionUrl: input.actionUrl || null,
      icon: input.icon || null,
      level: input.level,
      isActive: input.isActive
    }
  })
  await recordAudit(event, {
    audience: 'platform', action: 'template.update', actorId: ctx.user.id, actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId, targetType: 'notification_template', targetId: id, metadata: { key: existing.key, isActive: input.isActive }
  })
  return { ...updated, variables: parseVariables(updated.variables) }
}
