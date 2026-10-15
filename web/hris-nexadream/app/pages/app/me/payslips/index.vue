<script setup lang="ts">
// Daftar slip gaji saya. Nominal disembunyikan sampai diketuk (layar ponsel sering terlihat orang lain).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Slip gaji' })

interface Row { id: string, code: string, periodLabel: string, net: number, paidDate: string | null, viewed: boolean }
const items = ref<Row[] | null>(null)
const errorMessage = ref('')
const shown = ref(new Set<string>())
onMounted(async () => {
  try {
    items.value = (await apiFetch<{ items: Row[] }>('/api/app/me/payslips')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
function toggle(id: string) {
  const next = new Set(shown.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  shown.value = next
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold text-highlighted">
      Slip gaji
    </h1>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!items"
      class="h-40 w-full"
    />
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!items.length"
        class="p-6 text-center text-sm text-muted"
      >
        Belum ada slip gaji yang terbit.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="row in items"
          :key="row.id"
          class="flex items-center gap-3 px-4 py-3 text-sm"
        >
          <UIcon
            name="i-lucide-file-text"
            class="size-5 text-primary"
          />
          <NuxtLink
            :to="`/app/me/payslips/${row.id}`"
            class="min-w-0 flex-1"
          >
            <p class="font-medium">
              {{ row.periodLabel }}
              <UBadge
                v-if="!row.viewed"
                label="Baru"
                size="xs"
                class="ml-1"
              />
            </p>
            <p class="text-xs text-muted">
              {{ row.code }}<span v-if="row.paidDate"> · dibayar {{ formatDateShort(row.paidDate) }}</span>
            </p>
          </NuxtLink>
          <button
            type="button"
            class="tabular font-medium"
            :aria-label="shown.has(row.id) ? 'Sembunyikan nominal' : 'Tampilkan nominal'"
            @click="toggle(row.id)"
          >
            {{ shown.has(row.id) ? formatIDR(row.net) : 'Rp ••••••' }}
          </button>
          <UButton
            :to="`/app/me/payslips/${row.id}`"
            icon="i-lucide-chevron-right"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Buka slip"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
