<script setup lang="ts">
import { formatDateTimeId } from '#shared/utils/format'
import { AUDIT_ACTION_LABELS } from '#shared/utils/status'

// Log aktivitas semua audiens. Metadata berisi nama field/ID, tidak pernah nilai sensitif (D7).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Log aktivitas' })

interface AuditRow {
  id: string
  audience: 'tenant' | 'platform'
  action: string
  actorName: string | null
  impersonatorId: string | null
  tenant: { id: string, name: string } | null
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

const auth = usePlatformAuth()
const range = ref<string | undefined>('7d')
const audience = ref<string | undefined>('__all__')
const action = ref<string | undefined>('__all__')
const list = useServerList<AuditRow, { actions: string[] }>('/api/admin/audit-logs', { limit: 30, filters: { range, audience, action } })
const expanded = ref<string | null>(null)

const rangeItems = [
  { label: 'Hari ini', value: 'today' },
  { label: '7 hari', value: '7d' },
  { label: '30 hari', value: '30d' },
  { label: '90 hari', value: '90d' },
  { label: 'Semua', value: '__all__' }
]
const audienceItems = [{ label: 'Semua audiens', value: '__all__' }, { label: 'Perusahaan', value: 'tenant' }, { label: 'Platform', value: 'platform' }]
const actionItems = computed(() => [{ label: 'Semua aksi', value: '__all__' }, ...(list.extra.value.actions ?? []).map(a => ({ label: AUDIT_ACTION_LABELS[a] ?? a, value: a }))])
const label = (a: string) => AUDIT_ACTION_LABELS[a] ?? a
</script>

<template>
  <PagePanel title="Log aktivitas">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari pelaku, aksi, atau perusahaan…"
          class="w-full sm:w-72"
          aria-label="Cari log"
        />
        <USelect
          v-model="range"
          :items="rangeItems"
          class="w-32"
          aria-label="Rentang waktu"
        />
        <USelect
          v-model="audience"
          :items="audienceItems"
          class="w-40"
          aria-label="Audiens"
        />
        <USelect
          v-model="action"
          :items="actionItems"
          class="w-56"
          aria-label="Aksi"
        />
      </div>
      <p class="text-sm text-muted">
        {{ list.meta.value.total }} entri
      </p>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="row in list.items.value"
              :key="row.id"
              class="px-4 py-2.5 text-sm"
            >
              <button
                type="button"
                class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                @click="expanded = expanded === row.id ? null : row.id"
              >
                <span class="w-36 shrink-0 text-xs text-muted">{{ formatDateTimeId(row.createdAt, auth.displayTimezone.value) }}</span>
                <UBadge
                  :label="row.audience === 'tenant' ? 'Perusahaan' : 'Platform'"
                  size="sm"
                  variant="subtle"
                  :color="row.audience === 'tenant' ? 'info' : 'neutral'"
                />
                <span class="font-medium">{{ label(row.action) }}</span>
                <span class="text-muted">{{ row.actorName ?? '—' }}<span
                  v-if="row.impersonatorId"
                  class="text-warning"
                > (via impersonate)</span></span>
                <span
                  v-if="row.tenant"
                  class="text-muted"
                >· {{ row.tenant.name }}</span>
              </button>
              <div
                v-if="expanded === row.id"
                class="mt-2 space-y-1 rounded bg-elevated p-3 text-xs"
              >
                <p><span class="text-muted">Aksi:</span> <code>{{ row.action }}</code></p>
                <p v-if="row.targetType">
                  <span class="text-muted">Target:</span> {{ row.targetType }} <code>{{ row.targetId }}</code>
                </p>
                <p v-if="row.ip">
                  <span class="text-muted">IP:</span> {{ row.ip }}
                </p>
                <p
                  v-if="row.userAgent"
                  class="truncate"
                >
                  <span class="text-muted">Perangkat:</span> {{ row.userAgent }}
                </p>
                <pre
                  v-if="row.metadata"
                  class="mt-1 overflow-auto"
                >{{ JSON.stringify(row.metadata, null, 2) }}</pre>
              </div>
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
  </PagePanel>
</template>
