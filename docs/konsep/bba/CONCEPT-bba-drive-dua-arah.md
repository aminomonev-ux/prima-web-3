# Konsep: Laporan BBA di Drive & PRIMA tetap selaras walau disunting bersamaan

> Status: **U2 DIKERJAKAN** (2026-11-28, lihat §9). U1, U3, U4, U5 menunggu keputusan pemilik (§7). Lanjutan
> `CONCEPT-bba-drive-balik.md` (§6A gabung tiga arah).
> Pertanyaan pemilik (2026-11-28): A menyunting di web PRIMA dan B menyunting berkas yang sama di Google Drive pada saat yang
> sama, di tempat berbeda. Bagaimana supaya kedua tempat ikut terbarui dan isinya tergabung, bukan saling menimpa? Kasus lain
> yang sejenis juga ditinjau.

## 1. Yang sudah aman hari ini (jangan dibongkar)

| Kejadian | Yang terjadi sekarang |
|---|---|
| B menyimpan di Drive, A menyimpan di PRIMA, baru cron jalan | Cron melihat md5 Drive ≠ kiriman terakhir → berkas **ditahan**, tidak ditimpa. Tinjauan menggabung tiga arah per sel (asal · Drive · PRIMA). |
| B menyunting salinan LAMA (Excel desktop / tab Sheets yang lama terbuka) | Asal = potret kiriman yang **paling cocok** dengan berkas B, jadi perubahan A sesudahnya tidak terbalik. |
| B menyimpan tepat saat cron menimpa | Cron memeriksa revisi sela sesudah menimpa; suntingan B yang tertimpa tetap bisa ditinjau dari riwayat revisi. |
| Sel sama diubah dua-duanya dengan nilai beda | **Benturan**, wajib dipilih manusia. Tidak ada "yang terakhir menang". |
| A menyimpan di PRIMA selagi tinjauan terbuka | Angka kunci basi → baris itu 409, pratinjau dihitung ulang. |
| Dua orang meninjau bersamaan | Kunci pengirim Drive; yang kedua dijawab "sibuk". |

Dasarnya sudah benar: **tidak ada penimpaan diam-diam**. Yang kurang adalah **kecepatan dan arah sebaliknya**, dijelaskan di §2.

## 2. Celah yang tersisa

1. **Selama ditahan, Drive membeku.** Sejak B menyimpan sampai ada yang menekan "Tinjau", kiriman ke berkas itu berhenti. Perubahan A
   di web tidak sampai ke Drive. Kalau tinjauan tertunda sehari, B terus menyunting angka yang sudah basi, dan benturan bertambah.
2. **A tidak tahu ada perubahan yang menunggu.** A membuka BBA-000012 di web, mengubah harga, dan tidak tahu B baru saja mengubah
   harga yang sama di Drive. Benturannya baru ketahuan saat tinjauan, padahal saat menyunting A bisa langsung memutuskan.
3. **Semua usulan menunggu manusia**, termasuk yang sama sekali tidak berbenturan (B mengisi Merk, A tidak menyentuh Merk). Semakin
   lama ditunda, semakin besar tumpukannya.
4. **Salinan lepas tidak terlihat.** Berkas diunduh, disunting offline, dikirim lewat WA atau email, atau disimpan sebagai Google
   Spreadsheet. Id berkasnya lain, jadi PRIMA tidak pernah melihatnya.
5. **Kolom hitungan dan kolom terkunci tetap bisa diketik di Drive.** Ketikan itu hanya diabaikan saat tinjauan. B baru tahu
   ketikannya tak berarti sesudah semuanya selesai.

## 3. Usulan

### U1. Berkas gabungan ditulis ke Drive walau masih ditahan ("rebase" berkas)

Saat ditahan, cron tidak berhenti mengirim. Ia menulis berkas **gabungan**:
- sel yang **tidak** diubah B = nilai PRIMA terbaru (perubahan A sampai ke Drive);
- sel yang diubah B dan **belum ditinjau** = tetap nilai B, diberi latar kuning dan catatan sel "menunggu ditinjau di PRIMA ·
  diubah B 14:05";
- baris baru buatan B tetap ada (tanpa jangkar), berlatar kuning juga;
- benturan (A dan B mengubah sel yang sama) = tetap nilai B + latar merah + catatan "di PRIMA: Rp 12.000.000 (A, 14:07)".

Hasilnya, kedua tempat melihat keadaan yang sama dan tidak ada ketikan yang hilang. Tinjauan hanya memutuskan sel kuning dan merah.

**Aturan yang menjaga U1 tetap benar**, dan menjadi syarat mutlak:
- Potret kiriman gabungan menyimpan, untuk sel yang menunggu, **asal LAMA milik B**, bukan nilai yang tertulis di berkas. Kalau asal
  sel itu ikut maju ke nilai B, sel kuning terbaca "tidak berubah" dan usulan B hilang tanpa jejak. Kalau asal maju ke nilai PRIMA,
  perubahan A berikutnya di sel itu tidak lagi terbaca sebagai benturan.
- Berkas gabungan adalah **kiriman PRIMA**: md5-nya dicatat sebagai milik PRIMA, tahanan dan daftar usulan tetap terbuka.
- B bisa saja menyimpan lagi dari tab yang masih memuat isi lama, sehingga berkas gabungan tertimpa. Kejadian itu sudah ditangani:
  md5 baru bukan milik PRIMA, asal dipilih dari potret yang paling cocok, dan isi gabungan tetap ada di riwayat revisi.
- Cron tidak menulis ulang bila isi gabungannya sama dengan kiriman terakhir (sidik), supaya tidak terjadi kiriman tanpa henti.

**Perlu dicoba dulu di kantor:** pada Google Sheets mode Office dan Excel yang tersinkron, apakah penimpaan berkas dari PRIMA selagi
B masih membukanya muncul di layar B, atau B justru menimpanya balik. Kalau B menimpanya balik, U1 tetap aman (lihat aturan di
atas), hanya kurang berguna.

### U2. Peringatan di web untuk baris yang punya perubahan Drive menunggu

Supaya cron bisa menandai baris, ia perlu tahu barisnya. Karena itu cron tidak lagi hanya membaca md5. Bila md5 berubah, cron
mengunduh berkas sekali (kecil, ± 15 KB), menghitung usulan dengan `gabungTigaArah` yang sama, lalu menyimpan ringkasannya
(jangkar → kolom yang diubah) di status berkas.

Di layar:
- Baris berlencana **"Diubah di Drive"** di tab Rencana, Pengadaan, dan Penawaran.
- Membuka item tersebut (ModalItem atau panel surat) menampilkan kotak:
  *"Harga di Drive: Rp 11.500.000 (B, 14:05), belum ditinjau."* **[Pakai nilai Drive]** **[Tetap nilai PRIMA]**
- Pilihan itu langsung menyelesaikan sel tersebut. Yang ditulis lewat jalur Simpan biasa, dengan pagar biasa. Tinjauan besar tidak
  lagi menanyakannya.
- Tanpa pilihan, A tetap bisa menyimpan. Sel itu lalu otomatis jadi **benturan** di tinjauan, tidak hilang.

Dengan U2, sebagian besar benturan diputuskan saat orangnya sedang memegang datanya.

### U3. Usulan yang tidak berbenturan boleh diterapkan otomatis (perlu keputusan pemilik)

Usulan Drive yang (a) tidak berbenturan, (b) kolomnya termasuk daftar "aman", dan (c) diubah oleh akun Google yang **terdaftar**
sebagai pengguna PRIMA dengan izin EDIT di bagian itu, diterapkan cron lewat jalur simpan biasa **atas nama pengguna itu**. Auditnya
menyebut "dari Drive, diterapkan otomatis".

- Daftar "aman" (usulan awal): Uraian, Merk/Tipe, Spesifikasi, Satuan, Alasan, isian Penawaran.
- Selalu manual: Keputusan (Didanai), Vol/Harga rencana yang sudah didanai, Tgl Pesan, penerimaan baru, barang baru di Master,
  dan semua baris baru (kemungkinan kembar ditanyakan).
- Akun Google yang tidak terdaftar = semua usulannya tetap manual.

Pemetaan akun Google ke pengguna PRIMA butuh satu kolom atau tabel baru (alamat email Google per pengguna). Drive memberi
`lastModifyingUser`; alamat emailnya perlu dicoba apakah terbaca dengan izin token sekarang. Yang sudah terbukti baru nama
tampilan dan `me`.

### U4. Kolom yang tidak boleh diketik dikunci di berkas

Lembar diberi proteksi Excel (`worksheet.protect`, sel isian dibuka). Kolom hitungan (No, Kode, Nilai, Tahap, Ref, Register,
Status) dan kolom Jangkar tidak bisa diketik. B langsung tahu sebelum menyimpan, dan jangkar tidak rusak karena tergeser.

Perlu dicoba: Google Sheets mode Office menghormati proteksi lembar .xlsx atau tidak. Excel desktop menghormatinya. Kalau Sheets
tidak menghormati, tidak ada ruginya, aturan "diabaikan" yang sekarang tetap berlaku.

### U5. "Unggah balik" untuk salinan lepas

Tombol di menu Cetak: **Unggah laporan yang disunting** (.xlsx). Mesinnya sama dengan tinjauan Drive: pemetaan kolom, jangkar,
gabung tiga arah, dan pratinjau yang menulis hanya lewat jalur simpan. Bedanya hanya sumber berkas.

Asal ditentukan dari **penanda kiriman** yang ditulis ke sel tersembunyi tiap unduhan dan kiriman Drive (kunci berkas + nomor
potret + sidik), pola penanda DPA BLUD. Tanpa penanda (unduhan lama), asal = potret yang paling cocok, dan pratinjau menyebutnya.

## 4. Kasus lain yang ikut ditinjau

| Kasus | Penanganan |
|---|---|
| Dua orang menyunting berkas Drive yang sama bersamaan | Drive menyusun satu rantai revisi. Tinjauan membaca revisi kepala, revisi sela tetap di riwayat. Tidak perlu aturan baru. |
| A mengubah status di PRIMA (dipesan/diterima) sementara B mengubah harga di Drive | Pagar jalur simpan menolak (referensi beku, Didanai tidak bisa dicabut). Dengan U2 hal ini terlihat lebih awal: lencananya berbunyi "tidak bisa diterapkan lagi". |
| Baris dihapus di PRIMA, diubah di Drive | Disebut, tidak bisa diterapkan (sudah). Di berkas gabungan U1, baris itu diberi latar abu-abu "sudah dihapus di PRIMA". |
| Tahun anggaran baru, berkas tahun lama masih disunting | Tiap tahun berkas sendiri (`rencana:{tahun}`), jadi aturannya sama. |
| Laptop server mati semalaman | Suntingan Drive menunggu cron berikutnya. Tidak ada yang hilang, hanya tertunda. Spanduk menyebut jam suntingan. |
| Revisi Drive terpangkas (± 30 hari) sebelum ditinjau | Sudah: memakai revisi terbaru dan menyebutnya. U1 dan U2 membuat tinjauan jarang tertunda selama itu. |
| Simpan sebagai Google Spreadsheet (berkas baru) | Tidak terlihat. Jalan keluarnya U5: unduh sebagai .xlsx lalu unggah balik. |
| Kolom tambahan buatan B | Sudah: ditampilkan "tidak ada di PRIMA". Di berkas gabungan U1, kolom itu tidak bisa dipertahankan (penyusun berkas menulis kolom tetap). Peringatannya tetap disebut. |

## 5. Yang sengaja tidak dipakai

- **"Yang terakhir menyimpan menang"**: jam dua tempat tidak sebanding, dan cara ini menghapus ketikan tanpa jejak.
- **Kunci sungguhan lintas tempat** (B mengunci baris di Drive): Drive tidak bisa ditanya kapan B sedang mengetik, dan berkas .xlsx
  tidak punya kunci per baris.
- **Google Sheets asli + Sheets API (sinkron dua arah langsung)**: berkasnya bukan lagi .xlsx, jalur Simpan PRIMA harus menulis ke
  Google, dan setiap gangguan jaringan menahan Simpan di web. Ini membalik keputusan revamp ("jalur Simpan BBA tidak pernah
  menyentuh Drive").
- **Penggabungan tingkat huruf (CRDT)**: satuan yang masuk akal di sini adalah sel, dan benturan sel memang harus diputuskan orang.

## 6. Urutan pengerjaan yang diusulkan

1. **U2 dulu.** Nilainya paling besar dan risikonya kecil: cron membaca isi dan menyimpan ringkasan, layar menampilkan lencana dan
   kotak pilihan. Nol tabel baru.
2. **U1.** Butuh aturan asal per sel di potret (§3 U1) dan uji khusus: sel menunggu tidak boleh "hilang", benturan tidak boleh
   melemah jadi usulan biasa.
3. **U4**, sesudah dicoba di Sheets.
4. **U5** (memakai mesin tinjauan apa adanya).
5. **U3** terakhir, hanya bila pemilik setuju, karena ia menulis tanpa orang menekan tombol.

## 7. Keputusan yang diperlukan dari pemilik

- **K1** U1: berkas gabungan ditulis ke Drive selama tinjauan tertunda (sel B berlatar kuning/merah). Ya / tidak.
- **K2** U3: penerapan otomatis usulan yang tidak berbenturan. Ya / tidak. Kalau ya, daftar kolom "aman" dan pemetaan akun Google ke
  pengguna PRIMA (siapa yang mengisi: Admin di Pusat Akses, atau pengguna sendiri di Profil).
- **K3** U4: lembar dikunci untuk kolom hitungan. Ya / tidak.
- **K4** U5: tombol unggah balik di Cetak. Ya / tidak.

## 8. Uji yang wajib (saat dikerjakan)

- Balapan web × Drive diputar deterministik pada Drive tiruan + MySQL kotak pasir: A menyimpan di sela "cron membaca" dan "cron
  menulis gabungan". Tidak ada sel yang hilang dan benturan tetap benturan.
- Sel menunggu bertahan melewati 3 kiriman gabungan berturut-turut sambil A mengubah sel lain.
- B menyimpan dari tab lama sesudah berkas gabungan ditulis → asal = potret yang paling cocok, perubahan A tidak terbalik.
- Uji mutasi pada aturan "asal sel menunggu tidak maju".
- Sekali di kantor dengan dua orang sungguhan (Sheets mode Office + web): U1 terlihat oleh B? Proteksi U4 dihormati?

## 9. Pelaksanaan U2 (2026-11-28)

- **Aturan murni** `lib/bba/drive-menunggu.ts`: `selisihDrive` (sel Drive ≠ asal, lewat `gabungTigaArah` yang SAMA dengan PRIMA
  "semu" = isi asal, jadi semua pagar tinjauan ikut — kolom hitungan, baris usulan terkunci, baris dihapus), `nilaiMenunggu`
  (dinilai terhadap PRIMA SEKARANG: sudah sama dengan Drive = selesai, PRIMA ke nilai lain = benturan), `bolehLepasOtomatis`,
  `saringTetap`.
- **Ringkasan** disusun cron SEKALI per revisi tahanan (berkas diunduh hanya bila revisinya baru) dan disimpan di
  `app_config` `bba_drive_menunggu:rencana:{tahun}` (`lib/data/bba-drive-menunggu.ts`, kunci bernama per berkas, nol migrasi).
  Ringkasan tidak bergantung PRIMA, jadi simpanan di web langsung terlihat tanpa menunggu cron.
- **Layar**: lencana "Diubah di Drive" / "Benturan Drive" di daftar Rencana, Pengadaan, Penawaran; kotak di ModalItem dan panel
  surat Penawaran (`_components/DriveMenunggu.tsx`). "Pakai nilai Drive" hanya mengisi form (L78), Simpan biasa yang menulis.
  "Tetap nilai PRIMA" = `POST drive-balik?step=tetap` (izin lembar pemilik kolom, sama dengan Terapkan; audit `BBA_DRIVE_BALIK`).
  Kolom kepala surat yang berulang di tiap baris barang digabung jadi satu baris (`gabungKembar`).
- **Tinjauan** tidak menanyakan sel yang sudah "tetap" di web untuk revisi yang sama, dan menyebut jumlahnya.
- **Lepas otomatis** (cron): bila tidak ada sel menunggu DAN berkas tidak membawa baris baru, catatan selain kolom hitungan, kolom
  asing/ragu, lembar hilang, atau ringkasan terpotong — di bawah kunci pengirim, revisi tahanan masih sama, md5 kepala berkas belum
  berubah. Ringkasan dibuang di ketiga jalur pelepasan (terapkan, abaikan, otomatis). Audit "DILEPAS OTOMATIS".
- **Bedanya dari §3 U2**: "tanpa pilihan, A tetap bisa menyimpan dan sel itu jadi benturan" — sudah begitu karena dinilai
  terhadap PRIMA sekarang. Kolom yang tidak ada di form (Keputusan, Tgl Pesan) hanya bisa ditolak di kotak; memakainya lewat
  tinjauan.

Regresi: `npx tsx --env-file=.env.local scripts/test-bba-drive-menunggu.mts` (35; bagian D MySQL kotak pasir 2064 + Drive
tiruan berrevisi).
