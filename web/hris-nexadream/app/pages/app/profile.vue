<script setup lang="ts">
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Profil' })

const auth = useTenantAuth()
const isEss = computed(() => auth.hasRole('employee'))
</script>

<template>
  <div
    v-if="isEss"
    class="space-y-4"
  >
    <h1 class="text-xl font-semibold">
      Profil
    </h1>
    <ProfileForm />
  </div>
  <PagePanel
    v-else
    title="Profil"
  >
    <ProfileForm />
  </PagePanel>
</template>
