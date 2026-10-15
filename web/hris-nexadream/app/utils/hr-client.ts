// Bantuan klien modul HR: unduh CSV (dengan token), buka file privat (signed URL), unggah file.

/** Unduh respons CSV dari API ber-autentikasi sebagai file. */
export async function downloadFromApi(path: string, filename: string, query?: Record<string, unknown>) {
  const blob = await apiFetch<Blob>(path, { query, responseType: 'blob' } as unknown as Parameters<typeof apiFetch>[1])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Minta signed URL (≤ 5 menit) lalu buka di tab baru. URL tidak disimpan. */
export async function openSignedFile(path: string) {
  const tab = window.open('', '_blank')
  try {
    const { url } = await apiFetch<{ url: string }>(path)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (error) {
    tab?.close()
    throw error
  }
}

/** Unggah satu file (multipart `file` + field tambahan). Gambar dikecilkan dulu bila maxPx diisi. */
export async function uploadFileToApi<T = { id: string }>(path: string, file: File, fields: Record<string, string> = {}, maxPx?: number): Promise<T> {
  const body = new FormData()
  const blob = maxPx ? await downscaleImage(file, maxPx) : file
  body.append('file', blob, file.name)
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return apiFetch<T>(path, { method: 'POST', body })
}

/** 90 → "1 j 30 m" */
export function formatMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (!h) return `${rest} m`
  return rest ? `${h} j ${rest} m` : `${h} j`
}

/** Kunci tanggal hari ini (zona perangkat) — hanya untuk nilai awal form; server tetap otoritas. */
export function localTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "2026-10-15" → "15 Okt 2026" */
export function formatDateShort(key: string | null | undefined): string {
  if (!key) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
}

/** "2026-10-15" → "Kam, 15 Okt" */
export function formatDayShort(key: string): string {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
}
