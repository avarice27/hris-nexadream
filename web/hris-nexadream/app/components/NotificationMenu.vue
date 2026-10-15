<script setup lang="ts">
import { NOTIFICATION_LEVEL_META } from '#shared/utils/templates'
import { formatRelativeId } from '#shared/utils/format'
import type { NotificationItem } from '~/composables/useNotifications'

const props = defineProps<{ audience: 'tenant' | 'platform' }>()

const notifications = useNotifications(props.audience)
const { items, unreadCount, loaded } = notifications
const open = ref(false)
const pagePath = computed(() => props.audience === 'tenant' ? '/app/notifications' : '/admin/notifications')

onMounted(() => notifications.startPolling())

async function openItem(item: NotificationItem) {
  open.value = false
  await notifications.markRead(item.id)
  if (item.actionUrl) await navigateTo(item.actionUrl)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end' }"
  >
    <UChip
      :show="unreadCount > 0"
      :text="unreadCount > 9 ? '9+' : unreadCount"
      size="2xl"
      color="error"
      inset
    >
      <UButton
        icon="i-lucide-bell"
        color="neutral"
        variant="ghost"
        :aria-label="unreadCount ? `Notifikasi, ${unreadCount} belum dibaca` : 'Notifikasi'"
      />
    </UChip>

    <template #content>
      <div class="w-[min(22rem,calc(100vw-2rem))]">
        <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2">
          <p class="text-sm font-semibold">
            Notifikasi
          </p>
          <UButton
            v-if="unreadCount > 0"
            label="Tandai semua dibaca"
            size="xs"
            variant="link"
            @click="notifications.markAllRead()"
          />
        </div>

        <div class="max-h-96 overflow-y-auto">
          <div
            v-if="!loaded"
            class="space-y-2 p-3"
          >
            <USkeleton
              v-for="i in 3"
              :key="i"
              class="h-12 w-full"
            />
          </div>
          <p
            v-else-if="items.length === 0"
            class="px-3 py-8 text-center text-sm text-muted"
          >
            Belum ada notifikasi.
          </p>
          <ul v-else>
            <li
              v-for="item in items"
              :key="item.id"
            >
              <button
                type="button"
                class="flex w-full gap-3 px-3 py-2.5 text-left hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                @click="openItem(item)"
              >
                <UIcon
                  :name="item.icon || NOTIFICATION_LEVEL_META[item.level]?.icon"
                  class="mt-0.5 size-5 shrink-0"
                  :class="NOTIFICATION_LEVEL_META[item.level]?.textClass"
                />
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm"
                    :class="item.readAt ? 'text-muted' : 'font-medium text-highlighted'"
                  >{{ item.title }}</span>
                  <span
                    v-if="item.body"
                    class="block truncate text-xs text-muted"
                  >{{ item.body }}</span>
                  <span class="block text-xs text-dimmed">{{ formatRelativeId(item.createdAt) }}</span>
                </span>
                <span
                  v-if="!item.readAt"
                  class="mt-2 size-2 shrink-0 rounded-full bg-primary"
                  aria-label="Belum dibaca"
                />
              </button>
            </li>
          </ul>
        </div>

        <div class="border-t border-default p-2">
          <UButton
            :to="pagePath"
            label="Lihat semua"
            variant="ghost"
            color="neutral"
            block
            @click="open = false"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
