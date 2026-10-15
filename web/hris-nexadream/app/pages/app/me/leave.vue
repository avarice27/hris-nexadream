<script setup lang="ts">
import { REQUEST_STATUS_META } from '#shared/utils/status'
import type { ApprovalStepView } from '~/types/hr'

// Cuti saya: saldo per jenis (dari ledger), riwayat pengajuan, dan form pengajuan.
// Jumlah hari dihitung server (jadwal + libur); pratinjau hanya menampilkan hasil server.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Cuti' })

interface Balance { leaveTypeId: string, code: string, name: string, tracked: boolean, eligible: boolean, entitled: number, used: number, pending: number, available: number | null, allowHalfDay: boolean, requiresAttachment: boolean, isPaid: boolean }
interface Request { id: string, code: string, leaveTypeName: string, startDate: string, endDate: string, halfDay: boolean, days: number, reason: string | null, status: string, hasAttachment: boolean, steps: ApprovalStepView[] }

const toast = useApiToast()
const data = ref<{ year: number, balances: Balance[], items: Request[], featureAvailable: boolean } | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    data.value = await apiFetch('/api/app/me/leave')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const open = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ leaveTypeId: '', startDate: '', endDate: '', halfDay: false, reason: '', attachmentFileId: '' as string, attachmentName: '' })
const preview = ref<number | null>(null)
const selected = computed(() => data.value?.balances.find(b => b.leaveTypeId === form.leaveTypeId))
const typeItems = computed(() => (data.value?.balances ?? []).map(b => ({ label: b.tracked ? `${b.name} (sisa ${b.available})` : b.name, value: b.leaveTypeId, disabled: !b.eligible })))

function openForm() {
  // Karyawan tidak bisa membeli paket: cukup beri tahu (dialog upgrade hanya di konsol).
  if (data.value && !data.value.featureAvailable) {
    toast.error(null, 'Pengajuan cuti belum aktif di paket perusahaan Anda. Hubungi Admin HR.')
    return
  }
  const today = localTodayKey()
  Object.assign(form, { leaveTypeId: data.value?.balances.find(b => b.eligible)?.leaveTypeId ?? '', startDate: today, endDate: today, halfDay: false, reason: '', attachmentFileId: '', attachmentName: '' })
  formError.value = ''
  open.value = true
}

let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [form.leaveTypeId, form.startDate, form.endDate, form.halfDay], () => {
  clearTimeout(previewTimer)
  preview.value = null
  if (!form.leaveTypeId || !form.startDate || !form.endDate || form.endDate < form.startDate) return
  previewTimer = setTimeout(async () => {
    try {
      preview.value = (await apiFetch<{ days: number }>('/api/app/me/leave/preview', { query: { leaveTypeId: form.leaveTypeId, startDate: form.startDate, endDate: form.endDate, halfDay: form.halfDay || undefined } })).days
    } catch {
      preview.value = null
    }
  }, 300)
})
watch(() => form.startDate, (v) => {
  if (form.endDate < v) form.endDate = v
})

async function onAttachment(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const res = await uploadFileToApi('/api/app/uploads/attachment', file, {}, 1600)
    form.attachmentFileId = res.id
    form.attachmentName = file.name
  } catch (error) {
    toast.error(error)
  }
}

async function submit() {
  saving.value = true
  formError.value = ''
  try {
    await apiFetch('/api/app/me/leave', { method: 'POST', body: { leaveTypeId: form.leaveTypeId, startDate: form.startDate, endDate: form.endDate, halfDay: form.halfDay, reason: form.reason || null, attachmentFileId: form.attachmentFileId || null } })
    open.value = false
    toast.success('Cuti diajukan', 'Menunggu persetujuan atasan.')
    await load()
  } catch (error) {
    formError.value = extractErrorMessage(error)
  } finally {
    saving.value = false
  }
}

const { confirm } = useConfirmDialog()
async function cancel(r: Request) {
  if (!await confirm({ title: `Batalkan ${r.code}?`, description: r.status === 'approved' ? 'Saldo cuti akan dikembalikan.' : undefined, confirmLabel: 'Batalkan cuti', color: 'error' })) return
  try {
    await apiFetch(`/api/app/me/leave/${r.id}/cancel`, { method: 'POST' })
    toast.success('Cuti dibatalkan')
    await load()
  } catch (error) {
    toast.error(error)
  }
}
const expanded = ref<string | null>(null)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-highlighted">
        Cuti
      </h1>
      <UButton
        label="Ajukan cuti"
        icon="i-lucide-plus"
        @click="openForm"
      />
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-48 w-full"
    />
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="b in data.balances.filter(x => x.tracked)"
          :key="b.leaveTypeId"
          :ui="{ body: 'p-4 sm:p-4' }"
        >
          <p class="text-sm text-muted">
            {{ b.name }} {{ data.year }}
          </p>
          <p class="mt-1 text-2xl font-semibold tabular">
            {{ b.available }} <span class="text-sm font-normal text-muted">dari {{ b.entitled }} hari</span>
          </p>
          <p class="text-xs text-muted">
            Terpakai {{ b.used }}<span v-if="b.pending"> · menunggu {{ b.pending }}</span><span v-if="!b.eligible"> · belum memenuhi masa kerja</span>
          </p>
        </UCard>
      </div>

      <div>
        <h2 class="mb-2 font-semibold">
          Riwayat pengajuan
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <p
            v-if="!data.items.length"
            class="p-6 text-center text-sm text-muted"
          >
            Belum ada pengajuan cuti.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="r in data.items"
              :key="r.id"
              class="px-4 py-3 text-sm"
            >
              <div class="flex flex-wrap items-center gap-3">
                <span class="font-mono text-xs text-muted">{{ r.code }}</span>
                <span class="font-medium">{{ r.leaveTypeName }}</span>
                <span class="flex-1 text-muted">{{ formatDateShort(r.startDate) }}<span v-if="r.endDate !== r.startDate"> – {{ formatDateShort(r.endDate) }}</span> · {{ r.days }} hari</span>
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
                <p
                  v-if="r.reason"
                  class="text-muted"
                >
                  {{ r.reason }}
                </p>
                <ApprovalTimeline :steps="r.steps" />
                <div class="flex gap-2">
                  <UButton
                    v-if="r.hasAttachment"
                    label="Lampiran"
                    icon="i-lucide-paperclip"
                    size="xs"
                    variant="outline"
                    @click="openSignedFile(`/api/app/me/leave/${r.id}/attachment`).catch(toast.error)"
                  />
                  <UButton
                    v-if="r.status === 'pending' || (r.status === 'approved' && r.startDate > localTodayKey())"
                    label="Batalkan"
                    size="xs"
                    variant="ghost"
                    color="error"
                    @click="cancel(r)"
                  />
                </div>
              </div>
            </li>
          </ul>
        </UCard>
      </div>
    </template>

    <UModal
      v-model:open="open"
      title="Ajukan cuti"
    >
      <template #body>
        <form
          id="leave-form"
          class="space-y-4"
          @submit.prevent="submit"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />
          <UFormField
            label="Jenis cuti"
            required
          >
            <USelect
              v-model="form.leaveTypeId"
              :items="typeItems"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Mulai">
              <UInput
                v-model="form.startDate"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Selesai">
              <UInput
                v-model="form.endDate"
                type="date"
                :min="form.startDate"
                :disabled="form.halfDay"
                class="w-full"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-if="selected?.allowHalfDay && form.startDate === form.endDate"
            v-model="form.halfDay"
            label="Setengah hari"
          />
          <p
            v-if="preview !== null"
            class="text-sm"
            :class="selected?.tracked && (selected.available ?? 0) < preview ? 'text-error' : 'text-muted'"
          >
            {{ preview }} hari kerja<span v-if="selected?.tracked"> · sisa saldo {{ selected.available }} hari</span>
          </p>
          <UFormField label="Alasan">
            <UTextarea
              v-model="form.reason"
              :rows="2"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="selected?.requiresAttachment"
            label="Lampiran (mis. surat dokter)"
            required
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              class="text-sm"
              @change="onAttachment"
            >
            <p
              v-if="form.attachmentName"
              class="mt-1 text-xs text-success"
            >
              Terunggah: {{ form.attachmentName }}
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
            @click="open = false"
          />
          <UButton
            type="submit"
            form="leave-form"
            label="Ajukan"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
