<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { TENANT_ROLE_PRESETS } from '#shared/utils/tenant-abilities'

defineProps<{ collapsed?: boolean }>()

const auth = useTenantAuth()
const colorMode = useColorMode()

const roleLabel = computed(() => auth.profile.value?.tenantRole ? TENANT_ROLE_PRESETS[auth.profile.value.tenantRole].label : '')

// Menu akun berbasis kode (bukan DB). Keterangan grup tanpa baris tidak digambar.
const items = computed<DropdownMenuItem[][]>(() => {
  const company: DropdownMenuItem[] = []
  if (auth.hasAbility('billing.manage')) company.push({ label: 'Langganan', icon: 'i-lucide-credit-card', to: '/app/billing' })
  if (auth.hasAbility('settings.manage')) company.push({ label: 'Pengaturan perusahaan', icon: 'i-lucide-settings', to: '/app/settings' })

  const groups: DropdownMenuItem[][] = [
    [{ type: 'label', label: auth.profile.value?.name, description: roleLabel.value }],
    [
      { label: 'Profil', icon: 'i-lucide-user', to: '/app/profile' },
      { label: 'Ubah kata sandi', icon: 'i-lucide-key-round', to: '/app/change-password' }
    ]
  ]
  if (!auth.hasRole('employee')) {
    groups[1]!.push({ label: 'Tampilan karyawan', icon: 'i-lucide-smartphone', to: '/app/me' })
  }
  if (company.length) groups.push(company)
  groups.push([
    {
      label: colorMode.value === 'dark' ? 'Mode terang' : 'Mode gelap',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: (e: Event) => {
        e.preventDefault()
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      }
    }
  ])
  groups.push([{ label: 'Keluar', icon: 'i-lucide-log-out', color: 'error', onSelect: () => auth.logout() }])
  return groups
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-60' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      :square="collapsed"
      :label="collapsed ? undefined : auth.profile.value?.name"
      :avatar="{ alt: auth.profile.value?.name, src: auth.profile.value?.avatarUrl ?? undefined }"
      trailing-icon="i-lucide-chevrons-up-down"
      class="data-[state=open]:bg-elevated"
      :class="collapsed ? '' : 'w-full'"
      :ui="{ trailingIcon: 'text-dimmed', label: 'truncate' }"
      aria-label="Menu akun"
    />
  </UDropdownMenu>
</template>
