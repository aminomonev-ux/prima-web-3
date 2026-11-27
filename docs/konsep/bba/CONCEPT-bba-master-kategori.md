# Konsep Final: Master Kategori Bertingkat, Integrasi Kode Rekening BLUD, & Pemetaan KIB

- **Modul Utama:** Buku Besar Aset (`app/(dashboard)/buku-besar-aset`)
- **Integrasi Terkait:** Modul BLUD (`Master Akun` & `Kode Besar`), Usulan Kebutuhan, Cetak & Ekspor Excel
- **Status Dokumen:** DIKERJAKAN 2026-11-27 — mig `docs/migrations/migration-bba-master-kategori.sql` (**WAJIB dijalankan di server kantor sebelum kodenya dipasang**), regresi `npx tsx --env-file=.env.local scripts/test-bba-kategori.mts` (46, kotak pasir 2063, 13 uji mutasi tertangkap). Keputusan pelaksanaan yang menyimpang/menambah konsep: §7.
- **Prasyarat sebelum implementasi:** kolom/tabel baru wajib masuk `docs/schema-mysql.sql` + `docs/migrations/migration-*.sql`, dan setiap tulis soft-FK (`kategori_id`, `jenis_kategori_id`, `kelompok_kib`) wajib lewat cek-eksistensi (L68)

---

## 1. Latar Belakang & Tujuan

Sebelumnya, klasifikasi pada menu **Master Kategori Aset** hanya memiliki **1 tingkat** dan terbatas pada 6 golongan Kartu Inventaris Barang (KIB) aset tetap (*Tanah*, *Peralatan dan Mesin*, *Gedung dan Bangunan*, *Jalan, Irigasi, dan Jaringan*, *Konstruksi Dalam Pengerjaan (KDP)*, dan *Alkes & Aldok*).

Dalam praktik perencanaan dan pengadaan pada **Buku Besar Aset**, kebutuhan belanja mencakup seluruh jenis belanja operasional maupun modal, serta membutuhkan keterkaitan langsung dengan **Kode Rekening Belanja (`5.x.x...`)** yang terdaftar di modul **BLUD**.

### Tujuan Perubahan
1. Mengubah judul dan cakupan **"Master Kategori Aset"** menjadi **"Master Kategori"** agar mencakup seluruh kelompok belanja.
2. Menerapkan struktur klasifikasi **2 Tingkat (Parent–Child)**:
   - **Tingkat 1 — Kategori (Kelompok Belanja Utama):** *Barang dan Jasa*, *Modal*, dan *Pegawai* (tetap dapat ditambah secara manual).
   - **Tingkat 2 — Jenis Kategori (Sub-Jenis Belanja):** Rincian jenis belanja di bawah masing-masing Kategori, dilengkapi kolom **Kode Rekening**.
3. Menyediakan pencarian langsung (*searchable dropdown*) ke **Master Akun** dan **Kode Besar** modul BLUD saat menambahkan *Jenis Kategori*, sekaligus tetap mempertahankan opsi input manual.
4. Mengotomatiskan pengisian **Kode Rekening** pada form di menu **Rencana**, **Pengadaan**, dan **Penawaran** saat pengguna memilih *Jenis Kategori*.
5. Mempertahankan 100% kompatibilitas mekanisme **KIB (Kartu Inventaris Barang)** pada menu **Aset** melalui atribut **Kelompok KIB** khusus pada kategori **Modal**.

---

## 2. Arsitektur Klasifikasi & Aturan Bisnis

### 2.1 Hierarki 2 Tingkat

| Tingkat | Nama Field | Nilai Bawaan / Sumber Data | Keterangan |
| :--- | :--- | :--- | :--- |
| **Tingkat 1** | `kategori` | 1. **Barang dan Jasa**<br>2. **Modal**<br>3. **Pegawai** | Kelompok utama. Tersedia tombol **`+ Tambah Kategori`** apabila diperlukan penambahan kelompok kategori induk baru secara manual. |
| **Tingkat 2** | `jenis_kategori` | • Tarik dari **Master Akun** & **Kode Besar** BLUD<br>• Input ketik manual | Sub-jenis belanja di bawah masing-masing `kategori`. Setiap entri menyimpan `kode_rekening` dan uraian `jenis_kategori`. |
| **Atribut KIB** *(Khusus Modal)* | `kelompok_kib` | 6 Golongan KIB baku:<br>• `TANAH`<br>• `PERALATAN DAN MESIN`<br>• `GEDUNG DAN BANGUNAN`<br>• `JALAN, IRIGASI, DAN JARINGAN`<br>• `KONSTRUKSI DALAM PENGERJAAN (KDP)`<br>• `ALKES & ALDOK`<br>*(+ opsi `+ Tambah Kelompok KIB`)* | Hanya muncul jika `kategori === "Modal"`. Terisi otomatis berdasarkan pola kode rekening / kata kunci uraian, dan dapat diubah atau ditambah manual lewat dropdown. |

### 2.2 Aturan Deteksi Otomatis `Kelompok KIB` (Untuk Kategori `Modal`)

Saat pengguna memilih rekening belanja modal dari dropdown BLUD di Master Kategori, sistem otomatis memetakan `kelompok_kib` dengan prioritas aturan berikut:

1. **Kata Kunci Spesifik Alat Kesehatan:** Jika uraian mengandung kata `alkes`, `kedokteran`, `medis`, `laboratorium kesehatan`, atau `rumah sakit` → **`ALKES & ALDOK`**.
2. **Awalan Kode Rekening Belanja Modal (Permendagri / BLUD):**
   - `5.2.01...` → **`TANAH`**
   - `5.2.02...` → **`PERALATAN DAN MESIN`**
   - `5.2.03...` → **`GEDUNG DAN BANGUNAN`**
   - `5.2.04...` → **`JALAN, IRIGASI, DAN JARINGAN`**
   - `5.2.05...` / `5.2.06...` atau mengandung kata `konstruksi` / `kdp` → **`KONSTRUKSI DALAM PENGERJAAN (KDP)`**
3. **Fallback:** Jika belum terdeteksi otomatis, pengguna memilih langsung dari dropdown **Kelompok KIB** (atau menambah golongan baru via **`+ Tambah Kelompok KIB`**).

### 2.3 Perbedaan Kode Rekening Belanja vs Kode KIB Aset

- **Kode Rekening (`5.x.x...`):** Kode anggaran belanja dari modul BLUD/DPA. Digunakan pada tahap **Perencanaan**, **Pengadaan**, **Penawaran**, dan **Realisasi Pagu**.
- **Kode Barang / Register KIB (`1.3.x...` / Kode BMD):** Kode inventaris aset tetap yang dicatat pada **Menu Aset** setelah barang diterima.
- Pemisahan `kode_rekening` (untuk anggaran) dan `kelompok_kib` (untuk pengelompokan buku inventaris) memastikan kedua sistem berjalan selaras tanpa benturan format kode.

---

## 3. Desain Antarmuka (UI/UX Specification)

### 3.1 Halaman Master Kategori (`Buku Besar Aset → Master → Tab Kategori`)

- **Header Halaman:**
  - Judul diubah dari *"Master Kategori Aset"* menjadi **"Master Kategori"**.
  - Subjudul: *"Kelola kategori utama, sub-jenis kategori, dan tautan kode rekening BLUD"*.
  - Tombol aksi di kanan atas: **`+ Tambah Kategori`** (membuka input/modal tambah kategori induk baru).

- **Tata Letak Accordion / Kartu per Kategori Utama:**
  Terdapat 3 bagian utama yang dapat dibuka-tutup (*collapsible*): **1. Barang dan Jasa**, **2. Modal**, dan **3. Pegawai** (ditambah kategori kustom jika ada).

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 📁 Master Kategori                                            [ + Tambah Kategori ] │
│ Kelola kategori utama, sub-jenis kategori, dan tautan kode rekening BLUD            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ▼ 1. Barang dan Jasa                                                      (2 jenis) │
│   ┌───────────────────────────────────────────────────────────────────────────────┐ │
│   │ 🔍 Cari dari Master Akun / Kode Besar BLUD...                             [▾] │ │
│   │ [ Kode Rekening ]  [ Nama Jenis Kategori                      ]  [ + Tambah ] │ │
│   └───────────────────────────────────────────────────────────────────────────────┘ │
│   • [ 5.1.02.01.01.0024 ]  Belanja Alat Tulis Kantor (ATK)                    [🗑]  │
│   • [ 5.1.02.03.02.0001 ]  Belanja Pemeliharaan Gedung                        [🗑]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ▼ 2. Modal                                                                (8 jenis) │
│   ┌───────────────────────────────────────────────────────────────────────────────┐ │
│   │ 🔍 Cari dari Master Akun / Kode Besar BLUD...                             [▾] │ │
│   │   ┌─────────────────────────────────────────────────────────────────────────┐ │ │
│   │   │ 5.2.02.05.01.0005 — Belanja Modal Alat Komputer                         │ │ │
│   │   │ 5.2.02.07.01.0001 — Belanja Modal Alat Kedokteran                       │ │ │
│   │   └─────────────────────────────────────────────────────────────────────────┘ │ │
│   │ [ Kode Rekening ] [ Nama Jenis Kategori ] [ Kelompok KIB ▾ ]     [ + Tambah ] │ │
│   └───────────────────────────────────────────────────────────────────────────────┘ │
│   • [ - ]                  TANAH                               [ Tanah        ] [🗑]  │
│   • [ 5.2.02.05.01.0005 ]  Belanja Modal Alat Komputer  [ Peralatan dan Mesin ] [🗑]  │
│   • [ 5.2.02.07.01.0001 ]  Belanja Modal Alat Kedokteran      [ Alkes & Aldok ] [🗑]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ▶ 3. Pegawai                                                              (1 jenis) │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Detail Interaksi Input Tingkat 2:**
  1. **Searchable Dropdown BLUD:** Menggabungkan data dari `Master Akun` dan `Kode Besar` (deduplikasi berdasarkan `kode`), mendukung pencarian cepat berdasarkan potongan kode maupun kata kunci uraian. Saat item dipilih, field `Kode Rekening` dan `Nama Jenis Kategori` terisi otomatis (dan jika di dalam bagian **Modal**, dropdown `Kelompok KIB` otomatis terdeteksi).
  2. **Input Manual:** Pengguna dapat langsung mengetik `Kode Rekening` (opsional/wajib sesuai kebutuhan) dan `Nama Jenis Kategori` lalu menekan **`+ Tambah`**.
  3. **Dropdown Kelompok KIB (Khusus Bagian Modal):** Menampilkan 6 golongan KIB bawaan serta opsi **`+ Tambah Kelompok KIB`** di bagian bawah dropdown untuk menambah golongan KIB baru secara instan. Badge `Kelompok KIB` pada setiap baris juga dapat diklik/diubah sewaktu-waktu.

---

### 3.2 Modal Form Tambah / Edit Item (`Rencana`, `Pengadaan`, `Penawaran`)

Pada komponen `ModalItem.tsx`, input tunggal *Kategori* diubah menjadi 3 elemen berurutan:

```text
┌──────────────────────────────────────────────────────────┐
│ Tambah Item Rencana                                  [✕] │
├──────────────────────────────────────────────────────────┤
│ Kategori *                                               │
│ [ Modal                                              ▾ ] │
│                                                          │
│ Jenis Kategori *                                         │
│ [ 5.2.02.05.01.0005 — Belanja Modal Alat Komputer    ▾ ] │
│                                                          │
│ Kode Rekening                   [Otomatis · KIB: Mesin]  │
│ [ 5.2.02.05.01.0005                                    ] │
│                                                          │
│ Nama Barang / Kegiatan *                                 │
│ [ Komputer Kerja & Monitor                             ] │
│                                                          │
│ Volume                  Satuan         Harga Satuan      │
│ [ 1          ]          [ Unit   ]     [ Rp 15.000.000 ] │
│                                                          │
│                                    [ Batal ]  [ Simpan ] │
└──────────────────────────────────────────────────────────┘
```

- **Perilaku Form:**
  1. Saat **Kategori** dipilih, dropdown **Jenis Kategori** langsung memfilter daftar sub-jenis milik kategori tersebut (dilengkapi kotak pencarian di dalam dropdown jika daftarnya panjang).
  2. Saat **Jenis Kategori** dipilih, kolom **Kode Rekening** langsung **terisi otomatis** sesuai nilai di Master Kategori.
  3. Kolom **Kode Rekening** tetap bersifat *editable* (dapat diubah manual apabila transaksi tertentu membutuhkan penyesuaian digit rekening).
  4. Jika **Kategori** adalah `Modal`, sistem menyimpan atribut `kelompok_kib` secara otomatis pada item tersebut.

---

## 4. Alur Kerja Utuh (*End-to-End Workflow*)

```text
[1. Master Kategori]
   Admin mengatur Kategori (Barang & Jasa / Modal / Pegawai)
   + Jenis Kategori + Kode Rekening (dari BLUD / Manual) + Kelompok KIB (jika Modal)
          │
          ▼
[2. Perencanaan / Pengadaan / Penawaran]
   User pilih Kategori ──► pilih Jenis Kategori ──► Kode Rekening terisi otomatis
          │
          ▼
[3. Penerimaan Barang (Aksi Terima)]
   Sistem memeriksa Kategori Induk item:
   ├── Kategori == "Modal"
   │     └──► Diteruskan ke Antrean Register Aset (Menu Aset)
   │          dan dikelompokkan sesuai atribut "Kelompok KIB"
   │
   └── Kategori == "Barang dan Jasa" atau "Pegawai"
         └──► Selesai sebagai realisasi belanja/pengadaan
              (TIDAK masuk ke Antrean Register KIB Aset Tetap)
          │
          ▼
[4. Pelaporan & Cetak]
   • Rekap Rencana/Pengadaan: menampilkan Kategori, Jenis Kategori, & Kode Rekening
   • Buku Inventaris / KIB: tetap membaca aset Modal berdasarkan Kelompok KIB
```

---

## 5. Model Data & Strategi Migrasi Data Lama

### 5.1 Struktur Data Master Kategori

```ts
export interface MasterJenisKategori {
  id: string;
  kategori: string;        // "Barang dan Jasa" | "Modal" | "Pegawai" | kustom
  jenis_kategori: string;  // Contoh: "Belanja Modal Alat Komputer"
  kode_rekening: string;   // Contoh: "5.2.02.05.01.0005" (boleh kosong jika manual tanpa kode)
  kelompok_kib?: string;   // Wajib/relevan jika kategori === "Modal" (mis. "PERALATAN DAN MESIN")
}
```

### 5.2 Struktur Field Tambahan pada Transaksi / Item

Setiap item pada tahap Rencana, Pengadaan, Penawaran, dan Aset menyimpan:
- `kategori: string` — Nama Kategori Induk (*Barang dan Jasa*, *Modal*, *Pegawai*, dll.)
- `jenis_kategori: string` — Nama Sub-Jenis Kategori
- `kode_rekening: string` — Kode Rekening Belanja (`5.x.x...`)
- `kelompok_kib?: string` — Golongan KIB untuk pemetaan inventaris (khusus `Modal`)

### 5.3 Aturan Backward Compatibility & Migrasi Otomatis

1. **Data Master Lama:** 6 kategori yang sudah tersimpan sebelumnya (*Tanah*, *Peralatan dan Mesin*, *Gedung dan Bangunan*, *Jalan, Irigasi, dan Jaringan*, *Konstruksi Dalam Pengerjaan (KDP)*, *Alkes & Aldok*) otomatis dimigrasikan menjadi entri di bawah `kategori = "Modal"` dengan `jenis_kategori` dan `kelompok_kib` bernilai sama dengan namanya.
2. **Data Item/Transaksi Lama:** Jika sebuah item lama hanya memiliki field `kategori` berisi salah satu dari 6 nama KIB lama (dan `jenis_kategori` masih kosong), sistem otomatis membacanya sebagai:
   - `kategori = "Modal"`
   - `jenis_kategori = <nilai lama>`
   - `kelompok_kib = <nilai lama>`
3. Dengan mekanisme ini, seluruh riwayat transaksi dan kartu aset KIB yang sudah ada tetap tampil utuh tanpa perlu migrasi manual.

---

## 6. Daftar File & Titik Penyesuaian di `prima-web-3`

| Area / Modul | File Terkait | Perubahan yang Dilakukan |
| :--- | :--- | :--- |
| **API Master Kategori** | `app/api/buku-besar-aset/kategori/route.ts` | Mendukung penyimpanan & pembaruan struktur objek `{ id, kategori, jenis_kategori, kode_rekening, kelompok_kib }`, daftar kategori induk kustom, daftar kelompok KIB kustom, serta migrasi otomatis dari array string lama. |
| **UI Master Kategori** | `app/(dashboard)/buku-besar-aset/master/master-client.tsx` | Mengubah judul menjadi **Master Kategori**, menampilkan 3 bagian utama (+ tambah kategori manual), searchable dropdown gabungan dari `/api/blud/master-akun` & `/api/blud/kode-besar`, input manual, serta selector `Kelompok KIB` (+ tambah manual) pada bagian **Modal**. |
| **Master Barang** | `app/(dashboard)/buku-besar-aset/master/BarangPanel.tsx`<br>`app/api/buku-besar-aset/barang/route.ts` | Menyesuaikan pilihan klasifikasi barang menjadi **Kategori** → **Jenis Kategori** dengan auto-fill `kode_rekening`. |
| **Form Item (Rencana, Pengadaan, Penawaran)** | `app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx`<br>`KartuBarang.tsx`, `PerBarang.tsx` | Mengimplementasikan dependent dropdown **Kategori** → **Jenis Kategori** + auto-fill **Kode Rekening**, serta menampilkan badge Kategori, Jenis Kategori, dan Kode Rekening pada kartu item. |
| **Halaman Rencana, Pengadaan, Penawaran** | `buku-besar-aset-client.tsx`<br>`pengadaan/pengadaan-client.tsx`<br>`penawaran/penawaran-client.tsx` | Menambahkan filter bertingkat (**Kategori** & **Jenis Kategori**) dan pencarian berdasarkan **Kode Rekening**. |
| **Alur Penerimaan & Menu Aset (KIB)** | `AksiTerima.tsx`, `aset/aset-client.tsx`, `KartuAset.tsx`, `ModalImporKib.tsx`<br>`app/api/buku-besar-aset/aset/*` | Menyaring hanya item dengan `kategori === "Modal"` untuk masuk ke antrean register aset, dan menggunakan `kelompok_kib` sebagai penentu golongan KIB. |
| **Integrasi Usulan Kebutuhan & Pagu** | `app/api/buku-besar-aset/import-usulan/route.ts`<br>`KartuPagu.tsx` | Memetakan data usulan yang ditarik ke struktur `kategori`, `jenis_kategori`, dan `kode_rekening` (jika tersedia). |
| **Cetak & Ekspor Excel** | `cetak/cetak-client.tsx`, `UnduhBuku.tsx`<br>`app/api/buku-besar-aset/aset/excel/route.ts`<br>`app/api/buku-besar-aset/unduh/route.ts` | Menambahkan filter per **Kategori** dan **Jenis Kategori**, serta menyertakan kolom **Kode Rekening** pada hasil cetak dan file Excel. |

---

## 7. Catatan Pelaksanaan (2026-11-27)

1. **Satu aturan "Modal"**: `adalahModal` (`lib/bba/kategori.ts`) dan cermin SQL-nya `SYARAT_MODAL` (`lib/data/buku-besar-aset.ts`) — dipakai saringan Kategori=Modal, `belum_dicatat` (tahap rencana), antrean Buku Aset, dan pagar `tempatkan`. Uji C7 membandingkan keduanya pada 12 bentuk data. Item tanpa kategori tetap dianggap Modal kecuali kode rekeningnya 5.1.x (perilaku lama BBA = register belanja modal).
2. **Barang & Jasa / Pegawai yang diterima penuh langsung Tercatat** — tidak menunggu register. Antrean **rehab** sengaja TIDAK disaring kategori: rehab gedung sering dianggarkan sebagai pemeliharaan (5.1.02), padahal kondisi gedungnya tetap perlu diperbarui.
3. **Kategori Modal ⇄ bukan Modal dikunci sesudah barang diterima** (`BbaKategoriBekuError`, 409 `KATEGORI_BEKU`) — berpindah sisi membuat unit yang menunggu register lenyap dari antrean. Jenis lain di kategori yang sama tetap boleh.
4. **Kategori tidak diwajibkan** di form (konsep menandai `*`): Tinjauan Drive dan data lama membuat item tanpa kategori, dan bawaan "dianggap Modal" sudah aman. Kategori hanya dikirim kalau berubah (L87) — item/barang/surat lama yang cuma punya teks tidak dikosongkan diam-diam.
5. **Urutan kunci**: baris master kategori (FOR SHARE) SELALU sebelum baris pemakai — `updateAset` menyelesaikan kategori sebelum mengunci item; hapus/ubah jenis mengunci master dulu baru melepas tautan.
6. **Hapus**: jenis/induk → tautan id di item, barang, surat dilepas (teks tetap); kelompok KIB yang masih dipakai jenis, barang, rencana, atau surat ditolak dengan jumlahnya; induk & kelompok bawaan tidak bisa dihapus.
7. **Ganti nama jenis menjalar** ke teks pemakai tanpa menaikkan angka kunci (label, bukan isi); **pindah induk** melepas tautan pemakai (Modal/bukan milik keputusan tiap item).
8. **Migrasi**: teks kategori surat penawaran yang bukan nama induk dipindah ke `jenis_kategori` — dibiarkan, ia terbaca sebagai induk yang tidak ada dan Simpan surat berikutnya ditolak.
9. **Pencarian rekening BLUD** (`GET /api/buku-besar-aset/kategori?rekening=`) hanya untuk penyunting Master; daftar kategori (`GET`) untuk semua pemegang BBA.
10. **Belum dikerjakan**: tombol saringan kategori di layar Cetak (API `aset/excel?jenis=RENCANA&kategori=` dan `unduh?kategori=` sudah menerimanya), kolom kategori di antrean Tempatkan, dan `ModalImporKib`/penentu golongan dari `kelompok_kib` saat Tempatkan (golongan tetap dipilih petugas).
