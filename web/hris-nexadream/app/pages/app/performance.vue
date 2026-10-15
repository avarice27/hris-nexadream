<script setup lang="ts">
import { PERFORMANCE_CYCLE_STATUS_META, PERFORMANCE_REVIEW_STATUS_META } from '#shared/utils/hr'
import type { ReviewView } from '~/types/hr'

// Penilaian kinerja dasar: siklus → review per karyawan (penilai = atasan langsung).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Kinerja' })

interface Cycle { id: string, name: string, periodStart: string, periodEnd: string, status: string, reviewCount: number, completedCount: number }
const auth = useTenantAuth()
const toast = useApiToast()
const entitlements = useEntitlements()
const { confirm } = useConfirmDialog()
const cycles = ref<Cycle[] | null>(null)
const featureAvailable = ref(true)
const selected = ref<string | undefined>(undefined)
const reviews = ref<ReviewView[] | null>(null)
const canAdmin = computed(() => auth.hasAbility('performance.write') && (auth.hasRole('owner') || auth.hasRole('hr_admin')))

async function loadCycles() {
  try {
    const res = await apiFetch<{ items: Cycle[], featureAvailable: boolean }>('/api/app/performance/cycles')
    cycles.value = res.items
    featureAvailable.value = res.featureAvailable
    if (!selected.value && res.items[0]) selected.value = res.items[0].id
  } catch (error) {
    toast.error(error)
  }
}
async function loadReviews() {
  if (!selected.value) return
  reviews.value = null
  try {
    reviews.value = (await apiFetch<{ items: ReviewView[] }>(`/api/app/performance/cycles/${selected.value}/reviews`)).items
  } catch (error) {
    toast.error(error)
  }
}
onMounted(loadCycles)
watch(selected, loadReviews)
const current = computed(() => cycles.value?.find(c => c.id === selected.value) ?? null)

const open = ref(false)
const formError = ref('')
const year = Number(localTodayKey().slice(0, 4))
const form = reactive({ name: '', periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, goals: [{ title: 'Target kerja utama', weight: 70 }, { title: 'Kedisiplinan & kerja sama', weight: 30 }] })
function openCreate() {
  if (!featureAvailable.value) return entitlements.upgradeRequired('performanceReview')
  formError.value = ''
  form.name = `Penilaian ${year}`
  open.value = true
}
async function create() {
  try {
    const c = await apiFetch<{ id: string }>('/api/app/performance/cycles', { method: 'POST', body: { name: form.name, periodStart: form.periodStart, periodEnd: form.periodEnd, defaultGoals: form.goals.filter(g => g.title.trim()) } })
    open.value = false
    toast.success('Siklus dibuat', 'Review dibuat untuk semua karyawan aktif. Mulai siklus agar karyawan bisa menilai diri.')
    selected.value = c.id
    await loadCycles()
    await loadReviews()
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  }
}
async function setStatus(status: 'active' | 'closed') {
  if (status === 'closed' && !await confirm({ title: 'Tutup siklus?', description: 'Review yang belum selesai tidak bisa diisi lagi.', confirmLabel: 'Tutup siklus' })) return
  try {
    await apiFetch(`/api/app/performance/cycles/${selected.value}/status`, { method: 'POST', body: { status } })
    await loadCycles()
    await loadReviews()
  } catch (error) {
    toast.error(error)
  }
}
const cycleOptions = computed(() => (cycles.value ?? []).map(c => ({ label: c.name, value: c.id })))
const openReview = ref<ReviewView | null>(null)
async function onSaved() {
  openReview.value = null
  await loadReviews()
  await loadCycles()
}
</script>

<template>
  <PagePanel title="Kinerja">
    <template #actions>
      <UButton
        v-if="canAdmin"
        label="Siklus baru"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <div class="space-y-4">
      <FeatureLocked
        v-if="!featureAvailable && !cycles?.length"
        feature="performanceReview"
      />
      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <USelect
            v-model="selected"
            :items="cycleOptions"
            class="w-64"
            placeholder="Pilih siklus"
          />
          <template v-if="current">
            <StatusBadge
              :map="PERFORMANCE_CYCLE_STATUS_META"
              :value="current.status"
            />
            <span class="text-sm text-muted">{{ current.completedCount }}/{{ current.reviewCount }} selesai</span>
            <template v-if="canAdmin">
              <UButton
                v-if="current.status === 'draft'"
                label="Mulai siklus"
                size="sm"
                @click="setStatus('active')"
              />
              <UButton
                v-if="current.status === 'active'"
                label="Tutup siklus"
                size="sm"
                variant="outline"
                @click="setStatus('closed')"
              />
            </template>
          </template>
        </div>
        <p
          v-if="cycles && !cycles.length"
          class="text-sm text-muted"
        >
          Belum ada siklus penilaian.
        </p>
        <UCard
          v-if="reviews"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <ul class="divide-y divide-default">
            <li
              v-for="r in reviews"
              :key="r.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ r.employee.fullName }}
                </p>
                <p class="text-xs text-muted">
                  {{ r.employee.employeeNumber }} · penilai {{ r.reviewerName ?? 'Admin HR' }} · {{ r.goals.length }} target
                </p>
              </div>
              <span
                v-if="r.finalScore !== null"
                class="font-semibold tabular"
              >{{ r.finalScore }}</span>
              <StatusBadge
                :map="PERFORMANCE_REVIEW_STATUS_META"
                :value="r.status"
              />
              <UButton
                :label="r.canFinalize || r.canEditGoals ? 'Nilai' : 'Lihat'"
                size="xs"
                variant="outline"
                @click="openReview = r"
              />
            </li>
          </ul>
          <p
            v-if="!reviews.length"
            class="p-6 text-center text-sm text-muted"
          >
            Tidak ada review dalam cakupan Anda.
          </p>
        </UCard>
      </template>
    </div>

    <USlideover
      :open="!!openReview"
      :title="openReview ? `Penilaian ${openReview.employee.fullName}` : ''"
      :ui="{ content: 'max-w-2xl' }"
      @update:open="(v: boolean) => { if (!v) openReview = null }"
    >
      <template #body>
        <ReviewCard
          v-if="openReview"
          :review="openReview"
          mode="manager"
          @saved="onSaved"
        />
      </template>
    </USlideover>

    <UModal
      v-model:open="open"
      title="Siklus penilaian baru"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Nama">
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Mulai">
              <UInput
                v-model="form.periodStart"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Selesai">
              <UInput
                v-model="form.periodEnd"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Target awal"
            hint="Bisa disesuaikan penilai per karyawan"
          >
            <div class="space-y-2">
              <div
                v-for="(g, i) in form.goals"
                :key="i"
                class="flex gap-2"
              >
                <UInput
                  v-model="g.title"
                  class="flex-1"
                />
                <UInputNumber
                  v-model="g.weight"
                  :min="1"
                  :max="100"
                  class="w-28"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  aria-label="Hapus"
                  @click="form.goals.splice(i, 1)"
                />
              </div>
              <UButton
                label="Tambah target"
                icon="i-lucide-plus"
                size="xs"
                variant="outline"
                @click="form.goals.push({ title: '', weight: 10 })"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="open = false"
          />
          <UButton
            label="Buat siklus"
            @click="create"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
