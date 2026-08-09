# TUTORIAL & ALUR APLIKASI BLUD — PRIMA
> RSJD Dr. Amino Gondohutomo · Modul **BLUD** (`/blud`)
> Panduan A–Z dari login sampai output cetak & SPJ bulanan. Nama tombol di bawah **persis** seperti di aplikasi.
> Terakhir diperbarui: **2026-07-28** — pembagian peran × menu, saldo awal tahun (R3),
> sakelar mati modul (S4), dan rem GET + throttle audit-view (R4). Seluruh temuan
> audit BLUD v1.2 sudah ditutup.

**Akses**: `SUPER_ADMIN` / `ADMIN` (`isBludRole`), atau role lain yang diberi `app_access: 'blud'` lewat Admin Panel.
Rincian gerbang akses per-endpoint → [§9 Guard & Keamanan](#9-guard--keamanan-lengkap).

---

## 1. Peta Modul (11 menu, 6 grup)

| Grup | Menu | URL | Fungsi singkat |
|---|---|---|---|
| **NAVIGASI** | Beranda | `/blud` | Dashboard KPI + riwayat 5 versi terbaru DPA & Pergeseran |
| **DATA INDUK** | Master Akun | `/blud/master-akun` | Daftar akun belanja + kode rekening |
| **DATA INDUK** | Kode Besar | `/blud/kode-besar` | Kerangka standar BLUD (L1→L2→L2.1) — template DPA |
| **DATA INDUK** | Penanggung Jawab | `/blud/penanggung-jawab` | Daftar Kasubbag/Kasi/Kabid untuk kolom PJ di DPA |
| **ANGGARAN** | DPA BLUD | `/blud/dpa` | Susun Dokumen Pelaksanaan Anggaran (pohon L1→L8.1) |
| **ANGGARAN** | Pergeseran DPA | `/blud/pergeseran` | Geser anggaran antar-baris (pagu tetap) |
| **PENATAUSAHAAN** 🆕 | Buku Kas | `/blud/buku-kas` | Catat transaksi kas/bank harian (BKU) + pembebanan ke baris anggaran |
| **PENATAUSAHAAN** 🆕 | Bukti Setor | `/blud/bukti-setor` | Rakit slip "BUKTI SETOR KE BANK BPD" — baris dari BKU atau ketikan lepas |
| **PENATAUSAHAAN** 🆕 | Realisasi | `/blud/realisasi` | Pantau pagu vs serapan per rekening + register per baris |
| **PENATAUSAHAAN** 🆕 | Tutup Kas | `/blud/tutup-kas` | Berita Acara Pemeriksaan Kas + periode GU + unduh SPJ 11 lembar |
| **OUTPUT** | Cetak | `/blud/cetak` | Preview + cetak/ekspor DPA, PJ, Rekap Pergeseran, Master Akun |
| **SISTEM** | Pengaturan | `/blud/pengaturan` | Pejabat penanda tangan SPJ + hapus/kelola versi DPA & Pergeseran |

> **Ribbon**: 12 tile, `MAX_INLINE_TILES = 11` di `blud-shell.tsx` — satu slot selalu disisakan untuk tombol "Lainnya", jadi 10 tile pertama tampil dan tepat **Cetak** & **Pengaturan** yang turun ke dropdown. Tile yang sedang aktif selalu dipromosikan ke ribbon walau posisinya di overflow.

> **Urutan pemakaian yang benar**: **Data Induk** (sekali di awal) → **DPA** → **Pergeseran** → **Buku Kas** (harian) → **Realisasi** (pantau) → **Tutup Kas** (akhir bulan) → **Cetak / SPJ**.

---

## 2. Flowchart Alur Besar (A–Z)

```mermaid
flowchart TD
    A([Login]) --> B[Menu utama → kartu BLUD]
    B --> S4{Modul dimatikan admin?<br/>app_status_blud}
    S4 -->|Ya, dan bukan SUPER_ADMIN| MT[/maintenance<br/>kartu abu · URL langsung ikut dibelokkan<br/>API balas 503 MODUL_MATI/]
    S4 -->|Tidak| PR{Peran ini boleh<br/>menu apa saja?}
    PR --> C[/blud · Beranda<br/>ribbon hanya memasang tile yang terbuka/]

    C --> F0{Data Induk<br/>sudah lengkap?}
    F0 -->|Belum| SETUP
    F0 -->|Sudah| DPA

    subgraph SETUP [FASE 1 · SETUP DATA INDUK · sekali di awal]
        direction TB
        MA[Master Akun<br/>daftar akun + kode rekening] --> KB[Kode Besar<br/>kerangka L1/L2/L2.1] --> PJ[Penanggung Jawab<br/>daftar Kasubbag/Kasi/Kabid]
        PJ --> PS[Pengaturan → Pejabat SPJ<br/>Direktur · Bendahara · PPK-BLUD]
    end
    SETUP --> DPA

    subgraph DPA [FASE 2 · SUSUN DPA BLUD · /blud/dpa]
        direction TB
        D1[Form Baru → template dari Kode Besar] --> D2[Kurasi baris → Buat Form n]
        D2 --> D3[Isi Uraian via Master Akun → kode auto<br/>Vol/Satuan/Harga di baris leaf]
        D3 --> D4[Tambah Sub Level / Level Sama<br/>atau Import dari Usulan]
        D4 --> D5[Set Penanggung Jawab per baris]
        D5 --> D6{Sentinel<br/>bersih?}
        D6 -->|Konflik PJ / entri ganda| D7[Perbaiki lewat chip banner] --> D5
        D6 -->|Bersih| D8[Simpan]
    end
    DPA --> V{Server cek}
    V -->|409 VERSION_CONFLICT| VR[Reload] --> DPA
    V -->|409 SAFETY_THRESHOLD| VW[Konfirmasi 'Ya, Tetap Simpan']
    V -->|OK| VS[(Versi tanggal hari ini tersimpan<br/>anggaran_key jadi jangkar realisasi)]
    VW --> VS

    VS --> PG
    subgraph PG [FASE 3 · PERGESERAN DPA · /blud/pergeseran]
        direction TB
        P1[Buat Pergeseran → tarik dari versi DPA terbaru] --> P2[Geser vol/harga antar-baris]
        P2 --> P3[Sinkronkan DPA / Inject]
        P3 --> P4{Total berimbang<br/>terhadap pagu?}
        P4 -->|Belum imbang| P5[Simpan sebagai Draft] --> P2
        P4 -->|Imbang| P6[Simpan → versi Pergeseran]
    end
    PG --> PGC{Pagu turun di bawah<br/>realisasi yang sudah terjadi?}
    PGC -->|Ya| PGD[Modal peringatan + alasan wajib<br/>audit BLUD_PAGU_DIBAWAH_REALISASI]
    PGC -->|Tidak| PEN
    PGD --> PEN

    subgraph PEN [FASE 4 · PENATAUSAHAAN HARIAN 🆕]
        direction TB
        K1[Buku Kas → Transaksi Baru] --> K2[Isi tanggal/jenis/uraian + kas/bank]
        K2 --> K3{Jenis = BELANJA?}
        K3 -->|Ya| K4[Bebankan ke baris anggaran<br/>bisa dibagi ke beberapa baris]
        K3 -->|Tidak| K7
        K4 --> K5{Pagu cukup?}
        K5 -->|409 PAGU_TERLAMPAUI| K6[Ajukan Pergeseran → notif ke pemegang DPA<br/>atau centang 'parkir' transaksi]
        K6 --> PG
        K5 -->|Cukup| K7[Simpan → server beri No. Kwt berurutan]
        K7 --> BS[Bukti Setor: rakit slip setor BPD<br/>baris dari BKU atau ketikan lepas]
        BS --> K8[Realisasi: pantau pagu vs serapan<br/>klik uraian → panel Register]
    end
    PEN --> TUT

    subgraph TUT [FASE 5 · TUTUP BULAN 🆕 · /blud/tutup-kas]
        direction TB
        T0{Bulan Januari DAN<br/>belum ada bulan yang ditutup?}
        T0 -->|Ya| T0A[Sisi A jadi isian: saldo awal tahun<br/>Simpan saldo awal → audit lama → baru]
        T0 -->|Tidak| T1
        T0A --> T1
        T1[Isi sisi nyata: uang tunai + saldo rekening koran] --> T2[Simpan Pemeriksaan]
        T2 --> T3{Selisih = Rp 0<br/>DAN tanpa penghalang?}
        T3 -->|Ada baki 'Perlu Rekening'| T4[Sambungkan transaksi terparkir] --> T1
        T3 -->|Bulan sebelumnya belum ditutup| T5[Tutup dari bulan terdepan] --> T1
        T3 -->|Selisih ≠ 0| T6[Cocokkan lagi — tidak ada kotak penyesuaian] --> T1
        T3 -->|Bersih| T7[Catat Periode GU opsional] --> T8[Tutup Bulan]
        T8 --> T9[(blud_periode = TUTUP<br/>semua tulis ke bulan itu ditolak<br/>saldo awal tahun ikut BEKU)]
        T9 --> T10[Unduh SPJ Bulanan · 11 lembar .xlsx]
    end
    TUT --> OUT

    subgraph OUT [FASE 6 · OUTPUT & PEMELIHARAAN]
        direction TB
        O1[Cetak → pilih Menu + View → Cetak] --> O2[Ekspor PDF / Excel]
        O3[Pengaturan → Pejabat SPJ + hapus/kelola versi]
        O4[SUPER_ADMIN/ADMIN/KEUANGAN: Buka Kembali periode<br/>wajib alasan ≥10 karakter → audit]
    end
    OUT --> Z([Selesai])
```

---

## 3. FASE 1 — Setup Data Induk

Ketiga menu Data Induk pakai pola tabel yang sama: **tambah baris → edit inline → Simpan**. Bisa juga **impor dari file**. Simpan bersifat *replace-all* (seluruh tabel jadi 1 versi utuh).

### 3.1 Master Akun (`/blud/master-akun`)
| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | Tombol tambah baris | Klik → baris kosong muncul & fokus | Baris baru siap diisi |
| 2 | Kolom **Kode** & **Uraian** | Ketik kode rekening + nama akun | Tersimpan di state |
| 3 | Impor file | Pilih file (`handleFile`) | Isi tabel dari file |
| 4 | Ikon hapus baris | Klik | Baris dibuang |
| 5 | **Simpan** | Klik | Semua baris tersimpan (jadi sumber MasterAkunCombobox di DPA) |

> **Kenapa penting**: kolom **Uraian** di DPA mengambil dari sini, dan **Kode Rekening** terisi otomatis (read-only) begitu akun dipilih.

### 3.2 Kode Besar (`/blud/kode-besar`)
Sama seperti Master Akun, **plus** kolom **Level** & **Induk (parent_kode)** dan tombol **geser atas/bawah**.

| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | Kolom **Level** | Pilih `L1` / `L2` / `L2.1` | Menentukan posisi hierarki |
| 2 | Kolom **Induk** | Pilih kode induk | Membentuk pohon L1→L2→L2.1 |
| 3 | Panah **↑ / ↓** | Geser urutan baris | Atur susunan tampil |
| 4 | **Simpan** | Klik | Jadi **template** saat klik "Form Baru" di DPA |

> Seed awal 8 baris standar BLUD (5.X / 5.1 / 5.2 / 5.1.1 / …) sudah tersedia. Kalau Kode Besar kosong, DPA tidak bisa buat form baru — muncul modal **"Belum ada data Kode Besar"** → tombol **"Buka Kode Besar"**.

### 3.3 Penanggung Jawab (`/blud/penanggung-jawab`)
Tabel 1 kolom **Label** (nama jabatan). Seed 13 default Kasubbag/Kasi/Kabid.

| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | Tambah baris → isi **Label** | Ketik nama jabatan | Muncul di dropdown PJ DPA |
| 2 | Panah ↑ / ↓ | Atur urutan | Urutan dropdown |
| 3 | **Simpan** | Klik | Jadi opsi `PenanggungJawabCombobox` di DPA |

### 3.4 Pejabat Penanda Tangan SPJ (`/blud/pengaturan` → panel atas) 🆕
Tiga peran yang tanda tangannya muncul di lembar SPJ, pengantar, dan Tutup Kas: **Direktur**, **Bendahara Pengeluaran**, **PPK-BLUD** — disimpan **per tahun anggaran**.

| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | **"Ambil dari PK"** | Klik | Saran nama/NIP/pangkat dari master `pk_pejabat` tahun tsb |
| 2 | Kolom Nama / NIP / Pangkat / Jabatan (teks) | Ketik atau perbaiki | Isian bebas — bisa berbeda dari PK |
| 3 | **Simpan** | Klik | Replace-all per tahun · audit `BLUD_PEJABAT_SIMPAN` |

> **Keputusan #29 — yang disimpan SALINAN, bukan rujukan.** Jalur cetak tidak pernah JOIN ke `pk_pejabat`, supaya SPJ yang sudah ditandatangani tidak ikut berubah saat master PK diperbarui tahun berikutnya. `pk_pejabat_id` hanya jejak asal.
> Bendahara Pengeluaran & PPK-BLUD memang **tidak ada** di `pk_pejabat` (itu hanya jabatan struktural), jadi bunyi jabatannya diketik manual.

---

## 4. FASE 2 — Susun DPA BLUD (`/blud/dpa`)

Inti modul. DPA = pohon hierarki **Level 1 → Level 8.1** (chain rule ketat): **baris leaf (✎)** bisa input vol/harga, **baris induk** = agregator otomatis (jumlah induk = Σ anak).

```mermaid
flowchart TD
    S1[Toolbar: VersiDropdown '— Pilih Versi —'] --> S2{Mulai dari?}
    S2 -->|Versi lama| S3[Pilih tanggal → load snapshot]
    S2 -->|Baru| S4[Form Baru]
    S4 --> S5{Kode Besar ada?}
    S5 -->|Kosong| S6[Modal 'Belum ada data Kode Besar' → Buka Kode Besar]
    S5 -->|Ada| S7[Overlay 'Buat Form DPA — Pilih Baris']
    S7 --> S8[Kurasi baris ↑↓ / hapus → 'Buat Form n']
    S8 --> S9{Editor lama berisi?}
    S9 -->|Ya| S10[Modal 'Ganti form sekarang?' → 'Ya, Ganti Form']
    S9 -->|Tidak| S11[Kerangka L1/L2/L2.1 terbentuk]
    S10 --> S11
    S3 --> EDIT
    S11 --> EDIT[Edit tabel DPA]
    EDIT --> E1[Uraian = MasterAkunCombobox → Kode Rekening auto]
    E1 --> E2[Vol / Satuan / Harga di baris leaf → Jumlah otomatis]
    E2 --> E3[Kebab Aksi per baris]
    E3 --> E4[Tambah Sub Level / Tambah Level Sama / Import dari Usulan / Hapus Baris]
    E4 --> E5[Kolom Penanggung Jawab '— Pilih PJ —']
    E5 --> E6{Sentinel}
    E6 -->|Konflik PJ chain| E7[PjConflictDialog / banner 'n konflik PJ']
    E6 -->|Entri ganda| E8[Banner 'n kemungkinan entri ganda' → klik chip lompat]
    E6 -->|Bersih| E9[Simpan]
    E7 --> E5
    E8 --> EDIT
    E9 --> CK{Server}
    CK -->|409 VERSION_CONFLICT| R1[Toast 'Data sudah diubah pengguna lain' → reload]
    CK -->|409 SAFETY_THRESHOLD| R2[Modal 'Peringatan: Drop Banyak Baris' → 'Ya, Tetap Simpan']
    CK -->|OK| R3[(Versi tanggal hari ini → history → sumber Pergeseran & Realisasi)]
    R2 --> R3
```

### 4.1 Langkah detail DPA
| No | Tombol/elemen PERSIS | Aksi | Hasil |
|---|---|---|---|
| 1 | **VersiDropdown** "— Pilih Versi —" | Pilih tanggal versi | Load snapshot versi itu (`GET /api/blud/dpa?tanggal=`) |
| 2 | **"Form Baru"** (ungu) / **"Mulai Form DPA Baru"** (empty state) | Klik | Ambil template Kode Besar → overlay pilih baris |
| 3 | Overlay **"Buat Form DPA — Pilih Baris"**: panah ⬆⬇, hapus, footer **"Buat Form (n)"** | Kurasi baris template | Bangun kerangka L1→L2→L2.1 |
| 4 | Kolom **Uraian** = `MasterAkunCombobox` | Ketik/cari akun | Uraian + **Kode Rekening** (read-only) terisi atomik |
| 5 | Kolom **Vol / Satuan / Harga (Rp)** (hanya leaf ✎) | Isi angka | **Jumlah (Rp)** dihitung otomatis; jumlah induk = Σ anak |
| 6 | Kebab **Aksi** (`RowActionsMenu`) | Klik | **Tambah Sub Level** · **Tambah Level Sama** · **Import dari Usulan** · **Hapus Baris** |
| 7 | Modal **"Import dari Usulan Kebutuhan"** | Pilih mode | **"Isi baris ini"** (1 item timpa leaf) / **"Sisip baris baru"** (multi + Panel Susunan ◀▶↑↓) |
| 8 | Kolom **Penanggung Jawab** = `PenanggungJawabCombobox` "— Pilih PJ —" | Pilih PJ | Sentinel PJ cek konflik chain vertikal |
| 9 | Banner Sentinel (merah PJ / amber entri ganda) | Klik chip | Lompat ke baris bermasalah |
| 10 | Search **"Cari kode / uraian…"** + **"Jump"** · chip legenda level | Ketik/klik | Lompat + highlight; filter tampil level |
| 11 | **"Simpan"** (primary) | Klik | POST `/api/blud/dpa` — versi = tanggal hari ini (optimistic lock) |

### 4.2 Peringatan yang mungkin muncul saat Simpan
- **409 VERSION_CONFLICT** → orang lain sudah mengubah data → *reload* dulu.
- **409 SAFETY_THRESHOLD** (baris turun >50%) → modal **"⚠️ Peringatan: Drop Banyak Baris"** → **"Ya, Tetap Simpan"** kalau memang disengaja.
- Hapus baris induk yang punya anak → modal **"Tidak Bisa Menghapus"** → hapus anak-anaknya dulu.

### 4.3 `anggaran_key` — jangkar yang menyambung DPA ke realisasi 🆕
Tiap baris DPA punya `anggaran_key` (`AK-` + uuid) yang **tetap sama** lintas versi DPA maupun Pergeseran. Itulah yang dipakai transaksi Buku Kas untuk menunjuk baris anggaran.

Akibatnya yang perlu diketahui pengguna:
- Mengganti uraian/kode rekening sebuah baris **tidak memutus** realisasi yang sudah menempel.
- **Menghapus** baris yang sudah punya realisasi = memutus jangkarnya → di Realisasi baris itu muncul sebagai **yatim**, dan Pergeseran menolaknya lewat §4.3 (lihat [§6.3](#63-pagar-pagu-di-bawah-realisasi-43)).

### 4.4 Import dari Usulan (2 mode)
| Mode | Kapan | Perilaku |
|---|---|---|
| **Isi baris ini** (amber) | Anchor = baris leaf tanpa anak | 1 item radio menimpa uraian/vol/satuan/harga; kode rekening & PJ **dipertahankan**; baris berisi → konfirmasi **"Timpa"** |
| **Sisip baris baru** (ungu) | Mau menambah banyak baris | Multi-item → dock **"SUSUNAN (n)"**: ◀ naik level · ▶ turun level · ↑↓ urutan → parent dari susunan; **"Import (n)"** |

> Item yang **sudah ada** di form otomatis di-disable (anti-dobel). Kalau masih kembar, banner **"n kemungkinan entri ganda"** menunjukkannya (Sentinel Guard 3 lapis: modal disable → banner live → server `validateTreeIntegrity` 400).

---

## 5. FASE 3 — Pergeseran DPA (`/blud/pergeseran`)

Menggeser anggaran antar-baris **dengan pagu tetap** (total tidak berubah). Sumber data = versi DPA terbaru.

| No | Tombol PERSIS | Aksi | Hasil |
|---|---|---|---|
| 1 | **"Buat Pergeseran"** | Klik | Tarik struktur dari versi DPA terbaru sebagai basis |
| 2 | Tabel pergeseran (kolom vol_p / harga_p) | Geser angka antar-baris | Δ (delta) per baris dihitung |
| 3 | **"Sinkronkan DPA"** (Inject) | Klik → modal **"Inject DPA"** → **"Ya, Inject"** | Refresh kolom kode/uraian/vol/harga dari DPA terbaru **tanpa** mengubah vol_p/harga_p · audit `BLUD_INJECT_DPA` |
| 4 | **"Simpan"** | Klik | Kalau total **tidak berimbang** → dialog: *"pergeseran final wajib berimbang (pagu tetap)"* → **"Simpan sebagai Draft"** |
| 5 | Modal drop banyak baris | — | **"Ya, Tetap Simpan"** (sama seperti DPA) |
| 6 | Modal **pagu di bawah realisasi** 🆕 | Isi alasan → lanjut | Audit `BLUD_PAGU_DIBAWAH_REALISASI` (lihat §6.3) |

```mermaid
flowchart LR
    A[Buat Pergeseran] --> B[Geser vol_p/harga_p antar-baris]
    B --> C[Sinkronkan DPA / Inject]
    C --> D{Berimbang<br/>ke pagu?}
    D -->|Tidak| E[Simpan sebagai Draft] --> B
    D -->|Ya| F{Ada baris yang pagunya<br/>jatuh di bawah realisasi?}
    F -->|Ya| G[Alasan wajib → audit] --> H
    F -->|Tidak| H[(Simpan → versi Pergeseran · Δ net)]
```

> **Δ Pergeseran Net** yang tampil di Beranda = selisih total pergeseran terhadap DPA. Untuk versi *final* harus **0** (berimbang); yang belum imbang disimpan sebagai **Draft**.

> 🆕 **Begitu satu versi Pergeseran tersimpan, seluruh pagu tahun itu dibaca dari `pergeseran_dpa`** — DPA tidak dibaca lagi (`getPaguSumber` memeriksa Pergeseran lebih dulu). Karena Pergeseran disimpan *replace-all* (satu versi memuat semua baris), tidak ada baris yang hilang. Pil di layar Buku Kas & Realisasi ikut berubah jadi **"Pagu dari Pergeseran ‹tanggal›"**.

---

## 6. FASE 4 — Penatausahaan Harian 🆕

Tiga menu ini menggantikan berkas Excel BKU. **Satu-satunya titik input adalah Buku Kas**; Realisasi, register, pengantar, SPJ, dan Tutup Kas semuanya **turunan** — tidak ada ketik ulang di mana pun.

### 6.1 Buku Kas (`/blud/buku-kas`) — satu-satunya tempat mengetik

Toolbar: **TahunDropdown** · **dropdown bulan** · pil **"Pagu dari DPA/Pergeseran ‹tanggal›"** · pil **"Periode ditutup"** (kalau terkunci) · tombol **"Transaksi Baru"** (ungu).

Tabel BKU: `No · Tanggal · Kwt · Uraian · Rekening · Kas Masuk · Kas Keluar · Saldo Kas · Bank Masuk · Bank Keluar · Saldo Bank · Aksi`, ditutup baris **JUMLAH BULAN INI**.

#### Kolom Aksi tiap baris
| Tombol | Aktif kapan | Isi |
|---|---|---|
| 👁 **Lihat rincian** (abu) | **selalu**, termasuk saat bulannya sudah ditutup | Jendela baca-saja: jenis, uraian, arus kas, pembebanan per baris anggaran, dan **rincian potongan** (PPN/PPh + keterangan) beserta *"Diterima rekanan"* |
| ✏️ **Ubah** (kuning) | bulan masih terbuka | Membuka form transaksi |
| 🗑 **Hapus** (merah) | bulan masih terbuka | Konfirmasi dulu |

> **Kenapa Lihat tetap hidup saat bulan tertutup.** Sebelum tombol ini ada, satu-satunya
> jalan melihat rincian transaksi adalah tombol Ubah — dan tombol itu mati begitu bulannya
> ditutup. Akibatnya bulan yang paling sering diperiksa ulang ("PPh-nya waktu itu berapa?")
> justru yang paling tidak bisa dilihat. Jendelanya murni baca: tidak ada satu pun isian di
> dalamnya, jadi bulan tertutup tetap tidak bisa berubah dari sini.

#### Modal "Transaksi Baru"
| No | Elemen PERSIS | Aturan |
|---|---|---|
| 1 | **Tanggal** | `YYYY-MM-DD`, wajib, dan **harus di dalam bulan yang sedang dibuka** — kalender dibatasi, server menolak yang di luar (S1). Alasannya: BKU & Tutup Kas mengelompokkan dari kolom `bulan`, sedangkan lembar GU & register dari kolom `tanggal`. Kalau keduanya boleh beda, dua lembar dari data yang sama bisa tidak cocok |
| 2 | **Jenis** (`OpsiDropdown`) | `BELANJA` · `AMBIL_BANK` · `SETOR_BANK` · `PENERIMAAN` · `PENGEMBALIAN` · `LAIN` |
| 3 | **Uraian** | 1–2000 karakter, wajib |
| 4 | **Kas keluar / Bank keluar / Kas masuk / Bank masuk** | Minimal salah satu > 0. Kas masuk **dan** kas keluar bersamaan → ditolak (idem bank). `AMBIL_BANK`/`SETOR_BANK` wajib **netral**: nilai masuk = nilai keluar |
| 5 | Centang **"Rekeningnya belum ada di DPA — parkir transaksi ini"** | Muncul untuk **semua** jenis yang mengeluarkan uang. Transaksi masuk baki "Perlu Rekening"; **tidak boleh punya alokasi** |
| 6 | Dock **"PEMBEBANAN KE BARIS ANGGARAN"** → **"Pilih Rekening"** / **"Bagi ke Baris Lain"** | Satu kuitansi boleh dibebankan ke beberapa baris (kasus Belanja Modal). Maks 200 alokasi; satu baris tidak boleh muncul dua kali |
| 7 | Baris indikator **"Belanja Rp … · dialokasikan Rp … · pas / selisih Rp …"** | Total alokasi **wajib sama** dengan (kas keluar + bank keluar) |
| 8 | **Batal** / **Simpan** | Simpan → `POST /api/blud/realisasi/tx` |

> **No. Kwt tidak diketik.** Nomor kuitansi diberikan **server** berurutan per (tahun, bulan) dan hanya untuk jenis `BELANJA` — supaya dua penginput tidak pernah mendapat nomor yang sama (§5.4).

#### Aturan tunggal: `sifatAlokasi()` — dua arah, satu predikat
| Keadaan | Sifat | Artinya |
|---|---|---|
| Arus keluar jenis apa pun (`BELANJA`, `LAIN`, `PENERIMAAN`, …) | `WAJIB` | Harus dibebankan, alokasi **positif** |
| `AMBIL_BANK` / `SETOR_BANK` yang **timpang** | `WAJIB` | Itu bukan pemindahan — jenisnya salah pilih |
| `PENGEMBALIAN` dengan uang masuk | `WAJIB_KEMBALI` | Wajib menunjuk baris anggaran, alokasi **negatif** |
| `AMBIL_BANK` / `SETOR_BANK` yang **netral** (masuk = keluar) | `DILARANG` | Cuma pindah tempat |
| Transaksi **diparkir** | `DILARANG` | Memblokir Tutup Kas sampai dibereskan |
| Arus murni masuk | `DILARANG` | Tidak ada yang dibelanjakan |

> **Kenapa tidak cukup "hanya BELANJA yang dicek"** — itu bentuk lamanya, dan bocor: satu transaksi `LAIN` dengan kas keluar besar dan alokasi kosong lolos seluruh pagar pagu, tersimpan berstatus `NORMAL` (jadi **tidak** menghalangi Tutup Kas seperti transaksi terparkir), dan tidak pernah muncul di layar Realisasi. Uang keluar yang tidak membebani anggaran mana pun.
> **Dan kenapa arah sebaliknya ikut dijaga** — menambal hanya arah "wajib" meninggalkan kebalikannya menganga: alokasi yang menempel pada transaksi yang **tidak** mengeluarkan uang tetap mengunci dan menggerus pagu. Serapan naik tanpa belanja. Karena itu `DILARANG` **menolak** alokasi, bukan sekadar tidak mewajibkannya.
> Aturannya hidup di satu berkas — `lib/blud/alokasi-rule.ts` — dipakai **bersama** oleh Zod, `periksaKeseimbangan` di data layer, dan modal Buku Kas. Dipasang di data layer juga, bukan cuma Zod: `createTx`/`updateTx` fungsi terekspor yang bisa dipanggil skrip lain tanpa melewati skema. Regresi 2 lapis: `node scripts/test-blud-alokasi.mjs`.

#### Potongan pihak ketiga — PPN · PPh · koperasi · Baznas · BPJS TK 🆕
Pada transaksi **belanja**, dock **"POTONGAN PIHAK KETIGA"** menerima rincian pajak/potongan yang ditahan dari pembayaran lalu langsung disetorkan.

| Aturan | Alasan |
|---|---|
| **Tidak** mengurangi serapan, **tidak** menyentuh pagu | Pagunya sudah habis di baris belanja induknya — mencatatnya lagi = satu belanja menggerus anggaran dua kali |
| Hanya menempel pada transaksi bersifat `WAJIB` | Tidak ada yang bisa ditahan dari uang yang tidak dibayarkan |
| Jumlah potongan ≤ nilai pembayaran | Kalau lebih, ia berubah jadi arus keluar terselubung |
| Baris masuk/keluar di BKU/SPI **dibangkitkan saat cetak** | Sepasang, nilainya sama, lewat kolom yang sama dengan pembayaran induknya, tanpa no. kuitansi & tanpa kode rekening |

> **Kenapa bukan transaksi tersendiri** — di berkas asli tiap potongan ditulis dua baris (`ppn` masuk, `setor ppn` keluar) di hari yang sama, saldo naik lalu kembali ke angka semula. Itu satu kejadian uang, bukan tiga. Menyimpannya sebagai **rincian** membuat pasangannya mustahil pincang, ketikan berkurang lima kali lipat, dan **tidak perlu satu pun pengecualian** pada pagar di atas.

#### Pengembalian belanja 🆕
Jenis `PENGEMBALIAN`: uang kembali ke kas (kelebihan bayar, sisa panjar, barang batal). Alokasinya disimpan **negatif**, sehingga `SUM(nilai)` langsung mengurangi serapan tanpa cabang khusus di mana pun — termasuk di `pengantar`, `SPJ`, dan register.

- Di layar nilainya diketik **positif**; tandanya diberikan saat kirim.
- Kolom kas/bank **keluar** harus kosong — pengembalian hanya menerima uang.
- Pagar `SERAPAN_NEGATIF`: tidak boleh melebihi yang pernah terserap di baris itu, kalau tidak sisa anggaran melampaui pagunya sendiri.

#### Kalau pagu tidak cukup → 409 `PAGU_TERLAMPAUI`
Muncul panel jalan keluar:
- Tombol **"Ajukan Pergeseran"** → membuat permintaan + **notifikasi ke `__ADMIN__`** (semua ADMIN + SUPER_ADMIN) berisi tautan langsung ke menu Pergeseran tahun tsb. Audit `BLUD_PERMINTAAN_CREATE`.
- Atau centang **parkir** supaya saldo kas tetap benar sambil menunggu.

> **Sistem tidak pernah menaikkan pagu sendiri (§4.1).** Ia hanya mengantar permintaan; angkanya tetap ditentukan manusia di menu Pergeseran.

#### Baki "Perlu Rekening"
Banner **"n transaksi diparkir"** + tombol **"Buka Baki"**. Bakinya melihat **satu tahun penuh**, bukan bulan berjalan — transaksi yang diparkir di Mei tetap memblokir Tutup Kas di Juli. Dari baki: klik → modal terbuka dengan transaksi itu, tinggal dipilih rekeningnya dan centang parkir dilepas.

### 6.2 Bukti Setor (`/blud/bukti-setor`) 🆕 — satu-satunya layar yang menerima ketikan lepas

Lembar `setor BPD` **bukan laporan turunan**. Penelusuran ke berkas asli membuktikan: sebelas barisnya angka ketikan, hanya `Total` (`=SUM(D8:D18)`) dan `Cash` (`=D19-D20`) yang berupa rumus, dan tak satu pun nominalnya muncul di lembar lain. Pengelompokan *"sebelas pembayaran ini berasal dari tarikan itu"* adalah keputusan manusia yang tidak berjejak di data mana pun.

Karena itu ia diberi masukannya sendiri — **dipisah dari Buku Kas dengan sengaja**. Buku Kas catatan resmi (tiap barisnya fakta, semua lembar lain diturunkan darinya); layar ini merakit dokumen yang sebagian barisnya boleh diketik lepas. Menaruh keduanya di satu layar berarti baris "boleh ngarang" duduk bersebelahan dengan sumber kebenaran.

| Bagian | Cara isi |
|---|---|
| Tanggal · No. bukti | No. bukti opsional; tanggal wajib di dalam bulan yang dipilih |
| **Ambil Uang** | **"Pilih dari BKU"** (transaksi `AMBIL_BANK`) · ketik hanya kalau tarikannya memang tidak ada. Memilih **dan** mengetik sekaligus ditolak |
| Rincian | **"Ambil dari BKU"** (transaksi **dan** potongan di dalamnya) · **"Ketik Baris"** · urutan digeser ↑↓ |
| **Total** · **Cash** | Otomatis, tidak bisa diketik — meniru rumus aslinya |

#### Yang membuat ketikan lepas aman
Setiap baris membawa `asal`, dan di bawah tabel sistem menyatakannya terang-terangan:

> *9 baris terhubung ke BKU · 2 baris diketik lepas senilai Rp 607.764*

Ketikan lepas tetap boleh — tapi tidak pernah tersembunyi. Tanpa kalimat itu, kita mengembalikan penyakit yang justru dibasmi modul ini: lembar berpenampilan resmi yang angkanya bisa melenceng dari BKU tanpa ada yang curiga.

#### Baris terhubung dibaca HIDUP, tidak disalin
Uraian & nominal baris ber-penunjuk diambil dari sumbernya **saat dibaca** (§2.7). Kalau transaksinya dihapus, barisnya berbunyi `(transaksi terhapus)`, nilainya dihitung 0, dan muncul peringatan — bukan diam-diam mempertahankan angka basi. FK-nya sengaja `ON DELETE SET NULL`, bukan CASCADE.

| Pagar | Sikap |
|---|---|
| Satu transaksi/potongan dipakai dua kali **di slip yang sama** | **Ditolak** — dobel hitung murni |
| Dipakai di **dua slip berbeda** dalam satu bulan | Diperingatkan, tidak diblokir (pembayaran dicicil itu sah) |
| `Cash` negatif — pemakaian melebihi tarikan | Diperingatkan, tidak diblokir; itu sinyal nyata |
| Periode bulan itu `TUTUP` | Slip jadi baca-saja (`FOR UPDATE`, sama seperti transaksi) |
| Akses | `bolehLihat`/`bolehInput` pada menu **`bukti-setor`** — **tanpa** kunci `app_access` baru |

Regresi: `node scripts/test-blud-bukti-setor.mjs` (11 pemeriksaan).

### 6.3 Realisasi (`/blud/realisasi`) — layar pantau, read-only

Kolom: `Kode Rekening · Uraian · Pagu · ‹Bulan› · s.d. Bln Lalu · s.d. ‹Bulan› · Sisa s.d. ‹Bulan› · %`.

| Elemen | Fungsi |
|---|---|
| **"Buka semua"** / **"Ciutkan"** | Buka/tutup seluruh cabang pohon |
| **"Cari kode / uraian…"** | Saring baris |
| Klik **uraian** baris | Buka **panel Register** — daftar transaksi yang membebani baris itu + saldo anggaran berjalan |
| Chip ▲ / ▼ / ➕ di kolom Pagu | Pagu baris ini naik / turun / rekening baru pada versi pergeseran terbaru (tooltip menyebut nilai lama) |
| Baris merah | Sisa minus — terserap melebihi pagu |

**Semua angka dihitung saat dibaca, tidak pernah disimpan.** Serapan hanya menempel di baris terbawah lalu **digulung ke seluruh leluhur** (`gulungKeAtas`) — kalau tidak, baris induk akan tampil nol dan total Realisasi tidak akan pernah cocok dengan Buku Kas.

Peringatan yang bisa muncul:
- **Banner "Pagu diperbarui"** — pergeseran baru tersimpan orang lain (deteksi 3 lapis §4.4, lapis ke-3 memeriksa *sidik jari* pagu tiap 30 detik lewat `?mode=cap`; **bukan** SUM pagu, sebab pergeseran yang berimbang membuat total tetap sama walau tiap barisnya berubah).
- **Peringatan "Tabel ini menunjukkan keadaan sampai ‹Bulan› saja"** — ada realisasi di bulan sesudahnya, jadi sisa yang benar-benar masih bisa dibelanjakan hari ini ditampilkan terpisah.

### 6.3 Pagar "pagu di bawah realisasi" (§4.3)

Arah kebalikan dari §4.1, dan **belum pernah dijaga di Excel**: Pergeseran tidak boleh menurunkan pagu suatu baris di bawah realisasi yang **sudah terjadi**, dan tidak boleh menghapus baris yang masih dipakai transaksi (barisnya jadi yatim). Kalau tetap dilakukan → alasan wajib + audit `BLUD_PAGU_DIBAWAH_REALISASI`.

---

## 7. FASE 5 — Tutup Kas & SPJ 🆕 (`/blud/tutup-kas`)

### 7.1 Dua sisi yang wajib bertemu (§4.7)

```
SISI A  menurut buku   = saldo awal + Σ penerimaan − Σ pengeluaran   ← DIHITUNG, tidak bisa diketik
SISI B  menurut nyata  = uang tunai di brankas + saldo rekening koran ← DIKETIK, dua angka
```

**Selisih harus Rp 0.** Tidak ada kotak "penyesuaian" bebas — itu persis cara berkas Juni 2026 jadi tidak seimbang tanpa ada yang tahu (A = −650.471.561 vs B = 4.883.802.451).

> **Pemindahan bank↔kas dibersihkan (keputusan #32).** Mengambil Rp 440 juta dari bank ke brankas bukan penerimaan — uang sendiri pindah tempat. Rumusnya `SUM(GREATEST((kas_masuk + bank_masuk) − (kas_keluar + bank_keluar), 0))` per transaksi, jadi transaksi pemindahan hasilnya nol di kedua kolom tanpa perlu menebak dari kolom `jenis`. Saldo akhirnya sama saja; yang berbeda kejujuran dua angka yang ditandatangani.

### 7.2 Layar & tombol
| No | Elemen PERSIS | Fungsi |
|---|---|---|
| 1 | Kartu **"Menurut buku"** (*dihitung dari transaksi — tidak bisa diketik*) | Saldo awal kas & bank · Penerimaan bulan ini (+) · Pengeluaran bulan ini (−) · **Saldo akhir menurut buku** |
| 1b 🆕 R3 | Di **Januari yang belum ditutup**, dua baris saldo awal berubah jadi **isian** + tombol **"Simpan saldo awal"** | Sub-judul kartu ikut berubah jadi *"saldo awal tahun diketik sekali; sisanya dihitung dari transaksi"* — lihat §7.2b |
| 2 | Kartu sisi nyata: **"Uang tunai di brankas"** + **"Saldo rekening koran"** | Dua angka satu-satunya yang diketik → **Saldo akhir menurut kenyataan** |
| 3 | Pita hasil | **"Seimbang — selisih Rp 0. Bulan boleh ditutup."** atau selisihnya |
| 4 | **Nomor surat** (mis. `900/BA-001/2026`) + **Tanggal surat** | Kelengkapan berita acara |
| 5 | **"Simpan Pemeriksaan"** (ghost) | Simpan sisi B **tanpa** menutup — supaya bisa menghitung uang bertahap sambil melihat selisih |
| 6 | **"Tutup Bulan"** (hijau) | Aktif hanya kalau selisih Rp 0 **dan** tanpa penghalang · audit `BLUD_PERIODE_TUTUP` |
| 7 | **"Unduh SPJ Bulanan"** (hijau) | Unduh `.xlsx` 11 lembar · audit `BLUD_SPJ_UNDUH` |
| 8 | **"Buka Kembali"** (amber) | **SUPER_ADMIN · ADMIN · KEUANGAN** (`bolehBukaPeriode`) — PERBENDAHARAAN sengaja di luar meski boleh menutup; alasan ≥10 karakter · audit `BLUD_PERIODE_BUKA` · **wajib urut dari belakang** — lihat §7.3 |

### 7.2b Saldo awal tahun 🆕 (R3) — satu-satunya angka sisi A yang diketik

Sebelum ini kolomnya hanya bisa diisi lewat SQL manual, **tanpa jejak** — padahal ia
dasar dari tiap saldo yang ditandatangani sepanjang tahun.

| | |
|---|---|
| Di mana | Kartu sisi A layar Tutup Kas, **hanya bulan Januari**. Bukan panel terpisah: angkanya memang sudah tampil di baris itu, dan kotak kedua untuk angka yang sama membuat orang bertanya mana yang berlaku |
| Kapan boleh | Selama **belum ada satu pun bulan tahun itu ditutup**. Sesudahnya beku → 409 `SALDO_AWAL_TERKUNCI` |
| Siapa | Menu `tutup-kas` izin EDIT — **tanpa daftar peran tersendiri**. Setelah beku, satu-satunya jalan mengubahnya adalah membuka kembali Januari, dan pintu itu sudah dijaga `bolehBukaPeriode` yang sempit |
| Tanpa alasan wajib | Beda dari buka periode & hapus versi yang merusak dokumen bertanda tangan. Di sini, selama masih boleh diubah, belum ada apa pun yang ditandatangani |
| Jejak | Audit `BLUD_SALDO_AWAL_SET` memuat **lama → baru**, mis. `tunai 24025146 → 30000000` |
| Endpoint | `POST /api/blud/realisasi/saldo-awal` — route sendiri, bukan menumpang `POST /realisasi/periode` yang artinya "satu bulan" |

> **Kuncinya dikirim server, bukan ditebak layar.** `NeracaKas.saldo_awal_terkunci`
> dihitung di server dari "ada bulan mana pun yang tertutup". Layar hanya memegang
> satu bulan, jadi kalau ia menyimpulkan sendiri, isian bisa tampak hidup lalu
> ditolak 409. Satu fungsi `bulanTertutup()` dibaca layar dan pagar tulis sekaligus
> — prinsip yang sama dengan `kumpulkanPenghalang` di §7.3.

> **Mengubahnya menggeser seluruh tahun.** Saldo awal Februari–Desember diturunkan
> dari angka ini plus arus kas bulan-bulan sebelumnya (§4.6), tidak disimpan. Karena
> itu ia dibekukan begitu ada satu berita acara — bukan begitu Januari saja ditutup.

### 7.3 Penghalang tutup — daftarnya satu, dipakai layar **dan** server
`kumpulkanPenghalang()` adalah sumber tunggalnya; UI tidak punya versi aturannya sendiri.

| Penghalang | Pesan | Cara membereskan |
|---|---|---|
| Transaksi diparkir | *"n transaksi masih diparkir di baki 'Perlu Rekening'…"* | Tambah rekeningnya lewat Pergeseran → sambungkan dari baki di Buku Kas |
| Bulan sebelumnya masih terbuka | *"Bulan 3, 4 belum ditutup — saldo awal bulan ini masih bisa berubah. Tutup dari bulan terdepan."* | Tutup berurutan dari bulan terdepan |

> **Kenapa harus berurutan (§4.6)**: saldo awal Januari diisi manual sekali; bulan berikutnya **diturunkan** dari arus kas bulan-bulan sebelumnya — tidak disimpan. Menutup Juni sementara Mei masih terbuka = menandatangani saldo yang masih bisa berubah esok hari. Sebaliknya, koreksi transaksi bulan lalu otomatis merambat ke seluruh bulan sesudahnya.

**Membuka pun berurutan — dari belakang (S2).** Alasannya sisi lain dari koin yang
sama: kalau Januari dibuka sementara Februari–Juni sudah ditandatangani, satu koreksi
di Januari menggeser saldo kelimanya tanpa ada yang memberi tahu. Jadi:

> ❌ *"Tidak bisa membuka Mei. Tutup kas Juni perlu dibuka lebih dulu — saldo awal
> bulan-bulan itu dihitung dari bulan ini, jadi ikut bergeser begitu isinya berubah."*

Urutannya: buka bulan **terbelakang** dulu, mundur sampai bulan yang dituju. Bulan yang
belum pernah ditutup sama sekali tidak menghalangi. Repot di sini disengaja — yang
dibuka dokumen bertanda tangan, bukan draf.

### 7.4 Periode GU (Ganti Uang Persediaan) — §3.2 / keputusan #31
Satu bulan boleh punya beberapa pengajuan GU (berkas asli: `GU 1-26 Juni 2026`, bukan sebulan penuh). Rentangnya **tidak bisa diterka** dari transaksi — tidak ada penanda "GU ke-2 mulai di sini" di data mana pun — jadi dicatat manual. Yang dicatat **hanya rentangnya**; angka realisasinya tetap dihitung saat lembar dibuat.

| Elemen | Aturan |
|---|---|
| **"Tambah Rentang"** → **Dari** / **Sampai** / **Nomor pengajuan** (opsional) | Maks 10 pengajuan per bulan |
| **"Simpan Periode GU"** | Replace-all per bulan · audit `BLUD_GU_SIMPAN` |
| Validasi | Rentang wajib **di dalam bulan** yang dipilih; **tidak boleh saling tindih** (dua GU beririsan = belanja yang sama diajukan penggantiannya dua kali); `urutan` ditentukan server dari tanggal mulai, bukan dari klien |
| Dikosongkan | Berkas SPJ tetap dapat satu lembar GU untuk sebulan penuh |

### 7.5 Isi berkas SPJ (`SPJ-BLUD-‹Bulan›-‹Tahun›.xlsx`)
Dirakit di **server** (`buatWorkbookSpj`), bukan di browser.

| # | Lembar | Isi |
|---|---|---|
| 1 | ` Realisasi BP` | Pagu vs realisasi bulan berjalan per rekening |
| 2 | `BKU` | Buku Kas Umum bulan itu |
| 3 | `SPI` | Varian BKU |
| 4 | `register` | Register per baris anggaran |
| 5 | `rekap potongan` 🆕 | Pajak & potongan pihak ketiga, dikelompokkan per jenis + total pajak / non-pajak |
| 6.. | `GU ‹awal›-‹akhir›` | **Satu lembar per pengajuan GU** (jumlahnya mengikuti §7.4) |
| n−3 | `pengantar` | Surat pengantar |
| n−2 | `SPJ` | Rekap SPJ |
| n−1 | `TUTUP KAS` | Berita Acara Pemeriksaan Kas |
| n | `setor BPD` | **Satu blok per slip dari menu Bukti Setor** — bernomor, ditutup `Ambil Uang` · `Total` · `Cash`. Bulan tanpa slip menghasilkan lembar kosong; penyaring lama **tidak** dipertahankan sebagai cadangan (dua sumber untuk satu lembar = tidak ada yang tahu angkanya dari mana) |

> **Keputusan #33**: `pengantar` dan `SPJ` memakai **total alokasi** (`ctx.belanja.total`), bukan kas keluar — supaya angka dua lembar itu sama dengan lembar Realisasi BP.
> Total BKU dan total Realisasi BP **wajib sama**; berbeda = ada yang nyangkut.

---

## 8. FASE 6 — Output & Pemeliharaan

### 8.1 Cetak (`/blud/cetak`)
| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | Dropdown **Menu** | Pilih modul (DPA / Pergeseran / Master Akun) | Menentukan sumber |
| 2 | Dropdown **View** | **DPA BLUD**, **PENANGGUNG JAWAB**, **Rekap Pergeseran**, **Master Akun** | Layout cetak |
| 3 | Pilih versi (kalau ada) | — | Snapshot yang dicetak |
| 4 | **Cetak** | Klik | Preview tabel siap cetak |
| 5 | Ekspor | Klik | Unduh **PDF** / **Excel** (`lib/blud/export/`) |

> Empty state: *"Belum ada data. Pilih menu & view, lalu klik **Cetak**."*
> SPJ bulanan **tidak** ada di sini — tempatnya di Tutup Kas (§7.2 no. 7).

### 8.2 Pengaturan (`/blud/pengaturan`)
Dua bagian: **Pejabat penanda tangan SPJ** (§3.4) dan **pengelolaan versi**.

| No | Elemen | Aksi | Hasil |
|---|---|---|---|
| 1 | Section **Versi DPA** / **Versi Pergeseran** | Lihat daftar versi | Riwayat lengkap |
| 2 | Ikon hapus versi | Klik → modal | Muncul **kode konfirmasi** acak |
| 3 | Isian **Alasan** (min. 10 karakter) | Ketik | Wajib. Tombol Hapus baru hidup kalau kode **dan** alasan terpenuhi; alasannya ikut masuk audit log |
| 4 | Ketik kode → konfirmasi | Klik | Versi dihapus · rate-limited · audit `BLUD_DELETE_DPA_VERSI` / `BLUD_DELETE_PERGESERAN_VERSI` |
| 5 | Panel **"Hapus ditahan"** | Muncul sendiri | Versi yang masih menyangga realisasi **tidak bisa dihapus** — panel menampilkan tiap baris beserta pagu penerus, serapan, dan selisih minusnya |

> **Siapa yang boleh menghapus versi (S5):** hanya **Super Admin** dan **Admin
> Staff**. Pemegang grant `app_access: 'blud'` lain (mis. bendahara) tetap bisa
> membuka layar ini dan melihat daftar versinya, tapi tombol Hapus tidak muncul.
> Akses modul membuka pintu masuk; membuang anggaran setahun perkara lain.

> **Kenapa hapus bisa ditahan (T1).** Pagu selalu diambil dari versi TERBARU. Menghapus
> versi teratas memundurkan pagu **setahun penuh** ke versi sebelumnya, sementara
> transaksi yang sudah dicatat tetap menempel di baris anggaran lamanya — serapan bisa
> langsung melampaui pagu tanpa satu pun peringatan. Tidak ada tombol paksa di sini:
> pergeseran yang dipaksa turun masih meninggalkan barisnya, tapi versi yang dihapus
> hilang selamanya. Kalau memang harus dihapus, hapus dulu transaksi yang memakainya.
>
> Versi DPA yang masih jadi **acuan** sebuah Pergeseran juga ditolak — hapus
> pergeserannya lebih dulu.

---

## 9. Guard & Keamanan (lengkap)

### 9.1 Lapis-lapis akses

```mermaid
flowchart TD
    R[Request] --> P[proxy.ts · Edge<br/>strip header x-user-* dari klien<br/>set ulang di request header · V3-1/L54]

    P --> SISI{Yang diminta<br/>halaman atau API?}

    SISI -->|Halaman /blud/**| L{layout.tsx server<br/>hasAppAccess uid, role, isBludRole}
    L -->|gagal| M[redirect /menu]
    L -->|lolos| LS{modulSedangMati app_status_blud<br/>SUPER_ADMIN dikecualikan · S4}
    LS -->|mati| MT[redirect /maintenance]
    LS -->|hidup| IZ{izinLayar menu<br/>_izin.ts → tabel peran}
    IZ -->|menu tertutup| MB[redirect /blud · Beranda<br/>bukan keluar modul: orangnya berhak masuk]
    IZ -->|EDIT| UE[Halaman penuh]
    IZ -->|LIHAT| UL[Halaman baca-saja<br/>SpandukLihat · isian jadi teks · tombol hilang]
    UE --> A
    UL --> A[fetch ke /api/blud/**]

    SISI -->|Langsung ke API<br/>curl / tab lama| A
    A --> G0{getSession}
    G0 -->|tanpa sesi| E401[401 Unauthorized]
    G0 -->|ada sesi| KS{bludMati / realisasiMati<br/>fail-closed · S4}
    KS -->|mati / gagal baca| E503[503 MODUL_MATI]
    KS -->|hidup| G{bolehBukaMenu / bolehEditMenu<br/>peran × menu + hasAppAccess}
    G -->|tanpa akses modul| E403[403 Akses ditolak]
    G -->|LIHAT tapi mencoba menulis| E403M[403 MENU_BACA_SAJA<br/>pesannya menyebut nama menunya]
    G -->|lolos| RL{bludRateLimit}
    RL -->|lewat kuota| E429[429 + resetIn]
    RL -->|aman| Z[Zod safeParse → data layer]
    Z -->|invalid| E400[400 pesan Zod]
    Z -->|valid| DB[(withTransaction + FOR UPDATE)]
```

> **Guard ditaruh di SETIAP route, bukan hanya di UI.** Menyembunyikan tombol bukan keamanan — endpoint tetap bisa dipanggil lewat `curl` (pelajaran V3-1).
>
> **Perhatikan jalur kanan pada bagan.** Menutup pintu di layar saja tidak cukup, karena ada dua cara masuk yang melewatinya: `curl`, dan **tab yang sudah telanjur terbuka** sebelum admin menekan maintenance. Itu sebabnya sakelar mati diperiksa di dua tempat — `layout.tsx` untuk yang baru masuk, dan tiap route untuk yang sudah di dalam.
>
> **503 sengaja dibedakan dari 403.** "Modul sedang dimatikan admin" akan hilang sendiri; "Anda tidak berhak" perlu minta akses. Kalau keduanya dijawab 403, pemakai tidak tahu harus menunggu atau menghubungi admin.

### 9.2 Siapa boleh apa — izin dua sumbu (peran × menu)
Konsep lengkap: `docs/CONCEPT-blud-peran.md`. Tabelnya hidup di **satu** berkas,
`lib/blud/peran.ts`, dan dibaca dua pihak: ribbon dan setiap route.

| Peran | Ringkasnya |
|---|---|
| `SUPER_ADMIN` · `ADMIN` | EDIT seluruh menu |
| `PROGRAM` | EDIT data induk + DPA + Pergeseran + Pengaturan · sisanya LIHAT |
| `KEUANGAN` | EDIT Tutup Kas + Pengaturan · sisanya LIHAT · **memegang kunci "Buka Kembali"** |
| `PERBENDAHARAAN` | EDIT Buku Kas · Bukti Setor · Realisasi · Tutup Kas + Pengaturan · sisanya LIHAT · **tidak boleh membuka periode** |
| peran ber-grant lain | `LIHAT` semua menu (bawaan aman §5.3) — bukan EDIT, bukan TIDAK |

| Fungsi | Aturan |
|---|---|
| `isBludRole(role, appAccess)` | `SUPER_ADMIN` / `ADMIN`, **atau** `users.app_access` memuat `'blud'` — pintu masuk modul |
| `bolehBukaMenu(uid, role, menu)` | `bolehBuka` (peran) **dan** `hasAppAccess` — dipakai semua GET |
| `bolehEditMenu(uid, role, menu)` | `bolehEdit` (peran) **dan** `hasAppAccess` — dipakai semua POST/PATCH/DELETE |
| `bolehLihat` / `bolehInput` (`realisasi/_guard`) | Nama lama, sekarang meneruskan ke dua fungsi di atas; `menu` wajib diisi |
| `bolehBukaPeriode(role)` (`DELETE /realisasi/periode`) | `BLUD_BUKA_PERIODE_ROLES = ['SUPER_ADMIN','ADMIN','KEUANGAN']` — lebih sempit dari pemegang EDIT Tutup Kas, + alasan ≥10 karakter |
| `canHapusVersi(role)` (`DELETE /dpa`, `DELETE /pergeseran`) | `BLUD_HAPUS_VERSI_ROLES = ['SUPER_ADMIN','ADMIN']` — grant `app_access` **tidak** cukup, + alasan ≥10 karakter |

> **LIHAT termasuk mengunduh.** Yang membedakan bukan metode HTTP-nya, melainkan
> apakah angka resminya berubah: `export-log` memakai POST tapi bersifat baca, jadi
> pemegang LIHAT harus lolos — kalau tidak, unduhan mereka tidak berjejak.
>
> ⚠️ **Mematikan sebuah menu menyembunyikan LAYARNYA, bukan DATANYA.** Men-`TIDAK`-kan
> Buku Kas untuk sebuah peran tidak menutup angkanya: pemegang LIHAT di menu **Cetak**
> atau **Tutup Kas** tetap bisa mengunduh SPJ bulanan, dan SPJ itu memuat BKU. Itu
> perilaku yang dirancang, bukan celah — SPJ lahir dari menutup bulan, jadi pagarnya
> mengikuti alur kerja itu. Kalau yang Anda maksud memang menutup datanya, yang dicabut
> harus grant `app_access: 'blud'`-nya, bukan satu menu.
>
> Dua fungsi izin terakhir sengaja berbentuk **daftar peran**, bukan perbandingan `=== 'SUPER_ADMIN'` yang ditulis di dalam route. Menambah peran = satu nama di daftar, tanpa menyentuh route mana pun. Uji `scripts/test-blud-izin-periode.mjs` + `scripts/test-blud-peran.mjs` mengunci isi daftar itu — jadi melonggarkannya selalu jadi keputusan sadar.
>
> Di sisi layar, `app/(dashboard)/blud/_izin.ts` (`izinLayar(menu)`) yang menerjemahkan tabel jadi prop `bolehUbah`. Layar LIHAT **menyembunyikan** tombol dan mengubah isian jadi teks, bukan menonaktifkannya — plus spanduk `SpandukLihat`.
>
> **AUTHZ-02/V5**: BLUD sengaja **tanpa ownership per-record** — semua pemegang akses bisa mengubah semua record. Itu keputusan, bukan IDOR. Konsekuensinya pemberian `app_access: 'blud'` harus konservatif dan direview berkala.

### 9.2b Sakelar mati modul 🆕 (S4)

Toggle di **Admin Panel → App Status**. Dua kunci, **berjenjang**:

| Kunci | Mematikan | Efeknya |
|---|---|---|
| `app_status_blud` | seluruh modul BLUD | Kartu di `/menu` jadi abu · `/blud/**` dilempar ke `/maintenance` · semua `/api/blud/**` balas **503** |
| `app_status_blud_realisasi` | sub-modul Penatausahaan saja | Buku Kas · Bukti Setor · Realisasi · Tutup Kas mati; DPA, Pergeseran, dan data induk tetap jalan |

Mematikan BLUD ikut mematikan Realisasi. **Sebaliknya tidak.**

**`SUPER_ADMIN` dikecualikan** dari pembelokan halaman — yang mematikan modul tetap
harus bisa masuk memeriksanya. Route API tetap 503 untuk semua, termasuk SUPER_ADMIN.

> **Fail-closed.** Gagal membaca `app_config` = **tolak**, bukan lanjut diam-diam.
> Sakelar pengaman yang menyala hanya kalau semuanya lancar bukan sakelar pengaman.
> Risikonya kecil: kalau MySQL bermasalah, modulnya toh sudah tidak bisa apa-apa.
>
> **Diperiksa di dua tempat, dan keduanya perlu.** `layout.tsx` menutup yang baru
> masuk (termasuk URL yang diketik langsung dan FloatingDock antar-modul); tiap route
> menutup **tab yang sudah telanjur terbuka** sebelum admin menekan maintenance. Tanpa
> yang kedua, orang yang sedang di layar DPA masih bisa menekan Simpan.
>
> **Sengaja tidak dilebur ke `bolehBukaMenu`.** Hasilnya akan jadi 403 padahal ini
> 503, dan lebih halus: `bolehBukaMenu` menjawab *"siapa Anda"*, sakelar ini menjawab
> *"apakah modulnya sedang hidup"*. Dua pertanyaan berbeda tidak boleh diwakili satu
> jawaban boolean.
>
> Uji: `node scripts/test-blud-killswitch.mjs` — termasuk sifat berjenjangnya, yang
> justru paling mudah rusak.

### 9.3 Rate limit per endpoint (`bludRateLimit`, per-user per-menit)
| Aksi | Kuota | Endpoint |
|---|---|---|
| `realisasi-tx` | 60 | POST/PATCH `/realisasi/tx` |
| `realisasi-tx-delete` | 20 | DELETE `/realisasi/tx` |
| `realisasi-periode` | 20 | POST/DELETE `/realisasi/periode` |
| `realisasi-permintaan` | 20 | POST/PATCH `/realisasi/permintaan` |
| `realisasi-gu` | 20 | POST `/realisasi/gu` |
| `blud-pejabat` | 20 | POST `/blud/pejabat` |
| `realisasi-export` | 10 | GET `/realisasi/export` |
| `realisasi-saldo-awal` | 20 | POST `/realisasi/saldo-awal` 🆕 |
| `view-dpa` · `view-pergeseran` | 60 | GET `/dpa`, GET `/pergeseran` 🆕 R4 |
| `view-tx` · `view-register` · `view-periode` | 60 | GET `/realisasi/tx`, `/register`, `/periode` 🆕 R4 |
| default lain | 30 | — |

Lewat kuota → **429** + `resetIn` (detik).

> 🆕 **R4 — GET juga dibatasi.** Dulu hanya tulis yang direm; membaca satu tahun DPA
> tidak murah, dan skrip yang berputar bisa memanggilnya ribuan kali. 60/menit
> longgar untuk pemakaian wajar (pindah versi, pindah tahun, pindah bulan).
>
> **Audit "melihat" ikut diperlonggar penulisannya.** `BLUD_VIEW_DPA` /
> `BLUD_VIEW_PERGESERAN` dicatat **sekali per menit per user per versi**
> (`bolehCatatView` di `lib/blud/schemas.ts`), bukan tiap panggilan. Yang ingin
> dijawab audit view adalah *"siapa pernah melihat versi ini"*, bukan *"berapa kali
> komponennya me-render"* — dan tanpa throttle, jejak yang penting tenggelam.
>
> `realisasi/pagu?mode=cap` **tidak** ikut dibatasi maupun diaudit: ia dipanggil
> otomatis tiap ~30 detik untuk menyegarkan pil pagu.

### 9.4 Kode error yang dilihat pengguna
| HTTP | `code` | Arti | Yang harus dilakukan |
|---|---|---|---|
| 400 | — (pesan Zod) | Isian tidak valid | Perbaiki isian |
| 400 | `ALOKASI_TIDAK_SEIMBANG` | Total alokasi ≠ nilai transaksi | Samakan angkanya |
| 400 | `ALOKASI_TERLARANG` 🆕 | Alokasi menempel pada transaksi yang tidak mengeluarkan uang | Hapus pembebanannya, atau ganti jenis transaksinya |
| 400 | `POTONGAN_TIDAK_SAH` 🆕 | Potongan bukan pada belanja, atau melebihi nilai pembayaran | Pindahkan ke transaksi belanja induknya / perkecil nilainya |
| 409 | `SERAPAN_NEGATIF` 🆕 | Pengembalian melebihi yang pernah terserap di baris itu | Perkecil nilainya, atau perbaiki transaksi belanja aslinya |
| 401 | — | Belum login / sesi habis | Login ulang |
| 403 | — | Tidak punya akses BLUD | Minta grant di Admin Panel |
| 403 | `MENU_BACA_SAJA` | Peran Anda hanya boleh **melihat** menu itu | Pesannya menyebut nama menunya — minta Admin kalau memang perlu mengubah |
| 503 | `MODUL_MATI` 🆕 S4 | Modul dimatikan admin untuk pemeliharaan | **Tunggu** — ini akan hilang sendiri, bukan soal hak akses |
| 409 | `SALDO_AWAL_TERKUNCI` 🆕 R3 | Saldo awal tahun sudah tidak bisa diubah | Sudah ada bulan yang ditutup di atasnya — buka kembali Januari dulu |
| 409 | `BUKAN_MENUNGGU` 🆕 R1 | Permintaan sudah ditolak/selesai orang lain | Muat ulang daftarnya |
| 409 | `PAGU_TERLAMPAUI` | Pagu baris tidak cukup | **Ajukan Pergeseran** atau parkir |
| 409 | `VERSION_CONFLICT` | Transaksi diubah orang lain | Muat ulang versi terbaru |
| 409 | `PERIODE_TUTUP` / `PERIODE_TERTUTUP` | Bulannya sudah ditutup | Minta SUPER_ADMIN membuka |
| 409 | `TANPA_DPA` | Tahun itu belum punya DPA | Susun DPA dulu |
| 409 | `TIDAK_SEIMBANG` | Sisi buku ≠ sisi nyata | Cocokkan lagi — tidak ada penyesuaian bebas |
| 409 | `TERHALANG` | Ada penghalang tutup | Beresi daftar di §7.3 |
| 429 | — | Terlalu banyak permintaan | Tunggu `resetIn` detik |

### 9.5 Integritas data — yang dijaga di dalam transaksi DB
| Jaminan | Cara |
|---|---|
| Tidak ada uang keluar tanpa membebani anggaran | `wajibBeralokasi()` di `lib/blud/alokasi-rule.ts` — satu aturan dipakai Zod, `periksaKeseimbangan`, dan modal Buku Kas. Pengecualian hanya pemindahan bank↔kas yang netral |
| Pagu tidak bisa jebol saat dua orang menyimpan bersamaan | Satu transaksi: cek periode → **kunci pagu per rekening** → `SELECT SUM(...) FOR UPDATE` → tulis. Membaca sisa di JS lalu INSERT = lost update (L55) |
| `FOR UPDATE` pada SUM alokasi **wajib** | `REPEATABLE READ` membuat SELECT biasa membaca snapshot **sebelum** kunci didapat → alokasi orang lain yang baru commit tak terlihat, kunci menang tapi angkanya basi. Terbukti di `scripts/concurrency-test.js` T7b |
| Deadlock 1213 mustahil | Kunci diambil **berurutan menaik** per `anggaran_key`; kunci nomor kuitansi selalu diambil lebih dulu (§5.3/§5.4) |
| Ubah transaksi tidak menolak dirinya sendiri | `abaikanTxId` mengeluarkan alokasi lama milik transaksi itu dari perhitungan |
| Ubah transaksi anti-tabrakan | CAS `expected_version` + `SELECT … FOR UPDATE` (L48) |
| Bulan tertutup benar-benar terkunci | POST/PATCH/DELETE transaksi memeriksa `blud_periode.status` **di dalam** transaksi |
| Sisi A tidak bisa dipalsukan | Server menghitung ulang saldo buku di dalam `withTransaction`; angka sisi A dari klien tidak pernah dipakai |
| Alokasi ikut terhapus | FK `ON DELETE CASCADE` dari `blud_realisasi_tx` |
| Bulk insert | `bulkInsert()` satu round-trip, bukan `for … await INSERT` (PERF-C1) |

### 9.6 Jejak audit (`audit_log`)
`BLUD_SAVE_DPA` · `BLUD_SAVE_PERGESERAN` · `BLUD_INJECT_DPA` · `BLUD_VIEW_DPA` · `BLUD_VIEW_PERGESERAN` · `BLUD_DELETE_DPA_VERSI` · `BLUD_DELETE_PERGESERAN_VERSI` · `BLUD_SAVE_MASTER_AKUN` · `BLUD_SAVE_KODE_BESAR` · `BLUD_SAVE_PENANGGUNG_JAWAB` · `BLUD_SAVE_REKAP_PK` · `BLUD_IMPORT_USULAN_VIEW` · `BLUD_PJ_CHAIN_CONFLICT` · `BLUD_SENTINEL_ACK` · `BLUD_PAGU_DIBAWAH_REALISASI` · **`BLUD_REALISASI_TX_CREATE` / `_UPDATE` / `_DELETE`** · **`BLUD_PERMINTAAN_CREATE` / `_SELESAI` / `_TOLAK`** · **`BLUD_PERIODE_TUTUP` / `BLUD_PERIODE_BUKA`** · **`BLUD_GU_SIMPAN`** · **`BLUD_PEJABAT_SIMPAN`** · **`BLUD_SPJ_UNDUH`**

> Menu Audit khusus BLUD **ditunda** (keputusan #23) — jejaknya tetap lengkap lewat `writeAuditLog`, dibaca dari Admin Panel.

---

## 10. Model Data & Aturan "dihitung, bukan disimpan"

### 10.1 Tabel
| Tabel | Isi | Migration |
|---|---|---|
| `dpa_blud` | Versi DPA (snapshot per `versi_tanggal` × `tahun_anggaran`) | `migration-blud-dpa-pergeseran.sql`, `-019-chain-l7-l8`, `-tahun-anggaran` |
| `pergeseran_dpa` | Versi Pergeseran (kolom `pergeseran` = pagu **sesudah** digeser) | idem |
| `master_akun` · `kode_besar` · `penanggung_jawab` | Data induk | `-025/026`, `-027` |
| `rekap_pk` | Snapshot rekap Penanggung Jawab BLUD | `-024` |
| `blud_locks` | Kunci optimistik/advisory generik (L51) | `-036-blud-locks.sql` |
| **`blud_realisasi_tx`** | Satu baris = satu baris BKU | `migration-blud-realisasi-tx.sql` |
| **`blud_realisasi_alokasi`** | Pembebanan transaksi ke baris anggaran (FK CASCADE). `nilai` **bertanda**: positif membebani, negatif mengembalikan | idem, + `-realisasi-anggaran-key.sql`, `-blud-potongan-pengembalian.sql` |
| **`blud_realisasi_potongan`** 🆕 | Potongan pihak ketiga per transaksi belanja — pajak + non-pajak (FK CASCADE) | `migration-blud-potongan-pengembalian.sql` |
| **`blud_bukti_setor`** 🆕 | Satu baris = satu slip "BUKTI SETOR KE BANK BPD" | `migration-blud-bukti-setor.sql` |
| **`blud_bukti_setor_baris`** 🆕 | Baris slip; `asal` menentukan dibaca hidup atau ketikan (FK `SET NULL`, bukan CASCADE) | idem |
| **`blud_periode`** | Periode bulanan: saldo awal, sisi nyata, status BUKA/TUTUP | idem |
| **`blud_permintaan`** | Permintaan pergeseran / rekening baru dari bendahara | `migration-blud-permintaan.sql` |
| **`blud_gu_periode`** | Rentang pengajuan GU per bulan | `migration-blud-gu-periode.sql` |
| **`blud_pejabat`** | Pejabat penanda tangan SPJ per tahun (salinan) | `migration-blud-pejabat.sql` |

### 10.2 Yang **tidak pernah** disimpan (dihitung saat dibaca)
| Angka | Dihitung dari |
|---|---|
| Pagu efektif | Pergeseran versi terbaru → kalau tidak ada, DPA versi terbaru |
| Terserap / sisa / % | `SUM(blud_realisasi_alokasi.nilai)` + `gulungKeAtas` ke induk |
| Saldo kas & bank berjalan per baris BKU | Saldo awal + akumulasi masuk−keluar urut tanggal, id |
| Saldo awal bulan ≥2 | Saldo awal Januari + arus kas seluruh bulan sebelumnya |
| Saldo buku (sisi A Tutup Kas) | Saldo awal + penerimaan luar − pengeluaran luar |
| Saldo register per baris anggaran | Pagu − akumulasi alokasi urut waktu |
| Nomor GU (`urutan`) | Diurutkan server dari tanggal mulai |

> **Menyalin pagu ke tabel realisasi = basi begitu ada pergeseran** — persis penyakit berkas Excel yang digantikan modul ini.

---

## 11. Ringkasan "Sekali Jalan" (checklist A–Z)

**Sekali di awal tahun**
1. **Login** → **Menu** → kartu **BLUD**.
2. **Master Akun** → isi akun + kode rekening → **Simpan**.
3. **Kode Besar** → susun kerangka L1/L2/L2.1 → **Simpan**.
4. **Penanggung Jawab** → isi daftar jabatan → **Simpan**.
5. **Pengaturan → Pejabat SPJ** → **"Ambil dari PK"** → lengkapi Bendahara & PPK-BLUD → **Simpan**.
6. **DPA BLUD** → **Form Baru** → **Buat Form (n)** → isi Uraian/Vol/Harga → set **PJ** → beres Sentinel → **Simpan**.
7. *(opsional)* **Import dari Usulan** untuk menarik item usulan final.
8. **Tutup Kas** bulan Januari → isi **saldo awal** tahun berjalan.

**Harian**
9. **Buku Kas** → **Transaksi Baru** → isi → bebankan ke baris anggaran → **Simpan**.
10. Pagu kurang? → **"Ajukan Pergeseran"** (notif ke pemegang DPA) atau **parkir**.

**Saat perlu geser anggaran**
11. **Pergeseran DPA** → **Buat Pergeseran** → geser → **Sinkronkan DPA** → **Simpan** (imbang) / **Draft**.
12. Cek layar **Realisasi**: pastikan tidak ada baris merah (sisa minus).

**Akhir bulan**
13. **Buku Kas** → kosongkan baki **"Perlu Rekening"**.
14. **Tutup Kas** → isi uang tunai + saldo rekening koran → **"Simpan Pemeriksaan"** → pastikan **selisih Rp 0**.
15. Catat **Periode GU** (kalau bulan itu lebih dari satu pengajuan) → **"Simpan Periode GU"**.
16. **"Tutup Bulan"** → **"Unduh SPJ Bulanan"**.
17. Salah? → minta **SUPER_ADMIN / ADMIN / KEUANGAN** → **"Buka Kembali"** + alasan ≥10 karakter.

**Kapan saja**
18. **Cetak** → pilih Menu + View → **Cetak** → ekspor **PDF/Excel**.
19. **Pengaturan** → hapus/kelola versi bila perlu.

---

## 12. Referensi kode

**Shell & navigasi**
- `app/(dashboard)/blud/blud-shell.tsx` (ribbon 11 tile + overflow "Lainnya") · `layout.tsx` (guard `hasAppAccess`)

**Anggaran**
- DPA: `blud/dpa/dpa-client.tsx` · API `app/api/blud/dpa/` · `lib/blud/recalc.ts` · `lib/blud/dup-guard.ts` · `lib/blud/anggaran-key.ts`
- Pergeseran: `blud/pergeseran/pergeseran-client.tsx` · API `app/api/blud/pergeseran/` (+ `inject/`)
- Data Induk: `master-akun/` · `kode-besar/` · `penanggung-jawab/` (client + API senama)

**Penatausahaan 🆕**
- Buku Kas: `blud/buku-kas/buku-kas-client.tsx` · `components/blud/TransaksiModal.tsx` · `components/blud/BakiRekeningPanel.tsx`
- Bukti Setor: `blud/bukti-setor/bukti-setor-client.tsx` · `components/blud/BuktiSetorModal.tsx` · `lib/blud/bukti-setor-{data,schemas}.ts` · `app/api/blud/bukti-setor/route.ts` · konsep `docs/CONCEPT-blud-bukti-setor.md` · regresi `scripts/test-blud-bukti-setor.mjs`
- Realisasi: `blud/realisasi/realisasi-client.tsx` · `components/blud/RegisterPanel.tsx`
- Tutup Kas: `blud/tutup-kas/tutup-kas-client.tsx`
- API: `app/api/blud/realisasi/{tx,pagu,register,periode,permintaan,gu,export}/route.ts` · `_guard.ts`
- Data layer: `lib/blud/realisasi-data.ts` · `pagu.ts` · `tutup-kas.ts` · `permintaan-data.ts` · `gu-data.ts` · `pejabat-data.ts`
- Zod + guard + error domain: `lib/blud/realisasi-schemas.ts` · rate limit & role: `lib/blud/schemas.ts`
- Aturan alokasi & potongan (modul daun, dipakai server + klien): `lib/blud/alokasi-rule.ts` · konsep `docs/CONCEPT-blud-potongan.md` · regresi 2 lapis `scripts/test-blud-alokasi.mjs`
- Kunci: `lib/blud/lock.ts` (`acquireBludLock`, `BLUD_PAGU_ENTITY`, `BLUD_KWT_ENTITY`)
- SPJ: `lib/blud/export/spj-excel.ts` (`buatWorkbookSpj`)

**Output & UI bersama**
- Cetak: `blud/cetak/cetak-client.tsx` · `lib/blud/export/{pdf,excel}.ts`
- Pengaturan: `blud/pengaturan/pengaturan-client.tsx` · `components/blud/PejabatSpjPanel.tsx`
- Dropdown: `components/blud/{TahunDropdown,VersiDropdown,OpsiDropdown}.tsx` · format tanggal: `lib/blud/tanggal.ts`

**Dokumen konsep**
- `docs/CONCEPT-blud-realisasi.md` (§2–§7 + daftar 33 keputusan)
- `docs/CONCEPT-blud-tahun-anggaran.md`
- Workflow sumber: `docs/session/sentinel/workflows/WORKFLOW-blud-dpa.md`
