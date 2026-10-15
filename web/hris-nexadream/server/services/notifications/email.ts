import { escapeHtml } from '#shared/utils/templates'
import { wrapEmailHtml } from '#shared/utils/email-brand'
import type { NotificationChannel, NotificationContext } from './types'

// Kanal email untuk notifikasi. Bila ada templat EMAIL dengan kunci sama, itu yang dipakai
// (salinannya lebih kaya); jika tidak, kirim judul/isi notifikasi + tombol ke actionUrl.
export const emailChannel: NotificationChannel = {
  name: 'email',

  async isEnabled(ctx: NotificationContext) {
    return !!ctx.recipient?.email && await isEmailConfigured()
  },

  async deliver(ctx: NotificationContext) {
    const to = ctx.recipient!.email
    if (ctx.templateKey) {
      const rendered = await renderEmailTemplate(ctx.templateKey, { name: ctx.recipient!.name, ...ctx.variables })
      if (rendered) {
        await sendEmail({ to, subject: rendered.subject, html: rendered.html })
        return
      }
    }
    const action = ctx.actionUrl
      ? `<p><a href="${escapeHtml(ctx.actionUrl)}" class="btn">${escapeHtml(ctx.actionLabel || 'Buka')}</a></p>`
      : ''
    const inner = `<p>Halo ${escapeHtml(ctx.recipient!.name)},</p><p><strong>${escapeHtml(ctx.title)}</strong></p><p>${escapeHtml(ctx.body)}</p>${action}`
    await sendEmail({ to, subject: ctx.title, html: wrapEmailHtml(inner, await emailBrand(), ctx.title) })
  }
}
