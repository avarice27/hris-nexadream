<script setup lang="ts">
// Tombol upgrade di kaki rail. Disembunyikan bila paket sudah punya semua fitur atau peran
// tidak bisa membeli. Membaca `features`, tidak pernah slug paket.
defineProps<{ collapsed?: boolean }>()

const entitlements = useEntitlements()
const auth = useTenantAuth()
const visible = computed(() => entitlements.loaded.value && !entitlements.hasEverything.value && auth.hasAbility('billing.manage'))
</script>

<template>
  <UButton
    v-if="visible"
    to="/app/billing"
    icon="i-lucide-sparkles"
    :label="collapsed ? undefined : 'Upgrade paket'"
    :square="collapsed"
    variant="soft"
    :class="collapsed ? '' : 'w-full justify-center'"
    aria-label="Upgrade paket"
  />
</template>
