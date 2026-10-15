<script setup lang="ts">
// Panel halaman konsol: navbar (judul + aksi + bel) dan isi yang bisa di-scroll.
defineProps<{ title: string, id?: string }>()
const route = useRoute()
const audience = computed(() => route.path.startsWith('/admin') ? 'platform' : 'tenant')
const isTestEnvironment = useRuntimeConfig().public.appEnv !== 'production'
</script>

<template>
  <UDashboardPanel :id="id ?? title">
    <template #header>
      <template v-if="audience === 'tenant'">
        <ImpersonationBanner />
        <TrialBanner />
      </template>
      <AdminImpersonationBanner v-else />
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="audience === 'platform' && isTestEnvironment"
            label="Test environment"
            color="warning"
            variant="subtle"
            class="hidden sm:inline-flex"
          />
          <slot name="actions" />
          <NotificationMenu :audience="audience" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
