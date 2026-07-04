# CONCEPT MASTER — RIMA v3 Data-Aware: Baca Data · Scan Narasi · Impor File (gabungan)

> Status: **DRAFT KONSEP** (belum diimplementasi). Lanjutan dari v2
> (`CONCEPT-rima-v2.md`). ⚠️ Fase ini **mengubah jati diri Rima secara
> fundamental** — dari "tahu cara pakai" menjadi "tahu isi datamu". Karena itu
> bagian KEAMANAN & AKSES di sini bukan pelengkap, tapi inti.
>
> **Dokumen ini menggabungkan 3 hal (keputusan user 2026-06-13):** (1) konsep
> data-aware Rima · (2) audit keamanan bot existing + safe-guard tambahan
> (G20–G34, temuan R1–R5) · (3) modul konkret pertama: **Import E-Anggaran/Kinerja**.
> Menggantikan `CONCEPT-import-kinerja-pendapatan.md` (kontennya pindah ke Bagian E).

## Daftar Isi
- **Bagian A — Visi & Fitur** (§0–§9): yang diminta · pergeseran pilar · Fitur A (Q&A data) · B (scan typo) · C (Lampirkan) · ketergantungan LLM · roadmap F6 · risiko
- **Bagian B — Pendalaman Desain** (§10–§16): ikat lesson L60/L61 · kontrak `/api/rima/*` · reuse infra · alur Lampirkan · guard G20–G23 · peta berkas · urutan eksekusi
- **Bagian C — Audit Bot Existing & Safe-guard** (§17–§18): temuan R1–R5 (semua FIXED) · safe-guard tambahan **G24–G31**
- **Bagian D — Keputusan Model Fitur C** (§19): **A′ "Rima pemicu Import native"** + guard **G32–G34** (menggantikan autofill/Model B)
- **Bagian E — Modul Pertama: Import E-Anggaran/Kinerja** (§20): mapping nyata (terverifikasi login) · Pendapatan bulanan · CRR via inject native · realisasi belanja (terpisah) · roadmap IK

---

# BAGIAN A — VISI & FITUR

---

## 0. Yang diminta

1. **Rima baca data per-aplikasi.** Contoh (BBA): *"data alkes A tahun 2024 berapa?"* → Rima jawab dari data nyata. Berlaku di tiap modul.
2. **Scan narasi (LKJIP).** *"cek apakah ada typo di narasiku"* → Rima menandai salah ketik / kalimat janggal.
3. **Tombol "Lampirkan".** Rima baca **Excel / PDF / Word**, lalu menanya *mau input apa* — mis. *"input realisasi keuangan bulan ini dari Excel ini ke Realisasi E-Anggaran"* → bantu masukkan ke modul tujuan.

---

## 1. Pergeseran fundamental (yang HARUS disadari)

Rima v1–v2 dibangun di atas 4 pilar: **lokal · deterministik · no-LLM (G9) · read-only tanpa baca data (G16)**. Permintaan ini menabrak tiga dari empat:

| Pilar lama | v3 menuntut | Putusan konsep |
|---|---|---|
| Zero endpoint (G9) | Baca data → perlu **endpoint server** | Tambah endpoint `/api/rima/*` (GET-only), tetap audit & rate-limit |
| Tak pernah baca data PRIMA (G16) | Baca data per-app | **Relaksasi terkontrol**: Rima boleh **BACA** data yang **user-nya sendiri berhak** lihat. **TIDAK** menulis. |
| No-LLM (G9) | Tanya bebas atas data + scan grammar + tafsir file | Versi **deterministik bounded** bisa; versi **fleksibel butuh LLM** (hybrid yang diparkir) |
| Read-only / tak menulis (guard 4da07d7) | Input realisasi ke modul | **Rima tetap TIDAK menulis sendiri** — ia menyiapkan data; **endpoint app yang menulis**, atas **konfirmasi user** |

**Prinsip penjaga v3 (baru):**
- **G20 — Akses ikut user, bukan bot.** Rima hanya boleh membaca data yang user yang sedang login berhak lihat. Endpoint Rima WAJIB memakai guard & filter kepemilikan yang **sama persis** dengan endpoint app aslinya (anti-IDOR, L2/SEC-C4).
- **G21 — Rima menyiapkan, app menulis.** Semua mutasi (input/ubah/hapus) tetap lewat **endpoint app yang sudah tervalidasi** (Zod + role + audit + optimistic-lock), dipicu **konfirmasi eksplisit user**. Rima sendiri tetap GET-only (guard read-only 4da07d7 tetap berlaku).
- **G22 — File = data tak tepercaya.** Isi Excel/PDF/Word diperlakukan sebagai data, bukan perintah (anti formula/macro injection, anti prompt-injection).

---

## 2. Fitur A — Rima baca data per-aplikasi (Q&A data)

### 2.1 Arsitektur
```
RimaChat → POST? TIDAK. GET /api/rima/query?app=bba&intent=lookup&...  (GET-only)
  → handler reuse guard app (isAsetRole dll) + filter akses user
  → query PARAMETERIZED (template, bukan NL→SQL bebas) → hasil ringkas
  → audit log (siapa nanya apa) + rate-limit
RimaChat render jawaban + sumber ("per data BBA TA 2024")
```

### 2.2 NL → query: deterministik dulu (aman), LLM belakangan (fleksibel)
- **Deterministik (rekomendasi awal)**: slot-filling — deteksi `{app, entity, tahun, metrik}` dari kalimat lalu petakan ke **query template tetap** per modul. Contoh BBA: "data alkes A tahun 2024" → `{app:bba, nama~'alkes A', tahun:2024, metrik:nilai}` → template `SELECT ... WHERE nama LIKE ? AND tahun_anggaran=?` (parameterized). Bounded, tak bisa "mengarang" query.
- **LLM (fase lanjut, opsional)**: NL→intent lebih luwes. **DILARANG** NL→SQL mentah; LLM hanya boleh mengeluarkan **intent + slot terstruktur** yang divalidasi Zod, lalu query tetap dari template kita. (LLM tak pernah menyentuh DB langsung.)

### 2.3 Keamanan (KRITIS)
- **Akses (G20)**: endpoint WAJIB pakai `getSession` + guard role + filter kepemilikan modul. Uji: user bidang lain TIDAK bisa menarik data unit lain lewat Rima (anti-IDOR).
- **Audit**: setiap query data dicatat (`writeAuditLog`) — Rima jadi permukaan akses, harus terjejak.
- **Rate-limit**: cegah pengerukan data massal lewat chat (mirip L39).
- **PII**: jangan tampilkan data pribadi di luar hak; ringkas seperlunya.
- **Tetap read-only**: hanya GET; tak ada mutasi.

### 2.4 Contoh
> User (di BBA): "alkes A tahun 2024 nilainya berapa?"
> Rima: "Aset *Alkes A* TA 2024: rencana Rp 150.000.000, realisasi Rp 120.000.000 (80%). Mau rinciannya? 👉" (chip Lihat baris)

---

## 3. Fitur B — Scan typo/janggal narasi (LKJIP)

- **Typo (deterministik, feasible & gratis)**: spell-check berbasis **kamus Bahasa Indonesia (KBBI wordlist)** — tandai kata tak dikenal + saran terdekat (Levenshtein, sudah ada di `fuzzy.ts`/`calc` pattern). Plus aturan ringan (dobel spasi, huruf kapital awal kalimat, tanda baca).
- **Tata bahasa / gaya (butuh LLM)**: "kalimat janggal", "perbaiki redaksi" → kualitas LLM jauh di atas rule. Sediakan sebagai tier opsional.
- **Read-only**: Rima **menandai & menyarankan**; user yang mengedit (lewat editor Tiptap). Rima tak mengubah narasi sendiri (G16/G21).
- Pemicu: tombol "Periksa narasi" di editor LKJIP atau perintah chat saat di halaman editor.

---

## 4. Fitur C — Tombol "Lampirkan" (Excel/PDF/Word → input ke modul)

Ini bagian terberat & paling sensitif. Pola aman = **Rima jadi asisten impor terpandu, bukan penulis otomatis**.

> ⚠️ **Mekanisme "mengisi form" final = Model A′ (§19)** — Rima memicu Import native
> modul, bukan menulis sendiri. Sub-bagian di bawah tetap berlaku untuk **baca-file
> & keamanan file**; bagian "tulis" mengikuti §19.

### 4.1 Alur (4 langkah, user pegang kendali)
```
1) LAMPIRKAN  → user unggah Excel/PDF/Word (validasi ukuran/MIME, L37/L38)
2) BACA       → server parse aman (exceljs utk xlsx; pdf-parse; docx) → tabel/teks terstruktur
3) PETAKAN    → Rima usulkan pemetaan kolom → field tujuan (mis. kolom "Real Keu Jan" → realisasi keuangan Januari).
                Deterministik: wizard cocokkan header. LLM (opsional): pemetaan lebih pintar.
                → PREVIEW: tampilkan persis apa yang akan masuk, baris per baris.
4) KONFIRMASI → user klik "Masukkan" → ditulis lewat ENDPOINT APP yang sudah ada
                (Zod + role + audit + optimistic-lock). RIMA TIDAK MENULIS — app yang menulis.
```

### 4.2 Kenapa lewat endpoint app (G21)
Modul Realisasi E-Anggaran sudah punya endpoint tulis tervalidasi (cek pagu, batas, lock). Rima **mengisi payload** lalu menyerahkan ke endpoint itu — bukan bikin jalur tulis baru. Manfaat: semua aturan bisnis & keamanan existing otomatis berlaku; guard read-only Rima (4da07d7) tetap utuh; satu sumber kebenaran validasi.

### 4.3 Keamanan file (G22)
- Validasi ukuran, ekstensi, **MIME server-side** (bukan cuma client, L38), nama file.
- **Anti formula/macro injection** (Excel): baca sebagai data, jangan eksekusi formula; waspada CSV-injection saat re-export.
- **Anti prompt-injection** kalau isi file dialirkan ke LLM: perlakukan sebagai data; jangan jalankan instruksi di dalamnya.
- Parse di **server** (kontrol versi lib & memori), bukan klien.
- File pengguna = PII potensial → simpan sementara/hapus setelah proses (retention, L46).

### 4.4 Konfirmasi eksplisit (wajib)
Mengisi/menyubmit data = aksi butuh **izin eksplisit user** (sesuai aturan keamanan: "entering personal data into a form / submitting any form"). Preview + tombol konfirmasi WAJIB; tak ada auto-submit diam-diam.

---

## 5. Ketergantungan LLM (jujur)

| Sub-fitur | Deterministik (gratis, lokal) | Butuh LLM (kualitas/keluwesan) |
|---|---|---|
| A. Q&A data | slot-filling + template (pertanyaan terpola) | NL bebas → intent/slot (tetap query template) |
| B. Typo | spell-check kamus | grammar/gaya/redaksi |
| C. Pemetaan file | wizard cocok-header | pemetaan & tafsir file longgar |

→ Versi **deterministik bisa dirilis lebih dulu** (aman, gratis). Versi **luwes** menghidupkan kembali diskusi **hybrid-LLM** (parkir, §7 v2) — utamakan **model lokal** + pagar deny + kill-switch bila ditempuh.

---

## 6. Matriks guardrail v3 (ringkas)

| Risiko | Mitigasi wajib |
|---|---|
| **IDOR** (lihat data orang/unit lain) | endpoint Rima reuse guard+filter app, uji role rendah (G20) |
| **Mass data scraping** lewat chat | rate-limit + audit (L39) |
| **Rima menulis tanpa izin** | G21: tulis lewat endpoint app + konfirmasi eksplisit; Rima GET-only (guard 4da07d7) |
| **File berbahaya / injection** | validasi MIME/size, parse server, anti formula/macro/prompt-injection (G22) |
| **Halusinasi angka** (kalau LLM) | angka SELALU dari query template/parser, bukan dari LLM |
| **Kebocoran lewat jawaban** | tetap G10 (tanpa path/tabel/endpoint), PII seperlunya |
| **Matikan saat insiden** | kill-switch (pola F4g) untuk fitur data/lampiran |

---

## 7. Roadmap berfase (paling aman dulu)

| Fase | Isi | Risiko | LLM? |
|---|---|---|---|
| **F6a** | Q&A data **read-only** per modul (slot-filling + template + guard akses + audit) | sedang (akses!) | tidak |
| **F6b** | Scan typo narasi LKJIP (kamus) | rendah | tidak |
| **F6c** | Lampirkan → parse Excel/PDF/Word → **preview saja** (belum tulis) | sedang (file) | tidak |
| **F6d** | Impor terpandu → tulis lewat endpoint app + konfirmasi | tinggi (mutasi) | opsional |
| **F6e** | Tier LLM luwes (Q&A bebas, grammar, pemetaan) — bila disetujui | tinggi | ya |

Mulai dari **satu modul** (mis. BBA Q&A) sebagai purwarupa, ukur akurasi & keamanan, baru perluas.

---

## 8. Dampak ke yang sudah ada
- **Guard read-only (4da07d7)**: tetap berlaku untuk kode Rima — Rima GET-only, tak `.click()`/mutasi. Endpoint baca baru = GET, lolos guard. Tulis = di endpoint app (di luar kode Rima). Jadi **tidak ada konflik**, tapi dokumentasikan bahwa "Rima boleh BACA via endpoint resmi" agar tak salah paham dengan "Rima tak baca data" lama.
- **G16 lama** ("tak baca data") → **diperhalus jadi G20** ("baca = ikut akses user; tulis = lewat app").

## 9. Risiko utama
- **Keamanan akses** = taruhan terbesar. Satu kebocoran IDOR lewat Rima = masalah audit serius. Wajib uji per-role sebelum rilis.
- **Scope creep**: "tanya apa saja atas data" tak terbatas → mulai dari pertanyaan terpola, jujur soal yang belum bisa.
- **Mutasi via file**: salah pemetaan kolom → data salah masuk. Preview + konfirmasi + validasi endpoint app = wajib, jangan dipangkas.

---

# BAGIAN B — PENDALAMAN DESAIN (grounded ke kode nyata)

> Bagian §1–§9 di atas = kerangka. Bagian ini menurunkannya jadi **siap-implementasi**:
> meng-ikat ke helper/guard yang SUDAH ada, menutup celah lesson terbaru, dan
> memberi kontrak endpoint + UI konkret. Tetap **konsep** (belum ada kode).

## 10. Pengikatan ke lesson keamanan TERBARU (wajib, sebelumnya belum di-cite)

§2–§4 menulis "reuse guard app" secara umum. Dua lesson **paling baru & paling
relevan** untuk permukaan baca-data ini WAJIB jadi tulang punggung G20/G21:

| Lesson | Inti | Implikasi WAJIB di Rima v3 |
|---|---|---|
| **L60** (IDOR via param) | Ownership data **diputuskan ROLE server-side**, BUKAN nilai param request. UI menyembunyikan opsi ≠ proteksi. | Endpoint `/api/rima/query` **DILARANG** menerima `?scope=` / `?unit=` yang melonggarkan filter. Batas akses dihitung dari `session.role` + helper kepemilikan modul (`isLowPriv ? created_by=me : ...`), persis pola `app/api/usulan/route.ts`. Param Rima hanya boleh **memilih bentuk** query (entity/tahun/metrik), tak pernah **melonggarkan** akses. |
| **L61** (missing fn-level authz) | `proxy.ts` **tidak** menjaga `/api/*` per-role — tiap route wajib guard sendiri; file download butuh authz **per-file**. | Tiap handler Rima WAJIB panggil guard modul (`isAsetRole`/`isLkjipRole`/`isPkRole`/`isKinerjaRole`…) **di baris pertama**, bukan cuma `getSession()`. Fitur C: file yang diunggah user hanya boleh dibaca-ulang oleh **pengunggahnya** (authz per-file, anti capability-URL). |

→ **Tambahan ke matriks §6**: baris "IDOR" sekarang ber-referensi **L60+L61** (bukan
hanya G20). Uji rilis: login akun low-priv → panggil `/api/rima/query` langsung
(curl/devtools) dengan slot melonggar → **harus tetap terbatas**.

## 11. Fitur A — kontrak endpoint konkret

```
GET /api/rima/query?app=<modul>&entity=<slug>&tahun=<YYYY>&metrik=<key>
  ── Edge/Node route (BUKAN di proxy.ts; route sendiri di app/api/rima/query/)
  1. session = getSession()            → 401 bila kosong
  2. guard modul (L61)                 → 403 bila role tak berhak app itu
  3. Zod.parse(slots)                  → 400 bila slot liar (L36 Zod sentral)
  4. rateLimit(userId,'rima-query',N)  → 429 (pola bbaRateLimit, L39/L43)
  5. ownership = fromRole(session)     → filter created_by/unit by ROLE (L60)
  6. SELECT … template parameterized   → array cap (mis. ≤ 50 baris, L39)
  7. writeAuditLog('RIMA_QUERY', {app,entity,tahun})  → silent-fail
  8. return ringkasan JSON (angka + label sumber), TANPA path/tabel/kolom (G10)
```

- **Satu route, dispatcher per `app`** → tiap modul punya `lib/rima/providers/<app>.ts`
  yang ekspor `{ guard, schema, templates }`. Provider reuse guard & helper modul
  yang sudah ada — **tidak menyalin** logika akses.
- **Server-side helper baru** minimal: `lib/rima/query.ts` (dispatch+audit+ratelimit
  wrapper). Klien (`RimaChat`) memanggil via `lib/shared/api.ts` (pisah fetch/.json,
  try/catch — aturan CLAUDE.md "Client fetch").
- **Catatan jati-diri**: ini endpoint **pertama** milik Rima. Guard read-only bot
  (4da07d7) tetap utuh — endpoint ini **GET-only** & tak pernah dioper setter form.
  Dokumentasikan eksplisit di `CONCEPT-sentinel-bot.md` G9/G16 bahwa "nol-endpoint"
  diperhalus jadi "hanya GET baca, ber-guard penuh".

### 11.1 Katalog slot→template (purwarupa BBA dulu)
Deterministik, parameterized, bounded (tak ada NL→SQL). Header kolom mengacu
`docs/schema-mysql.sql` (`buku_besar_aset`):

| Intent | Slot terdeteksi | Template (parameterized) | Jawaban |
|---|---|---|---|
| `bba.lookup-nilai` | entity(nama~), tahun | `WHERE nama LIKE ? AND tahun_anggaran=?` | rencana/realisasi/%/status |
| `bba.total-sumber` | sumber_anggaran, tahun | `SUM(nilai_realisasi) … GROUP BY sumber_anggaran` | total per sumber |
| `bba.status-count` | tahun | `COUNT … GROUP BY status` | rekap status |
| `bba.sisa` | entity, tahun | turunan server `rencana − realisasi` | sisa + aging |

Modul lain ikut pola sama, slot khasnya:
LKJIP→`{dokumen,tahun,section}` · Kinerja→`{ssk/realisasi,tahun,bulan}` ·
BLUD→`{versi,kode_besar}` · Usulan→`{no,status}` · PK→`{unit,tahun}`.
**Mulai 1 modul (BBA) sebagai purwarupa**, ukur akurasi+akses, baru perluas (§7 F6a).

## 12. Fitur B — scan typo: reuse yang sudah ada

- **Levenshtein sudah ada** → `lib/sentinel/fuzzy.ts` (dipakai NLU). Spell-check =
  tokenisasi narasi → kata tak-dikenal vs **wordlist KBBI** → saran jarak terdekat.
  Wordlist = aset statis di repo (G14, ikut `rima:check`), bukan endpoint.
- **Sumber teks** = payload blok NARASI LKJIP yang sudah ada; bersihkan dengan
  `sanitizeNarasiHtml` (`lib/lkjip/schemas.ts`) sebelum tokenisasi (jangan parse
  tag sebagai kata).
- **Read-only** (G16/G21): Rima **menandai** (daftar kata + saran + lokasi blok) +
  chip "Lompat ke blok"; **user** yang mengedit di Tiptap. Rima tak menyentuh narasi.
- Pemicu: tombol "Periksa narasi" di `editor-client.tsx` (pakai `<PrimaButton
  variant="ghost">` + DeleteIcon **tidak** relevan di sini) atau perintah chat saat
  di route editor. Deterministik & lokal → **tanpa endpoint** (beda dari Fitur A).

## 13. Fitur C — "Lampirkan": reuse pipeline upload (tulis → via Import native, §19)

> Catatan: judul lama menyebut "tulis lewat endpoint app". Putusan final (§19) =
> **Model A′**: tulis ke draft dilakukan **Import native modul** yang dipicu user,
> bukan endpoint tulis langsung dari Rima. §13.1/§13.3 (reuse upload & keamanan file)
> tetap; §13.2 alur digantikan §19.1.

### 13.1 Reuse yang sudah ada (jangan bikin pipeline baru)
- **`app/api/upload/route.ts`** sudah punya `sniffMime(buf)` (validasi MIME
  server-side, L38) + `sanitizeFilename` + size guard + Drive client. Fitur C
  **reuse** ini — tambah hanya endpoint **parse** (`/api/rima/parse`) yang membaca
  buffer terunggah → tabel/teks terstruktur (exceljs untuk xlsx, pdf-parse, docx).
- **Authz per-file (L61)**: hasil unggah hanya boleh diparse-ulang oleh pengunggah
  (`uploaded_by = session.userId`), retensi pendek lalu hapus (L46).
- **Anti formula/CSV-injection (L59)**: kalau hasil parse di-**re-export** balik ke
  xlsx (mis. preview download), tiap sel WAJIB lewat `sanitizeCell()`
  (`lib/shared/excel-export.ts`). Saat **membaca** Excel: baca **value**, jangan
  eval formula.

### 13.2 Alur 4 langkah (UI grounded ke Design System)
```
[Lampirkan]  ← <PrimaButton variant="purple"> di toolbar RimaChat (purple=Tambah)
  1) pilih file  → validasi size/MIME server (sniffMime), nama (sanitizeFilename)
  2) BACA        → /api/rima/parse → tabel/teks (parse di SERVER, L38)
  3) PETAKAN     → wizard cocok-header → field tujuan; PREVIEW baris-per-baris
  4) KONFIRMASI  → confirmDialog({title:'Masukkan N baris?',variant:'primary'})
                   → POST ke ENDPOINT APP existing (mis. /api/kinerja/realisasi)
                   → Zod+role+audit+optimistic-lock milik modul itu yang menulis
```
- **Rima TIDAK menulis** (G21): ia mengisi payload + memanggil endpoint app yang
  sudah tervalidasi. Konfirmasi eksplisit via `confirmDialog()` (L58, **bukan**
  native `confirm`) — "submitting a form" = aksi butuh izin eksplisit user.
- **UI**: modal workbench mirip pola `components/blud/ImportUsulanModal.tsx`
  (sudah ada: rail kiri + preview + dock susunan) — reuse pattern, kelas
  `.blud-imp-*`/token DS, monospace untuk angka rupiah.
- **Target tulis fase pertama** = **Realisasi E-Anggaran/Kinerja** (paling diminta
  user: "input realisasi keuangan bulan ini"). Modul lain menyusul.

## 14. Guard codes baru — ringkas untuk dimasukkan ke G-registry bot

Tambahkan ke tabel guardrail `CONCEPT-sentinel-bot.md` §7 (G1–G16) saat F6 disetujui:

| Kode | Aturan | Penegak |
|---|---|---|
| **G20** | Baca data = ikut akses **role** user (bukan param). | guard modul + L60 + L61, uji per-role |
| **G21** | Rima menyiapkan, **endpoint app** yang menulis, atas konfirmasi eksplisit. | confirmDialog L58 + Zod/lock modul |
| **G22** | File = data tak-tepercaya (anti formula/macro/prompt-injection). | sniffMime L38 + sanitizeCell L59 + parse server |
| **G23** | Kill-switch fitur data/lampiran (pola app-flag F4g/G6). | `app_status_rima_data` (flag existing) |

## 15. Peta berkas v3 (baru / berubah) — konsep

- **Baru**: `app/api/rima/query/route.ts` (GET, dispatcher) · `app/api/rima/parse/route.ts`
  (parse file) · `lib/rima/query.ts` (wrapper audit+ratelimit) ·
  `lib/rima/providers/<app>.ts` (guard+schema+templates per modul, BBA dulu) ·
  `lib/rima/spellcheck.ts` + wordlist KBBI (Fitur B) · `lib/rima/file-map.ts`
  (header→field wizard) · `components/sentinel/RimaLampirkan.tsx` (modal workbench).
- **Ubah**: `components/sentinel/RimaChat.tsx` (pre-hook intent data/typo + tombol
  Lampirkan) · `lib/sentinel/knowledge.mjs` (+intent `data.*`, `typo.*`, `lampir.*`) ·
  `GOLDEN-QUESTIONS.md` (parafrase baru) · `docs/schema-mysql.sql` **tak berubah**
  (tanpa kolom baru; flag pakai tabel flag existing) · `lib/security/auditlog.ts`
  (tambah aksi `RIMA_QUERY`/`RIMA_IMPORT` — JANGAN hapus try/catch silent-fail).
- **CI**: `rima:check` tetap; tambah uji akses per-role untuk `/api/rima/*`
  (harness pola `scripts/concurrency-test.js` → `scripts/rima-access-test.mjs`).

## 16. Rekomendasi urutan eksekusi (bila user setuju lanjut)

1. **F6a (BBA Q&A)** sebagai purwarupa tunggal — endpoint `/api/rima/query` +
   provider BBA + guard/role test. Ini yang membuktikan model akses aman.
2. **F6b (typo LKJIP)** — risiko rendah, tanpa endpoint, nilai cepat.
3. **F6c→F6d (Lampirkan→tulis)** — paling sensitif; preview dulu, tulis belakangan.
4. **F6e (tier LLM)** — hanya bila disetujui eksplisit; tetap angka dari template,
   LLM hanya untuk intent/parafrase (tak pernah menyentuh DB/angka).

> **Keputusan yang diminta dari user sebelum F6a ditulis**: (a) setuju Rima punya
> endpoint GET baca-data ber-guard (memperhalus "nol-endpoint")? (b) modul purwarupa
> = **BBA** (rekomendasi) atau lain? (c) versi awal **deterministik-only** (tanpa
> LLM) — setuju? Default rekomendasi: **ya / BBA / deterministik-only**.

---

# BAGIAN C — AUDIT BOT EXISTING & SAFE-GUARD TAMBAHAN

> Hasil audit verbatim seluruh kode bot existing (`lib/sentinel/*` +
> `components/sentinel/*`) sebagai prasyarat sebelum data-aware. Safe-guard
> tambahan §18 **diturunkan dari temuan ini** — bukan teori.

## 17. Hasil audit bot existing

### 17.1 Yang TERVERIFIKASI aman (boleh jadi fondasi v3)
| Klaim | Bukti di kode |
|---|---|
| **No-eval (G2/G17)** | `calc.mjs` murni shunting-yard + allow-list `FUNCS`; nihil `eval`/`new Function` di seluruh scope. Input di-cap 160 char, faktorial di-cap. |
| **Render XSS-safe (G4)** | `RimaChat` merender teks via **text node** React (`{m.text}` / `.slice`), bukan `innerHTML`/`dangerouslySetInnerHTML` (nihil di scope). Input cap 300. |
| **localStorage aman** | `profile.ts`/`dismiss-store.ts`: tiap `JSON.parse` di `try/catch` + **type-guard** + ring-buffer cap + TTL. Nilai dipakai sebagai data, tak pernah dieksekusi. |
| **Read-only (G1/G16)** | Provider tak pernah dioper setter form; aksi bot = `jumpToRow`/`scrollIntoView`/`locate` (baca DOM) + navigasi via `<Link>` yang **diklik user**. Ada guard tegas perintah "hapus". |
| **Nav anti open-redirect** | `nav.ts` href dari registri statis; alias regex meng-escape metakarakter. User text tak pernah jadi href. |
| **Network surface minimal** | **Tepat 2 GET**: `/api/admin/app-status` + `/api/user/access`. Nihil POST/beacon/WebSocket. `/api/user/access` **self-scoped** (`session.userId`). |
| **Anti-bocor (G10/G11)** | KB whitelist-by-construction; 13 intent `deny.*` (kredensial/data-orang/celah/politik/SARA/curhat). |
| **Deep-link `?rima-tour=`** | Disebut di konsep TAPI **belum diimplementasi** — tak ada sink `searchParams`→`querySelector`. (Aman: tak ada permukaan inject saat ini.) |

### 17.2 Temuan (semua LOW, tapi WAJIB ditutup sebelum/saat v3)
| # | Temuan | Sev | Dampak | Penutup | Status |
|---|---|---|---|---|---|
| **R1** | `/api/admin/app-status` GET hanya `getSession()` (semua user login baca). | LOW | Data cuma flag online/maintenance (non-sensitif), TAPI melanggar pola **L61** "tiap route gate by role". | Endpoint Rima v3 TAK boleh meniru pola ini → §18 G24/G31. | ✅ **FIXED** (2026-06-13): didokumentasikan eksplisit sbg authenticated-read sengaja (payload non-sensitif, dibutuhkan kill-switch/maintenance); output tetap whitelist `APP_KEYS`; mutasi tetap SUPER_ADMIN. Bukan vuln — design rationale dikunci di komentar route. |
| **R2** | `RimaTour` `querySelector(\`[data-rima="${anchor}"]\`)` interpolasi **tanpa** validasi. (`getElementById(prefix+rowId)` aman — bukan selector.) | LOW (laten) | Aman kini (anchor statis). Jadi bahaya bila v3 izinkan **id turunan data** (mis. "tunjuk baris alkes A"). | §18 **G28**. | ✅ **FIXED** (2026-06-13): `anchorEl` tolak id di luar `^[a-z0-9._:-]+$` sebelum querySelector. |
| **R3** | Konsep menyebut "nol-endpoint/G9" sbg baseline — sudah **tak akurat** (ada 2 GET di Provider). | INFO | Salah-paham desain. | Dokumentasikan surface nyata. | ✅ **FIXED**: surface nyata didokumentasikan di §11/§17.1. (`RimaChat` sendiri tetap nol-network — fetch hanya di `SentinelProvider`.) |
| **R4** | `logFailedQuestion` menulis **teks mentah** user (≤140) ke `rima:fail-log`. | LOW–MED (privasi) | Deny-list hanya menangkap niat **yang dikenali**; teks **tak dikenali** (justru tempat password/NIK salah-ketik mendarat) tetap tersimpan → langgar semangat **G13**. | §18 **G27**. | ✅ **FIXED** (2026-06-13): `lib/sentinel/redact.ts` `redactPii()` (NIK/telepon/email/kredensial → ▮) dipanggil sebelum persist fail-log. Siap dipakai ulang untuk tier LLM v3. |
| **R5** | `role` nav dari prop klien + `/api/user/access`. | INFO | Benar sebagai **info-hiding** (G3/G18), server tetap penegak. | Pertahankan; v3 baca-data TIDAK boleh bersandar ke ini (pakai role server di endpoint — L60). | ✅ **ACK by-design**: tetap info-hiding klien; G31 memastikan endpoint v3 pakai guard server, bukan prop ini. |

→ **Seluruh R1–R5 ditutup 2026-06-13** (R2/R4 perubahan kode; R1/R3/R5 dokumentasi/by-design). File tersentuh: `RimaTour.tsx`, `RimaChat.tsx`, `lib/sentinel/redact.ts` (baru), `app/api/admin/app-status/route.ts`.

## 18. Safe-guard TAMBAHAN untuk data-aware (G24–G31, audit-driven)

Melengkapi G20–G23 (§14). Ini lapisan yang membuat baca-data benar-benar aman:

| Kode | Safe-guard | Menutup | Inti |
|---|---|---|---|
| **G24** | **Intent allowlist, deny-by-default.** `/api/rima/query` hanya terima enum `{app,intent}` yang punya provider+template terdaftar; selain itu **400**. | R1 + scope-creep | Classifier TAK pernah menjangkau query tak-tervetting; tak ada passthrough generik. |
| **G25** | **Field allowlist per intent.** Tiap template deklarasikan kolom yang BOLEH keluar; serializer buang sisanya. | over-fetch / PII | Walau query salah-select kolom lain, respons tetap bersih (anti bocor PII). |
| **G26** | **Budget + anomaly throttle.** Selain rate-limit/menit: cap harian + detektor burst → soft-block + audit `RIMA_QUERY_ABUSE`. | mass-scraping (perkuat L39) | Chat tak bisa jadi alat keruk data massal. |
| **G27** | **Scrub PII sebelum persist/transmit.** Redaktor (NIK/telepon/email/digit-panjang/"password") jalan SEBELUM fail-log **dan** sebelum teks apa pun ke endpoint/LLM. | **R4** | Berlaku ke fail-log sekarang + tier LLM nanti. |
| **G28** | **Selector hardening.** Semua lookup `data-rima`/rowId via `CSS.escape` + tolak id di luar `^[a-z0-9._:-]+$`. | **R2** | Defense-in-depth saat v3 perkenalkan anchor turunan-data. |
| **G29** | **Import dry-run terisolasi.** Baris file TAK menyentuh endpoint tulis sampai: (a) lolos Zod target, (b) tampil preview, (c) `confirmDialog`. Worker parse **tanpa** kapabilitas DB/network; re-export lewat `sanitizeCell` (L59). | file injection (G22) | Pemisahan tegas baca-file ↔ tulis-modul. |
| **G30** | **Kill-switch granular + fail-CLOSED.** Flag terpisah `app_status_rima_query`/`app_status_rima_import` (bukan cuma flag bot global). **Beda dari G6**: gagal baca flag → endpoint data **503** (fail-closed), karena baca-data lebih berisiko daripada sekadar tampilkan avatar. | insiden | Matikan baca-data tanpa mematikan chat/tur yang aman. |
| **G31** | **Uji paritas guard di CI.** Tiap `lib/rima/providers/<app>.ts` WAJIB reuse **fungsi guard yang sama** dengan API modulnya; test CI mengimpor keduanya & membandingkan. | **R1/R5** + L60/L61 | Rima **secara struktural** tak bisa lebih longgar dari endpoint aslinya. |

### 18.1 Prinsip pembeda v3 (ditegaskan dari audit)
- **Bot existing = fail-OPEN** (avatar gagal → tetap tampil, aman). **Data-aware = fail-CLOSED** (ragu akses → tolak). Dua mode berbeda by design (G30).
- **Server adalah satu-satunya batas** (L60/L61). Semua di klien (role prop, deny-list, info-hiding) = UX/pencegah-salah-paham, **bukan** kontrol akses.
- **Angka selalu dari template/parser**, tak pernah dari LLM (anti-halusinasi) — bahkan di tier LLM (§7 F6e).

> Urutan: tutup **R4/R2** di kode existing (cepat, lepas dari v3) → terapkan G24–G31
> bersama F6a. G31 (uji paritas) ditulis **sebelum** provider pertama agar jadi
> pagar sejak baris pertama.

---

# BAGIAN D — KEPUTUSAN MODEL FITUR C: A′ (Rima pemicu Import native)

> Menggantikan ide **autofill langsung** (Model B). §4 & §13 di atas tetap berlaku
> untuk bagian baca-file & keamanan file, TAPI **mekanisme "mengisi form"** resmi
> memakai **Model A′** di bawah ini. Alasan: dapat UX "form terisi" yang diminta
> user **tanpa** melonggarkan jaminan read-only struktural Rima (G16).

## 19. Tiga model yang dipertimbangkan + putusan

| Model | Form terisi di layar? | Rima pegang setter form? | G16 struktural | Reuse UI teruji |
|---|---|---|---|---|
| **A** impor batch sisi-server | ❌ (tabel preview + konfirmasi) | ❌ | ✅ utuh | — |
| **B** autofill draft (ditolak) | ✅ | ⚠️ ya (draft) | ❌ dilonggarkan | ✗ jalur baru |
| **A′ pemicu Import native** ✅ **DIPILIH** | ✅ | ❌ | ✅ **utuh** | ✅ pola `ImportUsulanModal` |

**Putusan**: **A′**. Rima jadi **perantara tombol** — membuka fitur Import native
modul (yang sudah teruji) dengan file user ter-preload; **kode Import modul** yang
menulis ke draft, **user** yang Simpan. Rima **tak pernah** dioper setter form →
G16 tetap utuh, CI read-only (G1/G16) tetap hijau.

### 19.1 Alur A′ (5 langkah, kendali penuh di user)
```
1) LAMPIRKAN  → user unggah Excel/PDF/Word ke Rima (validasi size/MIME server, L38)
2) BACA+ANALISIS → server parse → Rima saring baris relevan ("realisasi bulan ini")
3) SARANKAN   → Rima render CHIP "Buka Import e-anggaran dgn file ini 👉"
                (G1: USER yang klik — bukan auto)
4) IMPORT NATIVE → modal Import modul terbuka, file ter-preload + baris terpilih →
                USER klik "Terapkan/Sisip" → FORM TERISI (draft) oleh kode MODUL
5) SIMPAN     → USER review → USER Simpan → Zod + modal + optimistic-lock modul jalan
```
Rima berhenti di langkah 3 (menyodorkan chip). Langkah 4–5 = UI native + aksi user.

### 19.2 Guard model A′
| Kode | Aturan | Penegak |
|---|---|---|
| **G32** | **Rima = launcher-only.** Rima hanya boleh: baca file, render chip, dan memanggil host `openNativeImport(source)` **atas klik user**. DILARANG dioper setter/onChange form atau fungsi Simpan. | Props bot tetap tanpa setter (cek CI read-only existing) + chip = `<button>`/`<Link>` yang diklik user (G1) |
| **G33** | **Yang menulis draft = kode Import modul, bukan Rima.** Fill draft terjadi di dalam modal Import native, dipicu tombol "Terapkan/Sisip" milik modal itu. | Reuse `ImportUsulanModal` pattern; tak ada jalur tulis baru di kode Rima |
| **G34** | **Sumber file unggahan = warga kelas satu di Import, lewat validasi yang sama.** Baris dari Excel/PDF/Word masuk preview Import yang sama dengan sumber internal → Zod + sanitize (L59) + Sentinel Guard anti-dobel tetap berlaku. | Ekstensi Import modul terima `source: 'upload'`; parser server (G22/G29) |

### 19.3 Prasyarat jujur (effort per modul)
- Import native sekarang menarik dari **sumber internal** (mis. Usulan), **belum**
  dari file unggahan → tiap modul tujuan perlu jalur Import **`source:'upload'`**
  (server parse → preview/apply yang sama).
- Modul **tanpa** fitur Import (mis. Realisasi E-Anggaran/Kinerja) → fitur Import-nya
  **dibangun dulu** (pola `ImportUsulanModal`), baru Rima bisa memicunya.
- "Kecerdasan" Rima di A′ = **pilih file → saring baris tepat → buka Import yang
  benar**, bukan mengetik bebas ke field sembarang. File rapi-berkolom =
  deterministik; file berantakan = tier LLM (§7 F6e, angka tetap dari file).

### 19.4 Dampak ke roadmap
- **F6c** (§7) jadi: parse file → preview → **chip "Buka Import native"** (bukan
  tulis). **F6d** jadi: ekstensi Import modul terima `source:'upload'` (G34) — modul
  pertama mengikuti yang punya/diberi Import lebih dulu (BLUD DPA sudah punya pola).
- **B/G-autofill dibatalkan** — tidak ada pelonggaran G16. Hapus referensi autofill
  bila muncul di draft lain.

---

# BAGIAN E — MODUL PERTAMA: IMPORT E-ANGGARAN/KINERJA

> Instansiasi konkret pertama Model A′ (sesudah BLUD). Sumber: bedah 3 file Excel
> RAKOR April 2026 + `lib/data/kinerja.ts` + `docs/schema-mysql.sql` + **verifikasi
> login langsung** (superadmin, 2026-06-13). **Inti yang diminta user: mengisi
> realisasi keuangan per bulan.**

## 20. Import E-Anggaran — model nyata (terverifikasi UI)

### 20.1 Keputusan ruang lingkup (user 2026-06-13)
1. **Pendapatan (Section 1) = 12 baris PER-BULAN** (`Bulan | Target | Realisasi |
   Capaian% otomatis`) — **bukan** per-kode-rekening. Impor = isi **Realisasi (+Target)
   bulanan**. → **prioritas (IK-1)**, *"hanya mengisi realisasi per bulan dahulu"*.
2. **CRR TIDAK dihitung/diimpor Rima.** Section 2 sudah punya **tombol inject
   per-bulan** (auto-isi Belanja BLUD & Daerah dari menu Realisasi) + Pendapatan
   otomatis dari Sec.1 + CRR Parsial/Total otomatis. Rima cukup **mengarahkan ke
   tombol itu** setelah belanja & pendapatan terisi. (Ide hitung-CRR-dari-3-file
   **DIBATALKAN**.)
3. **Realisasi belanja** (per-sumber, kolom **Real Keuangan** per bulan, baris dari
   "Init dari SSK") = **dibahas terpisah** (rumit: cocokkan uraian Excel ↔ keterangan
   SSK tiap tab sumber). → **IK-4**.

### 20.2 Sumber data (3 file Excel — dibedah)
| File | Sheet | Isi | Peran |
|---|---|---|---|
| **Laporan Pendapatan Bulanan 2026** | `apr26` dst | Penerimaan PAD per kode rekening + **kolom bulanan** | **Pendapatan** (ambil total/bulan) |
| **Laporan_BLUD2026** | `Jan…April 2026` | Realisasi belanja BLUD per rekening | (lanjut) Realisasi BLUD / sumber CRR via inject |
| **4.Realisasi APBD APR 2026** | `APR 2026` | Realisasi belanja APBD (SPM-LS/GU) | (lanjut) Realisasi belanja / sumber CRR via inject |

> ⚠️ **Parsing**: banyak sel **formula** → baca `cell.result` (bukan rumus); header
> **merge** multi-baris → deteksi baris-data via pola **kode rekening** (`^\d(\.\d+)+`),
> bukan nomor baris tetap; **bulan** dari judul sheet ("BULAN : APRIL 2026").

### 20.3 Target di aplikasi (model data nyata)
| Menu | Tabel | Kolom kunci |
|---|---|---|
| **Pendapatan** (Sec.1) | `kinerja_pendapatan_real` | `keterangan`(=bulan)`, target, realisasi, capaian_pct`(otomatis); save replace-all per tahun |
| **CRR** (Sec.2) | `kinerja_pendapatan_crr` | per bulan: `belanja_blud/daerah` (input/inject) + `*_sd`+`crr_*` (otomatis) |
| **Realisasi belanja** | `kinerja_realisasi` | per `sumber`, `keterangan`(dari SSK), **`real_keuangan`**, `real_fisik`; turunan server; lock V3-6 |

Endpoint tulis **existing** (reuse — A′/G33, Rima tak bikin jalur baru):
`PUT /api/kinerja/pendapatan` (`PendapatanBodySchema`, guard `isKinerjaRole`, rate-limit
30/mnt, audit) · `PUT /api/kinerja/realisasi` (`RealisasiBodySchema`, lock V3-6) ·
`GET /api/kinerja/pendapatan/belanja-auto` (sumber tombol inject CRR).

### 20.4 Pemetaan Pendapatan bulanan (Excel → Section 1) ✅ PRIORITAS
| Field app (per bulan) | Dari Excel | Aturan |
|---|---|---|
| `realisasi` | **Penerimaan <bulan>** (kolom incremental) baris **PAD (4.1)** | angka; **bukan** s/d (app akumulasi sendiri) |
| `target` | **Anggaran** ÷ 12 atau dibiarkan diisi user | konfirmasi di preview |
| `capaian_pct` | — | **otomatis** di app (jangan diimpor) |
| baris bulan | judul sheet ("APRIL") | tentukan bulan ke-N |

Multi-sheet (Jan..Apr) → isi beberapa bulan sekaligus.

### 20.5 CRR = tombol inject native (bukan impor)
`autoFillBelanja(bulan)` → `belanja-auto` menarik `SUM(real_keuangan)` dari
`kinerja_realisasi`; Pendapatan ikut Sec.1; s/d & CRR otomatis. Peran Rima: setelah
belanja & pendapatan terisi → *"CRR-nya tinggal klik Auto-isi tiap bulan 👉"* (atau
A′: Rima picu tombol atas klik user). **Tanpa hitung/impor CRR.**

### 20.6 Pencocokan cerdas
- **Kode rekening** jangkar utama; **uraian fuzzy** (reuse `lib/sentinel/fuzzy.ts`) untuk
  IK-4 (cocok ke keterangan SSK), tampilkan skor di preview.
- **Angka**: `cell.result` → `parseNum` (pola `calc.mjs`), format ID `1.234,56`.
- **Baris non-data** (judul/total seksi/NIP) dibuang via filter pola.

### 20.7 Alur (Model A′)
```
1) LAMPIRKAN  → user unggah file ke Rima
2) BACA       → server parse (exceljs, .result) → baris terstruktur
3) ANALISIS   → Rima deteksi jenis (Pendapatan/BLUD/APBD) + petakan ke bulan/field
4) SARANKAN   → chip "Buka Import Pendapatan dgn file ini 👉" (USER klik — G1)
5) IMPORT NATIVE → modal Import (HARUS DIBANGUN) preload + preview 12 bulan; user "Terapkan"
6) SIMPAN     → user Simpan → PUT /api/kinerja/pendapatan (Zod+guard+lock+audit)
```
**Prasyarat (jujur)**: Kinerja **belum punya Import** (hanya export
`exportRealisasiExcel`). Wajib **bangun dulu** modal Import native (pola
`components/blud/ImportUsulanModal.tsx`); baru Rima jadi pemicunya (A′/G34).

### 20.8 Keamanan (reuse pagar Bagian B–D — tak ada yang baru-berbahaya)
| Aspek | Penegak |
|---|---|
| Akses | `isKinerjaRole`+`hasAppAccess` (sama endpoint asli) — **G31 paritas**, L60/L61 |
| Rima read-only | launcher-only **G32**; yang menulis = endpoint Kinerja existing **G33** |
| File tak tepercaya | parse server, baca value bukan formula, MIME/size (L37/L38), `sanitizeCell` re-export (L59) — **G22/G29** |
| Tulis | PUT existing: Zod, rate-limit, audit, lock V3-6 |
| Konfirmasi | preview wajib + "Terapkan" + Simpan user (**G21/G29**) — tanpa auto-submit |
| Angka | dari parser/server, **bukan LLM** (anti-halusinasi) |
| Kill-switch | `app_status_rima_import` **fail-closed (G30)** |

### 20.9 Risiko & mitigasi
- **Format Excel tak stabil** → deteksi kolom by nama header + jangkar kode rekening;
  preview "kolom X → field Y" agar user koreksi.
- **Sel formula null** → tandai "perlu dihitung ulang", jangan tulis 0 diam-diam.
- **Pendapatan replace-all per tahun** → preview total sebelum/sesudah agar user sadar.
- **Salah cocok uraian** (IK-4) → tampilkan skor fuzzy, user edit sebelum Simpan.

### 20.10 Roadmap IK
| Fase | Isi | Risiko |
|---|---|---|
| **IK-1** ✅ **IMPLEMENTED (2026-06-13)** | Import native Pendapatan bulanan: `lib/data/kinerja-import.ts` (parser PAD 4.1, baca `cell.result`, terverifikasi pd file RAKOR April) · `app/api/kinerja/pendapatan/import/route.ts` (POST parse, guard `isKinerjaRole`+MIME L38+rate-limit, read-only) · `components/kinerja/ImportPendapatanModal.tsx` (unggah→preview→Terapkan) · tombol "Import Excel" di `PendapatanCrrTab` Section 1. **Scope: isi REALISASI bulanan saja** (target dibiarkan); tidak menyimpan — user klik Simpan (Model A′). | sedang |
| **IK-2** ✅ **IMPLEMENTED (2026-06-13)** | Rima **pemicu** Import Pendapatan: intent `kin.import-pendapatan` (`knowledge.mjs`+golden) → chip link **`/kinerja?import=pendapatan`** (RimaChip `href`, Rima render `<Link>`, user klik — guard READ-ONLY tetap bersih, no dispatch) · `kinerja-client` baca `?import` (`useSearchParams`) → buka tab Pendapatan + `autoOpenImport` → `PendapatanCrrTab` buka modal sekali. Live-verified: tanya Rima → chip → modal kebuka. | sedang (akses) |
| **IK-3** ✅ **IMPLEMENTED (2026-06-13)** | Rima **mengarahkan CRR**: intent `kin.belanja-auto` (sebelumnya direferensi golden tapi tak terdefinisi — kini ada) → jelaskan urutan (realisasi belanja → pendapatan → buka CRR → klik Auto-isi → Simpan) + chip link `/kinerja?tab=pend-crr` (kinerja-client generalisasi `?tab=`). **Tanpa hitung/impor CRR** — pakai tombol inject native. Live-verified. | rendah |
| **IK-4** ✅ **IMPLEMENTED (2026-06-14)** | Import **Realisasi belanja**: parser all-leaf + matcher fuzzy `keterangan` lintas sumber (`kinerja-import.ts`/`kinerja-match.ts`) → endpoint `realisasi/import` (match + save-peta) + tabel `kinerja_realisasi_map` → modal **ber-tab per sumber** (`ImportRealisasiModal`) → apply draft di `RealisasiTab` → user Simpan → trigger Rima `kin.import-realisasi`. **Peta tersimpan = YA**, **LLM = mati**. Live round-trip terverifikasi vs DB nyata. | tinggi |
| **IK-5** (opsional) | tier LLM untuk file berantakan (mapping saja; angka dari file) | tinggi |

Mulai **IK-1**; CRR ikut otomatis lewat tombol native (IK-3); realisasi belanja (IK-4)
diskusi terpisah.

---

## 21. Verifikasi & status
Bagian E berbasis **kode + schema + bedah 3 Excel nyata + login langsung** (superadmin):
Realisasi (per-sumber, kolom Real Keuangan/bulan, "Init dari SSK") & Pendapatan&CRR
(Sec.1 12-bulan; Sec.2 inject belanja + CRR otomatis). **Tidak ada kode aplikasi yang
diubah** sepanjang Bagian E — murni konsep. Perbaikan kode yang SUDAH dilakukan hanya
penutupan temuan audit **R2/R4** (Bagian C) di kode Rima existing.

---

## 22. Detail IK-4 — Import Realisasi Belanja (match-by-keterangan, modal per-tab)

> Status: **KONSEP FINAL** (keputusan user 2026-06-13), belum diimplementasi.
> Sumber: bedah file APBD + BLUD RAKOR April + schema `kinerja_ssk`/`kinerja_rekening`.

### 22.1 Realita data (terverifikasi)
- File belanja **bisa multi-sumber dalam 1 file**: `4.Realisasi APBD APR 2026.xlsx`
  punya ≥2 blok program dipisah header **DPA** (`00242/DPA/2026 …16.01…` = Gaji ·
  `00244/DPA/2026 …16.05…` = Barang/Jasa = **Promkes**, per user). Bisa juga datang
  sebagai file **multi-sheet** (1 tab/sumber, mirip menu Realisasi).
- Realisasi bulan-ini: APBD = kolom "Bulan Ini SPM-LS (+GU)"; BLUD = "Real Bulan Ini".
  1 sheet = 1 bulan; baca `cell.result`; bulan dari judul sheet.
- **App TIDAK simpan kode rekening** (`kinerja_ssk`/`kinerja_rekening` hanya punya
  `uraian`/`uraian_ssk`, tanpa kolom kode 5.x) → tak ada jangkar kode → **pencocokan
  WAJIB by-keterangan**.

### 22.2 Inti desain (keputusan user)
- **Kunci match = kolom `keterangan`** di semua tab Realisasi (per sumber), dicocokkan
  ke uraian Excel **fuzzy — mirip makna, tak harus 100% persis**.
- **Routing sumber OTOMATIS**: baris Excel nyangkut ke tab sumber milik SSK yang cocok
  (tak perlu peta DPA→sumber manual; sumber = milik SSK pemenang match).
- **Hasil disajikan modal ber-TAB per sumber** (GAJI·BLUD·HARLEP·PROMKES·OBAT…), tiap
  tab = tabel match `[keterangan Excel] → [keterangan SSK] · skor · Realisasi · status`
  (✓ cocok · ~ mirip beda kata · ✗ belum) untuk user periksa "sesuai/tidak" per tab.
- **Peta tersimpan = YA** (impor tiap bulan → hemat tenaga): cocokan yang dikonfirmasi
  user disimpan → bulan berikutnya **auto-cocok**, tinggal periksa.
- **LLM = MATI** (lokal dulu): fuzzy deterministik + koreksi manual. Paraphrase jauh
  ditandai `~`/`✗`. LLM = tier opsional belakangan (hanya usul pasangan; **angka tetap
  dari Excel**, tetap dikonfirmasi user).

### 22.3 Alur
```
1) UNGGAH    1+ file belanja (APBD/BLUD), boleh multi-blok DPA / multi-sheet
2) BACA      server parse → SEMUA baris leaf: { keterangan, realisasi bln-ini }
3) ANALISIS  tarik SEMUA SSK app (semua sumber, tahun aktif; tiap SSK tahu sumbernya)
             + terapkan PETA tersimpan dulu → sisanya fuzzy-match by keterangan (skor)
             → sumber baris = sumber SSK pemenang (routing otomatis)
4) MODAL     hasil dikelompokkan PER TAB SUMBER; user review/ubah/lepas/jumlah(many→1)
             → konfirmasi disimpan ke peta (keterangan Excel → ssk_canonical_id)
5) TERAPKAN  isi real_keuangan draft per SSK (per sumber) — BELUM simpan
6) SIMPAN    user Simpan tiap sumber → PUT /api/kinerja/realisasi (Zod + lock V3-6)
```

### 22.4 Infra baru (kenapa IK-4 = fase berat, vs IK-1)
- Parser **all-leaf section-aware**: kumpulkan semua baris lintas blok DPA / sheet +
  realisasi bln-ini → perluasan `lib/data/kinerja-import.ts`.
- **Matcher** fuzzy keterangan (reuse `lib/sentinel/fuzzy.ts` + normalisasi + kamus
  sinonim) + skor + ambang.
- **Tabel peta baru** `kinerja_realisasi_map` (`tahun, sumber, keterangan_excel,
  ssk_canonical_id`, UNIQUE `(tahun,sumber,keterangan_excel)`) — saat implementasi
  **WAJIB** tambah ke `docs/schema-mysql.sql` + `docs/migrations/migration-*.sql`.
- Komponen **modal ber-tab per sumber** (lebih berat dari modal IK-1).

### 22.5 Keamanan (reuse pagar v3)
guard `isKinerjaRole` (G31 paritas, L60/L61) · parse di server (G22) · tulis lewat
**PUT realisasi existing** (Zod + optimistic-lock V3-6, G33) · preview + konfirmasi +
Simpan user (A′/G21/G29) · **angka dari parser, bukan LLM** · kill-switch
`app_status_rima_import` fail-closed (G30).

### 22.6 Purwarupa (urutan aman)
Mulai **1 tab — GAJI (blok APBD)**: buktikan akurasi fuzzy keterangan + alur review →
aktifkan **semua tab** + **peta tersimpan** → terakhir **BLUD multi-sumber**. Trigger
Rima (chip "Buka Import Realisasi") menyusul pola A′ (IK-2).

---

## 23. Lampirkan di chat Rima (📎) — Opsi A "RAM-only" + hardening XSS

> Status: ✅ **IMPLEMENTED (2026-06-14)** — Opsi A RAM-only, end-to-end (keputusan user 2026-06-14).
> Melengkapi A′: selain "Rima pemicu", user juga bisa **melampirkan Excel langsung di
> obrolan Rima**, Rima **membaca** lalu **bertanya mau dimasukkan ke mana**.

### 23.1 Inti & kenapa tetap aman (G16 utuh)
Rima **hanya BACA file + ANTAR** ke modul — **tidak menulis**. File diparse di server
(read-only), Rima tampilkan ringkasan + chip; yang menulis tetap **modal native +
PUT + user Simpan**. Jadi "lampirkan di chat" **TIDAK** melonggarkan G16 (beda dari
autofill/Model B yang ditolak). Ini layer tipis di atas IK-1/IK-4.

### 23.2 Alur
```
📎 user lampirkan Excel di chat Rima
 → upload ke endpoint PARSE (read-only): file di-buffer RAM server → parse → buang
   (TIDAK ditulis ke disk/DB/Drive; exceljs baca dari buffer, tanpa file temp)
 → DETEKSI jenis (PAD 4.1 = Pendapatan · belanja 5.x leaf = Realisasi Belanja)
 → Rima balas di chat (ringkasan) + chip [Masukkan ke Realisasi Belanja →] / [Pendapatan →]
 → klik chip → modal Import native KEBUKA preloaded (tak unggah ulang) → review per tab
 → user Terapkan → user Simpan
```

### 23.3 Privasi — file & hasil parse (keputusan user)
- **File mentah**: hangus seketika (parse di RAM server, dibuang). Nol persistensi.
  (Beda dari `/api/upload` yang sengaja menyimpan lampiran/arsip — Lampirkan TIDAK pakai itu.)
- **Hasil parse**: **Opsi A — RAM browser** (bukan server). Disimpan di **memori JS
  (context di lapisan Rima)**, bukan sessionStorage → **tak nongol di DevTools/Storage
  inspector**; hilang saat dipakai / refresh / tab ditutup. **Nol server** (Redis hanya
  dipakai bila kelak butuh; di server kantor itu lokal + TTL auto-expire).

### 23.4 Hardening XSS (teks Excel = tak tepercaya)
| Lapis | Penjaga | Status |
|---|---|---|
| Sanitasi di SUMBER (belanja) | `sanitizeImportText()` di `kinerja-import.ts`: buang kontrol C0/C1, zero-width (200B-200F), **bidi override/isolate (202A-202E, 2066-2069 — anti Trojan-Source CVE-2021-42574)**, line/para-sep, BOM; cap 300. Dipakai parser belanja: `keterangan` + `source`. | ✅ **IMPLEMENTED + live-verified** |
| Sanitasi di SUMBER (pendapatan) | **Audit finding** — `source` (memuat `sheetName` tak tepercaya) + `warnings` di parser pendapatan/belanja semula belum disanitasi → kini disanitasi (`sName = sanitizeImportText(sheetName)`). Live-test sheet bidi `Pend‮​x` → output `Pendx` (0 codepoint berbahaya). | ✅ **FIXED (audit 2026-06-14)** |
| Nama file (client) | **Audit finding** — fileName (input user) ditampilkan di chat + modal; semula hanya strip CRLF. Kini filter codePoint (kontrol/zero-width/bidi) + cap 120 di `RimaChat`. Tetap React-escaped. | ✅ **FIXED (audit 2026-06-14)** |
| Render | React **text-node** (no `innerHTML`/`dangerouslySetInnerHTML`) → HTML otomatis ter-escape. **Live-verified**: payload `<script>alert(1)</script>` di sel modal → tampil sbg teks literal, `scriptElementCreated:false`. | ✅ (pola existing, diaudit + dibuktikan) |
| Script injection | **CSP nonce per-request** (`proxy.ts`) | ✅ existing |
| Storage | **RAM-only** (`lib/sentinel/lampir-store.tsx` — React context + useRef, no sessionStorage/localStorage) → tak ada sink storage | ✅ **IMPLEMENTED** |
| Audit mendalam XSS | **SELESAI 2026-06-14** — telusur semua sink (cell→keterangan/source, sheetName→source/warnings, fileName, DB round-trip peta). 2 finding (pendapatan source/warnings + fileName) **difix**; sisanya sudah aman. Live-verified end-to-end. | ✅ **DONE** |

### 23.5 Guardrail keamanan (recap)
G16 (Rima baca+antar, tak menulis) · G22 (file: parse server, baca nilai bukan rumus,
MIME magic-number L38, `sanitizeCell` re-export L59) · G20/G31 (guard `isKinerjaRole`,
hanya modul yang berhak) · L61/L46 (file owner-scoped sesaat, lalu hapus) · L39
(rate-limit unggah) · G27 (scrub PII sebelum log) · G30 (kill-switch fail-closed) ·
konfirmasi eksplisit (tak ada auto-submit) · G12 (file tak dikenal → jawab ramah).

### 23.6 Implementasi (SELESAI 2026-06-14)
- ✅ **RAM context store** `lib/sentinel/lampir-store.tsx` (`LampirProvider`+`useLampir`):
  `set`/`take`(konsumsi sekali)/`clear`; dipasang di `app/(dashboard)/layout.tsx`
  **di atas** `SentinelProvider` (RimaChat) **dan** children (modul tujuan) → bertahan
  lintas-navigasi SPA, hilang saat refresh/tab-close. Bukan storage.
- ✅ **📎 di `RimaChat`** (`.rima-attach`): unggah `read-only` → `/api/rima/lampir`;
  guard read-only Rima tetap bersih (cuma BACA+ANTAR, tak dispatch tulis).
- ✅ **Endpoint detect+parse** `app/api/rima/lampir/route.ts`: guard `isKinerjaRole` +
  rate-limit + MIME magic-number; deteksi belanja(leaf)→`realisasi` else PAD→`pendapatan`;
  reuse helper bersama `lib/data/kinerja-import-match.ts` (`buildRealisasiImport`, dipakai
  juga oleh `/api/kinerja/realisasi/import` agar tak drift) + `parsePendapatanBuffer`.
  **File dibuang** (buffer RAM, nol persistensi).
- ✅ **Modal Import terima preloaded** (`preload`/`preloadName` di `ImportRealisasiModal`
  & `ImportPendapatanModal`) → tab `RealisasiTab`/`PendapatanCrrTab` `take()` stash saat
  `?import=...` → modal langsung tampil tanpa unggah ulang.
- ✅ **Balasan Rima + chip rute** (`href=/kinerja?import=realisasi|pendapatan`, `<Link>`,
  user klik). Ringkasan: jumlah baris/bulan + cocok.

> **Verifikasi:** `tsc` clean · semua route compile tanpa error (dev) · path parse/match
> identik dengan IK-1/IK-4 yang sudah live-verified (helper diekstrak, output shape sama).
> **Sisa:** audit XSS mendalam (§23.4, dijadwalkan user) — kini siap dijalankan.

---

## 24. Slot-filling kaya (#3) + proaktif lintas-modul (#4) + rollout 7 provider — SELESAI 2026-06-16

Lanjutan rekomendasi #1–#4 ("agar Rima lebih canggih"). #1 (multi-modul) & #2 (fail-log
mining) sudah jalan; bagian ini mengunci #3 (slot kaya), #4 (proaktif), dan rollout
provider ke seluruh modul. Semua tetap **no-LLM** (G9), **read-only** (G16), angka dari
template (anti-halusinasi), guard berlapis (G24/G25/G26/G30/G31), ownership di provider (L60/G20).

### 24.1 Intent baru per modul
| Intent | Arti | Modul | Catatan keamanan |
|---|---|---|---|
| `rekap` | hitung per status/dimensi + total | semua 7 | sudah ada, dipertahankan |
| `lookup` | cari 1 entitas by nomor/kode | usulan, bba, lkjip | ownership tetap menempel → no milik orang lain = "tak ketemu" (anti-enumeration) |
| `top` | top-N nilai terbesar (`topn` clamp 1–10) | usulan, bba | `ORDER BY nilai DESC`; ownership menempel |
| `tren` | count/nilai antar-tahun | usulan, bba, pk, lkjip | `GROUP BY tahun` |
| `inbox` | jumlah "menunggu AKSI role ini" | usulan, bba, pk, lkjip | **status inbox dari `session.role` server**, bukan klien |

PK tanpa `top` (tak ada nominal moneter di `pk_dokumen`). BLUD/Kinerja/Rencana Aksi
hanya `rekap` (data versioned/hierarkis, tak ada status-alur → `inbox` mengembalikan 0).

### 24.2 #4 — peta status "inbox" (menunggu aksi) per role
Mengikuti alur status nyata tiap modul (bukan tebakan):
- **Usulan**: ADMIN→`DIAJUKAN` · ADMIN_KASUBAG→`DITELAAH` · ADMIN_KABAG→`DIPROSES` ·
  BIDANG_*→`DIAJUKAN_REVIEW` · sub-bidang→`REVISI_BIDANG` · SUPER_ADMIN→semua non-final.
- **BBA**: `DIRENCANAKAN` (menunggu realisasi). **PK/LKJIP**: `DRAFT` (menunggu finalisasi).
- Ownership frag tetap **intersect** dengan status-inbox → aman (tak melonggarkan akses).

### 24.3 #4 — "Tugasku" lintas-modul (`/api/rima/summary`)
Endpoint baru: loop `RIMA_PROVIDERS` yang **boleh diakses user** (`hasAppAccess`), panggil
`provider.inbox(role,userId)` (ownership di tiap provider), agregasi count "menunggu aksi".
Guard identik `/api/rima/query` (session → kill-switch fail-closed G30 flag tunggal →
rate-limit G26 **kuota dibagi** → audit `RIMA_QUERY`). Klien: "apa tugasku" tanpa sebut
modul → summary; sebut modul → inbox modul itu. Modul `count=0` disembunyikan di UI.

### 24.4 Registry 7 provider (cetakan seragam)
`lib/rima/registry.ts` `RIMA_APPS = [usulan, bba, pk, lkjip, blud, kinerja, rencana_aksi]`.
Tiap `RimaProvider` = `{ title, isRole, dispatch, inbox }`. Menambah modul = **1 file
provider + 1 baris registry** → keamanan otomatis seragam (G31), tak ada route-drift.
Server (`RIMA_APPS`) & klien (`RimaApp` di `data-query.ts`) di-sinkron manual.

**Paritas ownership (WAJIB saat tambah/ubah provider):** baca route GET modul aslinya.
Modul admin (BBA/LKJIP/BLUD/Kinerja/RencanaAksi) = **tanpa ownership-per-baris** (guard
role cukup, cermin `listAset`/`listDokumen` yang tak terima `userId`). Modul ber-kepemilikan
(Usulan = stage per role; PK = `created_by` kecuali admin) = ownership-where WAJIB cermin
route. ⚠️ Bila route menambah filter per-user kelak, provider WAJIB ikut.

### 24.5 Roadmap terukur lanjutan (urut leverage × risiko)
| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | `top`/`tren`/`inbox` BBA & PK | ✅ DONE | PK tanpa top |
| 2 | Summary lintas-modul | ✅ DONE | `/api/rima/summary` |
| 3 | Provider LKJIP/BLUD/Kinerja/RencanaAksi | ✅ DONE | rekap; LKJIP penuh (lookup/tren/inbox) |
| 4 | Panel admin `rima_unanswered` | ✅ DONE | tab "RIMA FEEDBACK" (SA-only via `/admin`) |
| 5 | `top`/`tren` RencanaAksi (anggaran) + `tren` Kinerja | ✅ DONE | RA top by `anggaran_nominal`; Kinerja/LKJIP tanpa top (tak ada nilai per-baris) |
| 6 | Slot per-bidang (admin) & banding 2 tahun eksplisit | ⏳ TODO | perluas `UsulanSlotSchema`, allowlist G24/G25 |
| 7 | Auto-pull KB dari `rima_unanswered` → saran intent baru | ⏳ TODO | semi-manual, admin approve |
| 8 | (Keputusan besar) Tier LLM ber-pagar | ⛔ TAHAN | tabrak G9; angka tetap template; PII redact dulu |

### 24.5b Kill-switch DUA tingkat (UI Admin Panel → APP CONTROL)
Toggle `online`/`maintenance` (tanpa modal baru, kartu di tab existing):
- **`app_status_sentinel_bot`** ("RIMA — Seluruh Bot") = Level 2. `maintenance` → `SentinelProvider`
  `killed=true` → seluruh widget (avatar+chat) tak dirender untuk SEMUA user. Fail-safe G6
  (fetch gagal → bot tetap tampil). **Sudah ada sejak F4g**; tinggal dipakai.
- **`app_status_rima_query`** ("RIMA — Tanya Data") = Level 1. `maintenance` → `/api/rima/query`
  & `/summary` balas 503 (G30 fail-closed) → baca-data mati, chat/tur tetap hidup. Kini
  **di-allowlist** `app/api/admin/app-status` + label admin (sebelumnya hanya via DB).
Keduanya hanya SUPER_ADMIN (POST app-status), audit `CONFIG_UPDATE`.

**Definition-of-Done tiap provider baru:** (a) guard reuse `isXRole` (G31); (b) ownership
cermin route GET (atau dokumentasikan "tanpa ownership" + alasan); (c) Zod slot allowlist
(G24) + SELECT kolom allowlist tanpa PII (G25); (d) terdaftar di registry + klien
detector/formatter; (e) `tsc`+eslint clean; (f) live-verify minimal `rekap` per role.

### 24.6 Verifikasi (live, 2026-06-16)
`tsc` clean · eslint 0 error. Live (dummy roles): inbox role-aware (ADMIN→DIAJUKAN
"menunggu telaah", KABAG→DIPROSES "menunggu putusan") · `top` urut DESC + ownership ·
7 provider `rekap` 200 OK · summary agregasi (BBA 3 menunggu realisasi, LKJIP 1 menunggu
finalisasi) · deteksi NL anti-tabrakan ("laporan kinerja"→LKJIP, bukan PK/Kinerja).
Endpoint `/api/rima/feedback` 200 (panel UI gated SUPER_ADMIN).
