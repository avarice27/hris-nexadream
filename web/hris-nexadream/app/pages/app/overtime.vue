<script setup lang="ts">
import { OVERTIME_DAY_TYPE_LABELS } from '#shared/utils/hr'
import { REQUEST_STATUS_META } from '#shared/utils/status'
import type { ApprovalStepView } from '~/types/hr'

// Lembur (konsol). Upah lembur dihitung di payroll (PP 35/2021) dari lembur yang disetujui.
definePageMeta({ layout: 'tenant' })
useHead({ title: 'Lembur' })

interface Row { id: string, code: string, employee: { id: string, fullName: string, employeeNumber: string }, workDate: string, startTime: string, endTime: string, minutes: number, dayType: string, reason: string, status: string, paid: boolean, steps: ApprovalStepView[], canDecide: boolean }
const { decide } = useDecision()
const status = ref<string | undefined>('pending')
const list = useServerList<Row>('/api/app/overtime', { filters: { status } })
const expanded = ref<string | null>(null)
async function act(r: Row, decision: 'approved' | 'rejected') {
  if (await decide(`/api/app/overtime/${r.id}/decide`, decision, { title: `${decision === 'approved' ? 'Setujui' : 'Tolak'} lembur ${r.employee.fullName}?`, description: `${formatDateShort(r.workDate)} · ${r.startTime}–${r.endTime} (${formatMinutes(r.minutes)})` })) await list.refresh()
}
const statusItems = [{ label: 'Menunggu', value: 'pending' }, { label: 'Semua', value: '__all__' }, { label: 'Disetujui', value: 'approved' }, { label: 'Ditolak', value: 'rejected' }]
</script>

<template>
  <PagePanel title="Lembur">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
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
      </div>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Tidak ada pengajuan lembur."
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
                    <span class="text-muted"> · {{ formatDateShort(r.workDate) }} · {{ r.startTime }}–{{ r.endTime }} · {{ formatMinutes(r.minutes) }}</span>
                  </p>
                  <p class="text-xs text-muted">
                    {{ r.code }} · {{ OVERTIME_DAY_TYPE_LABELS[r.dayType as 'workday'] }}
                  </p>
                </div>
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
                  “{{ r.reason }}”
                </p>
                <ApprovalTimeline :steps="r.steps" />
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
