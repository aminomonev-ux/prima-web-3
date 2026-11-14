# Konsep — Pagu sub kegiatan Renaksi sebagai batas pagu RKO E-Anggaran

Status: **Tahap A' & B SELESAI** (2026-11-14, §9–§10). Tahap C–D menyusul. Putaran 1 (2026-11-13) mengira pagu
milik sub kegiatan dan mengusulkan "Tahap A" untuk menutup penjumlahan dobel — **itu dibatalkan**, lihat §2.

---

## 1. Keadaan sekarang (hasil cek)

**Di Renaksi**
- Pagu disimpan di `rencana_aksi.anggaran_nominal` (BIGINT), hanya di baris **sub kegiatan**. Satu sub
  kegiatan dengan dua indikator = dua baris, masing-masing dengan pagunya sendiri.
- Pagu kegiatan, program, sasaran, dan tujuan **tidak disimpan**; dijumlah dari baris sub kegiatan oleh
  `anggaranRollup` (`app/(dashboard)/rencana-aksi/_lib/types.ts`) — Cetak (layar, PDF, Excel, tabel LKJIP
  tertaut) dan Realisasi. Penjumlahannya per **baris**, lewat nama program + kegiatan.
- **Tidak ada sumber dana** dan **tidak ada pagu Perubahan** di Renaksi. Satu angka per baris.
- Data dev: pagu 2026 belum diisi sama sekali (0 dari 18 baris sub kegiatan).

**Di E-Anggaran**
- Pagu RKO per rekening: `kinerja_ssk.pagu`, per **tab sumber** (GAJI, BLUD, HARLEP, PROMKES, SARPRAS,
  OBAT, PEMELIHARAAN, PEMBANGUNAN), per **versi** (Murni / Perubahan ke-n). Tiap baris membawa nama
  program, kegiatan, sub kegiatan.
- **Temuan putaran 2:** "tab sumber" E-Anggaran BUKAN sumber dana. Sumber dana (APBD/BLUD/…) sudah ada,
  tapi di tempat lain: `kinerja_rekening.sumber_anggaran` per rekening, dipilih dari Master E-Anggaran tipe
  `sumber_anggaran` (daftar per tahun, diisi pengguna). Data dev 2026: Master berisi "APBD", 15 rekening
  GAJI semuanya "APBD".
- RKO (`kinerja_ssk`) sendiri **tidak** menyimpan sumber dana. Ia terhubung ke rekeningnya lewat kunci
  Inject `uraian_ssk + uraian` per tab sumber. Baris RKO dari Import RKO yang rekeningnya tidak ada tidak
  punya sumber dana.
- Penyamaan nama ke Renaksi sudah tersedia: `kunciNamaRenaksi` / `jalurAdaDiRenaksi`
  (`lib/kinerja/asal-renaksi.ts`). Jangan menulis pembanding nama kedua.

**Di PK** — daftar sumber dana tetap sendiri (`SUMBER_DANA` di `perjanjian-kinerja/form/_types.ts`:
APBD, BLUD, APBD & BLUD, APBN, HIBAH, LAINNYA), terpisah dari Master E-Anggaran. Tidak disentuh konsep ini.

## 2. Jawaban pemilik (2026-11-14)

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Pagu Renaksi = total semua sumber? | **Tidak.** Renaksi perlu sumber dana di tiap sub kegiatan, dan ikut naik ke atas: satu program bisa punya dua sumber (APBD dan BLUD), seperti di PK. Pemilik minta saran → §3 |
| 2 | RKO melampaui | **Ditolak, bisa diteruskan dengan alasan** (tercatat di audit, pola BLUD "pagu di bawah realisasi") |
| 3 | Versi RKO yang dihitung | **Terbaru tiap tab sumber.** Pemilik bertanya: perlukah pagu Perubahan di Renaksi? → §4 |
| 4 | Pagu Renaksi diturunkan di bawah RKO | Sama dengan no. 2 |
| 5 | Pagu milik sub kegiatan (Tahap A lama) | **Tidak.** Pagu memang milik **indikator**: sub kegiatan A Rp 5 juta dengan dua indikator diisi Rp 2,5 juta + Rp 2,5 juta |

Akibat jawaban no. 5: penjumlahan per baris di `anggaranRollup` **sudah benar**, bukan celah. Pagu sub
kegiatan = Σ pagu baris indikatornya. Tahap A lama (menjalarkan pagu ke semua baris) dibatalkan — ia akan
merusak cara pengisian yang dipakai. Isian ganda (Rp 5 juta di kedua baris) tidak bisa dibedakan mesin dari
pembagian yang sah (Rp 2,5 juta + Rp 2,5 juta juga sama-sama berangka sama), jadi tidak dijaga dengan
tebakan. Penggantinya: baris sub kegiatan di Data Entry menyebut **"Total sub kegiatan Rp 5.000.000
(2 indikator)"**, supaya pengisi melihat jumlahnya sendiri.

## 3. Saran: sumber dana di Renaksi

**a. Rincian per sumber di tiap baris indikator.** Isian pagu baris sub kegiatan menjadi daftar kecil
"sumber dana → nominal" (satu baris cukup untuk yang satu sumber). Tabel baru, misalnya
`rencana_aksi_pagu (rencana_aksi_id, sumber_dana, pagu, pagu_perubahan)`, UNIQUE
`(rencana_aksi_id, sumber_dana)`, FK CASCADE ke `rencana_aksi`. **Butuh migrasi** (putaran 1 menulis
"tanpa migrasi" — tidak berlaku lagi).

**b. Daftar sumber dana = Master "Sumber Anggaran" E-Anggaran tahun itu.** Daftarnya sudah ada, per tahun,
dan rekening RKO sudah memilih dari situ. Memakai daftar yang sama membuat pembandingnya cocok tanpa tabel
padanan; daftar kedua di Renaksi pasti berbeda ejaan ("BLUD" vs "Blud"). Pencocokan memakai aturan nama
yang sudah ada. Konsekuensi: sumber baru ditambah di Master E-Anggaran, bukan di Renaksi.

**c. Naik ke atas per sumber.** `anggaranRollup` menjumlah per sumber: program tampil "APBD Rp X · BLUD Rp
Y" dengan total di sampingnya. Kolom Anggaran Cetak (layar, PDF, Excel, tabel LKJIP) tetap satu kolom
TOTAL; rinciannya baris kecil di bawah angka — bentuk pastinya diputuskan saat eksekusi.

**d. `anggaran_nominal` tetap = total**, ditulis **hanya oleh server** = Σ rincian, di transaksi yang sama.
Alasannya: lebih dari sepuluh pembaca (Cetak, Realisasi, LKJIP, dashboard) membaca kolom itu; mengubah
semuanya sekaligus = L69. Isian klien untuk kolom itu diabaikan begitu rinciannya ada.

**e. Data lama** (pagu tanpa rincian): tampil sebagai **"tanpa sumber"** dan tetap dihitung di total. Tidak
dibagi otomatis — kecuali Master tahun itu hanya punya satu sumber (lihat §6 no. 3).

## 4. Saran: pagu Perubahan di Renaksi

**Perlu.** Tanpa itu, saat anggaran perubahan masuk, angka Murni harus ditimpa: PK Murni, LKJIP, dan
Realisasi kehilangan angka awalnya, dan RKO Murni yang sudah terkunci tiba-tiba "melampaui" pagu baru yang
lebih kecil.

Usulannya meniru Target Pendapatan Perubahan E-Anggaran (`lib/kinerja/pendapatan-perubahan.ts`), yang
sudah dipakai dan dipahami:
- kolom `pagu_perubahan` per rincian, **NULL = belum ada Perubahan**;
- pagu berlaku = Perubahan ?? Murni;
- begitu Perubahan terisi, Murni **dibekukan** (409, seperti `TARGET_MURNI_FINAL`);
- RKO versi terbaru dibandingkan dengan pagu **berlaku**; RKO Murni yang sudah terkunci tidak diperiksa
  ulang (jawaban no. 3);
- Cetak menampilkan pagu berlaku; Murni + Perubahan berdampingan hanya di tampilan yang memintanya.

Yang belum jelas: Perubahan dibuka **per baris** (siapa saja kapan saja mengisi kolom Perubahan) atau
**per tahun** (tombol "Mulai Perubahan" sekali, lalu semua baris punya kolom Perubahan). Lihat §6 no. 2.

## 5. Aturan pembanding (sesudah putaran 2)

Untuk tiap **sub kegiatan × sumber dana**, tahun yang sama:

> Σ pagu RKO (versi terbaru tiap tab sumber, tanpa baris dinol-kan, rekeningnya bersumber dana X)
> ≤ Σ pagu berlaku Renaksi sumber X (semua baris indikator sub kegiatan itu)

- Sumber dana baris RKO diambil dari **rekeningnya** (`kinerja_rekening.sumber_anggaran`, lewat kunci
  Inject). Baris RKO tanpa rekening / rekening tanpa sumber dana masuk kelompok **"sumber belum diisi di
  Rekening"**: tidak dibandingkan per sumber, tapi tetap ikut pembanding **total** sub kegiatan.
- Pagu Renaksi kosong = tanpa batas. Sub kegiatan RKO yang tidak ada di Renaksi disebut ("di luar Rencana
  Aksi"), tidak diperiksa.
- Melampaui → 409 `PAGU_RENAKSI_TERLAMPAUI` menyebut sub kegiatan, sumber, dan kelebihannya; bisa
  diteruskan dengan alasan (audit). Arah sebaliknya (Renaksi diturunkan) sama.

**Tahapan** (lanjutan putaran 1, Tahap A diganti):
- **Tahap A'** — rincian sumber + pagu Perubahan di Renaksi (migrasi, Data Entry, Impor Renaksi ikut —
  L69, `anggaranRollup` per sumber, Cetak).
- **Tahap B** — tampilan saja: endpoint baca `GET /api/kinerja/pagu-renaksi?tahun=`, pita per sub kegiatan
  di layar RKO (sumber yang dibuka dihitung dari isi layar), "Terpakai di RKO" di Data Entry.
- **Tahap C** — penegakan di server di semua jalur yang menggeser pagu RKO (Simpan termasuk Impor,
  suntingan Rekening yang menjalar — sekarang juga **ganti sumber dana rekening**, Edit Master yang memindah
  induk). Kunci: Simpan RKO membaca baris sub kegiatan Renaksi `FOR SHARE` sesudah kunci versinya; simpan
  pagu Renaksi memegang barisnya `FOR UPDATE` lalu membaca Σ RKO. Dibuktikan dengan uji balapan pola
  `test-renaksi-balapan.mts`.
- **Tahap D** — arah sebaliknya di Renaksi.

## 6. Keputusan (putaran 3, 2026-11-14)

1. **Sumber anggaran di Data Entry sub kegiatan Renaksi**, naik ke atas di Cetak, dan **bertaut ke
   E-Anggaran menu Master Rekening** (daftar "Sumber Anggaran" yang dipilih tiap rekening di menu
   Rekening). Satu daftar untuk dua modul (§3b). Arah tautannya ditegaskan di §6a.
2. **Pagu Perubahan dibuka per tahun** — satu tombol "Mulai Perubahan" (saran).
3. **Data lama tanpa sumber: dibetulkan sendiri** lewat tombol pensil tiap baris di Data Entry. Tidak ada
   tombol "tandai semua". Sampai dibetulkan, tampil "tanpa sumber" dan tetap ikut total.
4. **Pembanding** per sumber dana **dan** total, atau total saja — menunggu jawaban sesudah penjelasan
   (contohnya di §6b).

### 6a. Arah tautan sumber anggaran — DIPUTUSKAN (putaran 4)

**Renaksi = sumber besar.** Sumber anggaran diisi di Renaksi lalu dibawa ke Master Rekening E-Anggaran
lewat jalur yang sudah ada untuk nama program/kegiatan/sub ("Init/Perbarui dari Renaksi", lencana
"Renaksi", `kinerja_master.asal` = RENAKSI, `bandingRenaksi` + `PerbaruiRenaksiModal`). **Isian manual di
modul lain tetap ada**: sumber anggaran yang diketik sendiri di Master Rekening tetap sah (asal MANUAL),
sama seperti nama program manual sekarang. Jangan menambah jalur tulis kedua — tipe `sumber_anggaran`
masuk ke pembanding dan dialog yang sudah ada.

Pilihan sumber di Data Entry Renaksi: daftar sumber yang sudah dipakai Renaksi tahun itu + yang ada di
Master Rekening, dan boleh mengetik baru (yang baru inilah yang kemudian ditawarkan ke Master Rekening).

### 6c. Naik ke atas mengikuti tautan indikator (putaran 4)

Keadaan sekarang: Cetak memanggil `anggaranRollup` per baris (`CetakPanel.tsx:423`, `cetak-filter.ts:228`)
dan menjumlah lewat NAMA — kegiatan berindikator dua menampilkan total yang **sama di kedua baris
indikatornya**. Dengan pagu milik indikator, penjumlahan ikut tautan `induk_indikator_id` (aturan yang
sama dengan pohon Cetak, `anakMilikIndikator` di `lib/renaksi/rantai.ts`):

- baris anak **tertaut** → pagunya naik ke indikator induknya saja;
- anak **belum tertaut / tautan usang** dan entitas induknya hanya punya **satu** indikator → ke indikator
  itu (tidak ambigu);
- anak belum tertaut dan induknya punya **lebih dari satu** indikator → **tidak dibagi**. Pagunya tetap ikut
  total entitas, tapi disebut "Rp X belum tertaut ke indikator" — kalau ikut aturan pohon lama (milik semua
  indikator induk), uangnya terhitung dua kali.
- Total entitas (Σ semua sub kegiatan di bawahnya) tidak berubah dari sekarang; per sumber juga.

### 6d. Rekening E-Anggaran tanpa indikator (putaran 4, menunggu konfirmasi)

Usulan: **tidak menambah indikator ke menu Rekening.** Pembanding cukup di tingkat **sub kegiatan × sumber
dana**: Σ pagu indikator Renaksi sub kegiatan itu per sumber ↔ Σ pagu RKO rekening sub kegiatan itu per
sumber. Alasannya:
- satu rekening (mis. Belanja Gaji Pokok PNS) melayani semua indikator sub kegiatannya; memaksa memilih
  satu indikator per rekening = pembagian karangan;
- GAJI 2026 sudah 15 rekening, semuanya di satu sub kegiatan — menambah kolom indikator ke ratusan rekening
  adalah pekerjaan isian baru tanpa pembanding yang lebih tajam;
- "Grand total" RKO per tab adalah jumlah SEMUA sub kegiatan di tab itu. Pembanding per sub kegiatan
  otomatis juga menjaga grand total; kebalikannya tidak (dua sub kegiatan bisa saling menutupi).

Indikator di Rekening baru berguna kalau kelak dibutuhkan **realisasi anggaran per indikator** — itu
dibicarakan terpisah.

### 6b. Contoh pembanding

Sub kegiatan A di Renaksi: APBD Rp 10 jt + BLUD Rp 5 jt = Rp 15 jt. RKO A: rekening APBD Rp 12 jt +
rekening BLUD Rp 2 jt = Rp 14 jt.
- **Total saja:** Rp 14 jt ≤ Rp 15 jt → lolos. APBD yang kelebihan Rp 2 jt tidak ketahuan.
- **Per sumber + total:** APBD Rp 12 jt > Rp 10 jt → ditahan, "APBD lebih Rp 2 jt"; BLUD lolos.

## 7. Yang sengaja tidak

- Pagu BLUD di modul BLUD (DPA/Pergeseran) **tidak** dihubungkan — dokumen dan jalur pagu lain.
- Pagu Renaksi tidak diisi otomatis dari RKO. Arahnya satu: Renaksi = batas, RKO = rincian.
- PK tetap dengan daftar sumber dananya sendiri; menyamakannya dibicarakan terpisah.

## 8. Kueri cek untuk server kantor (hanya membaca)

Sub kegiatan berpagu dan jumlah baris indikatornya (untuk melihat pola pembagian yang dipakai):

```sql
SELECT tahun, program, kegiatan, sub_kegiatan, COUNT(*) AS baris, GROUP_CONCAT(anggaran_nominal) AS pagu
FROM rencana_aksi
WHERE level = 'sub-kegiatan' AND anggaran_nominal > 0
GROUP BY tahun, program, kegiatan, sub_kegiatan
ORDER BY tahun, program, kegiatan, sub_kegiatan;
```

Rekening yang sumber dananya belum diisi (akan masuk "sumber belum diisi di Rekening"):

```sql
SELECT tahun, sumber, COUNT(*) AS rekening,
       SUM(sumber_anggaran IS NULL OR TRIM(sumber_anggaran) = '') AS tanpa_sumber_dana
FROM kinerja_rekening
GROUP BY tahun, sumber
ORDER BY tahun, sumber;
```

## 9. Tahap A' — yang dikerjakan (2026-11-14)

- **Data:** `rencana_aksi_pagu` (rincian per baris indikator × sumber; `''` = tanpa sumber) +
  `renaksi_pagu_perubahan` (tahun yang berbabak Perubahan) — `migration-renaksi-pagu-sumber.sql`, WAJIB
  sebelum kodenya dipasang. Pagu lama dipindah migrasi jadi rincian "tanpa sumber".
- **Satu penulis** `tulisRincianPaguBorongan` (`lib/data/renaksi-pagu.ts`) untuk Data Entry DAN Impor; ia
  juga satu-satunya penulis `rencana_aksi.anggaran_nominal` (= Σ pagu berlaku). Selalu di bawah
  `kunciTahunRenaksi`, sama dengan mulai/batal Perubahan. Aturannya murni di `lib/renaksi/pagu.ts`
  (`alasanTolakRincian`) — form memakai fungsi yang sama.
- **Babak Perubahan per tahun** (`POST /api/rencana-aksi/pagu-perubahan`, audit `RA_PAGU_PERUBAHAN`):
  Murni per sumber dibekukan; Murni "tanpa sumber" boleh diberi sumber selama jumlah Murni tetap; batal
  hanya selama belum ada pagu Perubahan terisi.
- **Naik ke atas** (`susunPaguRenaksi`): ikut `induk_indikator_id`; anak belum tertaut di entitas
  berindikator banyak tidak dibagi dan disebut di spanduk Cetak + catatan PDF/Excel. Pilihan kolom
  "Sumber Dana" di Cetak (bawaan mati, bentuk unduhan lama & tabel LKJIP tertaut tetap).
- **Duplikasi Tahun** menyalin rincian: yang berlaku jadi Murni tahun baru.

**Perubahan perilaku** (disengaja):
1. Kolom Anggaran Cetak per baris indikator kini angka indikator itu, bukan total entitas yang
   diulang di setiap indikatornya. Sub kegiatan yatim (kegiatannya tidak ada) tidak lagi ikut total
   program — sesuai spanduk "orphan" yang sudah lama berbunyi begitu.
2. Impor: sel Anggaran kosong tidak lagi menghapus pagu; angka berkas tidak menimpa pagu yang sudah
   dirinci per sumber (disebut di hasil impor); di babak Perubahan angka berkas masuk kolom Perubahan.
3. `anggaran_nominal` kiriman tab lama diabaikan server.

Regresi: `npx tsx --env-file=.env.local scripts/test-renaksi-pagu-sumber.mts` (52; bagian C MySQL
kotak pasir 2075/2076), 14 uji mutasi tertangkap. Tiga temuan dari uji mutasi dibereskan: celah data uji (Murni digeser antar sumber dengan jumlah tetap — kini A6b), satu syarat
pembekuan Murni yang mubazir (sudah tercakup syarat jumlah) dan satu baris kode mati di
`daftarBelumTertaut`. Diverifikasi di peramban pada 2045 (dibersihkan sesudahnya): Data Entry (editor,
Mulai Perubahan, Simpan), Cetak (angka per indikator, spanduk, kolom Sumber Dana), tema terang.

## 10. Tahap B — yang dikerjakan (2026-11-14, hanya tampilan)

- **Aturan satu tempat** `lib/kinerja/pagu-renaksi.ts` (murni): `versiTerbaruPerTab` (calon versi dari semua
  baris — A9), `agregatRko` (sumber dana dari rekening lewat kunci Inject `uraian_ssk + uraian` per tab;
  rekening berkunci sama bersumber berbeda / tanpa rekening = "sumber belum diisi"), `bandingPaguRenaksi`
  (per sumber hanya bila seluruh pagu Renaksi sub itu sudah bersumber, plus total; Renaksi tanpa pagu =
  tanpa batas; sub RKO yang tidak ada di Renaksi = "di luar Rencana Aksi"), `kalimatLebih`. Tahap C
  WAJIB memakai fungsi yang sama.
- **Pagu sub kegiatan Renaksi** = Σ pagu berlaku indikatornya (`paguSubKegiatan`, `lib/renaksi/pagu.ts`).
- **Endpoint baca**: `GET /api/kinerja/pagu-renaksi` (penjaga E-Anggaran; bahan mentah supaya layar RKO
  mengganti tab yang dibuka dengan isi layarnya) dan `GET /api/rencana-aksi/pagu-rko` (penjaga Renaksi;
  hanya agregat per sub kegiatan × sumber, tanpa rincian rekening). Pemuat satu: `lib/data/pagu-renaksi-rko.ts`.
- **Layar RKO**: `PaguRenaksiPita` di atas tabel — isi layar dipakai hanya bila versi yang dibuka = versi
  terbaru dan tidak terkunci. **Data Entry Renaksi**: "Terpakai di RKO" di editor pagu, dinilai terhadap
  ISI LAYAR.
- **Sumber dana → Master Rekening (§6a)**: `sumber_anggaran` kini tingkat yang bisa berasal Renaksi
  (`bisaDariRenaksi`), dibaca lewat SATU pembaca `barisRenaksiPembanding` (`lib/data/renaksi-pagu.ts`,
  baris `level: 'sumber'`) untuk pembanding, Init, pagar tanda dari form, dan warisan tanda. Init/Perbarui
  dari Renaksi menulisnya dengan asal RENAKSI; "Jadikan manual" & "Tandai dari Renaksi" berlaku tanpa
  kode baru. PK tidak menerima entri sumber (daftar sumbernya sendiri).

Regresi: `npx tsx --env-file=.env.local scripts/test-renaksi-pagu-rko.mts` (28; bagian C MySQL kotak pasir
2075), 12 uji mutasi tertangkap. `test-kinerja-asal-renaksi` A1/B1 disesuaikan (sumber anggaran kini bisa
berasal Renaksi — perubahan yang disengaja). Diverifikasi di peramban pada 2039 (dibersihkan): pita RKO
merah "APBD lebih Rp 2.000.000" lalu berubah ikut ketikan, dialog Perbarui dari Rencana Aksi mendaftar
Sumber Anggaran APBD/BLUD dan menuliskannya bertanda Renaksi, "Terpakai di RKO" di Data Entry ikut isian.
