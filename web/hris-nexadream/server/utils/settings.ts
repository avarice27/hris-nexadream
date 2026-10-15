import { MASKED_SECRET, SETTINGS_BY_KEY, SETTINGS_CATALOG, settingDefault } from '#shared/utils/settings'

// SATU-SATUNYA pintu ke app_settings. Cache 60 detik per instance (best-effort, Vercel):
// setelah admin menyimpan, instance lain memakai nilai baru paling lambat 60 detik kemudian.

const TTL_MS = 60_000
const cacheStore = globalThis as unknown as { __settingsCache?: { values: Map<string, string | null>, loadedAt: number } }

export async function getAllSettings(): Promise<Map<string, string | null>> {
  const cached = cacheStore.__settingsCache
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.values
  const rows = await prisma.appSetting.findMany({ select: { key: true, value: true, isSecret: true } })
  const values = new Map<string, string | null>()
  for (const row of rows) {
    values.set(row.key, row.isSecret ? decrypt(row.value) : row.value)
  }
  cacheStore.__settingsCache = { values, loadedAt: Date.now() }
  return values
}

export function invalidateSettings() {
  cacheStore.__settingsCache = undefined
}

export async function getSetting(key: string): Promise<string> {
  const values = await getAllSettings()
  const value = values.get(key)
  return value === undefined || value === null ? settingDefault(key) : value
}

export async function getNumberSetting(key: string): Promise<number> {
  const raw = await getSetting(key)
  const value = Number(raw)
  if (raw !== '' && Number.isFinite(value)) return value
  return Number(settingDefault(key)) || 0
}

export async function getBooleanSetting(key: string): Promise<boolean> {
  const value = await getSetting(key)
  return value === 'true' || value === '1'
}

async function writeSetting(key: string, value: string | null) {
  const def = SETTINGS_BY_KEY[key]
  if (!def) throw httpError(400, 'VALIDATION_FAILED', `Pengaturan "${key}" tidak dikenal.`)
  const stored = def.isSecret && value ? encrypt(value) : value
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: stored },
    create: { key, value: stored, group: def.group, type: def.type, label: def.label, isSecret: !!def.isSecret }
  })
}

export async function setSetting(key: string, value: string | null) {
  await writeSetting(key, value)
  invalidateSettings()
}

export async function setSettings(entries: Record<string, string | null>) {
  for (const [key, value] of Object.entries(entries)) await writeSetting(key, value)
  invalidateSettings()
}

/**
 * Compare-and-set atomik sebagai kunci "sekali per hari" yang tahan lama untuk cron.
 * Disimpan di grup 'system' (tidak ada di katalog, tidak tampil di form admin).
 */
export async function claimSettingValue(key: string, value: string): Promise<boolean> {
  const updated = await prisma.appSetting.updateMany({
    where: { key, NOT: { value } },
    data: { value }
  })
  if (updated.count > 0) return true
  try {
    await prisma.appSetting.create({ data: { key, value, group: 'system', type: 'string', label: key } })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Nilai untuk form admin. Rahasia: MASKED_SECRET bila tersimpan, '' bila belum — tidak pernah nilainya. */
export async function settingsForAdmin() {
  const rows = await prisma.appSetting.findMany({ select: { key: true, value: true } })
  const stored = new Map(rows.map(row => [row.key, row.value]))
  const values: Record<string, string> = {}
  for (const def of SETTINGS_CATALOG) {
    const raw = stored.get(def.key)
    if (def.isSecret) values[def.key] = raw ? MASKED_SECRET : ''
    else values[def.key] = raw ?? def.default
  }
  return { catalog: SETTINGS_CATALOG, values }
}

/** Kunci tidak dikenal diabaikan; rahasia bertopeng = tetap; nilai select di luar opsi dilewati. */
export async function updateSettingsFromAdmin(input: Record<string, unknown>) {
  const updates: Record<string, string | null> = {}
  for (const [key, raw] of Object.entries(input)) {
    const def = SETTINGS_BY_KEY[key]
    if (!def) continue
    const value = raw === null || raw === undefined ? '' : String(raw)
    if (def.isSecret && value === MASKED_SECRET) continue
    if (def.type === 'select' && def.options && !def.options.some(o => o.value === value)) continue
    if (def.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
      throw httpError(400, 'VALIDATION_FAILED', `${def.label} harus berupa angka.`, { field: key })
    }
    if (def.type === 'boolean' && !['true', 'false'].includes(value)) continue
    if (def.type === 'json' && value !== '') {
      try {
        JSON.parse(value)
      } catch {
        throw httpError(400, 'VALIDATION_FAILED', `${def.label} harus berupa JSON yang valid.`, { field: key })
      }
    }
    updates[key] = value === '' && def.isSecret ? null : value
  }
  await setSettings(updates)
  return { success: true, updated: Object.keys(updates).length }
}
