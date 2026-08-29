# KONSEP — BLUD: Modul Realisasi (Penatausahaan Bendahara Pengeluaran)

> Status: **KONSEP — belum dieksekusi.** Dokumen ini disetujui dulu, baru kode ditulis.
> Dibuat: 2026-07-25 · Diperbarui: 2026-07-26 (§4.7 keseimbangan Tutup Kas · §4.8 tahun anggaran · §10 semua
> temuan sudah diputuskan · keputusan #25–#27)
> Modul terdampak: BLUD (3 layar baru), Admin Panel (kunci akses)
> Dasar: pembedahan berkas nyata `06. BKU Juni 2026.xls` (10 sheet, 5.400+ formula) dari Sub Bag Keuangan.
> Prasyarat: `docs/CONCEPT-blud-tahun-anggaran.md` — **sudah dieksekusi & migrasi sudah jalan di server.**

---

## 1. Masalah

Modul BLUD saat ini berhenti di **rencana** (DPA + Pergeseran). Sisi **pelaksanaan** — berapa yang sudah
dibelanjakan, berapa sisanya, apakah sudah melebihi pagu — masih dikerjakan di luar sistem memakai satu
berkas Excel 10 sheet yang diketik ulang setiap bulan.

### 1.1 Bentuk berkas Excel itu: satu hulu, dua muara

Bukan corong ke satu titik. Bentuknya huruf Y — dan salah membacanya akan menghasilkan rancangan yang cacat
(mis. menjadikan TUTUP KAS turunan Realisasi BP, padahal TUTUP KAS butuh saldo kas & bank yang tidak ada
di Realisasi BP sama sekali).

```
                    ┌─────────────────────────────┐
                    │  HULU TUNGGAL: transaksi    │
                    │  444 baris (tgl·kwt·rek·Rp) │
                    └──────────────┬──────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
     MUARA A — serapan anggaran            MUARA B — posisi kas
     register → Realisasi BP               BKU  →  TUTUP KAS
                → pengantar → SPJ
```

### 1.2 Rantai angkanya utuh dan terbukti

Satu nilai mengalir dari BKU sampai SPJ tanpa putus:

| Titik | Nilai |
|---|---|
| BKU — 444 transaksi pengeluaran | **6.361.975.087** |
| register — 444 baris transaksi | **6.361.975.087** |
| `' Realisasi BP'!E14` | **6.361.975.087** |
| `pengantar!E31` (1.212.588.101 + 4.700.086.986 + 449.300.000) | **6.361.975.087** |
| `SPJ!E19` | **6.361.975.087** |

### 1.3 Biaya yang ditanggung sekarang

| # | Temuan | Bukti |
|---|---|---|
| 1 | **BKU → register diketik ulang 444 baris tiap bulan** | 0 formula lintas-sheet dari `register` ke `BKU` |
| 2 | **SPI = salinan BKU yang sudah melenceng** | 849 baris dibanding: angka 0 beda, kode rekening 0 beda, **uraian 6 beda** (`"Bekanja kupon BBM"`, `"(1 jt)"` vs `"(100 jt)"`, `"SPPD ke Demak"` vs `"SPPD dlm kota Smg"`) |
| 3 | **Pagu diketik di dua tempat, tak satu pun dari DPA** | `Realisasi BP` kolom D: 156 formula aritmatika tangan (mis. `=480000000-30000000` — jejak pergeseran dihitung di kepala) + `register` "Jumlah Anggaran" 17 baris |
| 4 | **"Realisasi bulan lalu" diketik ulang** | `Realisasi BP` kolom F: 119 literal → galat menjalar ke % serapan |
| 5 | **Kop BKU & SPI masih "Bulan : Mei"** padahal isinya Juni | sisa salinan bulan sebelumnya |
| 6 | **TUTUP KAS tidak seimbang** — padahal dua sisinya wajib sama | A.4 Saldo akhir = **−650.471.561** vs B.3 Saldo Total = **4.883.802.451**, label masih "31 Mei 2026" → dijaga di §4.7 |
| 7 | **Belanja Modal tidak tersambung `register`** | Σ leaf ber-formula = 5.912.675.087 = tepat E16 (Operasi); selisih ke E14 = 449.300.000 = Modal, diketik tangan |

### 1.4 Dua kerumitan nyata pada Belanja Modal

Poin 7 di atas **bukan kemalasan**. Ada dua sebab struktural yang membuat rumus Excel tidak sanggup:

**(a) Kode rekening di BKU tidak menunjuk baris yang benar.**

```
BKU kwt 423 : kode 5.2.02.99.99.9999.07.01.0001
              "Belanja Modal Quantel Medical Opthalmic PT Surya Tam…"   Rp 442.890.000
                          │  kode ini TIDAK ADA di Realisasi BP
                          ▼
Realisasi BP R444 : item #58 "USG B-Scan Mata"  (pagu Rp 550.000.000)
                    di bawah kode 5.2.02.99.99.9999.05.01.0007.01
```

Yang menghubungkan "Quantel Medical Opthalmic" dengan "USG B-Scan Mata" adalah pengetahuan bendahara.

**(b) Satu transaksi dipecah ke beberapa baris barang.**

```
BKU kwt 324 : Rp 6.410.000  (satu kuitansi)
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Hardisk           item #16          item #17
   Rp 3.150.000      Rp 3.000.000      Rp 260.000
```

Di belanja operasi ini tak pernah terjadi — 444 transaksi BKU = 444 baris `register`, satu lawan satu.

---

## 2. Keputusan pokok

### 2.1 Realisasi adalah **turunan**, bukan salinan

Permintaan awal berbunyi *"realisasi itu copyan dari DPA/Pergeseran"*. Justru **menyalin** yang menghilangkan
sifat real-time-nya: begitu ada pergeseran baru, salinannya basi. Yang benar — Realisasi **tidak menyimpan pagu
sama sekali**:

```
Pagu Efektif (tahun T, baris X)
  = baris X pada Pergeseran versi TERBARU tahun T
  → kalau tahun T belum punya Pergeseran, ambil dari DPA versi TERBARU tahun T

Terserap = SUM(alokasi realisasi) untuk baris X
Sisa     = Pagu Efektif − Terserap
```

Sejalan aturan repo: kolom turunan tidak disimpan (pola BBA & Checkpoint D Kinerja).

### 2.2 Satu titik input, sisanya keluaran

```
INPUT (satu-satunya)              TURUNAN 100% — tidak ada ketik ulang
┌────────────────┐                ┌──────────────────────────────────────┐
│ Transaksi BKU  │───────────────▶│ register · Realisasi BP · pengantar  │
│ tgl · no.kwt   │                │ SPJ · TUTUP KAS · SPI · GU · setor   │
│ uraian · nilai │                └──────────────────────────────────────┘
│ kas / bank     │                             ▲
│ ▼ pilih baris  │                             │ PAGU otomatis
│   anggaran ────┼─────────────────────────────┘ (DPA / Pergeseran terbaru)
└────────────────┘
```

Tempat mengetik angka: dari **6 lembar** (BKU, SPI, register, pagu di Realisasi BP, bulan-lalu di Realisasi BP,
TUTUP KAS) menjadi **1** (Buku Kas).

### 2.3 `anggaran_key` — jangkar stabil (fondasi, tanpa ini semua runtuh)

DPA & Pergeseran disimpan **replace-all per versi** (DELETE + INSERT) dan `row_id` unik **per versi** —
buktinya `injectDpaKePergeseran` di `lib/blud/recalc.ts` terpaksa mencocokkan baris memakai FIFO matcher
berbasis kode+uraian, bukan id. Maka realisasi **tidak boleh** menempel ke `dpa_blud.id` atau `row_id`:
begitu versi baru disimpan, tautannya putus.

Solusinya kolom baru `anggaran_key` — identitas stabil per baris anggaran (pola `canonical_id` yang sudah
dipakai BBA & IKI), dibuat sekali saat baris lahir dan ikut terbawa saat versi disalin maupun saat inject.

### 2.4 Pilih baris, bukan ketik kode

Di Buku Kas, kolom "No. Rekening" **bukan kotak isian teks** tapi daftar pilihan berisi pohon DPA/Pergeseran
terbaru sampai level barang. Yang disimpan `anggaran_key`; kode rekening ikut sebagai teks untuk dicetak.

Ini yang membuat masalah §1.4(a) hilang dengan sendirinya, dan menjamin kode di BKU = kode di DPA
**karena berasal dari sumber yang sama**, bukan karena kebetulan cocok.

### 2.5 Satu transaksi → banyak alokasi

Menjawab §1.4(b). Jumlah alokasi wajib sama dengan nilai transaksi, dijaga server. Untuk hampir semua
transaksi hanya ada satu alokasi — tombol "Bagi ke beberapa" baru muncul bila dibutuhkan, jadi tampilannya
tetap sederhana. Berlaku untuk **semua** jenis belanja, bukan menu khusus modal.

### 2.6 "Realisasi bulan lalu" tidak disimpan

Cukup `SUM(alokasi) WHERE tahun = T AND bulan < bulan_terpilih`. Menghapus seluruh kelas galat §1.3 poin 4.

### 2.7 Saldo berjalan BKU tidak disimpan

Kolom Saldo (G/J di BKU) dihitung saat dibaca. Kalau disimpan, menyisipkan satu transaksi di tengah berarti
menulis ulang ratusan baris di bawahnya — sumber tabrakan baru yang jauh lebih parah.

---

## 3. Menu — 3 tile baru, grup PENATAUSAHAAN

Tiga pekerjaan dengan irama & pelaku berbeda. Dipaksa jadi satu layar = memindahkan kekacauan Excel ke web.

| Menu | Irama | Yang dikerjakan | Sheet yang dihasilkan |
|---|---|---|---|
| **Buku Kas** | harian | Input transaksi: tgl · no.kwt · uraian · **pilih baris anggaran** · kas/bank masuk-keluar | `BKU`, `SPI`, `setor BPD` |
| **Realisasi** | bulanan (pantau) | Pohon anggaran + pagu · bln ini · bln lalu · s/d · **sisa** · % · peringatan lebih pagu | `register`, ` Realisasi BP`, `GU …` |
| **Tutup Kas** | bulanan (tutup) | Sisi buku vs sisi nyata + **selisih wajib Rp 0** (§4.7), tutup periode (kunci), nomor surat, tanda tangan | `TUTUP KAS`, `pengantar`, `SPJ` |

Ditambah **satu tombol "Unduh SPJ Bulanan"** → satu berkas `.xlsx` berisi 8 sheet, susunan persis berkas Juni.

### 3.1 Yang sengaja TIDAK dibuat menu

- **`register`** — keluaran, bukan masukan. Jadi panel drill-down: klik satu baris di Realisasi → muncul
  daftar transaksi rekening itu. Itu persis isi `register`.
- **Pejabat penanda tangan** (Direktur · Bendahara · PPK + NIP), **saldo awal tahun**, **format nomor surat**
  → masuk menu **Pengaturan** BLUD yang sudah ada. Di Excel data ini diketik ulang di 5 lembar berbeda.
- **`Sheet1`** — lembar corat-coret (rekap listrik dll). Tidak dibuatkan.

### 3.2 Pemetaan 10 sheet → keluaran sistem

| Sheet | Cara dihasilkan |
|---|---|
| `BKU` | seluruh transaksi bulan itu + saldo berjalan dihitung |
| `SPI` | **tampilan** dari data yang sama, tanpa kolom Total — otomatis tak akan pernah melenceng lagi |
| `register` | transaksi dikelompokkan per baris anggaran + Jumlah Anggaran/Pengeluaran/Saldo |
| ` Realisasi BP` | pohon anggaran + pagu efektif + serapan (perhatikan **spasi di depan** nama sheet) |
| `GU …` | sama seperti Realisasi BP, dipotong rentang tanggal (multi-periode per bulan) |
| `pengantar` | 3 angka: Pegawai · Barang-Jasa · Modal (bln ini) + kop & tanda tangan |
| `SPJ` | 1 angka dari `pengantar` + blok tanda tangan (format BEND-12) |
| `TUTUP KAS` | sisi A dihitung dari transaksi; sisi B (tunai + rekening koran) diketik; **wajib seimbang** (§4.7) |
| `setor BPD` | saring transaksi berjenis setoran/transfer bank, **per bulan** |
| `Sheet1` | tidak dibuat |

Teknis: repo sudah memakai `exceljs` (`lib/blud/export/excel.ts`), jadi kop surat, merge cell, format BEND-12,
dan blok tanda tangan bisa direproduksi persis. **Keluarannya `.xlsx`** — `exceljs` tidak bisa *menulis* format
`.xls` lama (BIFF).

---

## 4. Aturan bisnis

### 4.1 Melebihi pagu → blokir keras + jalan keluar resmi

```
Bendahara simpan transaksi → server tolak (PAGU_TERLAMPAUI)
        │
        ▼  modal tema aplikasi (ConfirmDialog, BUKAN window.alert — L58)
   ┌──────────────────────────────────────────┐
   │  Melebihi Pagu                           │
   │  Rekening : 5.1.02…0059.01 Telepon       │
   │  Pagu     : Rp 50.000.000                │
   │  Terserap : Rp 48.500.000                │
   │  Transaksi: Rp  3.000.000                │
   │  Kurang   : Rp  1.500.000                │
   │      [ Batal ]   [ Ajukan Pergeseran ]   │
   └──────────────────────────────────────────┘
        │
        ▼  membuat catatan permintaan + notifikasi. TIDAK menyentuh pagu.
Notifikasi ke role pemegang DPA — tautan:
   /blud/pergeseran?tahun=2026&fokus=<anggaran_key>
        │
        ▼
Menu Pergeseran terbuka pada TAHUN & VERSI yang benar,
baris tujuan DISOROT (kuning, auto-scroll) — tapi KOSONG.
Pengelola menggeser sendiri seperti biasa → Simpan.
        │
        ▼
Realisasi berubah seketika (§4.4). Permintaan otomatis SELESAI + notifikasi balik.
```

**Tidak ada pengisian otomatis** — keputusan eksplisit. Sistem hanya mengantar ke tempat yang tepat; angkanya
tetap ditentukan manusia. Pemberitahuan di luar jam kerja tetap manual (WA/telepon) — di luar lingkup sistem.

### 4.2 Rekening belum ada di DPA → transaksi **diparkir**, bukan ditolak

Uangnya sudah keluar. Menolak mentah-mentah membuat saldo kas di BKU salah — lebih parah dari masalah aslinya.

```
Transaksi tersimpan dengan status BELUM_BERREKENING
   ├─ ✅ ikut menghitung saldo kas & bank di BKU      (angka kas tetap benar)
   ├─ ❌ tidak masuk Realisasi BP                      (belum ada baris pagunya)
   ├─ 🔔 masuk baki "Perlu Rekening (3)" berlencana angka
   └─ 🔒 Tutup Kas TIDAK BISA dijalankan selama baki terisi
        │  [ Ajukan Penambahan Rekening ] → notifikasi + tautan ke menu Pergeseran
        ▼
Pengelola menambah baris rekening di Pergeseran → Simpan
        ▼
Bendahara buka baki → pilih baris baru → transaksi menempel → baki kosong → Tutup Kas terbuka
```

Bedanya dengan membiarkan ketik kode bebas: itu **gagal diam-diam** (transaksi terlihat wajar tapi tidak
menunjuk ke mana pun, ketahuan saat total BKU ≠ total Realisasi BP di akhir bulan). Ini **gagal berisik**.

Penambahan rekening baru dilakukan lewat **menu Pergeseran** (dikonfirmasi: `pergeseran_dpa` memang
mengizinkan baris baru tanpa membuat versi DPA baru).

### 4.3 Pergeseran menurunkan pagu di bawah realisasi → tolak, dengan jalan keluar

Arah kebalikan §4.1, dan belum pernah dijaga di Excel. Saat menyimpan Pergeseran, server memeriksa tiap baris:
bila `pagu_baru < terserap`, simpan ditolak. Tiga pagar bila tetap dilanjutkan:

1. Tombol "Tetap Lanjut" **hanya untuk pemegang izin DPA/Pergeseran**, bukan bendahara — yang menanggung
   risiko harus yang memutuskan.
2. Alasan wajib diketik, masuk `writeAuditLog`.
3. Baris yang jadi minus ditandai merah permanen di layar Realisasi sampai diperbaiki.

### 4.4 Penanda perubahan pagu — tiga lapis

```
┌─ Pagu diperbarui: 3 naik · 1 turun · 2 rekening baru      [Lihat perubahan] ─┐  ← lapis 2
└──────────────────────────────────────────────────────────────────────────────┘
  Kode              Uraian            Pagu           Terserap     Sisa
  5.1.02…0059.01    Belanja telepon   52.000.000 ▲   48.500.000   3.500.000    ← lapis 1
                                      └ tooltip: "dari Rp 50.000.000 · Pergeseran 12 Jul 2026"
```

1. **Chip di baris** — `▲` hijau (naik) / `▼` amber (turun), tooltip nilai lama → baru + tanggal.
   Pakai standar tooltip repo (`data-tooltip` / portal `.blud-tip-portal`), **bukan** `title=""` bawaan browser.
2. **Banner ringkas** + panel diff: naik / turun / rekening baru / rekening hilang (**realisasi yatim**).
3. **Toast seketika** bila layar Realisasi sedang terbuka saat pergeseran disimpan.

Lapis 3 **tanpa WebSocket** — cukup membandingkan `blud_locks.version` tiap ~30 detik, satu query ringan.
Sesuai deployment PM2 + Nginx, tanpa infrastruktur baru.

Bonus: baris yang tadinya terblokir karena lebih pagu, begitu pagunya naik langsung berubah jadi chip hijau
"sudah bisa dilanjutkan" + notifikasi ke bendahara yang mengajukan.

### 4.5 Kunci periode

Tutup Kas menutup bulan → semua penulisan ke bulan itu ditolak **di server**. Dibuka kembali hanya oleh
SUPER_ADMIN (atas izin lisan), tercatat di audit log. Menu Audit khusus BLUD **ditunda** — `writeAuditLog`
sudah merekam semuanya, jadi datanya tidak hilang selama menunggu.

### 4.6 Saldo awal

Otomatis dari saldo akhir bulan sebelumnya. Pengecualian: **bulan pertama tahun anggaran** diisi sekali manual.

Saldo awal bulan ke-2 dan seterusnya **tidak disimpan** — dihitung ulang tiap kali dibaca dari arus kas bulan-bulan sebelumnya. Itu disengaja: mengoreksi satu transaksi Maret harus langsung merambat ke saldo April sampai Desember. Kalau disimpan, koreksinya berhenti di Maret dan sisa tahun diam-diam salah.

**Jalur tulisnya** (R3, 2026-07-28) — sebelum ini kolomnya hanya bisa diisi lewat SQL manual, tanpa jejak:

| | |
|---|---|
| Di mana | Layar Tutup Kas **Januari**, di kartu sisi A — dua barisnya berubah jadi isian. Bukan panel sendiri: angkanya memang sudah tampil di baris itu. |
| Kapan boleh | Selama **belum ada satu pun bulan tahun itu ditutup**. Sesudahnya beku — angkanya sudah jadi dasar berita acara bertanda tangan. |
| Siapa | Menu `tutup-kas` izin EDIT. **Tanpa daftar peran tersendiri**: setelah beku, satu-satunya jalan mengubahnya adalah membuka kembali Januari, dan pintu itu sudah dijaga `bolehBukaPeriode` yang sempit. |
| Jalur | `POST /api/blud/realisasi/saldo-awal` → `setSaldoAwalTahun()` (`withTransaction` + `FOR UPDATE`) → audit `BLUD_SALDO_AWAL_SET` berisi **lama → baru**. |
| Layar tahu dari mana | `NeracaKas.saldo_awal_terkunci`, **dikirim server**. Layar tidak boleh menyimpulkannya dari `status` bulan yang sedang dibuka — ia cuma memegang satu bulan, aturannya soal seluruh tahun. Satu fungsi `bulanTertutup()` dibaca layar dan pagar tulis sekaligus. |
| Uji | `node scripts/test-blud-saldo-awal.mjs` (tahun kotak pasir 2099). |

Sengaja **tanpa** `alasan` wajib, berbeda dari buka periode & hapus versi: keduanya merusak dokumen yang sudah ditandatangani, sedangkan di sini — selama masih boleh diubah — belum ada apa pun yang ditandatangani.

### 4.7 Tutup Kas wajib seimbang — sisi buku = sisi nyata

`TUTUP KAS` adalah Berita Acara Pemeriksaan Kas. Bentuk bakunya dua sisi yang **wajib bertemu di angka yang
sama** — itu justru satu-satunya gunanya:

```
  SISI A — menurut buku                     SISI B — menurut kenyataan
  saldo awal                                uang tunai di brankas   (hitung fisik)
  + penerimaan bulan ini                    + saldo rekening bank   (rekening koran)
  − pengeluaran bulan ini
  ─────────────────────────                 ─────────────────────────
  = A. saldo akhir buku          ═══════▶   = B. saldo akhir nyata
                        selisih WAJIB Rp 0
```

Di berkas Juni keduanya **tidak bertemu**: A = −650.471.561 (bahkan minus) vs B = 4.883.802.451, dan judulnya
masih "31 Mei 2026" — bukti rumusnya sudah rusak dan tidak ada yang memeriksanya.

**Aturan sistem:**

| Sisi | Asal angka |
|---|---|
| A — saldo buku | **dihitung**, tidak diketik: `saldo_awal + Σ masuk − Σ keluar` dari transaksi bulan itu |
| B — saldo nyata | **diketik** dua angka saja: hasil hitung uang tunai + saldo rekening koran |

Selisih ditampilkan besar-besar di layar Tutup Kas dan diperbarui saat mengetik. **Selisih ≠ 0 → tombol
"Tutup Bulan" mati.** Yang boleh menutup hanya bulan yang seimbang.

Bila selisihnya nyata (uang benar-benar kurang/lebih), penyelesaiannya **mencatat transaksi yang hilang di
Buku Kas** — bukan menimpa angkanya di layar Tutup Kas. Tidak disediakan kotak "penyesuaian" bebas: itu persis
cara berkas Juni jadi tidak seimbang tanpa ketahuan.

Sisi A tidak bisa dibuat minus tanpa sebab, karena setiap pengeluaran melewati §5.2 dan saldo dihitung dari
transaksi yang sama yang mencetak BKU. Kop bulan & tahun juga diambil dari periode, bukan diketik — masalah
"masih tertulis Mei" tidak bisa terjadi lagi.

### 4.8 Menumpang Tahun Anggaran

Realisasi tidak berdiri sendiri. Baris anggarannya berasal dari DPA/Pergeseran tahun tersebut, jadi:

- Tahun yang **belum punya DPA** → Buku Kas untuk tahun itu tidak bisa dibuka. Pesannya menyebutkan sebabnya
  dan menautkan ke menu DPA — bukan layar kosong tanpa keterangan.
- Pemilih tahun memakai `TahunDropdown` yang sudah ada, sumbernya `getTahunList()` — satu daftar tahun untuk
  seluruh modul BLUD, tidak dibuat sendiri.
- Transaksi selalu terikat `tahun_anggaran`; pindah tahun berarti pindah buku, tidak ada data yang bocor
  antar tahun.

---

## 5. Ketahanan terhadap tabrakan (paling krusial)

Dua jenis tabrakan yang sifatnya berbeda. Yang kedua tidak tertangkap pengaman biasa.

### 5.1 Dua orang mengubah transaksi yang sama

CAS per-baris `version` (pola L48 seperti BBA). Yang kalah **tidak kehilangan isian** — muncul modal
banding berdampingan:

```
┌── Baris ini sudah diubah Budi pukul 14:32 ──────────────────────────────┐
│  Kolom      Versi Anda            Versi Budi (tersimpan)                 │
│  Tanggal    2                     2                     ✓ sama           │
│  No. Kwt    14                    14                    ✓ sama           │
│  Uraian     Tagihan telpon Mei    Tagihan telepon Mei   ⚠ mirip 94%      │
│  Rekening   …0059.01              …0059.01              ✓ sama           │
│  Nilai      414.694               414.649               ⚠ BEDA           │
│             [◉ punya saya]  [○ punya Budi]   per baris                   │
│      [ Batal ]                            [ Simpan gabungan ]            │
└──────────────────────────────────────────────────────────────────────────┘
```

Deteksi kemiripan memakai `lib/sentinel/fuzzy.ts` yang sudah ada.

> **Batas yang tidak boleh dilanggar:** sistem **tidak pernah menggabungkan sendiri**. Ini uang. Kemiripan
> teks 94% bisa berarti dua tagihan telepon untuk dua nomor berbeda — menghapus salah satunya karena "mirip"
> adalah kesalahan yang baru ketahuan saat audit. Sistem menandai dan mengusulkan; manusia memutuskan.

Lebih berguna lagi: **mencegah sebelum tersimpan.** Saat input, bila di bulan sama sudah ada rekening +
nominal sama dengan uraian mirip → peringatan *"kemungkinan dobel dengan kuitansi no. 14 tanggal 3"*.
Pola sudah ada di repo: `lib/blud/dup-guard.ts`.

Catatan penting: bentrok ini **jarang**, karena Buku Kas menyimpan **satu transaksi = satu baris** (bukan
replace-all seperti DPA). Dua orang mencatat transaksi berbeda sama sekali bukan bentrok — dua-duanya tersimpan.

### 5.2 Dua orang mencatat transaksi BERBEDA ke rekening yang SAMA

```
Sisa pagu Rp 5 juta
 A: cek sisa → 5 jt ✓ … simpan Rp 4 jt
 B: cek sisa → 5 jt ✓ … simpan Rp 3 jt
 Hasil: terserap Rp 7 jt dari pagu Rp 5 jt — DUA-DUANYA LOLOS
```

CAS tidak menolong; barisnya memang beda. Masalahnya: keduanya **membaca sisa yang sama lalu sama-sama menulis**.

**Obatnya — pemeriksaan pagu dan penulisan harus atomik dalam satu transaksi DB:**

```
withTransaction:
  1. urutkan daftar anggaran_key (menaik)          ← §5.3
  2. untuk tiap key berurutan: INSERT IGNORE lalu SELECT … FOR UPDATE pada blud_locks
  3. SELECT SUM(nilai) FROM blud_realisasi_alokasi WHERE tahun=? AND anggaran_key=? FOR UPDATE
  4. bila SUM + nilai_baru > pagu efektif → ROLLBACK, lempar PAGU_TERLAMPAUI
  5. INSERT transaksi + alokasi
  COMMIT
```

`FOR UPDATE` pada satu baris per `anggaran_key` membuat penulis rekening yang sama **mengantre otomatis**.
Yang kedua melihat SUM yang sudah termasuk transaksi pertama → ditolak dengan benar.

Sifatnya: kunci **per rekening**, bukan per aplikasi. Mencatat belanja telepon dan belanja listrik tidak
saling menunggu. Antrenya milidetik — tidak terasa. Bila ditolak, modal §4.1 ditambah satu baris:
*"Sisa berubah karena Budi baru mencatat Rp 4.000.000 pada rekening ini pukul 14:32."*

Pola ini sudah terbukti di repo: V3-4 (kuota verify-email `FOR UPDATE`) dan V3-5 (lockout login atomik, L55).
Tempat kuncinya memakai `blud_locks` yang sudah berdiri: `entity='realisasi_pagu'`, `key_id='<tahun>:<anggaran_key>'`.

**Dua jebakan yang baru ketahuan saat diuji, bukan saat dibaca:**

1. **`SELECT … FOR UPDATE` pada baris yang belum ada tidak mengunci apa pun.** Rekening yang belum pernah
   dipakai belum punya baris lock, jadi dua transaksi sama-sama lolos. Obatnya `INSERT IGNORE` dulu baru
   `FOR UPDATE` — itu isi `acquireBludLock()` di `lib/blud/lock.ts`.
2. **`FOR UPDATE` pada SUM-nya juga wajib.** Isolasi bawaan MySQL (REPEATABLE READ) membuat `SELECT` biasa
   membaca **snapshot** yang diambil pada pembacaan pertama transaksi — yaitu **sebelum** kunci didapat.
   Kuncinya menang, tapi angkanya basi: alokasi transaksi lain yang baru commit tidak terlihat, dan pagu
   tetap jebol. Locking read selalu membaca commit terakhir.

   Ini bukan teori. Uji `T7b` di `scripts/concurrency-test.js` **gagal** persis di titik ini — dua transaksi
   4 jt + 3 jt lolos bersama dari pagu 5 jt walau penguncian sudah benar. Sesudah `FOR UPDATE` dipasang di
   SUM: 1 tersimpan, 1 ditolak.

**Yang haram — dua-duanya anti-pattern CLAUDE.md:**

- ❌ `const sisa = pagu - terserap; if (sisa >= nilai) INSERT` di JS → lost update, persis L55.
- ❌ Menyimpan `total_terserap` lalu `UPDATE SET total = ${hitungJS}`. Bila kolom itu memang dibutuhkan demi
  kecepatan, wajib `UPDATE SET total = total + ?` (atomik di SQL).

### 5.3 Urutan penguncian — cegah kebuntuan (deadlock)

Konsekuensi §2.5: satu transaksi bisa mengunci beberapa rekening sekaligus.

```
X → bagi ke [B, A]      X: kunci B ✓ … minta A → ditahan Y
Y → bagi ke [A, B]      Y: kunci A ✓ … minta B → ditahan X   ← lingkaran tunggu
```

InnoDB **mendeteksi** lingkaran ini dan membunuh salah satunya (galat `1213 Deadlock found`) — jadi aplikasi
tidak menggantung, tapi gejalanya "simpan gagal sesekali tanpa pola", yang justru lebih sulit dilacak.

**Solusi: urutkan `anggaran_key` menaik sebelum mengunci apa pun.** Bila semua pihak mengunci dalam urutan
yang sama, lingkaran secara matematis mustahil terbentuk — bukan sekadar diperkecil peluangnya.

Kunci satu per satu dalam urutan tersebut, **bukan** satu perintah `IN (…)`: dengan `IN`, urutan pengambilan
kunci bergantung rencana eksekusi MySQL sehingga jaminannya melemah tanpa alasan sepadan.

Pengaman pelengkap: (a) transaksi DB dibuat sependek mungkin — validasi Zod & pencarian baris anggaran
dikerjakan **sebelum** transaksi dibuka; (b) coba ulang sekali bila tetap kena `1213` (galat sementara,
bukan galat data); (c) skenario baru di `scripts/concurrency-test.js` yang sudah ada: dua sesi membagi
transaksi ke dua rekening sama dengan urutan ketik terbalik → benar bila keduanya selesai tanpa `1213`.

#### 5.3.1 Kunci setahun jalur versi (ditambahkan 2026-08-29)

Urutan di atas menjaga transaksi realisasi satu sama lain. Yang TIDAK dijaganya:
dua **penghapusan versi** di tahun yang sama.

`pagarHapusVersi` membuka dengan satu pertanyaan — *"versi ini `MAX(versi_tanggal)`
atau bukan?"* Kalau bukan, penghapusan dibiarkan lewat, dan itu benar: pagu tidak
bergeser. Cacatnya bukan di jawabannya, tapi di **kapan** ia dibaca — sebelum kunci
apa pun dipegang, jadi jawabannya datang dari snapshot baca-konsisten yang bisa
sudah usang begitu transaksi lain commit.

```
T1 hapus Des (terbaru)  → penerus Jun, pagu 5jt ≥ terserap 3jt   → lolos
T2 hapus Jun (tengah)   → MAX masih Des (T1 belum commit)        → lolos, tanpa periksa
keduanya commit         → yang tersisa Jan, pagu 1jt < 3jt       ← pagu di bawah realisasi
```

Diperbaiki dengan `BLUD_VERSI_ENTITY` — satu baris kunci **per tahun**, diambil
sebagai perintah PERTAMA di **keenam** transaksi versi (`saveDpa` ×2,
`savePergeseran` ×2, `deleteDpaVersi`, `deletePergeseranVersi`). Dua hal yang
membuat penempatannya tidak bisa ditawar:

- **Pertama, bukan di tengah.** Snapshot baca-konsisten lahir di `SELECT` biasa
  yang pertama; mengambil kuncinya belakangan hanya menjaga jawaban yang sudah
  terlanjur salah (L55). `assertBludVersion` boleh mendahului — itu *locking read*,
  tidak melahirkan snapshot.
- **Entity sendiri, bukan `BLUD_PERIODE_ENTITY`.** Menumpang entity Tutup Kas
  membentuk siklus: hapus-versi (periode-tahun → pagu) × Tutup Kas (periode-tahun →
  baris bulan) × catat BKU (baris bulan → pagu). Dengan entity terpisah kunci ini
  selalu terluar — tidak ada jalur yang memegang kunci pagu atau baris periode
  lebih dulu lalu memintanya.

Juga dipasang di jalur SIMPAN, bukan hanya HAPUS (L69): menyimpan versi lama yang
`versiJadiSumberPagu` jawab "bukan sumber pagu", lalu menghapus versi terbaru,
menghasilkan keadaan yang sama persis.

Diuji sungguhan & deterministik: `node scripts/test-blud-race-hapus-versi.mjs`
memutar balapannya dua kali — tanpa kunci (pagu mendarat Rp 1.000.000 di bawah
serapan Rp 3.000.000) dan dengan kunci (yang kedua menunggu, lalu ditolak).
Pasangan statisnya `npx tsx scripts/test-blud-kunci-versi.mts` (10) menjaga keenam
titiknya tidak lepas — 5 uji mutasi tertangkap.

### 5.4 Nomor kuitansi

Diberikan **server** secara berurutan (pola `canonical_id` atomik BBA/IKI), dengan
`UNIQUE (tahun_anggaran, bulan, no_kwt)`. Di berkas Juni nomornya berurutan rapi 1–444 tanpa lompatan.

Lingkungan DB: MySQL 8.4.3, semua 46 tabel **InnoDB** (`docs/schema-mysql.sql` menulis `ENGINE=InnoDB`
eksplisit di 46/46 `CREATE TABLE`), `innodb_deadlock_detect=ON`, `innodb_lock_wait_timeout=50`.
Transaksi, `FOR UPDATE`, dan foreign key semuanya tersedia.

---

## 6. Perubahan skema

**Berkas baru**: `docs/migrations/migration-blud-realisasi.sql`
**Diedit**: `docs/schema-mysql.sql` (aturan CLAUDE.md: MySQL syntax, **tanpa `IF NOT EXISTS` pada `ADD COLUMN`**).

### 6.1 `anggaran_key` di DPA & Pergeseran

```sql
ALTER TABLE dpa_blud
  ADD COLUMN anggaran_key VARCHAR(64) NULL
  COMMENT 'Identitas stabil baris anggaran lintas-versi (jangkar realisasi)' AFTER row_id;
ALTER TABLE dpa_blud ADD INDEX idx_anggaran_key (tahun_anggaran, anggaran_key);

ALTER TABLE pergeseran_dpa
  ADD COLUMN anggaran_key VARCHAR(64) NULL
  COMMENT 'Identitas stabil baris anggaran lintas-versi (jangkar realisasi)' AFTER row_id;
ALTER TABLE pergeseran_dpa ADD INDEX idx_anggaran_key (tahun_anggaran, anggaran_key);
```

**Tidak ada backfill.** Pemasangan di server kantor memakai database kosong — semua data diinput dari nol,
jadi tidak ada baris lama yang perlu diberi key susulan. Key dibuat **server** (`lib/blud/anggaran-key.ts`,
UUID acak berawalan `AK-`) saat baris lahir di `saveDpa`/`savePergeseran`, lalu dipantulkan klien pulang-pergi
sehingga ikut terbawa saat versi disalin maupun saat inject DPA → Pergeseran.

Pemeriksanya `scripts/check-anggaran-key.mjs` — **baca saja, tidak punya mode tulis**. Memeriksa 4 hal:
tiap baris punya key · key tidak kembar dalam satu versi · key bertahan saat versi berganti · key pergeseran
nyambung ke DPA. Dijalankan tiap kali `saveDpa`/`savePergeseran`/`injectDpaKePergeseran` disentuh.

### 6.2 Tabel baru

```sql
-- Transaksi kas/bank = satu baris BKU
CREATE TABLE IF NOT EXISTS blud_realisasi_tx (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  bulan          TINYINT UNSIGNED  NOT NULL COMMENT '1..12',
  tanggal        DATE          NOT NULL,
  no_kwt         INT UNSIGNED      NULL COMMENT 'NULL utk baris non-kuitansi (saldo awal, ambil bank)',
  jenis          ENUM('BELANJA','AMBIL_BANK','SETOR_BANK','PENERIMAAN','LAIN') NOT NULL DEFAULT 'BELANJA',
  uraian         TEXT          NOT NULL,
  kas_masuk      DECIMAL(18,2) NOT NULL DEFAULT 0,
  kas_keluar     DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_masuk     DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_keluar    DECIMAL(18,2) NOT NULL DEFAULT 0,
  status         ENUM('NORMAL','BELUM_BERREKENING') NOT NULL DEFAULT 'NORMAL',
  version        INT           NOT NULL DEFAULT 0 COMMENT 'CAS per-baris (L48)',
  created_by     INT               NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kwt (tahun_anggaran, bulan, no_kwt),
  INDEX idx_periode (tahun_anggaran, bulan, tanggal, id),
  INDEX idx_status  (status),
  CONSTRAINT fk_brt_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Transaksi kas/bank (sumber BKU & seluruh sheet turunan)';

-- Pembebanan transaksi ke baris anggaran (1 transaksi bisa N baris — §2.5)
CREATE TABLE IF NOT EXISTS blud_realisasi_alokasi (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tx_id          BIGINT UNSIGNED NOT NULL,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL COMMENT 'denormal — index SUM per tahun',
  anggaran_key   VARCHAR(64)   NOT NULL,
  nilai          DECIMAL(18,2) NOT NULL,
  INDEX idx_key (tahun_anggaran, anggaran_key),
  INDEX idx_tx  (tx_id),
  CONSTRAINT fk_bra_tx FOREIGN KEY (tx_id) REFERENCES blud_realisasi_tx(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Alokasi transaksi ke baris anggaran';

-- Periode bulanan: saldo awal + status buka/tutup
CREATE TABLE IF NOT EXISTS blud_periode (
  tahun_anggaran  SMALLINT UNSIGNED NOT NULL,
  bulan           TINYINT UNSIGNED  NOT NULL,
  status          ENUM('BUKA','TUTUP') NOT NULL DEFAULT 'BUKA',
  saldo_awal_kas  DECIMAL(18,2) NOT NULL DEFAULT 0,
  saldo_awal_bank DECIMAL(18,2) NOT NULL DEFAULT 0,
  kas_fisik       DECIMAL(18,2)     NULL COMMENT 'sisi B: hasil hitung uang tunai (§4.7)',
  bank_koran      DECIMAL(18,2)     NULL COMMENT 'sisi B: saldo rekening koran (§4.7)',
  no_surat        VARCHAR(64)       NULL,
  tgl_surat       DATE              NULL,
  ditutup_oleh    INT               NULL,
  ditutup_at      DATETIME          NULL,
  PRIMARY KEY (tahun_anggaran, bulan),
  CONSTRAINT fk_bp_user FOREIGN KEY (ditutup_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Periode bulanan realisasi (saldo awal + kunci tutup kas)';

-- Permintaan pergeseran / penambahan rekening (§4.1 & §4.2)
CREATE TABLE IF NOT EXISTS blud_permintaan (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  jenis          ENUM('PERGESERAN','REKENING_BARU') NOT NULL,
  anggaran_key   VARCHAR(64)       NULL COMMENT 'NULL utk REKENING_BARU',
  kode_rekening  VARCHAR(64)       NULL,
  uraian         TEXT          NOT NULL,
  kekurangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  status         ENUM('MENUNGGU','SELESAI','DITOLAK') NOT NULL DEFAULT 'MENUNGGU',
  tx_id          BIGINT UNSIGNED   NULL COMMENT 'transaksi pemicu (utk REKENING_BARU)',
  diminta_oleh   INT               NULL,
  diminta_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  selesai_at     DATETIME          NULL,
  INDEX idx_status (tahun_anggaran, status),
  CONSTRAINT fk_bpm_user FOREIGN KEY (diminta_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Permintaan pergeseran / penambahan rekening dari bendahara';

-- Pejabat penanda tangan (kop 5 sheet) — hindari ketik ulang di tiap lembar
CREATE TABLE IF NOT EXISTS blud_pejabat (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  jabatan        ENUM('DIREKTUR','BENDAHARA','PPK') NOT NULL,
  nama           VARCHAR(128) NOT NULL,
  nip            VARCHAR(32)      NULL,
  UNIQUE KEY uq_tahun_jabatan (tahun_anggaran, jabatan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Pejabat penanda tangan dokumen SPJ';
```

Kolom turunan yang **sengaja tidak ada**: `pagu`, `terserap`, `sisa`, `persen`, `saldo_berjalan`,
`realisasi_bulan_lalu`. Semuanya dihitung server saat dibaca (§2.1, §2.6, §2.7).

---

## 7. Data layer, Zod, API, UI

### 7.1 Berkas baru

| Berkas | Isi |
|---|---|
| `lib/blud/realisasi-data.ts` | CRUD transaksi + alokasi, `withTransaction` + `bulkInsert`, CAS L48, kunci pagu §5.2 |
| `lib/blud/pagu.ts` | `getPaguEfektif(tahun)` — pohon baris + pagu + terserap + sisa; `diffPagu()` utk §4.4 |
| `lib/blud/bku.ts` | susun BKU: urut tanggal+id, saldo berjalan dihitung, total |
| `lib/blud/realisasi-schemas.ts` | Zod sentral + `isBludRealisasiRole` + reuse `bludRateLimit` |
| `lib/blud/export/spj-excel.ts` | penghasil 8 sheet dalam satu workbook `exceljs` |
| `components/blud/TransaksiModal.tsx` | form transaksi + pilih baris anggaran + bagi alokasi |
| `components/blud/PaguExceededDialog.tsx` | modal §4.1 |
| `components/blud/KonflikBandingDialog.tsx` | banding berdampingan §5.1 |
| `components/blud/BakiRekeningPanel.tsx` | baki "Perlu Rekening" §4.2 |

### 7.2 Route API — `app/api/blud/realisasi/`

| Route | Isi |
|---|---|
| `_guard.ts` | `isBludRealisasiRole` — mendampingi `isBludRole`, **tidak mengubah** yang lama |
| `tx/route.ts` | GET daftar BKU (`?tahun=&bulan=`) · POST tambah · PATCH ubah (CAS) · DELETE |
| `pagu/route.ts` | GET pohon pagu efektif + terserap + sisa + penanda perubahan |
| `periode/route.ts` | GET status · POST tutup · DELETE buka (SUPER_ADMIN + audit) |
| `permintaan/route.ts` | GET daftar · POST ajukan · PATCH tandai selesai |
| `export/route.ts` | GET unduh `.xlsx` 8 sheet |

Semua wajib: `getSession` → guard akses → `bludRateLimit` → Zod → `withTransaction` → `writeAuditLog`.
Kunci `app_status_blud_realisasi` untuk kill-switch, sejalan pola modul lain.

### 7.3 Berkas yang diubah

| Berkas | Perubahan |
|---|---|
| `app/(dashboard)/blud/blud-shell.tsx` | +3 tile, grup `PENATAUSAHAAN` |
| `app/api/blud/pergeseran/route.ts` | guard §4.3 (pagu baru < terserap) + tandai permintaan SELESAI |
| `lib/blud/data.ts` | ✅ `ensureAnggaranKey()` di `saveDpa`/`savePergeseran` — baris baru dapat key, salinan membawa key |
| `lib/blud/recalc.ts` | ✅ `injectDpaKePergeseran` mewariskan `anggaran_key` dari baris DPA |
| `app/(dashboard)/blud/pergeseran/pergeseran-client.tsx` | terima `?fokus=` → sorot + auto-scroll baris |
| `app/(dashboard)/blud/pengaturan/pengaturan-client.tsx` | + panel Pejabat SPJ, saldo awal tahun, format no. surat |
| `docs/schema-mysql.sql` | 5 tabel baru + 2 kolom `anggaran_key` |
| `scripts/concurrency-test.js` | + skenario pagu bersamaan & urutan kunci terbalik (§5.3) |

### 7.4 Akses — untuk sekarang

Mengikuti `BLUD_ALLOWED_ROLES` yang ada: **SUPER_ADMIN + ADMIN**. Pemisahan izin **input** vs **lihat**
tetap ditulis di lapisan server sejak awal, hanya keduanya diberikan penuh ke dua role itu. Saat pembagian
role diaktifkan nanti (bersama `docs/CONCEPT-menu-access-control.md`), tinggal memberi kunci akses — tidak ada
route yang perlu dibongkar.

Kunci `app_access` disiapkan: `blud_realisasi` (nanti otomatis jadi `blud.realisasi` saat registry menu jalan).

---

## 8. Urutan eksekusi

Wajib bertahap. Tiap fase berdiri sendiri dan bisa diverifikasi.

### Fase 0 — Persiapan
- [ ] Dokumen ini disetujui.
- [x] Temuan berkas Juni sudah diputuskan semua (§10) — tidak ada penghalang.
- [x] Prasyarat Tahun Anggaran sudah dieksekusi & migrasi sudah jalan di server.

### Fase 1 — Jangkar `anggaran_key` ✅ SELESAI
- [x] Migrasi kolom + index (`migration-blud-realisasi-anggaran-key.sql`) — sudah jalan di DB lokal.
- [x] `lib/blud/anggaran-key.ts` (mint server) · `data.ts` (`saveDpa`/`savePergeseran`) · `recalc.ts`
      (`injectDpaKePergeseran` mewariskan key baris DPA) · Zod + `types/index.ts`.
- [x] `scripts/check-anggaran-key.mjs` — pemeriksa baca-saja, 4 pemeriksaan.
- [x] **DoD**: `tsc` bersih. Sisa uji hidup (simpan versi kedua → key tetap; inject → key terbawa)
      dijalankan lewat pemeriksa begitu ada data DPA nyata.
- [x] **Cacat yang ketahuan di Fase 4 & sudah diperbaiki**: `dpa-client.tsx` dan
      `pergeseran-client.tsx` menyusun ulang baris dengan daftar kolom tetap saat memuat —
      `anggaran_key` ikut terbuang di situ. Akibatnya setiap Simpan mengirim baris tanpa jangkar,
      `ensureAnggaranKey` menganggapnya baris baru, dan **seluruh realisasi jadi yatim di
      penyimpanan berikutnya**. Zod `.passthrough()` tidak menolong karena kliennya yang
      membuang, bukan servernya. Kini dipantulkan di 3 titik: muat DPA, muat Pergeseran, dan
      Generate. Pelajaran: `.passthrough()` di server hanya menjaga separuh jalan.
      Kolom `origin`/`usulan_item_id`/`usulan_no` ternyata ikut terbuang di jalur yang sama —
      cacat yang sudah ada sejak sebelum modul ini, ikut sembuh oleh perbaikan yang sama.
- [x] **Pagar kelas cacatnya** (bukan cuma tambalannya):
      1. `lib/blud/row-map.ts` — satu-satunya tempat baris server diubah jadi baris klien.
         Tambah kolom = ubah satu berkas; tempat pemetaan baru otomatis ikut benar.
      2. `periksaJangkar()` di `saveDpa`/`savePergeseran` — baris yang **terbukti sama**
         (`row_id` yang di versi terbaru sudah berjangkar) tapi datang tanpa `anggaran_key`
         → simpan **ditolak** (`JANGKAR_HILANG`, 409). Sengaja tidak bisa ditembus `force`:
         kehilangan jangkar tidak pernah disengaja. Baris yang benar-benar baru punya
         `row_id` baru, jadi impor besar atau susun-ulang dari nol tidak ikut tertahan.
- [x] **Pagar itu langsung menyala palsu saat pertama dicoba — dan itu berguna.** Uji nyata:
      Form Baru → Simpan → Simpan lagi → ditolak "8 dari 8 baris tanpa `anggaran_key`",
      padahal DPA-nya baru dan belum punya realisasi sama sekali. Sebabnya bukan pagarnya:
      **kunci dicetak server tapi tidak pernah dikembalikan ke klien**, jadi state di layar
      tetap tanpa jangkar dan simpan kedua betul-betul mengirim baris tanpa jangkar.
      Muat ulang halaman membuatnya normal — persis gejala yang dilaporkan.
      Perbaikan: `saveDpa`/`savePergeseran` mengembalikan peta `row_id → anggaran_key`
      (`SimpanHasil.jangkar`), kedua klien menyerapnya ke state setelah simpan berhasil.
      Pelajaran: mencetak identitas di server itu benar, tapi belum selesai sampai
      identitasnya pulang ke pemegang state.
- Nilai: fondasi. Tanpa ini fase berikutnya runtuh di pergeseran pertama.

### Fase 2 — Buku Kas (input)
- [x] 3 tabel: `blud_realisasi_tx`, `blud_realisasi_alokasi`, `blud_periode` (`migration-blud-realisasi-tx.sql`).
- [x] `pagu.ts` (pagu efektif + serapan) · `realisasi-schemas.ts` (Zod + error domain) ·
      `realisasi-data.ts` (CRUD + kunci pagu) · route `tx/` + `_guard.ts` · 3 event audit.
- [x] Kunci pagu §5.2 + urutan kunci §5.3 + nomor kuitansi server §5.4.
- [x] **DoD sebagian**: `scripts/concurrency-test.js` **13/13 PASS** (T7a/T7b pagu, T8a/T8b urutan kunci);
      `tsc` + ESLint bersih.
- [x] Layar `/blud/buku-kas` + `TransaksiModal` (pilih baris anggaran, bagi alokasi, parkir,
      pesan PAGU_TERLAMPAUI utuh) + tile grup PENATAUSAHAAN + kelas `.bk-*` dark & light.
- [ ] **DoD sisa — belum bisa diuji**: saldo berjalan & alur input hanya bisa dicoba setelah ada
      data DPA nyata dan login. `next build` lolos, `tsc` + ESLint bersih, tapi layarnya
      **belum pernah dijalankan dengan data**.

### Fase 3 — Realisasi (pantau)
- [x] `getSerapanPeriode` (bulan ini · bulan lalu · setahun, satu query) + `gulungKeAtas`
      (serapan anak naik ke induk — tanpa ini semua baris induk nol) di `pagu.ts`;
      route `pagu/` menerima `?bulan=` dan `?mode=cap`.
- [x] Layar `/blud/realisasi` — pohon ciut/buka + cari, 6 kolom serapan, baris minus merah,
      tile grup PENATAUSAHAAN, kelas `.rl-*` dark & light.
- [x] Panel drill-down `register` (`getRegister` + route `register/` + `RegisterPanel`).
- [x] Penanda perubahan pagu §4.4 tiga lapis: chip ▲▼/baru per baris + banner ringkas & panel
      diff + toast, disulut sidik jari `getPaguCap` (CRC32 per baris — **bukan** SUM pagu,
      sebab pergeseran wajib berimbang jadi totalnya justru tidak berubah) tiap 30 detik.
- [x] Guard §4.3 `pagarSimpanVersi` (dulu `cekPaguDibawahRealisasi` di route — dipindah ke
      dalam transaksi simpan oleh B3, dan ikut dipasang di jalur DPA oleh B2) + modal "Tetap Lanjut" dengan
      alasan wajib → audit `BLUD_PAGU_DIBAWAH_REALISASI`. Baris yatim (rekening dihapus
      padahal masih terpakai) ikut tertangkap.
- [ ] **DoD — belum bisa diuji**: total layar Realisasi = total Buku Kas bulan itu sampai
      rupiah terakhir. `tsc` + ESLint bersih dan `next build` lolos, tapi angkanya belum
      pernah dibandingkan dengan data nyata.

### Fase 4 — Permintaan & baki rekening
- [x] Tabel `blud_permintaan` (`migration-blud-permintaan.sql`, sudah jalan di DB lokal) +
      `lib/blud/permintaan-data.ts` + route `permintaan/` (GET/POST/PATCH) + 3 event audit.
      Permintaan kembar untuk rekening yang sama tidak menumpuk — yang lama diperbarui.
- [x] §4.1: tombol **Ajukan Pergeseran** muncul di modal transaksi begitu server menolak
      `PAGU_TERLAMPAUI`. Membuat catatan + notifikasi ke `__ADMIN__` berisi tautan
      `?fokus=<anggaran_key>`. **Pagu tidak disentuh** — angkanya tetap ditentukan manusia.
- [x] §4.2: `BakiRekeningPanel` — daftar transaksi diparkir SETAHUN penuh, dua jalan keluar
      per baris (**Sambungkan** ke baris yang ada · **Minta rekening** baru). Dibuka dari
      banner di Buku Kas.
- [x] `?fokus=` di `pergeseran-client.tsx`: baris disorot + auto-scroll, **tetap kosong**.
- [x] Penutupan otomatis: setelah Pergeseran tersimpan, permintaan yang pagunya sudah cukup
      ditandai SELESAI + notifikasi balik ke peminta. Dijalankan **setelah** commit dan
      dibungkus try sendiri — gagal menutup permintaan tidak boleh membatalkan pergeseran.
- [ ] **DoD — belum bisa diuji**: alur lengkap tolak → ajukan → geser → notifikasi balik →
      transaksi lanjut. `tsc` + ESLint bersih, `next build` lolos.

### Fase 5 — Tutup Kas & keluaran Excel
- [x] `blud_pejabat` (`migration-blud-pejabat.sql`, sudah dijalankan ke `prima_db_3`) + panel
      **Pejabat Penanda Tangan SPJ** di Pengaturan BLUD, lengkap dengan tombol **Ambil dari PK**.
- [x] Layar **Tutup Kas** (`/blud/tutup-kas`) — dua sisi berdampingan, selisih besar-besar,
      tombol "Tutup Bulan" mati saat selisih ≠ 0 atau masih ada penghalang.
- [x] Kunci periode §4.5: penulisan ke bulan TUTUP sudah ditolak `realisasi-data.ts` sejak Fase 2;
      pembukaan kembali hanya SUPER_ADMIN, wajib beralasan ≥10 karakter, tercatat `BLUD_PERIODE_BUKA`.
- [x] `spj-excel.ts` — dibangun di server lewat `GET /api/blud/realisasi/export`:
      ` Realisasi BP` · BKU · SPI · register · **GU (satu lembar per pengajuan)** · pengantar ·
      SPJ · TUTUP KAS · setor BPD.
- [x] `blud_gu_periode` (`migration-blud-gu-periode.sql`, sudah dijalankan) + panel
      **Pengajuan GU bulan ini** di layar Tutup Kas.
- [x] **Bentuk 10 lembar disamakan dengan berkas asli** `docs/06. BKU Juni 2026.xlsx`: kop, urutan &
      penomoran kolom, baris nomor kolom (`7(5+6)`, `10(7+10)`, `6(4 + 5)`), lampiran BEND-12, dan
      blok tanda tangan. `BKU` & `SPI` kini satu fungsi (SPI = BKU tanpa kolom Total) — mustahil
      melenceng lagi. `TUTUP KAS` memakai penomoran A.1–A.4 / B.1–B.3.
- [ ] **DoD sebagian**: perakitan workbook sudah diuji jalan (harness data palsu: 10 lembar terbentuk,
      2 lembar GU, tidak ada galat merge exceljs). Yang belum: banding **angka** hasil unduhan dengan
      berkas asli — butuh data realisasi Juni 2026 nyata di basis data. `tsc` + ESLint bersih,
      `next build` lolos, seluruh SQL Fase 5 diuji ke MySQL 8.4.

**Dua cacat yang tertangkap uji rakit (2026-07-26), bukan oleh `tsc`:**

1. **`SPJ` memakai arus kas keluar, bukan realisasi.** Di berkas asli `pengantar` dan `SPJ` memuat
   angka yang **sama persis** (6.361.975.087). Arus kas keluar berbeda dari itu: pemindahan bank→kas
   dan transaksi yang masih diparkir ikut mengurangi kas tapi tidak dipertanggungjawabkan ke baris
   anggaran mana pun. Keduanya kini memakai satu sumber, `Konteks.belanja` (jumlah alokasi).
2. **`pengantar` mencetak `No. 900.1.6/900.1.6/1234`** — awalan ditempel dua kali karena nomor surat
   dari Tutup Kas sudah lengkap.

**Keputusan #32 — arus kas bersih di Tutup Kas.** `A.2 Kas Masuk` / `A.3 Kas Keluar` (dan dua baris
yang sama di layar) menghitung arus **dari/ke luar saja**; pemindahan bank↔kas dibersihkan lewat
`SUM(GREATEST(masuk − keluar, 0))` per baris. Mengambil Rp 440 juta dari bank ke brankas bukan
penerimaan — uangnya milik sendiri, cuma pindah tempat. Saldo akhirnya identik; yang berbeda adalah
kejujuran dua angka yang ikut ditandatangani. Cara ini juga tidak bergantung pada kolom `jenis`,
jadi transaksi campuran pun ikut bersih sendiri.

**Keputusan #31 — rentang GU dicatat, bukan diterka.** Berkas asli punya lembar `GU 1-26 Juni 2026`:
tanggal 1 s/d 26, bukan sebulan penuh. Bulan lain bisa dua-tiga pengajuan. Tidak ada penanda apa pun
di transaksi yang bisa dipakai menebak "GU ke-2 mulai di sini", jadi rentangnya diisi manusia di layar
Tutup Kas. Yang disimpan **hanya rentang tanggalnya** — angka tiap lembar tetap dihitung saat berkas
dibuat. Rentang wajib berada di dalam bulannya dan **tidak boleh saling tindih**: dua lembar GU yang
beririsan berarti belanja yang sama diajukan penggantiannya dua kali. Nomor urut GU ditentukan server
dari tanggal mulai, bukan diterima dari klien, supaya "GU 2" tidak bisa mendahului "GU 1".
Kalau belum ada rentang dicatat, berkas tetap memuat satu lembar GU sebulan penuh — lembarnya tidak
hilang hanya karena rentangnya belum diisi.

**Temuan dari berkas asli (2026-07-26).** Selisih `TUTUP KAS` Juni = B.3 − A.4 =
4.883.802.451 − (−650.471.561) = **5.534.274.012** — angka yang **sama persis** dengan realisasi
bulan ini di lembar `GU 1-26 Juni 2026` (bandingkan ` Realisasi BP` yang 6.361.975.087). Kecocokan
sampai rupiah terakhir itu bukan kebetulan: penerimaan penggantian uang persediaan sebesar itu tampak
**belum tercatat** sebagai transaksi masuk. Persis yang diramalkan §4.7 — selisih ≠ 0 berarti ada
transaksi yang hilang, bukan rumus yang perlu ditambal. Perlu dipastikan ke bendahara.

**Keputusan #29 — pejabat SPJ disalin, bukan dirujuk.** `pk_pejabat` boleh jadi sumber isian,
tapi yang tersimpan di `blud_pejabat` adalah salinan nama/NIP/pangkat pada saat penetapan. Tidak ada
FK dan tidak ada JOIN ke `pk_pejabat` di jalur cetak: kalau tahun depan pejabatnya berganti di master
PK, SPJ tahun ini yang sudah dicetak & ditandatangani tidak boleh ikut berubah. Begitu kolom diketik
tangan, jejak `pk_pejabat_id` dilepas supaya `disalin_at` tidak mengaku salinan padahal bukan.
Catatan: `pk_pejabat` hanya memuat jabatan **struktural** — Bendahara Pengeluaran & PPK-BLUD tidak ada
di sana, jadi peran BLUD tetap didefinisikan sendiri dan bunyi jabatannya diketik.

**Keputusan #30 — tutup bulan harus berurutan dari depan.** Saldo awal sebuah bulan diturunkan dari
arus kas bulan-bulan sebelumnya (§4.6). Menutup Juni sementara Mei masih terbuka berarti
menandatangani angka yang masih bisa berubah esok hari. Karena itu bulan yang masih terbuka di
depannya ikut jadi penghalang, sejajar dengan baki "Perlu Rekening" (§4.2). Daftar penghalang
dikumpulkan di satu fungsi (`kumpulkanPenghalang`) supaya layar dan server memakai aturan yang sama
persis — UI tidak boleh punya versi aturannya sendiri.

### Fase 6 — Menyusul (tidak menghalangi)
- [ ] Menu Audit khusus BLUD.
- [ ] Impor BKU bulan-bulan lampau dari Excel (butuh tabel pemetaan kode, pola `kinerja_realisasi_map`).
- [ ] BBA menarik dari Realisasi (rencana pengguna) — sudah terbuka karena alokasi tersimpan per baris anggaran.

---

## 9. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Ada jalur simpan yang lolos tanpa `anggaran_key` | realisasi tidak punya tempat menempel — sunyi sampai tutup buku | `ensureAnggaranKey()` di data layer, bukan di route; `scripts/check-anggaran-key.mjs` dijalankan tiap kali jalur simpan disentuh |
| Cek pagu di JS, bukan di DB | lost update, pagu jebol | §5.2 wajib `FOR UPDATE`; dilarang keras `total = ${hitungJS}` |
| Urutan kunci acak | galat `1213` sesekali, sulit dilacak | §5.3 urut `anggaran_key`; diuji di `concurrency-test.js` |
| Saldo berjalan disimpan | sisip 1 transaksi = tulis ulang ratusan baris | §2.7 dihitung saat dibaca |
| Penggabungan otomatis berbasis kemiripan | rupiah hilang tanpa jejak | §5.1 sistem mengusulkan, manusia memutuskan — tanpa pengecualian |
| Transaksi ditolak karena rekening belum ada | saldo kas BKU salah | §4.2 parkir, bukan tolak |
| Sheet keluaran tidak persis | ditolak Keuangan / BPKAD | Fase 5 DoD: banding sheet demi sheet dengan berkas Juni asli |
| Kolom baru lupa di `schema-mysql.sql` | gate CI C gagal | masuk checklist tiap fase |
| Menyembunyikan tombol dianggap keamanan | bypass via `curl` | guard di **setiap** route API, bukan hanya UI (pelajaran V3-1) |
| Bulan ditutup dalam keadaan tidak seimbang | SPJ salah, baru ketahuan saat diperiksa BPKAD | §4.7 tombol tutup mati bila selisih ≠ 0; tanpa kotak penyesuaian bebas |

### Batas jaminan

Modul ini **bukan** aplikasi akuntansi berpasangan dan tidak menggantikan pemeriksaan bendahara. Ia
memindahkan pekerjaan salin-tempel jadi turunan otomatis, dan memasang pagar di tempat yang selama ini
tidak berpagar. Angka tetap tanggung jawab manusia yang menandatanganinya.

---

## 10. Temuan berkas Juni — sudah diputuskan semua

Tiga hal yang sempat menggantung, semuanya sudah dijawab. Dicatat di sini supaya jelas dasarnya, bukan
sebagai penghalang eksekusi.

| Temuan | Putusan |
|---|---|
| **`setor BPD`** — berkas Juni memuat tanggal 20-5 & 30-1 | **Per bulan.** Tanggal luar bulan itu sisa salinan yang lupa dihapus. Sistem menyaring per periode, jadi tidak bisa terulang → §3.2, keputusan #19 |
| **`TUTUP KAS`** — A = −650.471.561 vs B = 4.883.802.451 | **Keduanya wajib sama.** Bukan soal memilih rumus mana yang ditiru: selisih ≠ 0 berarti ada transaksi yang belum tercatat. Sisi A dihitung sistem, sisi B diketik, tutup bulan dikunci sampai seimbang → **§4.7**, keputusan #25 |
| **`SPI`** — 6 uraian berbeda dari BKU | **Salah ketik.** Angka & kode rekening 0 beda, jadi perbedaannya memang tidak disengaja. SPI jadi tampilan dari data yang sama → §3.2, keputusan #21 |

Tidak ada lagi yang menunggu konfirmasi. Sisa pertanyaan lapangan (mis. format nomor surat yang berlaku
2026) muncul sebagai isian di menu Pengaturan, bukan sebagai keputusan rancangan.

---

## 11. Keputusan yang sudah final

| # | Keputusan |
|---|---|
| 1 | Realisasi = **turunan**, bukan salinan. Pagu tidak pernah disimpan |
| 2 | `anggaran_key` sebagai jangkar stabil lintas-versi |
| 3 | Pilih baris anggaran, bukan ketik kode rekening |
| 4 | Satu transaksi boleh dibagi ke banyak baris anggaran |
| 5 | 3 menu baru: Buku Kas · Realisasi · Tutup Kas (grup PENATAUSAHAAN) |
| 6 | `register` jadi panel drill-down, bukan menu |
| 7 | Lebih pagu → blokir keras + "Ajukan Pergeseran" (**tanpa** isi otomatis, hanya sorot baris) |
| 8 | Pergeseran menurunkan pagu di bawah realisasi → tolak + tombol lanjut berpagar 3 lapis |
| 9 | Rekening belum ada → transaksi **diparkir**, Tutup Kas terkunci sampai beres |
| 10 | Penambahan rekening baru lewat menu **Pergeseran** |
| 11 | Penanda perubahan pagu 3 lapis, polling `blud_locks.version` (tanpa WebSocket) |
| 12 | Kunci pagu `FOR UPDATE` + urutan `anggaran_key` menaik |
| 13 | Sistem menandai kemiripan, **tidak pernah** menggabungkan sendiri |
| 14 | Nomor kuitansi diberikan server |
| 15 | Saldo awal otomatis dari bulan lalu; bulan pertama tahun anggaran manual |
| 16 | Periode terkunci saat Tutup Kas; dibuka hanya SUPER_ADMIN + audit |
| 17 | Belanja Modal tanpa menu khusus — cukup pembagian alokasi |
| 18 | **BBA tidak disambungkan** sekarang (rencana pengguna: BBA menarik dari Realisasi, nanti) |
| 19 | `setor BPD` dilebur ke Buku Kas sebagai jenis transaksi; sheet tetap dihasilkan |
| 20 | `Sheet1` tidak dibuat |
| 21 | `SPI` jadi tampilan dari data yang sama |
| 22 | Akses: SUPER_ADMIN + ADMIN dulu; pemisahan izin disiapkan di server |
| 23 | Menu Audit BLUD ditunda |
| 24 | Keluaran `.xlsx` (bukan `.xls` lama) |
| 25 | **Tutup Kas wajib seimbang**: sisi buku (dihitung) = sisi nyata (diketik). Selisih ≠ 0 → bulan tidak bisa ditutup. Tanpa kotak "penyesuaian" bebas |
| 26 | Realisasi menumpang **Tahun Anggaran**: tahun tanpa DPA tidak punya baris anggaran → Buku Kas tidak bisa dibuka untuk tahun itu |
| 27 | Kolom **Sisa** tampil di layar Realisasi & di modal input, dihitung saat dibaca — bukan kolom simpanan |
| 28 | **Layar Realisasi = laporan per bulan terpilih.** Sisa & % ikut bulan itu, seperti kolom lainnya — bukan serapan setahun. Angka "boleh belanja berapa lagi hari ini" pindah ke keterangan di bawah tabel, muncul hanya bila ada realisasi di bulan sesudahnya. Pemilih rekening di Buku Kas tetap memakai serapan setahun: di sana pertanyaannya memang berbeda |
| 29 | **Pejabat SPJ disalin, bukan dirujuk.** `pk_pejabat` = sumber isian ("Ambil dari PK"); yang tersimpan salinan nama/NIP/pangkat. Tanpa FK, tanpa JOIN saat cetak — ganti pejabat tahun depan tidak boleh mengubah SPJ yang sudah ditandatangani |
| 30 | **Tutup bulan berurutan dari depan.** Bulan sebelumnya yang masih terbuka jadi penghalang, sejajar baki "Perlu Rekening" — saldo awal bulan ini diturunkan dari bulan-bulan sebelumnya (§4.6) |
| 31 | **Rentang GU dicatat manusia** (`blud_gu_periode`), tidak diterka dari transaksi. Satu bulan boleh beberapa pengajuan; rentang tak boleh tindih; nomor urut ditentukan server dari tanggal mulai |
| 32 | **Arus kas bersih di Tutup Kas**: pemindahan bank↔kas tidak dihitung sebagai penerimaan/pengeluaran (`SUM(GREATEST(masuk − keluar, 0))` per baris). Saldo akhir identik, dua angka yang ditandatangani jadi jujur |
| 33 | **`pengantar` & `SPJ` memakai jumlah ALOKASI**, bukan arus kas keluar — di berkas asli keduanya angka yang sama persis. Transaksi terparkir & pemindahan bank tidak ikut |
| 37 | **Versi anggaran yang menyangga realisasi tidak bisa dihapus** (audit T1). Pagu selalu dari `MAX(versi_tanggal)`, jadi menghapus versi teratas memundurkan pagu setahun penuh sementara alokasinya tetap tinggal. Tidak ada `force`: pergeseran yang dipaksa turun masih meninggalkan barisnya, versi yang dihapus tidak. DPA yang masih jadi acuan Pergeseran juga ditolak |
| 38 | **`tanggal` transaksi terikat ke `(tahun_anggaran, bulan)` barisnya** (audit S1). BKU & Tutup Kas mengelompokkan dari `bulan`, lembar GU & register dari `tanggal` — selama keduanya lepas, dua lembar dari data yang sama bisa tidak cocok, dan bulan yang sudah ditutup bisa disusupi lewat bulan yang masih buka |
| 39 | **Membuka periode wajib urut dari belakang** (audit S2). Sisi lain dari keputusan #30: saldo awal tidak disimpan, jadi membuka bulan lama menggeser seluruh bulan sesudahnya. Bulan yang belum pernah ditutup tidak menghalangi |
| 40 | **Izin berbentuk daftar peran, bukan perbandingan di dalam route** (audit S5). `BLUD_HAPUS_VERSI_ROLES` & `BLUD_BUKA_PERIODE_ROLES`; akses modul (`app_access`) membuka pintu masuk, bukan wewenang merusak dokumen resmi. Setiap aksi perusak juga wajib beralasan ≥10 karakter yang masuk audit log |

> Referensi: `docs/CONCEPT-blud-tahun-anggaran.md` (sudah dieksekusi) · `docs/CONCEPT-menu-access-control.md`
> (Fase 0) · `docs/TUTORIAL-blud.md` · pola L48 CAS, L51 optimistic lock, L55 atomik, L58 ConfirmDialog.
