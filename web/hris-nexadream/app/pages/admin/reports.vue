<script setup lang="ts">
import { formatDateId, formatIDR } from '#shared/utils/format'

// Laporan platform — agregat saja, satu jam acuan (zona tampilan platform).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Laporan' })

interface Bucket { key: string, revenue: number, payments: number, newPaid: number, renewals: number, churned: number, trialsLapsed: number, signups: number, onboarded: number }
interface ReportData {
  period: 'day' | 'week' | 'month'
  timezone: string
  series: Bucket[]
  totals: Omit<Bucket, 'key'> & { averagePayment: number }
  revenueByPlan: Array<{ slug: string, name: string, amount: number }>
  revenueByPeriod: Record<string, number>
  book: { mrr: number, paying: number, trialing: number, pastDue: number, free: number, byPlan: Array<{ slug: string, name: string, paying: number, trialing: number, mrr: number }> }
  conversion: { signups: number, converted: number, rate: number }
  historySince: string | null
}

const period = ref<'day' | 'week' | 'month'>('month')
const data = ref<ReportData | null>(null)
const errorMessage = ref('')
const LIMITS = { day: 30, week: 12, month: 12 } as const

async function load() {
  try {
    data.value = await apiFetch<ReportData>('/api/admin/reports/summary', { query: { period: period.value, limit: LIMITS[period.value] } })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
watch(period, load)

function bucketLabel(key: string) {
  const date = new Date(`${key}T00:00:00Z`)
  if (period.value === 'month') return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
}
const revenueChart = computed(() => (data.value?.series ?? []).map(s => ({ key: s.key, label: bucketLabel(s.key), value: s.revenue, display: formatIDR(s.revenue) })))
const pct = (v: number) => `${Math.round(v * 100)}%`
</script>

<template>
  <PagePanel title="Laporan">
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UTabs
          v-model="period"
          :items="[{ label: 'Harian', value: 'day' }, { label: 'Mingguan', value: 'week' }, { label: 'Bulanan', value: 'month' }]"
          :content="false"
          size="sm"
        />
        <p
          v-if="data"
          class="text-xs text-muted"
        >
          Zona waktu {{ data.timezone }}<span v-if="data.historySince"> · riwayat langganan sejak {{ formatDateId(data.historySince, data.timezone) }}</span>
        </p>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <USkeleton
        v-else-if="!data"
        class="h-96 w-full"
      />

      <template v-else>
        <!-- Buku saat ini -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">
              MRR saat ini
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ formatIDR(data.book.mrr) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              bulanan + tahunan ÷ 12
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Berbayar · uji coba · Free
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ data.book.paying }} · {{ data.book.trialing }} · {{ data.book.free }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.book.pastDue }} menunggu pembayaran
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Pendapatan periode ini
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ formatIDR(data.totals.revenue) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.totals.payments }} pembayaran · rata-rata {{ formatIDR(data.totals.averagePayment) }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Konversi pendaftar
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ pct(data.conversion.rate) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.conversion.converted }} dari {{ data.conversion.signups }} pendaftar membayar
            </p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <p class="font-semibold">
              Pendapatan
            </p>
          </template>
          <BarChart
            :data="revenueChart"
            description="Pendapatan per periode"
          />
        </UCard>

        <!-- Tabel data (juga alternatif aksesibel untuk grafik) -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <p class="font-semibold">
              Rincian per periode
            </p>
          </template>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-right text-xs text-muted">
                <tr>
                  <th class="px-3 py-2 text-left font-medium">
                    Periode
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Pendapatan
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Bayar baru
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Perpanjangan
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Berhenti
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Uji coba habis
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Pendaftar
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Onboarding
                  </th>
                </tr>
              </thead>
              <tbody class="tabular divide-y divide-default text-right">
                <tr
                  v-for="s in [...data.series].reverse()"
                  :key="s.key"
                >
                  <td class="px-3 py-2 text-left">
                    {{ bucketLabel(s.key) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatIDR(s.revenue) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.newPaid }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.renewals }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.churned }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.trialsLapsed }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.signups }}
                  </td>
                  <td class="px-3 py-2">
                    {{ s.onboarded }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <div class="grid gap-6 lg:grid-cols-2">
          <UCard>
            <template #header>
              <p class="font-semibold">
                Buku per paket
              </p>
            </template>
            <ul class="divide-y divide-default text-sm">
              <li
                v-for="p in data.book.byPlan"
                :key="p.slug"
                class="flex items-center gap-3 py-2"
              >
                <span class="flex-1">{{ p.name }}</span>
                <span class="text-xs text-muted">{{ p.paying }} berbayar · {{ p.trialing }} uji coba</span>
                <span class="tabular w-28 text-right">{{ formatIDR(p.mrr) }}</span>
              </li>
            </ul>
          </UCard>
          <UCard>
            <template #header>
              <p class="font-semibold">
                Pendapatan per paket & periode
              </p>
            </template>
            <p
              v-if="!data.revenueByPlan.length"
              class="text-sm text-muted"
            >
              Belum ada pendapatan di rentang ini.
            </p>
            <ul class="divide-y divide-default text-sm">
              <li
                v-for="p in data.revenueByPlan"
                :key="p.slug"
                class="flex justify-between py-2"
              >
                <span>{{ p.name }}</span><span class="tabular">{{ formatIDR(p.amount) }}</span>
              </li>
              <li class="flex justify-between py-2 text-muted">
                <span>Bulanan / Tahunan</span><span class="tabular">{{ formatIDR(data.revenueByPeriod.monthly ?? 0) }} / {{ formatIDR(data.revenueByPeriod.yearly ?? 0) }}</span>
              </li>
            </ul>
          </UCard>
        </div>
        <p class="text-xs text-muted">
          Statistik pemakaian aplikasi (hari-perangkat) tampil setelah ping pemakaian aktif (fase 10).
        </p>
      </template>
    </div>
  </PagePanel>
</template>
