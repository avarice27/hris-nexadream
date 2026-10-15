<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'

// Editor teks kaya (TipTap via Nuxt UI). Selalu dipakai sebagai <LazyRichTextEditor> agar
// bundelnya hanya dimuat di halaman CMS. Server tetap membersihkan HTML saat menyimpan.
const model = defineModel<string>({ default: '' })

const items: EditorToolbarItem[][] = [
  [
    { 'kind': 'heading', 'level': 2, 'icon': 'i-lucide-heading-2', 'aria-label': 'Judul 2' },
    { 'kind': 'heading', 'level': 3, 'icon': 'i-lucide-heading-3', 'aria-label': 'Judul 3' },
    { 'kind': 'paragraph', 'icon': 'i-lucide-pilcrow', 'aria-label': 'Paragraf' }
  ],
  [
    { 'kind': 'mark', 'mark': 'bold', 'icon': 'i-lucide-bold', 'aria-label': 'Tebal' },
    { 'kind': 'mark', 'mark': 'italic', 'icon': 'i-lucide-italic', 'aria-label': 'Miring' },
    { 'kind': 'mark', 'mark': 'underline', 'icon': 'i-lucide-underline', 'aria-label': 'Garis bawah' },
    { 'kind': 'link', 'icon': 'i-lucide-link', 'aria-label': 'Tautan' }
  ],
  [
    { 'kind': 'bulletList', 'icon': 'i-lucide-list', 'aria-label': 'Daftar' },
    { 'kind': 'orderedList', 'icon': 'i-lucide-list-ordered', 'aria-label': 'Daftar bernomor' },
    { 'kind': 'blockquote', 'icon': 'i-lucide-text-quote', 'aria-label': 'Kutipan' },
    { 'kind': 'horizontalRule', 'icon': 'i-lucide-separator-horizontal', 'aria-label': 'Garis pemisah' }
  ],
  [
    { 'kind': 'undo', 'icon': 'i-lucide-undo', 'aria-label': 'Urungkan' },
    { 'kind': 'redo', 'icon': 'i-lucide-redo', 'aria-label': 'Ulangi' }
  ]
]
</script>

<template>
  <div class="rounded-md border border-default">
    <UEditor
      v-slot="{ editor }"
      v-model="model"
      content-type="html"
      placeholder="Tulis isi halaman…"
      class="min-h-80 w-full px-4 py-3"
    >
      <UEditorToolbar
        :editor="editor"
        :items="items"
        class="-mx-4 -mt-3 mb-3 border-b border-default px-2 py-1 sm:-mx-4"
      />
    </UEditor>
  </div>
</template>
