# CONCEPT — A1+A2: pagar hapus baris SSK & rekening yatim di Laporan/Dashboard

> Temuan A1 & A2 dari `docs/AUDIT-kinerja-2026-09-04.md`.
> Dikerjakan **bersama**: A1 adalah sebabnya, A2 akibatnya. Memperbaiki A2
> sendirian membuat angkanya benar tapi membiarkan orang menciptakan yatim baru
> satu klik; memperbaiki A1 sendirian membiarkan yatim yang sudah ada tetap
> membuat dua layar berbantah.
>
> **Nol tabel baru, nol kolom baru, nol migrasi.** Semua bahannya sudah ada.

---

## 1. Rantai sebabnya

```
deleteSskRow (tanpa pagar)  →  Simpan  →  canonical_id lenyap dari versi
                                            ↓
                        baris realisasi jadi YATIM (pagu 0, target 0)
                                            ↓
        ┌───────────────────────────────────┴────────────────────────────┐
        ↓                                                               ↓
Cetak → Rekap                                        Laporan & Dashboard
mengeluarkannya + spanduk                            MENJUMLAHKANNYA, tanpa penyebut
(sudah benar sejak T7)                               (belum diperbaiki)
```

Dua ujung ini yang dibetulkan. Yang di tengah — baris yatim itu sendiri —
**tidak** dihapus atau dipindah: uangnya nyata dan sudah keluar.

---

## 2. Keputusan pokok — Nol-kan berhenti di FORM, dan `nullify` dibuang

Ini keputusan terbesarnya, dan yang paling perlu Anda setujui.

Tab SSK adalah layar **isi-form-lalu-Simpan**: seluruh versi ditulis ulang oleh
satu tombol. Sementara `PATCH /api/kinerja/ssk/nullify` menulis **langsung ke
DB**. Dua watak itu tidak bisa hidup berdampingan di satu layar:

> Nol-kan lewat route → baris di DB jadi nol, tapi layar masih memegang angka
> lamanya. Tekan Simpan → replace-all **menimpa balik** hasil Nol-kan tadi
> dengan isi layar. Nol-kannya lenyap tanpa satu pesan pun.

Menutup itu berarti memaksa muat-ulang sesudah Nol-kan (membuang suntingan yang
belum tersimpan) — gesekan yang tidak perlu ada, karena **`is_nullified` sudah
ikut jalur Simpan**:

| Mata rantai | Sudah ada? |
|---|---|
| `SskRowSchema.is_nullified` (Zod) | ada, `z.boolean().optional()` |
| `saveSskBatch` menulisnya | ada, [kinerja.ts:515] `r.is_nullified ? 1 : 0` |
| `getSskRows` membacanya balik | ada, [kinerja.ts:355] |
| Pagar `locked_at` | ada, `saveSskBatch` melempar kalau versinya terkunci |

Jadi Nol-kan cukup **mengubah isi layar** — set `is_nullified: true`, `pagu: 0`,
`months` dikosongkan lewat `hitungTurunanRko` — dan tombol Simpan yang menulis.
Nol endpoint baru, satu jalur tulis, seluruh pagar berlaku otomatis. Pola yang
sama dengan Pulihkan, Salin Versi, Impor, dan Tutup Pergeseran (**L78/L80/L82**).

### Konsekuensinya: route `nullify` dihapus

Bukan dibiarkan menganggur. Route yang ada tapi tidak tersambung **adalah**
temuan A1 — dan kalau ia tetap ada, ia jadi jalur tulis kedua untuk hal yang
sama, bentuk yang di BLUD sudah melahirkan lubang nyata (L78: dokumen historis
ditolak lewat Simpan tapi diterima lewat Impor).

Yang menahan penghapusannya cuma satu dokumen — `docs/CONCEPT-kinerja-peran.md`
§ tabel route menyebut `ssk/nullify`. Dokumen itu **sudah DITOLAK** ("Keputusan
2026-08-04: konsep ini DITOLAK, sengaja"), jadi tidak ada rencana yang menahannya.

Ikut dibawa: `KINERJA_SSK_NULLIFIED` di `auditlog.ts` jadi tak terpakai. Jangan
sekadar dibuang — jejaknya harus pindah, bukan hilang: detail
`KINERJA_SAVE_SSK` menyebut berapa baris dinol-kan pada simpanan itu (pola
`jejakPulihkan`).

**`check-deletable` TETAP.** Ia memang akan dipanggil (§3).

### Alternatif yang ditolak

| Alternatif | Kenapa ditolak |
|---|---|
| Biarkan `nullify` sebagai route, tambahkan tombolnya | Dua jalur tulis; dan Simpan sesudahnya menimpa balik hasilnya |
| Nol-kan lewat route + paksa muat ulang | Membuang suntingan yang belum tersimpan, untuk hal yang bisa ditumpangkan ke Simpan |
| Blokir hapus buntu, wajib Nol-kan | Menghapus item salah ketik yang belum dipakai itu pekerjaan sah |

---

## 3. A1 — sisi layar

### 3.1 `deleteSskRow` bertanya lebih dulu

Jadi `async`. Alurnya:

1. Baris **belum punya `canonical_id`** (baru dari Inject Rekening / Import RKO,
   belum pernah disimpan) → hapus tanpa bertanya. Tidak ada yang bisa
   merujuk baris yang belum ada di DB.
2. Punya `canonical_id` → `GET /api/kinerja/ssk/check-deletable?tahun=&canonical_id=`.
3. `deletable: true` → hapus tanpa bertanya.
4. `deletable: false` → `confirmDialog` yang **menyebut angkanya**, dengan
   pilihan tidak-merusak sebagai bawaan.

Kalau permintaannya gagal (jaringan, 429), **hapusnya dibatalkan**, bukan
diteruskan. Meneruskan dengan asumsi "mungkin aman" adalah cara pagar ini
kehilangan gunanya di hari tersibuk.

### 3.2 Kalimat dialognya

Yang membedakan dialog berguna dari gesekan kosong adalah ia menyebut **apa yang
hilang** dan **apa gantinya**:

> **Hapus item yang sudah punya realisasi?**
>
> "Belanja Gaji Pokok PNS" dirujuk **12 baris realisasi** (realisasi keuangan
> Rp 5.443.354.000).
>
> Kalau dihapus, baris realisasi itu **tidak ikut terhapus** — tapi kehilangan
> pagu dan targetnya, sehingga persennya tidak bisa dihitung lagi dan
> nominalnya tidak ikut dijumlah di Laporan maupun Cetak.
>
> Kalau maksud Anda menonaktifkan item ini, pakai **Nol-kan** — targetnya jadi
> nol tapi realisasinya tetap punya rekening.
>
> [ Batal ]   [ Hapus saja ]

Angka baris & nominalnya dari `check-deletable`. **Route-nya perlu ikut
memulangkan nominalnya** — sekarang cuma `count`. Satu `SUM(real_keuangan)` di
kueri yang sudah ada; tanpa itu kalimatnya cuma bisa menyebut jumlah baris, dan
"12 baris" tidak seberat "Rp 5,4 miliar".

### 3.3 Tombol Nol-kan

Kolom Aksi sudah `sticky right` dan sekarang memuat satu tombol; jadi dua tombol
kecil, bukan kebab (kebab untuk dua isian menambah satu klik tanpa alasan).

Keadaan barisnya:

| Keadaan | Tampilan baris | Tombol |
|---|---|---|
| Biasa | normal | Nol-kan · Hapus |
| `is_nullified` | teks pudar + lencana **DINOL-KAN** | Aktifkan · Hapus |
| Versi terkunci | — | dua-duanya mati, tooltip menyebut sebabnya |

**Aktifkan tidak mengembalikan angkanya** — route lama pun tidak
("User harus isi pagu/months lagi manual"), dan menebak angka lama itu justru
yang tidak boleh dilakukan sebuah tombol. Dialognya wajib mengatakannya:
"Pagu & target tetap nol; isi ulang lalu Simpan."

Lencana **DINOL-KAN** bukan hiasan: tanpa itu baris berpagu nol tidak bisa
dibedakan dari baris yang belum diisi, dan orang akan mengisinya lagi.

---

## 4. A2 — sisi baca agregat

### 4.1 Satu aturan, bukan dua saringan

Aturannya sudah hidup di satu tempat sejak L88: `versiAktifKinerja()`. Yang
dibutuhkan sekarang turunannya — **himpunan `canonical_id` yang berlaku**:

```ts
// lib/data/kinerja.ts
export async function canonicalAktifKinerja(
  tahun: string, sumber?: SumberSSK,
): Promise<Map<string, Set<string>>>   // sumber → Set<canonical_id>
```

Dibangun dari `versiAktifKinerja` + satu `SELECT sumber, canonical_id` yang
disaring ke versi aktif tiap sumber dan `is_nullified = FALSE`. Dipakai
`getLaporanData` **dan** `getKinerjaKpi`. Satu fungsi, dua pemanggil — kalau
tidak, ia jadi jawaban kelima soal "baris mana yang berlaku".

### 4.2 Menyaring di JS, kueri tetap agregat

Kueri realisasi berhenti memulangkan satu `SUM`; ia mengelompokkan sampai
`canonical_id` supaya penyaringan bisa dilakukan sesudahnya:

```sql
-- KPI (semua sumber)
SELECT sumber, ssk_canonical_id, SUM(real_keuangan) AS keu
  FROM kinerja_realisasi WHERE tahun = ?
 GROUP BY sumber, ssk_canonical_id            -- ± 8 x 15 = 120 baris

-- Laporan (satu sumber, butuh tren per bulan)
SELECT bulan, ssk_canonical_id,
       SUM(real_keuangan) AS keu, SUM(real_fisik) AS fis
  FROM kinerja_realisasi WHERE tahun = ? AND sumber = ?
 GROUP BY bulan, ssk_canonical_id             -- ± 180 baris
```

Lalu di JS: yang `canonical_id`-nya ada di himpunan aktif masuk hitungan, yang
tidak ditally sebagai yatim.

**Kenapa bukan semi-join di SQL.** Untuk Laporan (satu sumber) semi-join memang
lebih ringkas. Tapi KPI melintasi 8 sumber yang versi aktifnya bisa berbeda satu
sama lain, jadi saringannya butuh daftar tuple `(sumber, versi_tipe, versi_seq)`
— dan pembantu `sql` memekarkan larik jadi `?, ?, …` **datar**, bukan tuple. Bisa
dikarang lewat komposisi `SqlFragment`, tapi hasilnya kueri yang hanya bisa
dibaca penulisnya. Dan dua bentuk berbeda untuk satu aturan adalah cara L88
lahir.

**Kenapa bukan menumpang `getRealisasiHydrated`.** Ia sudah menghitung `yatim`
per baris dengan benar, jadi menumpanginya membuat aturannya diwarisi otomatis —
itu jawaban paling taat L88. Harganya: 2 kueri × 8 sumber + hidrasi penuh setiap
kali kartu Dashboard dimuat. **Ini trade-off yang saya serahkan ke Anda**; usul
saya himpunan-`canonical_id` di atas, karena ia tetap satu aturan tapi kuerinya
tetap agregat.

### 4.3 Yatim dilaporkan, dan TIDAK dijumlahkan

`LaporanSumber` dan hasil `getKinerjaKpi` dapat medan `yatim`
(`{ jumlahItem, jumlahBaris, nominal, contoh }`) — bentuk yang sama dengan
`LaporanYatim` di `lib/kinerja/rekap.ts`, dipakai ulang bukan disalin.

Nominalnya **sengaja tidak** ditambahkan ke `total_real_keuangan`: menambahkannya
membuat persen berdiri di atas penyebut yang tidak memuatnya, dan itu justru
cacat yang sedang ditutup. Persis keputusan §9.1a Beranda BLUD.

Tampilnya:

- **Laporan** — spanduk amber di atas kartu, kalimat & warnanya menyalin spanduk
  yatim yang sudah ada di RealisasiTab (`#FAC775` / `#854F0B`, token yang sudah
  lolos gate E).
- **Dashboard** — sebaris di bawah kartu SERAPAN ANGGARAN. Warnanya token
  peringatan, **bukan** mewarisi warna kartunya: keterangan yang mengurangi
  keyakinan tidak boleh berwarna "aman".

Tren per bulan di Laporan ikut disaring — kalau tidak, kartunya bersih sementara
grafiknya masih memuat yatim, dan keduanya di satu layar.

---

## 5. Yang sengaja TIDAK dikerjakan

- **Membereskan yatim yang sudah ada.** Tidak ada: pemeriksaan 3 Sep pada data
  produksi memulangkan 0 yatim dari 180+168 baris (GAJI & BLUD 2026). Perbaikan
  ini menjaga kejadian ke depan, bukan membereskan kekacauan yang ada.
- **Memindahkan realisasi yatim ke item lain.** Itu keputusan akuntansi, bukan
  efek samping sebuah tombol.
- **A3–A7.** Menyusul, masing-masing berdiri sendiri.
- **Menyaring yatim di `belanja-auto`.** Ia menjumlah kas yang keluar untuk CRR,
  dan kas tetap keluar walau rekeningnya lenyap — sepupu keputusan
  "Terserap vs Kas Tunai" di Beranda BLUD. Kalau ikut disaring, CRR akan
  berbantah dengan buku kas.

---

## 6. Definition of Done

**A1 — layar**
- [ ] `check-deletable` ikut memulangkan `nominal` (`SUM(real_keuangan)`)
- [ ] `deleteSskRow` async: lewati baris tanpa `canonical_id`, tanya untuk sisanya,
      **batalkan** kalau permintaannya gagal
- [ ] Dialog menyebut jumlah baris + nominal + menawarkan Nol-kan; batal = bawaan
- [ ] Tombol Nol-kan / Aktifkan di kolom Aksi; lencana DINOL-KAN; dua-duanya mati
      saat versi terkunci
- [ ] Nol-kan **hanya mengubah state layar** (`is_nullified`, `pagu: 0`, months
      nol lewat `hitungTurunanRko`) — nol permintaan tulis
- [ ] Dialog Aktifkan menyatakan angkanya tidak kembali
- [ ] Route `ssk/nullify` **dihapus**; `KINERJA_SSK_NULLIFIED` dilepas dari
      `auditlog.ts`; detail `KINERJA_SAVE_SSK` menyebut jumlah baris dinol-kan

**A2 — agregat**
- [ ] `canonicalAktifKinerja()` di `lib/data/kinerja.ts`, dibangun dari
      `versiAktifKinerja`
- [ ] `getLaporanData` menyaring total **dan** tren; memulangkan `yatim`
- [ ] `getKinerjaKpi` menyaring `total_real_keuangan`; memulangkan `yatim`
- [ ] `LaporanYatim` dipakai ulang dari `lib/kinerja/rekap.ts`, tidak disalin
- [ ] Spanduk di LaporanTab + baris keterangan di DashboardTab
- [ ] Nominal yatim TIDAK masuk `total_real_keuangan`

**Gerbang**
- [ ] `npx tsc --noEmit` · ESLint bersih
- [ ] `node scripts/test-killswitch-modul.mjs` (route berkurang satu — 21)
- [ ] `npm run check:tokens` (tanpa warna karangan baru)
- [ ] Suite rekap & riwayat tetap lulus

---

## 7. Regresi yang direncanakan

Bab baru di `scripts/test-kinerja-rekap.mts` (bukan suite terpisah — pokoknya
sama dengan bab yatim yang sudah ada di situ):

- **Perilaku** — `canonicalAktifKinerja` menyaring `is_nullified` dan versi
  non-aktif; penyaring agregat mengeluarkan yatim dari total **dan** dari tren,
  lalu men-tally-nya. Diuji dengan pohon uji yang sudah ada (item A/B/C + satu
  `HILANG`), jadi angka harapannya sudah diketahui.
- **Angkanya cocok dengan Rekap** — untuk data yang sama, `total_real_keuangan`
  hasil Laporan == `hitungRekap(...).baris[0].realKeu`. Ini asersi terpenting di
  bab ini: ia yang membuktikan dua layar berhenti berbantah, dan ia gagal kalau
  salah satu sisi diperbaiki tanpa yang lain.
- **Nominal yatim tidak ikut** — total Laporan **tidak** berubah saat baris
  yatim ditambah, tapi `yatim.nominal` berubah.
- **Statis** — `deleteSskRow` menyebut `check-deletable`; Nol-kan tidak memuat
  `method: 'PUT'`/`'PATCH'` (bukti ia berhenti di form); `app/api/kinerja/ssk/nullify`
  **tidak ada lagi**; `KINERJA_SSK_NULLIFIED` sudah tidak disebut; kedua jalur
  agregat menyebut `canonicalAktifKinerja` — **dicacah**, bukan ditanya "ada?".

Tiap asersi diverifikasi lewat **uji mutasi**: rusakkan pagarnya, pastikan
tesnya gagal, kembalikan. Yang lolos diperbaiki asersinya, bukan dibiarkan —
dan jangkarkan kutipan ke awal baris, sebab `if (false)` di depan potongan
telanjang sudah enam kali meloloskan mutasi di sesi ini (**L82c**).

---

## 8. Urutan pengerjaan

1. **A2 dulu** — murni sisi server + dua spanduk, tidak menyentuh jalur tulis
   apa pun. Bisa di-commit sendiri, dan langsung membuat Laporan/Dashboard
   sepakat dengan Rekap untuk yatim yang mungkin sudah ada.
2. `check-deletable` diberi `nominal` (satu kueri).
3. Nol-kan di form + lencana + dialog Aktifkan.
4. `deleteSskRow` berpagar (butuh langkah 3 sudah ada, supaya dialognya bisa
   menawarkan Nol-kan sebagai jalan keluar yang benar-benar ada).
5. Buang route `nullify` + `KINERJA_SSK_NULLIFIED`, pindahkan jejaknya ke detail
   `KINERJA_SAVE_SSK`.
6. Verifikasi sungguhan di aplikasi: hapus item ber-realisasi → dialog menyebut
   angka yang benar; Nol-kan → Simpan → muat ulang, nolnya bertahan; Laporan,
   Dashboard, dan Cetak→Rekap memulangkan serapan yang **sama**; spanduk yatim
   muncul di ketiganya.
