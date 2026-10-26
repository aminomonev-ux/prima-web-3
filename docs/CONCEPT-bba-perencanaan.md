# CONCEPT — Buku Besar Aset untuk perencanaan: referensi harga, bukti dukung, per barang, kondisi eksisting

> Status: **Tahap 1 dieksekusi 2026-10-22** (catatan eksekusi → §4.7); **Tahap 2 dieksekusi 2026-10-26** (→ §5.6); Tahap 3 masih konsep. Keputusan terbuka → §9. Desain layar dipilih pemilik 2026-10-22 → §4.4.
> Lingkup: **internal untuk perencanaan.** Pembukuan Barang Milik Daerah tetap di aplikasi BMD resmi RS; PRIMA tidak menyainginya (§8).
> Konsep awal BBA (`docs/session/buku-besar-aset/CONCEPT.md`) tidak ikut ter-copas ke workspace ini; acuan yang dipakai di sini: kode + `docs/schema-mysql.sql`.

## 1. Masalah

BBA sekarang = daftar rencana belanja modal per tahun + realisasinya dalam angka (`buku_besar_aset`: uraian, vol × harga, unit & nilai realisasi, tanggal, status). Yang diminta pemilik:

1. Tiap item punya **3 referensi harga** — tautan alat dari e-Katalog INAPROC, Shopee, dsb. — berupa **tautan dan berkas** sekaligus.
2. **Bukti dukung pembelian** diunggah (faktur/kuitansi, BAST, foto).
3. Saat merencanakan, terlihat **kondisi eksisting** barang itu, **sudah pernah dibeli atau belum (berapa)**, dan **berapa yang sedang diproses**.

## 2. Temuan dari kode

| # | Temuan | Akibat |
|---|---|---|
| T1 | `usulan_items` **sudah punya** `url_merk1`–`url_merk3` (+ `file_url`), divalidasi `optUrl` dan dirender lewat `isSafeHttpUrl` (`lib/shared/url.ts`). | "3 url" sudah diisi pengusul sejak Usulan. |
| T2 | `candidateQuery` di `lib/data/buku-besar-aset.ts` (Tarik dari Usulan) **tidak memilih** `url_merk*` maupun `file_url`. | Tautan itu **hilang** begitu item masuk BBA. |
| T3 | `canonical_id` (`BBA-000123`) lahir per BARIS dari AUTO_INCREMENT; uraian teks bebas ("nama — spesifikasi"). | BBA tidak bisa menjawab "barang ini pernah dibeli belum" — "Laptop i5 14 inci" dan "Laptop Core i5" tidak dikenali sebagai barang yang sama. |
| T4 | `/api/upload` (Drive privat + `uploaded_files`) sudah ada; `MODUL_PENGUNGGAH = ['lkjip','usulan_aset']`. | Jalur unggah bisa dipakai ulang, tinggal mendaftarkan BBA. |
| T5 | `/api/upload/download` mengizinkan: admin tier, pengunggah, atau BIDANG atas sub-bidangnya — aturan **Usulan**. | Staf non-admin yang diberi `app_access` BBA **tidak bisa membuka bukti yang diunggah rekannya**, padahal BBA modul kolaboratif (semua pemegang akses boleh menyunting semua baris). |
| T6 | Status hanya `DIRENCANAKAN / REALISASI_PENUH / REALISASI_SEBAGIAN / TIDAK_TEREALISASI`. | "Sedang diproses berapa" (sudah dipesan, barang belum datang) tidak bisa dijawab. |
| T7 | Kolom `dpa_row_id` / `dpa_versi_tanggal` ada di tabel, **tidak dipakai** satu baris kode pun. | Di luar lingkup; dicatat saja (§8). |
| T8 | Item asal Usulan: uraian/vol/harga **terkunci**; form tidak mengirim `status` untuk baris USULAN. Status baris USULAN hanya berubah lewat modal Realisasi. | Status baru (§5.2) harus bisa dipasang dari modal Realisasi, bukan dari form item. |

## 3. Gambaran akhir

BBA tetap SATU modul, dikembangkan jadi tiga lapis:

1. **Rencana** — tiap item punya referensi harga (target 3).
2. **Proses & Realisasi** — status "Dalam Proses", bukti pembelian.
3. **Per Barang** — eksisting + riwayat beli + sedang diproses, tampil sekaligus; juga di form saat item direncanakan.

Dikerjakan **3 tahap**, masing-masing bisa dipasang sendiri:

| Tahap | Isi | Bergantung pada |
|---|---|---|
| 1 | Referensi harga + bukti dukung + aturan unduh BBA | — |
| 2 | Master Barang + status Dalam Proses + tampilan Per Barang | — (Tahap 1 tidak wajib, tapi riwayat harga memakainya) |
| 3 | Kondisi eksisting per barang × lokasi | Tahap 2 (kuncinya barang) |

## 4. Tahap 1 — Referensi harga & bukti dukung

### 4.1 Referensi harga (per item BBA)

**Isian per referensi:** sumber · nama penyedia/toko · tautan · harga satuan · tanggal dicek · tangkapan layar (opsional).

- `sumber`: `EKATALOG` (e-Katalog INAPROC/LKPP) · `TOKO_DARING` (Shopee, Tokopedia, Lazada, Blibli, Bukalapak) · `TOKO_LURING` (toko/penyedia tanpa tautan) · `LAINNYA`. Ditebak dari domain tautan saat ditempel (`tebakSumber`, fungsi murni — SATU tempat), tetap bisa diganti.
- **Tautan + berkas, dua-duanya**: tautan e-Katalog/Shopee bisa mati dan harganya berubah; tangkapan layar membekukan bukti harga pada hari survei. Referensi toko luring boleh tanpa tautan asal ada berkas (nota/penawaran).
- **Target 3, bukan syarat simpan** (default keputusan #3): kurang dari 3 → penanda "Ref 2/3", tidak memblokir.
- **Referensi sah** = ada harga > 0 DAN (tautan ATAU berkas). Yang dihitung di "Ref n/3" hanya yang sah.
- Ringkasan di form: **terendah / rata-rata / tertinggi** dari referensi sah (angka JetBrains Mono). Harga rencana di atas tertinggi → tanda "di atas referensi tertinggi (selisih Rp x)" — lunak.
- Item **MANUAL**: tombol "Pakai terendah" / "Pakai rata-rata" **mengisi field harga di form** — yang menyimpan tetap tombol Simpan (L78).
- Item **USULAN**: harga terkunci (keputusan Usulan) → referensi hanya pembanding, tombol "Pakai …" tidak ditawarkan.
- Batas: ≤ 10 referensi per item (Zod).

**Tautan dari Usulan (menutup T2) — SATU aturan, tanpa backfill:**
> Selama item belum punya referensi tersimpan, slot referensi di form **diisi dari `url_merk1–3` usulannya** (tautan + `tebakSumber`, harga kosong, label "dari usulan"). Begitu Simpan, yang tersimpan yang berlaku.

- Berlaku sama untuk item yang SUDAH ditarik maupun yang ditarik nanti → Tarik dari Usulan **tidak diubah**, tidak ada migrasi pengisi, tidak ada dua jalur yang bisa berbeda pendapat. Harga per tautan memang harus diketik orang, jadi form toh harus dibuka.
- Di daftar, item USULAN tanpa referensi tersimpan tapi punya tautan usulan tampil "3 tautan dari usulan" (bukan "Ref 0/3"), dihitung lewat JOIN ke `usulan_items` di kueri daftar.
- `file_url` usulan ditampilkan sebagai tautan baca-saja "Lampiran usulan" di panel bukti (tidak disalin; aksesnya tetap aturan berkas Usulan).

**Penyimpanan:** ikut tombol Simpan form item, di transaksi yang SAMA dengan baris item (`withTransaction`: CAS `version` → `DELETE` referensi item itu → `bulkInsert`). **Pagar L87**: field `referensi` yang TIDAK dikirim (`undefined`) = jangan sentuh; hanya larik yang dikirim (termasuk kosong) yang mengganti. Tanpa pembeda ini, PATCH lama yang tak membawa referensi akan menghapus semuanya.

### 4.2 Bukti dukung (per item BBA)

- `jenis`: `BUKTI_BELI` (faktur/kuitansi/nota/SPK) · `BAST` · `FOTO` · `LAINNYA`. Tiap bukti: berkas Drive dan/atau tautan, nama, keterangan singkat.
- Ikon lampiran (lucide `Paperclip`) per baris → modal item (§4.4) langsung di tab **Bukti dukung**. Penanda "Bukti n/3" (jenis BUKTI_BELI/BAST/FOTO yang ada) — hanya untuk status Realisasi Penuh/Sebagian; selain itu "—".
- Realisasi Penuh/Sebagian tanpa bukti → peringatan di modal Realisasi, **tidak memblokir**.
- **Ditulis per aksi, bukan lewat Simpan form**: Tambah (unggah → POST) dan Hapus (`confirmDialog` → DELETE). Alasannya: bukti adalah kumpulan berkas yang hanya ditulis modal ini (satu jalur tulis, bukan pintu kedua bagi data yang sama — beda dengan L78), dan menunda pencatatan sampai Simpan meninggalkan berkas Drive yatim tiap kali modal dibatalkan. Tidak menaikkan `version` item → tidak memicu 409 palsu pada orang yang sedang menyunting form item.
- **Hapus = lepas tautan + audit; berkas di Drive TIDAK dihapus** — bukti audit tidak boleh lenyap, dan hapus Drive tidak bisa dibatalkan.
- Batas: ≤ 30 bukti per item. Berkas: aturan `/api/upload` apa adanya (≤ 10 MB; PDF, Word, Excel, JPG/PNG/GIF/WebP; magic-number).

### 4.3 Berkas & keamanan

- `MODUL_PENGUNGGAH` + `'buku_besar_aset'` → `/api/upload` dan `/api/upload/download` otomatis tunduk sakelar `app_status_buku_besar_aset` (lewat `kunciSakelarBerkas`).
- **Aturan unduh BBA (menutup T5)**: berkas ber-`context = 'buku_besar_aset'` boleh dibuka siapa pun yang lolos `isAsetRole(role, app_access)` — `app_access` dibaca dari DB seperti `app-guard.ts`, bukan dari JWT. Aturannya dikunci pada **context berkas itu sendiri**, jadi menempelkan `file_id` milik modul lain ke item BBA tidak memberi akses apa pun.
- Saat menempel `file_id` (referensi/bukti), server memeriksa barisnya ada di `uploaded_files` dengan `context = 'buku_besar_aset'` (L68 — cek eksistensi soft-FK di SEMUA cabang tulis).
- Tautan: Zod `optUrl`/`isSafeHttpUrl` (http/https saja), dirender `safeHref` + `target="_blank" rel="noopener noreferrer"`.

### 4.4 Layar — desain terpilih: modal item tiga kolom (dipilih 2026-10-22)

Dari empat alternatif yang ditunjukkan — A modal biasa, B panel samping, C modal + daftar item, D baris mengembang — pemilik memilih **C dengan isi bergaya D**: modal lebar (± 1.100 px) tiga kolom.

```
┌ Laptop Core i5 14 inci · BBA-000214 · 4 unit ──────────────────────── 1 dari 7   ✕ ┐
│ [Belum][Semua]    │ Barang [Laptop      ▾] │ Data item | Referensi harga (3) | Bukti (0) │
│ ▌Laptop i5    3/3 │ ████████▒▒▒░  bar      │ e-Katalog    PT Datascrip     13.200.000  ↗ ▣ │
│  Kursi roda   2/3 │ Eksisting 12: 8 · 3 · 1│ Toko daring  Shopee · Asus    12.799.000  ↗ ▣ │
│  Nebulizer    0/3 │ dicek 3 Mar 2026       │ Toko daring  Tokopedia        13.650.000  ↗   │
│  Printer A3   ↗   │ 2024   6 unit · 12,4 jt│ Terendah 12.799.000 · Rata-rata 13.216.333    │
│  …                │ 2025   4 unit · 12,85jt│ Harga satuan [13.900.000] ! di atas tertinggi │
│                   │ Proses 2 unit          │ [+ Referensi] [Pakai terendah] [Pakai rata2]  │
│                   │ 2027   4 unit (ini)    │                                               │
├ ← Sebelumnya ──────────────────────────────── [Simpan]  [Simpan dan berikutnya →] ┤
```

- **Pintu masuk:** klik baris tabel (daftar kiri = baris tabel menurut saringan yang sedang aktif, item yang diklik terpilih) · tombol bilah alat **"Lengkapi referensi (n)"** (daftar = item yang referensinya belum lengkap, buka di tab Referensi) · ikon lampiran baris (buka di tab Bukti dukung).
- **Kolom kiri — daftar item:** penanda Ref per item (3/3 hijau, 1–2/3 kuning, 0/3 merah, ikon tautan bila baru ada tautan dari usulan); saringan Belum / Semua. Daftar **dipotret saat modal dibuka** — item yang menjadi lengkap tidak hilang dari daftar (penandanya saja yang berganti), supaya "berikutnya" tidak melompat.
- **Kolom tengah — kartu barang, terisi bertahap:** Tahap 1 = ringkasan item (status, vol, nilai rencana, asal usulan). Tahap 2 menambah pemilih barang, riwayat per tahun (unit · harga satuan), dalam proses, dan baris tahun berjalan "(ini)" supaya rencana terlihat di samping riwayatnya. Tahap 3 menambah **bar kondisi** Baik / Rusak Ringan / Rusak Berat + tanggal cek. Warna bar = token `action-success` / `action-warning` / `action-danger` (sama dengan warna status BBA sekarang), bukan hex baru.
- **Kolom kanan — tab:** **Data item** (isian form item yang sekarang: uraian, kode rekening, kategori, sumber, vol, satuan, harga, PJ, keterangan) · **Referensi harga** · **Bukti dukung**. Tab Data item tidak ada di gambar contoh tapi wajib: tanpa itu form item lama tetap jadi modal kedua untuk baris yang sama, dan harga satuan punya dua tempat tulis (L78). Field harga satuan di tab Referensi adalah **state yang sama** dengan di tab Data item — satu nilai, dua tempat tampil; baris USULAN hanya-baca di keduanya.
- **Simpan** = satu PATCH: Data item + referensi, satu transaksi, CAS `version` (§4.1). **Simpan dan berikutnya** = Simpan lalu buka item berikutnya di daftar — satu-satunya tombol utama. **Sebelumnya** di kiri bawah.
- **Tab Bukti dukung ditulis langsung** (§4.2). Di tab itu tertulis "Bukti tersimpan langsung saat ditambah atau dihapus", supaya tidak dikira menunggu Simpan. Tab mati untuk item yang belum pernah disimpan (belum ada `aset_id`), dengan tooltip sebabnya.
- **Belum tersimpan:** berpindah item, Sebelumnya, atau menutup modal saat isian berubah → `confirmDialog` dulu. Patokannya **dihitung** dari isian vs muatan item (pola `belumTersimpan`, L79b), bukan bendera yang bisa lupa diturunkan.
- **409** (orang lain menyimpan item itu duluan): toast + item itu dimuat ulang di modal; modal tetap terbuka, item lain tidak tersentuh.
- **Tambah item baru:** modal yang sama tanpa daftar kiri.
- **Layar ≤ 760 px:** daftar kiri diganti tombol "1 dari 7" + panah sebelumnya/berikutnya; kartu barang pindah ke atas jadi satu baris (nama barang + bar + angka); tab di bawahnya.
- Tabel daftar: kolom ringkas **Ref** dan **Bukti**; saringan "Referensi belum lengkap" / "Bukti belum lengkap".
- Modal Realisasi tetap terpisah: peringatan bukti + tautan "Buka bukti dukung" (membuka modal item di tab Bukti dukung).
- Semua tombol aksi `PrimaButton`, hapus `DeleteButton`/`DeleteIcon`, tooltip `data-tooltip` (tanpa `title=`), konfirmasi `confirmDialog`, pesan `toast` — `docs/design/DESIGN-SYSTEM.md`. Dicek di tema gelap/terang dan 375 px.

### 4.5 Data (draf — final saat eksekusi)

```sql
-- migration-bba-referensi-bukti.sql
CREATE TABLE bba_referensi_harga (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aset_id       BIGINT UNSIGNED NOT NULL,
  urutan        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  sumber        ENUM('EKATALOG','TOKO_DARING','TOKO_LURING','LAINNYA') NOT NULL DEFAULT 'LAINNYA',
  nama_penyedia VARCHAR(255)  NULL,
  url           VARCHAR(2048) NULL,
  harga         DECIMAL(18,2) NULL,
  tgl_cek       DATE          NULL,
  file_id       VARCHAR(64)   NULL,
  PRIMARY KEY (id),
  KEY idx_bra_aset (aset_id, urutan),
  CONSTRAINT fk_bra_aset FOREIGN KEY (aset_id) REFERENCES buku_besar_aset(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BBA — referensi harga per item (survei harga)';

CREATE TABLE bba_lampiran (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aset_id     BIGINT UNSIGNED NOT NULL,
  jenis       ENUM('BUKTI_BELI','BAST','FOTO','LAINNYA') NOT NULL,
  nama        VARCHAR(255)  NOT NULL,
  url         VARCHAR(2048) NULL,
  file_id     VARCHAR(64)   NULL,
  keterangan  VARCHAR(500)  NULL,
  created_by  INT           NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bl_aset (aset_id, jenis),
  CONSTRAINT fk_bl_aset FOREIGN KEY (aset_id)    REFERENCES buku_besar_aset(id) ON DELETE CASCADE,
  CONSTRAINT fk_bl_user FOREIGN KEY (created_by) REFERENCES users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BBA — bukti dukung per item';
```

Item dihapus → referensi & bukti ikut terhapus (CASCADE); berkas Drive tetap.

### 4.6 Berkas yang disentuh

| Berkas | Perubahan |
|---|---|
| `docs/migrations/migration-bba-referensi-bukti.sql`, `docs/schema-mysql.sql` | 2 tabel baru |
| `lib/bba/referensi.ts` (baru, MURNI) | `tebakSumber`, `referensiSah`, `ringkasHarga`, `kelengkapanRef`, `kelengkapanBukti`, `slotDariUsulan` |
| `lib/data/buku-besar-aset-schemas.ts` | `ReferensiSchema` (opsional di Create/Update), skema bukti |
| `lib/data/buku-besar-aset.ts` | referensi di `createAset`/`updateAset` (satu transaksi), detail + tautan usulan, kolom ringkas daftar, bukti tambah/hapus/daftar |
| `app/api/buku-besar-aset/route.ts` | GET `?id=` detail (referensi + tautan usulan) |
| `app/api/buku-besar-aset/bukti/route.ts` (baru) | GET/POST/DELETE, `guard` modul (gate G memindainya sendiri) |
| `lib/security/unggahan-modul.ts`, `app/api/upload/download/route.ts` | daftarkan BBA + aturan unduh BBA |
| `lib/security/auditlog.ts`, `lib/security/retensi-audit.ts` | `BBA_BUKTI_ADD` / `BBA_BUKTI_DELETE` — WAJIB digolongkan (perubahan data → 5 tahun) |
| `app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx` (baru) | modal tiga kolom §4.4 — menggantikan form tambah/edit item yang sekarang tertanam di berkas client |
| `app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx` | kolom Ref/Bukti, tombol "Lengkapi referensi (n)", saringan, membuka `ModalItem` |

### 4.7 Catatan eksekusi Tahap 1 (2026-10-22)

Yang berbeda dari rancangan, beserta sebabnya:

- **`tebakSumber` memulangkan `null` untuk domain yang tidak dikenal**, bukan `LAINNYA`. Dengan begitu sumber yang sudah dipilih orang (mis. Toko luring yang punya situs sendiri) tidak ditimpa saat tautannya ditempel. Domain e-Katalog dan marketplace tetap menimpa.
- **Route bukti hanya POST/DELETE.** Keduanya memulangkan daftar bukti terbaru, dan daftar awal ikut GET `?id=` item. GET terpisah tidak dibutuhkan siapa pun.
- **Saringan "Referensi/Bukti belum lengkap" dan angka "Lengkapi referensi (n)" dihitung di layar** atas baris yang sudah dimuat (paling banyak 200). Aturannya fungsi murni yang sama dengan modal, bukan kueri SQL kedua yang bisa berbeda pendapat. Kalau total item melebihi yang dimuat, layar menuliskannya.
- **Modal hanya mengirim `referensi` kalau isinya berubah** dibanding saat dimuat. Isi awal dari tautan usulan juga dihitung sebagai "saat dimuat", jadi membuka item usulan tanpa mengetik apa pun tidak berbunyi "belum tersimpan" dan tidak menulis apa pun.
- **Tambah item tetap membuka modal sesudah Simpan**, kali ini dalam mode sunting, supaya tab Bukti langsung bisa dipakai.

Uji: `npx tsx scripts/test-bba-referensi.mts` (63 pemeriksaan; bagian D memakai MySQL kotak pasir 2089 dan membersihkan diri), 15 uji mutasi tertangkap.

Dicoba di peramban dengan data kotak pasir 2089, lalu dibersihkan:

- Lengkapi referensi → Simpan dan berikutnya.
- Isi awal dari tautan usulan, dengan harga usulan tetap terkunci.
- Dialog belum tersimpan.
- 409 karena orang lain menyimpan lebih dulu.
- Tambah item.
- Bukti tambah/hapus.
- Tautan "Buka bukti dukung" dari modal Realisasi.
- Tema terang dan lebar 375 px.

Aturan unduh BBA dicoba dengan akun staf sub-bidang:

- Ber-akses BBA: lolos izin.
- Berkas LKJIP orang lain: 403.
- Akses dicabut: 403 seketika.

Unggah berkas ke Drive sungguhan **tidak** dicoba dari layar. Jalur `/api/upload` dipakai apa adanya; yang baru hanya nama modul `buku_besar_aset`, dan nama itu diuji di bagian C.

**Susulan 2026-10-26:**

- **Folder Drive sendiri untuk BBA** (`GOOGLE_DRIVE_FOLDER_ID_BBA`, kosong = ikut `GOOGLE_DRIVE_FOLDER_ID`). Aturannya `folderUnggahan(modul)` di `lib/security/unggahan-modul.ts`, daftar modul yang sama dengan sakelar unggah/unduh. Token aplikasi ber-scope `drive.file`: aplikasi tidak bisa MEMBACA folder buatan pemilik (`files.get` = 404), tapi tetap bisa menaruh berkas di dalamnya — jadi "folder tidak ditemukan" saat memeriksa bukan tanda unggahan akan gagal.
- **Unggah sungguhan dicoba dari layar**: bukti berkas (tab Bukti) dan referensi berkas-saja (tab Referensi, terhitung sah). Keduanya mendarat di folder BBA, terbuka 200 lewat `/api/upload/download`, dan staf sub-bidang ber-akses BBA bisa membuka berkas yang diunggah admin. Berkas uji dipindah ke Sampah Drive sesudahnya.
- **Dua cacat lama dibereskan:**
  - Tabel BBA menampilkan muatan yang datang terlambat (ganti tahun saat muatan lama belum pulang → tabel berisi tahun lain/kosong). `load()` kini bernomor giliran; muat otomatis berpatokan saringan yang terakhir dimuat (bukan "sudah mount" — efek ganda strict mode dulu menembak muatan tahun awal), dan tahun setengah diketik ("208") tidak dimuat.
  - Berkas yang tidak ada di Drive dijawab 500. Pesan galat Drive berbunyi "File not found: <id>." tanpa "404"/"notFound", jadi pencocokan pesan tak pernah kena; kini `kodeGalatDrive(err)` (`lib/services/drive.ts`) membaca kodenya.
- Suite jadi 71 pemeriksaan; 12 uji mutasi susulan tertangkap.

## 5. Tahap 2 — Master Barang, status Dalam Proses, tampilan Per Barang

### 5.1 Master Barang (menutup T3)

- `bba_barang`: **jenis barang di tingkat perencanaan** — "Laptop", "Kursi Roda", "Bed Pasien Elektrik". Spesifikasi tetap di uraian item.
- Nama dirapikan saat disimpan (trim + spasi tunggal, SATU fungsi `rapikanNamaBarang`); `UNIQUE(nama)` dengan kolasi `ci` menolak kembar beda huruf besar-kecil.
- `buku_besar_aset.barang_id` (boleh NULL — item lama belum tertaut). FK `ON DELETE RESTRICT`: barang yang masih dipakai tidak bisa dihapus (pesannya menyebut jumlah item).
- **Menautkan:**
  - Tambah/edit item → combobox barang (cari) + "Buat barang baru".
  - Tarik dari Usulan → `nama_barang` yang (sesudah dirapikan) sama dengan nama barang yang ada **tertaut otomatis**; sisanya NULL.
  - Spanduk "N item belum ditautkan" → modal tautkan sekaligus: tiap item diberi saran (cocok nama), pilih barang atau "buat barang baru dari nama ini".
- **Gabungkan barang** (di halaman Master): kembar seperti "Laptop" / "Laptop Kantor" pasti terjadi. Memindahkan semua item (dan pendataan, Tahap 3) dari A ke B lalu menghapus A, satu `withTransaction`, diaudit.
- Halaman Master BBA mendapat tab **Barang** di samping Kategori.

### 5.2 Status "Dalam Proses" (menutup T6) — default keputusan #1

- `DIPROSES` = sudah dipesan/dikontrak, barang belum diterima; kolom `tgl_proses`.
- Transisi (perubahan pada `BBA_STATUS_TRANSITIONS`):

| Dari | Ke |
|---|---|
| DIRENCANAKAN | **DIPROSES**, REALISASI_PENUH, REALISASI_SEBAGIAN, TIDAK_TEREALISASI |
| **DIPROSES** | REALISASI_PENUH, REALISASI_SEBAGIAN, TIDAK_TEREALISASI, DIRENCANAKAN (pesanan batal, tetap direncanakan) |
| lainnya | tetap seperti sekarang |

- Dipasang dari modal **Realisasi** (jadi "Proses & Realisasi") karena baris USULAN tidak bisa ganti status lewat form (T8). Memilih Dalam Proses: unit & nilai realisasi wajib 0 (server, `assertStatusConsistent`), field tanggal jadi "Tanggal proses".
- Pembeli langsung tetap bisa melompat DIRENCANAKAN → REALISASI_*.
- Yang ikut disesuaikan (L69 — semua pembaca status): KPI `backlog` (DIPROSES ikut "belum terealisasi"), saringan & warna status di layar (warna dari token DESIGN-SYSTEM, bukan hex baru), `lib/rima/bba-provider.ts` (label + inbox "menunggu realisasi" = DIRENCANAKAN + DIPROSES), `lib/sentinel/knowledge.mjs`.

### 5.3 Tampilan Per Barang

Pilihan **Per Item | Per Barang** di atas tabel. Satu baris per barang (tahun terpilih = T; baris usulan DITOLAK dikecualikan seperti KPI):

| Kolom | Isi |
|---|---|
| Eksisting | Baik · Rusak Ringan · Rusak Berat (Tahap 3; sebelum itu "—") |
| Pernah dibeli | Σ unit realisasi tahun ≤ T + tahun terakhir + harga satuan terakhir (`nilai_realisasi / vol_realisasi`) |
| Dalam proses | Σ unit DIPROSES tahun ≤ T (pesanan tahun lalu bisa belum datang) |
| Direncanakan | Σ unit DIRENCANAKAN tahun T |

- Baris penutup **"Belum ditautkan (N item)"** supaya jumlahnya sama dengan tampilan Per Item (pelajaran "Belum ada PJ" Realisasi BLUD).
- Klik barang → kartu: riwayat per tahun (rencana, realisasi, harga satuan, status, termasuk yang tidak terealisasi), referensi harga terakhir (tren harga), eksisting per lokasi (Tahap 3).
- **Di modal item** (§4.4): kolom tengah jadi kartu barang — pemilih barang, riwayat per tahun, dalam proses, dan baris tahun berjalan "(ini)". Ini titik gunanya: angkanya terlihat **saat memutuskan**.
- Rumus agregasi fungsi MURNI (`lib/bba/barang.ts`); kueri hanya mengambil bahan.

### 5.4 Data (draf)

```sql
-- migration-bba-barang-proses.sql
CREATE TABLE bba_barang (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama          VARCHAR(160) NOT NULL,
  kategori_aset VARCHAR(64)  NULL,
  satuan        VARCHAR(32)  NULL,
  created_by    INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_barang_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BBA — master jenis barang (kunci riwayat & eksisting)';

ALTER TABLE buku_besar_aset
  ADD COLUMN barang_id  INT UNSIGNED NULL AFTER kategori_aset,
  ADD COLUMN tgl_proses DATE NULL AFTER status,
  MODIFY COLUMN status ENUM('DIRENCANAKAN','DIPROSES','REALISASI_PENUH','REALISASI_SEBAGIAN','TIDAK_TEREALISASI')
                NOT NULL DEFAULT 'DIRENCANAKAN',
  ADD KEY idx_bba_barang (barang_id),
  ADD CONSTRAINT fk_bba_barang FOREIGN KEY (barang_id) REFERENCES bba_barang(id) ON DELETE RESTRICT;
```

### 5.5 Berkas yang disentuh

Migrasi + skema · `lib/bba/barang.ts` (baru, MURNI) · schemas (status, transisi, barang) · data layer (barang CRUD + gabung, agregasi, tautan otomatis di `commitImportUsulan`, `barang_id` di create/update — cek eksistensi L68) · `app/api/buku-besar-aset/barang/route.ts` (baru) · `realisasi/route.ts` · halaman Master (tab Barang) · client (Per Barang, combobox, strip, spanduk belum ditautkan) · RIMA provider · sentinel knowledge · audit `BBA_BARANG_*` + retensi.

### 5.6 Catatan eksekusi Tahap 2 (2026-10-26)

Migrasi `migration-bba-barang-proses.sql` — **wajib dijalankan di server kantor sebelum kodenya dipasang** (daftar BBA membaca `barang_id`/`tgl_proses`).

Yang berbeda dari rancangan, beserta sebabnya:

- **Status hanya diubah lewat modal Proses & Realisasi.** Pilihan status di tab Data item (khusus item manual) DIBUANG, dan `status` dicabut dari skema PATCH item. Kalau tetap ada, DIPROSES bisa dipasang dari form tanpa tanggal proses — dua pintu, dua aturan. Koreksi mundur dari Realisasi Penuh (khusus Admin) tetap ada, kini di modal Proses & Realisasi. Aturan transisi pindah ke `lib/bba/status.ts` (murni) supaya pilihan di layar = aturan server.
- **"Buat barang baru" tidak menulis apa pun saat dipilih.** Namanya ikut body Simpan item (`barang_baru`) dan barangnya dibuat (atau dipakai yang bernama sama) di transaksi Simpan yang sama. Simpan gagal/batal → tidak ada barang yatim di Master (L78).
- **Simpan item memeriksa versi DULU di bawah kunci** (`SELECT … FOR UPDATE`), baru menentukan barang. Ditemukan saat diuji: modal yang dibuka sebelum barangnya digabung orang lain dulu ditolak "barang tidak ditemukan", padahal yang benar 409 lalu muat ulang.
- **Tautkan sekaligus tidak memakai angka kunci.** Daftarnya dipotret dari tabel yang bisa basi (L77); pertanyaan yang tepat "item ini masih tanpa barang?" — yang sudah ditautkan orang lain di sela-selanya dilewati dan dihitung, tidak ditimpa. Versi item tetap dinaikkan supaya modal yang terbuka dapat 409.
- **Gabungkan menaikkan versi item yang dipindah**, dengan alasan yang sama.
- **Saran tautan = nama barang yang jadi awalan UTUH uraian** ("Laptop" untuk "Laptop Core i5", bukan untuk "Laptopan"); yang terpanjang menang. Tarik dari Usulan hanya menautkan nama yang SAMA persis (sesudah dirapikan) dan tidak pernah membuat barang baru.
- **Spanduk "belum ditautkan" juga di tampilan Per Item**, bukan hanya baris penutup Per Barang — kalau tidak, orang yang tidak membuka Per Barang tidak pernah menautkan.
- **Tampilan Per Barang tidak mengikuti saringan** status/sumber/asal (pernah dibeli & dalam proses lintas tahun); layar menuliskannya. Baris Jumlah = Total Rencana tanpa saringan.
- Warna DIPROSES = token `info` #378ADD.

Uji: `npx tsx scripts/test-bba-barang.mts` (72 pemeriksaan; bagian D memakai MySQL kotak pasir 2086–2088 dan membersihkan diri), 27 uji mutasi tertangkap.

Dicoba di peramban dengan data kotak pasir 2087–2089, lalu dibersihkan: Per Barang (angka cocok dengan kartu; Jumlah = Total Rencana), kartu barang, Tautkan sekaligus (saran, buat baru, nama diubah), barang baru dari modal item (dibuat saat Simpan, kategori ikut item), Dalam Proses → diterima (tgl_proses tetap), Master → Barang (tambah, ubah, gabung, hapus; hapus barang terpakai ditolak), tema terang, 375 px. Ditemukan saat dilihat: tabel riwayat di kolom tengah modal (250 px) meluap ke samping → harga ringkas "13,5 jt" + "(ini)" di baris sendiri; tabel Master Barang di 375 px → kategori/satuan/jumlah item jadi satu baris keterangan di bawah nama.

## 6. Tahap 3 — Kondisi eksisting

### 6.1 Pendataan

- Per **barang × lokasi**: jumlah Baik, Rusak Ringan, Rusak Berat, tanggal cek, catatan, foto (opsional, lewat jalur unggah Tahap 1).
- **Tiap pendataan = baris baru** (riwayat: "rusak berat naik dari 1 ke 4"); yang berlaku = terbaru per barang × lokasi. Pendataan ulang di tanggal yang SAMA menimpa (UNIQUE `barang, lokasi, tgl_cek` → koreksi salah ketik tidak menumpuk). Tanggal tidak boleh sesudah hari ini (`tanggalHariIniWIB`).
- Dua pintu masuk:
  - **Pendataan per lokasi** (utama — opname dikerjakan ruangan demi ruangan): pilih lokasi + tanggal → daftar barang yang pernah tercatat di lokasi itu (+ tambah barang) dengan 3 kotak angka → satu Simpan (`withTransaction` + `bulkInsert`).
  - Per barang dari kartu barang (satu lokasi).
- **Lokasi** = master baru `bba_lokasi` di halaman Master BBA (tab Lokasi) — default keputusan #2.

### 6.2 Pembelian sesudah pendataan — tidak dijumlahkan otomatis

Pembelian **tidak** ditambahkan ke angka eksisting. Kalau ditambahkan, barang yang sudah ikut terhitung di pendataan berikutnya terhitung dua kali; dan BBA tidak tahu unit yang dibeli ditempatkan di lokasi mana. Sebagai gantinya kartu barang menandai **"perlu didata ulang"** bila ada realisasi dengan `tgl_realisasi` sesudah pendataan terlama yang masih berlaku, beserta kalimatnya — mis. *"3 unit dibeli 12 Apr 2026, sesudah pendataan Ruang Rawat Inap A (3 Jan 2026). Data ulang supaya angka eksisting memuatnya."*

### 6.3 Ke Per Barang

- Kolom Eksisting terisi (Σ pendataan yang berlaku); saringan **"Ada Rusak Berat"** = kandidat pengganti.
- Kartu barang: eksisting per lokasi + tanggal cek + riwayat.
- Bar kondisi di kolom tengah modal item (§4.4) terisi di tahap ini; sebelum ada pendataan, tempatnya bertuliskan "Belum didata".
- Gabungkan barang (§5.1) memindahkan riwayat pendataan apa adanya; kalau dua-duanya punya pendataan di lokasi yang sama, barang hasil gabungan ditandai "perlu didata ulang" (angkanya tidak dijumlah diam-diam — bisa jadi dua pendataan itu menghitung barang fisik yang sama).

### 6.4 Data (draf)

```sql
-- migration-bba-eksisting.sql
CREATE TABLE bba_lokasi (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(160) NOT NULL,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_lokasi_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BBA — master lokasi/ruangan pendataan';

CREATE TABLE bba_eksisting (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  barang_id     INT UNSIGNED NOT NULL,
  lokasi_id     INT UNSIGNED NOT NULL,
  baik          INT UNSIGNED NOT NULL DEFAULT 0,
  rusak_ringan  INT UNSIGNED NOT NULL DEFAULT 0,
  rusak_berat   INT UNSIGNED NOT NULL DEFAULT 0,
  tgl_cek       DATE         NOT NULL,
  catatan       VARCHAR(500) NULL,
  file_id       VARCHAR(64)  NULL,
  created_by    INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_be_cek (barang_id, lokasi_id, tgl_cek),
  CONSTRAINT fk_be_barang FOREIGN KEY (barang_id)  REFERENCES bba_barang(id) ON DELETE RESTRICT,
  CONSTRAINT fk_be_lokasi FOREIGN KEY (lokasi_id)  REFERENCES bba_lokasi(id) ON DELETE RESTRICT,
  CONSTRAINT fk_be_user   FOREIGN KEY (created_by) REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BBA — pendataan kondisi eksisting (riwayat; yang berlaku = terbaru)';
```

### 6.5 Berkas yang disentuh

Migrasi + skema · `lib/bba/eksisting.ts` (baru, MURNI: yang berlaku per lokasi, total, "perlu didata ulang") · data layer + `app/api/buku-besar-aset/eksisting/route.ts` + lokasi CRUD · halaman Master (tab Lokasi) · client (pendataan per lokasi, kartu barang, kolom Eksisting, saringan) · audit `BBA_EKSISTING_*` / `BBA_LOKASI_*` + retensi.

## 7. Aturan yang berlaku di semua tahap

- Semua route baru di `app/api/buku-besar-aset/*` memakai `guard` modul (akses + sakelar maintenance) → gate G memindainya sendiri.
- Tulis lebih dari satu pernyataan → `withTransaction` + `bulkInsert`; perubahan item tetap CAS `version` (L48).
- Zod sentral di `buku-besar-aset-schemas.ts`; cek eksistensi `barang_id` / `lokasi_id` / `file_id` / `aset_id` di setiap cabang tulis (L68).
- Aturan hitung (kelengkapan, ringkasan harga, agregasi per barang, eksisting berlaku) fungsi MURNI di `lib/bba/` — dipakai layar dan server, diuji sungguhan.
- Tidak ada akses per-baris (BBA modul kolaboratif, AUTHZ-02/V5).
- **Uji per tahap**: `scripts/test-bba-referensi.mts`, `test-bba-barang.mts`, `test-bba-eksisting.mts` (fungsi murni + bagian MySQL di tahun kotak pasir 2089, bersih otomatis) + uji mutasi; tsc, ESLint 0 peringatan, gerbang E/G/J; dicoba di peramban (tema gelap/terang, 375 px). Data 2026 hanya dibaca.

## 8. Sengaja tidak dikerjakan

- Kartu per unit (nomor seri/NUP), penyusutan, label QR — urusan aplikasi BMD resmi.
- Form & alur Usulan Kebutuhan tidak diubah (tautannya dibaca, bukan disalin — §4.1).
- Kebutuhan standar per ruangan (supaya kekurangan terhitung otomatis) dan impor data eksisting dari Excel ekspor aplikasi BMD — bisa menyusul bila dibutuhkan.
- Menautkan realisasi ke kuitansi Buku Kas BLUD, dan memakai `dpa_row_id`/`dpa_versi_tanggal` (T7) — di luar konsep ini.

## 9. Keputusan terbuka (default dipakai kalau tidak ada keberatan)

| # | Pertanyaan | Default |
|---|---|---|
| 1 | Status "Dalam Proses" ditambah? | **Ya** — tanpa itu "sedang diproses berapa" tidak bisa dijawab (T6). |
| 2 | Lokasi pendataan eksisting: ruangan (master baru) atau sub-bidang yang sudah ada? | **Master lokasi baru** — opname berjalan per ruangan; sub-bidang itu unit administrasi. |
| 3 | Referensi < 3: peringatan atau tidak boleh disimpan? | **Peringatan** — rencana sering disusun bertahap; memblokir membuat orang mengisi referensi asal-asalan. |
