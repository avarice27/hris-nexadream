<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

interface AdminMenuNode {
  id: string
  label: string
  slug: string
  path: string | null
  icon: string | null
  children: AdminMenuNode[]
}

// Shell back-office: sidebar dari tabel menus (dipangkas sesuai hak akses di server).
const auth = usePlatformAuth()
const config = useRuntimeConfig()
const colorMode = useColorMode()
const open = ref(false)
const menus = useState<AdminMenuNode[]>('admin:menus', () => [])
const menusLoaded = useState<boolean>('admin:menus:loaded', () => false)

onMounted(async () => {
  if (menusLoaded.value) return
  try {
    menus.value = (await apiFetch<{ items: AdminMenuNode[] }>('/api/admin/auth/menus')).items
    menusLoaded.value = true
  } catch {
    menus.value = []
  }
})

function toNavItem(node: AdminMenuNode): NavigationMenuItem {
  return {
    label: node.label,
    icon: node.icon ?? undefined,
    to: node.path ?? undefined,
    children: node.children.length ? node.children.map(toNavItem) : undefined,
    onSelect: node.path ? () => { open.value = false } : undefined
  }
}

const sections = computed(() => menus.value.map(section => ({
  label: section.label,
  items: section.children.map(toNavItem)
})))

const fixedItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin/dashboard' },
  ...(auth.hasPermission('reports.read') ? [{ label: 'Laporan', icon: 'i-lucide-chart-column', to: '/admin/reports' }] : [])
])

const userItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: auth.profile.value?.name, description: auth.profile.value?.role?.name }],
  [
    { label: 'Profil', icon: 'i-lucide-user', to: '/admin/profile' },
    { label: 'Ubah kata sandi', icon: 'i-lucide-key-round', to: '/admin/change-password' }
  ],
  [{
    label: colorMode.value === 'dark' ? 'Mode terang' : 'Mode gelap',
    icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
    onSelect: (e: Event) => {
      e.preventDefault()
      colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
    }
  }],
  [{ label: 'Keluar', icon: 'i-lucide-log-out', color: 'error', onSelect: () => auth.logout() }]
])
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="cookie"
    storage-key="admin-sidebar"
  >
    <UDashboardSidebar
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25 print:hidden"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/admin/dashboard"
          class="flex min-w-0 items-center gap-2"
        >
          <AppLogo :compact="collapsed" />
          <UBadge
            v-if="!collapsed"
            label="Admin"
            variant="subtle"
            size="sm"
          />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="fixedItems"
          orientation="vertical"
          tooltip
        />
        <template
          v-for="section in sections"
          :key="section.label"
        >
          <p
            v-if="!collapsed"
            class="mt-3 px-2.5 text-xs font-medium uppercase tracking-wide text-dimmed"
          >
            {{ section.label }}
          </p>
          <UNavigationMenu
            :collapsed="collapsed"
            :items="section.items"
            orientation="vertical"
            tooltip
            popover
          />
        </template>
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
          <UDropdownMenu
            :items="userItems"
            :content="{ align: 'end' }"
            :ui="{ content: 'w-56' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              :square="collapsed"
              :label="collapsed ? undefined : auth.profile.value?.name"
              :avatar="{ alt: auth.profile.value?.name }"
              trailing-icon="i-lucide-chevrons-up-down"
              :class="collapsed ? '' : 'w-full'"
              :ui="{ trailingIcon: 'text-dimmed', label: 'truncate' }"
              aria-label="Menu akun"
            />
          </UDropdownMenu>
          <p
            v-if="!collapsed"
            class="px-2.5 text-xs text-dimmed"
          >
            v{{ config.public.appVersion }}
          </p>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
