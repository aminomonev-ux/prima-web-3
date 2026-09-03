# CONCEPT — Pembenahan perhitungan E-Anggaran (Kinerja)

> Status: **Tahap 0–6, 6b, dan 8 SELESAI** (2026-09-03). Tahap 7 & 9 sengaja belum —
> keduanya opsional, dan Tahap 9 satu-satunya yang butuh migrasi.
> Yang dikerjakan: nol tabel baru, nol kolom baru, **nol migrasi**, nol endpoint
> baru. Semua yang dibutuhkan sudah ada di DB — yang salah cuma jalur bacanya.
>
> **Catatan pelaksanaan.** Tahap 0 dirancang "kunci perilaku lama dulu, baru
> ubah". Karena seluruh tahap dikerjakan dalam satu putaran, penguncian itu tidak
> ada gunanya — tesnya langsung mengunci perilaku BARU, ditambah asersi eksplisit
> bahwa cacat lamanya memang sudah tidak ada (D3, C4, I3). Pemisahan rumus dari
> JSX tetap dikerjakan lebih dulu, dan itu bagian Tahap 0 yang sebenarnya penting.
>
> Aturan tombol Samakan akhirnya ikut dipisah ke `lib/kinerja/samakan-target.ts` —
> bukan rencana awal, tapi uji mutasi menunjukkan bahwa selama ia hidup di dalam
> komponen, tesnya cuma bisa **mencocokkan teks sumber**, dan dua mutasi lolos
> karena kutipannya muncul juga di baris lain.
>
> Lahir dari satu pertanyaan pemakai: *"deviasi keuangan di sistem saya −2,41
> sedangkan di pusat −2,40, mungkin cara pembulatan?"* — lalu dari perintah
> lanjutan **"cek ulang seluruh modul e anggaran, tanpa melihat pusat"**. Dan
> jawabannya: pembulatan itu temuan **nomor tiga**. Dua yang lebih besar tidak ada
> hubungannya dengan pembulatan sama sekali, dan satu lagi — **T0** — malah baru
> ketahuan waktu pemakai bertanya *"data yang sudah tersimpan aman ya?"*.
>
> **Revisi 2026-09-03**: ditambah **T0** (Simpan bisa menghapus setahun tanpa
> sengaja), **Tahap 0b** yang menutupnya, dan **§6** — fitur "Samakan dengan
> Target" di kolom Real Fisik.

---

## 1. Kenapa dokumen ini ada

Angka −2,41 itu benar menurut kodenya sendiri. Yang jadi masalah bukan angkanya,
tapi apa yang ketahuan waktu ditelusuri: **satu modul memberi lebih dari satu
jawaban untuk pertanyaan yang sama**, dan tidak ada satu pun layar yang
memberitahu bahwa jawabannya bisa berbeda.

Tiga pertanyaan, dan berapa jawaban yang hidup di repo hari ini:

| Pertanyaan | Jumlah jawaban | Di mana |
|---|---|---|
| "Pagu tahun ini berapa?" | **3** | Tab Realisasi · Cetak→Rekap · Laporan+KPI |
| "Target s/d bulan ini berapa rupiah?" | **2** | Laporan (rupiah) · Realisasi+Rekap (persen) |
| "Deviasi baris ini berapa?" | **2** | Tab Realisasi (mentah) · Cetak→Rekap (bulat−bulat) |

Selama data masih sederhana, ketiganya kebetulan menjawab sama. Yang membuatnya
berbahaya justru itu: cacatnya baru muncul saat ada versi PERUBAHAN, saat ada item
yang di-*rename*, saat ada realisasi yatim — persis keadaan yang wajar terjadi di
pertengahan tahun anggaran, dan persis saat cetakannya dipakai.

---

## 2. Sebelas temuan

### T0 🔴 Simpan bisa menghapus setahun tanpa sengaja, dan tidak ada jalan pulang

Ditemukan **paling akhir**, dikerjakan **paling awal**. Bukan soal perhitungan —
soal data hilang.

`saveRealisasiBatch` ([kinerja.ts:634](../lib/data/kinerja.ts:634)) urutannya:

```ts
await tx`DELETE FROM kinerja_realisasi WHERE tahun = ${tahun} AND sumber = ${sumber}`;
if (expectedVersion !== undefined) { /* bump versi */ }
if (rows.length === 0) return;          // ← penjagaannya SESUDAH DELETE
```

Penjagaan baris kosong berdiri **di belakang** DELETE, jadi payload kosong tetap
menghapus semuanya lalu `withTransaction` commit seperti biasa. Zod-nya juga tidak
menahan: [`rows: z.array(RealRowSchema).max(10000)`](../lib/data/kinerja-schemas.ts:216)
— ada batas atas, **tidak ada batas bawah**. Pola yang sama di `saveSskBatch` dan
Rekening.

Yang membuatnya tidak bisa dipulihkan: **`kinerja_realisasi` tidak punya riwayat
sama sekali**. BLUD punya dua pengaman untuk kasus yang persis sama — ambang
keselamatan `SAFE_DROP_THRESHOLD = 0.5` ([data.ts:33](../lib/blud/data.ts:33)) yang
menyalak kalau baris turun >50%, dan `blud_riwayat_simpan` yang menyimpan 50 foto
per klik Simpan. E-Anggaran tidak punya dua-duanya. SSK masih tertolong versi
MURNI/PERUBAHAN; realisasi tidak tertolong apa pun.

### T1 🔴 Satu modul, tiga jawaban soal "versi SSK mana"

| Layar | Versi yang dipakai | Kode |
|---|---|---|
| Tab Realisasi | yang dipilih pengguna | [kinerja-client.tsx:279](../app/(dashboard)/kinerja/kinerja-client.tsx:279) |
| Cetak → Rekap | **selalu MURNI seq 0** | [kinerja-client.tsx:299](../app/(dashboard)/kinerja/kinerja-client.tsx:299) |
| Laporan + Dashboard KPI | versi aktif (`pickVersiAktif`) | [kinerja.ts:817](../lib/data/kinerja.ts:817) |

Rekap memanggil `/api/kinerja/realisasi` **tanpa** `versi_tipe`, sehingga jatuh ke
jalur lama yang di [kinerja.ts:508](../lib/data/kinerja.ts:508) memaksa `'MURNI', 0`.
Bukan pilihan sadar — itu jalur kompatibilitas yang UI-nya belum ikut pindah.

**Yang membuat ini pasti bug, bukan desain:** baris realisasi **tidak berversi**.
`saveRealisasiBatch` menghapus seluruh `(tahun, sumber)` lalu menulis ulang — hanya
ada SATU set baris realisasi. Kolom `ssk_versi_tipe`/`ssk_versi_seq` di baris itu
cuma label; yang benar-benar menentukan angka adalah versi SSK yang dipakai saat
*hydrate*. Jadi tiga layar itu mengukur realisasi **yang sama persis** terhadap
tiga pagu berbeda.

### T2 🟠 Rekap mengarang ulang rupiah dari persen

[CetakTab.tsx:267](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:267) menghitung
`round(persen/100 × pagu)`. Buktinya bisa dihitung tangan:
`142.593.279.000 × 55,07% = 78.526.118.745,3` → persis angka yang tampil.

Yang bikin ini konyol: jumlah rupiah aslinya **sudah dihitung** di
[baris 235](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:235) (`akumTgtRp`) dan
[baris 260](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:260) (`gtTgtRp`), dipakai
sekali untuk menurunkan persen, lalu **dibuang** — `akumTgtRp` tidak pernah dibaca
satu kali pun. Kolom rupiah yang dipajang bukan penjumlahan apa pun.

### T3 🟠 Rekap membulatkan dua kali sebelum mengurangkan

[CetakTab.tsx:271-272](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:271):
`devK = round((apk − akumTgt) × 100)/100`, padahal `apk` dan `akumTgt` **sudah**
dibulatkan 2 desimal. Modulnya sendiri melarang ini di **dua** tempat —
[kinerja-calc.ts:130](../lib/data/kinerja-calc.ts:130) dan
[_utils.ts:110](../app/(dashboard)/kinerja/_utils.ts:110) sama-sama menulis
*"dihitung dari akum mentah supaya tidak drift ±0,01"*.

Akibatnya tab Realisasi dan tab Cetak bisa menampilkan deviasi berbeda 0,01 untuk
baris yang sama. Inilah separuh dari −2,41 vs −2,40 itu.

### T4 🟠 Init memeriksa duplikat pakai NAMA, recalc mengelompokkan pakai canonical_id

[RealisasiTab.tsx:140](../app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx:140):

```ts
const exists = realisasiRows.some(r =>
  r.bulan === b && r.keterangan === s.uraian && r.uraian_ssk === s.uraian_ssk);
```

Sementara `recalcAllRealisasi` mengelompokkan dengan `cid:${ssk_canonical_id}`.

Skenarionya nyata: uraian sebuah item diperbaiki di SSK (salah ketik, atau
nomenklatur berubah) → klik Init lagi → 12 baris **baru** masuk, 12 baris lama
tetap tinggal. Karena `canonical_id`-nya sama, recalc menggabung keduanya jadi satu
grup berisi 24 baris → akumulasi dobel, dan di rekap pagunya terhitung dua kali.
Tidak ada galat, tidak ada peringatan; gejalanya cuma "kok angkanya naik".

### T5 🟠 Target hidup sebagai PERSEN, padahal rupiahnya ada

[gabung-rko.ts:54](../lib/kinerja/gabung-rko.ts:54) menyimpan
`months_pct[m] = round(rp/pagu × 10000)/100` — tiap bulan kehilangan sampai
**0,005% dari pagu barisnya**. Lalu [kinerja-calc.ts:122](../lib/data/kinerja-calc.ts:122)
menjumlah persen-persen itu (`akumTargetPct += row.target_fisik`), sehingga
kesalahannya menumpuk sebanyak bulan × item.

Rupiahnya **ada** — `kinerja_ssk.months` (JSON) dan `kinerja_ssk.total`. Buktinya
Laporan sudah memakainya: `SUM(total)` di [kinerja.ts:835](../lib/data/kinerja.ts:835),
ditampilkan sebagai rupiah di
[LaporanTab.tsx:156](../app/(dashboard)/kinerja/_tabs/LaporanTab.tsx:156). Tapi jalur
realisasi cuma mengambil `pagu, months_pct` ([kinerja.ts:572](../lib/data/kinerja.ts:572)).

Jadi **target tahunan** diukur dalam rupiah sementara **target bulanan** diukur
dalam persen — dua basis untuk besaran yang sama, di modul yang sama.

### T6 🟡 Realisasi yatim menaikkan persen tanpa tanda apa pun

Baris realisasi yang `canonical_id`-nya tidak ketemu di SSK versi aktif dapat
`pagu = 0` dan `target = 0` ([kinerja-calc.ts:79](../lib/data/kinerja-calc.ts:79)) —
tapi `real_keuangan`-nya **tetap ikut dijumlah** di rekap (`gtAkumK`). Pembilang
naik, penyebut tidak. Ini persis kasus "yatim" yang di BLUD sudah punya baris amber
sendiri (§9.1a konsep serapan); di sini tidak ada tanda apa pun.

Yatim itu bukan kelainan langka — ia lahir setiap kali sebuah item dihapus dari SSK
sementara realisasinya sudah terlanjur dicatat.

### T7 🟡 Rekap hanya melihat baris di bulan terpilih

[CetakTab.tsx:201](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:201):
`rowsBulanMax = filter(r => r.bulan === bulanTerpilih)`, lalu `gtPagu` dijumlah
**dari situ saja**. Item yang tidak punya baris di bulan itu hilang seluruhnya —
pagunya keluar dari penyebut, akumulasinya keluar dari pembilang.

Hari ini tertutup karena Init membuat 12 bulan × semua item. Tapi tidak ada yang
menjaganya, dan T4 (baris dobel) justru bisa membuka lubang ini dari arah
sebaliknya.

### T8 🟢 `bulan_terakhir` selalu Desember

`COALESCE(MAX(bulan), 0)` ([kinerja.ts:846](../lib/data/kinerja.ts:846)) — dan Init
sudah membuat baris Agustus–Desember berisi nol, jadi jawabannya 12 sepanjang
tahun. [LaporanTab.tsx:159](../app/(dashboard)/kinerja/_tabs/LaporanTab.tsx:159)
menulis "Bulan ke-12 (Desember)" di bulan Juli. Angkanya tidak salah (bulan-bulan
itu memang nol), **labelnya** yang bohong.

### T9 🟢 PDF Realisasi mencetak "Tgt Fisik" tanpa tanda %

[_exports.ts:111](../app/(dashboard)/kinerja/_exports.ts:111) memakai `fmtNum` untuk
kolom yang isinya persen, sementara kolom akumulasinya tepat di sebelahnya memakai
`.toFixed(2)+'%'`. "8,33" dan "58,33%" berdiri bersebelahan dengan satuan berbeda.

### T10 🟢 Pemilih versi menawarkan versi yang sudah dibatalkan

`versi-list` tidak menyaring `is_nullified`
([versi-list/route.ts:35](../app/api/kinerja/ssk/versi-list/route.ts:35)), sementara
semua yang membaca angkanya menyaring
([kinerja.ts:576](../lib/data/kinerja.ts:576), :836, :920). Jadi sebuah versi bisa
dipilih di dropdown lalu memulangkan tabel kosong.

---

## 3. Yang SUDAH benar — jangan disentuh

- `recalcAllRealisasi` (klien) dan `recalcAllRealisasiServer` (server) **identik**
  rumusnya. Itu yang membuat angka tidak bergeser sebelum vs sesudah Simpan. Setiap
  perubahan rumus **WAJIB** kena dua-duanya, dalam commit yang sama.
- `agg()` di rekap menjumlahkan persen **berbobot pagu**, bukan rata-rata polos
  ([CetakTab.tsx:235](../app/(dashboard)/kinerja/_tabs/CetakTab.tsx:235)) — benar, dan
  justru sering salah di tempat lain.
- Konvensi deviasi `realisasi − target` (positif = melampaui) seragam di seluruh
  modul, dan sudah pernah diaudit (#5/#6).
- `withTransaction` + optimistic lock + `bulkInsert` di jalur tulis sudah sesuai
  pola. T0 **bukan** membongkar itu — cuma memindahkan satu `if` dan menambah satu
  ambang.
- Kolom turunan sudah **dibuang** dari `kinerja_realisasi` (migration-031). Itu
  keputusan yang benar dan tidak boleh dibatalkan (lihat §8).

---

## 4. Prinsip yang dipegang seluruh pembenahan

1. **Satu pertanyaan, satu fungsi.** Setiap kali dua layar perlu tahu hal yang
   sama, jawabannya keluar dari satu fungsi bersama — bukan dua salinan rumus. Dua
   salinan itu yang melahirkan T1, T3, dan T5.
2. **Angka yang dipajang harus bisa ditelusuri.** Rekap dan Laporan menuliskan
   **versi acuannya** di kop, persis seperti toolbar Realisasi BLUD menulis "Pagu
   dari Pergeseran 31 Agu 2026".
3. **Bulatkan sekali, di ujung.** Semua turunan dihitung dari nilai mentah;
   pembulatan hanya untuk ditampilkan.
4. **Simpan yang diketik, hitung yang diturunkan.** Tidak ada kolom turunan yang
   kembali ke DB.
5. **Pagar di sumber, bukan di layar** (L82). Memperbaiki rekap tanpa memperbaiki
   `getLaporanSemua` hanya memindahkan pertengkaran ke layar sebelah.
6. **Yang tidak bisa dijawab, dilaporkan — bukan didiamkan.** Yatim dan baris dobel
   tampil sebagai keterangan, tidak dijumlahkan diam-diam dan tidak pula dibuang
   diam-diam.
7. **Berhenti di form** (L78/L80/L82). Fitur baru mengisi layar; yang menulis tetap
   tombol Simpan yang sudah ada. Nol endpoint tulis baru = seluruh pagar lama
   berlaku otomatis, dan salah pencet bisa dibatalkan dengan tidak menyimpan.

---

## 5. Tahapan

Diurut supaya tiap tahap bisa berhenti di situ dan sistemnya tetap konsisten.
Kolom "Angka bergeser?" itu yang paling penting — pemakai harus diberitahu
**sebelum** tahap yang menggesernya dipasang.

| Tahap | Isi | Risiko | Angka bergeser? |
|---|---|---|---|
| 0 | Jaring pengaman: uji regresi mengunci perilaku sekarang | — | tidak |
| **0b** | **Simpan tidak bisa lagi menghapus tanpa sengaja (T0)** | rendah | tidak |
| 1 | Satu jawaban soal versi (T1, T10) | rendah | **ya, kalau ada PERUBAHAN** |
| 2 | Rekap berhenti mengarang rupiah & membulatkan dua kali (T2, T3) | rendah | ya, ±0,01 dan kolom Rp |
| 3 | Rekap dihitung dari akumulasi, bukan dari baris satu bulan (T7) | sedang | hanya kalau baris tak lengkap |
| 4 | Kebersihan data: dobel & yatim (T4, T6) | sedang | ya, kalau ada dobel/yatim |
| 5 | Target hidup sebagai rupiah (T5) | **tinggi** | **ya, semua kolom target** |
| 6 | Label & satuan (T8, T9) | rendah | tidak |
| 7 | *Opsional* — kolom tambahan di rekap | rendah | tidak |
| **6b** | **Unduh Excel & PDF di view Rekap** | rendah | tidak |
| **8** | **Fitur "Samakan dengan Target" (§6)** | rendah | tidak, sampai diklik |
| 9 | *Opsional* — riwayat simpan (**butuh migrasi**) | sedang | tidak |

**Tahap 8 tidak bergantung pada tahap mana pun** dan boleh didahulukan kalau
memang dibutuhkan cepat — alasannya di §6.

### Tahap 0 — jaring pengaman lebih dulu

`scripts/test-kinerja-rekap.mts` (baru). **Ditulis sebelum satu baris rumus pun
disentuh**, dan tugasnya bukan membuktikan yang sekarang benar — tugasnya membuat
setiap pergeseran angka di tahap berikutnya **terlihat oleh kita**, bukan ditemukan
pemakai.

Isinya pohon uji buatan (bukan berkas contoh, supaya jalan di mesin mana pun):
3 sumber × 4 item × 12 bulan, dengan satu item sengaja dibuat yatim, satu item
sengaja punya baris dobel, dan satu item sengaja bolong di bulan tertentu.

Prasyaratnya: fungsi hitung rekap harus **bisa dipanggil** — hari ini ia terkubur di
dalam JSX `CetakTab.tsx`. Jadi langkah pertama Tahap 0 adalah memindahkan
perhitungannya ke `lib/kinerja/rekap.ts` **tanpa mengubah satu rumus pun** (pola
`hitungPratinjau` / `hitungRingkas` di BLUD: yang dihitung dipisah dari yang
digambar, supaya bisa diuji sungguhan).

### Tahap 0b — Simpan tidak bisa lagi menghapus tanpa sengaja

Empat perubahan kecil, semuanya di jalur tulis yang sudah ada. Nol migrasi.

1. **Penjagaan baris kosong pindah ke depan DELETE.** Satu `if` digeser ke atas —
   itu saja yang memisahkan "tidak jadi apa-apa" dari "setahun hilang".
2. **Ambang keselamatan meniru BLUD.** `SAFE_DROP_THRESHOLD = 0.5`: kalau baris
   masuk < 50% baris yang ada, tolak dengan pesan yang **menyebut angkanya** ("hanya
   12 baris baru vs 558 yang ada"), kecuali `force: true`. Konstanta, nama kelas
   galat, dan bentuk pesannya menyalin [data.ts:33-42](../lib/blud/data.ts:33) —
   bukan mekanisme baru, cuma dipakai di modul yang belum kebagian.
3. **Zod menerima `force`.** `force: z.boolean().optional()` di `RealisasiBodySchema`,
   `SskBodySchema`, `RekeningBodySchema`; larik kosong hanya lolos bila `force`.
4. **Di layar, penolakan itu jadi pertanyaan, bukan jalan buntu.**
   `confirmDialog({ variant: 'danger' })` yang menyebut "558 → 12"; kalau dijawab ya,
   permintaan diulang dengan `force: true`.

**Kenapa bukan sekadar `.min(1)`:** mengosongkan satu sumber dengan sengaja itu
pekerjaan yang sah (salah pilih sumber, lalu mau dibersihkan). Yang salah bukan
"boleh kosong", tapi "kosong **tanpa ada yang menyatakan sengaja**". `force` sudah
dipakai BLUD di empat tempat dengan alasan yang sama persis.

**L69 — semua jalur, bukan satu.** Ada **tiga** fungsi dengan pola DELETE-lalu-tulis
yang sama: `saveRealisasiBatch`, `saveSskBatch`, dan Rekening. Memperbaiki satu lalu
berhenti adalah bentuk kegagalan yang justru paling sering terjadi di repo ini.

### Tahap 1 — satu jawaban soal versi

- `versiAktifKinerja(tahun)` di `lib/data/kinerja.ts`: memulangkan
  `Map<sumber, {tipe, seq}>` memakai aturan `pickVersiAktif` yang **sudah ada** —
  PERUBAHAN seq tertinggi, kalau tidak ada MURNI seq tertinggi, `is_nullified`
  dikecualikan. Bukan aturan baru; yang baru cuma **satu tempatnya**.
- `fetchRealisasiAll` mengirim `versi_tipe`/`versi_seq` per sumber → rekap berhenti
  memakai jalur lama.
- `getLaporanSemua` & `getKinerjaKpi` memanggil helper yang sama.
- Rekap & Laporan menulis versi acuannya di kop, per sumber.
- Tab Realisasi memberi keterangan kalau versi yang dibuka **bukan** versi aktif —
  bukan larangan (membuka MURNI untuk membandingkan itu sah), tapi harus terlihat.
- `versi-list` ikut menyaring `is_nullified = FALSE`.

**Yang sengaja TIDAK dilakukan:** membuang jalur lama di
[kinerja.ts:507](../lib/data/kinerja.ts:507). Yang diperbaiki pemanggilnya.

### Tahap 2 — rekap berhenti mengarang rupiah & membulatkan dua kali

- `pushRow` menerima `akumTgtRp` yang **sudah dihitung**, tidak menurunkannya ulang
  dari persen. Satu parameter tambahan; `agg()` sudah memulangkannya.
- `devF`/`devK` dihitung dari rasio mentah, dibulatkan sekali — sama persis dengan
  `kinerja-calc.ts` dan `_utils.ts`.

Ini tahap paling murah dan paling langsung menjawab keluhan awal.

### Tahap 3 — rekap dihitung dari akumulasi, bukan dari baris satu bulan

Ganti `filter(r => r.bulan === bulanTerpilih)` menjadi: kelompokkan **semua** baris
`bulan <= bulanTerpilih` per `canonical_id`, jumlahkan realisasinya, dan ambil pagu
**sekali per item** (dari SSK, bukan dari baris realisasi).

Efek sampingnya bagus: pagu tidak lagi bisa terhitung dua kali hanya karena ada dua
baris di bulan yang sama.

### Tahap 4 — kebersihan data: dobel & yatim

- Init memeriksa duplikat dengan `canonical_id + bulan`; nama dipakai hanya sebagai
  cadangan untuk baris lama yang `canonical_id`-nya kosong.
- Init melaporkan berapa baris **lama** yang canonical_id-nya cocok tapi namanya
  berbeda — itu tanda item di-*rename*, dan pemakainya berhak memutuskan.
- Spanduk yatim di tab Realisasi **dan** rekap: sebut jumlah baris + nominalnya,
  jangan dijumlahkan diam-diam ke total (pola `yatim`/`yatimRekening` di BLUD).

Yatim tidak dijumlahkan ke total karena menambahkannya membuat % serapan berdiri di
atas penyebut yang tidak memuatnya — alasan yang sama persis dengan §9.1a BLUD.

**Catatan penting:** baris dobel yang **sudah terlanjur ada** di DB tidak hilang
sendiri. Tahap ini menghentikan kelahirannya; membersihkan yang lama adalah langkah
terpisah yang harus **melaporkan dulu**, lalu manusia yang memutuskan mana yang
dibuang.

### Tahap 5 — target hidup sebagai rupiah

Yang paling besar dampaknya, dan karena itu paling belakang.

- `getRealisasiHydrated` ikut `SELECT months`.
- `RealRowHydrated` dapat `target_rp` (bulan itu) dan `akum_target_rp`.
- `akum_target_fisik` (%) **diturunkan dari rupiah**, bukan dijumlah dari persen.
- `_utils.ts` disamakan pada commit yang sama — dua berkas, satu rumus.

**Konsekuensi yang wajib disebut ke pemakai sebelum dipasang:** seluruh kolom target
bisa bergeser sekitar 0,01% (pada pagu 142 miliar ≈ 13 juta rupiah), dan cetakan
lama tidak akan cocok lagi angkanya. Tidak ada migrasi — kolom turunan sudah tidak
disimpan sejak migration-031 — jadi yang berubah **hanya tampilan sejak saat itu**,
bukan riwayat.

**Pertanyaan "satu angka atau dua" — TERJAWAB dari data produksi** (2026-09-03,
ekspor SSK & Realisasi GAJI + BLUD 2026 dari server kantor):

- Berkas SSK/RKO punya **satu** rangkaian 12 target bulanan per rekening
  (`Target Jan`…`Target Des` rupiah + persennya). Tidak ada rangkaian kedua.
- Berkas Realisasi cuma punya **satu** kolom target (`Target Fisik`), dan
  `Deviasi Keuangan %` diukur ke situ juga — terbukti per baris: Akum % Keuangan
  6,61 − Akum Target Fisik 6,65 = −0,04, sama dengan kolom Deviasi Keuangan.

Jadi **satu angka**, dan yang terpasang sudah benar. Kalau suatu hari ada formulir
yang menuntut rencana penarikan dana terpisah dari rencana fisik, itu kolom baru
dan pekerjaan tersendiri — bukan sesuatu yang menahan tahap ini.

**Dampak Tahap 5 diukur pada data produksi**, bukan diperkirakan:

| Sumber | Target lama (Σ persen) | Target baru (Σ rupiah) | Selisih | Persen |
|---|---|---|---|---|
| GAJI s/d Agu | 52.317.440.736 | 52.312.449.000 | Rp 4.991.736 | 70,55% → 70,54% |
| BLUD s/d Agu | 36.109.802.146 | 36.103.374.800 | Rp 6.427.346 | 52,81% → 52,80% |

Deviasi keuangan GAJI tidak bergeser (−5,36% di kedua cara); BLUD bergeser
1,65% → 1,66%. Persis ukuran yang diperkirakan §2 T5.

### Tahap 6 — label & satuan

- `bulan_terakhir` = bulan terakhir yang **ada isinya**
  (`real_fisik <> 0 OR real_keuangan <> 0`), bukan `MAX(bulan)`.
- PDF Realisasi mencetak `target_fisik` dengan tanda `%`.

### Tahap 6b — Unduh Excel & PDF di view Rekap

Tab Cetak → Rekap hanya punya **Print**; view Detail sudah punya Excel & PDF sejak
lama. Ditambah `rekapAoa` + `exportRekapExcel`/`exportRekapPdf` di `_exports.ts`.

**Keputusan yang menentukan:** keduanya menerima **baris yang sudah dihitung**
`hitungRekap`, bukan menghitung ulang. Dokumen yang diunduh wajib memuat angka
yang persis sama dengan yang dilihat orang di layar; menghitung ulang di
pengekspor berarti dua sumber kebenaran untuk satu tabel. Karena itu `hitungRekap`
dihoist ke satu `useMemo` di badan komponen — bilah alat dan tabel memakainya
bersama, dan uji regresi menghitung **kemunculannya** (`hitungRekap(` tepat sekali
di seluruh berkas).

Dua hal ikut dibawa ke dokumen supaya bisa dibaca di luar aplikasi: keterangan
**versi acuan** di kop, dan **catatan yatim** di bawah tabel — tanpa itu, total
yang lebih kecil dari kas yang keluar tidak bisa dijelaskan oleh siapa pun yang
cuma memegang berkasnya. Hierarki dibawa lewat spasi di depan label; Excel dan PDF
tidak punya indent baris.

`addSheetFromAoa` di `lib/shared/excel-export.ts` dapat `headerRowIndex` (default 0,
jadi 8 pemakai lama tak tersentuh) — tanpa itu baris kop yang ter-style dan header
aslinya polos.

### Tahap 7 — opsional: dua kolom tambahan di rekap

**"Bulan Ini (Rp)"** dan **"Tingkat Capaian Fisik (%)"** (= realisasi ÷ target ×
100). Keduanya murni turunan dari angka yang sudah dihitung — tidak menambah kueri.
Dipisah karena ini **penambahan**, bukan perbaikan, dan tidak boleh menumpang commit
pembenahan.

### Tahap 9 — opsional: riwayat simpan

Satu-satunya yang butuh **migrasi**. Meniru `blud_riwayat_simpan`: satu tabel, kolom
`jenis` ENUM supaya SSK dan Realisasi berbagi tempat, `isi` JSON = payload POST apa
adanya, retensi 50 per (jenis, tahun, sumber), Pulihkan = **mengisi form**, bukan
menulis DB. Ditulis di dalam transaksi yang sama dengan barisnya, sesudah bump versi.

Tahap 0b sudah menutup kasus yang paling mungkin terjadi (kosong & penurunan
drastis). Tahap 9 menutup sisanya: simpanan sah yang ternyata salah isi, yang tidak
bisa ditangkap ambang mana pun karena jumlah barisnya tetap.

---

## 6. Fitur — "Samakan dengan Target" di kolom Real Fisik

**Kebutuhannya:** realisasi fisik sering memang persis mengikuti rencana bulan itu.
Mengetiknya ulang untuk belasan sampai ratusan baris × 12 bulan adalah pekerjaan
yang tidak menghasilkan satu keputusan pun.

### 6.1 Yang paling gampang salah: satuannya beda

Di layar, kolom **TARGET FISIK** menampilkan **persen** (`9,04%`) sedangkan kolom
**REAL FISIK** menyimpan **rupiah**. Jadi tombolnya wajib mengonversi — dan ada dua
cara, hanya satu yang benar:

| Cara | Hasil untuk pagu 40.937.377.000 @ 9,04% | Nilai |
|---|---|---|
| ❌ dari persen di layar | `round(9,04/100 × 40.937.377.000)` | 3.700.738.881 |
| ✅ dari rupiah RKO | `months['agu']` | angka yang **diketik orang** waktu menyusun RKO |

Cara pertama berdiri di atas persen yang sudah dibulatkan — persis penyakit T5, dan
tombol ini akan mewariskannya ke data yang **disimpan**, bukan cuma ditampilkan.

Cara kedua punya sifat yang bisa dibuktikan: `pct_fisik` hasilnya akan **persis
sama** dengan `target_fisik`, karena keduanya `round(months[m]/pagu × 10000)/100`.
Sebuah tombol bernama "samakan dengan target" yang menghasilkan angka **tidak** sama
dengan target adalah cacat yang paling membingungkan untuk ditelusuri nanti.

**Bahannya sudah ada, nol plumbing baru:** `sskRows: SskRow[]` sudah jadi prop
`RealisasiTab` (dipakai `initRealisasiFromSSK`), dan `SskRow` membawa `months`,
`months_pct`, dan `canonical_id`. Pasangan baris dicari lewat `ssk_canonical_id` —
identitas yang sama yang dipakai recalc, **bukan nama** (pelajaran T4).

### 6.2 Bulan yang sedang dibuka, titik

`months[MONTH_IDX[realisasiBulan - 1]]`. **Bukan akumulasi, bukan s/d.** Kolom AKUM
REAL FISIK dan AKUM % FISIK akan menyesuaikan sendiri lewat `recalcAllRealisasi` —
itu memang tugasnya, dan tidak boleh ada rumus akumulasi kedua di sini.

Karena tombolnya hidup di dalam kolom, ia otomatis berlaku di **semua tab bulan**
dan **semua sumber** tanpa satu pun cabang tambahan.

### 6.3 Berhenti di form

Tombol hanya mengisi sel di layar; yang menulis tetap **Simpan Semua**. Nol
endpoint, nol kolom, nol migrasi. Dua akibat yang bagus: seluruh pagar yang ada
(optimistic lock, sakelar maintenance, Zod, hak akses) berlaku otomatis, dan salah
pencet bisa dibatalkan dengan **tidak menyimpan** atau memuat ulang halaman.

### 6.4 Dua tombol, dua sifat

| | Per baris | Sebulan penuh |
|---|---|---|
| Letak | ikon kecil di dalam sel Real Fisik | bilah alat, sebelah Import |
| Menimpa isi yang sudah ada? | **ya** — satu sel, diklik sengaja | **tidak** — hanya baris yang masih 0 |
| Konfirmasi | tidak perlu | ya, menyebut angkanya |

Bunyi konfirmasi yang borongan: *"14 baris akan diisi dari target Agustus. 3 baris
sudah ada isinya dan tidak akan disentuh."*

**Kenapa yang borongan tidak menimpa:** menimpa ratusan angka yang sudah diketik
tangan dengan satu klik itu menghilangkan kerja yang tidak akan kelihatan sampai
berhari-hari kemudian. Kalau memang mau menimpa, itu keputusan **lain** dan pantas
jadi pilihan terpisah — bukan efek samping tombol yang namanya "isi dari target".

### 6.5 Kapan tombolnya tidak ada

- `!canEdit` atau `versiLocked` → hilang. Sama seperti Init/Import/Simpan yang sudah
  `disabled` di keadaan itu ([RealisasiTab.tsx:258](../app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx:258)).
- pagu 0 **atau** target bulan itu 0 → hilang. Di layar contoh, baris 5–13 semuanya
  begitu; tombol yang mengisi 0 dengan 0 cuma kebisingan di 9 dari 14 baris.
- baris yatim (`canonical_id` tak ketemu di `sskRows`) → hilang. Tidak ada target
  yang bisa disalin, dan itu justru petunjuk berguna bahwa barisnya yatim.

### 6.6 Sebutkan angkanya SEBELUM diklik

Tooltip: **"Isi dengan target Agustus: Rp 3.700.738.881"**. Orang berhak tahu apa
yang akan terjadi sebelum menekan, bukan sesudah.

Wajib `data-tooltip` (atau portal `.blud-tip-portal` kalau selnya di dalam
`overflow:auto`) — **DILARANG** `title=` native, sesuai DESIGN-SYSTEM. Ikon kecil di
dalam sel boleh tetap native (`button`), karena DESIGN-SYSTEM mengecualikan
row-action inline dari kewajiban `PrimaButton`; yang borongan di bilah alat ikut
pola tombol Init.

### 6.7 Tetap tindakan manusia — tidak dipasang di Init maupun Import

`initRealisasiFromSSK` membuat baris **kosong**, dan itu harus tetap begitu. Kalau ia
sekalian mengisi realisasi fisik = target, maka setiap dokumen lahir dalam keadaan
"100% sesuai rencana" tanpa ada orang yang memutuskannya. Hal yang sama untuk jalur
Import: berkas yang diimpor mengisi apa yang tertulis di berkas, tidak lebih.

Yang membedakan alat bantu dari angka karangan cuma satu: ada manusia yang menekan —
per baris atau per bulan — dan tahu angkanya sebelum menekan.

### 6.8 Efek yang perlu disadari

Kalau semua bulan diisi begini, `deviasi_fisik` jadi 0 dan AKUM % FISIK akan
mengikuti AKUM TGT FISIK persis. Itu memang **artinya**, bukan bug.

### 6.9 Kenapa boleh didahulukan

Fitur ini membaca `months` langsung dari `sskRows`, jadi ia sudah benar sejak hari
pertama tanpa menunggu Tahap 5 — dan justru menjadi contoh kecil dari apa yang Tahap
5 lakukan untuk seluruh modul. Ia juga tidak menyentuh satu pun rumus yang sedang
dibenahi tahap lain. Ditaruh di Tahap 8 supaya pembenahan selesai dulu, tapi aman
dikerjakan kapan saja.

---

## 7. Uji regresi

`scripts/test-kinerja-rekap.mts` — satu berkas, tumbuh mengikuti tahap:

| Bagian | Menguji | Tahap |
|---|---|---|
| A | target dari RUPIAH, bukan jumlah persen bulat; yatim ditandai | 5 |
| B | `recalcAllRealisasi` klien ≡ `recalcAllRealisasiServer` | — |
| C | deviasi dari nilai mentah; cara lama memang berbeda 0,01 | 2 |
| D | target Rp = penjumlahan, bukan hasil balik dari persen | 2 |
| E | item bolong satu bulan tidak menghilangkan pagunya | 3 |
| F | baris kembar dilaporkan, pagu tidak ikut berlipat | 4 |
| G | yatim dilaporkan dan tidak menaikkan persen | 4 |
| H | kedalaman & penomoran baris rekap | 3 |
| I | Samakan: `real_fisik = target_rp`, `pct_fisik ≡ target_fisik`, borongan tidak menimpa | 8 |
| J | pagar simpan berdiri **sebelum** DELETE di ketiga jalur | 0b |
| K | jalur tanpa parameter versi memakai versi AKTIF | 1 |
| L | `bulan_terakhir` = bulan yang ada isinya | 6 |
| M | ketiga layar menerjemahkan pagar; Init pakai canonical_id; PDF bertanda % | 0b·4·6 |
| N | unduhan rekap memuat angka yang sama dengan layar, kop + catatan yatim ikut | 6b |

**Hasil: `npx tsx scripts/test-kinerja-rekap.mts` — 80 pemeriksaan, 25 uji mutasi
tertangkap.** Lima mutasi awalnya **LOLOS**, dan kelimanya menunjukkan hal yang
sama: pemeriksaan yang lulus bukan karena kodenya benar.

| Mutasi | Kenapa lolos | Perbaikan |
|---|---|---|
| pagar simpan digeser ke belakang DELETE | `lastIndexOf('pagarReplace(', iDel)` mencari **mundur lintas-berkas** dan menemukan pagar milik fungsi LAIN yang berdiri lebih dulu | dipotong per **badan fungsi** dulu |
| Init kembali memeriksa nama | kutipannya muncul juga di baris deteksi "nama berubah" tepat di bawahnya | asersi dikunci ke bentuk terner `const exists = cid ? …` |
| borongan menimpa sel berisi | `(r.real_fisik \|\| 0) === 0` muncul juga di baris penghitung `kosong` | aturannya dipindah ke lib, diuji **perilakunya** |
| `samakanSatu` memakai persen bulat | item uji B kebetulan tepat 9,04% sehingga kedua cara memberi angka **sama persis** | dipindah ke item A (8,333333%) |
| `bisaSamakan` berhenti menolak yatim | yatim dari server selalu berpagu 0, jadi `pagu > 0` sudah menutupnya duluan | barisnya **dikarang** berpagu > 0 supaya kontraknya yang diuji |

Dua di antaranya (nomor 2 dan 3) adalah **L82c lewat pintu lain**: mengutip
sepotong kode yang ternyata muncul di lebih dari satu tempat.

Pohon uji **wajib** memuat pagu yang tidak habis dibagi 12 dan nilai bulanan yang
persennya jatuh di batas pembulatan — item A: pagu 7 miliar, 583.333.333 per bulan
(8,333333% → dibulatkan 8,33). Tanpa itu **selisih 0,01 tidak akan pernah muncul**
dan bagian C, D, dan I semuanya lulus tanpa menguji apa pun. `real_fisik` item A
juga sengaja **tidak** sama dengan targetnya; menyamakannya membuat dua mutasi
tombol Samakan tidak terlihat sama sekali.

Bagian J tidak bisa memakai DB, jadi ia memeriksa **urutan di dalam badan fungsi** —
pagar berdiri sebelum DELETE. Itu persis bentuk cacat aslinya: penjagaannya ada,
tapi berdiri di belakang.

### Diuji di aplikasi berjalan (GAJI 2026, 15 item × 12 bulan)

| Yang diuji | Hasil |
|---|---|
| Tombol per baris | Rp 1.750.000.000, `% Fisik` = **7,39% = Target Fisik persis**. Cara "kalikan persen bulat" memberi 1.750.246.122 — meleset **Rp 246.122** di satu baris satu bulan |
| Tooltip sebelum diklik | "Isi dengan target September: Rp 1.750.000.000" |
| Borongan | "14 baris akan diisi. 1 baris sudah ada isinya dan tidak akan disentuh" — baris ber-777.777.777 memang **tidak** tersentuh; 14 sisanya `% Fisik` ≡ Target Fisik |
| Simpan larik **kosong** | 409 `PENURUNAN_DRASTIS`, **180 baris masih utuh** — DELETE tidak jalan |
| Simpan 50 dari 180 | ditolak "turun 72.2%"; dengan `force` lolos (200, 50 baris) |
| Rekap S/D September | Target Rp **57.755.803.000** = jumlah RKO Jan–Sep sungguhan. Cara lama dari 77,89% memberi 57.759.157.363 — beda **Rp 3.354.363** |
| Kop rekap | "Pagu & target mengacu SSK versi aktif tiap sumber" |

Data uji dibersihkan: realisasi kembali 0 baris, SSK tetap 15 baris / Rp 74.154.779.000.

---

## 8. Yang sengaja TIDAK dikerjakan

- **Mengembalikan kolom turunan ke DB.** migration-031 membuangnya dengan alasan
  yang masih berlaku: dua sumber kebenaran soal angka uang cepat atau lambat berbeda
  pendapat (preseden `is_latest` di BLUD).
- **Membuat realisasi berversi.** Satu set baris per `(tahun, sumber)` itu sederhana
  dan benar. Yang salah bukan modelnya, tapi tiga layar yang mengukur set yang sama
  terhadap pagu berbeda.
- **Menyeragamkan deviasi fisik ke basis rupiah tanpa keputusan sadar.** Tahap 5
  menyebut pertanyaannya; tidak menjawabnya sendiri.
- **Endpoint baru.** Semuanya lewat yang sudah ada, jadi tidak ada permukaan sakelar
  maintenance baru dan gate G tidak perlu disentuh.
- **Membongkar `withTransaction`/optimistic lock.** Tahap 0b menggeser satu `if` dan
  menambah satu ambang — tidak lebih.
- **Memasang "Samakan dengan Target" secara otomatis** di Init atau Import (§6.7).
- **Virtualisasi / optimasi render.** Bukan masalah yang sedang dibahas.

---

## 9. Yang berubah di layar

Sesudah Tahap 0–6 & 8 terpasang, inilah yang akan terlihat berbeda oleh pemakai —
disebutkan supaya tidak dikira ada yang rusak:

| Di mana | Sebelum | Sesudah |
|---|---|---|
| Cetak → Rekap, kolom Target Keu (Rp) | hasil balik dari persen | penjumlahan rupiah RKO |
| Cetak → Rekap, Deviasi | bisa beda 0,01 dari tab Realisasi | sama persis |
| Semua kolom target | jumlah persen 2 desimal | dari rupiah — bergeser ~0,01% |
| Cetak → Rekap saat ada versi PERUBAHAN | diam-diam memakai MURNI | versi aktif, **dan versinya ditulis di kop** |
| Rekening yatim | ikut menaikkan % tanpa tanda | dikeluarkan + spanduk amber |
| Baris kembar | terhitung dobel diam-diam | pagu tidak dobel + spanduk merah |
| Laporan, "Bulan Terakhir Data" | selalu Desember | bulan terakhir yang ada isinya |
| PDF Realisasi, kolom Tgt Fisik | `8,33` | `8,33%` |
| Simpan dengan tabel kosong | menghapus setahun, diam | ditanya lebih dulu, bisa dibatalkan |

## 10. Ringkas

Sebelas temuan. Tahap 0–6 & 8 selesai, nol migrasi. Tahap 7 (dua kolom tambahan)
dan Tahap 9 (riwayat simpan) sengaja ditinggalkan — keduanya penambahan, bukan
perbaikan, dan Tahap 9 satu-satunya yang butuh tabel baru.

Urutan kerjanya **tidak** sama dengan urutan ditemukannya. Yang paling awal justru
temuan yang paling akhir muncul: **T0**, karena itu satu-satunya yang bisa
menghilangkan data — dan satu-satunya yang tidak punya jalan pulang.

**Pertanyaan "satu angka atau dua" sudah terjawab** dari ekspor SSK & Realisasi
produksi: **satu**. RKO hanya punya satu rangkaian 12 target bulanan, dan deviasi
keuangan memang diukur ke situ. Tidak ada yang tersisa untuk dikerjakan di Tahap 5.

**Data produksi juga membersihkan tiga kekhawatiran lain**: pada GAJI (180 baris)
dan BLUD (168 baris) tidak ada satu pun baris kembar (T4), rekening yatim (T6),
maupun rekening yang bulannya tidak lengkap (T7). Perbaikan untuk ketiganya tetap
dipasang — yang dijaga adalah kejadian di masa depan, bukan kekacauan hari ini.

**Satu temuan susulan yang memperkuat rancangan §6.7**: di produksi `Real Fisik`
**bukan** salinan target. GAJI 118 baris sama dengan target tapi 62 berbeda; BLUD 18
sama, 33 berbeda. Contohnya "Tambahan Penghasilan berdasarkan Beban Kerja PNS Juni:
real 2.682.447.469 vs target 5.263.378.000". Jadi kolom itu memang membawa
keterangan sungguhan, dan keputusan untuk TIDAK memasang tombol Samakan di Init
maupun Import terbukti benar — memasangnya akan menghapus 62 keterangan nyata itu.
