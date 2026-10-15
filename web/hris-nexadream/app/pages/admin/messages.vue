<script setup lang="ts">
import { formatDateTimeId } from '#shared/utils/format'
import { formatPhone } from '#shared/utils/phone'

// Kotak masuk formulir kontak: baru → dibaca → dibalas → arsip.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Pesan masuk' })

interface MessageRow { id: string, name: string, email: string, phone: string | null, subject: string | null, message: string, status: 'new' | 'read' | 'replied' | 'archived', handledAt: string | null, createdAt: string }

const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('messages.write'))
const status = ref<string | undefined>('__all__')
const list = useServerList<MessageRow, { unread: number }>('/api/admin/messages', { filters: { status } })
const statusItems = [{ label: 'Kotak masuk', value: '__all__' }, { label: 'Baru', value: 'new' }, { label: 'Dibaca', value: 'read' }, { label: 'Dibalas', value: 'replied' }, { label: 'Arsip', value: 'archived' }]
const STATUS_META = { new: { label: 'Baru', color: 'info' }, read: { label: 'Dibaca', color: 'neutral' }, replied: { label: 'Dibalas', color: 'success' }, archived: { label: 'Arsip', color: 'neutral' } } as const

const opened = ref<MessageRow | null>(null)
async function open(row: MessageRow) {
  opened.value = row
  if (row.status === 'new' && canWrite.value) await setStatus(row, 'read', false)
}
async function setStatus(row: MessageRow, value: MessageRow['status'], announce = true) {
  try {
    await apiFetch(`/api/admin/messages/${row.id}`, { method: 'PATCH', body: { status: value } })
    row.status = value
    if (announce) toast.add({ title: 'Status pesan diperbarui', color: 'success', icon: 'i-lucide-check' })
    await list.refresh()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error' })
  }
}
async function remove(row: MessageRow) {
  if (!await confirm({ title: 'Hapus pesan ini?', confirmLabel: 'Hapus', color: 'error' })) return
  await apiFetch(`/api/admin/messages/${row.id}`, { method: 'DELETE' }).catch(error => toast.add({ title: extractErrorMessage(error), color: 'error' }))
  opened.value = null
  await list.refresh()
}
const modalOpen = computed({
  get: () => !!opened.value,
  set: (v: boolean) => {
    if (!v) opened.value = null
  }
})
</script>

<template>
  <PagePanel title="Pesan masuk">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama, email, subjek…"
          class="w-full sm:w-72"
          aria-label="Cari pesan"
        />
        <USelect
          v-model="status"
          :items="statusItems"
          class="w-40"
          aria-label="Status"
        />
        <UBadge
          v-if="list.extra.value.unread"
          :label="`${list.extra.value.unread} baru`"
          color="info"
          variant="subtle"
        />
      </div>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Tidak ada pesan."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="row in list.items.value"
              :key="row.id"
            >
              <button
                type="button"
                class="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-elevated"
                @click="open(row)"
              >
                <span
                  v-if="row.status === 'new'"
                  class="size-2 rounded-full bg-primary"
                  aria-label="Belum dibaca"
                />
                <div class="min-w-0 flex-1">
                  <p :class="row.status === 'new' ? 'font-semibold' : 'font-medium'">
                    {{ row.subject || '(tanpa subjek)' }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ row.name }} · {{ row.email }} · {{ row.message }}
                  </p>
                </div>
                <span class="text-xs text-muted">{{ formatDateTimeId(row.createdAt, auth.displayTimezone.value) }}</span>
                <UBadge
                  :label="STATUS_META[row.status].label"
                  :color="STATUS_META[row.status].color"
                  variant="subtle"
                />
              </button>
            </li>
          </ul>
        </UCard>
      </ListState>
      <div
        v-if="list.meta.value.pageCount > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="list.page.value"
          :total="list.meta.value.total"
          :items-per-page="list.meta.value.limit"
        />
      </div>
    </div>

    <UModal
      v-model:open="modalOpen"
      :title="opened?.subject || '(tanpa subjek)'"
      :description="opened ? `${opened.name} · ${opened.email}${opened.phone ? ' · ' + formatPhone(opened.phone) : ''}` : ''"
    >
      <template #body>
        <p class="whitespace-pre-wrap text-sm">
          {{ opened?.message }}
        </p>
      </template>
      <template
        v-if="opened && canWrite"
        #footer
      >
        <div class="flex w-full flex-wrap justify-between gap-2">
          <UButton
            label="Hapus"
            variant="ghost"
            color="error"
            @click="remove(opened)"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="`mailto:${opened.email}?subject=${encodeURIComponent('Re: ' + (opened.subject ?? ''))}`"
              label="Balas via email"
              icon="i-lucide-reply"
              variant="outline"
              @click="setStatus(opened, 'replied')"
            />
            <UButton
              label="Arsipkan"
              variant="ghost"
              color="neutral"
              @click="setStatus(opened, 'archived'); opened = null"
            />
          </div>
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
