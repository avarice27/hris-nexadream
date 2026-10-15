<script setup lang="ts">
import { APPROVAL_SUBJECT_LABELS, OVERTIME_DAY_TYPE_LABELS, type ApprovalSubject } from '#shared/utils/hr'

// Kotak masuk persetujuan: langkah AKTIF yang bisa diputuskan pengguna ini (atasan langsung / Admin HR).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Persetujuan' })

interface Item {
  type: ApprovalSubject
  id: string
  code: string
  employee: { id: string, fullName: string, employeeNumber: string }
  createdAt: string
  summary: string
  detail: Record<string, unknown>
}
const toast = useApiToast()
const { decide } = useDecision()
const items = ref<Item[] | null>(null)
const errorMessage = ref('')
const filter = ref<'all' | ApprovalSubject>('all')
async function load() {
  try {
    items.value = (await apiFetch<{ items: Item[] }>('/api/app/approvals')).items
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const endpoint: Record<ApprovalSubject, (id: string) => string> = {
  leave: id => `/api/app/leave/requests/${id}/decide`,
  overtime: id => `/api/app/overtime/${id}/decide`,
  reimbursement: id => `/api/app/reimbursements/${id}/decide`,
  attendance_correction: id => `/api/app/attendance/corrections/${id}/decide`
}
async function act(item: Item, decision: 'approved' | 'rejected') {
  const ok = await decide(endpoint[item.type](item.id), decision, {
    title: `${decision === 'approved' ? 'Setujui' : 'Tolak'} ${APPROVAL_SUBJECT_LABELS[item.type].toLowerCase()} ${item.employee.fullName}?`,
    description: `${item.code} · ${item.summary}`,
    maxAmount: item.type === 'reimbursement' ? Number(item.detail.amount) : null
  })
  if (ok) await load()
}
function attachment(item: Item) {
  const path = item.type === 'leave' ? `/api/app/leave/requests/${item.id}/attachment` : `/api/app/reimbursements/${item.id}/receipt`
  openSignedFile(path).catch(toast.error)
}
const filtered = computed(() => (items.value ?? []).filter(i => filter.value === 'all' || i.type === filter.value))
const tabs = computed(() => [
  { label: `Semua (${items.value?.length ?? 0})`, value: 'all' },
  ...(['leave', 'overtime', 'reimbursement', 'attendance_correction'] as ApprovalSubject[])
    .map(t => ({ label: `${APPROVAL_SUBJECT_LABELS[t]} (${items.value?.filter(i => i.type === t).length ?? 0})`, value: t }))
])
const icon: Record<ApprovalSubject, string> = { leave: 'i-lucide-plane', overtime: 'i-lucide-timer', reimbursement: 'i-lucide-receipt', attendance_correction: 'i-lucide-clock-alert' }
</script>

<template>
  <PagePanel title="Persetujuan">
    <div class="space-y-4">
      <UTabs
        v-model="filter"
        :items="tabs"
        :content="false"
      />
      <ListState
        :status="errorMessage ? 'error' : items ? 'success' : 'loading'"
        :error="errorMessage"
        :empty="!filtered.length"
        empty-text="Tidak ada pengajuan yang menunggu Anda. 🎉"
        @retry="load"
      >
        <div class="space-y-3">
          <UCard
            v-for="item in filtered"
            :key="item.type + item.id"
          >
            <div class="flex flex-wrap items-start gap-4">
              <UIcon
                :name="icon[item.type]"
                class="mt-1 size-5 text-primary"
              />
              <div class="min-w-0 flex-1 space-y-1 text-sm">
                <p class="flex flex-wrap items-center gap-2">
                  <NuxtLink
                    :to="`/app/employees/${item.employee.id}`"
                    class="font-semibold hover:underline"
                  >{{ item.employee.fullName }}</NuxtLink>
                  <span class="text-muted">{{ item.employee.employeeNumber }}</span>
                  <UBadge
                    :label="APPROVAL_SUBJECT_LABELS[item.type]"
                    size="xs"
                    variant="subtle"
                    color="neutral"
                  />
                  <span class="font-mono text-xs text-muted">{{ item.code }}</span>
                </p>
                <p v-if="item.type === 'leave'">
                  {{ item.summary }} · {{ formatDateShort(item.detail.startDate as string) }} – {{ formatDateShort(item.detail.endDate as string) }}
                </p>
                <p v-else-if="item.type === 'overtime'">
                  {{ formatDateShort(item.detail.workDate as string) }} · {{ item.detail.startTime }}–{{ item.detail.endTime }} · {{ OVERTIME_DAY_TYPE_LABELS[item.detail.dayType as 'workday'] }}
                </p>
                <p v-else-if="item.type === 'reimbursement'">
                  {{ formatIDR(item.detail.amount as number) }} · {{ formatDateShort(item.detail.expenseDate as string) }}
                </p>
                <p v-else>
                  {{ formatDateShort(item.detail.workDate as string) }} · masuk {{ item.detail.requestedClockIn ?? '–' }} · pulang {{ item.detail.requestedClockOut ?? '–' }}
                </p>
                <p
                  v-if="item.detail.reason || item.detail.description"
                  class="text-muted"
                >
                  “{{ item.detail.reason ?? item.detail.description }}”
                </p>
                <p class="text-xs text-muted">
                  Diajukan {{ formatRelativeId(item.createdAt) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="item.detail.hasAttachment || item.detail.hasReceipt"
                  icon="i-lucide-paperclip"
                  label="Lampiran"
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  @click="attachment(item)"
                />
                <UButton
                  label="Tolak"
                  size="sm"
                  variant="outline"
                  color="error"
                  @click="act(item, 'rejected')"
                />
                <UButton
                  label="Setujui"
                  size="sm"
                  icon="i-lucide-check"
                  @click="act(item, 'approved')"
                />
              </div>
            </div>
          </UCard>
        </div>
      </ListState>
    </div>
  </PagePanel>
</template>
