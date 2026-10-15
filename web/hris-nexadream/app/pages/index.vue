<script setup lang="ts">
import { FEATURE_META, LIMIT_META, addedFeatures, formatLimit, isCustomPricedPlan, yearlySaving } from '#shared/utils/plans'
import type { FeatureKey, LimitKey, PlanFeatures, PlanLimits } from '#shared/utils/plans'
import { formatIDR } from '#shared/utils/format'

// Landing (SSR, terindeks). Kerangka bagian tetap; harga, batas, FAQ, dan identitas
// selalu dari GET /api/public/landing (diedit di /admin) — jangan tulis harga di sini.
definePageMeta({ layout: 'public' })

interface LandingPlan {
  slug: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  currency: string
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
}
interface Landing {
  plans: LandingPlan[]
  trial: { planSlug: string, days: number }
  faqs: Array<{ id: string, question: string, answer: string }>
  company: { name: string, tagline: string, email: string, phone: string, address: string, whatsapp: string, logoUrl: string, socials: Record<string, string>, playStoreUrl: string }
  registrationOpen: boolean
  siteUrl: string
}

const { data } = await useFetch<Landing>('/api/public/landing', { key: 'public-landing' })
const plans = computed(() => data.value?.plans ?? [])
const company = computed(() => data.value?.company)
const registrationOpen = computed(() => data.value?.registrationOpen ?? true)
const trialDays = computed(() => data.value?.trial.days ?? 0)
const trialPlanName = computed(() => plans.value.find(p => p.slug === data.value?.trial.planSlug)?.name)

// --- Fitur: tiap kartu terkait kunci fitur paket → "Tersedia mulai paket X" dihitung dari DB.
const features: Array<{ icon: string, title: string, description: string, featureKey?: FeatureKey, note?: string }> = [
  { icon: 'i-lucide-map-pin-check', title: 'Absensi', description: 'Absen masuk/pulang dari ponsel, jadwal shift, geofence dan selfie opsional, dengan zona waktu tiap kantor (WIB, WITA, WIT).' },
  { icon: 'i-lucide-calendar-check', title: 'Cuti & lembur', description: 'Saldo cuti otomatis, pengajuan dan persetujuan atasan, lembur, serta klaim reimbursement tanpa kertas.', featureKey: 'leaveManagement' },
  { icon: 'i-lucide-wallet', title: 'Penggajian', description: 'Hitung PPh 21 (TER), BPJS Kesehatan dan Ketenagakerjaan, THR, lalu terbitkan slip gaji digital.', featureKey: 'payroll', note: 'Nexadream menghitung dan mencatat; transfer gaji tetap dilakukan perusahaan lewat bank Anda.' },
  { icon: 'i-lucide-smartphone', title: 'Layanan mandiri karyawan', description: 'Karyawan melihat slip gaji, saldo cuti, dan status pengajuan sendiri dari ponselnya.' },
  { icon: 'i-lucide-folder-lock', title: 'Dokumen karyawan', description: 'Kontrak, KTP, dan sertifikat tersimpan privat; hanya yang berhak yang bisa membuka.', featureKey: 'documentVault' },
  { icon: 'i-lucide-building-2', title: 'Multi-kantor', description: 'Beberapa kantor atau cabang dalam satu perusahaan, lengkap dengan laporan gabungan.', featureKey: 'multiBranchRollup' }
]
function availableFrom(key?: FeatureKey): string | null {
  if (!key) return null
  const first = plans.value.find(p => p.features[key])
  if (!first || first === plans.value[0]) return null
  return `Mulai paket ${first.name}`
}

const reasons = [
  { icon: 'i-lucide-scale', title: 'Dibuat untuk aturan Indonesia', description: 'Perhitungan mengikuti ketentuan PPh 21, BPJS, dan UU Ketenagakerjaan yang kami pelihara dan perbarui.' },
  { icon: 'i-lucide-shield-check', title: 'Data karyawan terlindungi', description: 'NIK, NPWP, rekening, dan gaji dienkripsi dan disamarkan; setiap akses tercatat, mengacu pada UU PDP.' },
  { icon: 'i-lucide-messages-square', title: 'Dukungan berbahasa Indonesia', description: 'Tim dukungan lokal yang memahami cara kerja HR di perusahaan Indonesia.' }
]

const steps = [
  { title: 'Daftarkan perusahaan', description: 'Isi data perusahaan dan kantor. Selesai dalam beberapa menit.' },
  { title: 'Masukkan karyawan', description: 'Tambah satu per satu atau impor dari Excel.' },
  { title: 'Jalankan absensi & payroll', description: 'Karyawan absen dari ponsel; akhir bulan gaji dihitung otomatis.' }
]

// --- Harga
const billingCycle = ref<'monthly' | 'yearly'>('monthly')
const maxSaving = computed(() => Math.max(0, ...plans.value.map(p => yearlySaving(p).percent)))
const highlightSlug = computed(() => {
  // Sorot paket berbayar kedua (atau satu-satunya) — biasanya pilihan UMKM yang sedang tumbuh.
  const paid = plans.value.filter(p => p.priceMonthly > 0)
  return paid.length > 1 ? paid[1]!.slug : paid[0]?.slug
})
const shownLimits: LimitKey[] = ['employees', 'branches', 'teamMembers', 'storageMb']

function priceLine(plan: LandingPlan): { main: string, suffix: string, sub?: string } {
  if (isCustomPricedPlan(plan)) return { main: 'Hubungi kami', suffix: '', sub: 'Harga sesuai kebutuhan' }
  if (plan.priceMonthly === 0 && plan.priceYearly === 0) return { main: 'Gratis', suffix: '', sub: 'Selamanya' }
  if (billingCycle.value === 'yearly' && plan.priceYearly > 0) {
    return { main: formatIDR(plan.priceYearly), suffix: '/tahun', sub: `setara ${formatIDR(Math.round(plan.priceYearly / 12))}/bulan` }
  }
  return { main: formatIDR(plan.priceMonthly), suffix: '/bulan', sub: plan.priceYearly > 0 ? `atau ${formatIDR(plan.priceYearly)}/tahun` : undefined }
}
function planCta(plan: LandingPlan): { label: string, to: string } {
  if (isCustomPricedPlan(plan) || !registrationOpen.value) return { label: 'Hubungi kami', to: '#kontak' }
  return { label: plan.priceMonthly === 0 ? 'Mulai gratis' : 'Coba gratis', to: '/app/auth/register' }
}
function planFeatureList(plan: LandingPlan, index: number) {
  const previous = index > 0 ? plans.value[index - 1] : undefined
  return { previousName: previous?.name, keys: addedFeatures(plan, previous) }
}

// --- FAQ
const faqItems = computed(() => (data.value?.faqs ?? []).map(f => ({ label: f.question, content: f.answer, value: f.id })))

// --- SEO + data terstruktur
const title = 'Aplikasi HRIS, absensi online & payroll untuk UMKM'
// Tagline tanpa titik akhir agar bisa disambung kalimat lain.
const tagline = computed(() => (company.value?.tagline || 'HR, absensi, dan payroll untuk bisnis Indonesia dalam satu aplikasi').replace(/[.!\s]+$/, ''))
const description = computed(() => `${tagline.value}. Hitung PPh 21 dan BPJS otomatis, cuti dan lembur tanpa kertas. Coba gratis.`)
const siteUrl = computed(() => (data.value?.siteUrl ?? useRuntimeConfig().public.siteUrl).replace(/\/$/, ''))
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: () => `${siteUrl.value}/`,
  ogLocale: 'id_ID',
  twitterCard: 'summary'
})

const jsonLd = computed(() => {
  const name = company.value?.name || 'HRIS Nexadream'
  const offers = plans.value
    .filter(p => !isCustomPricedPlan(p))
    .map(p => ({ '@type': 'Offer', 'name': p.name, 'price': String(p.priceMonthly), 'priceCurrency': 'IDR', 'url': `${siteUrl.value}/#harga` }))
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      '@id': `${siteUrl.value}/#organization`,
      name,
      'url': `${siteUrl.value}/`,
      ...(company.value?.logoUrl ? { logo: company.value.logoUrl } : {}),
      ...(company.value?.email ? { email: company.value.email } : {}),
      ...(company.value?.phone ? { telephone: company.value.phone } : {}),
      'sameAs': Object.values(company.value?.socials ?? {}).filter(Boolean)
    },
    {
      '@type': 'SoftwareApplication',
      name,
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'inLanguage': 'id-ID',
      'description': description.value,
      'url': `${siteUrl.value}/`,
      'publisher': { '@id': `${siteUrl.value}/#organization` },
      ...(offers.length ? { offers } : {})
    }
  ]
  if (data.value?.faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      'mainEntity': data.value.faqs.map(f => ({ '@type': 'Question', 'name': f.question, 'acceptedAnswer': { '@type': 'Answer', 'text': f.answer } }))
    })
  }
  // `<` di-escape agar teks dari DB tidak bisa menutup tag <script>.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
})
useHead({
  link: [{ rel: 'canonical', href: () => `${siteUrl.value}/` }],
  script: [{ type: 'application/ld+json', innerHTML: jsonLd, key: 'ld-landing' }]
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section
      id="beranda"
      class="scroll-mt-20 overflow-hidden"
    >
      <UContainer class="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <div class="space-y-6">
          <UBadge
            v-if="trialDays > 0 && registrationOpen"
            :label="`Uji coba ${trialDays} hari${trialPlanName ? ` paket ${trialPlanName}` : ''}, tanpa kartu kredit`"
            variant="subtle"
            icon="i-lucide-sparkles"
          />
          <h1 class="text-4xl font-semibold tracking-tight text-highlighted sm:text-5xl">
            HR, absensi, dan payroll untuk bisnis Indonesia
          </h1>
          <p class="text-lg text-muted">
            {{ tagline }}. Tinggalkan spreadsheet dan grup chat: absen dari ponsel, cuti tanpa kertas, gaji dengan PPh 21 dan BPJS terhitung otomatis.
          </p>
          <div class="flex flex-wrap gap-3">
            <UButton
              v-if="registrationOpen"
              to="/app/auth/register"
              size="xl"
              label="Coba gratis"
              trailing-icon="i-lucide-arrow-right"
            />
            <UButton
              v-else
              to="#kontak"
              size="xl"
              label="Hubungi kami"
            />
            <UButton
              to="/app/auth/login"
              size="xl"
              variant="outline"
              color="neutral"
              label="Masuk"
            />
          </div>
          <p class="text-sm text-muted">
            Karyawan tidak membayar; langganan dibayar perusahaan.
          </p>
        </div>

        <!-- Mockup produk (ilustrasi HTML, bukan data nyata) -->
        <div
          class="relative"
          aria-hidden="true"
        >
          <div class="absolute -inset-6 -z-10 rounded-3xl bg-primary/5" />
          <div class="rounded-xl border border-default bg-default shadow-lg">
            <div class="flex items-center gap-1.5 border-b border-default px-4 py-3">
              <span class="size-2.5 rounded-full bg-error/60" />
              <span class="size-2.5 rounded-full bg-warning/60" />
              <span class="size-2.5 rounded-full bg-success/60" />
              <span class="ml-3 text-xs text-muted">Beranda · PT Contoh Sejahtera</span>
            </div>
            <div class="grid grid-cols-3 gap-3 p-4">
              <div
                v-for="tile in [{ l: 'Hadir hari ini', v: '42/45' }, { l: 'Cuti menunggu', v: '3' }, { l: 'Payroll Okt', v: 'Siap' }]"
                :key="tile.l"
                class="rounded-lg border border-default p-3"
              >
                <p class="text-[11px] text-muted">
                  {{ tile.l }}
                </p>
                <p class="mt-1 text-lg font-semibold text-highlighted tabular">
                  {{ tile.v }}
                </p>
              </div>
              <div class="col-span-3 rounded-lg border border-default">
                <div
                  v-for="row in [{ n: 'Dewi Lestari', t: '07:58 WIB', s: 'Tepat waktu', c: 'text-success' }, { n: 'Made Wirawan', t: '08:02 WITA', s: 'Tepat waktu', c: 'text-success' }, { n: 'Yohanes Kbarek', t: '08:21 WIT', s: 'Terlambat', c: 'text-warning' }]"
                  :key="row.n"
                  class="flex items-center justify-between border-b border-default px-3 py-2 text-xs last:border-0"
                >
                  <span class="font-medium text-default">{{ row.n }}</span>
                  <span class="text-muted tabular">{{ row.t }}</span>
                  <span :class="row.c">{{ row.s }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Fitur -->
    <section
      id="fitur"
      class="scroll-mt-20 border-t border-default bg-elevated/40 py-16 sm:py-24"
    >
      <UContainer>
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-semibold tracking-tight text-highlighted">
            Semua urusan HR dalam satu aplikasi
          </h2>
          <p class="mt-3 text-muted">
            Dari absen pagi sampai slip gaji akhir bulan.
          </p>
        </div>
        <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UCard
            v-for="feature in features"
            :key="feature.title"
            v-reveal
          >
            <div class="flex items-start justify-between gap-3">
              <span class="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon
                  :name="feature.icon"
                  class="size-5"
                />
              </span>
              <UBadge
                v-if="availableFrom(feature.featureKey)"
                :label="availableFrom(feature.featureKey)!"
                variant="subtle"
                color="neutral"
                size="sm"
              />
            </div>
            <h3 class="mt-4 font-semibold text-highlighted">
              {{ feature.title }}
            </h3>
            <p class="mt-1 text-sm text-muted">
              {{ feature.description }}
            </p>
            <p
              v-if="feature.note"
              class="mt-3 flex gap-1.5 text-xs text-muted"
            >
              <UIcon
                name="i-lucide-info"
                class="mt-0.5 size-3.5 shrink-0"
              />
              {{ feature.note }}
            </p>
          </UCard>
        </div>
      </UContainer>
    </section>

    <!-- Keunggulan -->
    <section
      id="keunggulan"
      class="scroll-mt-20 py-16 sm:py-24"
    >
      <UContainer>
        <h2 class="text-center text-3xl font-semibold tracking-tight text-highlighted">
          Kenapa HRIS Nexadream
        </h2>
        <div class="mt-12 grid gap-8 md:grid-cols-3">
          <div
            v-for="reason in reasons"
            :key="reason.title"
            v-reveal
            class="space-y-3"
          >
            <UIcon
              :name="reason.icon"
              class="size-7 text-primary"
            />
            <h3 class="font-semibold text-highlighted">
              {{ reason.title }}
            </h3>
            <p class="text-sm text-muted">
              {{ reason.description }}
            </p>
          </div>
        </div>

        <!-- Cara kerja -->
        <ol class="mt-16 grid gap-4 md:grid-cols-3">
          <li
            v-for="(step, i) in steps"
            :key="step.title"
            v-reveal
            class="rounded-xl border border-default p-5"
          >
            <span class="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-inverted">{{ i + 1 }}</span>
            <h3 class="mt-3 font-semibold text-highlighted">
              {{ step.title }}
            </h3>
            <p class="mt-1 text-sm text-muted">
              {{ step.description }}
            </p>
          </li>
        </ol>
      </UContainer>
    </section>

    <!-- Harga -->
    <section
      v-if="plans.length"
      id="harga"
      class="scroll-mt-20 border-t border-default bg-elevated/40 py-16 sm:py-24"
    >
      <UContainer>
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-semibold tracking-tight text-highlighted">
            Harga sederhana untuk setiap ukuran perusahaan
          </h2>
          <p class="mt-3 text-muted">
            Bayar per perusahaan, bukan per karyawan. Karyawan tidak membayar; langganan dibayar perusahaan.
          </p>
          <div
            class="mt-6 inline-flex rounded-lg border border-default bg-default p-1"
            role="group"
            aria-label="Periode tagihan"
          >
            <UButton
              label="Bulanan"
              :variant="billingCycle === 'monthly' ? 'solid' : 'ghost'"
              :color="billingCycle === 'monthly' ? 'primary' : 'neutral'"
              :aria-pressed="billingCycle === 'monthly'"
              @click="billingCycle = 'monthly'"
            />
            <UButton
              :variant="billingCycle === 'yearly' ? 'solid' : 'ghost'"
              :color="billingCycle === 'yearly' ? 'primary' : 'neutral'"
              :aria-pressed="billingCycle === 'yearly'"
              @click="billingCycle = 'yearly'"
            >
              Tahunan
              <UBadge
                v-if="maxSaving > 0"
                :label="`Hemat s.d. ${maxSaving}%`"
                size="sm"
                :color="billingCycle === 'yearly' ? 'neutral' : 'success'"
                variant="subtle"
              />
            </UButton>
          </div>
        </div>

        <div
          class="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2"
          :class="plans.length >= 4 ? 'xl:grid-cols-4' : plans.length === 3 ? 'lg:grid-cols-3' : ''"
        >
          <div
            v-for="(plan, index) in plans"
            :key="plan.slug"
            class="flex flex-col rounded-xl border bg-default p-6"
            :class="plan.slug === highlightSlug ? 'border-primary ring-1 ring-primary' : 'border-default'"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ plan.name }}
              </h3>
              <UBadge
                v-if="plan.slug === highlightSlug"
                label="Paling populer"
                size="sm"
              />
            </div>
            <p class="mt-1 min-h-10 text-sm text-muted">
              {{ plan.description }}
            </p>
            <div class="mt-5">
              <p class="flex flex-wrap items-baseline gap-x-1">
                <span class="whitespace-nowrap text-3xl font-semibold text-highlighted tabular xl:text-[1.75rem]">{{ priceLine(plan).main }}</span>
                <span class="whitespace-nowrap text-sm text-muted">{{ priceLine(plan).suffix }}</span>
              </p>
              <p class="mt-1 min-h-5 text-xs text-muted">
                {{ priceLine(plan).sub }}
                <span
                  v-if="billingCycle === 'yearly' && yearlySaving(plan).amount > 0"
                  class="text-success"
                > · hemat {{ formatIDR(yearlySaving(plan).amount) }}</span>
              </p>
            </div>
            <UButton
              v-bind="planCta(plan)"
              block
              class="mt-5"
              :variant="plan.slug === highlightSlug ? 'solid' : 'outline'"
            />
            <p
              v-if="plan.slug === data?.trial.planSlug && trialDays > 0 && registrationOpen"
              class="mt-2 text-center text-xs text-muted"
            >
              Uji coba {{ trialDays }} hari untuk perusahaan baru
            </p>

            <ul class="mt-6 space-y-2 border-t border-default pt-5 text-sm">
              <li
                v-for="key in shownLimits"
                :key="key"
                class="flex justify-between gap-3"
              >
                <span class="text-muted">{{ LIMIT_META[key].label }}</span>
                <span
                  class="text-right tabular"
                  :class="key === 'employees' ? 'font-semibold text-highlighted' : 'text-default'"
                >{{ formatLimit(key, plan.limits[key]) }}</span>
              </li>
            </ul>
            <div class="mt-5 space-y-2 text-sm">
              <p
                v-if="planFeatureList(plan, index).previousName && planFeatureList(plan, index).keys.length"
                class="font-medium text-default"
              >
                Semua di {{ planFeatureList(plan, index).previousName }}, plus:
              </p>
              <p
                v-else-if="index === 0"
                class="font-medium text-default"
              >
                Data karyawan, absensi, dan layanan mandiri karyawan
              </p>
              <ul class="space-y-1.5">
                <li
                  v-for="key in planFeatureList(plan, index).keys"
                  :key="key"
                  class="flex gap-2"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>{{ FEATURE_META[key].label }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p class="mt-8 text-center text-xs text-muted">
          Ganti atau hentikan paket kapan saja dari menu Langganan.
        </p>
      </UContainer>
    </section>

    <!-- FAQ -->
    <section
      v-if="faqItems.length"
      id="faq"
      class="scroll-mt-20 py-16 sm:py-24"
    >
      <UContainer class="max-w-3xl">
        <h2 class="text-center text-3xl font-semibold tracking-tight text-highlighted">
          Pertanyaan yang sering diajukan
        </h2>
        <UAccordion
          :items="faqItems"
          type="multiple"
          class="mt-10"
          :ui="{ trigger: 'text-base font-medium', body: 'text-muted whitespace-pre-line' }"
        />
      </UContainer>
    </section>

    <!-- Kontak -->
    <section
      id="kontak"
      class="scroll-mt-20 border-t border-default bg-elevated/40 py-16 sm:py-24"
    >
      <UContainer class="grid gap-10 lg:grid-cols-5">
        <div class="space-y-5 lg:col-span-2">
          <h2 class="text-3xl font-semibold tracking-tight text-highlighted">
            Bicara dengan tim kami
          </h2>
          <p class="text-muted">
            Butuh demo, paket Enterprise, atau bantuan memindahkan data dari Excel? Kirim pesan, kami balas di hari kerja.
          </p>
          <ul class="space-y-3 text-sm">
            <li
              v-if="company?.email"
              class="flex items-center gap-3"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-5 text-primary"
              />
              <a
                :href="`mailto:${company.email}`"
                class="hover:underline"
              >{{ company.email }}</a>
            </li>
            <li
              v-if="company?.whatsapp"
              class="flex items-center gap-3"
            >
              <UIcon
                name="i-lucide-message-circle"
                class="size-5 text-primary"
              />
              <a
                :href="`https://wa.me/${company.whatsapp.replace(/\D/g, '')}`"
                target="_blank"
                rel="noopener"
                class="hover:underline"
              >WhatsApp</a>
            </li>
            <li
              v-if="company?.phone"
              class="flex items-center gap-3"
            >
              <UIcon
                name="i-lucide-phone"
                class="size-5 text-primary"
              />
              <a
                :href="`tel:${company.phone.replace(/[^\d+]/g, '')}`"
                class="hover:underline"
              >{{ company.phone }}</a>
            </li>
            <li
              v-if="company?.address"
              class="flex items-start gap-3"
            >
              <UIcon
                name="i-lucide-map-pin"
                class="mt-0.5 size-5 shrink-0 text-primary"
              />
              <span class="whitespace-pre-line">{{ company.address }}</span>
            </li>
          </ul>
        </div>
        <div class="lg:col-span-3">
          <ContactForm />
        </div>
      </UContainer>
    </section>

    <!-- CTA akhir -->
    <section class="py-16 sm:py-20">
      <UContainer>
        <div class="rounded-2xl bg-primary px-6 py-12 text-center text-inverted sm:px-12">
          <h2 class="text-2xl font-semibold sm:text-3xl">
            Rapikan HR perusahaan Anda mulai hari ini
          </h2>
          <p class="mx-auto mt-3 max-w-xl opacity-90">
            {{ trialDays > 0 && registrationOpen ? `Coba gratis ${trialDays} hari, tanpa kartu kredit.` : 'Hubungi kami untuk demo dan penawaran.' }}
          </p>
          <UButton
            :to="registrationOpen ? '/app/auth/register' : '#kontak'"
            :label="registrationOpen ? 'Daftarkan perusahaan' : 'Hubungi kami'"
            size="xl"
            color="neutral"
            variant="solid"
            class="mt-6"
          />
        </div>
      </UContainer>
    </section>
  </div>
</template>
