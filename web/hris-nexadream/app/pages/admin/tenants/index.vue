<script setup lang="ts">
import { formatDateId } from '#shared/utils/format'
import { SUBSCRIPTION_STATUS_META, TENANT_STATUS_META, statusMeta } from '#shared/utils/status'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Perusahaan' })

interface TenantRow {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  status: string
  onboarded: boolean
  deleteRequestedAt: string | null
  branchCount: number
  memberCount: number
  createdAt: string
  subscription: { status: string, plan: { slug: string, name: string }, trialEndsAt: string | null, currentPeriodEnd: string | null } | null
}

const auth = usePlatformAuth()
const statusFilter = ref<string | undefined>('__all__')
const subFilter = ref<string | undefined>('__all__')
const deleteFilter = ref<string | undefined>('__all__')
const list = useServerList<TenantRow>('/api/admin/tenants', { filters: { status: statusFilter, subscriptionStatus: subFilter, deleteRequested: deleteFilter } })

const statusItems = [{ label: 'Semua status', value: '__all__' }, { label: 'Aktif', value: 'active' }, { label: 'Ditangguhkan', value: 'suspended' }]
const subItems = [{ label: 'Semua langganan', value: '__all__' }, ...Object.keys(SUBSCRIPTION_STATUS_META).map(s => ({ label: SUBSCRIPTION_STATUS_META[s]!.label, value: s }))]
const deleteItems = [{ label: 'Semua', value: '__all__' }, { label: 'Minta dihapus', value: 'true' }]
</script>

<template>
  <PagePanel title="Perusahaan">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama, email, atau telepon…"
          class="w-full sm:w-80"
          aria-label="Cari perusahaan"
        />
        <USelect
          v-model="statusFilter"
          :items="statusItems"
          class="w-44"
          aria-label="Status perusahaan"
        />
        <USelect
          v-model="subFilter"
          :items="subItems"
          class="w-52"
          aria-label="Status langganan"
        />
        <USelect
          v-model="deleteFilter"
          :items="deleteItems"
          class="w-40"
          aria-label="Permintaan hapus"
        />
      </div>
      <p class="text-sm text-muted">
        {{ list.meta.value.total }} perusahaan
      </p>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Tidak ada perusahaan."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="t in list.items.value"
              :key="t.id"
            >
              <NuxtLink
                :to="`/admin/tenants/${t.id}`"
                class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-elevated"
              >
                <div class="min-w-0 flex-1">
                  <p class="flex flex-wrap items-center gap-2 font-medium">
                    {{ t.name }}
                    <UBadge
                      v-if="t.deleteRequestedAt"
                      label="Minta dihapus"
                      color="error"
                      variant="subtle"
                      size="sm"
                    />
                    <UBadge
                      v-if="!t.onboarded"
                      label="Belum onboarding"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    />
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ t.email ?? '—' }} · {{ t.branchCount }} kantor · {{ t.memberCount }} login · daftar {{ formatDateId(t.createdAt, auth.displayTimezone.value) }}
                  </p>
                </div>
                <span class="text-xs text-muted">{{ t.subscription?.plan.name }}</span>
                <UBadge
                  v-if="t.subscription"
                  :label="statusMeta(SUBSCRIPTION_STATUS_META, t.subscription.status).label"
                  :color="statusMeta(SUBSCRIPTION_STATUS_META, t.subscription.status).color"
                  variant="subtle"
                />
                <UBadge
                  v-if="t.status !== 'active'"
                  :label="statusMeta(TENANT_STATUS_META, t.status).label"
                  :color="statusMeta(TENANT_STATUS_META, t.status).color"
                  variant="subtle"
                />
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-dimmed"
                />
              </NuxtLink>
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
