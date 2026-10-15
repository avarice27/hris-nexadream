// Membaca error dari API: statusMessage adalah kalimat Bahasa Indonesia yang siap ditampilkan.

interface FetchErrorLike {
  statusCode?: number
  status?: number
  statusMessage?: string
  data?: { statusMessage?: string, message?: string, data?: { code?: string, field?: string } }
}

export function extractErrorMessage(caught: unknown, fallback = 'Terjadi kesalahan. Silakan coba lagi.'): string {
  const error = caught as FetchErrorLike | null
  return error?.data?.statusMessage || error?.data?.message || error?.statusMessage || fallback
}

export function extractErrorCode(caught: unknown): string | null {
  return (caught as FetchErrorLike | null)?.data?.data?.code ?? null
}

export function extractErrorField(caught: unknown): string | null {
  return (caught as FetchErrorLike | null)?.data?.data?.field ?? null
}

export function extractStatusCode(caught: unknown): number | null {
  const error = caught as FetchErrorLike | null
  return error?.statusCode ?? error?.status ?? null
}
