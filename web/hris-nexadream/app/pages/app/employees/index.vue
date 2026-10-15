<script setup lang="ts">
import { EMPLOYMENT_TYPE_LABELS, type EmploymentTypeSlug } from '#shared/utils/hr'
import { EMPLOYMENT_STATUS_META } from '#shared/utils/status'

definePageMeta({ layout: 'tenant' })
useHead({ title: 'Karyawan' })

interface Row {
  id: string
  employeeNumber: string
  fullName: string
  email: string | null
  status: string
  employmentType: string
  joinDate: string
  contractEndDate: string | null
  branchName: string | null
  departmentName: string | null
  positionName: string | null
  managerName: string | null
  hasLogin: boolean
}

const auth = useTenantAuth()
const route = useRoute()
const toast = useApiToast()
const entitlements = useEntitlements()
const org = useOrgOptions()
const status = ref<string | undefined>('current')
const branchId = ref<string | undefined>('__all__')
const departmentId = ref<string | undefined>('__all__')
const contract = ref<string | undefined>(route.query.contract === 'expiring' ? 'expiring' : undefined)
const list = useServerList<Row, { usage: { used: number, limit: number } }>('/api/app/employees', { filters: { status, branchId, departmentId, contract } })
onMounted(() => org.load().catch(() => {}))

const canWrite = computed(() => auth.hasAbility('employees.write'))
const usage = computed(() => list.extra.value.usage)
const atLimit = computed(() => !!usage.value && usage.value.limit !== -1 && usage.value.used >= usage.value.limit)
const open = ref(false)
function openCreate() {
  if (atLimit.value) return entitlements.limitReached('employees')
  open.value = true
}
async function onCreated(result: { id: string }) {
  open.value = false
  await navigateTo(`/app/employees/${result.id}`)
}
async function exportCsv() {
  try {
    await downloadFromApi('/api/app/employees/export', 'karyawan.csv', { status: status.value === '__all__' ? undefined : status.value })
  } catch (error) {
    toast.error(error)
  }
}
const statusItems = [
  { label: 'Aktif (semua)', value: 'current' },
  { label: 'Semua status', value: '__all__' },
  ...Object.entries(EMPLOYMENT_STATUS_META).map(([value, m]) => ({ label: m.label, value }))
]
</script>

<template>
  <PagePanel title="Karyawan">
    <template #actions>
      <UButton
        v-if="canWrite"
        to="/app/employees/import"
        label="Impor"
        icon="i-lucide-upload"
        variant="outline"
        color="neutral"
        class="hidden sm:inline-flex"
      />
      <UButton
        label="Ekspor"
        icon="i-lucide-download"
        variant="outline"
        color="neutral"
        class="hidden sm:inline-flex"
        @click="exportCsv"
      />
      <UButton
        v-if="canWrite"
        label="Tambah"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>
    <div class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <UInput
          v-model="list.search.value"
          icon="i-lucide-search"
          placeholder="Cari nama, NIP, atau email…"
          class="w-full sm:w-72"
          aria-label="Cari karyawan"
        />
        <USelect
          v-model="status"
          :items="statusItems"
          class="w-44"
          aria-label="Status"
        />
        <USelect
          v-model="branchId"
          :items="[{ label: 'Semua kantor', value: '__all__' }, ...org.branchOptions.value]"
          class="w-44"
          aria-label="Kantor"
        />
        <USelect
          v-model="departmentId"
          :items="[{ label: 'Semua departemen', value: '__all__' }, ...org.departments.value]"
          class="w-48"
          aria-label="Departemen"
        />
        <UButton
          v-if="contract"
          label="Kontrak berakhir ≤ 30 hari"
          trailing-icon="i-lucide-x"
          size="sm"
          variant="soft"
          color="warning"
          @click="contract = undefined"
        />
      </div>
      <p
        v-if="usage"
        class="text-sm text-muted"
      >
        {{ list.meta.value.total }} ditampilkan · {{ usage.used }}<span v-if="usage.limit !== -1"> / {{ usage.limit }}</span> karyawan aktif di paket Anda
      </p>
      <ListState
        :status="list.status.value"
        :error="list.errorMessage.value"
        :empty="!list.items.value.length"
        empty-text="Belum ada karyawan. Tambahkan satu per satu atau impor dari Excel."
        @retry="list.refresh"
      >
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[720px] text-sm">
              <thead class="border-b border-default text-left text-xs text-muted">
                <tr>
                  <th class="px-4 py-2 font-medium">
                    Karyawan
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Jabatan
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Kantor
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Mulai
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="e in list.items.value"
                  :key="e.id"
                  class="cursor-pointer hover:bg-elevated/60"
                  @click="navigateTo(`/app/employees/${e.id}`)"
                >
                  <td class="px-4 py-2.5">
                    <NuxtLink
                      :to="`/app/employees/${e.id}`"
                      class="font-medium hover:underline"
                      @click.stop
                    >{{ e.fullName }}</NuxtLink>
                    <p class="text-xs text-muted">
                      {{ e.employeeNumber }}<span v-if="e.hasLogin"> · <UIcon
                        name="i-lucide-smartphone"
                        class="size-3 align-[-1px]"
                      /> ESS</span>
                    </p>
                  </td>
                  <td class="px-4 py-2.5">
                    <p>{{ e.positionName ?? '-' }}</p>
                    <p class="text-xs text-muted">
                      {{ e.departmentName ?? '' }}
                    </p>
                  </td>
                  <td class="px-4 py-2.5">
                    {{ e.branchName }}
                  </td>
                  <td class="px-4 py-2.5">
                    <p>{{ formatDateShort(e.joinDate) }}</p>
                    <p class="text-xs text-muted">
                      {{ EMPLOYMENT_TYPE_LABELS[e.employmentType as EmploymentTypeSlug] }}<span
                        v-if="e.contractEndDate"
                        class="text-warning"
                      > · s.d. {{ formatDateShort(e.contractEndDate) }}</span>
                    </p>
                  </td>
                  <td class="px-4 py-2.5">
                    <StatusBadge
                      :map="EMPLOYMENT_STATUS_META"
                      :value="e.status"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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

    <USlideover
      v-model:open="open"
      title="Tambah karyawan"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <EmployeeForm
          mode="create"
          @saved="onCreated"
          @cancel="open = false"
        />
      </template>
    </USlideover>
  </PagePanel>
</template>
