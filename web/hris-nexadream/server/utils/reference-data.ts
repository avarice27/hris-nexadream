import type { H3Event } from 'h3'
import { z } from 'zod'
import { DEFAULT_PAYROLL_REFERENCE, type PayrollReference } from '#shared/utils/payroll-rules'
import { dateKeyToDb, dbDateToKey } from '#shared/utils/timezone'
import type { Prisma } from '~~/generated/prisma/client'

// Data referensi statutori yang dipelihara staf platform (/admin/reference-data), berlaku-tanggal.
// Kunci: 'payroll' (TER, Pasal 17, PTKP, BPJS) dan 'national_holidays' (per tahun).
// Payroll untuk sebuah periode membaca baris yang berlaku pada akhir periode itu.

export const REFERENCE_KEYS = ['payroll', 'national_holidays'] as const
export type ReferenceKey = (typeof REFERENCE_KEYS)[number]

const bracketsSchema = z.array(z.object({ upTo: z.number().positive().nullable(), rate: z.number().min(0).max(100) })).min(1)
  .refine(list => list.at(-1)?.upTo === null, 'Lapisan terakhir harus tanpa batas (upTo: null).')
  .refine(list => list.slice(0, -1).every((b, i, arr) => i === 0 || (b.upTo ?? 0) > (arr[i - 1]!.upTo ?? 0)), 'Batas lapisan harus naik.')

export const payrollReferenceSchema = z.object({
  ter: z.object({ A: bracketsSchema, B: bracketsSchema, C: bracketsSchema }),
  progressive: bracketsSchema,
  ptkp: z.object({ base: z.number().positive(), married: z.number().min(0), perDependent: z.number().min(0), maxDependents: z.number().int().min(0).max(10) }),
  bpjs: z.object({
    kesehatanCompany: z.number().min(0).max(20), kesehatanEmployee: z.number().min(0).max(20), kesehatanWageCap: z.number().positive(),
    jhtCompany: z.number().min(0).max(20), jhtEmployee: z.number().min(0).max(20),
    jpCompany: z.number().min(0).max(20), jpEmployee: z.number().min(0).max(20), jpWageCap: z.number().positive(),
    jkm: z.number().min(0).max(20)
  }),
  occupationalCostRate: z.number().min(0).max(100),
  occupationalCostMaxMonthly: z.number().min(0)
})

export const nationalHolidaysSchema = z.object({
  items: z.array(z.object({ date: dateKeySchema, name: z.string().trim().min(2).max(100), isCollectiveLeave: z.boolean().optional() })).max(60)
})

const DATA_SCHEMAS: Record<ReferenceKey, z.ZodType> = { payroll: payrollReferenceSchema, national_holidays: nationalHolidaysSchema }

// Cache per instance (best-effort, 60 detik) — tarif jarang berubah.
const cache = new Map<string, { value: unknown, at: number }>()
const TTL = 60_000
function invalidate() {
  cache.clear()
}

async function effectiveRow(key: ReferenceKey, onDateKey: string) {
  const cacheKey = `${key}:${onDateKey}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL) return hit.value as { data: unknown, effectiveFrom: Date } | null
  const row = await prisma.referenceData.findFirst({ where: { key, effectiveFrom: { lte: dateKeyToDb(onDateKey) } }, orderBy: { effectiveFrom: 'desc' } })
  cache.set(cacheKey, { value: row, at: Date.now() })
  return row
}

/** Tarif payroll yang berlaku pada tanggal itu; nilai bawaan bila belum ada baris valid. */
export async function getPayrollReference(onDateKey: string): Promise<PayrollReference & { effectiveFrom: string | null }> {
  const row = await effectiveRow('payroll', onDateKey)
  const parsed = row ? payrollReferenceSchema.safeParse(row.data) : null
  if (parsed?.success) return { ...(parsed.data as PayrollReference), effectiveFrom: dbDateToKey(row!.effectiveFrom) }
  return { ...DEFAULT_PAYROLL_REFERENCE, effectiveFrom: null }
}

export async function nationalHolidays(year: number): Promise<Array<{ date: string, name: string, isCollectiveLeave?: boolean }>> {
  const row = await prisma.referenceData.findUnique({ where: { key_effectiveFrom: { key: 'national_holidays', effectiveFrom: dateKeyToDb(`${year}-01-01`) } } })
  const parsed = row ? nationalHolidaysSchema.safeParse(row.data) : null
  return parsed?.success ? parsed.data.items.filter(i => i.date.startsWith(`${year}-`)) : []
}

// --- Admin ---------------------------------------------------------------

export async function listReferenceData(event: H3Event) {
  await requirePermission(event, 'reference-data.read')
  const rows = await prisma.referenceData.findMany({ orderBy: [{ key: 'asc' }, { effectiveFrom: 'desc' }] })
  return {
    items: rows.map(r => ({ id: r.id, key: r.key, effectiveFrom: dbDateToKey(r.effectiveFrom), data: r.data, note: r.note, updatedAt: r.updatedAt.toISOString() })),
    defaults: { payroll: DEFAULT_PAYROLL_REFERENCE }
  }
}

export const referenceUpsertSchema = z.object({
  key: z.enum(REFERENCE_KEYS),
  effectiveFrom: dateKeySchema,
  data: z.unknown(),
  note: z.string().trim().max(300).nullable().optional()
})

export async function upsertReferenceData(event: H3Event, input: z.infer<typeof referenceUpsertSchema>) {
  const ctx = await requirePermission(event, 'reference-data.write')
  if (input.key === 'national_holidays' && !input.effectiveFrom.endsWith('-01-01')) {
    throw httpError(400, 'VALIDATION_FAILED', 'Libur nasional disimpan per tahun: tanggal berlaku harus 1 Januari.', { field: 'effectiveFrom' })
  }
  const parsed = DATA_SCHEMAS[input.key].safeParse(input.data)
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_FAILED', `Data tidak valid: ${parsed.error.issues[0]?.path.join('.') || ''} ${parsed.error.issues[0]?.message ?? ''}`.trim())
  }
  const effectiveFrom = dateKeyToDb(input.effectiveFrom)
  const row = await prisma.referenceData.upsert({
    where: { key_effectiveFrom: { key: input.key, effectiveFrom } },
    update: { data: parsed.data as Prisma.InputJsonValue, note: input.note ?? null, updatedById: ctx.user.id },
    create: { key: input.key, effectiveFrom, data: parsed.data as Prisma.InputJsonValue, note: input.note ?? null, updatedById: ctx.user.id }
  })
  invalidate()
  await recordAudit(event, { audience: 'platform', action: 'reference_data.update', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'reference_data', targetId: row.id, metadata: { key: input.key, effectiveFrom: input.effectiveFrom } })
  return { id: row.id }
}

export async function deleteReferenceData(event: H3Event, id: string) {
  const ctx = await requirePermission(event, 'reference-data.write')
  const row = await prisma.referenceData.findUnique({ where: { id } })
  if (!row) throw notFound('Data referensi tidak ditemukan.')
  // Run payroll yang sudah disetujui menyimpan snapshot hasilnya, jadi menghapus versi lama aman.
  await prisma.referenceData.delete({ where: { id } })
  invalidate()
  await recordAudit(event, { audience: 'platform', action: 'reference_data.delete', actorId: ctx.user.id, actorName: ctx.user.name, targetType: 'reference_data', targetId: id, metadata: { key: row.key, effectiveFrom: dbDateToKey(row.effectiveFrom) } })
  return { success: true }
}
