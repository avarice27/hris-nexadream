<script setup lang="ts">
// Semua API key perusahaan. Staf hanya bisa melihat metadata (bukan key) dan mencabut.
definePageMeta({ layout: 'admin' })
useHead({ title: 'API key' })

interface Row { id: string, name: string, keyPrefix: string, scopes: string[], lastUsedAt: string | null, isActive: boolean, createdAt: string, tenant: { id: string, name: string } }
const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const status = ref<string | undefined>('active')
const list = useServerList<Row>('/api/admin/api-clients', { filters: { status } })
async function revoke(r: Row) {
  if (!await confirm({ title: `Cabut key ${r.name} milik ${r.tenant.name}?`, confirmLabel: 'Cabut', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/api-clients/${r.id}`, { method: 'DELETE' })
    toast.add({ title: 'Key dicabut', color: 'success', icon: 'i-lucide-check' })
    await list.refresh()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
const statusItems = [{ label: 'Aktif', value: 'active' }, { label: 'Dicabut', value: 'revoked' }, { label: 'Semua', value: '__all__' }]
</script>

<template>
  <PagePanel title="API key">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama, prefix, atau perusahaan…"
          class="w-full sm:w-80"
        />
        <USelect
          v-model="status"
          :items="statusItems"
          class="w-36"
        />
      </div>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Tidak ada API key."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="r in list.items.value"
              :key="r.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ r.name }} · <NuxtLink
                    :to="`/admin/tenants/${r.tenant.id}`"
                    class="hover:underline"
                  >{{ r.tenant.name }}</NuxtLink>
                </p>
                <p class="text-xs text-muted">
                  <code>{{ r.keyPrefix }}…</code> · {{ r.scopes.join(', ') }} · dibuat {{ formatDateId(r.createdAt) }} · {{ r.lastUsedAt ? `dipakai ${formatRelativeId(r.lastUsedAt)}` : 'belum dipakai' }}
                </p>
              </div>
              <UButton
                v-if="r.isActive && auth.hasPermission('api-clients.write')"
                label="Cabut"
                size="xs"
                variant="ghost"
                color="error"
                @click="revoke(r)"
              />
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
