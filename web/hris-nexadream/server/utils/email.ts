import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { EMAIL_TEMPLATES, renderTemplateString, type TemplateVariables } from '#shared/utils/templates'
import { htmlToText, wrapEmailHtml, type EmailBrand } from '#shared/utils/email-brand'

// SATU-SATUNYA modul yang tahu ada pustaka SMTP. Kredensial dari pengaturan (smtp.*), bukan env.
// smtp.host kosong → setiap kirim no-op senyap. Kegagalan dicatat & dikembalikan, tidak pernah dilempar.

export interface SendEmailResult {
  sent: boolean
  skipped?: 'not-configured' | 'template-inactive' | 'template-missing' | 'no-recipient'
  error?: string
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

const transportStore = globalThis as unknown as { __smtpTransport?: { key: string, transporter: Transporter } }

async function smtpConfig() {
  return {
    host: (await getSetting('smtp.host')).trim(),
    port: await getNumberSetting('smtp.port'),
    secure: await getBooleanSetting('smtp.secure'),
    user: await getSetting('smtp.user'),
    password: await getSetting('smtp.password'),
    fromName: await getSetting('smtp.fromName'),
    fromEmail: await getSetting('smtp.fromEmail')
  }
}

function transporterFor(config: Awaited<ReturnType<typeof smtpConfig>>): Transporter {
  const key = JSON.stringify([config.host, config.port, config.secure, config.user, config.password])
  const cached = transportStore.__smtpTransport
  if (cached?.key === key) return cached.transporter
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  })
  transportStore.__smtpTransport = { key, transporter }
  return transporter
}

export async function isEmailConfigured(): Promise<boolean> {
  return (await getSetting('smtp.host')).trim() !== ''
}

/**
 * Dasar tautan absolut di email. Di luar produksi selalu origin lingkungan ini
 * (NUXT_PUBLIC_SITE_URL), agar tautan dev/staging tidak mengarah ke situs produksi.
 */
export async function siteUrl(): Promise<string> {
  const config = useRuntimeConfig().public
  if (config.appEnv !== 'production') return config.siteUrl.replace(/\/$/, '')
  return (await getSetting('company.siteUrl')).replace(/\/$/, '') || config.siteUrl.replace(/\/$/, '')
}

export async function emailBrand(): Promise<EmailBrand> {
  return {
    appName: await getSetting('company.name'),
    siteUrl: await siteUrl(),
    supportEmail: await getSetting('company.email'),
    companyName: (await getSetting('company.legalName')) || 'Nexadream',
    logoUrl: (await getSetting('company.logoUrl')) || null
  }
}

/** Variabel yang disuntikkan ke setiap email. */
export async function commonEmailVariables(): Promise<Record<string, string>> {
  const brand = await emailBrand()
  return { appName: brand.appName, siteUrl: brand.siteUrl, supportEmail: brand.supportEmail }
}

/** Mengirim email apa adanya. Tidak pernah melempar. */
export async function sendEmail(input: SendEmailInput, options: { throwOnError?: boolean } = {}): Promise<SendEmailResult> {
  if (!input.to) return { sent: false, skipped: 'no-recipient' }
  const config = await smtpConfig()
  if (!config.host) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email:dev] not sent (SMTP not configured) to=${input.to} subject="${input.subject}"\n${input.text ?? htmlToText(input.html)}`)
    }
    return { sent: false, skipped: 'not-configured' }
  }
  try {
    await transporterFor(config).sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html)
    })
    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[email] send failed', input.subject, message)
    if (options.throwOnError) throw error
    return { sent: false, error: message }
  }
}

/**
 * Merender templat: baris DB aktif → DB; baris DB nonaktif → TIDAK dikirim (admin mematikannya);
 * tanpa baris DB → katalog kode.
 */
export async function renderEmailTemplate(key: string, variables: TemplateVariables): Promise<{ subject: string, html: string } | null> {
  const row = await prisma.emailTemplate.findUnique({ where: { key } })
  if (row && !row.isActive) return null
  const template = row ?? EMAIL_TEMPLATES.find(t => t.key === key)
  if (!template) return null
  const params = { ...(await commonEmailVariables()), ...variables }
  const subject = renderTemplateString(template.subject, params)
  const inner = renderTemplateString(template.body, params, true)
  return { subject, html: wrapEmailHtml(inner, await emailBrand(), subject) }
}

export interface SendTemplateInput {
  to: string
  templateKey: string
  params: TemplateVariables
}

export async function sendTemplatedEmail(input: SendTemplateInput): Promise<SendEmailResult> {
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { key: input.templateKey }, select: { isActive: true } })
    if (row && !row.isActive) return { sent: false, skipped: 'template-inactive' }
    const rendered = await renderEmailTemplate(input.templateKey, input.params)
    if (!rendered) return { sent: false, skipped: 'template-missing' }
    return await sendEmail({ to: input.to, subject: rendered.subject, html: rendered.html })
  } catch (error) {
    console.error('[email] template send failed', input.templateKey, error)
    return { sent: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Email uji dari /admin/settings. Di sini kegagalan DILAPORKAN ke admin (502). */
export async function sendTestEmail(to: string): Promise<{ success: true }> {
  if (!(await isEmailConfigured())) {
    throw httpError(409, 'CONFLICT', 'Simpan pengaturan SMTP terlebih dahulu.')
  }
  const brand = await emailBrand()
  const subject = `Email uji dari ${brand.appName}`
  const html = wrapEmailHtml(
    `<p>Halo,</p><p>Ini email uji dari back-office ${brand.appName}. Jika Anda menerimanya, pengaturan SMTP sudah benar.</p>`,
    brand,
    subject
  )
  try {
    await sendEmail({ to, subject, html }, { throwOnError: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw httpError(502, 'INTERNAL', `Email uji gagal dikirim: ${message}`)
  }
  return { success: true }
}
