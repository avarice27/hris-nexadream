<script setup lang="ts">
// Katalog hak akses (hanya baca). Kunci didefinisikan di kode, bukan dibuat di sini.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Hak akses' })

interface PermissionRow { key: string, group: string, groupLabel: string, description: string, roles: string[] }
const data = ref<PermissionRow[] | null>(null)
const errorMessage = ref('')
onMounted(async () => {
  try {
    data.value = (await apiFetch<{ items: PermissionRow[] }>('/api/admin/permissions')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
</script>

<template>
  <PagePanel title="Hak akses">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-80 w-full"
    />
    <div
      v-else
      class="overflow-x-auto rounded-md border border-default"
    >
      <table class="w-full text-sm">
        <thead class="bg-elevated/50 text-left text-xs text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">
              Kunci
            </th>
            <th class="px-3 py-2 font-medium">
              Grup
            </th>
            <th class="px-3 py-2 font-medium">
              Deskripsi
            </th>
            <th class="px-3 py-2 font-medium">
              Dipegang oleh
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="p in data"
            :key="p.key"
          >
            <td class="px-3 py-2 font-mono text-xs">
              {{ p.key }}
            </td>
            <td class="px-3 py-2">
              {{ p.groupLabel }}
            </td>
            <td class="px-3 py-2 text-muted">
              {{ p.description }}
            </td>
            <td class="px-3 py-2">
              <span
                v-if="!p.roles.length"
                class="text-xs text-dimmed"
              >Belum ada</span>
              <span class="flex flex-wrap gap-1">
                <UBadge
                  v-for="r in p.roles"
                  :key="r"
                  :label="r"
                  size="sm"
                  variant="subtle"
                  color="neutral"
                />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </PagePanel>
</template>
