# Impor formulir baru di atas versi yang terbuka + pembaca Excel yang lebih paham rumus

Status: DIEKSEKUSI (2026-11-26) — catatan pelaksanaan & penyimpangan di §6. Keputusan pemilik di §5.
Pemicu: DPA 2027 punya versi 30 Sep 2026. Pemilik ingin mengimpor `draft anggaran 2027.xlsx`
(formulir sendiri, 522 baris) dengan angka baru, tetapi Impor menolak berkas itu dan tombol
"Masukkan ke Form" tidak muncul. Pratinjau juga menunjukkan selisih Rp 70.000.000.

---

## 1. Kenapa sekarang ditolak

- Selama versi tersimpan terbuka, Impor hanya menerima **Excel unduhan PRIMA dari versi itu**
  (ada kolom Jangkar). Berkas dari luar ditolak lewat `periksaImporBalik` (`lib/blud/impor-balik.ts`).
  Tombol "Masukkan" disembunyikan karena penolakannya pasti.
- Pesannya menyuruh "impor ke periode yang belum punya versi", padahal untuk **tahun yang belum
  berjalan** pemilih periode tidak pernah menawarkan periode kosong
  (`periodeHistorisTersedia` → `if (tahun > tahunIni) return []`). "Bulan berjalan" selalu
  membuka versi terakhir. Jadi satu-satunya jalan yang tersisa adalah menghapus versinya.
- Alasan aslinya (L79c) masuk akal: baris dari luar tidak membawa `anggaran_key`. Kalau baris
  itu ditulis ke versi yang dipakai realisasi, belanja yang sudah tercatat kehilangan posnya.

## 2. Yang diusulkan: Impor = mengganti ISI layar, Simpan yang menentukan versi baru

Sesuai cara pikir pemilik: hasil impor hanya mengisi tabel. Selama belum disimpan, versi yang
berlaku tidak berubah. Begitu Simpan, isi itu jadi versi terbaru.

### 2.1 Aturan

1. **Formulir dari luar diterima di atas versi yang terbuka.** Hasilnya berhenti di FORM (L78/L80):
   isi layar berganti, pil versi tetap menyebut versi yang terbuka dengan lencana BELUM TERSIMPAN
   (L83), sasaran Simpan **tidak** berubah.
2. **Sasaran Simpan yang menentukan versi.** Hari ini 26 Nov 2026 dan yang terbuka 30 Sep 2026 →
   Simpan melahirkan versi **26 Nov 2026**; versi 30 Sep tetap utuh dan tetap bisa dibuka.
   Angka kunci versi baru = 0 (`expectedVersionUntuk`, tidak berubah).
3. **Kalau sasaran = versi yang terbuka** (mis. versi hari ini sendiri, atau arsip akhir bulan yang
   sedang dipilih), Simpan memang akan mengganti isi versi itu. Modal menyebutnya terang-terangan
   sebelum tombol Masukkan: "Isi versi 26 Nov 2026 akan diganti saat Simpan. Isi lamanya tetap bisa
   diambil kembali dari Riwayat Simpan." Jebakan arsip yang sudah ada tetap berlaku.
4. **Jangkar dipasangkan, bukan dibuang.** Server memasangkan baris berkas dengan baris versi yang
   terbuka supaya `anggaran_key` (pengikat realisasi) ikut pindah:
   - kunci pasangan = kode rekening (segmen dinormalkan, "06" = "6") + uraian (huruf kecil, spasi
     dirapikan);
   - kalau tidak ketemu, kode rekening saja — **hanya bila** kode itu tunggal di kedua sisi;
   - satu baris versi hanya untuk satu baris berkas; yang berebut tidak dipasangkan dan disebut.
   Pemasangan dihitung server dari isi versi yang dibaca saat pratinjau (pola impor-balik), bukan
   dari layar.
5. **Realisasi tetap dijaga.** Daftar "Belanja yang kehilangan posnya" (`jangkarDipakaiRealisasi`)
   dihitung SESUDAH pemasangan, jadi yang tampil hanya rekening berrealisasi yang memang tidak
   punya pasangan di berkas. Pagar Simpan §4.3 (`PAGU_DIBAWAH_REALISASI`) tidak disentuh.
6. **Yang tidak berubah:** aturan babak Perubahan §11.2 (`putusanImpor`, dinilai pada babak
   sasaran), penolakan berkas Pergeseran / DPA Perubahan Lengkap / dua sisi, dan jalur impor-balik
   berkas ber-Jangkar. Form Baru ikut dibuka dengan aturan yang sama (§2.4).
7. **Jejak audit:** `asal_impor` dapat `di_atas_versi` + jumlah jangkar yang dipasangkan, sehingga
   detail `BLUD_SAVE_DPA` berbunyi mis. "impor formulir di atas versi 30 Sep 2026 — 498 dari 522
   baris membawa pos lama".

### 2.2 Kalimat di layar

- Tooltip Impor (versi terbuka): "Ganti isi tabel dengan Excel. Belum ada yang tersimpan sampai
  Anda menekan Simpan — hasilnya jadi versi {tanggal sasaran}."
- Ringkasan modal: "Berkas ini mengganti isi tabel. Versi 30 Sep 2026 tidak berubah. Saat Simpan,
  isinya jadi versi baru 26 Nov 2026."
- Kalimat penolakan lama yang menyuruh "periode yang belum punya versi" dibuang.

### 2.3 Berkas yang tersentuh (perkiraan)

`lib/blud/impor-balik.ts` (penolakan formulir luar dilepas, fungsi pemasang jangkar baru — MURNI),
`app/api/blud/dpa/import/route.ts`, `components/blud/ImportDpaModal.tsx` (kalimat pembuka modal
di baris "Formulir dari luar diimpor ke periode yang belum punya versi" ikut diganti),
`app/(dashboard)/blud/dpa/dpa-client.tsx` (`terapkanImpor` & `executeBuildForm` tetap memegang
`versi`, `alasanKunciBorongan` dibuang, tooltip), `app/(dashboard)/blud/pergeseran/pergeseran-client.tsx`
(kalimat saja, §2.5), `lib/blud/tanggal.ts` (penolong kalimat jalan keluar, §2.5),
`app/api/blud/dpa/route.ts` (kalimat audit). Nol tabel/kolom/migrasi, nol endpoint tulis baru.

### 2.4 Form Baru diperlakukan sama dengan Impor

Form Baru membuat kerangka dari Kode Besar — sifatnya sama dengan impor formulir luar: mengganti
isi layar dengan baris tanpa `anggaran_key`. Kalau Impor dibuka sedangkan Form Baru tetap dikunci,
dua tombol bersebelahan berbeda aturan untuk hal yang sama (L78).

1. `alasanKunciBorongan` di layar DPA **dibuang**. Form Baru hidup walau versi tersimpan terbuka.
2. Sebelum kerangka dipasang, dialog konfirmasi (dialog `overwriteConfirm` yang sudah ada diperluas):
   "Tabel diganti kerangka kosong dari Kode Besar. Versi 30 Sep 2026 tidak berubah. Saat Simpan,
   isinya jadi versi baru 26 Nov 2026." Bila sasaran = versi terbuka, kalimatnya menyebut isi versi
   itu akan diganti dan isi lamanya tetap di Riwayat Simpan (sama dengan §2.1 butir 3).
3. `executeBuildForm` berhenti memanggil `setVersi('')` — `versi` tetap, lencana BELUM TERSIMPAN
   menyala (L83). Alasannya bukan tampilan: dengan `versi` dikosongkan, Simpan ke versi hari ini
   yang sudah ada mengirim angka kunci 0 dan ditolak 409; dengan `versi` tetap, `expectedVersionUntuk`
   memulangkan angka yang benar.
4. Kerangka **tidak** dipasangkan jangkarnya: barisnya kosong angka, pemasangan cuma menebak. Rekening
   berealisasi tetap ditahan pagar Simpan §4.3 di server — dialog menyebutnya satu kalimat:
   "Kalau versi ini sudah dipakai mencatat realisasi, Simpan akan menahan rekening yang hilang."
5. Salin Tahun Lain **tetap** dikunci untuk tahun yang sudah punya versi (patokannya TAHUN, L79c) —
   itu kunci yang berbeda dan tidak menyentuh perkara ini.

### 2.5 Kalimat kunci yang tersisa hanya menyebut jalan yang ada

Pergeseran tetap mengunci "Buat Pergeseran" selama versi tersimpan terbuka (konsep ini tidak
membukanya — Buat Pergeseran membawa aturan babak & penutupan sendiri). Tetapi kalimatnya sekarang
sama dengan DPA lama: "Pilih periode yang belum punya versi, atau hapus versinya dulu" — dan untuk
tahun yang belum berjalan separuh pertamanya mustahil.

Aturannya satu: **kalimat kunci hanya menyebut jalan keluar yang benar-benar tersedia di layar itu.**
- Penolong murni di `lib/blud/tanggal.ts`, mis. `adaPeriodeKosong(tahun, versiTerpakai)` =
  `periodeHistorisTersedia(...).length > 0` — rumusnya dipinjam dari pemilih periode, bukan ditulis
  ulang, supaya kalimat dan pilihan di layar tidak bisa berbeda pendapat.
- Ada periode kosong → "Pilih periode yang belum punya versi, atau hapus versinya dulu di menu
  Pengaturan."
- Tidak ada (tahun yang belum berjalan, atau semua bulan sudah berarsip) → "Tahun 2027 belum punya
  periode lain untuk diisi. Untuk menarik DPA terbaru ke versi ini, pakai Sinkronkan DPA; untuk
  mulai dari nol, hapus versinya dulu di menu Pengaturan."
- Kalimat babak lama Pergeseran (`kunciBabakLama`) tidak disentuh.

---

## 3. Impor yang lebih pintar: mengenali salah rumus dan memindahkan baris sendiri

### 3.0 Kasus pemicu, dan bukti bahwa rumus berkaslah yang keliru

Parser dijalankan pada berkas asli (tanpa menulis apa pun):

| | Berkas asli | Sesudah pemilik membetulkan F398 |
|---|---|---|
| Rumus b.398 BELANJA MODAL | `=F399+F517+F525` | `=F399+F517+F524` |
| Total menurut berkas | 62.881.000.000 (2 akar dijumlah) | 62.811.000.000 |
| Total hitung ulang | 62.811.000.000 | 62.811.000.000 |
| b.524 Belanja Modal Aset Lainnya | **akar sendiri (L1)** | L3 di bawah BELANJA MODAL |

```
b.398  BELANJA MODAL                =F399+F517+F525   ← menunjuk cucu (525), melompati 524
b.524  Belanja Modal Aset Lainnya   =SUM(F525:F525)    ← tidak disebut rumus mana pun
b.525  … Aset Lainnya BLUD          (diklaim b.398 DAN b.524)
```

Pembaca sekarang memilih pengklaim **terdekat**, jadi b.525 ikut b.524, sedangkan b.524 tidak
punya induk dan jadi akar kedua (L1). Level di PRIMA diturunkan dari kedalaman pohon, jadi begitu
induknya benar, levelnya ikut benar dengan sendirinya — tidak perlu aturan level tersendiri.

Kesalahan semacam ini lumrah di formulir yang disusun tangan. Pembaca harus mengenalinya sendiri,
tanpa menunggu rumus dibetulkan.

### 3.1 Prinsip: memindahkan sendiri hanya kalau angkanya membuktikan

Prinsip `import-rapikan.ts` tetap dipakai dan diperluas: **rumus cuma usulan, aritmetika yang
memutuskan.** Tiap pemindahan dicoba dulu, lalu residu (angka tertulis − Σ anak) di baris yang
tersentuh dihitung ulang. Pemindahan dipakai hanya kalau residu itu jadi **nol**, dan tidak ada
residu lain yang memburuk. Kalau tidak terbukti, baris tidak dipindah dan dilaporkan dengan
kalimat yang menyebut baris, rumus, dan saran pembetulannya.

Semua pemindahan otomatis tampil di panel **"Dibetulkan otomatis"** pada modal impor, satu kalimat
per kasus, misalnya:

> b.524 Belanja Modal Aset Lainnya dipindah ke bawah b.398 BELANJA MODAL. Rumus b.398 menunjuk
> b.525 (anak b.524), bukan b.524 — angkanya cocok persis (Rp 5.981.100.000).

Dengan begitu orang tetap tahu apa yang dilakukan sistem dan bisa membetulkan Excel-nya bila mau.
Hasilnya tetap berhenti di FORM; tidak ada yang tersimpan sebelum tombol Simpan.

### 3.2 Kasus yang ditangani otomatis

**K1 — Rumus induk melompati anak dan menunjuk cucu (kasus pemicu).**
Baris Q tidak disebut rumus mana pun, tetapi SEMUA baris yang dijumlah Q juga disebut rumus baris
P di atasnya. → Q dipasang di bawah P, dan P melepas klaim langsungnya atas anak-anak Q.
Bukti: angka tertulis P = Σ anak barunya. Juga mencakup lompatan lebih dari satu tingkat (P
menunjuk cicit): diulang sampai stabil, dari bawah ke atas.

**K2 — Rumus induk lupa satu baris (rentang SUM tidak ikut melebar).**
Contoh: baris baru disisipkan di bawah `=SUM(F400:F410)` di b.411, tetapi rentangnya tidak
diperbarui. Baris itu tidak diklaim siapa pun dan berangka. → Ditempelkan ke induk terdekat di
atasnya yang kodenya menjadi awalan kodenya (atau, bila tak berkode, ke blok tempatnya berada).
Di sini Excel sendiri tidak menghitung baris itu, jadi pembuktiannya terbalik: total PRIMA akan
**lebih besar** dari total Excel tepat sebesar baris itu. Karena itu kasus ini **tidak diam-diam**:
- panel menyebutnya merah: "Rumus b.399 di Excel tidak menghitung b.411 (Rp 2.500.000). PRIMA
  menghitungnya, jadi total naik Rp 2.500.000 dari angka Excel.";
- neraca menampilkan "selisih dijelaskan" (bukan "cocok persis"), dengan pilihan **Lewati baris
  itu** bagi yang memang tidak bermaksud menganggarkannya.

**K3 — Angka diketik mati di sel induk (rumusnya tertimpa).**
Induk tanpa rumus → anak-anaknya tidak diklaim. Induk diambil dari awalan kode / posisi blok,
lalu dibuktikan: angka tertulis induk = Σ anak. Cocok → dipakai diam (cukup disebut sekali di
panel). Tidak cocok → dilaporkan sebagai residu biasa.

**K4 — Baris dijumlah dua kali oleh dua induk yang tidak serantai.**
Bukan kasus K1 (pengklaim kedua bukan leluhur pengklaim pertama). Excel menghitung uang yang sama
dua kali. → Baris dipasang di pengklaim yang kodenya cocok (awalan kode), cadangannya yang
terdekat; panel menyebut: "b.R dihitung dua kali di Excel (oleh b.P1 dan b.P2) — total Excel
kelebihan Rp X." Ini satu-satunya kasus di mana total PRIMA sengaja **lebih kecil** dari total
Excel, dan kalimatnya menyebut sebabnya.

**K5 — Kode satu kolom: "posisi" tidak bermakna.**
Pembanding kedua untuk kode satu kolom diganti **awalan kode** (segmen dinormalkan: "06" = "6").
Peringatan "42 baris berbeda pendapat" hilang; yang tersisa hanya pertentangan nyata, dengan nama
barisnya (≤ 5), mis. "b.398 BELANJA MODAL berkode 5.2.02 membawahi 5.2.03 dan 5.2.6 — kodenya
kemungkinan seharusnya 5.2." Awalan kode juga jadi cadangan induk untuk K2/K3.

**K6 — Angka di kolom Penanggung Jawab.**
Pada berkas ini b.19 ("291000000") dan b.79 ("53901998000") — hitungan bantu, bukan nama orang.
Sekarang dipindah ke keterangan sebagai "PJ berkas: 291000000" dan disebut "tidak ada di master".
→ Isi PJ yang seluruhnya angka **diabaikan**, disebut sekali secara ringkas ("2 baris berisi angka
di kolom Penanggung Jawab — dianggap hitungan bantu, tidak dimasukkan"). Teks nama yang tidak ada
di master tetap ke keterangan seperti sekarang (L68).

**K7 — Total berkas diambil dari baris total teratas.**
Bila berkas punya baris teratas yang rumusnya menjumlah akar (b.9), angka itu yang jadi "Total
menurut berkas". Akar palsu tidak lagi menggelembungkan angka pembanding.

### 3.3 Yang sengaja TIDAK dipindah otomatis

- **Rumus menunjuk baris yang salah sama sekali** (salah ketik F52 untuk F25). Angka tertulis
  induk ikut salah, jadi aritmetika tidak bisa membuktikan pembetulan apa pun. → Dilaporkan:
  "Rumus b.P menjumlah b.R yang kodenya bukan di bawah b.P (5.1.02 di bawah 5.2.02)".
- **Kode tidak seragam** (`5.2.6` dengan anak `5.2.06.99`). Kode itu data pemilik; cukup disebut.
- **Baris rincian tanpa angka** (b.192–199, daftar tenaga) — tetap masuk sebagai baris bernilai 0
  (keputusan §5), peringatannya diperjelas: "8 baris rincian tanpa angka di bawah b.190".

### 3.4 Tempat aturannya

- Aturan baru jadi aturan 3–5 di `lib/blud/import-rapikan.ts` (MURNI, dekat `rapikanHierarki`),
  memakai `residuSimpul` & `EPS_RAPIKAN` yang sama — bukan pembanding kedua.
- Daftar perbaikan memakai `PerbaikanImpor` yang sudah ada (panel modal sudah membacanya), diberi
  jenis baru per kasus supaya kalimatnya bisa spesifik.
- K5–K7 di `lib/blud/import-dpa.ts` (`bacaDpaDariGrid`).
- Pilihan "Lewati baris itu" (K2) hidup di modal, mengubah daftar baris yang dikirim ke form saja.

### 3.5 Uji

- `scripts/test-blud-impor-pintar.mts` (baru): data tiruan per kasus K1–K7, termasuk K1 dua tingkat,
  K1 yang angkanya TIDAK cocok (harus batal), K2 dengan "Lewati", K4 dua induk tak serantai; uji
  mutasi untuk tiap aturan.
- **Kalibrasi terkuat:** berkas asli (F525) dan berkas yang sudah dibetulkan pemilik (F524) harus
  menghasilkan **pohon identik** — induk, level, dan total tiap baris. Kedua berkas dipakai lewat
  argumen path dan **tidak** di-commit (repo publik, isinya anggaran internal).
- Tetap hijau: kalibrasi 4 formulir DPA (tidak boleh ada pemindahan baru yang tidak terbukti di
  sana), `test-blud-impor-bolak-balik.mts`, `test-blud-impor-balik.mts`, `test-blud-impor-periode.mts`.

## 4. Urutan kerja

1. Pembaca Excel (§3) dulu — ia yang membuat angka di pratinjau bisa dipercaya.
2. Impor & Form Baru di atas versi terbuka (§2.1–§2.4).
3. Kalimat kunci Pergeseran (§2.5).
4. Uji layar di tahun kotak pasir (2099; tahun "belum berjalan" ditiru lewat jam uji), bukan 2026.
   Regresi lama yang menegaskan Form Baru/Impor terkunci (`test-blud-periode-terkunci.mts`,
   `test-blud-impor-periode.mts`, `test-blud-impor-balik.mts`) ditulis ulang mengikuti aturan baru —
   bukan dihapus: yang dijaga sekarang adalah `versi` TETAP sesudah impor/Form Baru dan sasaran
   Simpan tidak berpindah.

## 5. Keputusan pemilik (2026-11-26)

1. Kunci Impor **dan** Form Baru dibuka, kalimat kunci yang tersisa diperbaiki (§2.4, §2.5).
2. Sasaran Simpan = versi yang sedang terbuka (versi hari ini) → boleh diganti isinya, dengan
   peringatan di modal/dialog; isi lamanya tetap di Riwayat Simpan.
3. Baris rincian tanpa angka (§3.3) tetap jadi baris bernilai 0; pilihan "jadikan keterangan"
   menyusul bila memang sering muncul.
4. Impor harus mengenali salah rumus dan memindahkan baris sendiri (§3) — tetapi hanya bila angka
   membuktikannya, dan setiap pemindahan disebut di panel "Dibetulkan otomatis".
5. Baris yang dilupakan rumus Excel (K2) **dihitung** PRIMA, disebut merah, dan bisa dilewati per
   baris. Angka PJ yang seluruhnya angka (K6) diabaikan.

Butir 2, 3, 5 diambil dari usul konsep karena pemilik meminta konsep final tanpa menjawabnya
satu per satu — bila tidak sesuai, ubah di sini sebelum "eksekusi".

## 6. Catatan pelaksanaan (2026-11-26)

- **Dieksekusi.** Aturan baru: `sambungRantaiTerlompati` (K1), `klaimGanda` (K4), `indukDariAwalanKode`
  (K3/K5) di `lib/blud/import-rapikan.ts`; K2/K5/K6 & pemilihan induk berdasar kode di
  `lib/blud/import-dpa.ts`; `pasangkanJangkar` di `lib/blud/impor-balik.ts`; `adaPeriodeKosong` di
  `lib/blud/tanggal.ts`.
- **K4 dipersempit**: hanya pengklaim yang memang terhitung di total Excel (rantai rumusnya berujung
  di akar) yang dinilai. Tanpa itu, K1 yang gagal dibuktikan ikut dilaporkan "dijumlah dua kali".
  K2 juga melewati subpohon yang sebagian isinya sudah disebut rumus di luar subpohon itu.
- **K7 TIDAK dilaksanakan seperti tertulis.** Mengambil total berkas dari baris teratas saja membuat
  neraca berbunyi "cocok" padahal pohonnya masih berakar dua (akar palsu ikut dihitung di sisi PRIMA).
  Penggantinya: total berkas tetap jumlah semua akar, dan peringatan akar ganda kini menyebut
  setiap akar beserta angkanya. Sesudah K1, berkas pemicu memang tinggal satu akar.
- **Modal**: pilihan Lewati ikut menghitung ulang pratinjau pohon & neraca; catatan selisih induk yang
  seluruhnya berasal dari baris yang dilewati tidak ditampilkan lagi.
- **Diuji**: `npx tsx scripts/test-blud-impor-pintar.mts [asli.xlsx dibetulkan.xlsx]` (62 + kalibrasi
  4), 10 uji mutasi tertangkap. Di layar (kotak pasir 2099, dibersihkan): berkas asli F525 di atas
  versi 30 Sep → selisih nihil, b.524 dibetulkan otomatis, 514/522 pos lama terbawa, Simpan melahirkan
  versi 26 Nov dan versi 30 Sep utuh; sasaran = versi terbuka → dialog; Form Baru mempertahankan versi;
  kalimat kunci Pergeseran 2099; panel K2 + Lewati di lebar 375 px.
