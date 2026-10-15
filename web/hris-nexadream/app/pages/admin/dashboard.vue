<script setup lang="ts">
import { formatDateId, formatIDR } from '#shared/utils/format'
import { PAYMENT_STATUS_META, SUBSCRIPTION_STATUS_META, statusMeta } from '#shared/utils/status'

// Beranda back-office: hitungan & metadata platform saja — tidak pernah data domain perusahaan.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Dashboard' })

interface DashboardData {
  tenants: { total: number, active: number, suspended: number, newThisMonth: number, deleteRequests: number }
  employeesActive: number
  subscriptions: Record<string, number>
  revenueThisMonth: { amount: number, count: number }
  unreadMessages: number
  newestTenants: Array<{ id: string, name: string, status: string, createdAt: string, subscriptionStatus: string | null, planName: string | null }>
  latestPayments: Array<{ id: string, orderId: string, amount: number, status: string, planSlug: string | null, createdAt: string, tenant: { id: string, name: string } }>
  newTenantUsersByMonth: Array<{ month: string, count: number }>
}

const auth = usePlatformAuth()
const tz = computed(() => auth.displayTimezone.value)
const data = ref<DashboardData | null>(null)
const errorMessage = ref('')
onMounted(async () => {
  if (!auth.hasPermission('dashboard.read')) return
  try {
    data.value = await apiFetch<DashboardData>('/api/admin/dashboard')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
})

const monthLabel = (key: string) => new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
const usersChart = computed(() => (data.value?.newTenantUsersByMonth ?? []).map(m => ({ key: m.month, label: monthLabel(m.month), value: m.count, display: `${m.count} login baru` })))
const firstName = computed(() => auth.profile.value?.name.split(' ')[0] ?? '')
</script>

<template>
  <PagePanel title="Dashboard">
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-semibold">
          Halo, {{ firstName }}
        </h2>
        <p class="text-muted">
          {{ auth.profile.value?.role?.name }} · {{ formatDateId(new Date(), tz) }}
        </p>
      </div>

      <UAlert
        v-if="!auth.hasPermission('dashboard.read')"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Peran Anda tidak memiliki akses ke ringkasan platform."
      />
      <UAlert
        v-else-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <div
        v-else-if="!data"
        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <USkeleton
          v-for="i in 4"
          :key="i"
          class="h-28 w-full"
        />
      </div>

      <template v-else>
        <!-- Angka utama -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">
              Perusahaan
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ data.tenants.total }}
            </p>
            <p class="mt-1 text-xs text-muted">
              +{{ data.tenants.newThisMonth }} bulan ini · {{ data.tenants.suspended }} ditangguhkan
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Pendapatan bulan ini
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ formatIDR(data.revenueThisMonth.amount) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.revenueThisMonth.count }} pembayaran lunas
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Langganan berbayar
            </p>
            <p class="tabular mt-1 text-3xl font-semibold">
              {{ (data.subscriptions.active ?? 0) + (data.subscriptions.past_due ?? 0) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ data.subscriptions.trialing ?? 0 }} uji coba · {{ data.subscriptions.past_due ?? 0 }} menunggu bayar
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Perlu ditindaklanjuti
            </p>
            <div class="mt-2 space-y-1 text-sm">
              <NuxtLink
                to="/admin/messages"
                class="flex justify-between hover:underline"
              >
                <span>Pesan baru</span><span class="tabular font-semibold">{{ data.unreadMessages }}</span>
              </NuxtLink>
              <NuxtLink
                to="/admin/tenants"
                class="flex justify-between hover:underline"
              >
                <span>Permintaan hapus akun</span><span class="tabular font-semibold">{{ data.tenants.deleteRequests }}</span>
              </NuxtLink>
            </div>
          </UCard>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <UCard>
            <template #header>
              <p class="font-semibold">
                Perusahaan terbaru
              </p>
            </template>
            <ul class="divide-y divide-default text-sm">
              <li
                v-for="t in data.newestTenants"
                :key="t.id"
                class="flex items-center gap-3 py-2"
              >
                <NuxtLink
                  :to="`/admin/tenants/${t.id}`"
                  class="min-w-0 flex-1 truncate font-medium hover:underline"
                >{{ t.name }}</NuxtLink>
                <span class="text-xs text-muted">{{ t.planName }}</span>
                <UBadge
                  v-if="t.subscriptionStatus"
                  :label="statusMeta(SUBSCRIPTION_STATUS_META, t.subscriptionStatus).label"
                  :color="statusMeta(SUBSCRIPTION_STATUS_META, t.subscriptionStatus).color"
                  variant="subtle"
                  size="sm"
                />
              </li>
            </ul>
          </UCard>
          <UCard>
            <template #header>
              <p class="font-semibold">
                Pembayaran 30 hari terakhir
              </p>
            </template>
            <p
              v-if="!data.latestPayments.length"
              class="text-sm text-muted"
            >
              Belum ada pembayaran.
            </p>
            <ul
              v-else
              class="divide-y divide-default text-sm"
            >
              <li
                v-for="p in data.latestPayments"
                :key="p.id"
                class="flex items-center gap-3 py-2"
              >
                <span class="min-w-0 flex-1 truncate">{{ p.tenant.name }} <span class="text-xs text-muted">· {{ p.planSlug }}</span></span>
                <span class="tabular">{{ formatIDR(p.amount) }}</span>
                <UBadge
                  :label="statusMeta(PAYMENT_STATUS_META, p.status).label"
                  :color="statusMeta(PAYMENT_STATUS_META, p.status).color"
                  variant="subtle"
                  size="sm"
                />
              </li>
            </ul>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <p class="font-semibold">
              Login perusahaan baru per bulan
            </p>
          </template>
          <BarChart
            :data="usersChart"
            description="Login perusahaan baru per bulan, enam bulan terakhir"
            :height="140"
          />
        </UCard>
      </template>
    </div>
  </PagePanel>
</template>
