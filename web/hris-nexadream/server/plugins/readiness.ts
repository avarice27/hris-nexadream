// Saat instance produksi mulai: catat (log) konfigurasi yang belum siap. Tidak menghentikan server —
// halaman /admin/system menampilkan rinciannya ke staf.
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.appEnv !== 'production') return
  readinessChecks()
    .then((checks) => {
      const missing = checks.filter(c => !c.ok && c.severity === 'error').map(c => c.key)
      if (missing.length) console.error(`[readiness] konfigurasi produksi belum lengkap: ${missing.join(', ')}`)
    })
    .catch(error => console.error('[readiness] gagal memeriksa konfigurasi', error))
})
