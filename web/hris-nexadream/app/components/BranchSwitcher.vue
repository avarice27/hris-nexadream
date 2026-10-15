<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// Pemilih kantor di atas rail. Hanya tampil bila ada lebih dari satu kantor aktif.
defineProps<{ collapsed?: boolean }>()

const branch = useActiveBranch()
onMounted(() => branch.load().catch(() => {}))

const items = computed<DropdownMenuItem[]>(() => branch.activeBranches.value.map(b => ({
  label: b.name,
  icon: b.id === branch.activeBranchId.value ? 'i-lucide-check' : 'i-lucide-building',
  onSelect: () => branch.setActiveBranch(b.id)
})))
</script>

<template>
  <UDropdownMenu
    v-if="branch.activeBranches.value.length > 1"
    :items="items"
    :content="{ align: 'start' }"
    :ui="{ content: 'w-56' }"
  >
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-building"
      :label="collapsed ? undefined : branch.activeBranch.value?.name"
      :square="collapsed"
      trailing-icon="i-lucide-chevrons-up-down"
      :class="collapsed ? '' : 'w-full'"
      :ui="{ label: 'truncate', trailingIcon: 'text-dimmed' }"
      aria-label="Pilih kantor"
    />
  </UDropdownMenu>
</template>
