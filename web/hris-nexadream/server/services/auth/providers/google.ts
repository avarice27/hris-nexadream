import type { ExternalProfile, RedirectAuthProvider } from '../types'

// Google OAuth 2.0 / OpenID Connect (authorization code). Tidak aktif sampai
// GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET diisi — tombol disembunyikan dan alur memantul kembali.
// Profil diambil dari endpoint userinfo Google memakai access token yang baru ditukar lewat TLS
// langsung ke Google (bukan dari peramban), sehingga tidak perlu memverifikasi tanda tangan id_token.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

const credentials = () => {
  const config = useRuntimeConfig()
  return { clientId: String(config.googleClientId || ''), clientSecret: String(config.googleClientSecret || '') }
}

export const googleProvider: RedirectAuthProvider = {
  name: 'google',
  supports: ['tenant'],

  isConfigured() {
    const { clientId, clientSecret } = credentials()
    return !!clientId && !!clientSecret
  },

  authorizationUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: credentials().clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online'
    })
    return `${AUTH_URL}?${params}`
  },

  async exchange({ code, redirectUri }): Promise<ExternalProfile> {
    const { clientId, clientSecret } = credentials()
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    })
    if (!tokenResponse.ok) throw new Error(`Google token exchange failed (${tokenResponse.status}).`)
    const tokens = await tokenResponse.json() as { access_token?: string }
    if (!tokens.access_token) throw new Error('Google did not return an access token.')

    const profileResponse = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } })
    if (!profileResponse.ok) throw new Error(`Google userinfo failed (${profileResponse.status}).`)
    const profile = await profileResponse.json() as { sub?: string, email?: string, email_verified?: boolean, name?: string, picture?: string }
    if (!profile.sub) throw new Error('Google profile has no subject.')
    return {
      provider: 'google',
      subject: profile.sub,
      email: profile.email?.trim().toLowerCase() || null,
      emailVerified: profile.email_verified === true,
      name: profile.name?.trim() || null,
      avatarUrl: profile.picture || null
    }
  }
}
