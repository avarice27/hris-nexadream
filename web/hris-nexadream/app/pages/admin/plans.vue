<script setup lang="ts">
import { DEFAULT_FEATURES, DEFAULT_LIMITS, FEATURE_KEYS, FEATURE_META, LIMIT_KEYS, LIMIT_META, UNLIMITED, formatLimit, type PlanFeatures, type PlanLimits } from '#shared/utils/plans'
import { formatIDR } from '#shared/utils/format'

// Editor paket: satu field per LIMIT_KEYS dan satu switch per FEATURE_KEYS — kunci baru di kode
// otomatis muncul di sini tanpa perubahan UI.
definePageMeta({ layout: 'admin' })
useHead({ title: 'Paket' })

interface AdminPlan {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  trialDays: number
  isActive: boolean
  isPublic: boolean
  order: number
  limits: PlanLimits
  features: PlanFeatures
  subscriptionCount: number
}

const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('plans.write'))

const plans = ref<AdminPlan[]>([])
const defaultPlanSlug = ref('free')
const trialPlanSlug = ref('')
const status = ref<'loading' | 'error' | 'success'>('loading')
const errorMessage = ref('')

async function load() {
  try {
    const response = await apiFetch<{ items: AdminPlan[], defaultPlanSlug: string, trialPlanSlug: string }>('/api/admin/plans')
    plans.value = response.items
    defaultPlanSlug.value = response.defaultPlanSlug
    trialPlanSlug.value = response.trialPlanSlug
    status.value = 'success'
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
    status.value = 'error'
  }
}
onMounted(load)

// --- Form ---
const open = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  slug: '',
  name: '',
  description: '',
  priceMonthly: 0,
  priceYearly: 0,
  trialDays: 0,
  isActive: true,
  isPublic: true,
  order: 0,
  limits: { ...DEFAULT_LIMITS } as PlanLimits,
  features: { ...DEFAULT_FEATURES } as PlanFeatures
})

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    slug: '', name: '', description: '', priceMonthly: 0, priceYearly: 0, trialDays: 0,
    isActive: true, isPublic: true, order: plans.value.length,
    limits: { ...DEFAULT_LIMITS }, features: { ...DEFAULT_FEATURES }
  })
  formError.value = ''
  open.value = true
}

function openEdit(plan: AdminPlan) {
  editingId.value = plan.id
  Object.assign(form, {
    slug: plan.slug, name: plan.name, description: plan.description ?? '', priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly, trialDays: plan.trialDays, isActive: plan.isActive, isPublic: plan.isPublic,
    order: plan.order, limits: { ...plan.limits }, features: { ...plan.features }
  })
  formError.value = ''
  open.value = true
}

function toggleUnlimited(key: (typeof LIMIT_KEYS)[number], unlimited: boolean) {
  form.limits[key] = unlimited ? UNLIMITED : (DEFAULT_LIMITS[key] > 0 ? DEFAULT_LIMITS[key] : 1)
}

const isPinned = computed(() => {
  const plan = plans.value.find(p => p.id === editingId.value)
  return !!plan && [defaultPlanSlug.value, trialPlanSlug.value].includes(plan.slug)
})

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const body = { ...form, description: form.description || null }
    if (editingId.value) await apiFetch(`/api/admin/plans/${editingId.value}`, { method: 'PATCH', body })
    else await apiFetch('/api/admin/plans', { method: 'POST', body })
    open.value = false
    toast.add({ title: editingId.value ? 'Paket diperbarui' : 'Paket dibuat', description: 'Perubahan berlaku untuk semua perusahaan di paket ini dalam ±1 menit.', color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function remove(plan: AdminPlan) {
  const ok = await confirm({
    title: `Hapus paket ${plan.name}?`,
    description: 'Paket yang masih dipakai langganan tidak bisa dihapus — nonaktifkan saja agar tidak bisa dibeli.',
    confirmLabel: 'Hapus paket',
    color: 'error'
  })
  if (!ok) return
  try {
    await apiFetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
    toast.add({ title: 'Paket dihapus', color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

function enabledFeatureCount(plan: AdminPlan) {
  return FEATURE_KEYS.filter(key => plan.features[key]).length
}
</script>

<template>
  <PagePanel title="Paket">
    <template #actions>
      <UButton
        v-if="canWrite"
        label="Paket baru"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>

    <div
      v-if="status === 'loading'"
      class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-64 w-full"
      />
    </div>
    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <div
      v-else
      class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <UCard
        v-for="plan in plans"
        :key="plan.id"
        :class="plan.isActive ? '' : 'opacity-70'"
      >
        <template #header>
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold">
                {{ plan.name }}
              </p>
              <code class="text-xs text-dimmed">{{ plan.slug }}</code>
            </div>
            <div class="flex flex-wrap justify-end gap-1">
              <UBadge
                v-if="plan.slug === defaultPlanSlug"
                label="Bawaan"
                size="sm"
                variant="subtle"
                color="neutral"
              />
              <UBadge
                v-if="plan.slug === trialPlanSlug"
                label="Uji coba"
                size="sm"
                variant="subtle"
                color="info"
              />
              <UBadge
                v-if="!plan.isActive"
                label="Nonaktif"
                size="sm"
                variant="subtle"
                color="neutral"
              />
              <UBadge
                v-else-if="!plan.isPublic"
                label="Tersembunyi"
                size="sm"
                variant="subtle"
                color="warning"
              />
            </div>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <p>
            <span class="tabular text-lg font-semibold">{{ plan.priceMonthly > 0 ? formatIDR(plan.priceMonthly) : 'Gratis / kustom' }}</span>
            <span
              v-if="plan.priceMonthly > 0"
              class="text-muted"
            >/bulan</span>
          </p>
          <ul class="space-y-1 text-muted">
            <li
              v-for="key in LIMIT_KEYS"
              :key="key"
              class="flex justify-between gap-2"
            >
              <span>{{ LIMIT_META[key].label }}</span>
              <span class="tabular text-default">{{ formatLimit(key, plan.limits[key]) }}</span>
            </li>
          </ul>
          <p class="text-xs text-muted">
            {{ enabledFeatureCount(plan) }} dari {{ FEATURE_KEYS.length }} fitur · uji coba {{ plan.trialDays }} hari · {{ plan.subscriptionCount }} langganan
          </p>
        </div>

        <template
          v-if="canWrite"
          #footer
        >
          <div class="flex gap-2">
            <UButton
              label="Ubah"
              icon="i-lucide-pencil"
              size="sm"
              variant="outline"
              @click="openEdit(plan)"
            />
            <UButton
              v-if="plan.subscriptionCount === 0 && ![defaultPlanSlug, trialPlanSlug].includes(plan.slug)"
              label="Hapus"
              icon="i-lucide-trash-2"
              size="sm"
              variant="ghost"
              color="error"
              @click="remove(plan)"
            />
          </div>
        </template>
      </UCard>
    </div>

    <USlideover
      v-model:open="open"
      :title="editingId ? `Ubah paket ${form.name}` : 'Paket baru'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <form
          class="space-y-6"
          @submit.prevent="save"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="formError"
          />
          <UAlert
            v-if="editingId"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Perubahan langsung berlaku untuk semua perusahaan di paket ini."
            description="Menurunkan batas tidak menghapus data; fitur yang dimatikan berhenti bekerja tetapi datanya tetap disimpan."
          />

          <section class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Nama paket"
              required
            >
              <UInput
                v-model="form.name"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Slug"
              :help="isPinned ? 'Dipakai pengaturan penagihan; tidak bisa diubah.' : 'Huruf kecil, angka, tanda hubung.'"
            >
              <UInput
                v-model="form.slug"
                :disabled="isPinned"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField
              label="Deskripsi"
              class="sm:col-span-2"
            >
              <UTextarea
                v-model="form.description"
                :rows="2"
                autoresize
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Harga bulanan (Rp)"
              help="0 = gratis atau harga kustom"
            >
              <UInputNumber
                v-model="form.priceMonthly"
                :min="0"
                :step="1000"
                :format-options="{ maximumFractionDigits: 0 }"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Harga tahunan (Rp)">
              <UInputNumber
                v-model="form.priceYearly"
                :min="0"
                :step="1000"
                :format-options="{ maximumFractionDigits: 0 }"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Uji coba (hari)">
              <UInputNumber
                v-model="form.trialDays"
                :min="0"
                :max="90"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Urutan tampil">
              <UInputNumber
                v-model="form.order"
                :min="0"
                :max="100"
                class="w-full"
              />
            </UFormField>
            <USwitch
              v-model="form.isActive"
              label="Aktif"
              description="Bisa dibeli."
              :disabled="isPinned && form.slug === defaultPlanSlug"
            />
            <USwitch
              v-model="form.isPublic"
              label="Publik"
              description="Tampil di halaman harga dan langganan."
            />
          </section>

          <section class="space-y-3">
            <h3 class="text-sm font-semibold">
              Batas
            </h3>
            <div
              v-for="key in LIMIT_KEYS"
              :key="key"
              class="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ LIMIT_META[key].label }}
                </p>
                <p class="text-xs text-muted">
                  {{ LIMIT_META[key].hint }}
                </p>
              </div>
              <UInputNumber
                v-model="form.limits[key]"
                :min="0"
                :disabled="form.limits[key] === UNLIMITED"
                class="w-full"
                :aria-label="LIMIT_META[key].label"
              />
              <USwitch
                :model-value="form.limits[key] === UNLIMITED"
                label="Tanpa batas"
                @update:model-value="(v: boolean) => toggleUnlimited(key, v)"
              />
            </div>
          </section>

          <section class="space-y-3">
            <h3 class="text-sm font-semibold">
              Fitur
            </h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <USwitch
                v-for="key in FEATURE_KEYS"
                :key="key"
                v-model="form.features[key]"
                :label="FEATURE_META[key].label"
                :description="FEATURE_META[key].hint"
              />
            </div>
          </section>

          <UButton
            type="submit"
            :label="editingId ? 'Simpan paket' : 'Buat paket'"
            :loading="saving"
          />
        </form>
      </template>
    </USlideover>
  </PagePanel>
</template>
