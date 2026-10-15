<script setup lang="ts">
// Kesiapan produksi: konfigurasi yang wajib ada sebelum peluncuran (nilai rahasia tidak pernah ditampilkan).
definePageMeta({ layout: 'admin' })
useHead({ title: 'Kesiapan produksi' })

interface Status { appEnv: string, version: string, ready: boolean, checks: Array<{ key: string, label: string, ok: boolean, severity: 'error' | 'warning', hint: string }> }
const data = ref<Status | null>(null)
const errorMessage = ref('')
async function load() {
  try {
    data.value = await apiFetch<Status>('/api/admin/system/status')
  } catch (error) {
    errorMessage.value = extractErrorMessage(error)
  }
}
onMounted(load)
</script>

<template>
  <PagePanel title="Kesiapan produksi">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />
    <USkeleton
      v-else-if="!data"
      class="h-64 w-full"
    />
    <div
      v-else
      class="max-w-3xl space-y-4"
    >
      <UAlert
        :color="data.ready ? 'success' : 'warning'"
        variant="subtle"
        :icon="data.ready ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
        :title="data.ready ? 'Konfigurasi wajib sudah lengkap.' : 'Masih ada konfigurasi wajib yang belum lengkap.'"
        :description="`Lingkungan: ${data.appEnv} · versi ${data.version}`"
      />
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="c in data.checks"
            :key="c.key"
            class="flex items-start gap-3 px-4 py-3 text-sm"
          >
            <UIcon
              :name="c.ok ? 'i-lucide-circle-check' : c.severity === 'error' ? 'i-lucide-circle-x' : 'i-lucide-circle-alert'"
              class="mt-0.5 size-5 shrink-0"
              :class="c.ok ? 'text-success' : c.severity === 'error' ? 'text-error' : 'text-warning'"
            />
            <div>
              <p class="font-medium">
                {{ c.label }} <code class="text-xs text-muted">{{ c.key }}</code>
              </p>
              <p class="text-muted">
                {{ c.hint }}
              </p>
            </div>
          </li>
        </ul>
      </UCard>
      <UCard>
        <p class="mb-2 font-semibold">
          Langkah manual sebelum peluncuran
        </p>
        <ul class="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Ganti kata sandi superadmin awal setelah masuk pertama kali.</li>
          <li>Kirim email uji dari Pengaturan → Email keluar.</li>
          <li>Uji pembayaran end-to-end ke Payment Hub produksi; daftarkan URL webhook dan halaman kembali.</li>
          <li>Bucket penyimpanan PRIVAT untuk dokumen & foto absen; atur CORS hanya ke domain aplikasi.</li>
          <li>Verifikasi tarif PPh 21/BPJS di Data referensi dengan konsultan pajak; tinjau teks Kebijakan Privasi & Syarat.</li>
          <li>Tandai versi di CHANGELOG sebagai Released saat deploy.</li>
        </ul>
      </UCard>
    </div>
  </PagePanel>
</template>
