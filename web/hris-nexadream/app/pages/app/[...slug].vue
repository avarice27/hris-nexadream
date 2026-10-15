<script setup lang="ts">
import { TENANT_NAV } from '#shared/utils/menus'

// Halaman sementara untuk modul yang belum dibangun (karyawan, absensi, cuti, …).
// Bila rute milik fitur berbayar yang tidak termasuk paket, tampilkan status terkunci.
definePageMeta({ layout: 'tenant' })

const route = useRoute()
const entitlements = useEntitlements()
onMounted(() => entitlements.load())

const navItem = computed(() => TENANT_NAV.find(item => route.path === item.to || route.path.startsWith(`${item.to}/`)))
const lockedFeature = computed(() => {
  const feature = navItem.value?.feature
  return feature && entitlements.loaded.value && !entitlements.can(feature) ? feature : null
})

useHead({ title: () => navItem.value?.label ?? 'Segera hadir' })
</script>

<template>
  <PagePanel :title="navItem?.label ?? 'Segera hadir'">
    <FeatureLocked
      v-if="lockedFeature"
      :feature="lockedFeature"
    />
    <ComingSoon v-else />
  </PagePanel>
</template>
