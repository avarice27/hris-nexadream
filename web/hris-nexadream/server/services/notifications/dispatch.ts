import { emailChannel } from './email'
import type { ChannelOverrides, NotificationChannel, NotificationContext } from './types'

// Kanal eksternal. Menambah kanal (mis. push FCM, WhatsApp) = satu file + satu entri di sini.
// Push (FCM) belum dipasang — lihat tasks.md fase 4.
export const EXTERNAL_CHANNELS: NotificationChannel[] = [emailChannel]

/** Kegagalan kanal TIDAK PERNAH merambat ke operasi bisnis yang memicunya. */
export async function dispatchExternal(ctx: NotificationContext, overrides: ChannelOverrides = {}): Promise<void> {
  for (const channel of EXTERNAL_CHANNELS) {
    if (overrides[channel.name] === false) continue
    try {
      if (await channel.isEnabled(ctx)) await channel.deliver(ctx)
    } catch (error) {
      console.error(`[notifications:${channel.name}] delivery failed`, ctx.templateKey ?? ctx.title, error)
    }
  }
}
