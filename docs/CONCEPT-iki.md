# CONCEPT — Modul IKI (Indikator Kinerja Individu)

> Status: **KONSEP — belum implementasi** · Disusun 2026-07-14 · **Rev 2** (ralat user: set referensi diganti 5 PDF)
> Referensi bentuk output PDF **dan** Excel (WAJIB sama persis border & kolom) — semua scan di `C:\Users\HP VICTUS\Downloads\`:
> 1. `Copy of IKI DIREKTUR 2026.pdf` — **varian DIREKTUR (8 kolom)**
> 2. `INDIKATOR KINERJA INDIVIDU WADUM.pdf` — varian STANDAR (11 kolom)
> 3. `IKI Kabid pelayanan Medis_ 2026.pdf` — varian STANDAR
> 4. `IKI KABAG RENBANG 2026.pdf` — varian STANDAR
> 5. `IKI KASUBAG PROGRAM 2026.pdf` — varian STANDAR
>
> ⚠ File `DIR WADUM/WADIR PELAYANAN.xlsx` (10 kolom, rev 1) **TIDAK dipakai lagi** sebagai acuan layout — tergantikan PDF WADUM 11 kolom.

---

## 1. Ringkasan

Aplikasi baru **IKI** — pola modul mirip **Perjanjian Kinerja** (form + finalize + download), output **PDF + Excel** dengan layout tabel identik referensi: header 2 baris ber-**fill abu-abu**, baris penomoran kolom, border thin, merge/rowspan persis.

Kolom **"Rencana Hasil Kerja yang diintervensi"** dan **"Rencana Hasil Kerja"** bisa ditarik dari aplikasi **Rencana Aksi** (`rencana_aksi`: sasaran → program → kegiatan → sub-kegiatan) meniru pola import PK (`app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts`), plus **kaskade dari IKI atasan**.

---

## 2. Anatomi dokumen (hasil bedah 5 PDF referensi)

### 2.1 Struktur halaman (semua varian)

```
                INDIKATOR KINERJA INDIVIDU          ← judul center bold
I   DATA PRIBADI
    OPD      : RSJD dr. Amino Gondohutomo Provinsi Jawa Tengah
    Nama     : <nama + gelar>
    NIP      : <NIP>
    Jabatan  : <jabatan>
    Ikhtisar : <ikhtisar jabatan, multi-baris>
II  FORM INDIKATOR KINERJA INDIVIDU
    <TABEL UTAMA>
    <BLOK TANDA TANGAN — beda per varian, lihat 2.4>
```

### 2.2 Varian STANDAR — 11 kolom (Wadir, Kabid, Kabag, Kasubag)

Header 2 baris (fill abu-abu) + 1 baris penomoran `1..11` (abu-abu juga):

| # | Kolom | Isi | Merge |
|---|---|---|---|
| 1 | No. | nomor grup RHK-diintervensi | rowspan seluruh grup |
| 2 | Rencana Hasil Kerja yang diintervensi | RHK atasan | rowspan grup — 1 grup bisa >1 RHK (WADUM no.1 & no.3, Kabag no.5, Kasubag no.1 & no.3) |
| 3 | Rencana Hasil Kerja | RHK individu | rowspan 4 TW |
| 4 | *(header gabungan "Indikator Kinerja Individu")* | aspek: `a. Kuantitatif` · `b. Progres Positif/Akumulatif/Progres Negatif/Pengulangan` · `c. Utama/Penunjang` | rowspan 4 TW |
| 5 | *(lanjutan)* | teks indikator IKI | rowspan 4 TW |
| 6 | Target Tahunan | `100%`, `93%`, `1 Dok`, `2 keg`, `765 Orang` | rowspan 4 TW |
| 7 | Formulasi & Ekspetasi Pimpinan | `Formulasi : …` + `Ekspektasi Pimpinan : …` | rowspan 4 TW |
| 8 | *(header gabungan "Target Triwulan")* | cara hitung: `Progres Positif` / `Akumulatif` / dst | rowspan 4 TW (merged) |
| 9 | *(lanjutan — 2 sub-kolom fisik)* | romawi `I..IV` + nilai target TW | per TW |
| 10 | Rencana Aksi Triwulan — Uraian | uraian per TW (boleh kosong) | per TW |
| 11 | Rencana Aksi Triwulan — Target | `1 Dokumen`, `0` | per TW |

Catatan header: `Indikator Kinerja Individu` men-span kolom 4-5; `Target Triwulan` men-span kolom 8-9; `Rencana Aksi Triwulan` men-span 10-11 dengan sub-header baris-2 `Uraian` | `Target`.

### 2.3 Varian DIREKTUR — 8 kolom (pejabat puncak, tanpa atasan)

| # | Kolom | Beda dari STANDAR |
|---|---|---|
| 1 | No. | sama |
| 2 | Rencana Hasil Kerja | **TANPA kolom "yang diintervensi"** (Direktur tidak punya atasan) |
| 3 | Indikator Kinerja Individu | tetap 2 sub-kolom fisik (aspek + indikator) tapi **1 nomor kolom (3)** |
| 4 | Target Tahunan | sama |
| 5 | Formulasi | **hanya "Formulasi"** — tanpa "& Ekspetasi Pimpinan" |
| 6 | Target Triwulan | romawi + nilai — **TANPA kolom cara-hitung merged** |
| 7 | Rencana Aksi Triwulan — Uraian | sama |
| 8 | Target | sama |

### 2.4 Blok tanda tangan

| Varian | Kiri | Kanan |
|---|---|---|
| STANDAR | `Mengetahui` + jabatan atasan + ttd + nama/pangkat/NIP | `Semarang, <tanggal>` + jabatan ybs + ttd + nama/pangkat/NIP (WADUM: `Semarang, 15 Januari 2026`; Kabag: `Semarang, 16 Februari 2026`) |
| DIREKTUR | — (kosong) | `Mengetahui, <tanggal>` + `DIREKTUR RSJD dr. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH` + ttd + nama/pangkat/NIP — **ttd tunggal** |

Blok ttd boleh jatuh di halaman lanjutan (WADUM hlm 3 hanya berisi ttd).

### 2.5 Detail visual yang wajib direplikasi

- Header + baris penomoran: **fill abu-abu muda**, teks bold, center.
- Border thin hitam semua sisi, hanya area tabel; Data Pribadi & ttd tanpa border.
- Orientasi **landscape** (A4/F4), tabel bisa pecah multi-halaman (baris TW tidak boleh terpotong tanggung — page break di batas grup/TW).
- Nilai TW campuran: `25%`, `191 Orang`, `1 Dok`, `0`, `4,02` (desimal koma Indonesia).
- Format tanggal ttd: `<Kota>, <d MMMM yyyy>`.

---

## 3. Data model (MySQL — draft DDL, final saat implementasi)

> Ikuti aturan: tambah ke `docs/schema-mysql.sql` + `docs/migrations/migration-iki.sql`.

```sql
CREATE TABLE iki_dokumen (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tahun           VARCHAR(4) NOT NULL,
  varian          ENUM('STANDAR','DIREKTUR') NOT NULL DEFAULT 'STANDAR',
  -- Data Pribadi (snapshot — dokumen harus beku)
  opd             VARCHAR(255) NOT NULL DEFAULT 'RSJD dr. Amino Gondohutomo Provinsi Jawa Tengah',
  nama            VARCHAR(255) NOT NULL,
  nip             VARCHAR(50)  NOT NULL,
  jabatan         VARCHAR(255) NOT NULL,
  pangkat         VARCHAR(100) NULL,
  ikhtisar        TEXT NULL,
  -- Atasan (blok "Mengetahui") — NULL semua utk varian DIREKTUR
  nama_atasan     VARCHAR(255) NULL,
  nip_atasan      VARCHAR(50)  NULL,
  jabatan_atasan  VARCHAR(255) NULL,
  pangkat_atasan  VARCHAR(100) NULL,
  kota_ttd        VARCHAR(100) NOT NULL DEFAULT 'Semarang',
  tanggal_ttd     DATE NULL,
  atasan_dokumen_id INT NULL,       -- soft-FK ke iki_dokumen atasan (kaskade RHK) — L68 cek eksistensi
  status          ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  version         INT NOT NULL DEFAULT 0,   -- L48 CAS optimistic lock
  created_by INT NULL, updated_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iki_nip_tahun (nip, tahun)
);

CREATE TABLE iki_rhk (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  dokumen_id      INT NOT NULL,            -- FK CASCADE iki_dokumen
  no_urut         INT NOT NULL,            -- kolom "No." (rowspan grup)
  rhk_intervensi  VARCHAR(500) NULL,       -- kolom 2 STANDAR; NULL utk DIREKTUR
  rhk             VARCHAR(500) NOT NULL,
  aspek_a         VARCHAR(50) NOT NULL DEFAULT 'Kuantitatif',
  aspek_b         ENUM('Akumulatif','Progres Positif','Progres Negatif','Pengulangan') NOT NULL,
  aspek_c         ENUM('Utama','Penunjang') NOT NULL DEFAULT 'Utama',
  indikator       VARCHAR(500) NOT NULL,
  target_tahunan  VARCHAR(50)  NOT NULL,   -- VARCHAR: "100%","1 Dok","765 Orang","4,02"
  formulasi       TEXT NULL,
  ekspektasi      TEXT NULL,               -- NULL utk varian DIREKTUR
  renaksi_id      INT NULL,                -- soft-FK jejak asal rencana_aksi.id (L68)
  atasan_rhk_id   INT NULL,                -- soft-FK jejak asal iki_rhk atasan (kaskade)
  urutan          INT NOT NULL DEFAULT 0
);

CREATE TABLE iki_rhk_triwulan (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  rhk_id      INT NOT NULL,                -- FK CASCADE iki_rhk
  triwulan    TINYINT NOT NULL,            -- 1..4
  target_tw   VARCHAR(50) NOT NULL DEFAULT '0',
  uraian      TEXT NULL,
  target_aksi VARCHAR(50) NOT NULL DEFAULT '0',
  UNIQUE KEY uk_iki_tw (rhk_id, triwulan)
);
```

Prinsip:
- **Akses (KEPUTUSAN user 2026-07-14)**: `isIkiRole` = `SUPER_ADMIN` + `ADMIN` default; role lain via grant `app_access:'iki'` di Admin Panel (pola G31 standar). Kolaboratif tanpa ownership per-record (AUTHZ-02).
- **Tanpa realisasi (KEPUTUSAN user)**: murni dokumen perencanaan target — tidak ada kolom/fitur realisasi TW.
- **Snapshot, bukan live-link** — teks dari Renaksi/IKI-atasan disalin; dokumen FINAL beku. `renaksi_id`/`atasan_rhk_id`/`atasan_dokumen_id` hanya jejak.
- `varian` menentukan layout & validasi Zod: `DIREKTUR` → `rhk_intervensi`/`ekspektasi`/atasan wajib NULL; `STANDAR` → wajib isi.
- `target_*` VARCHAR karena format campuran; angka+satuan disusun helper `fmtTarget` seperti PK.
- Save nested = **`withTransaction` + `bulkInsert`** replace-per-dokumen (CQ-01); JANGAN loop `await sql`.
- FINAL immutable (pola `pk_dokumen`/`lkjip`), unlock hanya SUPER_ADMIN.
- App flag `app_status_iki` · app_access key `iki` · kolaboratif role+app_access tanpa ownership per-record (AUTHZ-02).

---

## 4. Integrasi Rencana Aksi + kaskade IKI

### 4.1 Import dari Rencana Aksi
Endpoint `GET /api/iki/import-renaksi?tahun=` — clone pola PK import-renaksi:

| Kolom IKI | Sumber `rencana_aksi` |
|---|---|
| RHK yang diintervensi | `level='sasaran'` → nama sasaran |
| Rencana Hasil Kerja | `outcome_program`/`outcome_kegiatan`/`outcome_sub_kegiatan` (fallback nama) |
| Indikator | `indikator` |
| aspek_b / cara hitung TW | `jenis` — **enum identik 1:1** (`Akumulatif/Progres Positif/Progres Negatif/Pengulangan`) |
| Target Tahunan | `fmtTarget(target_tahunan, satuan)` |
| Target TW I–IV | `q1..q4_target` (+ satuan) |

UI: modal picker hierarki (reuse pola `buildHierarchyRows` Renaksi) + filter tahun; hasil prefill, tetap editable (uraian renaksi TW & formulasi/ekspektasi manual).

### 4.1b Autofill Data Pribadi & Atasan (KEPUTUSAN user)
Sumber pejabat = **`pk_pejabat` (reuse dari modul PK)** sebagai suggest/autofill (nama, jabatan, pangkat, NIP per unit per tahun) **plus input manual bebas** — field tetap editable & bisa diisi dari nol tanpa harus terdaftar di PK. Tidak ada master pejabat baru khusus IKI.
`tanggal_ttd` diisi lewat **date picker kalender** di editor (default kosong; format render `<Kota>, <d MMMM yyyy>`).

### 4.2 Kaskade antar-IKI (terbukti di 5 contoh)
Rantai: **Direktur** (puncak, RHK ← sasaran renaksi) → **Wadir** mengintervensi RHK Direktur → **Kabid/Kabag** mengintervensi RHK Wadir → **Kasubag** mengintervensi RHK Kabag.
Picker kolom 2 punya **2 tab**: "Dari Rencana Aksi" (sasaran) dan "Dari IKI Atasan" (`iki_rhk` dokumen `atasan_dokumen_id`, tahun sama).

---

## 5. Output PDF + Excel — border sama persis

Satu **layout descriptor** bersama `lib/iki/layout.ts` — definisi kolom (key, judul, lebar relatif, merge behavior) per varian `STANDAR`(11)/`DIREKTUR`(8) — dikonsumsi kedua generator agar selalu sinkron:

- **PDF** → `jspdf + jspdf-autotable` (sudah ada, dipakai BLUD): landscape, `rowSpan`/`colSpan`, border thin, **header fill abu-abu**, page-break di batas baris TW, blok ttd sesuai varian (STANDAR 2 ttd / DIREKTUR 1 ttd kanan), boleh jatuh ke halaman lanjutan.
- **Excel** → `exceljs` (sudah ada): grid sama dari descriptor — merges, border thin TBLR, fill abu header+baris penomoran, wrap text, lebar kolom proporsional referensi, landscape print setup (`pageSetup: orientation landscape, fitToWidth 1`).

**DoD presisi**: hasil generate dibanding side-by-side 5 PDF referensi — jumlah & nomor kolom, teks header, pola merge, border, fill abu, blok ttd per varian harus tak terbedakan secara struktur.

---

## 6. Arsitektur file (rencana)

```
app/(dashboard)/iki/
  layout.tsx · page.tsx · iki-client.tsx     ← daftar dokumen per tahun (pola PK/LKJIP)
  [id]/page.tsx · editor-client.tsx          ← editor: Data Pribadi + tabel RHK nested TW
app/api/iki/
  _guard.ts (isIkiRole)
  route.ts                                   ← list/create/delete dokumen
  [id]/route.ts                              ← detail + save (withTransaction, CAS)
  [id]/finalize/route.ts                     ← DRAFT→FINAL
  [id]/download/route.ts                     ← ?format=pdf|xlsx
  import-renaksi/route.ts                    ← GET picker Renaksi
  import-atasan/route.ts                     ← GET RHK dari IKI atasan (kaskade)
lib/data/iki.ts + lib/data/iki-schemas.ts    ← data layer + Zod sentral + ikiRateLimit
lib/iki/layout.ts                            ← layout descriptor (varian STANDAR/DIREKTUR)
lib/iki/export-pdf.ts · export-excel.ts      ← generator
docs/migrations/migration-iki.sql
```

Kepatuhan wajib: Zod semua cabang tulis (L68) · `sqlInt` LIMIT/OFFSET (L66) · audit `IKI_CREATE/UPDATE/FINALIZE/DOWNLOAD/IMPORT_RENAKSI/IMPORT_ATASAN` · PrimaButton + confirmDialog + tooltip standar + token DESIGN-SYSTEM · monospace utk angka · AUTHZ-02.

---

## 7. Fase implementasi (usulan)

| Fase | Isi | Output |
|---|---|---|
| 1 | Migration + schema + data layer + guard + Zod | CRUD API jalan |
| 2 | UI daftar + editor (grup RHK + TW, varian STANDAR/DIREKTUR) | dokumen bisa disusun manual |
| 3 | Import Renaksi + kaskade IKI Atasan | kolom 2-3 otomatis |
| 4 | `lib/iki/layout.ts` + export PDF (validasi vs 5 referensi) → Excel | download identik referensi |
| 5 | Finalize/immutable + riwayat + audit + polish (+ Rima provider opsional) | rilis |

---

## 8. Keputusan desain (jawaban user 2026-07-14)

1. ✅ **Varian layout** (Rev 2): 2 varian — `DIREKTUR` (8 kolom, ttd tunggal) & `STANDAR` (11 kolom, 2 ttd) untuk semua pejabat lain.
2. ✅ **Pengisi**: `SUPER_ADMIN` + `ADMIN` (Admin Staff) default; role lain bisa diberi akses lewat manajemen aplikasi Admin Panel (`app_access:'iki'`).
3. ✅ **Master pejabat**: reuse `pk_pejabat` sebagai autofill/suggest **+ boleh input manual** (buat baru langsung di form, tanpa wajib terdaftar).
4. ✅ **Tanpa realisasi** — murni dokumen perencanaan target.
5. ✅ **Tanggal ttd**: dipilih via **date picker kalender** di editor.

Sisa terbuka (bisa diputuskan saat implementasi, default diusulkan):
- **Hierarki kaskade atasan**: default = **pilih manual** dokumen IKI atasan lewat dropdown saat buat/edit dokumen (`atasan_dokumen_id`) — tanpa hardcode urutan jabatan & tanpa master mapping baru. Sederhana dan fleksibel terhadap perubahan struktur organisasi.
