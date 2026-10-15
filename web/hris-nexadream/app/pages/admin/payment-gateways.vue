<script setup lang="ts">
import type { PaymentProviderMeta } from '#shared/utils/payments'
import { formatDateTimeId } from '#shared/utils/format'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Payment gateway' })

interface GatewayRow {
  id: string
  provider: string
  label: string
  isActive: boolean
  isSandbox: boolean
  merchantId: string | null
  baseUrl: string | null
  orderPrefix: string | null
  serverKeyMasked: string | null
  clientKeyMasked: string | null
  hasServerKey: boolean
  hasClientKey: boolean
  updatedAt: string
}

const auth = usePlatformAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const canWrite = computed(() => auth.hasPermission('payments.write'))

const data = ref<{ providers: PaymentProviderMeta[], items: GatewayRow[], webhookUrlBase: string } | null>(null)
const errorMessage = ref('')
const forms = reactive<Record<string, Record<string, string>>>({})
const saving = ref<string | null>(null)

async function load() {
  try {
    data.value = await apiFetch('/api/admin/payment-gateways')
    for (const row of data.value!.items) {
      forms[row.id] = { serverKey: '', clientKey: '', baseUrl: row.baseUrl ?? '', orderPrefix: row.orderPrefix ?? '', merchantId: row.merchantId ?? '' }
    }
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)

const metaFor = (provider: string) => data.value?.providers.find(p => p.value === provider)

async function save(row: GatewayRow, extra: Record<string, unknown> = {}) {
  saving.value = row.id
  try {
    const form = forms[row.id]!
    const fields = metaFor(row.provider)?.fields ?? []
    const body: Record<string, unknown> = { ...extra }
    for (const field of fields) {
      const value = form[field.key] ?? ''
      // Rahasia kosong = pertahankan yang tersimpan.
      if (field.secret) {
        if (value) body[field.key] = value
      } else {
        body[field.key] = value
      }
    }
    await apiFetch(`/api/admin/payment-gateways/${row.id}`, { method: 'PATCH', body })
    toast.add({ title: 'Gateway disimpan', color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = null
  }
}

async function setActive(row: GatewayRow, isActive: boolean) {
  const ok = await confirm({
    title: isActive ? `Aktifkan ${row.label}?` : `Nonaktifkan ${row.label}?`,
    description: isActive
      ? 'Semua checkout langganan baru akan memakai gateway ini. Gateway lain dinonaktifkan.'
      : 'Perusahaan tidak bisa membayar langganan sampai ada gateway aktif.',
    confirmLabel: isActive ? 'Aktifkan' : 'Nonaktifkan',
    color: isActive ? 'primary' : 'error'
  })
  if (ok) await save(row, { isActive })
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
  toast.add({ title: 'Disalin', color: 'success', icon: 'i-lucide-copy' })
}
</script>

<template>
  <PagePanel title="Payment gateway">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-96 w-full max-w-3xl"
    />

    <div
      v-else
      class="max-w-3xl space-y-6"
    >
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="Hanya untuk langganan perusahaan ke platform."
        description="Gaji, THR, dan reimbursement karyawan tidak pernah diproses lewat gateway ini."
      />

      <UCard
        v-for="row in data.items"
        :key="row.id"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon
                :name="metaFor(row.provider)?.icon ?? 'i-lucide-credit-card'"
                class="size-5 text-primary"
              />
              <p class="font-semibold">
                {{ row.label }}
              </p>
              <UBadge
                :label="row.isActive ? 'Aktif' : 'Nonaktif'"
                :color="row.isActive ? 'success' : 'neutral'"
                variant="subtle"
              />
            </div>
            <ULink
              :to="metaFor(row.provider)?.docsUrl"
              target="_blank"
              class="text-sm text-primary"
            >
              Dokumentasi
            </ULink>
          </div>
          <p class="mt-2 text-sm text-muted">
            {{ metaFor(row.provider)?.description }}
          </p>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="save(row)"
        >
          <UFormField
            v-for="field in metaFor(row.provider)?.fields ?? []"
            :key="field.key"
            :label="field.label"
            :help="field.hint"
          >
            <template v-if="field.secret">
              <p
                v-if="field.key === 'serverKey' && row.hasServerKey"
                class="mb-1 text-xs text-muted"
              >
                Tersimpan: <code>{{ row.serverKeyMasked }}</code> — kosongkan untuk mempertahankan.
              </p>
              <PasswordInput
                v-model="forms[row.id]![field.key]"
                autocomplete="off"
              />
            </template>
            <UInput
              v-else
              v-model="forms[row.id]![field.key]"
              :placeholder="field.placeholder"
              :disabled="!canWrite"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="URL webhook untuk admin Payment Hub"
            help="Berikan ke admin hub bersama URL redirect /app/billing/return."
          >
            <div class="flex gap-2">
              <UInput
                :model-value="`${data.webhookUrlBase}/${row.provider}`"
                readonly
                class="flex-1 font-mono text-xs"
              />
              <UButton
                icon="i-lucide-copy"
                variant="outline"
                color="neutral"
                aria-label="Salin URL webhook"
                @click="copy(`${data.webhookUrlBase}/${row.provider}`)"
              />
            </div>
          </UFormField>

          <div
            v-if="canWrite"
            class="flex flex-wrap gap-2"
          >
            <UButton
              type="submit"
              label="Simpan"
              :loading="saving === row.id"
            />
            <UButton
              v-if="!row.isActive"
              label="Aktifkan"
              variant="outline"
              @click="setActive(row, true)"
            />
            <UButton
              v-else
              label="Nonaktifkan"
              variant="ghost"
              color="error"
              @click="setActive(row, false)"
            />
          </div>
          <p class="text-xs text-dimmed">
            Diperbarui {{ formatDateTimeId(row.updatedAt, auth.displayTimezone.value) }}
          </p>
        </form>
      </UCard>
    </div>
  </PagePanel>
</template>
