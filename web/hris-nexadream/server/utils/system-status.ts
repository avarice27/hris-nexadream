import type { H3Event } from 'h3'
import { getStorageDriver } from '../services/storage'

// Kesiapan produksi (fase 12): pemeriksaan konfigurasi tanpa pernah membuka nilai rahasia.

export interface ReadinessCheck { key: string, label: string, ok: boolean, severity: 'error' | 'warning', hint: string }

function secretCheck(key: string, label: string, value: string | undefined, others: Array<string | undefined>): ReadinessCheck {
  const ok = !!value && value.length >= 32 && !others.includes(value)
  return { key, label, ok, severity: 'error', hint: ok ? 'Terpasang.' : `Isi ${key} dengan string acak ≥ 32 karakter, berbeda dari rahasia lain.` }
}

export async function readinessChecks(): Promise<ReadinessCheck[]> {
  const env = process.env
  const production = useRuntimeConfig().public.appEnv === 'production'
  let storageOk: boolean
  try {
    storageOk = getStorageDriver().provider !== 'local'
  } catch {
    storageOk = false
  }
  const [gateway, smtpHost, siteUrl, superadmins] = await Promise.all([
    prisma.paymentGateway.findFirst({ where: { isActive: true }, select: { id: true, isSandbox: true } }),
    getSetting('smtp.host'),
    getSetting('company.siteUrl'),
    prisma.user.count({ where: { isActive: true, role: { isSuperAdmin: true } } })
  ])
  const dbUrl = env.DATABASE_URL ?? ''
  return [
    secretCheck('JWT_SECRET', 'Kunci token login', env.JWT_SECRET, [env.SETTINGS_SECRET, env.HR_DATA_KEY]),
    secretCheck('SETTINGS_SECRET', 'Kunci enkripsi pengaturan', env.SETTINGS_SECRET, [env.JWT_SECRET, env.HR_DATA_KEY]),
    secretCheck('HR_DATA_KEY', 'Kunci enkripsi data karyawan (D7)', env.HR_DATA_KEY, [env.JWT_SECRET, env.SETTINGS_SECRET]),
    { key: 'DATABASE_URL', label: 'Database pooled (Neon)', ok: /pooler|pgbouncer=true/.test(dbUrl), severity: 'warning', hint: 'Gunakan URL pooler Neon (host berakhiran -pooler) untuk serverless.' },
    { key: 'STORAGE', label: 'Penyimpanan file (Supabase/S3)', ok: storageOk, severity: 'error', hint: 'Atur STORAGE_PROVIDER dan kredensialnya; buat bucket publik & PRIVAT.' },
    { key: 'SMTP', label: 'Email keluar (SMTP)', ok: !!smtpHost, severity: 'error', hint: 'Isi Pengaturan → Email keluar lalu kirim email uji.' },
    { key: 'GATEWAY', label: 'Payment gateway aktif (non-sandbox)', ok: !!gateway && !gateway.isSandbox, severity: 'error', hint: 'Aktifkan Nexadream Payment Hub dengan API key produksi.' },
    { key: 'SITE_URL', label: 'URL situs https', ok: siteUrl.startsWith('https://') && (!production || !siteUrl.includes('localhost')), severity: 'warning', hint: 'Pengaturan → URL situs dipakai di tautan email.' },
    { key: 'SUPERADMIN', label: 'Superadmin aktif', ok: superadmins > 0, severity: 'error', hint: 'Jalankan seed dengan SEED_SUPERADMIN_PASSWORD, lalu ganti kata sandi setelah masuk.' },
    { key: 'CRON', label: 'Vercel Cron terjadwal', ok: true, severity: 'warning', hint: 'vercel.json: /api/cron/subscriptions (08:00 WIB) & /api/cron/hr (00:30 WIB).' }
  ]
}

export async function systemStatus(event: H3Event) {
  await requirePermission(event, 'settings.read')
  const checks = await readinessChecks()
  const config = useRuntimeConfig()
  return { appEnv: config.public.appEnv, version: config.public.appVersion, checks, ready: checks.every(c => c.ok || c.severity === 'warning') }
}

/** Publik: hanya status hidup + DB, tanpa detail konfigurasi. */
export async function healthCheck() {
  const started = Date.now()
  let db = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'error'
  }
  return { ok: db === 'ok', db, latencyMs: Date.now() - started, version: useRuntimeConfig().public.appVersion }
}
