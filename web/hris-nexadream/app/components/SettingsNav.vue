<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// Sub-navigasi area Pengaturan perusahaan.
const auth = useTenantAuth()

const items = computed<NavigationMenuItem[]>(() => [
  auth.hasAbility('settings.manage') && { label: 'Perusahaan', icon: 'i-lucide-building-2', to: '/app/settings', exact: true },
  auth.hasAbility('settings.manage') && { label: 'Jam kerja & cuti', icon: 'i-lucide-calendar-clock', to: '/app/settings/work' },
  auth.hasAbility('settings.manage') && { label: 'Absensi & persetujuan', icon: 'i-lucide-workflow', to: '/app/settings/hr' },
  auth.hasAbility('branches.manage') && { label: 'Kantor', icon: 'i-lucide-map-pin', to: '/app/branches' },
  auth.hasAbility('billing.manage') && { label: 'API key', icon: 'i-lucide-key-round', to: '/app/settings/api-keys' },
  auth.hasAbility('account.manage') && { label: 'Data & akun', icon: 'i-lucide-shield-check', to: '/app/settings/account' }
].filter(Boolean) as NavigationMenuItem[])
</script>

<template>
  <UNavigationMenu
    :items="items"
    highlight
    class="-mx-1 mb-6 overflow-x-auto border-b border-default"
  />
</template>
