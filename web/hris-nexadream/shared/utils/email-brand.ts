import { escapeHtml } from './templates'

// Pembungkus HTML email bermerek. Dipakai saat kirim DAN pratinjau admin,
// sehingga yang dilihat admin sama dengan yang diterima pelanggan.

export interface EmailBrand {
  appName: string
  siteUrl: string
  supportEmail: string
  companyName: string
  logoUrl?: string | null
}

const PRIMARY = '#4f46e5'

/** href="/app/…" → href="{siteUrl}/app/…"; //host, mailto:, # dan URL absolut dibiarkan. */
export function absolutizeLinks(html: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  return html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
}

export function wrapEmailHtml(inner: string, brand: EmailBrand, subject = ''): string {
  const year = new Date().getFullYear()
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.appName)}" height="32" style="display:block;height:32px;border:0">`
    : `<span style="font-size:18px;font-weight:600;color:${PRIMARY}">${escapeHtml(brand.appName)}</span>`
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>
  a.btn{display:inline-block;background:${PRIMARY};color:#ffffff !important;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600}
  blockquote{margin:12px 0;padding:8px 12px;border-left:3px solid #c7d2fe;color:#334155}
  @media (prefers-color-scheme: dark){ .card{background:#0f172a !important;color:#e2e8f0 !important} }
</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px">${logo}</td></tr>
    <tr><td class="card" style="background:#ffffff;border-radius:8px;padding:28px;font-size:14px;line-height:1.6">${inner}</td></tr>
    <tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#64748b">
      Email ini dikirim otomatis oleh ${escapeHtml(brand.appName)}. Butuh bantuan? Hubungi
      <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:#64748b">${escapeHtml(brand.supportEmail)}</a>.<br>
      © ${year} ${escapeHtml(brand.companyName)}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
  return absolutizeLinks(html, brand.siteUrl)
}

/** Alternatif teks polos sederhana dari HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => `${text.replace(/<[^>]+>/g, '')} (${href})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|blockquote|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
