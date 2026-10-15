<script setup lang="ts">
import { formatDateTimeId } from '#shared/utils/format'

// Halaman CMS (privasi, syarat, bantuan, dll). Publik di /page/:slug.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Halaman' })

interface PageRow { id: string, slug: string, title: string, isPublished: boolean, updatedAt: string }
const auth = usePlatformAuth()
const rows = ref<PageRow[] | null>(null)
const errorMessage = ref('')
onMounted(async () => {
  try {
    rows.value = (await apiFetch<{ items: PageRow[] }>('/api/admin/pages')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})
</script>

<template>
  <PagePanel title="Halaman">
    <template #actions>
      <UButton
        v-if="auth.hasPermission('pages.write')"
        to="/admin/pages/new"
        label="Halaman baru"
        icon="i-lucide-plus"
      />
    </template>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!rows"
      class="h-64 w-full"
    />
    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="row in rows"
          :key="row.id"
        >
          <NuxtLink
            :to="`/admin/pages/${row.id}`"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-elevated"
          >
            <UIcon
              name="i-lucide-file-text"
              class="size-5 text-muted"
            />
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ row.title }}
              </p>
              <p class="text-xs text-muted">
                /page/{{ row.slug }} · diperbarui {{ formatDateTimeId(row.updatedAt, auth.displayTimezone.value) }}
              </p>
            </div>
            <UBadge
              :label="row.isPublished ? 'Terbit' : 'Draf'"
              :color="row.isPublished ? 'success' : 'neutral'"
              variant="subtle"
            />
          </NuxtLink>
        </li>
      </ul>
    </UCard>
  </PagePanel>
</template>
