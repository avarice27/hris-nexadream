<script setup lang="ts">
import { OVERTIME_DAY_TYPE_LABELS, REIMBURSEMENT_CATEGORIES, REIMBURSEMENT_CATEGORY_LABELS } from '#shared/utils/hr'
import { REQUEST_STATUS_META } from '#shared/utils/status'

// Pengajuan saya: lembur dan reimbursement (dibayarkan lewat payroll setelah disetujui).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Pengajuan' })

interface Step { order: number, approverType: string, approverName: string | null, status: string, decidedByName: string | null, decidedAt: string | null, note: string | null }
interface Overtime { id: string, code: string, workDate: string, startTime: string, endTime: string, minutes: number, dayType: string, reason: string, status: string, paid: boolean, steps: Step[] }
interface Reimb { id: string, code: string, categoryLabel: string, expenseDate: string, amount: number, approvedAmount: number | null, description: string, hasReceipt: boolean, status: string, paid: boolean, steps: Step[] }

const auth = useTenantAuth()
const toast = useApiToast()
const { confirm } = useConfirmDialog()
const tab = ref<'overtime' | 'reimbursement'>(auth.hasAbility('overtime.self') ? 'overtime' : 'reimbursement')
const overtime = ref<{ items: Overtime[], featureAvailable: boolean } | null>(null)
const reimb = ref<{ items: Reimb[], featureAvailable: boolean } | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    const [o, r] = await Promise.all([
      auth.hasAbility('overtime.self') ? apiFetch<{ items: Overtime[], featureAvailable: boolean }>('/api/app/me/overtime') : null,
      auth.hasAbility('reimbursement.self') ? apiFetch<{ items: Reimb[], featureAvailable: boolean }>('/api/app/me/reimbursements') : null
    ])
    overtime.value = o
    reimb.value = r
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

// Form lembur
const otOpen = ref(false)
const otForm = reactive({ workDate: '', startTime: '17:00', endTime: '19:00', reason: '' })
// Form reimbursement
const rbOpen = ref(false)
const rbForm = reactive({ category: 'transport', expenseDate: '', amount: undefined as number | undefined, description: '', receiptFileId: '', receiptName: '' })
const saving = ref(false)
const formError = ref('')

function openNew() {
  formError.value = ''
  if (tab.value === 'overtime') {
    if (overtime.value && !overtime.value.featureAvailable) return toast.error(null, 'Pengajuan lembur belum aktif di paket perusahaan Anda.')
    Object.assign(otForm, { workDate: localTodayKey(), startTime: '17:00', endTime: '19:00', reason: '' })
    otOpen.value = true
  } else {
    if (reimb.value && !reimb.value.featureAvailable) return toast.error(null, 'Reimbursement belum aktif di paket perusahaan Anda.')
    Object.assign(rbForm, { category: 'transport', expenseDate: localTodayKey(), amount: undefined, description: '', receiptFileId: '', receiptName: '' })
    rbOpen.value = true
  }
}

async function submitOvertime() {
  saving.value = true
  formError.value = ''
  try {
    await apiFetch('/api/app/me/overtime', { method: 'POST', body: otForm })
    otOpen.value = false
    toast.success('Lembur diajukan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
async function onReceipt(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    rbForm.receiptFileId = (await uploadFileToApi('/api/app/uploads/attachment', file, {}, 1600)).id
    rbForm.receiptName = file.name
  } catch (error) {
    toast.error(error)
  }
}
async function submitReimbursement() {
  saving.value = true
  formError.value = ''
  try {
    await apiFetch('/api/app/me/reimbursements', { method: 'POST', body: { category: rbForm.category, expenseDate: rbForm.expenseDate, amount: rbForm.amount, description: rbForm.description, receiptFileId: rbForm.receiptFileId || null } })
    rbOpen.value = false
    toast.success('Reimbursement diajukan')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}
async function cancel(kind: 'overtime' | 'reimbursements', id: string, code: string) {
  if (!await confirm({ title: `Batalkan ${code}?`, confirmLabel: 'Batalkan', color: 'error' })) return
  try {
    await apiFetch(`/api/app/me/${kind}/${id}/cancel`, { method: 'POST' })
    toast.success('Pengajuan dibatalkan')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const expanded = ref<string | null>(null)
const categoryOptions = REIMBURSEMENT_CATEGORIES.map(c => ({ label: REIMBURSEMENT_CATEGORY_LABELS[c], value: c as string }))
const tabs = computed(() => [
  ...(auth.hasAbility('overtime.self') ? [{ label: 'Lembur', value: 'overtime', icon: 'i-lucide-timer' }] : []),
  ...(auth.hasAbility('reimbursement.self') ? [{ label: 'Reimbursement', value: 'reimbursement', icon: 'i-lucide-receipt' }] : [])
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-highlighted">
        Pengajuan
      </h1>
      <UButton
        :label="tab === 'overtime' ? 'Ajukan lembur' : 'Ajukan reimbursement'"
        icon="i-lucide-plus"
        @click="openNew"
      />
    </div>
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
    />
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />

    <UCard
      v-if="tab === 'overtime' && overtime"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!overtime.items.length"
        class="p-6 text-center text-sm text-muted"
      >
        Belum ada pengajuan lembur.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="o in overtime.items"
          :key="o.id"
          class="px-4 py-3 text-sm"
        >
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-mono text-xs text-muted">{{ o.code }}</span>
            <span class="font-medium">{{ formatDateShort(o.workDate) }}</span>
            <span class="flex-1 text-muted">{{ o.startTime }}–{{ o.endTime }} · {{ formatMinutes(o.minutes) }} · {{ OVERTIME_DAY_TYPE_LABELS[o.dayType as keyof typeof OVERTIME_DAY_TYPE_LABELS] }}</span>
            <UBadge
              v-if="o.paid"
              label="Dibayar di payroll"
              size="xs"
              variant="outline"
              color="success"
            />
            <StatusBadge
              :map="REQUEST_STATUS_META"
              :value="o.status"
            />
            <UButton
              :icon="expanded === o.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Rincian"
              @click="expanded = expanded === o.id ? null : o.id"
            />
          </div>
          <div
            v-if="expanded === o.id"
            class="mt-3 space-y-3 rounded-md bg-elevated/50 p-3"
          >
            <p class="text-muted">
              {{ o.reason }}
            </p>
            <ApprovalTimeline :steps="o.steps" />
            <UButton
              v-if="o.status === 'pending'"
              label="Batalkan"
              size="xs"
              variant="ghost"
              color="error"
              @click="cancel('overtime', o.id, o.code)"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <UCard
      v-if="tab === 'reimbursement' && reimb"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!reimb.items.length"
        class="p-6 text-center text-sm text-muted"
      >
        Belum ada pengajuan reimbursement.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="r in reimb.items"
          :key="r.id"
          class="px-4 py-3 text-sm"
        >
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-mono text-xs text-muted">{{ r.code }}</span>
            <span class="font-medium">{{ r.categoryLabel }}</span>
            <span class="flex-1 text-muted">{{ formatDateShort(r.expenseDate) }} · {{ formatIDR(r.amount) }}<span v-if="r.approvedAmount !== null && r.approvedAmount !== r.amount"> (disetujui {{ formatIDR(r.approvedAmount) }})</span></span>
            <UBadge
              v-if="r.paid"
              label="Dibayar di payroll"
              size="xs"
              variant="outline"
              color="success"
            />
            <StatusBadge
              :map="REQUEST_STATUS_META"
              :value="r.status"
            />
            <UButton
              :icon="expanded === r.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Rincian"
              @click="expanded = expanded === r.id ? null : r.id"
            />
          </div>
          <div
            v-if="expanded === r.id"
            class="mt-3 space-y-3 rounded-md bg-elevated/50 p-3"
          >
            <p class="text-muted">
              {{ r.description }}
            </p>
            <ApprovalTimeline :steps="r.steps" />
            <div class="flex gap-2">
              <UButton
                v-if="r.hasReceipt"
                label="Bukti"
                icon="i-lucide-paperclip"
                size="xs"
                variant="outline"
                @click="openSignedFile(`/api/app/me/reimbursements/${r.id}/receipt`).catch(toast.error)"
              />
              <UButton
                v-if="r.status === 'pending'"
                label="Batalkan"
                size="xs"
                variant="ghost"
                color="error"
                @click="cancel('reimbursements', r.id, r.code)"
              />
            </div>
          </div>
        </li>
      </ul>
    </UCard>

    <UModal
      v-model:open="otOpen"
      title="Ajukan lembur"
      description="Lembur hari kerja maksimal 4 jam dan di luar jam kerja."
    >
      <template #body>
        <form
          id="ot-form"
          class="space-y-4"
          @submit.prevent="submitOvertime"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField label="Tanggal">
            <UInput
              v-model="otForm.workDate"
              type="date"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Mulai">
              <UInput
                v-model="otForm.startTime"
                type="time"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Selesai">
              <UInput
                v-model="otForm.endTime"
                type="time"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Pekerjaan"
            required
          >
            <UTextarea
              v-model="otForm.reason"
              :rows="2"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="otOpen = false"
          />
          <UButton
            type="submit"
            form="ot-form"
            label="Ajukan"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="rbOpen"
      title="Ajukan reimbursement"
    >
      <template #body>
        <form
          id="rb-form"
          class="space-y-4"
          @submit.prevent="submitReimbursement"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Kategori">
              <USelect
                v-model="rbForm.category"
                :items="categoryOptions"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Tanggal pengeluaran">
              <UInput
                v-model="rbForm.expenseDate"
                type="date"
                :max="localTodayKey()"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Nominal"
            required
          >
            <UInputNumber
              v-model="rbForm.amount"
              :min="0"
              :step="1000"
              :format-options="{ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }"
              locale="id-ID"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Keterangan"
            required
          >
            <UTextarea
              v-model="rbForm.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Bukti / struk">
            <input
              type="file"
              accept="image/*,application/pdf"
              class="text-sm"
              @change="onReceipt"
            >
            <p
              v-if="rbForm.receiptName"
              class="mt-1 text-xs text-success"
            >
              Terunggah: {{ rbForm.receiptName }}
            </p>
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Batal"
            variant="ghost"
            color="neutral"
            @click="rbOpen = false"
          />
          <UButton
            type="submit"
            form="rb-form"
            label="Ajukan"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
