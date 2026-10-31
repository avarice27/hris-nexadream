-- Halaman hukum final (Kebijakan Privasi, Syarat & Ketentuan, Kebijakan Pembayaran) berdasarkan aturan
-- resmi Indonesia (sumber: tasks/COMPLIANCE_REFERENCE.md). Hanya mengganti halaman yang masih berupa
-- draf awal ("Draf — …"); halaman yang sudah diubah staf di /admin/pages tidak disentuh.
-- Token {{...}} diisi dari pengaturan saat halaman dibaca (server/utils/cms.ts → PAGE_TOKENS).

UPDATE "pages" SET "content" = $html$<p>Berlaku sejak 1 November 2026.</p>
<p>Kebijakan Privasi ini menjelaskan bagaimana {{LEGAL_NAME}} ("kami"), penyelenggara layanan {{COMPANY_NAME}}, memproses data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi ("UU PDP"), Peraturan Pemerintah Nomor 71 Tahun 2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik, serta peraturan pelaksananya.</p>

<h2>1. Peran para pihak</h2>
<ul>
<li><strong>Perusahaan pelanggan adalah Pengendali Data Pribadi</strong> atas data karyawannya. Perusahaan menentukan data apa yang dimasukkan, untuk tujuan apa, dan siapa yang boleh mengaksesnya.</li>
<li><strong>Kami adalah Prosesor Data Pribadi</strong> atas data karyawan tersebut dan hanya memprosesnya atas perintah perusahaan pelanggan sebagaimana diatur dalam Syarat &amp; Ketentuan (Pasal 51 UU PDP).</li>
<li><strong>Kami adalah Pengendali Data Pribadi</strong> atas data akun pemilik dan pengguna tim perusahaan (nama, email, nomor HP, riwayat masuk) serta data penagihan langganan.</li>
</ul>

<h2>2. Data yang diproses</h2>
<ul>
<li><strong>Identitas dan kontak:</strong> nama, tempat dan tanggal lahir, jenis kelamin, agama, status perkawinan, alamat, email, nomor HP, foto.</li>
<li><strong>Nomor identitas:</strong> NIK, NPWP, nomor BPJS Kesehatan dan BPJS Ketenagakerjaan.</li>
<li><strong>Data kepegawaian:</strong> jabatan, departemen, kantor, atasan, kontrak, riwayat jabatan, penilaian kinerja, dokumen kepegawaian.</li>
<li><strong>Data keuangan:</strong> gaji, tunjangan, potongan, PPh 21, iuran BPJS, nomor rekening bank, klaim reimbursement.</li>
<li><strong>Data absensi:</strong> waktu masuk dan pulang, lokasi saat absen, serta foto selfie bila fitur itu diaktifkan perusahaan.</li>
<li><strong>Data keluarga:</strong> pasangan dan tanggungan untuk keperluan PTKP dan BPJS.</li>
<li><strong>Data teknis:</strong> alamat IP, jenis peramban, dan log aktivitas untuk keamanan.</li>
</ul>
<p>Data keuangan, data anak, dan data kesehatan (bila ada pada dokumen) termasuk <strong>data pribadi yang bersifat spesifik</strong> (Pasal 4 UU PDP) dan mendapat perlindungan tambahan sebagaimana dijelaskan di bagian 5.</p>

<h2>3. Dasar dan tujuan pemrosesan</h2>
<p>Pemrosesan dilakukan berdasarkan dasar yang sah menurut Pasal 20 UU PDP, yaitu:</p>
<ul>
<li><strong>pemenuhan kewajiban perjanjian</strong> — menyediakan layanan HR yang dipilih perusahaan: administrasi karyawan, absensi, cuti, lembur, reimbursement, penggajian, dan layanan mandiri karyawan;</li>
<li><strong>pemenuhan kewajiban hukum</strong> — perhitungan PPh 21, iuran BPJS, dan penyimpanan catatan keuangan dan perpajakan;</li>
<li><strong>kepentingan yang sah</strong> — keamanan sistem, pencegahan penipuan, dan dukungan pelanggan;</li>
<li><strong>persetujuan</strong> — untuk pemrosesan yang memerlukannya, misalnya foto selfie absensi; persetujuan dapat ditarik kembali.</li>
</ul>
<p>Kami tidak menjual data pribadi, tidak memakainya untuk iklan, dan tidak membuat keputusan yang semata-mata otomatis yang berdampak hukum bagi karyawan. Hasil perhitungan penggajian selalu ditinjau dan disetujui perusahaan.</p>

<h2>4. Pihak yang menerima data</h2>
<ul>
<li>Penyedia infrastruktur yang memproses data atas nama kami: hosting aplikasi (Vercel), basis data (Neon), penyimpanan berkas (Vercel Blob), dan pengiriman email.</li>
<li>Mitra pembayaran untuk memproses pembayaran langganan (tidak termasuk data karyawan).</li>
<li>Instansi berwenang bila diwajibkan peraturan perundang-undangan.</li>
</ul>
<p>Sebagian penyedia infrastruktur menyimpan data di luar wilayah Indonesia (antara lain Singapura). Transfer tersebut dilakukan sesuai Pasal 56 UU PDP dengan memastikan tingkat pelindungan yang setara atau lebih tinggi dan perlindungan kontraktual yang mengikat.</p>

<h2>5. Keamanan</h2>
<ul>
<li>NIK, NPWP, nomor BPJS, rekening bank, gaji, dan data keluarga dienkripsi saat disimpan dan disamarkan secara bawaan.</li>
<li>Akses dibatasi menurut peran (pemilik, Admin HR, atasan, karyawan) dan setiap pembacaan data sensitif dicatat.</li>
<li>Dokumen dan foto disimpan sebagai berkas privat dan hanya dapat dibuka melalui tautan berumur pendek.</li>
<li>Akses staf kami untuk dukungan bersifat sementara, beralasan, dan tercatat.</li>
<li>Koneksi selalu terenkripsi (HTTPS).</li>
</ul>

<h2>6. Penyimpanan dan penghapusan</h2>
<ul>
<li>Data diproses selama perusahaan berlangganan dan selama diperlukan untuk tujuan di atas (Pasal 43–44 UU PDP).</li>
<li>Catatan penggajian dan perpajakan disimpan {{FINANCIAL_RETENTION_YEARS}} tahun sesuai Pasal 28 ayat (11) UU Ketentuan Umum dan Tata Cara Perpajakan dan Pasal 11 UU Nomor 8 Tahun 1997 tentang Dokumen Perusahaan.</li>
<li>Permintaan penghapusan akun perusahaan diproses paling lambat {{DELETE_SLA_DAYS}} hari. Data operasional dihapus; catatan yang wajib disimpan menurut hukum dipertahankan sampai masa simpannya berakhir lalu dihapus.</li>
<li>Data mantan karyawan dianonimkan setelah masa simpan wajib berakhir.</li>
<li>Cadangan dihapus bergulir setelah {{BACKUP_RETENTION_DAYS}} hari.</li>
</ul>
<p>Rincian ada di halaman <a href="/hapus-akun">Penghapusan akun</a>.</p>

<h2>7. Hak subjek data</h2>
<p>Sesuai Pasal 5–13 UU PDP, Anda berhak untuk:</p>
<ul>
<li>mendapatkan informasi tentang pemrosesan data pribadi Anda;</li>
<li>melengkapi, memperbarui, dan memperbaiki data yang tidak akurat;</li>
<li>mengakses dan memperoleh salinan data pribadi Anda;</li>
<li>mengakhiri pemrosesan, menghapus, atau memusnahkan data pribadi Anda;</li>
<li>menarik kembali persetujuan yang telah diberikan;</li>
<li>keberatan atas keputusan yang semata-mata didasarkan pada pemrosesan otomatis;</li>
<li>menunda atau membatasi pemrosesan;</li>
<li>memperoleh dan/atau menggunakan data pribadi Anda dalam format yang umum dan dapat dibaca sistem elektronik;</li>
<li>menggugat dan menerima ganti rugi atas pelanggaran pemrosesan data pribadi Anda.</li>
</ul>
<p>Karena perusahaan adalah pengendali data karyawan, karyawan mengajukan permintaan ke bagian HR perusahaannya; kami membantu perusahaan memenuhinya. Karyawan juga dapat melihat sebagian datanya sendiri di menu layanan mandiri. Pemilik dan pengguna tim dapat menghubungi kami langsung. Hak tertentu dapat dibatasi bila bertentangan dengan kewajiban hukum, misalnya kewajiban menyimpan catatan pajak.</p>

<h2>8. Kegagalan pelindungan data</h2>
<p>Bila terjadi kegagalan pelindungan data pribadi, kami memberi tahu perusahaan pelanggan yang terdampak tanpa penundaan sehingga pemberitahuan tertulis kepada subjek data dan lembaga yang berwenang dapat dilakukan paling lambat 3 x 24 jam sesuai Pasal 46 UU PDP. Pemberitahuan memuat data yang terungkap, kapan dan bagaimana terjadinya, serta upaya penanganan dan pemulihan.</p>

<h2>9. Pejabat pelindungan data</h2>
<p>Pertanyaan, permintaan, atau keluhan tentang data pribadi dapat disampaikan kepada pejabat pelindungan data kami: <a href="mailto:{{PRIVACY_CONTACT}}">{{PRIVACY_CONTACT}}</a>. Kami menanggapi paling lambat 3 x 24 jam sejak permintaan diterima, kecuali ditentukan lain oleh peraturan.</p>

<h2>10. Perubahan kebijakan</h2>
<p>Perubahan material diumumkan melalui email kepada pemilik akun dan di aplikasi paling lambat 14 hari sebelum berlaku. Tanggal berlaku tercantum di bagian atas halaman ini.</p>$html$,
"updatedAt" = (now() at time zone 'utc')
WHERE "slug" = 'privacy' AND "content" LIKE '<p><strong>Draf%';

UPDATE "pages" SET "content" = $html$<p>Berlaku sejak 1 November 2026.</p>
<p>Syarat &amp; Ketentuan ini ("Syarat") mengatur penggunaan layanan {{COMPANY_NAME}} yang diselenggarakan oleh {{LEGAL_NAME}} ("kami"). Dengan mendaftar atau menggunakan layanan, perusahaan Anda ("Pelanggan") menyetujui Syarat ini. Syarat ini dibuat dalam Bahasa Indonesia sesuai Pasal 31 Undang-Undang Nomor 24 Tahun 2009; bila tersedia terjemahan, versi Bahasa Indonesia yang berlaku.</p>

<h2>1. Layanan</h2>
<p>{{COMPANY_NAME}} adalah aplikasi sumber daya manusia berbasis web untuk perusahaan: data karyawan, absensi, cuti, lembur, reimbursement, penggajian (PPh 21 dan BPJS), dan layanan mandiri karyawan. Fitur dan batas pemakaian ditentukan oleh paket langganan yang dipilih.</p>

<h2>2. Akun dan pengguna</h2>
<ul>
<li>Pemilik akun mewakili Pelanggan dan berwenang menyetujui Syarat ini atas nama Pelanggan.</li>
<li>Pelanggan bertanggung jawab atas pengguna yang diundangnya, atas peran yang diberikan, dan atas kebenaran data yang dimasukkan.</li>
<li>Pengguna wajib menjaga kerahasiaan kata sandi dan segera memberi tahu kami bila terjadi akses tanpa izin.</li>
</ul>

<h2>3. Langganan, uji coba, dan harga</h2>
<ul>
<li>Langganan dimiliki dan dibayar oleh Pelanggan; karyawan tidak dikenai biaya.</li>
<li>Perusahaan baru mendapat masa uji coba sesuai yang tertera di halaman harga.</li>
<li>Langganan tidak diperpanjang otomatis. Bila masa aktif berakhir tanpa pembayaran, Pelanggan turun ke paket gratis setelah masa tenggang. Data tidak dihapus; fitur di luar paket gratis terkunci sampai Pelanggan berlangganan kembali.</li>
<li>Perubahan harga diumumkan paling lambat 30 hari sebelumnya dan hanya berlaku untuk periode yang dibayar sesudah tanggal berlakunya.</li>
<li>Ketentuan pembayaran, pajak, dan pengembalian dana diatur dalam <a href="/page/kebijakan-pembayaran">Kebijakan Pembayaran</a>.</li>
</ul>

<h2>4. Penggajian dan kepatuhan</h2>
<p>Kami menghitung dan mencatat penggajian serta menerbitkan slip gaji berdasarkan data dan pengaturan yang dimasukkan Pelanggan dan tarif resmi yang berlaku. Kami tidak memindahkan dana gaji, tidak menyetor pajak, dan tidak membayar iuran BPJS; seluruhnya tetap dilakukan Pelanggan. Pelanggan wajib memeriksa dan menyetujui hasil perhitungan sebelum dibayarkan atau dilaporkan. Bila terdapat kesalahan perhitungan yang disebabkan oleh sistem kami, kami memperbaikinya tanpa biaya dan bertanggung jawab sesuai bagian 8.</p>

<h2>5. Data pribadi</h2>
<ul>
<li>Pelanggan adalah Pengendali Data Pribadi atas data karyawannya dan menjamin memiliki dasar pemrosesan yang sah menurut UU Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.</li>
<li>Kami bertindak sebagai Prosesor Data Pribadi dan hanya memproses data karyawan untuk menyediakan layanan atas perintah Pelanggan, menjaga kerahasiaannya, menerapkan pengamanan yang layak, membantu Pelanggan memenuhi permintaan subjek data, dan memberi tahu Pelanggan tanpa penundaan bila terjadi kegagalan pelindungan data.</li>
<li>Rincian pemrosesan ada di <a href="/privacy">Kebijakan Privasi</a>.</li>
<li>Pelanggan dapat mengekspor datanya kapan saja selama akun aktif.</li>
</ul>

<h2>6. Penggunaan yang dilarang</h2>
<p>Pelanggan dilarang memakai layanan untuk melanggar hukum, memasukkan data tanpa dasar yang sah, mencoba mengakses data perusahaan lain, mengganggu keamanan atau ketersediaan sistem, atau menjual kembali layanan tanpa perjanjian tertulis. Kami dapat menangguhkan akun yang melanggar setelah pemberitahuan, kecuali bila penangguhan segera diperlukan untuk mencegah kerugian.</p>

<h2>7. Ketersediaan dan perubahan layanan</h2>
<p>Kami berupaya menjaga layanan tersedia setiap saat, kecuali pemeliharaan terjadwal yang diumumkan sebelumnya atau keadaan di luar kendali wajar kami. Kami dapat menambah atau mengubah fitur; fitur berbayar yang sedang dipakai tidak dihapus selama periode yang sudah dibayar.</p>

<h2>8. Tanggung jawab</h2>
<p>Kami bertanggung jawab atas kerugian langsung yang timbul akibat kelalaian atau kesalahan kami dalam menyediakan layanan, dengan batas setinggi-tingginya jumlah biaya langganan yang dibayar Pelanggan dalam 12 bulan terakhir, kecuali untuk kerugian yang timbul dari kesengajaan atau kelalaian berat atau yang menurut hukum tidak dapat dibatasi. Kami tidak bertanggung jawab atas kerugian yang timbul dari data tidak benar yang dimasukkan Pelanggan atau dari hasil perhitungan yang disetujui Pelanggan tanpa diperiksa.</p>

<h2>9. Pengakhiran</h2>
<p>Pelanggan dapat berhenti berlangganan kapan saja dan dapat mengajukan penghapusan akun dari menu pengaturan. Penghapusan data mengikuti <a href="/privacy">Kebijakan Privasi</a> dan halaman <a href="/hapus-akun">Penghapusan akun</a>.</p>

<h2>10. Perubahan Syarat</h2>
<p>Perubahan material diberitahukan melalui email kepada pemilik akun dan di aplikasi paling lambat 14 hari sebelum berlaku. Bila Pelanggan tidak menyetujui perubahan, Pelanggan dapat berhenti berlangganan sebelum tanggal berlaku dan meminta pengembalian dana secara proporsional untuk sisa periode yang sudah dibayar.</p>

<h2>11. Hukum yang berlaku dan penyelesaian sengketa</h2>
<p>Syarat ini tunduk pada hukum Republik Indonesia. Sengketa diselesaikan terlebih dahulu secara musyawarah dalam 30 hari. Bila tidak tercapai kesepakatan, sengketa diselesaikan melalui Pengadilan Negeri yang berwenang, tanpa mengurangi hak konsumen untuk menempuh penyelesaian melalui Badan Penyelesaian Sengketa Konsumen sesuai UU Nomor 8 Tahun 1999.</p>

<h2>12. Kontak</h2>
<p><a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a></p>$html$,
"updatedAt" = (now() at time zone 'utc')
WHERE "slug" = 'terms' AND "content" LIKE '<p><strong>Draf%';

UPDATE "pages" SET "content" = $html$<p>Berlaku sejak 1 November 2026.</p>

<h2>1. Harga dan pajak</h2>
<ul>
<li>Harga langganan tercantum di halaman harga dalam Rupiah dan <strong>sudah termasuk Pajak Pertambahan Nilai (PPN)</strong> yang berlaku.</li>
<li>Sesuai PMK Nomor 131 Tahun 2024, PPN dihitung 12% dari Dasar Pengenaan Pajak berupa nilai lain sebesar 11/12 dari harga sebelum pajak (setara 11% dari harga sebelum pajak). Rinciannya tercantum di invoice.</li>
<li>Setiap pembayaran yang berhasil menerbitkan invoice dan bukti pembayaran yang dapat diunduh dari menu <strong>Langganan</strong>. Faktur Pajak diterbitkan melalui sistem Coretax Direktorat Jenderal Pajak untuk Pelanggan yang mencantumkan NPWP perusahaan.</li>
</ul>

<h2>2. Cara membayar</h2>
<p>Langganan dibayar dari menu <strong>Langganan</strong> di konsol perusahaan melalui halaman pembayaran mitra kami. Metode yang tersedia ditampilkan di halaman pembayaran. Kami tidak menyimpan data kartu atau rekening Pelanggan.</p>

<h2>3. Perpanjangan</h2>
<p>Langganan tidak diperpanjang otomatis dan tidak ada penagihan berulang tanpa persetujuan Pelanggan. Kami mengirim pengingat sebelum masa aktif berakhir; perpanjang dengan membayar periode berikutnya.</p>

<h2>4. Masa tenggang</h2>
<p>Bila belum dibayar saat berakhir, Pelanggan mendapat masa tenggang sebelum turun ke paket gratis. Data tidak dihapus dan dapat dipakai kembali penuh setelah pembayaran.</p>

<h2>5. Pengembalian dana</h2>
<p>Pelanggan berhak atas pengembalian dana untuk:</p>
<ul>
<li>tagihan ganda atau pembayaran yang terdebit lebih dari sekali (penuh);</li>
<li>pembayaran yang berhasil tetapi langganan tidak aktif karena kesalahan sistem kami dan tidak kami perbaiki dalam 2 x 24 jam (penuh);</li>
<li>gangguan layanan yang disebabkan kami dan berlangsung lebih dari 7 hari berturut-turut (proporsional untuk sisa periode);</li>
<li>perubahan Syarat yang tidak disetujui Pelanggan (proporsional untuk sisa periode; lihat Syarat &amp; Ketentuan bagian 10).</li>
</ul>
<p>Di luar keadaan tersebut, periode yang sudah berjalan tidak dikembalikan, tetapi langganan tetap aktif sampai akhir periode yang dibayar. Ajukan permintaan ke <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a> dengan nomor invoice. Kami menanggapi dalam 3 hari kerja dan mengembalikan dana yang disetujui paling lambat 14 hari kerja ke metode pembayaran semula atau rekening atas nama Pelanggan.</p>

<h2>6. Bea meterai</h2>
<p>Bukti pembayaran dengan nilai di atas Rp5.000.000, termasuk dokumen elektronik, dikenai bea meterai Rp10.000 menurut UU Nomor 10 Tahun 2020. e-Meterai dapat dibubuhkan atas permintaan Pelanggan.</p>

<h2>7. Kontak</h2>
<p>Pertanyaan tentang tagihan: <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a>.</p>$html$,
"updatedAt" = (now() at time zone 'utc')
WHERE "slug" = 'kebijakan-pembayaran' AND "content" LIKE '<p><strong>Draf%';
