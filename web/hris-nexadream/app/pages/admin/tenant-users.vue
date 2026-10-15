<script setup lang="ts">
import { formatRelativeId } from '#shared/utils/format'
import { TENANT_ROLE_META, statusMeta } from '#shared/utils/status'
import { ImpersonateDialog } from '#components'

// Semua login perusahaan. Kontak login karyawan disamarkan (D7).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Pengguna perusahaan' })

interface TenantUserRow {
  id: string
  name: string
  email: string
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  memberships: Array<{ tenantId: string, tenantName: string, tenantDeleted: boolean, role: string, isActive: boolean }>
}

const auth = usePlatformAuth()
const toast = useToast()
const overlay = useOverlay()
const { impersonateTenantUser } = useAdminImpersonation()
const role = ref<string | undefined>('__all__')
const list = useServerList<TenantUserRow>('/api/admin/tenant-users', { filters: { role } })
const roleItems = [{ label: 'Semua peran', value: '__all__' }, ...['owner', 'hr_admin', 'manager', 'employee'].map(r => ({ label: TENANT_ROLE_META[r]!.label, value: r }))]
const impersonateModal = overlay.create(ImpersonateDialog)

async function impersonate(row: TenantUserRow, tenantId: string, tenantName: string) {
  const reason = await impersonateModal.open({ title: `Masuk sebagai ${row.name}`, description: `Di ${tenantName}. Konsol perusahaan terbuka di tab baru.` })
  if (!reason) return
  try {
    await impersonateTenantUser(row.id, reason, tenantId)
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <PagePanel title="Pengguna perusahaan">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama, email, atau perusahaan…"
          class="w-full sm:w-80"
          aria-label="Cari pengguna"
        />
        <USelect
          v-model="role"
          :items="roleItems"
          class="w-48"
          aria-label="Filter peran"
        />
      </div>
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
              class="px-4 py-3 text-sm"
              :class="row.isActive ? '' : 'opacity-60'"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {{ row.name }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ row.email }}<span v-if="row.phone"> · {{ row.phone }}</span> · {{ row.lastLoginAt ? `masuk ${formatRelativeId(row.lastLoginAt)}` : 'belum pernah masuk' }}
                  </p>
                </div>
              </div>
              <ul class="mt-2 flex flex-wrap gap-2">
                <li
                  v-for="m in row.memberships"
                  :key="m.tenantId"
                  class="flex items-center gap-1.5 rounded-md border border-default px-2 py-1 text-xs"
                  :class="m.isActive && !m.tenantDeleted ? '' : 'opacity-60'"
                >
                  <NuxtLink
                    :to="`/admin/tenants/${m.tenantId}`"
                    class="hover:underline"
                  >
                    {{ m.tenantName }}
                  </NuxtLink>
                  <UBadge
                    :label="statusMeta(TENANT_ROLE_META, m.role).label"
                    size="xs"
                    variant="subtle"
                    color="neutral"
                  />
                  <UButton
                    v-if="auth.hasPermission('impersonation.use') && m.isActive && !m.tenantDeleted && row.isActive"
                    icon="i-lucide-log-in"
                    size="xs"
                    variant="ghost"
                    color="warning"
                    :aria-label="`Masuk sebagai ${row.name}`"
                    @click="impersonate(row, m.tenantId, m.tenantName)"
                  />
                </li>
              </ul>
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
