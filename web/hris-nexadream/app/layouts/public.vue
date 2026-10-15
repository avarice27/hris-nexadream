<script setup lang="ts">
// Layout situs publik. Footer membaca /api/public/site (kecil, di-cache) agar identitas,
// kontak, dan ikon sosial selalu sama dengan pengaturan di /admin/settings.
interface SiteInfo {
  company: { name: string, tagline: string, email: string, phone: string, address: string, whatsapp: string, socials: Record<string, string>, playStoreUrl: string }
}
const { data: site } = await useFetch<SiteInfo>('/api/public/site', { key: 'public-site' })
const route = useRoute()
const mobileOpen = ref(false)
watch(() => route.fullPath, () => {
  mobileOpen.value = false
})

// Tautan bagian landing; dari halaman lain mengarah ke "/#bagian".
const sections = [
  { label: 'Fitur', hash: 'fitur' },
  { label: 'Harga', hash: 'harga' },
  { label: 'FAQ', hash: 'faq' },
  { label: 'Kontak', hash: 'kontak' }
]
const sectionLink = (hash: string) => ({ path: '/', hash: `#${hash}` })

const SOCIAL_ICONS: Record<string, { icon: string, label: string }> = {
  instagram: { icon: 'i-simple-icons-instagram', label: 'Instagram' },
  linkedin: { icon: 'i-simple-icons-linkedin', label: 'LinkedIn' },
  facebook: { icon: 'i-simple-icons-facebook', label: 'Facebook' },
  youtube: { icon: 'i-simple-icons-youtube', label: 'YouTube' }
}
const socials = computed(() => Object.entries(site.value?.company.socials ?? {})
  .filter(([key, url]) => url && SOCIAL_ICONS[key])
  .map(([key, url]) => ({ url, ...SOCIAL_ICONS[key]! })))

const legalLinks = [
  { label: 'Kebijakan Privasi', to: '/privacy' },
  { label: 'Syarat & Ketentuan', to: '/terms' },
  { label: 'Penghapusan akun', to: '/hapus-akun' },
  { label: 'Dokumentasi API', to: '/docs/api' }
]
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <NuxtLink
          to="/"
          aria-label="Beranda"
        >
          <AppLogo />
        </NuxtLink>
        <nav
          class="hidden items-center gap-1 md:flex"
          aria-label="Navigasi utama"
        >
          <UButton
            v-for="s in sections"
            :key="s.hash"
            :to="sectionLink(s.hash)"
            :label="s.label"
            variant="ghost"
            color="neutral"
          />
        </nav>
        <div class="flex items-center gap-2">
          <UButton
            to="/app/auth/login"
            label="Masuk"
            variant="ghost"
            color="neutral"
            class="hidden sm:inline-flex"
          />
          <UButton
            to="/app/auth/register"
            label="Coba gratis"
          />
          <UButton
            icon="i-lucide-menu"
            variant="ghost"
            color="neutral"
            class="md:hidden"
            aria-label="Buka menu"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = !mobileOpen"
          />
        </div>
      </UContainer>
      <nav
        v-if="mobileOpen"
        class="border-t border-default md:hidden"
        aria-label="Navigasi utama"
      >
        <UContainer class="flex flex-col py-2">
          <UButton
            v-for="s in sections"
            :key="s.hash"
            :to="sectionLink(s.hash)"
            :label="s.label"
            variant="ghost"
            color="neutral"
            class="justify-start"
            @click="mobileOpen = false"
          />
          <UButton
            to="/app/auth/login"
            label="Masuk"
            variant="ghost"
            color="neutral"
            class="justify-start sm:hidden"
          />
        </UContainer>
      </nav>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-default py-12">
      <UContainer class="grid gap-8 text-sm md:grid-cols-4">
        <div class="space-y-3 md:col-span-2">
          <AppLogo />
          <p class="max-w-sm text-muted">
            {{ site?.company.tagline }}
          </p>
          <div
            v-if="socials.length"
            class="flex gap-1"
          >
            <UButton
              v-for="s in socials"
              :key="s.label"
              :to="s.url"
              target="_blank"
              rel="noopener"
              :icon="s.icon"
              :aria-label="s.label"
              variant="ghost"
              color="neutral"
            />
          </div>
          <a
            v-if="site?.company.playStoreUrl"
            :href="site.company.playStoreUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 rounded-md border border-default px-3 py-2 hover:bg-elevated"
          >
            <UIcon
              name="i-simple-icons-googleplay"
              class="size-4"
            />
            Unduh di Google Play
          </a>
        </div>
        <div class="space-y-2">
          <p class="font-medium text-highlighted">
            Produk
          </p>
          <ul class="space-y-2 text-muted">
            <li
              v-for="s in sections"
              :key="s.hash"
            >
              <NuxtLink
                :to="sectionLink(s.hash)"
                class="hover:text-default"
              >
                {{ s.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>
        <div class="space-y-2">
          <p class="font-medium text-highlighted">
            Legal & kontak
          </p>
          <ul class="space-y-2 text-muted">
            <li
              v-for="l in legalLinks"
              :key="l.to"
            >
              <NuxtLink
                :to="l.to"
                class="hover:text-default"
              >
                {{ l.label }}
              </NuxtLink>
            </li>
            <li v-if="site?.company.email">
              <a
                :href="`mailto:${site.company.email}`"
                class="hover:text-default"
              >{{ site.company.email }}</a>
            </li>
          </ul>
        </div>
        <p class="border-t border-default pt-6 text-muted md:col-span-4">
          © {{ new Date().getFullYear() }} {{ site?.company.name || 'HRIS Nexadream' }}. Semua hak dilindungi.
        </p>
      </UContainer>
    </footer>
  </div>
</template>
