-- Fase 9: konten situs publik awal (idempoten). Seed tidak berjalan di produksi, jadi halaman
-- CMS dan FAQ awal dikirim lewat migrasi. Semua dapat diubah di /admin/pages dan /admin/faq.
-- Token {{...}} diisi dari pengaturan saat halaman dibaca (server/utils/cms.ts → publicPage).
-- Waktu: (now() at time zone 'utc'), bukan now() polos (D17).

INSERT INTO "pages" ("id","slug","title","content","excerpt","metaTitle","metaDescription","isPublished","createdAt","updatedAt")
VALUES ('page-privacy','privacy','Kebijakan Privasi',
$html$<p><strong>Draf — perlu tinjauan hukum sebelum peluncuran.</strong></p>
<p>Kebijakan ini menjelaskan bagaimana {{COMPANY_NAME}} memproses data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).</p>
<h2>1. Peran para pihak</h2>
<ul>
<li><strong>Perusahaan pelanggan</strong> adalah pengendali data pribadi karyawannya. Perusahaan menentukan data apa yang dimasukkan dan untuk apa.</li>
<li><strong>{{COMPANY_NAME}}</strong> bertindak sebagai prosesor data karyawan atas nama perusahaan pelanggan.</li>
<li>Untuk data akun pemilik dan pengguna tim perusahaan (nama, email, telepon, data penagihan), {{COMPANY_NAME}} adalah pengendali data.</li>
</ul>
<h2>2. Data yang diproses</h2>
<ul>
<li>Identitas: nama, tanggal lahir, alamat, foto.</li>
<li>Nomor identitas: NIK, NPWP, nomor BPJS.</li>
<li>Data kepegawaian: jabatan, kontrak, kantor, atasan.</li>
<li>Data keuangan: gaji, tunjangan, potongan, nomor rekening bank.</li>
<li>Data absensi: waktu, lokasi saat absen, dan foto selfie bila fitur itu diaktifkan perusahaan.</li>
<li>Data keluarga untuk keperluan PTKP dan BPJS.</li>
</ul>
<h2>3. Tujuan pemrosesan</h2>
<p>Menyediakan layanan HR yang dipilih perusahaan: administrasi karyawan, absensi, cuti, lembur, penggajian, serta pelaporan PPh 21 dan BPJS. Kami tidak menjual data pribadi dan tidak memakainya untuk iklan.</p>
<h2>4. Keamanan</h2>
<p>Data sensitif (NIK, NPWP, rekening, gaji) dienkripsi saat disimpan dan disamarkan secara bawaan. Akses ke data tersebut dibatasi menurut peran dan setiap aksesnya dicatat. Akses staf {{COMPANY_NAME}} untuk dukungan bersifat sementara, beralasan, dan tercatat.</p>
<h2>5. Penyimpanan dan penghapusan</h2>
<ul>
<li>Permintaan penghapusan akun perusahaan diproses paling lambat {{DELETE_SLA_DAYS}} hari.</li>
<li>Catatan penggajian dan pajak dapat disimpan hingga {{FINANCIAL_RETENTION_YEARS}} tahun untuk memenuhi kewajiban hukum.</li>
<li>Cadangan dihapus bergulir setelah {{BACKUP_RETENTION_DAYS}} hari.</li>
</ul>
<p>Rincian ada di halaman <a href="/hapus-akun">Penghapusan akun</a>.</p>
<h2>6. Hak subjek data</h2>
<p>Karyawan berhak mengakses, memperbaiki, meminta penghapusan, dan menolak pemrosesan datanya. Karena perusahaan adalah pengendali, permintaan karyawan sebaiknya diajukan ke bagian HR perusahaannya; kami membantu perusahaan memenuhinya. Pemilik akun dapat menghubungi kami langsung.</p>
<h2>7. Insiden kebocoran data</h2>
<p>Bila terjadi kegagalan pelindungan data, kami memberi tahu perusahaan pelanggan yang terdampak tanpa penundaan yang tidak wajar agar perusahaan dapat memenuhi kewajiban pemberitahuannya menurut UU PDP.</p>
<h2>8. Kontak</h2>
<p>Pertanyaan tentang privasi: <a href="mailto:{{PRIVACY_CONTACT}}">{{PRIVACY_CONTACT}}</a>.</p>$html$,
'Bagaimana HRIS Nexadream memproses dan melindungi data pribadi sesuai UU PDP.',
NULL,'Cara HRIS Nexadream memproses dan melindungi data pribadi perusahaan dan karyawan sesuai UU PDP.',
true,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "pages" ("id","slug","title","content","excerpt","metaTitle","metaDescription","isPublished","createdAt","updatedAt")
VALUES ('page-terms','terms','Syarat & Ketentuan',
$html$<p><strong>Draf — perlu tinjauan hukum sebelum peluncuran.</strong></p>
<h2>1. Layanan</h2>
<p>{{COMPANY_NAME}} adalah aplikasi HR berbasis web untuk perusahaan. Langganan dimiliki dan dibayar oleh perusahaan; karyawan tidak dikenai biaya.</p>
<h2>2. Akun</h2>
<p>Pemilik perusahaan bertanggung jawab atas pengguna yang diundangnya dan atas kebenaran data yang dimasukkan.</p>
<h2>3. Uji coba dan langganan</h2>
<ul>
<li>Perusahaan baru mendapat masa uji coba sesuai yang tertera di halaman harga.</li>
<li>Setelah uji coba atau masa langganan berakhir tanpa pembayaran, perusahaan turun ke paket gratis setelah masa tenggang. Data tidak dihapus; fitur di luar paket gratis terkunci.</li>
<li>Harga dapat berubah dengan pemberitahuan; perubahan berlaku pada periode berikutnya.</li>
</ul>
<h2>4. Penggajian</h2>
<p>{{COMPANY_NAME}} menghitung dan mencatat penggajian serta menerbitkan slip gaji. Transfer gaji, setoran pajak, dan iuran BPJS tetap dilakukan perusahaan. Perusahaan tetap bertanggung jawab memeriksa hasil perhitungan sebelum dibayarkan.</p>
<h2>5. Pembatalan dan pengembalian dana</h2>
<p>Lihat <a href="/page/kebijakan-pembayaran">Kebijakan Pembayaran</a>.</p>
<h2>6. Data</h2>
<p>Pemrosesan data pribadi diatur dalam <a href="/privacy">Kebijakan Privasi</a>.</p>
<h2>7. Kontak</h2>
<p><a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a></p>$html$,
'Syarat penggunaan layanan HRIS Nexadream.',
NULL,'Syarat dan ketentuan penggunaan HRIS Nexadream: langganan, uji coba, pembatalan, dan tanggung jawab.',
true,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "pages" ("id","slug","title","content","excerpt","metaTitle","metaDescription","isPublished","createdAt","updatedAt")
VALUES ('page-payment-policy','kebijakan-pembayaran','Kebijakan Pembayaran',
$html$<p><strong>Draf — perlu tinjauan hukum dan keuangan sebelum peluncuran.</strong></p>
<h2>Cara membayar</h2>
<p>Langganan dibayar dari menu <strong>Langganan</strong> di konsol perusahaan melalui halaman pembayaran mitra kami. Metode yang tersedia ditampilkan di halaman pembayaran.</p>
<h2>Perpanjangan</h2>
<p>Langganan tidak diperpanjang otomatis. Kami mengirim pengingat sebelum masa aktif berakhir; perpanjang dengan membayar periode berikutnya.</p>
<h2>Masa tenggang</h2>
<p>Bila belum dibayar saat berakhir, perusahaan mendapat masa tenggang sebelum turun ke paket gratis. Data tidak dihapus.</p>
<h2>Pengembalian dana</h2>
<p>Pembayaran yang sudah berhasil pada umumnya tidak dapat dikembalikan. Bila terjadi tagihan ganda atau kesalahan sistem, hubungi <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a> dan kami akan menelaahnya.</p>$html$,
'Cara pembayaran, perpanjangan, dan pengembalian dana langganan.',
NULL,'Cara pembayaran, perpanjangan, masa tenggang, dan pengembalian dana langganan HRIS Nexadream.',
true,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "pages" ("id","slug","title","content","excerpt","metaTitle","metaDescription","isPublished","createdAt","updatedAt")
VALUES ('page-help','panduan','Panduan Memulai',
$html$<h2>1. Lengkapi data perusahaan</h2>
<p>Setelah mendaftar, ikuti wizard: nama badan hukum, NPWP perusahaan, dan kantor pertama beserta zona waktunya (WIB, WITA, atau WIT).</p>
<h2>2. Tambah kantor</h2>
<p>Buka <strong>Pengaturan → Kantor</strong> untuk menambah cabang. Setiap kantor bisa memiliki lokasi dan radius absensi sendiri.</p>
<h2>3. Masukkan karyawan</h2>
<p>Tambah karyawan satu per satu atau impor dari file Excel.</p>
<h2>4. Atur kebijakan cuti</h2>
<p>Tentukan jenis cuti dan jatah tahunan di pengaturan perusahaan.</p>
<h2>5. Jalankan payroll pertama</h2>
<p>Periksa komponen gaji, lalu jalankan payroll. PPh 21 dan BPJS dihitung otomatis; periksa hasilnya sebelum mentransfer gaji dari bank Anda.</p>
<h2>6. Undang karyawan</h2>
<p>Undang karyawan agar dapat absen dan melihat slip gajinya sendiri dari ponsel.</p>
<p>Butuh bantuan? <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a></p>$html$,
'Langkah awal memakai HRIS Nexadream.',
NULL,'Panduan memulai HRIS Nexadream: data perusahaan, kantor, karyawan, cuti, payroll pertama, dan undangan karyawan.',
true,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("slug") DO NOTHING;

-- FAQ awal: dilewati bila pertanyaan yang sama sudah ada.
INSERT INTO "faqs" ("id","question","answer","category","order","isActive","createdAt","updatedAt")
SELECT v.id, v.question, v.answer, v.category, v.ord, true, (now() at time zone 'utc'), (now() at time zone 'utc')
FROM (VALUES
  ('faq-what','Apa itu HRIS Nexadream?','Aplikasi HR berbasis web untuk perusahaan Indonesia: data karyawan, absensi, cuti dan lembur, penggajian dengan PPh 21 dan BPJS, serta layanan mandiri karyawan.','umum',0),
  ('faq-trial','Apakah ada uji coba gratis?','Ya. Perusahaan baru mendapat masa uji coba tanpa kartu kredit. Lamanya tertera di bagian harga.','umum',1),
  ('faq-tax','Apakah perhitungan PPh 21 dan BPJS sudah otomatis?','Ya. PPh 21 (metode TER) serta iuran BPJS Kesehatan dan Ketenagakerjaan dihitung otomatis dari komponen gaji. Hasilnya tetap bisa Anda periksa sebelum dibayarkan.','payroll',2),
  ('faq-transfer','Apakah HRIS Nexadream mentransfer gaji karyawan?','Tidak. Kami menghitung dan mencatat penggajian serta menerbitkan slip gaji. Transfer gaji, setoran pajak, dan iuran BPJS tetap dilakukan perusahaan.','payroll',3),
  ('faq-security','Apakah data karyawan aman?','Data sensitif seperti NIK, NPWP, rekening, dan gaji dienkripsi, disamarkan secara bawaan, dan setiap aksesnya tercatat, mengacu pada UU PDP.','keamanan',4),
  ('faq-branches','Bisa dipakai untuk lebih dari satu kantor atau zona waktu?','Bisa. Setiap kantor memiliki zona waktu sendiri (WIB, WITA, WIT), sehingga jam absensi tercatat sesuai lokasi. Jumlah kantor mengikuti paket.','umum',5),
  ('faq-employee-pay','Apakah karyawan perlu membayar?','Tidak. Langganan dibayar perusahaan; karyawan memakai layanan mandiri tanpa biaya.','tagihan',6),
  ('faq-excel','Bagaimana cara memindahkan data dari Excel?','Gunakan fitur impor karyawan dengan templat yang disediakan, atau hubungi kami untuk dibantu.','umum',7),
  ('faq-trial-end','Apa yang terjadi jika masa uji coba berakhir?','Bila tidak berlangganan, perusahaan otomatis pindah ke paket gratis. Data tetap aman; fitur di luar paket gratis terkunci sampai Anda berlangganan.','tagihan',8),
  ('faq-payment','Bagaimana cara membayar langganan?','Dari menu Langganan di konsol perusahaan. Metode yang tersedia ditampilkan di halaman pembayaran.','tagihan',9),
  ('faq-cancel','Bisakah saya berhenti berlangganan?','Bisa. Langganan tidak diperpanjang otomatis; bila tidak diperpanjang, perusahaan turun ke paket gratis setelah masa tenggang.','tagihan',10),
  ('faq-support','Bagaimana cara menghubungi dukungan?','Kirim pesan lewat formulir kontak di halaman ini atau email tim dukungan kami. Kami membalas di hari kerja.','umum',11)
) AS v(id, question, answer, category, ord)
WHERE NOT EXISTS (SELECT 1 FROM "faqs" f WHERE f."question" = v.question)
ON CONFLICT ("id") DO NOTHING;

-- Pengaturan baru: tautan sosial & Google Play (kosong = tidak tampil di footer).
INSERT INTO "app_settings" ("key","value","group","type","label","isSecret","createdAt","updatedAt") VALUES
  ('company.instagramUrl','','company','string','Instagram',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('company.linkedinUrl','','company','string','LinkedIn',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('company.facebookUrl','','company','string','Facebook',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('company.youtubeUrl','','company','string','YouTube',false,(now() at time zone 'utc'),(now() at time zone 'utc')),
  ('company.playStoreUrl','','company','string','Google Play',false,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("key") DO NOTHING;
