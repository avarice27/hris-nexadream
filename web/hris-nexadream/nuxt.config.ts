import pkg from './package.json'

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],

  ssr: true,

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  colorMode: { preference: 'light', fallback: 'light' },

  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    authSessionDriver: process.env.AUTH_SESSION_DRIVER || 'jwt',
    settingsSecret: process.env.SETTINGS_SECRET || '',
    hrDataKey: process.env.HR_DATA_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    storageProvider: process.env.STORAGE_PROVIDER || 'supabase',
    public: {
      appName: 'HRIS Nexadream',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      appEnv: process.env.NUXT_PUBLIC_APP_ENV || 'development',
      supportEmail: process.env.NUXT_PUBLIC_SUPPORT_EMAIL || 'support@nexadream.id',
      appVersion: pkg.version
    }
  },

  routeRules: {
    '/app/**': { ssr: false },
    '/admin/**': { ssr: false },
    // Halaman hukum punya rute pendek kanonis
    '/page/privacy': { redirect: { to: '/privacy', statusCode: 301 } },
    '/page/terms': { redirect: { to: '/terms', statusCode: 301 } }
  },

  compatibilityDate: '2026-10-01',

  nitro: {
    preset: 'vercel',
    experimental: { asyncContext: true }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
