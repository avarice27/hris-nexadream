import { API_ERROR_CODE_DOCS, API_SECTIONS } from '#shared/utils/api-docs'

// Katalog untuk halaman /docs/api (publik: hanya endpoint integrator) dan /internal/api.
export default defineEventHandler(async (event) => {
  const internal = getQuery(event).scope === 'internal'
  if (internal && !(await getBooleanSetting('app.internalApiDocsEnabled'))) throw notFound('Halaman tidak ditemukan.')
  const sections = API_SECTIONS.map(s => ({ ...s, endpoints: s.endpoints.filter(e => internal || e.enterprise) })).filter(s => s.endpoints.length)
  return { baseUrl: `${await siteUrl()}/api/v1`, sections, errors: API_ERROR_CODE_DOCS }
})
