<script setup lang="ts">
// Halaman publik penghapusan akun. Janji (kontak, SLA, retensi) dibaca dari pengaturan
// agar halaman ini dan aplikasi tidak pernah berbeda.
definePageMeta({ layout: 'public' })
useSeoMeta({
  title: 'Penghapusan akun',
  description: 'Cara meminta penghapusan akun perusahaan dan data karyawan di HRIS Nexadream.'
})

interface SiteInfo {
  company: { name: string, email: string }
  privacy: { contact: string, deleteRequestSlaDays: number, auditRetentionDays: number, backupRetentionDays: number, financialRetentionYears: number }
}

const { data } = await useFetch<SiteInfo>('/api/public/site')
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <article class="prose prose-slate mx-auto max-w-2xl dark:prose-invert">
      <h1 class="text-3xl font-semibold">
        Penghapusan akun
      </h1>
      <p class="mt-4 text-muted">
        Pemilik perusahaan dapat meminta penghapusan akun {{ data?.company.name ?? 'HRIS Nexadream' }} beserta seluruh data perusahaan.
      </p>

      <h2 class="mt-8 text-xl font-semibold">
        Cara meminta
      </h2>
      <ol class="mt-3 list-decimal space-y-2 ps-5 text-sm">
        <li>Masuk sebagai pemilik perusahaan.</li>
        <li>Buka <strong>Pengaturan → Data &amp; akun</strong>.</li>
        <li>Unduh ekspor data bila Anda masih membutuhkannya, lalu kirim permintaan penghapusan.</li>
      </ol>
      <p class="mt-3 text-sm">
        Tidak bisa masuk? Kirim email ke
        <a
          :href="`mailto:${data?.privacy.contact}`"
          class="text-primary"
        >{{ data?.privacy.contact }}</a>
        dari alamat email pemilik akun.
      </p>

      <h2 class="mt-8 text-xl font-semibold">
        Apa yang terjadi setelahnya
      </h2>
      <ul class="mt-3 list-disc space-y-2 ps-5 text-sm">
        <li>Kami memproses permintaan dalam <strong>{{ data?.privacy.deleteRequestSlaDays ?? 30 }} hari</strong>.</li>
        <li>Data perusahaan, akun tim, dan data karyawan yang tidak wajib disimpan dihapus permanen, termasuk file yang diunggah.</li>
        <li>
          Catatan penggajian, pajak (PPh 21), BPJS, dan pembayaran yang wajib disimpan menurut peraturan disimpan terbatas
          dan terenkripsi selama sekitar <strong>{{ data?.privacy.financialRetentionYears ?? 10 }} tahun</strong>, lalu dihapus otomatis.
        </li>
        <li>Salinan cadangan terhapus dengan sendirinya dalam {{ data?.privacy.backupRetentionDays ?? 30 }} hari.</li>
      </ul>

      <h2 class="mt-8 text-xl font-semibold">
        Karyawan
      </h2>
      <p class="mt-3 text-sm">
        Data karyawan dikendalikan oleh perusahaan tempat Anda bekerja. Permintaan akses, koreksi, atau penghapusan data
        pribadi karyawan diajukan kepada bagian HR perusahaan tersebut sesuai UU Pelindungan Data Pribadi.
      </p>
    </article>
  </UContainer>
</template>
