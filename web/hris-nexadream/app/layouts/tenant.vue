<script setup lang="ts">
// Shell dipilih berdasarkan peran: karyawan → ESS, lainnya → konsol manajemen.
const auth = useTenantAuth()
const isEmployee = computed(() => auth.hasRole('employee'))
const isEssRoute = computed(() => useRoute().path.startsWith('/app/me'))
</script>

<template>
  <EssShell v-if="isEmployee || isEssRoute">
    <slot />
  </EssShell>
  <TenantShell v-else>
    <slot />
  </TenantShell>
</template>
