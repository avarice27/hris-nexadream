import type { NotificationLevel, TemplateVariables } from '#shared/utils/templates'

export type NotificationAudience = 'tenant' | 'platform'
export type ChannelName = 'database' | 'email' | 'push'
export type ChannelOverrides = Partial<Record<ChannelName, boolean>>

/** Satu notifikasi yang sudah dirender, siap dikirim ke kanal eksternal. */
export interface NotificationContext {
  notificationId: string | null
  audience: NotificationAudience
  userId: string | null
  tenantUserId: string | null
  tenantId: string | null
  templateKey: string | null
  variables: TemplateVariables
  title: string
  body: string
  actionUrl: string | null
  actionLabel: string | null
  icon: string | null
  level: NotificationLevel
  recipient: { name: string, email: string } | null
}

export interface NotificationChannel {
  readonly name: Exclude<ChannelName, 'database'>
  /** Murah; tidak dikonfigurasi = diam. */
  isEnabled(ctx: NotificationContext): Promise<boolean> | boolean
  deliver(ctx: NotificationContext): Promise<void>
}
