// Konvensi error: statusMessage = kalimat Bahasa Indonesia yang ditampilkan apa adanya,
// data.code = kode mesin dalam bahasa Inggris.

export type ErrorCode
  = | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'VALIDATION_FAILED'
    | 'RATE_LIMITED'
    | 'PLAN_REQUIRED'
    | 'LIMIT_REACHED'
    | 'TENANT_SUSPENDED'
    | 'TENANT_DELETED'
    | 'REGISTRATION_CLOSED'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'EMPLOYEE_NOT_LINKED'
    | 'OUTSIDE_GEOFENCE'
    | 'INSUFFICIENT_BALANCE'
    | 'INVALID_API_KEY'
    | 'INTERNAL'

export function httpError(statusCode: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return createError({
    statusCode,
    statusMessage: message,
    message,
    data: { code, ...details }
  })
}

export const unauthenticated = (message = 'Sesi Anda telah berakhir. Silakan masuk kembali.') =>
  httpError(401, 'UNAUTHENTICATED', message)

export const forbidden = (message = 'Anda tidak memiliki akses untuk tindakan ini.') =>
  httpError(403, 'FORBIDDEN', message)

export const notFound = (message = 'Data tidak ditemukan.') =>
  httpError(404, 'NOT_FOUND', message)

export const conflict = (message: string, details?: Record<string, unknown>) =>
  httpError(409, 'CONFLICT', message, details)
