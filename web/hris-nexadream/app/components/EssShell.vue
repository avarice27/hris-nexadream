<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ESS_NAV } from '#shared/utils/menus'

// Shell layanan mandiri karyawan: mobile-first, tab bawah di ponsel (4 + "Lainnya"), tanpa rail/paket.
const auth = useTenantAuth()
const route = useRoute()

const tabs = computed(() => ESS_NAV.filter(item => !item.ability || auth.hasAbility(item.ability)))
const bottomTabs = computed(() => tabs.value.slice(0, 4))
const moreItems = computed<DropdownMenuItem[]>(() => tabs.value.slice(4).map(t => ({ label: t.label, icon: t.icon, to: t.to })))
// Pemilik/Admin HR/atasan yang membuka layanan mandirinya sendiri bisa kembali ke konsol.
const canManage = computed(() => !auth.hasRole('employee'))

function isActive(to: string) {
  return to === '/app/me' ? route.path === '/app/me' : route.path.startsWith(to)
}
const moreActive = computed(() => tabs.value.slice(4).some(t => isActive(t.to)))
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-default">
    <ImpersonationBanner />
    <header class="sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <NuxtLink
          to="/app/me"
          class="min-w-0"
        >
          <AppLogo />
        </NuxtLink>
        <nav
          class="hidden md:flex items-center gap-0.5"
          aria-label="Navigasi karyawan"
        >
          <UButton
            v-for="tab in tabs"
            :key="tab.to"
            :to="tab.to"
            :icon="tab.icon"
            :label="tab.label"
            size="sm"
            :variant="isActive(tab.to) ? 'soft' : 'ghost'"
            :color="isActive(tab.to) ? 'primary' : 'neutral'"
          />
        </nav>
        <div class="flex items-center gap-1">
          <UButton
            v-if="canManage"
            to="/app/dashboard"
            icon="i-lucide-layout-dashboard"
            label="Konsol"
            size="sm"
            variant="outline"
            color="neutral"
            class="hidden sm:inline-flex"
          />
          <NotificationMenu audience="tenant" />
          <TenantUserMenu collapsed />
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-6">
      <slot />
    </main>

    <nav
      class="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-default bg-default/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigasi karyawan"
    >
      <ul class="grid grid-cols-5">
        <li
          v-for="tab in bottomTabs"
          :key="tab.to"
        >
          <NuxtLink
            :to="tab.to"
            class="flex flex-col items-center gap-0.5 py-2 text-xs"
            :class="isActive(tab.to) ? 'text-primary font-medium' : 'text-muted'"
          >
            <UIcon
              :name="tab.icon"
              class="size-5"
            />
            {{ tab.label }}
          </NuxtLink>
        </li>
        <li v-if="moreItems.length || canManage">
          <UDropdownMenu
            :items="[moreItems, ...(canManage ? [[{ label: 'Konsol manajemen', icon: 'i-lucide-layout-dashboard', to: '/app/dashboard' }]] : [])]"
            :content="{ side: 'top', align: 'end' }"
          >
            <button
              type="button"
              class="flex w-full flex-col items-center gap-0.5 py-2 text-xs"
              :class="moreActive ? 'text-primary font-medium' : 'text-muted'"
            >
              <UIcon
                name="i-lucide-ellipsis"
                class="size-5"
              />
              Lainnya
            </button>
          </UDropdownMenu>
        </li>
      </ul>
    </nav>
  </div>
</template>
