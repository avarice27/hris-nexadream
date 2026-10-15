import { buildOpenApi } from '#shared/utils/api-docs'

// OpenAPI 3.1 dari katalog (tidak dibungkus amplop). ?scope=internal hanya bila dok internal diaktifkan.
export default defineEventHandler(async (event) => {
  const internal = getQuery(event).scope === 'internal' && await getBooleanSetting('app.internalApiDocsEnabled')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return buildOpenApi({ serverUrl: await siteUrl(), version: useRuntimeConfig().public.appVersion, scope: internal ? 'internal' : 'public' })
})
