import type { H3Event } from 'h3'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { isValidIndonesianPhone, normalizeIndonesianPhone } from '#shared/utils/phone'
import type { Prisma } from '~~/generated/prisma/client'

// Konten: halaman CMS, FAQ, kotak masuk formulir kontak. HTML dari editor DIBERSIHKAN di server
// sebelum disimpan — halaman publik tidak boleh membawa skrip (XSS dari origin kita).

const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) })

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}) }
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

export const pageSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Slug hanya huruf kecil, angka, dan tanda hubung.'),
  title: z.string().trim().min(2, 'Judul minimal 2 karakter.').max(160),
  content: z.string().max(200_000, 'Isi halaman terlalu panjang.'),
  excerpt: z.string().trim().max(300).nullable().optional(),
  metaTitle: z.string().trim().max(70, 'Judul SEO maksimal 70 karakter.').nullable().optional(),
  metaDescription: z.string().trim().max(170, 'Deskripsi SEO maksimal 170 karakter.').nullable().optional(),
  isPublished: z.boolean()
})
export const pageUpdateSchema = pageSchema.partial()

export async function listPages(event: H3Event) {
  await requirePermission(event, 'pages.read')
  const rows = await prisma.page.findMany({ orderBy: { slug: 'asc' }, select: { id: true, slug: true, title: true, isPublished: true, updatedAt: true } })
  return { items: rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() })) }
}

export async function getPage(event: H3Event, id: string) {
  await requirePermission(event, 'pages.read')
  const row = await prisma.page.findUnique({ where: { id } })
  if (!row) throw notFound('Halaman tidak ditemukan.')
  return row
}

export async function createPage(event: H3Event, input: z.infer<typeof pageSchema>) {
  const ctx = await requirePermission(event, 'pages.write')
  if (await prisma.page.findUnique({ where: { slug: input.slug } })) throw conflict('Slug halaman sudah dipakai.', { field: 'slug' })
  const row = await prisma.page.create({ data: { ...input, content: sanitizeRichText(input.content), excerpt: input.excerpt || null, metaTitle: input.metaTitle || null, metaDescription: input.metaDescription || null } })
  await recordAudit(event, { audience: 'platform', action: 'page.create', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'page', targetId: row.id, metadata: { slug: row.slug } })
  return row
}

export async function updatePage(event: H3Event, id: string, input: z.infer<typeof pageUpdateSchema>) {
  const ctx = await requirePermission(event, 'pages.write')
  const row = await prisma.page.findUnique({ where: { id } })
  if (!row) throw notFound('Halaman tidak ditemukan.')
  if (input.slug && input.slug !== row.slug && await prisma.page.findUnique({ where: { slug: input.slug } })) throw conflict('Slug halaman sudah dipakai.', { field: 'slug' })
  const data: Prisma.PageUpdateInput = {
    ...input,
    ...(input.content !== undefined ? { content: sanitizeRichText(input.content) } : {}),
    ...(input.excerpt !== undefined ? { excerpt: input.excerpt || null } : {}),
    ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle || null } : {}),
    ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription || null } : {})
  }
  const updated = await prisma.page.update({ where: { id }, data })
  await recordAudit(event, { audience: 'platform', action: 'page.update', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'page', targetId: id, metadata: { slug: updated.slug } })
  return updated
}

export async function deletePage(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'pages.write')
  const row = await prisma.page.findUnique({ where: { id } })
  if (!row) throw notFound('Halaman tidak ditemukan.')
  if (['privacy', 'terms'].includes(row.slug)) throw conflict('Halaman privasi dan syarat & ketentuan wajib ada. Ubah isinya saja.')
  await prisma.page.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'page.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'page', targetId: id, metadata: { slug: row.slug } })
  return { success: true }
}

/** Publik (SSR): hanya halaman terbit. Token {{...}} diisi dari pengaturan saat dibaca. */
export async function publicPage(slug: string) {
  const row = await prisma.page.findUnique({ where: { slug } })
  if (!row || !row.isPublished) throw notFound('Halaman tidak ditemukan.')
  const content = await fillPageTokens(row.content)
  return { slug: row.slug, title: row.title, content, excerpt: row.excerpt, metaTitle: row.metaTitle, metaDescription: row.metaDescription, updatedAt: row.updatedAt.toISOString() }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Token yang boleh dipakai di isi halaman CMS (mis. kebijakan privasi) agar janji di teks hukum
 * tidak pernah berbeda dari pengaturan. Token tak dikenal dibiarkan apa adanya.
 */
export const PAGE_TOKENS: Record<string, () => Promise<string>> = {
  COMPANY_NAME: () => getSetting('company.name'),
  LEGAL_NAME: async () => (await getSetting('company.legalName')).trim() || 'Nexadream',
  SUPPORT_EMAIL: () => getSetting('company.email'),
  PRIVACY_CONTACT: () => getSetting('privacy.dataProtectionOfficer'),
  DELETE_SLA_DAYS: async () => String(await getNumberSetting('privacy.deleteRequestSlaDays')),
  FINANCIAL_RETENTION_YEARS: async () => String(await getNumberSetting('privacy.financialRetentionYears')),
  BACKUP_RETENTION_DAYS: async () => String(await getNumberSetting('privacy.backupRetentionDays'))
}

async function fillPageTokens(html: string): Promise<string> {
  const found = [...new Set([...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m => m[1]!))].filter(key => PAGE_TOKENS[key])
  if (!found.length) return html
  const values = new Map(await Promise.all(found.map(async key => [key, escapeHtml(await PAGE_TOKENS[key]!())] as const)))
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values.get(key) ?? match)
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const faqSchema = z.object({
  question: z.string().trim().min(5, 'Pertanyaan minimal 5 karakter.').max(300),
  answer: z.string().trim().min(5, 'Jawaban minimal 5 karakter.').max(3000),
  category: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Kategori hanya huruf kecil, angka, dan tanda hubung.').default('umum'),
  order: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true)
})
// Tanpa default untuk PATCH (lihat pelajaran fase 7).
export const faqUpdateSchema = z.object({
  question: faqSchema.shape.question,
  answer: faqSchema.shape.answer,
  category: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'Kategori hanya huruf kecil, angka, dan tanda hubung.'),
  order: z.number().int().min(0).max(1000),
  isActive: z.boolean()
}).partial()

export async function listFaq(event: H3Event) {
  await requirePermission(event, 'faq.read')
  return { items: await prisma.faq.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }) }
}

export async function createFaq(event: H3Event, input: z.infer<typeof faqSchema>) {
  const ctx = await requirePermission(event, 'faq.write')
  const row = await prisma.faq.create({ data: input })
  await recordAudit(event, { audience: 'platform', action: 'faq.create', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'faq', targetId: row.id })
  return row
}

export async function updateFaq(event: H3Event, id: string, input: z.infer<typeof faqUpdateSchema>) {
  const ctx = await requirePermission(event, 'faq.write')
  if (!await prisma.faq.findUnique({ where: { id } })) throw notFound('FAQ tidak ditemukan.')
  const row = await prisma.faq.update({ where: { id }, data: input })
  await recordAudit(event, { audience: 'platform', action: 'faq.update', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'faq', targetId: id })
  return row
}

export async function deleteFaq(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'faq.write')
  if (!await prisma.faq.findUnique({ where: { id } })) throw notFound('FAQ tidak ditemukan.')
  await prisma.faq.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'faq.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'faq', targetId: id })
  return { success: true }
}

export async function publicFaq() {
  const rows = await prisma.faq.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, question: true, answer: true, category: true } })
  return { items: rows }
}

// ---------------------------------------------------------------------------
// Formulir kontak (publik) + kotak masuk
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  email: z.email('Masukkan alamat email yang valid.'),
  phone: z.string().trim().refine(v => v === '' || isValidIndonesianPhone(v), 'Masukkan nomor HP yang valid.').optional(),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(10, 'Pesan minimal 10 karakter.').max(5000, 'Pesan terlalu panjang.'),
  /** honeypot — harus kosong; bot yang mengisinya diterima diam-diam lalu dibuang */
  website: z.string().max(200).optional()
})

export async function submitContactMessage(event: H3Event, input: z.infer<typeof contactSchema>) {
  const perHour = await getNumberSetting('app.contactRateLimitPerHour')
  await assertSharedRateLimit('contact', clientIp(event), Math.max(1, perHour), 60 * 60 * 1000)
  if (input.website) return { success: true } // bot

  const row = await prisma.contactMessage.create({
    data: {
      name: input.name, email: input.email.toLowerCase(), phone: input.phone ? normalizeIndonesianPhone(input.phone) : null,
      subject: input.subject || null, message: input.message, ip: clientIp(event)
    }
  })
  // Salinan ke kotak masuk perusahaan + bel staf. Kegagalan tidak membatalkan pesan yang tersimpan.
  await sendTemplatedEmail({
    to: await getSetting('company.email'),
    templateKey: 'contact_enquiry',
    params: { name: row.name, email: row.email, phone: row.phone, subject: row.subject ?? '(tanpa subjek)', message: row.message }
  })
  await notifyPlatform('messages.read', {
    templateKey: 'admin_new_message',
    variables: { name: row.name, subject: row.subject ?? row.message.slice(0, 60) },
    channels: { email: false }
  })
  return { success: true }
}

export const messageListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['new', 'read', 'replied', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export async function listMessages(event: H3Event, query: z.infer<typeof messageListSchema>) {
  await requirePermission(event, 'messages.read')
  const where: Prisma.ContactMessageWhereInput = {
    ...(query.status ? { status: query.status } : { status: { not: 'archived' } }),
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } }] } : {})
  }
  const [items, total, unread] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.count({ where: { status: 'new' } })
  ])
  return {
    items: items.map(m => ({ ...m, ip: undefined, handledAt: m.handledAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })),
    unread,
    meta: meta(query.page, query.limit, total)
  }
}

export const messageUpdateSchema = z.object({ status: z.enum(['new', 'read', 'replied', 'archived']) })

export async function updateMessageStatus(event: H3Event, id: string, input: z.infer<typeof messageUpdateSchema>) {
  const ctx = await requirePermission(event, 'messages.write')
  const row = await prisma.contactMessage.findUnique({ where: { id } })
  if (!row) throw notFound('Pesan tidak ditemukan.')
  await prisma.contactMessage.update({
    where: { id },
    // handledAt diisi pada status non-new pertama; dikosongkan saat dikembalikan ke new.
    data: { status: input.status, handledAt: input.status === 'new' ? null : (row.handledAt ?? new Date()) }
  })
  await recordAudit(event, { audience: 'platform', action: 'message.status', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'contact_message', targetId: id, metadata: { status: input.status } })
  return { success: true }
}

export async function deleteMessage(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'messages.write')
  if (!await prisma.contactMessage.findUnique({ where: { id } })) throw notFound('Pesan tidak ditemukan.')
  await prisma.contactMessage.delete({ where: { id } })
  await recordAudit(event, { audience: 'platform', action: 'message.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'contact_message', targetId: id })
  return { success: true }
}
