# Konsep: Perubahan laporan BBA di Google Drive dibawa balik ke PRIMA

Status: **DIKERJAKAN** (2026-11-27) dari konsep rev. 4 — jawaban pemilik atas §9 rev. 1 sudah masuk, perubahan bersamaan Drive &
PRIMA termasuk baris/barang baru dari dua sisi (§6A). Kode: `lib/bba/drive-balik.ts`, `lib/data/bba-drive-balik.ts`,
`app/api/buku-besar-aset/drive-balik`, `_components/TinjauDrive.tsx`; uji `scripts/test-bba-drive-balik.mts`. Bedanya dengan
teks di bawah: (a) "pengenal kolom memuat" diberi syarat panjang sebanding — tanpa itu kolom buatan pengguna "Catatan rapat"
terbaca sebagai Alasan; (b) sesudah tinjauan, kiriman berikutnya jalan SEGERA (`kirim_segera`), tidak menunggu 2 menit diam;
(c) lembar Penerimaan memisah "Yang Dibeli" jadi Merk / Tipe + Penyedia, lembar Penawaran mendapat Spesifikasi — supaya baris baru
bisa dibaca tanpa menebak pemisah. Perilaku Drive dicek (§8);
perilaku Drive sudah dicek (§8). Belum ada kode. Satu migrasi (`bba_drive_potret`).
Asal: diskusi pemilik sesudah revamp BBA Tahap 6 (`CONCEPT-bba-revamp-alur.md` §5B). PRIMA hidup di laptop kantor, jadi laporan
BBA dikirim ke Drive supaya bisa dibuka dari luar. Pemilik ingin orang bisa membetulkan **dan menambah** isi laporan langsung di
berkas Drive, lalu PRIMA **mendeteksi** perubahannya saat modul BBA dibuka, **menunjukkannya**, dan **baru menerapkannya kalau
disetujui**. Tidak pernah otomatis.

---

## 1. Keadaan sekarang (yang harus berubah)

- Salinan Drive **satu arah**. Cron `bba-drive` menimpa berkas begitu data BBA di PRIMA berubah (sidik bahan), jadi ketikan di
  Drive **hilang** pada kiriman berikutnya. Hanya riwayat versi Drive yang masih menyimpannya.
- Berkas yang dikirim: `rencana:{tahun}` ("BBA {tahun} — Rencana s.d. Pengadaan.xlsx": Ringkasan · Rencana · Pengadaan ·
  Penerimaan · Penawaran) dan `kib` (Buku Aset).
- Baris di lembar Penerimaan & Penawaran **tidak punya identitas** di berkas (tidak ada kolom id), jadi baris lama tidak bisa
  dibedakan dari baris yang diketik baru. Lembar Rencana punya Kode BBA, tapi Kode sama dipakai lintas tahun (salinan tahun lalu).

## 2. Alur yang dilihat pengguna

1. Orang di luar kantor membuka berkas di Drive, mengubah atau **menambah** baris di lembar mana pun, lalu menyimpan.
2. Cron berikutnya (≤ 5 menit, atau saat laptop menyala lagi) melihat berkas itu **berubah di luar PRIMA**. Cron hanya mencatat
   (tanpa membaca isi) dan **berhenti menimpa** berkas itu.
3. Siapa pun pemegang BBA yang membuka modulnya melihat spanduk kuning di atas halaman (lewat `BbaShell`):
   > **Laporan BBA 2026 di Google Drive diubah di luar PRIMA** oleh *Nama Akun Google* · 27 Nov 2026 14:05.
   > Salinan otomatis untuk berkas ini ditahan sampai perubahannya ditinjau. **[Tinjau perubahan]**
4. **Tinjau perubahan** membuka modal pratinjau (pola Impor KIB / Impor RKO), dikelompokkan per lembar:
   - **Pemetaan kolom** (§4) — tiap kolom berkas → kolom PRIMA, yang dikenal otomatis, yang tidak dikenal, dan pilihan untuk
     membetulkannya.
   - **Baris berubah**: kolom lama → baru, centang.
   - **Baris baru**: akan dibuat apa (rencana baru, penerimaan, item penawaran), centang.
   - **Tidak bisa diterapkan**: alasannya, tanpa centang.
5. **Terapkan (n)** menulis yang dicentang lewat jalur simpan yang sudah ada di tiap menu (semua pagar berlaku), atau
   **Abaikan perubahan Drive** (tidak ada yang ditulis). Tombol Terapkan hanya hidup untuk lembar yang izin EDIT-nya dipegang.
6. Sesudah Terapkan/Abaikan, tahanan dilepas; kiriman berikutnya menimpa berkas Drive dengan keadaan PRIMA. Yang tidak
   diterapkan dan kolom tambahan buatan pengguna ikut tertimpa, tapi masih ada di riwayat versi Drive. Dialog konfirmasi
   menyebut hal ini.

## 3. Deteksi (cron, bukan saat halaman dibuka)

- Saat mengunggah, simpan `md5Checksum` + `headRevisionId` hasil unggahan ke status berkas (`app_config.bba_drive_status`,
  JSON yang sudah ada; **tanpa migrasi**). Terbukti keduanya dipulangkan langsung oleh `files.create`/`files.update` (§8).
- Tiap putaran cron, untuk tiap berkas `rencana:*`: satu `files.get(fields: md5Checksum, headRevisionId, modifiedTime, trashed,
  lastModifyingUser(displayName, me))`. md5 ≠ yang terakhir PRIMA kirim → catat `luar = { revisi, md5, oleh, pada }` dan
  **lewati** kiriman berkas itu. Yang dibandingkan **md5 isi**, bukan nomor revisi: Drive membuat revisi baru walau isinya sama.
- Halaman BBA hanya **membaca** status dari DB — membuka BBA tidak pernah menunggu Google.
- "Kirim ke Drive sekarang" menolak berkas yang sedang ditahan ("tinjau perubahan Drive dulu").
- Berkas `kib` **tidak** ikut: perubahan KIB tempatnya di sistem provinsi, lalu masuk lewat Impor KIB.
- Lembar **Ringkasan** tidak dibaca: semua isinya hitungan.

## 4. Mengenali kolom (keputusan pemilik: pintar, judul boleh diubah)

- Satu daftar kolom per lembar, sama persis dengan yang ditulis `tulisBukuRencana` — penyusun berkas & pembaca berbagi daftar
  yang sama, jadi kolom baru di laporan otomatis bisa dibaca balik.
- Judul dikenali bertingkat (pola Impor RKO `lib/data/kinerja-import-rko.ts`):
  1. sama persis (sesudah huruf kecil, tanpa spasi/tanda baca);
  2. sinonim per kolom (mis. Harga: "harga", "harga satuan", "hrg sat", "harga/unit"; Vol: "vol", "volume", "jumlah", "qty");
  3. kemiripan kata (skor; yang skornya bersaing = **tidak** dipilih otomatis, ditanyakan).
- **Kolom baru buatan pengguna** yang tidak ada di PRIMA: tetap ditampilkan di panel pemetaan sebagai "tidak ada di PRIMA —
  diabaikan", dengan contoh isinya dan kalimat bahwa kolom itu hilang saat berkas dikirim ulang. Pengguna boleh memetakannya
  sendiri ke kolom PRIMA yang ia maksud.
- **Kolom hilang/dihapus** di berkas: dianggap "tidak diubah" — tidak pernah dibaca sebagai "dikosongkan".
- Pemetaan yang dibetulkan pengguna ikut dikirim saat Terapkan dan **diperiksa ulang server** (pola `peta` Impor RKO).

## 5. Identitas baris — kolom jangkar tersembunyi

Supaya baris lama, baris yang diubah, dan baris baru bisa dibedakan dengan pasti, tiap lembar yang bisa dibawa balik diberi kolom
**Jangkar** tersembunyi di ujung kanan berisi id PRIMA baris itu (rencana `buku_besar_aset.id`, penerimaan `bba_penerimaan.id`,
item `bba_penawaran_item.id`). Pola yang sama sudah dipakai dan terbukti di DPA BLUD (kolom Jangkar tersembunyi bertahan disunting
Excel). Baris **tanpa** jangkar = baris baru. Jangkar yang menunjuk data tahun/berkas lain atau yang sudah tidak ada = ditolak
dengan alasannya. Baris **dihapus** di berkas = hanya disebut, tidak pernah menghapus apa pun di PRIMA.

## 6. Yang bisa dibawa balik per lembar (keputusan pemilik: sesuai menu BBA, termasuk baris baru)

Aturan dasarnya: **pagar yang berlaku = pagar jalur simpan menu itu di PRIMA**, tidak lebih longgar dan tidak dibuat-buat lebih
ketat. Yang menolak adalah server lewat fungsi yang sama dengan tombol di layar.

| Lembar | Baris berubah | Baris baru | Ditulis lewat |
|---|---|---|---|
| **Rencana** | Uraian, Barang (cocok ke Master; barang baru hanya dengan centang sendiri — §6A), Jenis, Sumber, Vol, Satuan, Harga Satuan, Alasan, **Keputusan** | rencana baru (tahun berkas) | `updateAset` / `createAset`, lalu `tandaiAnggaran` |
| **Pengadaan** | Tgl Pesan (isi = dipesan, kosongkan = batal pesan) | — (rencana baru lewat lembar Rencana; disebut) | `ubahStatusProses` |
| **Penerimaan** | — PRIMA tidak punya "ubah penerimaan"; disebut: "hapus lalu catat ulang di PRIMA" | penerimaan baru untuk rencana ber-Kode (tgl, jumlah, harga, merk, penyedia, catatan) | `catatPenerimaan` |
| **Penawaran** | Nama di surat, Barang, Merk/Tipe, Satuan, Harga, kepala surat (rekanan, no., tgl, berlaku) | item baru → surat yang sama (rekanan + no. surat + tgl cocok) atau surat baru | `simpanPenawaran` |

**Keputusan** (keputusan pemilik): sel "Didanai" → Didanai, "Tidak didanai" → Tidak didanai, **kosong / "Belum diputuskan" →
Belum diputuskan**. Ditulis lewat `tandaiAnggaran`, jadi syarat Didanai (barang, jenis, ≥ 1 referensi berharga) dan "yang sudah
dipesan tidak bisa dicabut pendanaannya" tetap menolak, dengan alasannya. Konsekuensi yang disebut di pratinjau: mengosongkan sel
Keputusan baris yang sudah didanai = mengusulkan "kembali ke belum diputuskan". Ejaan lain ("danai", "ya", "tidak") dikenali lewat
sinonim; yang tidak dikenali = baris itu ditanyakan, bukan ditebak.

Kolom yang **selalu** hitungan dan tidak pernah dibaca sebagai perubahan: No, Kode, Nilai Rencana, Tahap, Ref, Nilai Didanai,
Vol/Nilai Diterima, Register, Status penawaran (berlaku/kedaluwarsa). Kalau isinya diubah, pratinjau menyebut "dihitung PRIMA —
perubahan diabaikan".

**Urutan terapkan** dalam satu tinjauan: Rencana (ubah/buat → keputusan) → Pengadaan → Penerimaan → Penawaran — supaya baris yang
baru dilengkapi bisa langsung diputuskan, dan yang baru didanai bisa dipesan.

## 6A. Perubahan bersamaan di Drive & PRIMA — digabung, dengan persetujuan (permintaan pemilik rev. 3)

Contoh: user A menyunting berkas di Drive, beberapa detik/menit kemudian user B menyimpan di PRIMA, lalu PRIMA mengirim ulang ke
Drive. Hasilnya harus **gabungan** keduanya, dan setiap benturan **ditanyakan**, tidak diputuskan diam-diam.

### Dasar: gabung tiga arah per sel

Untuk tiap sel yang boleh dibawa balik ada tiga nilai:
- **Asal** — isi yang PRIMA kirim dan yang dibuka A (potret kiriman, lihat di bawah);
- **Drive** — isi berkas sesudah A menyimpan;
- **PRIMA** — isi sekarang (sudah memuat simpanan B).

| Drive vs asal | PRIMA vs asal | Hasil |
|---|---|---|
| sama | sama / berubah | tidak ada usulan — nilai PRIMA dipakai (perubahan B aman) |
| berubah | sama | **usulan** dari Drive (dicentang) |
| berubah | berubah, nilainya sama | tidak ada usulan — keduanya sepakat |
| berubah | berubah, nilainya **beda** | **BENTURAN** — wajib dipilih |

Benturan tampil sebagai: *Harga BBA-000012 · asal Rp 10.000.000 · Drive (A, 14:05) Rp 11.500.000 · PRIMA (B, 14:07)
Rp 12.000.000* → **[Pakai Drive] [Pakai PRIMA]**. Tidak ada pilihan bawaan; tombol Terapkan mati sampai semua benturan dipilih
(ada pintasan "Pakai PRIMA untuk semua benturan"). Benturan di tingkat baris: baris yang **dihapus di PRIMA** tapi diubah di Drive
→ tidak bisa diterapkan, disebut; baris baru di kedua sisi tetap dua-duanya, tapi baris baru Drive yang **mirip** baris baru PRIMA
(barang + uraian/harga sama) tidak dicentang dan diberi peringatan "mungkin kembar dengan BBA-000045".

### Potret kiriman = "asal" yang benar

PRIMA menyimpan **potret** tiap kiriman: kolom yang bisa dibawa balik, per jangkar, per lembar (bukan berkas Excel-nya). Disimpan
di tabel baru `bba_drive_potret` (berkas, md5, revisi Drive, dikirim_pada, isi JSON) — `app_config.value` hanya TEXT 64 KB, tidak
cukup. Potret dipangkas sesudah tinjauan selesai (yang terakhir saja yang disimpan), paling banyak 20 per berkas.
Revisi Drive **tidak** dipakai sebagai penyimpan asal: dicek 2026-11-27, revisi bisa dikunci `keepForever` tetapi kuncinya **tidak
bisa dilepas lagi** dan jumlahnya dibatasi Drive — mengunci tiap kiriman cepat atau lambat memenuhi batas.

### Tiga urutan kejadian yang ditangani

1. **A menyimpan di Drive, lalu B menyimpan di PRIMA, baru cron berjalan.** Cron melihat md5 Drive ≠ md5 kiriman → menahan,
   tidak menimpa. Tinjauan menggabung tiga arah (asal = potret kiriman terakhir). Kasus paling umum.
2. **A menyunting salinan LAMA** (berkas dibuka/diunduh sebelum PRIMA mengirim versi berisi simpanan B, disimpan sesudahnya —
   mis. Excel desktop tersinkron, atau tab Sheets yang lama terbuka). Berkas A tidak memuat perubahan B, jadi tampak seolah A
   "mengembalikan" nilai B. Penangkalnya: asal untuk A = **potret kiriman yang paling cocok** dengan berkas A (paling banyak sel
   sama; seri → yang terbaru), bukan otomatis potret terakhir. Dengan asal itu, sel yang diubah B tapi tidak disentuh A terbaca
   "Drive sama dengan asal" → nilai B dipertahankan. Pratinjau menyebut: "berkas disunting dari salinan kiriman 14:02;
   perubahan PRIMA sesudahnya tetap dipakai".
3. **A menyimpan tepat saat cron sedang menimpa** (sesudah cron memeriksa md5, sebelum unggahan selesai). Sesudah tiap timpa,
   cron memeriksa daftar revisi di antara kiriman sebelumnya dan kiriman barusan: ada revisi yang md5-nya bukan salah satu kiriman
   PRIMA → itu suntingan A yang tertimpa. Dicek 2026-11-27: revisi sela itu memang terlihat di `revisions.list`. Cron mencatatnya
   sebagai `luar` (revisi A, bukan kepala berkas) dan menahan kiriman berikutnya; tinjauan membaca revisi A dari riwayat, jadi
   tidak ada yang hilang walau berkas di Drive sempat menampilkan versi PRIMA. Spanduk menyebut "suntingan A tertimpa kiriman
   otomatis pukul …, isinya masih bisa ditinjau".

Dua urutan lain cukup dengan pagar yang sudah ada: B menyimpan **selama** modal tinjauan terbuka → catatan itu 409 saat Terapkan,
pratinjau dimuat ulang dan penggabungan dihitung lagi; **dua peninjau** bersamaan → kunci per berkas (`blud_locks bba_drive_balik`),
yang kedua dijawab "sudah ditinjau oleh … pukul …".

### Baris & barang baru dari dua sisi (permintaan pemilik rev. 4)

A bisa menambah baris di Drive sementara B menambah catatan di PRIMA, di lembar yang sama. Tiga aturan menjaganya:

1. **Yang baru di PRIMA tidak pernah dibaca sebagai "dihapus di Drive".** Patokan "dihapus di Drive" = ada di potret asal tetapi
   tidak ada di berkas. Catatan yang lahir di PRIMA sesudah kiriman itu (id-nya tidak ada di potret asal) bukan dihapus — berkas
   A memang belum pernah memuatnya — jadi dibiarkan apa adanya, tanpa usulan apa pun.
2. **Yang ditulis selalu dari keadaan PRIMA SEKARANG + perubahan Drive, tidak pernah dari isi berkas utuh.** Ini wajib di
   Penawaran: `simpanPenawaran` mengganti **seluruh** item satu surat (item yang tidak dikirim dihapus). Kalau daftar item
   disusun dari berkas, item yang baru ditambahkan B di PRIMA ikut terhapus. Penyusunnya: item surat di PRIMA sekarang → terapkan
   perubahan sel yang disetujui → tambahkan item baru dari Drive yang dicentang. Angka kunci surat dari pratinjau (L77): B menyimpan
   surat itu lagi di sela pratinjau & Terapkan → 409, dihitung ulang.
3. **Kemungkinan kembar ditanyakan, bukan ditebak.** Baris baru dari Drive dibandingkan dengan SEMUA catatan PRIMA — yang lama
   maupun yang baru dibuat B:

   | Lembar | "Mungkin kembar" bila | Tampil |
   |---|---|---|
   | Rencana | tahun sama, barang sama (atau uraian sama tanpa beda huruf/spasi), vol & harga sama | tidak dicentang, berdampingan dengan BBA-xxxx yang mirip: **[Tambahkan juga] [Lewati — sudah ada]** |
   | Penerimaan | rencana sama, tanggal sama, jumlah sama | tidak dicentang — barang yang sama jangan tercatat dua kali; Σ melebihi volume tetap ditolak `catatPenerimaan` |
   | Penawaran | surat sama (rekanan + no. + tgl), nama barang sama, harga sama | tidak dicentang |
   | Surat penawaran baru | rekanan + no. surat + tgl sama dengan surat yang dibuat B | item digabung ke surat B itu, bukan surat kembar; disebut |

   Baris baru yang tidak mirip apa pun dicentang biasa.

**Barang baru** (nama di kolom Barang yang belum ada di Master): ditawarkan sebagai "buat barang baru 'X' di Master" — dicentang
sendiri, terpisah dari barisnya — lewat `barang_baru` yang sudah dipakai `createAset`/`updateAset`/`simpanPenawaran` (dibuat di
transaksi yang sama, L78). Sebelum itu dicocokkan ke Master tanpa beda huruf/spasi (`kunciNamaBarang`), jadi "laptop kantor" yang
diketik A memakai "Laptop Kantor" yang baru dibuat B, bukan barang kembar. Nama yang hanya **mirip** ("Laptp", "Laptop Kantor
Baru") ditanyakan: "maksudnya *Laptop Kantor*?" — tidak pernah dipilih otomatis. Barang baru yang tidak dicentang membuat baris
yang memakainya tetap tanpa barang (dan karena itu belum bisa didanai — disebut).

Urutan terapkan tetap §6, ditambah: barang baru lebih dulu, lalu baris yang memakainya.

### Peringatan sebelum menulis

Dialog konfirmasi Terapkan merangkum: "6 perubahan dari Drive, 2 benturan (1 pakai Drive, 1 pakai PRIMA), 3 nilai lama dari
salinan kiriman 14:02 tidak dipakai, 1 baris tidak bisa diterapkan. Sesudah ini salinan otomatis berlanjut dan berkas Drive
ditimpa hasil gabungan." Baru sesudah disetujui ada yang ditulis.

## 7. Terapkan

- `POST …/drive-balik?step=terapkan` membawa `{ kunci_berkas, revisi, peta, pilih: [{ lembar, jangkar | nomor_baris, versi }] }`.
  **Isi baris tidak dikirim dari layar**: server mengunduh **revisi yang sama** lagi (`revisions.get alt=media`, terbukti bisa —
  §8) dan menghitung ulang. Revisi di Drive sudah berganti sejak pratinjau → 409 `PRATINJAU_BASI`, pratinjau dimuat ulang.
- Tiap catatan lewat transaksi jalur simpan miliknya, dengan angka kunci dari pratinjau (L77). Yang diubah orang lain di PRIMA
  sejak pratinjau → **catatan itu ditolak** (409, disebut), yang lain tetap jalan. Semua-atau-tidak sengaja **tidak** dipakai.
- Hasil: "Rencana: 6 diubah, 2 dibuat · Pengadaan: 1 dipesan · Penerimaan: 1 dicatat · Penawaran: 3 item · 1 ditolak (…)".
- Izin per lembar = izin menunya (Rencana → EDIT Rencana; Pengadaan & Penerimaan → EDIT Pengadaan; Penawaran → EDIT Rencana
  ATAU Pengadaan). Sakelar BBA (`guard`), batas laju.
- Audit `BBA_DRIVE_BALIK`: berkas, revisi, akun Google pengubah (nama tampilan), pengguna PRIMA penerap, ringkasan per lembar,
  kode yang ditolak. Abaikan juga diaudit. Jalur simpan di dalamnya tetap menulis audit miliknya sendiri.

## 8. Hasil cek perilaku Drive (2026-11-27, Drive sungguhan, folder uji sudah dihapus)

| Dicek | Hasil |
|---|---|
| `md5Checksum` + `headRevisionId` saat unggah | ✅ dipulangkan langsung oleh `files.create` |
| Timpa isi berbeda | ✅ md5 & revisi berganti, `version` naik |
| Timpa isi **sama** | md5 **sama**, revisi **tetap berganti** → deteksi wajib memakai md5, bukan revisi |
| `lastModifyingUser` (nama + `me`) dengan izin token sekarang | ✅ terbaca; `me: true` untuk akun PRIMA — pengubah lain akan `me: false` |
| Daftar revisi + unduh revisi tertentu | ✅ `revisions.list` + `revisions.get alt=media` mengembalikan isi revisi itu |
| "Simpan sebagai Google Spreadsheet" (`files.copy` ke Sheets) | ✅ terbukti jadi **berkas baru** (id lain) — tidak terlihat PRIMA |
| Revisi sela (suntingan lain di antara dua kiriman PRIMA) terlihat di daftar revisi | ✅ terlihat, dikenali lewat md5 yang bukan kiriman PRIMA |
| Mengunci revisi (`keepForever`) | bisa dikunci, tapi **tidak bisa dilepas** (400) → tidak dipakai; asal disimpan di `bba_drive_potret` |

**Belum bisa dicek dari sini** (butuh orang lain menyunting lewat peramban/Excel): suntingan manusia di Google Sheets mode Office
atau Excel yang tersinkron — apakah tetap menimpa berkas .xlsx yang sama (id sama) dan bagaimana format angka/tanggal yang
ditulisnya. Perlu dicoba sekali di kantor (§10 langkah uji manual). Catatan lain: revisi berkas biner di Drive bisa dipangkas
(bawaan ± 30 hari / 100 revisi) — kalau revisi yang dicatat sudah hilang saat ditinjau, pratinjau memakai revisi terbaru dan
menyebutnya.

## 9. Server & data

| Bagian | Perubahan |
|---|---|
| `lib/services/drive.ts` | `metadataBerkasDrive`, `unduhRevisiDrive`; unggah/timpa memulangkan `md5Checksum` + `headRevisionId` |
| `lib/bba/drive-kirim.ts` (murni) | `StatusBerkasDrive` + `md5_terkirim`, `luar?`; `putuskanKirim` tidak mengirim bila `luar` ada |
| `lib/bba/laporan-excel.ts` | kolom Jangkar tersembunyi di Rencana/Pengadaan/Penerimaan/Penawaran; daftar kolom per lembar diekspor untuk pembaca |
| `lib/bba/drive-balik.ts` (murni, baru) | pemetaan kolom (persis → sinonim → skor), baca lembar → baris, pilih potret asal yang paling cocok, `gabungTigaArah` → usulan/benturan/nilai lama/baru/ditolak per lembar; satu aturan untuk pratinjau DAN terapkan |
| Tabel `bba_drive_potret` (baru) | potret kolom yang bisa dibawa balik per kiriman — mig `migration-bba-drive-potret.sql` |
| `lib/data/bba-drive-balik.ts` (baru) | pratinjau & terapkan — memanggil `updateAset`, `createAset`, `tandaiAnggaran`, `ubahStatusProses`, `catatPenerimaan`, `simpanPenawaran` |
| `lib/data/bba-laporan.ts` | cron: periksa metadata, tandai `luar`; lepas tahanan sesudah terapkan/abaikan |
| `app/api/buku-besar-aset/drive-balik/route.ts` (baru) | `GET` status · `POST ?step=pratinjau|terapkan|abaikan` |
| Layar | spanduk di `BbaShell`, modal `TinjauDrive.tsx` (panel pemetaan kolom + daftar per lembar) |
| Panduan | "sunting langsung berkas .xlsx, jangan Simpan sebagai Google Spreadsheet" |
| Migrasi | **satu**: `bba_drive_potret` (WAJIB dijalankan di server kantor sebelum kodenya dipasang) |

## 10. Uji yang direncanakan

- Murni: pemetaan kolom (persis, sinonim, judul diubah, skor bersaing → ditanyakan, kolom asing, kolom hilang), keputusan
  (Didanai/Tidak/kosong/ejaan lain), jangkar (lama, baru, asing, tahun lain), sel hitungan diabaikan, angka gaya Indonesia &
  Inggris, berkas berkop & polos, `putuskanKirim` dengan `luar`.
- MySQL kotak pasir + Drive tiruan: deteksi → tahan → pratinjau → terapkan sebagian (satu catatan basi) di keempat lembar →
  tahanan lepas → kiriman berikutnya menimpa; revisi berganti di tengah → 409; Abaikan; izin per lembar → 403.
- Gabung tiga arah: keempat baris tabel §6A, benturan tanpa pilihan → Terapkan ditolak server, salinan lama (asal = potret
  lebih tua, perubahan B tidak terbalik), revisi sela tertimpa cron → terbaca dari riwayat, baris dihapus di PRIMA, baris baru
  mirip → tidak dicentang, dua peninjau → 409.
- Baris baru dua sisi: rencana/penerimaan/item baru B tidak terbaca "dihapus"; item penawaran B **tetap ada** sesudah perubahan
  Drive pada surat yang sama diterapkan (uji wajib — `simpanPenawaran` mengganti seluruh item); kembar di keempat jenis; surat baru
  A = surat baru B → digabung; barang baru dengan/tanpa centang; nama barang beda huruf → memakai yang ada; nama mirip → ditanya.
- Uji mutasi untuk tiap pagar.
- **Uji manual di kantor (sekali, sebelum dipakai):** buka berkas di Drive dengan akun lain → ubah satu harga + tambah satu baris
  rencana di Google Sheets (mode Office, jangan "Simpan sebagai") → tunggu 5 menit → buka BBA → spanduk muncul, pratinjau
  menyebut dua perubahan itu, angka terbaca benar.
