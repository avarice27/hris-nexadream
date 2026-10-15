<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { TENANT_NAV } from '#shared/utils/menus'

// Shell konsol manajemen (owner, hr_admin, manager).
// ATURAN: kemampuan menentukan TAMPIL/TIDAK; fitur paket menentukan GEMBOK. Entri berbayar tidak
// pernah disembunyikan — diklik membuka dialog upgrade. Server tetap memeriksa keduanya.
const auth = useTenantAuth()
const entitlements = useEntitlements()
const open = ref(false)

onMounted(() => entitlements.load())
useEntitlementsAutoRefresh()

const navItems = computed<NavigationMenuItem[]>(() => TENANT_NAV
  .filter(item => !item.ability || auth.hasAbility(item.ability))
  .map((item) => {
    const locked = !!item.feature && !entitlements.can(item.feature)
    if (!locked) {
      return {
        label: item.label,
        icon: item.icon,
        to: item.to,
        onSelect: () => {
          open.value = false
        }
      }
    }
    return {
      label: item.label,
      icon: item.icon,
      trailingIcon: 'i-lucide-lock',
      class: 'text-muted',
      onSelect: (e: Event) => {
        e.preventDefault()
        open.value = false
        entitlements.upgradeRequired(item.feature!)
      }
    }
  }))
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="cookie"
    storage-key="tenant-sidebar"
  >
    <UDashboardSidebar
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/app/dashboard"
          class="flex min-w-0 items-center gap-2"
        >
          <AppLogo :compact="collapsed" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <p
          v-if="!collapsed"
          class="px-2.5 text-xs font-medium text-muted truncate"
        >
          {{ auth.tenant.value?.name }}
        </p>
        <BranchSwitcher :collapsed="collapsed" />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
          <UpgradeRailButton :collapsed="collapsed" />
          <TenantUserMenu :collapsed="collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
    <UpgradeDialog />
    <BranchSelectionDialog />
  </UDashboardGroup>
</template>
