<script setup lang="ts">
import { NOTIFICATION_LEVEL_META } from '#shared/utils/templates'
import { formatDateTimeId, formatRelativeId } from '#shared/utils/format'
import type { NotificationItem, NotificationListResponse } from '~/composables/useNotifications'

// Halaman daftar notifikasi lengkap (kedua audiens): cari, filter belum dibaca, paginasi server.
const props = defineProps<{ audience: 'tenant' | 'platform', timezone?: string }>()

const notifications = useNotifications(props.audience)
const search = ref('')
const unreadOnly = ref(false)
const page = ref(1)
const limit = 15

const data = ref<NotificationListResponse | null>(null)
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch(unreadOnly, () => {
  page.value = 1
  void load()
})
watch(page, () => load())

async function load() {
  status.value = 'loading'
  try {
    data.value = await apiFetch<NotificationListResponse>(notifications.base, {
      query: { page: page.value, limit, search: search.value.length >= 2 ? search.value : undefined, unreadOnly: unreadOnly.value ? 'true' : undefined }
    })
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}

onMounted(load)

async function openItem(item: NotificationItem) {
  if (!item.readAt) {
    item.readAt = new Date().toISOString()
    await notifications.markRead(item.id)
  }
  if (item.actionUrl) await navigateTo(item.actionUrl)
}

async function markAll() {
  await notifications.markAllRead()
  await load()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Cari notifikasi…"
        class="w-full sm:w-72"
        aria-label="Cari notifikasi"
      />
      <USwitch
        v-model="unreadOnly"
        label="Hanya belum dibaca"
      />
      <UButton
        class="sm:ms-auto"
        label="Tandai semua dibaca"
        icon="i-lucide-check-check"
        variant="outline"
        color="neutral"
        :disabled="notifications.unreadCount.value === 0"
        @click="markAll"
      />
    </div>

    <div
      v-if="status === 'loading' && !data"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-16 w-full"
      />
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    >
      <template #actions>
        <UButton
          label="Coba lagi"
          size="xs"
          @click="load"
        />
      </template>
    </UAlert>
    <div
      v-else-if="data && data.items.length === 0"
      class="flex flex-col items-center gap-2 py-16 text-center"
    >
      <UIcon
        name="i-lucide-bell-off"
        class="size-8 text-dimmed"
      />
      <p class="text-sm text-muted">
        {{ unreadOnly ? 'Semua notifikasi sudah dibaca.' : 'Belum ada notifikasi.' }}
      </p>
    </div>
    <template v-else-if="data">
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="item in data.items"
            :key="item.id"
          >
            <button
              type="button"
              class="flex w-full gap-3 px-4 py-3 text-left hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              @click="openItem(item)"
            >
              <UIcon
                :name="item.icon || NOTIFICATION_LEVEL_META[item.level]?.icon"
                class="mt-0.5 size-5 shrink-0"
                :class="NOTIFICATION_LEVEL_META[item.level]?.textClass"
              />
              <span class="min-w-0 flex-1">
                <span
                  class="block text-sm"
                  :class="item.readAt ? 'text-muted' : 'font-medium text-highlighted'"
                >{{ item.title }}</span>
                <span
                  v-if="item.body"
                  class="block text-sm text-muted"
                >{{ item.body }}</span>
                <span
                  class="block text-xs text-dimmed"
                  :title="formatDateTimeId(item.createdAt, timezone)"
                >{{ formatRelativeId(item.createdAt) }}</span>
              </span>
              <span
                v-if="!item.readAt"
                class="mt-2 size-2 shrink-0 rounded-full bg-primary"
                aria-label="Belum dibaca"
              />
            </button>
          </li>
        </ul>
      </UCard>
      <div
        v-if="data.meta.pageCount > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.meta.total"
          :items-per-page="limit"
        />
      </div>
    </template>
  </div>
</template>
