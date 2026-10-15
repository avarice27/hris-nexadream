<script setup lang="ts">
// Halaman CMS publik (SSR, terindeks). Isinya sudah dibersihkan server (sanitize-html) saat disimpan.
const props = defineProps<{ slug: string }>()

interface PublicPage { slug: string, title: string, content: string, excerpt: string | null, metaTitle: string | null, metaDescription: string | null, updatedAt: string }
const { data, error } = await useFetch<PublicPage>(`/api/public/pages/${props.slug}`, { key: `public-page-${props.slug}` })
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Halaman tidak ditemukan', fatal: true })
}
const config = useRuntimeConfig()
const path = ['privacy', 'terms'].includes(props.slug) ? `/${props.slug}` : `/page/${props.slug}`
useSeoMeta({
  title: () => data.value?.metaTitle || data.value?.title,
  description: () => data.value?.metaDescription || data.value?.excerpt || undefined,
  ogTitle: () => data.value?.metaTitle || data.value?.title,
  ogDescription: () => data.value?.metaDescription || data.value?.excerpt || undefined,
  ogType: 'article'
})
useHead({ link: [{ rel: 'canonical', href: `${config.public.siteUrl.replace(/\/$/, '')}${path}` }] })
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <article
      v-if="data"
      class="mx-auto max-w-3xl"
    >
      <h1 class="text-3xl font-semibold text-highlighted">
        {{ data.title }}
      </h1>
      <p class="mt-2 text-sm text-muted">
        Diperbarui {{ formatDateId(data.updatedAt) }}
      </p>
      <!-- HTML dibersihkan server (sanitize-html) saat disimpan -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="cms-content mt-8"
        v-html="data.content"
      />
      <!-- eslint-enable vue/no-v-html -->
    </article>
  </UContainer>
</template>

<style scoped>
.cms-content :deep(h2) { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 0.75rem; color: var(--ui-text-highlighted); }
.cms-content :deep(h3) { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: var(--ui-text-highlighted); }
.cms-content :deep(p) { margin: 0.75rem 0; line-height: 1.7; }
.cms-content :deep(ul) { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
.cms-content :deep(ol) { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
.cms-content :deep(li) { margin: 0.25rem 0; line-height: 1.7; }
.cms-content :deep(a) { color: var(--ui-primary); text-decoration: underline; }
.cms-content :deep(blockquote) { border-left: 3px solid var(--ui-border); padding-left: 1rem; color: var(--ui-text-muted); }
</style>
