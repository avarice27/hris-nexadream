<script setup lang="ts">
import { PAYROLL_STATUS_META } from '#shared/utils/status'

// Payroll: daftar run per periode. Nexadream menghitung & mencatat; transfer gaji dilakukan perusahaan (D5).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Payroll' })

interface Run { id: string, code: string, periodLabel: string, branchName: string | null, includeThr: boolean, status: string, employeeCount: number, totalGross: number, totalNet: number, totalPph21: number, calculatedAt: string | null, paidDate: string | null }
const auth = useTenantAuth()
const entitlements = useEntitlements()
const org = useOrgOptions()
const list = useServerList<Run, { featureAvailable: boolean }>('/api/app/payroll/runs')
onMounted(() => org.load().catch(() => {}))
const canWrite = computed(() => auth.hasAbility('payroll.write'))

const open = ref(false)
const formError = ref('')
const today = localTodayKey()
const form = reactive({ periodYear: Number(today.slice(0, 4)), periodMonth: Number(today.slice(5, 7)), branchId: undefined as string | undefined, includeThr: false, note: '' })
function openCreate() {
  if (list.extra.value.featureAvailable === false) return entitlements.upgradeRequired('payroll')
  formError.value = ''
  open.value = true
}
async function create() {
  formError.value = ''
  try {
    const run = await apiFetch<{ id: string }>('/api/app/payroll/runs', { method: 'POST', body: { ...form, branchId: form.branchId ?? null, note: form.note || null } })
    open.value = false
    await navigateTo(`/app/payroll/${run.id}?calculate=1`)
  } catch (error) {
    if (!entitlements.handlePlanError(error)) formError.value = extractErrorMessage(error)
  }
}
const monthOptions = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((label, i) => ({ label, value: i + 1 }))
const yearOptions = [form.periodYear - 1, form.periodYear, form.periodYear + 1].map(y => ({ label: String(y), value: y }))
const branchOptions = computed(() => [{ label: 'Semua kantor', value: undefined as string | undefined }, ...org.branchOptions.value])
</script>

<template>
  <PagePanel title="Payroll">
    <template #actions>
      <UButton
        v-if="canWrite"
        to="/app/payroll/components"
        label="Komponen gaji"
        icon="i-lucide-list-tree"
        variant="outline"
        color="neutral"
        class="hidden sm:inline-flex"
      />
      <UButton
        v-if="canWrite"
        label="Run baru"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <div class="space-y-4">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="Nexadream menghitung PPh 21 (TER), BPJS, lembur, dan THR lalu mencatat slip gaji."
        description="Transfer gaji, setoran pajak, dan iuran BPJS tetap dilakukan perusahaan. Periksa hasil sebelum menyetujui."
      />
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Belum ada run payroll. Buat run untuk periode berjalan."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="r in list.items.value"
              :key="r.id"
            >
              <NuxtLink
                :to="`/app/payroll/${r.id}`"
                class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-elevated/60"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {{ r.periodLabel }}<span
                      v-if="r.includeThr"
                      class="text-primary"
                    > + THR</span>
                  </p>
                  <p class="text-xs text-muted">
                    {{ r.code }} · {{ r.branchName ?? 'Semua kantor' }} · {{ r.employeeCount }} karyawan<span v-if="r.paidDate"> · dibayar {{ formatDateShort(r.paidDate) }}</span>
                  </p>
                </div>
                <span
                  v-if="r.calculatedAt"
                  class="tabular font-medium"
                >{{ formatIDR(r.totalNet) }}</span>
                <StatusBadge
                  :map="PAYROLL_STATUS_META"
                  :value="r.status"
                />
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-dimmed"
                />
              </NuxtLink>
            </li>
          </ul>
        </UCard>
      </ListState>
    </div>

    <UModal
      v-model:open="open"
      title="Run payroll baru"
      description="Satu run aktif per periode. Karyawan yang masuk/berhenti di tengah periode dihitung proporsional."
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
            class="sm:col-span-2"
          />
          <UFormField label="Bulan">
            <USelect
              v-model="form.periodMonth"
              :items="monthOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tahun">
            <USelect
              v-model="form.periodYear"
              :items="yearOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Kantor"
            class="sm:col-span-2"
          >
            <USelect
              v-model="form.branchId"
              :items="branchOptions"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="form.includeThr"
            label="Sertakan THR keagamaan"
            description="1× upah untuk masa kerja ≥ 12 bulan; proporsional untuk 1–11 bulan."
            class="sm:col-span-2"
          />
          <UFormField
            label="Catatan"
            class="sm:col-span-2"
          >
            <UInput
              v-model="form.note"
              class="w-full"
            />
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
            label="Buat & hitung"
            @click="create"
          />
        </div>
      </template>
    </UModal>
  </PagePanel>
</template>
