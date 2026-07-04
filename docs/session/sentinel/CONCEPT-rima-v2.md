# CONCEPT — RIMA v2: Kalkulator · Navigasi · Pengetahuan Luas · Obrolan Bebas (deterministik, tetap aman)

> Status: **DRAFT KONSEP** (belum diimplementasi). Lanjutan dari F1–F4
> (`CONCEPT-sentinel-bot.md`). Semua di sini WAJIB tetap **100% lokal,
> deterministik, no-LLM, read-only** — yang ditambah adalah *kedalaman* dan
> *keluasan*, bukan mengganti otak Rima dengan model generatif.

---

## 0. Ringkasan & motivasi

User minta Rima:
1. **Bisa menghitung sungguhan** (bukan cuma menjelaskan rumus) — kalkulator rumus PRIMA.
2. **Pengetahuan lebih luas + bisa "ngobrol bebas"** — small-talk & wawasan umum.
3. **Tahu fungsi tiap tombol + bisa menunjuk** (perluasan locate/tur).
4. **Bisa "membuka aplikasi"** dari halaman menu (navigasi atas izin akses).
5. **Tetap ada batasan** keamanan & akses (tidak bocor data/role/kredensial).

Tantangan inti: *"bebas ngobrol tahu jawabannya"* secara alami menuntut LLM —
yang **bertentangan** dengan pilar Rima (lokal, gratis, privat, auditable, G9
no-LLM). Konsep ini menyelesaikannya dengan **memperluas cakupan deterministik
secara masif** + **kalkulator nyata** + **retrieval lebih pintar**, sehingga
*terasa* bebas mengobrol tanpa mengorbankan satu pun guardrail. Opsi hibrida-LLM
dibahas jujur di §7 berikut alasan **tidak** direkomendasikan.

---

## 1. Prinsip yang tidak boleh dilanggar (warisan G1–G16 + tambahan)

| Kode | Aturan | Implikasi v2 |
|---|---|---|
| G1 | Bot **tidak meng-klik** apa pun | Navigasi & "buka aplikasi" = render **link chip**, **user** yang klik |
| G9 | **No LLM**, 100% lokal-deterministik | Kalkulator pakai parser sendiri (no `eval`); obrolan dari KB terkurasi |
| G10/G11 | Tanpa bocor path/tabel/endpoint; eskalasi ke admin **tanpa** kasih mekanisme | Tetap berlaku ke fitur baru |
| G14 | KB = kode (PR + lint) | Semua jawaban/rumus/chit-chat statis di repo, ikut `rima:check` |
| G16 | **Read-only** — Rima tidak mengubah/membaca data PRIMA | Kalkulator menghitung **angka yang user ketik**, BUKAN menarik data anggaran nyata |
| **G17** *(baru)* | **Kalkulator tanpa eksekusi kode** | Parser aritmatika aman (shunting-yard), bukan `eval`/`Function` |
| **G18** *(baru)* | **Navigasi sadar-akses** | Hanya tawarkan link modul yang user **punya akses** + sedang **online** |
| **G19** *(baru)* | **Kalkulator ≠ penasihat keuangan** | Menghitung angka yang diberikan; tidak menyarankan keputusan anggaran |

---

## 2. Fitur A — Kalkulator Rumus PRIMA (hitung **sungguhan**)

Saat ini intent `hitung.*` hanya **menjelaskan** rumus + contoh statis. v2 membuat
Rima **menghitung dari angka yang diketik user**.

### 2.1 Cakupan — KALKULATOR PENUH (semua deterministik, no-LLM)
Matematika itu **dihitung**, bukan dipelajari → tidak butuh data latih, hasilnya eksak.

**1) Aritmatika** — `+ − × ÷`, kurung, desimal (koma/titik), negatif, modulo `%`/`mod`,
pangkat `^`, urutan operasi (PEMDAS). Contoh: `2,5 × 3000`, `(10+5)*1200`, `2^10`.

**2) Ilmiah** — `sqrt`, `cbrt`, akar-n; `log`, `ln`, `exp`; trigonometri `sin/cos/tan`
+ invers + mode derajat/radian; `abs`, `round/floor/ceil`, faktorial `n!`, `gcd`, `lcm`;
konstanta `pi`, `e`.

**3) Statistik** (atas daftar angka) — rata-rata (mean), median, modus, jumlah, min,
max, rentang, variansi, simpangan baku, persentase, perubahan persen.
Contoh: "rata-rata 80, 90, 70".

**4) Geometri** (panjang/luas/keliling/volume) — kamus rumus bernama:
- 2D luas & keliling: persegi, persegi panjang, segitiga, lingkaran, trapesium,
  jajar genjang, belah ketupat.
- 3D volume & luas permukaan: kubus, balok, tabung, bola, kerucut, prisma, limas.
- Pythagoras. Contoh: "luas lingkaran jari-jari 7", "volume tabung r 10 t 20".

**5) Konversi satuan** — panjang (mm/cm/m/km/inci/kaki), luas (cm²/m²/ha/km²),
volume, massa, waktu, **+ ribu↔juta↔miliar** (relevan anggaran).

**6) Rumus PRIMA bernama** (di-ground ke kode nyata — `lib/blud/recalc.ts`, kinerja, BBA):
- `jumlah` = vol × harga · `% realisasi` = realisasi ÷ pagu × 100
- `selisih pergeseran` = jumlah sesudah − jumlah sebelum · `sisa aset` = rencana − realisasi (min 0)
- `% terakomodir`, `deviasi`, `akumulasi` (deret bulanan)

**7) Terbilang Rupiah** (angka → kata) — berguna untuk dokumen.
**8) Riwayat hitung** singkat di sesi (opsional, in-memory).

### 2.2 Arsitektur
```
lib/sentinel/calc.mjs        # PURE: tokenizer + shunting-yard (no eval) + named formulas
lib/sentinel/calc.d.mts      # tipe
lib/sentinel/geometry.mjs    # kamus rumus geometri + satuan (data, bukan eval)
lib/sentinel/terbilang.mjs   # angka → kata
```
- **Parser aman** (Dijkstra shunting-yard → AST → evaluator dengan tabel fungsi
  allow-list) → tidak ada `eval`/`new Function` (G17).
- Pure & shared (.mjs) → bisa diuji harness Node + dipakai browser.
- `parseExpr(str): {ok, value, steps[]} | {ok:false, reason}`.
- `namedFormula(kind, inputs): {value, steps}` untuk geometri/statistik/rumus PRIMA.

**Pilihan implementasi parser** (pilih saat F5a):
| Opsi | Plus | Minus |
|---|---|---|
| **Hand-roll shunting-yard** (rekomendasi) | Nol dependency, allow-list eksplisit, auditable penuh | Tulis sendiri (sedang) |
| `expr-eval` (npm) | Ringan, aman, fokus matematika | +1 dependency |
| `mathjs` (npm) | Sangat lengkap (matriks/unit/stat) | Bundle besar, permukaan lebih luas (v4+ sudah no-eval, tetap perlu `limitedEvaluate`) |

Apa pun pilihannya WAJIB **tanpa eval**, fungsi yang diizinkan **allow-list**, dan
**tidak** menyentuh data PRIMA (G16/G17).

### 2.3 Deteksi "intent kalkulator" (pre-hook di RimaChat)
Sebelum classifier NLU (pola persis hook `locate` §6b-4):
- Cocokkan pola: ada **≥2 angka + operator**, atau kata pemicu `hitung/berapa/=`.
- Untuk rumus bernama: frasa "jumlah dpa vol 10 harga 5000", "persen realisasi 25 juta dari 100 juta".
- Jika cocok → panggil `calc`, render jawaban; **tidak** menyentuh classifier.

### 2.4 Format jawaban (persona)
> "10 × Rp 5.000 = **Rp 50.000** 😊 (sepuluh × lima ribu)."
- Tampilkan **langkah** singkat + hasil **format Rupiah** + opsi **terbilang**.
- Chip: `Rumus lengkap` (ke `hitung.*`), `Hitung lagi`.

### 2.5 Keamanan (G16/G17/G19)
- **Tidak** membaca data PRIMA — murni angka yang user ketik.
- **Tidak** `eval`; input dibatasi panjang (mis. ≤120 char) & jumlah token.
- **Div-by-zero / overflow** → pesan ramah, bukan error mentah.
- **Tidak** memberi saran keputusan ("sebaiknya pangkas X") — hanya berhitung.

### 2.6 Contoh percakapan
- User: `2,5 x 3000` → "2,5 × Rp 3.000 = **Rp 7.500**."
- User: "persen realisasi 25 juta dari 100 juta" → "Rp 25.000.000 ÷ Rp 100.000.000 × 100 = **25,00%**."
- User: "terbilang 7139062000" → "**tujuh miliar seratus tiga puluh sembilan juta enam puluh dua ribu rupiah**."

---

## 3. Fitur B — "Buka Aplikasi" dari menu (navigasi sadar-akses)

### 3.1 Perilaku
- Di mana saja: "buka BLUD", "ke kinerja", "saya mau ke LKJIP" → Rima render
  **link chip** `Buka BLUD →` (href `/blud`). **User** yang klik (G1).
- Di `/menu`: "aplikasi apa yang bisa saya buka?" → daftar **link chip modul
  yang user punya akses & online**.

### 3.2 Sadar-akses (G18) — ini "batasan" yang diminta user
- Rima menerima **daftar modul yang dapat diakses** (read-only) dari shell/layout
  (yang sudah tahu `hasAppAccess` + `app_status`). Sumbernya yang sudah ada:
  endpoint status modul + render kartu menu.
- Modul **tanpa akses** → Rima tidak kasih link, jawab sopan: "Modul itu di luar
  aksesmu sekarang — kalau perlu, ajukan ke admin lewat atasanmu ya" (tanpa bocor
  alasan teknis, G11).
- Modul **maintenance** → "Sedang dipelihara admin, coba lagi nanti ya."
- **Tidak** ada auto-redirect; selalu via chip yang diklik user.

### 3.3 Implementasi ringkas
- `SentinelProvider` terima prop `accessibleModules: {key,label,href,online}[]`
  (di-pass dari dashboard layout — read-only, identitas stabil).
- KB intent `nav.buka-<modul>` → chip href bersyarat akses.

---

## 4. Fitur C — "Fungsi tombol ini apa?" + menunjuk (perluasan locate)

Sudah ada: locate ("di mana X") + anchors + micro-tur menunjuk. v2 menambah
**kamus fungsi tombol**.

### 4.1 Perilaku
- "tombol Inject buat apa?", "fungsi tombol Simpan?" → jawaban **fungsi** singkat
  + chip **"Tunjukkan"** (memicu locate → menunjuk di layar bila ada di halaman).
- "jelaskan tombol-tombol di halaman ini" → ringkas daftar anchor halaman aktif.

### 4.2 Implementasi
- Perluas `RimaAnchor` dengan field opsional `desc` (1 kalimat fungsi) — sumber
  tunggal untuk locate **dan** "fungsi tombol".
- Pre-hook: deteksi pola "fungsi/buat apa/kegunaan + <nama tombol>" → cari anchor
  by label → jawab `desc` + chip Tunjukkan (locate).
- Tetap lewat anchor registry (G15 anchor-check menjaga sinkron dengan UI).

---

## 5. Fitur D — Pengetahuan luas & "obrolan bebas" (tetap deterministik)

### 5.1 Paket Chit-chat (perluasan `sapa.*` → `obrol.*`)
Tambah intent obrolan ringan **aman & hangat**, semua statis (G14, ikut lint):
- Semangat/motivasi kerja, "kamu lagi apa?", "capek nih", "Jumat ya", "lembur".
- Selera ringan netral: "suka warna apa?", "kamu robot ya?", "umur kamu berapa?".
- Penolakan **anggun** untuk yang di luar batas (lelucon sensitif/politik/SARA →
  `deny.*` yang sudah ada) — tetap ramah, alihkan ke PRIMA.
- Token dinamis (sudah ada): `{{jam}}/{{hari}}/{{salam-waktu}}`.

### 5.2 Wawasan domain (perluasan `umum-sistem.*`)
- Lebih banyak istilah anggaran/akuntansi pemerintah (SiLPA, SPD, SP2D, e-katalog,
  RKA, KUA-PPAS, akrual) — penjelasan awam, **tanpa** klaim sebagai sumber resmi.

### 5.3 Fallback yang lebih "ngobrol" (bukan buntu)
- Saat tak yakin: tawarkan kandidat (A5 sudah ada) **+** satu kalimat hangat +
  ajakan reframing. Streak bingung → tawaran tur (B3 sudah ada).

### 5.4 Sadar-konteks proaktif
- Rima tahu halaman aktif → "Di halaman ini kamu bisa A/B/C — mau kubantu yang mana?"
- Setelah user menyelesaikan sesuatu (mis. simpan sukses) → apresiasi singkat.

### 5.5 Cara "melatih" agar makin pintar (deterministik)
- Tambah pasangan **"pertanyaan → intent"** di `GOLDEN-QUESTIONS.md` (banyak parafrase + typo).
- `scripts/rima-train.mjs` meng-augmentasi (sinonim+typo) → `model.json`.
- `fail-log` lokal (sudah ada) = sumber ide pertanyaan yang belum dikenali → bahan latih berikutnya.
- Gate CI menjaga kualitas: `rima:check` (akurasi K2, persona-lint, anchor G15).

---

## 6. Fitur E — Pelengkap (nilai tambah cepat)

- **Terbilang Rupiah** (lihat §2) — dipakai di chat & berguna untuk dokumen.
- **Bantuan tanggal**: "berapa hari lagi akhir tahun anggaran?", "hari ini tanggal berapa?".
- **Tips harian** (rotasi statis): hemat klik, shortcut, ingat simpan berkala.
- **Mode "Latihan singkat"**: kuis 3 pertanyaan cara pakai modul (opsional, gamifikasi onboarding B4).
- **Konversi ringan** relevan anggaran (ribu/juta/miliar ↔ angka).

---

## 7. Opsi hibrida-LLM (dibahas jujur — **TIDAK** direkomendasikan default)

| Aspek | Deterministik (rekomendasi) | Hibrida-LLM |
|---|---|---|
| Privasi | Obrolan tak pernah keluar browser | Teks user dikirim ke server/penyedia |
| Audit (G14) | Jawaban auditable kata-per-kata | Output non-deterministik, sulit diaudit |
| Biaya | Rp 0 | Biaya token + kuota |
| Keamanan | Tak bisa "dibujuk" bocor data | Rawan prompt-injection / kebocoran |
| Konsistensi | Stabil | Bisa "berhalusinasi" rumus/aturan |

**Keputusan**: tetap **deterministik**. "Bebas ngobrol" dicapai lewat **keluasan
KB + kalkulator + retrieval**, bukan model generatif. Jika kelak benar-benar perlu
LLM, batasi ke *tier opsional* yang **mati secara default**, hanya untuk small-talk
non-sensitif, di belakang kill-switch (pola F4g) + tetap melewati deny-list — dan
itu proyek tersendiri dengan persetujuan eksplisit.

---

## 8. Matriks keamanan & batasan (yang BOLEH vs TIDAK)

| Permintaan user | Rima | Alasan |
|---|---|---|
| Hitung angka yang diketik | ✅ Hitung | G16 aman — angka milik user |
| "Tarik total DPA versi X lalu hitung" | ❌ Tidak baca data | G16 read-only; arahkan lihat di modul |
| "Buka modul yang saya punya akses" | ✅ Link chip | G18 sadar-akses |
| "Buka modul yang TIDAK saya akses" | ❌ Sopan tolak | G18 + G11 |
| "Fungsi tombol X?" | ✅ Jelaskan + tunjuk | dari anchor `desc` |
| Small-talk netral | ✅ Ramah | aman |
| Politik/SARA/curhat sensitif | ❌ `deny.*` | G10/G11 |
| Password/token/kode/endpoint | ❌ `deny.*` | G10 |
| Saran keputusan anggaran | ❌ Tolak halus | G19 (bukan penasihat) |
| Data/akun orang lain | ❌ `deny.*` | privasi |

---

## 9. Roadmap berfase (usulan urutan)

| Fase | Isi | Risiko | Estimasi |
|---|---|---|---|
| **F5a** | Kalkulator (`calc.mjs` + pre-hook + format + terbilang) + golden-questions hitung-live | rendah | sedang |
| **F5b** | Navigasi sadar-akses ("buka aplikasi") + KB `nav.*` + prop accessibleModules | rendah | kecil |
| **F5c** | "Fungsi tombol" — field `desc` di anchors + pre-hook + chip Tunjukkan | rendah | kecil |
| **F5d** | Paket obrolan `obrol.*` + perluasan `umum-sistem.*` + fallback hangat + retrain | rendah | sedang |
| **F5e** | Pelengkap: tanggal, tips, kuis latihan, konversi | rendah | kecil |

Setiap fase: tambah/ubah KB → `rima-train` → `rima:check` (K2+persona+anchor) →
live-verify preview → commit. Setelah ≥3 file: tawarkan `/graphify . --update`.

---

## 10. Berkas yang akan disentuh (peta)

- **Baru**: `lib/sentinel/calc.mjs` + `.d.mts`, (opsi) `lib/sentinel/terbilang.mjs`.
- **Ubah**: `components/sentinel/RimaChat.tsx` (pre-hook calc + fungsi-tombol +
  nav chips), `lib/sentinel/knowledge.mjs` (+`obrol.*`, `nav.*`, hitung-live copy,
  perluasan `umum-sistem.*`), `lib/sentinel/anchors.ts` (+`desc`),
  `components/sentinel/SentinelProvider.tsx` (prop `accessibleModules`),
  `app/(dashboard)/layout.tsx` (suplai accessibleModules read-only),
  `docs/session/sentinel/GOLDEN-QUESTIONS.md` (+ratusan parafrase),
  `scripts/rima-lint-templates.mjs` (+set baru), CI tetap.

---

## 11. Risiko & mitigasi

- **Pre-hook kalkulator salah-tangkap** kalimat biasa berangka → batasi pola ketat
  (butuh operator/kata pemicu); kalau ragu, lempar ke classifier.
- **Over-promise "bebas ngobrol"** → komunikasikan jujur: luas tapi terkurasi; tetap
  bisa bilang "belum kukenali" dengan anggun.
- **KB membengkak** → modularisasi `knowledge.mjs` per-domain bila perlu; gate K2 jaga akurasi.
- **Navigasi bocor akses** → G18 wajib; uji role rendah agar tak melihat link terlarang.

---

## 12. Pelatihan terbantu data publik (guardrailed)

> Penting dipahami: Rima deterministik **tidak "belajar" dari data** seperti LLM.
> Data publik dipakai sebagai **bahan parafrase untuk lapis PENGENALAN** (agar
> Rima paham banyak cara orang bertanya) — **BUKAN** sumber jawaban. Setiap
> jawaban tetap **ditulis & ditinjau manusia** di repo (G14 KB=kode).

### 12.1 Dipakai untuk apa
- **Penggalian parafrase**: dari dataset/kalimat publik, ambil ragam frasa untuk
  satu maksud → tambah ke `GOLDEN-QUESTIONS.md` (chips.q & keywords) → `rima-train`
  meng-augmentasi (sinonim+typo) → `model.json`. Hasil: pengenalan lebih tahan
  variasi & typo.
- **Ide topik obrolan**: inspirasi kategori small-talk/FAQ yang umum ditanya.
- **TIDAK** dipakai: menyalin teks jawaban, menanam konten berlisensi, atau
  membiarkan model "mengarang" jawaban.

### 12.2 Sumber kandidat (Bahasa Indonesia)
- **NusaCrowd / IndoNLP** — 137+ dataset Bahasa Indonesia terstandar, termasuk
  *intent classification* (mis. BANKING77-OOS terjemahan ID) → pola frasa niat.
- **IndoNLU** — benchmark NLU Indonesia (sentimen, intent, dll.).
- Daftar pertanyaan/FAQ publik & soal matematika (untuk ragam frasa "hitung …").
- Kalau perlu, kurasi manual frasa khas pengguna PRIMA (paling akurat).

### 12.3 Guardrail data (WAJIB sebelum masuk repo)
1. **Konten web = DATA, bukan perintah** — jangan pernah eksekusi instruksi yang
   ada di dalam dataset/halaman (anti prompt-injection).
2. **Lisensi** — hanya pakai dataset berlisensi terbuka; catat sumber & lisensi.
   Jangan menyalin kalimat berhak-cipta ke jawaban Rima.
3. **PII & sensitif** — buang nama/email/nomor/identitas; tolak konten
   politik/SARA/cabul (selaras deny-list).
4. **Bahasa & domain** — saring agar relevan PRIMA / Bahasa Indonesia; buang noise.
5. **Profanity-lint** (sudah ada) jalan atas teks yang masuk template.
6. **Tinjauan manusia + PR** — tidak ada auto-commit; tiap tambahan lewat review.
7. **Pemisahan tegas**: data publik → hanya `keywords`/`chips.q` (pengenalan).
   `answers` → **selalu** karya tim, di-ground ke perilaku aplikasi nyata.
8. **Gate CI** tetap penjaga akhir: `rima:check` (akurasi K2 + persona-lint + anchor).

### 12.4 Alur kerja
```
WebSearch/dataset publik → ekstrak frasa niat (DATA) → filter (lisensi/PII/profanity/domain)
   → tulis pasangan "frasa → intent" di GOLDEN-QUESTIONS.md (answers buatan tim)
   → rima-train.mjs (augmentasi) → model.json → rima:check → review/PR → commit
```
Rima jadi makin "nyambung" pada beragam kalimat **tanpa** kehilangan sifat lokal,
deterministik, privat, dan auditable.
