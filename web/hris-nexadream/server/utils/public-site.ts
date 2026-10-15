import { normalizeFeatures, normalizeLimits } from '#shared/utils/plans'

// Situs publik (landing, halaman CMS, robots, sitemap). Semua isi berasal dari DB/pengaturan,
// tidak ada harga, FAQ, atau teks hukum yang ditulis di kode (14-landing-and-public-site.md).

/** Slug halaman CMS yang punya rute pendek sendiri (/privacy, /terms). */
export const SHORT_ROUTE_PAGES = ['privacy', 'terms'] as const

export function publicPagePath(slug: string): string {
  return (SHORT_ROUTE_PAGES as readonly string[]).includes(slug) ? `/${slug}` : `/page/${slug}`
}

/** Identitas vendor untuk footer, kontak, dan JSON-LD. Sosial kosong = tidak ditampilkan. */
export async function publicCompanyInfo() {
  // getAllSettings() di-cache, jadi rangkaian getSetting ini murah.
  return {
    name: await getSetting('company.name'),
    tagline: await getSetting('company.tagline'),
    email: await getSetting('company.email'),
    phone: await getSetting('company.phone'),
    address: await getSetting('company.address'),
    whatsapp: await getSetting('company.whatsapp'),
    logoUrl: await getSetting('company.logoUrl'),
    socials: {
      instagram: await getSetting('company.instagramUrl'),
      linkedin: await getSetting('company.linkedinUrl'),
      facebook: await getSetting('company.facebookUrl'),
      youtube: await getSetting('company.youtubeUrl')
    },
    playStoreUrl: await getSetting('company.playStoreUrl')
  }
}

/** Data landing dalam satu panggilan: paket publik, FAQ, identitas, dan status pendaftaran. */
export async function publicLanding() {
  const [plans, faqs] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ order: 'asc' }, { priceMonthly: 'asc' }] }),
    prisma.faq.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, question: true, answer: true } })
  ])
  const trialPlanSlug = await getSetting('billing.trialPlanSlug')
  return {
    plans: plans.map(plan => ({
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      priceMonthly: toAmount(plan.priceMonthly),
      priceYearly: toAmount(plan.priceYearly),
      currency: plan.currency,
      trialDays: plan.trialDays,
      limits: normalizeLimits(plan.limits),
      features: normalizeFeatures(plan.features)
    })),
    // Uji coba berlaku untuk perusahaan baru di paket uji coba (D3); 0 bila paket itu tidak publik.
    trial: { planSlug: trialPlanSlug, days: plans.find(p => p.slug === trialPlanSlug)?.trialDays ?? 0 },
    faqs,
    company: await publicCompanyInfo(),
    registrationOpen: await getBooleanSetting('app.registrationOpen'),
    siteUrl: await siteUrl()
  }
}

export async function robotsTxt(): Promise<string> {
  const base = await siteUrl()
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app/',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /internal/',
    `Sitemap: ${base}/sitemap.xml`,
    ''
  ].join('\n')
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export async function sitemapXml(): Promise<string> {
  const base = await siteUrl()
  const pages = await prisma.page.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } })
  const entries: Array<{ path: string, lastmod?: Date }> = [
    { path: '/' },
    { path: '/docs/api' },
    { path: '/hapus-akun' },
    ...pages.map(page => ({ path: publicPagePath(page.slug), lastmod: page.updatedAt }))
  ]
  const urls = entries.map(entry => [
    '  <url>',
    `    <loc>${xmlEscape(`${base}${entry.path}`)}</loc>`,
    ...(entry.lastmod ? [`    <lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>`] : []),
    '  </url>'
  ].join('\n'))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
}
