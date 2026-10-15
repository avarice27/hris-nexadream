<script setup lang="ts">
import { REQUEST_STATUS_META } from '#shared/utils/status'
import type { ApprovalStepView } from '~/types/hr'

// Reimbursement (konsol). Nominal yang disetujui dibayarkan lewat payroll berikutnya (tidak kena pajak).
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Reimbursement' })

interface Row { id: string, code: string, categoryLabel: string, employee: { id: string, fullName: string, employeeNumber: string }, expenseDate: string, amount: number, approvedAmount: number | null, description: string, hasReceipt: boolean, status: string, paid: boolean, steps: ApprovalStepView[], canDecide: boolean }
const toast = useApiToast()
const { decide } = useDecision()
const status = ref<string | undefined>('pending')
const list = useServerList<Row, { totals: { pending: number, approved: number } }>('/api/app/reimbursements', { filters: { status } })
const expanded = ref<string | null>(null)
async function act(r: Row, decision: 'approved' | 'rejected') {
  if (await decide(`/api/app/reimbursements/${r.id}/decide`, decision, { title: `${decision === 'approved' ? 'Setujui' : 'Tolak'} reimbursement ${r.employee.fullName}?`, description: `${r.categoryLabel} · ${formatIDR(r.amount)}`, maxAmount: r.amount })) await list.refresh()
}
const statusItems = [{ label: 'Menunggu', value: 'pending' }, { label: 'Semua', value: '__all__' }, { label: 'Disetujui', value: 'approved' }, { label: 'Ditolak', value: 'rejected' }]
</script>

<template>
  <PagePanel title="Reimbursement">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama atau kode…"
          class="w-full sm:w-64"
        />
        <USelect
          v-model="status"
          :items="statusItems"
          class="w-40"
        />
        <p
          v-if="list.extra.value.totals"
          class="text-sm text-muted sm:ml-auto"
        >
          Menunggu {{ formatIDR(list.extra.value.totals.pending) }} · disetujui {{ formatIDR(list.extra.value.totals.approved) }}
        </p>
      </div>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Tidak ada pengajuan reimbursement."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li
              v-for="r in list.items.value"
              :key="r.id"
              class="px-4 py-3 text-sm"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p>
                    <NuxtLink
                      :to="`/app/employees/${r.employee.id}`"
                      class="font-medium hover:underline"
                    >{{ r.employee.fullName }}</NuxtLink>
                    <span class="text-muted"> · {{ r.categoryLabel }} · {{ formatDateShort(r.expenseDate) }}</span>
                  </p>
                  <p class="text-xs text-muted">
                    {{ r.code }}
                  </p>
                </div>
                <span class="tabular font-medium">{{ formatIDR(r.approvedAmount ?? r.amount) }}</span>
                <UBadge
                  v-if="r.paid"
                  label="Masuk payroll"
                  size="xs"
                  variant="outline"
                  color="success"
                />
                <StatusBadge
                  :map="REQUEST_STATUS_META"
                  :value="r.status"
                />
                <template v-if="r.canDecide">
                  <UButton
                    label="Tolak"
                    size="xs"
                    variant="outline"
                    color="error"
                    @click="act(r, 'rejected')"
                  />
                  <UButton
                    label="Setujui"
                    size="xs"
                    icon="i-lucide-check"
                    @click="act(r, 'approved')"
                  />
                </template>
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
                class="mt-3 space-y-2 rounded-md bg-elevated/50 p-3"
              >
                <p class="text-muted">
                  “{{ r.description }}”
                </p>
                <p
                  v-if="r.approvedAmount !== null && r.approvedAmount !== r.amount"
                  class="text-xs"
                >
                  Diajukan {{ formatIDR(r.amount) }}, disetujui {{ formatIDR(r.approvedAmount) }}.
                </p>
                <ApprovalTimeline :steps="r.steps" />
                <UButton
                  v-if="r.hasReceipt"
                  label="Bukti"
                  icon="i-lucide-paperclip"
                  size="xs"
                  variant="outline"
                  @click="openSignedFile(`/api/app/reimbursements/${r.id}/receipt`).catch(toast.error)"
                />
              </div>
            </li>
          </ul>
        </UCard>
      </ListState>
      <div
        v-if="list.meta.value.pageCount > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="list.page.value"
          :total="list.meta.value.total"
          :items-per-page="list.meta.value.limit"
        />
      </div>
    </div>
  </PagePanel>
</template>
