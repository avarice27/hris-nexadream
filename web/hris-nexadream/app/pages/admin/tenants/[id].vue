<script setup lang="ts">
import { FEATURE_KEYS, FEATURE_META, LIMIT_KEYS, LIMIT_META, formatLimit, type FeatureKey, type LimitKey, type PlanFeatures, type PlanLimits } from '#shared/utils/plans'
import { formatDateId, formatDateTimeId, formatIDR, formatRelativeId } from '#shared/utils/format'
import { BILLING_PERIODS, BILLING_PERIOD_LABELS } from '#shared/utils/payments'
import { PAYMENT_STATUS_META, SUBSCRIPTION_STATUS_META, TENANT_ROLE_META, TENANT_STATUS_META, statusMeta } from '#shared/utils/status'
import { ImpersonateDialog } from '#components'

// Detail perusahaan untuk staf: profil, langganan, pemakaian vs batas, kantor, login tim, pembayaran.
// TIDAK ADA data karyawan, gaji, atau dokumen (D7).
definePageMeta({ layout: 'admin' })

interface Detail {
  tenant: { id: string, name: string, slug: string, legalName: string | null, industry: string | null, email: string | null, phone: string | null, timezone: string, logoUrl: string | null, status: string, suspendedAt: string | null, suspendedReason: string | null, hasNpwp: boolean, onboardingCompletedAt: string | null, createdAt: string }
  subscription: { status: string, period: 'monthly' | 'yearly', plan: { slug: string, name: string }, trialEndsAt: string | null, currentPeriodEnd: string | null, graceEndsAt: string | null, cancelledAt: string | null } | null
  entitlements: { planName: string, effectivePlanSlug: string, limits: PlanLimits, features: PlanFeatures }
  usage: Record<LimitKey, number> & { essLogins: number }
  branches: Array<{ id: string, name: string, timezone: string, isActive: boolean, isPrimary: boolean }>
  team: Array<{ id: string, role: string, isActive: boolean, user: { id: string, name: string, email: string, phone: string | null, isActive: boolean, lastLoginAt: string | null, lastSeenAt: string | null } }>
  payments: Array<{ id: string, orderId: string, status: string, amount: number, planSlug: string | null, period: 'monthly' | 'yearly', paidAt: string | null, createdAt: string }>
  subscriptionEvents: Array<{ transition: string, fromStatus: string | null, toStatus: string, fromPlanSlug: string | null, toPlanSlug: string, createdAt: string }>
  deleteRequest: { requestedAt: string, reason: string | null, by: string | null } | null
}

const route = useRoute()
const auth = usePlatformAuth()
const toast = useToast()
const overlay = useOverlay()
const { confirm } = useConfirmDialog()
const { impersonateTenant, impersonateTenantUser } = useAdminImpersonation()
const id = computed(() => String(route.params.id))
const tz = computed(() => auth.displayTimezone.value)

const data = ref<Detail | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    data.value = await apiFetch<Detail>(`/api/admin/tenants/${id.value}`)
    useHead({ title: data.value.tenant.name })
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const can = (key: string) => auth.hasPermission(key)
const isSuperAdmin = computed(() => !!auth.profile.value?.role?.isSuperAdmin)
const notify = (title: string, ok = true) => toast.add({ title, color: ok ? 'success' : 'error', icon: ok ? 'i-lucide-check' : 'i-lucide-circle-alert' })

function meterPercent(key: LimitKey) {
  const max = data.value?.entitlements.limits[key] ?? -1
  if (max === -1 || max === 0) return 0
  return Math.min(100, Math.round(((data.value?.usage[key] ?? 0) / max) * 100))
}

// --- Tindakan ---
const impersonateModal = overlay.create(ImpersonateDialog)

async function startImpersonation(tenantUserId?: string, name?: string) {
  const reason = await impersonateModal.open({
    title: tenantUserId ? `Masuk sebagai ${name}` : `Masuk sebagai pemilik ${data.value?.tenant.name}`,
    description: 'Konsol perusahaan akan terbuka di tab baru.'
  })
  if (!reason) return
  try {
    if (tenantUserId) await impersonateTenantUser(tenantUserId, reason, id.value)
    else await impersonateTenant(id.value, reason)
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

const suspendOpen = ref(false)
const suspendReason = ref('')
async function suspend() {
  try {
    await apiFetch(`/api/admin/tenants/${id.value}/suspend`, { method: 'POST', body: { reason: suspendReason.value } })
    suspendOpen.value = false
    suspendReason.value = ''
    notify('Perusahaan ditangguhkan')
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

async function reinstate() {
  if (!await confirm({ title: 'Pulihkan perusahaan?', description: 'Semua login perusahaan bisa masuk kembali. Bila masa berbayar sudah habis, perusahaan memakai paket Free.', confirmLabel: 'Pulihkan' })) return
  try {
    await apiFetch(`/api/admin/tenants/${id.value}/reinstate`, { method: 'POST' })
    notify('Perusahaan dipulihkan')
    await load()
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

async function softDelete() {
  if (!await confirm({ title: `Hapus ${data.value?.tenant.name}?`, description: 'Semua login keluar dan pemilik menerima email terakhir. Data dihapus permanen oleh job pembersihan setelah masa retensi.', confirmLabel: 'Hapus perusahaan', color: 'error' })) return
  try {
    await apiFetch(`/api/admin/tenants/${id.value}`, { method: 'DELETE' })
    notify('Perusahaan dihapus')
    await navigateTo('/admin/tenants')
  } catch (error) {
    notify(extractErrorMessage(error), false)
  }
}

// Override paket
const plans = ref<Array<{ slug: string, name: string }>>([])
const overrideOpen = ref(false)
const overrideForm = reactive({ planSlug: '', period: 'monthly' as 'monthly' | 'yearly', status: 'active', currentPeriodEnd: '', note: '' })
const overrideError = ref('')
async function openOverride() {
  if (!plans.value.length) plans.value = (await apiFetch<{ items: Array<{ slug: string, name: string }> }>('/api/admin/plans')).items
  const sub = data.value?.subscription
  Object.assign(overrideForm, {
    planSlug: sub?.plan.slug ?? 'free', period: sub?.period ?? 'monthly', status: sub?.status === 'trialing' ? 'trialing' : 'active',
    currentPeriodEnd: (sub?.currentPeriodEnd ?? new Date(Date.now() + 30 * 86400_000).toISOString()).slice(0, 10), note: ''
  })
  overrideError.value = ''
  overrideOpen.value = true
}
async function saveOverride() {
  overrideError.value = ''
  try {
    const result = await apiFetch<{ enforced: { branches: number, team: number } }>(`/api/admin/tenants/${id.value}/plan`, {
      method: 'POST',
      body: { ...overrideForm, currentPeriodEnd: overrideForm.currentPeriodEnd ? new Date(`${overrideForm.currentPeriodEnd}T23:59:59+07:00`).toISOString() : null, note: overrideForm.note || undefined }
    })
    overrideOpen.value = false
    notify(result.enforced.branches || result.enforced.team ? `Paket diubah. ${result.enforced.branches} kantor & ${result.enforced.team} login dinonaktifkan sesuai batas.` : 'Paket diubah')
    await load()
  } catch (error) {
    overrideError.value = extractErrorMessage(error)
  }
}

const overrideStatuses = [
  { label: 'Aktif (berbayar)', value: 'active' },
  { label: 'Uji coba', value: 'trialing' },
  { label: 'Dibatalkan (jalan sampai akhir periode)', value: 'cancelled' },
  { label: 'Menunggu pembayaran', value: 'past_due' },
  { label: 'Paket Free', value: 'downgraded' }
]
const featureLabel = (key: FeatureKey) => FEATURE_META[key].label
const periodItems = BILLING_PERIODS.map(p => ({ label: BILLING_PERIOD_LABELS[p], value: p }))
const planItems = computed(() => plans.value.map(p => ({ label: p.name, value: p.slug })))
</script>

<template>
  <PagePanel :title="data?.tenant.name ?? 'Perusahaan'">
    <template #actions>
      <UButton
        to="/admin/tenants"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        aria-label="Kembali"
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
      v-else-if="!data"
      class="h-96 w-full"
    />

    <div
      v-else
      class="space-y-6"
    >
      <!-- Ringkasan & tindakan -->
      <UCard>
        <div class="flex flex-wrap items-start gap-4">
          <UAvatar
            :src="data.tenant.logoUrl ?? undefined"
            :alt="data.tenant.name"
            size="2xl"
            class="rounded-lg"
          />
          <div class="min-w-64 flex-1 basis-64 space-y-1">
            <p class="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {{ data.tenant.name }}
              <UBadge
                :label="statusMeta(TENANT_STATUS_META, data.tenant.status).label"
                :color="statusMeta(TENANT_STATUS_META, data.tenant.status).color"
                variant="subtle"
              />
            </p>
            <p class="text-sm text-muted">
              {{ data.tenant.legalName ?? '—' }} · {{ data.tenant.industry ?? 'Bidang usaha belum diisi' }} · NPWP {{ data.tenant.hasNpwp ? 'sudah diisi' : 'belum diisi' }}
            </p>
            <p class="text-sm text-muted">
              {{ data.tenant.email ?? '—' }} · {{ data.tenant.phone ?? '—' }} · daftar {{ formatDateId(data.tenant.createdAt, tz) }} ·
              {{ data.tenant.onboardingCompletedAt ? 'onboarding selesai' : 'belum onboarding' }}
            </p>
            <p
              v-if="data.tenant.suspendedReason"
              class="text-sm text-error"
            >
              Ditangguhkan {{ formatDateId(data.tenant.suspendedAt, tz) }}: {{ data.tenant.suspendedReason }}
            </p>
          </div>
          <div class="flex w-full flex-wrap gap-2 xl:w-auto">
            <UButton
              v-if="can('impersonation.use') && data.tenant.status === 'active'"
              label="Masuk sebagai pemilik"
              icon="i-lucide-log-in"
              color="warning"
              variant="soft"
              @click="startImpersonation()"
            />
            <UButton
              v-if="can('subscriptions.write')"
              label="Ubah paket"
              icon="i-lucide-package"
              variant="outline"
              @click="openOverride"
            />
            <UButton
              v-if="can('tenants.write') && data.tenant.status === 'active'"
              label="Tangguhkan"
              variant="ghost"
              color="error"
              @click="suspendOpen = true"
            />
            <UButton
              v-if="can('tenants.write') && data.tenant.status === 'suspended'"
              label="Pulihkan"
              variant="outline"
              @click="reinstate"
            />
            <UButton
              v-if="isSuperAdmin"
              label="Hapus"
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              @click="softDelete"
            />
          </div>
        </div>
        <UAlert
          v-if="data.deleteRequest"
          class="mt-4"
          color="error"
          variant="subtle"
          icon="i-lucide-trash"
          :title="`Pemilik meminta penghapusan ${formatDateId(data.deleteRequest.requestedAt, tz)}${data.deleteRequest.by ? ' oleh ' + data.deleteRequest.by : ''}`"
          :description="data.deleteRequest.reason ? `Alasan: ${data.deleteRequest.reason}` : 'Tanpa alasan.'"
        />
      </UCard>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Langganan -->
        <UCard>
          <template #header>
            <p class="font-semibold">
              Langganan
            </p>
          </template>
          <div
            v-if="data.subscription"
            class="space-y-2 text-sm"
          >
            <p class="flex items-center gap-2">
              <span class="font-medium">{{ data.subscription.plan.name }}</span> · {{ BILLING_PERIOD_LABELS[data.subscription.period] }}
              <UBadge
                :label="statusMeta(SUBSCRIPTION_STATUS_META, data.subscription.status).label"
                :color="statusMeta(SUBSCRIPTION_STATUS_META, data.subscription.status).color"
                variant="subtle"
              />
            </p>
            <p
              v-if="data.subscription.trialEndsAt"
              class="text-muted"
            >
              Uji coba sampai {{ formatDateId(data.subscription.trialEndsAt, tz) }}
            </p>
            <p
              v-if="data.subscription.currentPeriodEnd"
              class="text-muted"
            >
              Periode sampai {{ formatDateId(data.subscription.currentPeriodEnd, tz) }}
            </p>
            <p
              v-if="data.subscription.graceEndsAt"
              class="text-warning"
            >
              Masa tenggang sampai {{ formatDateId(data.subscription.graceEndsAt, tz) }}
            </p>
            <p class="text-muted">
              Paket berlaku saat ini: <strong>{{ data.entitlements.planName }}</strong>
            </p>
          </div>
          <USeparator class="my-4" />
          <p class="mb-2 text-xs font-medium text-muted">
            Riwayat
          </p>
          <ul class="space-y-1 text-xs text-muted">
            <li
              v-for="(e, i) in data.subscriptionEvents"
              :key="i"
            >
              {{ formatDateTimeId(e.createdAt, tz) }} · <code>{{ e.transition }}</code> {{ e.fromStatus ?? '∅' }} → {{ e.toStatus }} ({{ e.fromPlanSlug ?? '∅' }} → {{ e.toPlanSlug }})
            </li>
          </ul>
        </UCard>

        <!-- Pemakaian -->
        <UCard>
          <template #header>
            <p class="font-semibold">
              Pemakaian vs batas
            </p>
          </template>
          <div class="space-y-3">
            <div
              v-for="key in LIMIT_KEYS.filter(k => k !== 'reportRetentionDays')"
              :key="key"
              class="space-y-1"
            >
              <div class="flex justify-between text-sm">
                <span>{{ LIMIT_META[key].label }}</span>
                <span class="tabular text-muted">{{ data.usage[key] }} / {{ formatLimit(key, data.entitlements.limits[key]) }}</span>
              </div>
              <UProgress
                :model-value="meterPercent(key)"
                :color="meterPercent(key) >= 100 ? 'error' : meterPercent(key) >= 80 ? 'warning' : 'primary'"
                size="sm"
              />
            </div>
            <p class="text-xs text-muted">
              {{ data.usage.essLogins }} karyawan memakai layanan mandiri. Data karyawan tidak ditampilkan di back-office.
            </p>
          </div>
          <USeparator class="my-4" />
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="key in FEATURE_KEYS"
              :key="key"
              :label="featureLabel(key)"
              :color="data.entitlements.features[key] ? 'success' : 'neutral'"
              :variant="data.entitlements.features[key] ? 'subtle' : 'outline'"
              size="sm"
            />
          </div>
        </UCard>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Tim -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <p class="font-semibold">
              Login tim
            </p>
          </template>
          <ul class="divide-y divide-default">
            <li
              v-for="m in data.team"
              :key="m.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              :class="m.isActive ? '' : 'opacity-60'"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ m.user.name }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ m.user.email }} · {{ m.user.lastLoginAt ? `masuk ${formatRelativeId(m.user.lastLoginAt)}` : 'belum pernah masuk' }}
                </p>
              </div>
              <UBadge
                :label="statusMeta(TENANT_ROLE_META, m.role).label"
                variant="subtle"
                color="neutral"
              />
              <UButton
                v-if="can('impersonation.use') && m.isActive && data.tenant.status === 'active'"
                icon="i-lucide-log-in"
                size="xs"
                variant="ghost"
                color="warning"
                :aria-label="`Masuk sebagai ${m.user.name}`"
                @click="startImpersonation(m.user.id, m.user.name)"
              />
            </li>
          </ul>
        </UCard>

        <!-- Kantor -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <p class="font-semibold">
              Kantor
            </p>
          </template>
          <ul class="divide-y divide-default">
            <li
              v-for="b in data.branches"
              :key="b.id"
              class="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span class="flex-1">{{ b.name }}</span>
              <span class="text-xs text-muted">{{ b.timezone }}</span>
              <UBadge
                v-if="b.isPrimary"
                label="Utama"
                size="sm"
                variant="subtle"
              />
              <UBadge
                v-if="!b.isActive"
                label="Nonaktif"
                size="sm"
                color="neutral"
                variant="subtle"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <!-- Pembayaran -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <p class="font-semibold">
            10 pembayaran terakhir
          </p>
        </template>
        <p
          v-if="!data.payments.length"
          class="px-4 py-6 text-sm text-muted"
        >
          Belum ada pembayaran.
        </p>
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="p in data.payments"
            :key="p.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <span class="flex-1 font-mono text-xs">{{ p.orderId }}</span>
            <span class="text-xs text-muted">{{ p.planSlug }} · {{ BILLING_PERIOD_LABELS[p.period] }}</span>
            <span class="tabular">{{ formatIDR(p.amount) }}</span>
            <UBadge
              :label="statusMeta(PAYMENT_STATUS_META, p.status).label"
              :color="statusMeta(PAYMENT_STATUS_META, p.status).color"
              variant="subtle"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <!-- Tangguhkan -->
    <UModal
      v-model:open="suspendOpen"
      title="Tangguhkan perusahaan"
      description="Semua login perusahaan langsung tidak bisa masuk. Pemilik menerima pemberitahuan."
    >
      <template #body>
        <UFormField
          label="Alasan"
          required
        >
          <UTextarea
            v-model="suspendReason"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="suspendOpen = false"
          />
          <UButton
            label="Tangguhkan"
            color="error"
            :disabled="suspendReason.trim().length < 5"
            @click="suspend"
          />
        </div>
      </template>
    </UModal>

    <!-- Override paket -->
    <USlideover
      v-model:open="overrideOpen"
      title="Ubah paket (override)"
      description="Untuk kesepakatan khusus atau kompensasi. Dicatat di riwayat langganan dan log audit."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="saveOverride"
        >
          <UAlert
            v-if="overrideError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="overrideError"
          />
          <UFormField label="Paket">
            <USelect
              v-model="overrideForm.planSlug"
              :items="planItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Periode">
            <USelect
              v-model="overrideForm.period"
              :items="periodItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Status">
            <USelect
              v-model="overrideForm.status"
              :items="overrideStatuses"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="overrideForm.status !== 'downgraded'"
            :label="overrideForm.status === 'trialing' ? 'Uji coba sampai' : 'Aktif sampai'"
          >
            <UInput
              v-model="overrideForm.currentPeriodEnd"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Catatan">
            <UTextarea
              v-model="overrideForm.note"
              :rows="2"
              class="w-full"
              placeholder="mis. Kompensasi gangguan 12 Okt"
            />
          </UFormField>
          <p class="text-xs text-muted">
            Bila batas paket baru lebih kecil, kantor dan login tim yang berlebih dinonaktifkan (tidak dihapus).
          </p>
          <UButton
            type="submit"
            label="Simpan paket"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
