# CONCEPT — Tahap 9: Riwayat Simpan E-Anggaran (Kinerja)

> Lanjutan `docs/CONCEPT-kinerja-perbaikan-perhitungan.md` §5 "Tahap 9".
> Satu-satunya tahap yang butuh **migrasi**.
> Contoh yang ditiru: `blud_riwayat_simpan` (`docs/CONCEPT-blud-riwayat-simpan.md`).

---

## 1. Yang tersisa setelah Tahap 0b

Ketiga jalur simpan modul ini berpola **hapus-lalu-tulis-ulang**: `DELETE` seluruh
`(tahun, sumber)` lalu `bulkInsert` isi yang baru. Tidak ada versi, tidak ada
salinan, tidak ada tempat lain yang memegang angka lamanya.

Tahap 0b memasang `pagarReplace` — dibaca **sebelum** `DELETE`, di dalam transaksi
yang sama — sehingga dua kecelakaan terbesar sekarang dijawab 409:

| Kecelakaan | Sekarang |
|---|---|
| Payload kosong (tabel belum selesai termuat, lalu Simpan) | 409 `PENURUNAN_DRASTIS` |
| Payload turun >50% dari yang tersimpan | 409 `PENURUNAN_DRASTIS` |

Yang **masih terbuka** adalah simpanan yang sah tapi salah isi. 180 baris masuk,
180 baris keluar — tidak ada ambang mana pun yang bisa menyalak, karena tidak ada
yang aneh dari jumlahnya. Contoh yang mungkin terjadi:

- Angka Real Keuangan Agustus diketik ke baris Juli, disimpan, baru disadari besok.
- Tombol borongan "Samakan Target" ditekan di sumber yang salah lalu disimpan.
- Impor Realisasi menimpa satu sumber dengan berkas milik sumber lain.

`kinerja_realisasi` **tidak punya riwayat apa pun**. BLUD punya dua lapis
(`blud_riwayat_simpan` + cadangan JSON ke Drive); E-Anggaran tidak punya satu pun.
Yang tercatat cuma peristiwanya di `audit_log` (`KINERJA_SAVE_REALISASI` — siapa,
jam berapa, berapa baris), bukan **isinya**.

---

## 2. Temuan baru — pagar Tahap 0b baru mengenai 3 dari 6 jalur

Ini muncul saat membaca ulang `lib/data/kinerja.ts` untuk konsep ini, dan menurut
saya harus ikut dibereskan di tahap yang sama.

Modul ini punya **enam** fungsi replace-all, bukan tiga:

| Fungsi | Tabel | `pagarReplace`? | `force` di Zod? |
|---|---|---|---|
| `saveSskBatch` | `kinerja_ssk` | ada | ada |
| `saveRealisasiBatch` | `kinerja_realisasi` | ada | ada |
| `saveRekeningBatch` | `kinerja_rekening` | ada | ada |
| `saveNomenBatch` | `kinerja_realisasi_nomen` | **tidak** | **tidak** |
| `saveCrrBatch` | `kinerja_pendapatan_crr` | **tidak** | **tidak** |
| `savePendapatanBatch` | `kinerja_pendapatan_real` | **tidak** | **tidak** |

Ketiga yang bawah masih berbentuk persis seperti cacat L87 yang Tahap 0b tutup:

```ts
await tx`DELETE FROM kinerja_pendapatan_crr WHERE tahun = ${tahun}`;
if (rows.length === 0) return;      // ← penjagaan berdiri SESUDAH DELETE
```

Zod-nya `.max(12)` / `.max(1000)` tanpa `.min()`, jadi larik kosong lolos validasi,
menghapus seluruh tahun, lalu **commit**. Dua dari tiga tabel itu berisi uang
(`kinerja_pendapatan_crr` = pendapatan & belanja 12 bulan, `kinerja_pendapatan_real`
= target & realisasi pendapatan). Ini persis **L69**: perbaikan belum selesai
sampai semua jalur tulis kena, dan yang terlewat selalu yang tidak sedang dilihat.

**Usul:** `pagarReplace` + `force` dipasang di ketiganya sebagai **Tahap 9a**,
dikerjakan lebih dulu dan bisa berdiri sendiri. Riwayat simpan menyusul untuk tiga
jalur utama.

---

## 3. Keputusan pokok — Pulihkan berhenti di FORM

Sama dengan BLUD (L78/L80/L82): tombol Pulihkan **mengisi layar**, tidak menulis
apa pun. Yang menyimpan tetap tombol Simpan yang sudah ada.

Akibatnya, dan ini seluruh alasan bentuknya begini:

- **Nol endpoint tulis baru.** Gembok optimistik, `pagarReplace`, Zod, sakelar
  maintenance, rate limit — semuanya berlaku otomatis, tanpa ditulis ulang.
- **Hak memulihkan = hak menyimpan.** Tidak ada guard baru yang bisa salah pasang.
  Peran yang cuma bisa melihat otomatis tertutup.
- **Sentinel & pagar sempat memeriksanya** sebelum apa pun tersimpan.
- Orangnya bisa membandingkan dulu di layar sebelum memutuskan.

Konsekuensi yang harus disebut jujur: memulihkan **membuang isian yang sedang di
layar**. Jadi dialognya wajib menyebut angkanya ("180 baris di layar akan diganti
168 baris dari simpanan pukul 09:15") dan pilihan yang tidak merusak jadi bawaan.

---

## 4. Tabel baru

`docs/migrations/migration-kinerja-riwayat-simpan.sql` + salinannya di
`docs/schema-mysql.sql`.

```sql
CREATE TABLE IF NOT EXISTS kinerja_riwayat_simpan (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  jenis          ENUM('SSK','REALISASI','REKENING') NOT NULL,
  tahun          VARCHAR(10)   NOT NULL,
  sumber         ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS',
                      'OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  versi_tipe     ENUM('MURNI','PERUBAHAN') NULL
                 COMMENT 'NULL = jenis ini tidak berversi (REALISASI, REKENING)',
  versi_seq      TINYINT       NULL,
  disimpan_pada  DATETIME      NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  versi_ke       INT UNSIGNED  NULL COMMENT 'Angka gembok sesudah bump. NULL = jenis tanpa gembok',
  jumlah_baris   INT UNSIGNED  NOT NULL DEFAULT 0,
  total_nilai    DECIMAL(18,2) NOT NULL DEFAULT 0,
  isi            JSON          NOT NULL COMMENT 'Payload PUT apa adanya',
  disimpan_oleh  INT               NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_krs_lingkup (jenis, tahun, sumber, versi_tipe, versi_seq, disimpan_pada),
  CONSTRAINT fk_krs_user FOREIGN KEY (disimpan_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat tiap klik Simpan SSK/Realisasi/Rekening — snapshot, tidak dirujuk siapa pun';
```

### Beda dengan `blud_riwayat_simpan`, dan sebabnya

| Kolom | BLUD | Di sini | Sebab |
|---|---|---|---|
| `tahun` | `SMALLINT` | `VARCHAR(10)` | Seluruh tabel `kinerja_*` memakai `VARCHAR(10)`. Menyeragamkannya ke SMALLINT di sini saja membuat perbandingan diam-diam melakukan konversi tipe |
| dimensi | `versi_tanggal` | `sumber` + `versi_tipe`/`versi_seq` | Realisasi tidak berversi; SSK berversi tapi bukan per tanggal |
| `versi_ke` | selalu ada | NULL untuk REKENING | `saveRekeningBatch` memang tidak punya gembok optimistik sama sekali. Mengarang angka di situ = berbohong |
| `dpa_versi_tanggal` | ada | tidak ada | Tidak ada acuan silang di modul ini |

### `versi_tipe`/`versi_seq` NULL — dan jebakannya

`NULL` di sini berarti **"pertanyaannya tidak berlaku"**, bukan "belum diisi".
Mengisinya `'MURNI', 0` untuk REALISASI akan terbaca seperti realisasi itu
tersimpan per-versi, padahal `DELETE`-nya cuma `(tahun, sumber)`.

Harganya satu operator: pemangkasan retensi **wajib** memakai `<=>` (sama-dengan
yang aman-NULL), bukan `=`. `versi_tipe = NULL` tidak pernah bernilai benar, jadi
`=` membuat riwayat REALISASI **tidak pernah dipangkas** — tumbuh terus tanpa
gejala apa pun sampai tabelnya membengkak. Ini persis jenis "sederhanakan saja"
yang dilakukan pembaca berikutnya, jadi dijaga uji regresi + uji mutasi.

Alternatif yang **ditolak**: satu kolom `lingkup` berisi kunci gembok
(`'2026:GAJI:MURNI:0'`). Rapi untuk pemangkasan, tapi kolom itu memuat ulang
`tahun` dan `sumber` — dua jawaban untuk satu pertanyaan, bentuk yang L88
peringatkan.

### `isi` = payload PUT apa adanya

Bukan hasil `SELECT`. Sebabnya sama dengan BLUD: supaya bisa dikirim balik ke form
tanpa penerjemahan. Kalau bentuknya beda, lahir pemeta arah ketiga yang harus
dipelihara sejajar dengan dua yang sudah ada.

Untuk REALISASI, payload itu membawa kolom turunan (`pagu_awal`, `target_rp`,
`akum_*`, `deviasi_*`) karena `RealRowSchema` ber-`.passthrough()`. Itu **tidak
apa-apa dan sengaja dibiarkan** — lihat §8, semuanya dihitung ulang saat dimuat.

---

## 5. Sisi tulis — satu INSERT di transaksi yang sudah ada

Berkas baru `lib/kinerja/riwayat-simpan.ts`, isinya `catatRiwayatSimpan(tx, args)`
+ dua pembaca. **Wajib** menerima `tx` (tipe `Penanya`, L69-b): dipanggil dengan
`sql` biasa ia memakai koneksi lain, dan snapshot untuk simpanan yang akhirnya
di-rollback akan tetap tertinggal.

Bukan best-effort seperti arsip Drive-nya LKJIP. Ini `INSERT` lokal; kalau gagal,
ada yang salah sungguhan dan Simpan memang layak ikut batal.

### Jebakan utama — `if (rows.length === 0) return` berdiri di depan

Ketiga fungsi punya jalan keluar dini yang posisinya **berbeda-beda**. Menaruh
`catatRiwayatSimpan` di "akhir fungsi" akan melewatkan justru kasus yang paling
perlu dicatat: simpanan kosong yang dipaksa `force`.

| Fungsi | Titik tulis yang benar | Alasan |
|---|---|---|
| `saveSskBatch` | sesudah bump gembok, di akhir | Tidak ada jalan keluar dini — `if (rows.length > 0) {…}` membungkus insert, bukan me-`return` |
| `saveRealisasiBatch` | **sesudah bump, SEBELUM** `if (rows.length === 0) return` | Bump sudah berdiri di atas return; snapshot menyusul di titik yang sama |
| `saveRekeningBatch` | **sesudah `DELETE`, SEBELUM** `if (rows.length === 0) return` | Tidak ada bump sama sekali di fungsi ini |

Ini bentuk yang sama dengan yang di BLUD sempat terlewat di dua dari empat jalur.
Dijaga uji regresi yang memeriksa **urutan** — snapshot harus muncul sebelum
`return` dini, di badan fungsi yang sama (dipotong per fungsi, bukan dicari mundur
lintas berkas — L82c).

### `versi_ke` tanpa kueri tambahan

`expectedVersion` sudah ditegaskan sama dengan angka di DB di bawah `FOR UPDATE`,
dan bump-nya `version + 1`. Jadi `versi_ke = expectedVersion + 1` — pasti benar,
tanpa membaca balik. `undefined` → `NULL`.

### `total_nilai`

SSK `Σ pagu` · REALISASI `Σ real_keuangan` · REKENING `0` (memang tidak ada uang di
tabel itu). Cuma alat bantu pengenal di daftar, tidak dipakai menghitung apa pun.

### Retensi

`RIWAYAT_RETENSI = 50`, per `(jenis, tahun, sumber, versi_tipe, versi_seq)` — bukan
per tahun. Kalau per tahun, satu sore sibuk di GAJI menyapu habis riwayat BLUD di
tahun yang sama, dan sumber yang jarang disentuh justru yang paling mungkin dicari
orang. Bentuk `DELETE`-nya menyalin BLUD (derived table `t`, karena MySQL menolak
subquery ke tabel yang sedang di-`DELETE`) + `sqlInt` untuk `LIMIT` (**L66**).

Konstantanya tinggal di berkas tanpa impor DB kalau nanti dibaca komponen
`'use client'` — pelajaran `riwayat-konstanta.ts`: satu angka yang ditarik dari
berkas ber-`mysql2` menyeret driver MySQL ke bundel peramban dan merobohkan seluruh
rute dashboard.

---

## 6. Sisi baca — satu route, sekaligus memulangkan angka gembok segar

`app/api/kinerja/riwayat-simpan/route.ts`, **GET saja**. Susunan pagarnya menyalin
route kinerja lain persis:

```
getSession → kinerjaMati(role) → hasAppAccess(isKinerjaRole) → kinerjaRateLimit
```

`kinerjaMati` bukan formalitas: gate CI G (`test-killswitch-modul.mjs`) menyusuri
folder `app/api/kinerja` dan **akan menemukan route baru ini sendiri**. Lupa
memanggilnya = CI merah, bukan lubang senyap. Tidak ada daftar yang perlu disunting.

- `?jenis=&tahun=&sumber=[&versi_tipe=&versi_seq=]` → daftar snapshot, **tanpa
  `isi`** (membuka daftar tidak boleh menyeret puluhan MB).
- `?id=N` → satu snapshot **beserta `isi`**, plus `version` hasil
  `getKinerjaVersion(entity, key)` yang dibaca **saat itu juga**.

Bagian `version` itu perbaikan atas BLUD, bukan sekadar tiruan. Di BLUD, klien
harus menembak endpoint kedua untuk mengambil angka gembok segar (**L77**: memakai
`versi_ke` milik snapshot akan membuat Simpan ditolak "diubah orang lain"), dan
endpoint kedua itu bisa kena rate limit sehingga pemulihannya harus dibatalkan —
satu paragraf komentar hanya untuk menjelaskan kenapa. Di sini angkanya ikut di
balasan yang sama: satu perjalanan, dan **mustahil** memakai angka basi.

Zod untuk `isi` saat dibaca balik: **tidak ada**, sengaja. Isinya ditulis oleh jalur
simpan kita sendiri, dan jalur simpan itu memvalidasinya lagi saat masuk. Beda
dengan berkas unggahan (`MuatBerkasButton` di BLUD) yang memang dari luar.

---

## 7. Sisi layar — satu modal, tiga pemanggil

`components/kinerja/RiwayatSimpanModal.tsx`, menerima `jenis` + lingkupnya. Satu
komponen, bukan tiga — tiga salinan daftar yang sama pasti berbeda bunyi begitu
salah satunya disunting (alasan yang sama kenapa `konfirmasiPenurunan` satu fungsi
untuk tiga layar).

Tombolnya di bilah alat tiap tab, sebelah Simpan. Tiap baris daftar: jam WIB ·
jumlah baris · total nilai · siapa · "simpan ke-N" bila ada.

**Fungsi `pulihkan` tinggal di `kinerja-client.tsx`, bukan di tab.** Di situlah
`realVersion`/`sskVersion` dan pemuat datanya hidup; menaruhnya di tab berarti
mengoper dua penyetel state ke bawah hanya untuk itu.

---

## 8. Jebakan saat memuat snapshot

**(a) Kolom turunan snapshot itu basi — dan memang harus diabaikan.** `isi`
REALISASI membawa `pagu_awal`/`target_rp`/`akum_*` yang dihitung terhadap SSK
**versi saat itu**. Kalau sejak itu SSK Perubahan dibuat, angka-angka itu sudah
tidak berlaku. Jadi memuat = `setRealisasiRows(recalcAllRealisasi(isi))`, persis
seperti `fetchRealisasi` memperlakukan balasan server.

Yang **dipertahankan** dari snapshot cuma yang benar-benar diketik manusia:
`real_fisik`, `real_keuangan`, dan jangkarnya `ssk_canonical_id`. Sisanya lahir
ulang dari SSK versi **sekarang**. Ini bukan kompromi — ini justru **L88**: satu
jawaban untuk "versi mana yang dipakai", dan jawabannya selalu yang aktif.

**(b) Baris yatim bisa bertambah.** Snapshot lama bisa menunjuk `canonical_id` yang
sudah lenyap dari versi SSK sekarang. Spanduk yatim yang sudah ada di tab Realisasi
akan menampilkannya sendiri sesudah recalc — tidak perlu mekanisme baru, tapi
**perlu diuji** bahwa ia memang menyala.

**(c) Angka gembok.** Dari balasan `?id=` (§6), bukan dari `versi_ke`.

**(d) Menyimpan hasil pulihan bisa kena `pagarReplace` sendiri.** Memulihkan
snapshot 90 baris ke atas 180 baris tersimpan = turun 50% → 409. Itu **benar** dan
tidak boleh dilonggarkan; `konfirmasiPenurunan` sudah menerjemahkannya jadi
pertanyaan, dan orangnya memang sedang sengaja.

---

## 9. Kalimat lama yang jadi bohong

`lib/kinerja/konfirmasi-simpan.ts` sekarang berbunyi:

> "…dan **tidak ada riwayat untuk memulihkannya**."

Begitu tahap ini terpasang, kalimat itu salah. Wajib diganti di commit yang sama —
kalimat yang menakut-nakuti melebihi kenyataan melatih orang mengabaikan dialognya.

---

## 10. Ukuran

**Diukur** pada data GAJI 2026 di lingkungan dev (2026-09-04), bukan diperkirakan:

| Jenis | Baris | `isi` sungguhan | × 50 retensi | Perkiraan awal |
|---|---|---|---|---|
| REALISASI GAJI 2026 | 180 (15 item × 12 bulan) | **128,4 KB** | 6,27 MB | ~70 KB (meleset 1,8×) |
| SSK GAJI 2026 | 15 | **11,8 KB** | 0,57 MB | ~8 KB |
| REKENING GAJI 2026 | 15 | **4,5 KB** | 0,22 MB | ~5 KB |

Realisasi hampir dua kali perkiraan, sebabnya `RealRowSchema` ber-`.passthrough()`:
payloadnya membawa 15 kolom turunan yang tidak disimpan ke tabelnya. Dibiarkan
sengaja (§4), dan harganya terukur.

Kasus terburuk 8 sumber × 50 foto realisasi penuh ≈ **50 MB per tahun**. Masih
wajar untuk InnoDB, tapi ini batas atas yang perlu diingat: kalau nanti item SSK
bertambah dari 15 ke ratusan, `RIWAYAT_RETENSI_KINERJA` adalah knob, bukan
prinsip.

---

## 11. Yang sengaja TIDAK dikerjakan

- **Cadangan JSON ke Google Drive** (lapis kedua BLUD). Tahap tersendiri kalau
  memang dibutuhkan; menempelkannya sekarang menggandakan permukaan.
- **Riwayat untuk Nomen/CRR/Pendapatan.** Ketiganya kecil dan tidak bertumbuh; yang
  mereka butuhkan pagar (§2), bukan snapshot.
- **Membandingkan dua snapshot** (diff). Berguna, tapi fitur tersendiri.
- **Snapshot ikut terhapus saat sumber dibersihkan.** Sengaja tidak — justru itu
  keadaan yang paling perlu bisa ditarik balik.
- **Snapshot dirujuk siapa pun.** Ia catatan, bukan entitas. Begitu ada yang
  menunjuknya, seluruh alasan bentuknya begini gugur.

---

## 12. Definition of Done

**Tahap 9a — pagar menyeluruh (berdiri sendiri, tanpa migrasi)**
- [ ] `pagarReplace` di `saveNomenBatch`, `saveCrrBatch`, `savePendapatanBatch` —
      dibaca **sebelum** `DELETE`, di transaksi yang sama
- [ ] `force` di `NomenBodySchema` + kedua cabang `PendapatanBodySchema`
- [ ] Ketiga route menerjemahkan `KinerjaReplaceSafetyError` → 409 `PENURUNAN_DRASTIS`
- [ ] Layar pemanggilnya memakai `konfirmasiPenurunan` yang sudah ada

**Tahap 9b — riwayat simpan**
- [ ] Migrasi + salinan di `docs/schema-mysql.sql`
- [ ] `lib/kinerja/riwayat-simpan.ts` (`catatRiwayatSimpan` + 2 pembaca)
- [ ] Dipanggil di **3** fungsi, di titik yang benar (§5) — termasuk cabang kosong+force
- [ ] Retensi memakai `<=>`
- [ ] Route GET + `kinerjaMati` + `hasAppAccess` + rate limit; `?id=` memulangkan `version`
- [ ] Audit `KINERJA_RIWAYAT_PULIHKAN` saat **isi** diambil, bukan saat daftar dibuka
- [ ] `RiwayatSimpanModal` + tombol di 3 tab; `pulihkan` di `kinerja-client.tsx`
- [ ] Dialog konfirmasi menyebut angka baris kedua sisi; batal = bawaan
- [ ] Kalimat `konfirmasi-simpan.ts` diperbaiki (§9)
- [ ] `asal_pulihkan` ikut body PUT → detail `KINERJA_SAVE_*` (pola `asal_pulihkan`
      BLUD), dan **dilepas** di setiap jalur lain yang mengganti isi tabel

**Gerbang**
- [ ] `npx tsc --noEmit` bersih · ESLint bersih
- [ ] `node scripts/test-killswitch-modul.mjs` (route baru ikut terpindai sendiri)
- [ ] `npx tsx scripts/test-kinerja-rekap.mts` tetap 137 pemeriksaan lulus
- [ ] Suite baru `scripts/test-kinerja-riwayat-simpan.mts`

---

## 13. Uji regresi yang direncanakan

`scripts/test-kinerja-riwayat-simpan.mts` — statis + perilaku, tanpa DB:

- **A. Urutan** — di ketiga fungsi, `catatRiwayatSimpan` muncul **sesudah**
  `DELETE`/bump dan **sebelum** `return` dini. Jendelanya dipotong **per badan
  fungsi** dan komentarnya dibuang dulu (L82c — kutipan sepotong yang juga muncul di
  tetangganya lulus karena alasan yang salah; prosa yang menjelaskan bug lama bisa
  menyalakan tesnya sendiri).
- **B. `<=>`** — retensi tidak boleh memakai `=` pada kolom versi.
- **C. `tx`, bukan `sql`** — `catatRiwayatSimpan` menerima `Penanya`.
- **D. Pagar §2** — `pagarReplace` mendahului `DELETE` di keenam fungsi, dan keenam
  skema Zod punya `force`. Kemunculannya **dihitung**, bukan ditanya "ada?".
- **E. Perilaku** — `hitungTotalNilai` per jenis, diuji sungguhan.
- **F. Kalimat** — "tidak ada riwayat" sudah tidak ada di `konfirmasi-simpan.ts`.
- **G. `asal_pulihkan`** — dibandingkan dengan daftar jalur pengganti isi, seperti
  suite cadangan BLUD membandingkan `asalSalinRef` (cara temuan Pulihkan-terlewat di
  BLUD ditemukan).

Tiap asersi diverifikasi lewat **uji mutasi**: rusakkan pagarnya, pastikan tesnya
gagal, kembalikan. Yang lolos diperbaiki asersinya, bukan dibiarkan.

---

## 14. Urutan pengerjaan

1. **9a** — pagar tiga jalur yang terlewat. Berdiri sendiri, nol migrasi, nol UI
   baru. Bisa langsung di-commit.
2. Migrasi + `riwayat-simpan.ts` + 3 titik tulis + suite A–E.
3. Route GET + audit.
4. Modal + 3 tombol + `pulihkan` + dialog + kalimat §9.
5. Verifikasi sungguhan di aplikasi: simpan 3× berturut-turut di GAJI, pulihkan yang
   tengah, pastikan angka gembok benar (tidak ada 409 palsu), retensi memangkas pada
   snapshot ke-51, dan riwayat sumber lain **tidak** ikut terpangkas.
