// Aturan autentikasi yang dipakai server dan client.

export const PASSWORD_MIN_LENGTH = 8
export const APP_KEY = 'hrisnexadream'

export const TENANT_TOKEN_KEY = `${APP_KEY}_tenant_token`
export const PLATFORM_TOKEN_KEY = `${APP_KEY}_platform_token`
/** Disimpan saat impersonasi staf; tidak pernah dikirim ke server. */
export const PLATFORM_RETURN_TOKEN_KEY = `${APP_KEY}_platform_return_token`

/** Hanya path internal yang sama-origin yang boleh jadi target ?redirect=. */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
