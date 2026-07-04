# CONCEPT — Rima v4 "Advanced Learning" (RAL)

> Modul konsep pembelajaran/training lanjutan untuk Rima. Lanjutan dari
> CONCEPT-rima-v3-data-aware (F6a Q&A data) — fokus v4: **loop belajar tertutup**
> (pertanyaan gagal → label → retrain → terukur), bukan sekadar menambah regex.
> Status: **RAL-1..RAL-6 DIIMPLEMENTASI 2026-07-04** (RAL-7 tetap opsional/offline).
> Catatan implementasi: RAL-4 memperluas `scripts/rima-train.mjs` existing
> (arg `--labeled <jsonl>`, default `docs/session/sentinel/rima-labeled.jsonl`;
> sumber `GOLDEN-QUESTIONS.md` hanya ada di repo prima-web asli). Baseline eval:
> `lib/sentinel/nlu/golden-baseline.json` (data 100% · kb 93.3% · deny 100% ·
> none 50% · total 95.2%). Jalankan `npm run rima:eval` / `rima:detect-test`.
> Migration DB: `docs/migrations/migration-rima-feedback-v4.sql` (WAJIB dijalankan
> sebelum deploy fitur feedback v4).

---

## 0. Prinsip yang TIDAK berubah (harga mati)

| # | Prinsip | Alasan |
|---|---|---|
| P1 | **Nol LLM di runtime** — classifier lokal-deterministik (NB + TF-IDF), angka SELALU dari SQL server | Anti-halusinasi; jawaban angka bisa diaudit (G9/G10) |
| P2 | Q&A data **read-only GET** + guard berlapis (kill-switch G30, allowlist G24, guard modul L61, ownership L60/G20, rate-limit G26) | Rima tidak pernah menulis data modul |
| P3 | Teks user **di-redaksi PII** sebelum disimpan (klien R4/G27 + server defense-in-depth) | `rima_unanswered.question` tidak boleh berisi PII |
| P4 | Deteksi pertanyaan-data **konservatif**: ragu → serahkan ke classifier KB → fallback | Salah diam lebih baik daripada salah jawab angka |
| P5 | Semua artefak belajar (dataset, model.json) **masuk git & di-review** | Model = kode; perubahan perilaku harus kelihatan di diff |

---

## 1. Peta arsitektur sekarang (baseline v3, per 2026-07-04)

```
User ketik ──► RimaChat.tsx
  1. nav intent (buka modul)                    lib/sentinel/nav.ts
  2. detectRimaDataQuery (regex + SYNONYMS)     lib/sentinel/data-query.ts
       └► GET /api/rima/query | /summary        7 provider, lib/rima/registry.ts
  3. WHOAMI (identitas dari sesi)
  4. classify() ensemble                        lib/sentinel/nlu/engine.mjs
       deny-regex → keyword → NB+TF-IDF → kandidat A5 → fallback
       (tokenize: normalize → SYNONYMS → stopword → stem; koreksi typo Levenshtein)
  5. Gagal → logFailedQuestion + POST /api/rima/feedback → tabel rima_unanswered
       └► panel admin "RIMA FEEDBACK" (SA-only, agregat GROUP BY question)
```

Yang **sudah** dimiliki: fail-log mining (#2), kandidat A5 saat ragu, koreksi typo
vocab, clause-split M3, kamus SYNONYMS Wave 1–6, threshold terkalibrasi (M4),
smoke test `scripts/rima-detect-test.mts` (39 kasus data-query).

## 2. Gap yang membuat Rima "berhenti belajar" (kenapa perlu v4)

| Gap | Dampak |
|---|---|
| **G-A. Loop label mati.** `rima_unanswered` hanya *ditonton* admin — tidak ada jalur label → dataset → retrain. Script train (`scripts/rima-train.mjs`) ada di repo prima-web asli, tidak di sini | Pertanyaan gagal menumpuk, model tidak pernah membaik |
| **G-B. Pilihan kandidat A5 dibuang.** Saat Rima ragu dan user mengklik salah satu kandidat, klik itu = label gratis berkualitas tinggi — sekarang tidak dicatat | Kehilangan sumber data training termurah (active learning) |
| **G-C. Tidak ada metrik.** "Rima makin pintar" tidak terukur; tuning regex/threshold berisiko regresi senyap | Setiap perubahan = tebak-tebakan |
| **G-D. Data-query buta konteks.** "berapa usulan 2026?" lalu "kalau yang 2025?" → pertanyaan kedua gagal (tak ada kata `usulan`) | Percakapan alami multi-giliran tidak jalan |
| **G-E. Slot terbatas.** Tidak ada filter status ("berapa usulan yang DITOLAK" → rekap semua status, user harus baca sendiri); keyword modul tidak toleran typo ("usulen", "rekp") | Jawaban kurang tajam ke inti pertanyaan |
| **G-F. Jawaban benar/salah tidak diberi umpan balik.** Tidak ada 👍/👎 di balon jawaban Rima | Salah paham data-query (false positive) tidak pernah ketahuan |

## 3. Roadmap fase RAL-1 … RAL-7

Urutan sengaja: **ukur dulu (RAL-1), kumpulkan label murah (RAL-2/3), baru retrain
(RAL-4)**; kecerdasan runtime (RAL-5/6) menyusul karena butuh metrik agar aman.

### RAL-1 — Golden set & harness evaluasi (fondasi, WAJIB duluan)
- Dataset uji beku `lib/sentinel/nlu/golden-set.json`: ±150–300 baris
  `{q, expect: {kind: 'data'|'kb'|'deny'|'none', app?, intent?, tahun?}}`.
  Sumber: `rima_unanswered` nyata (di-redaksi), audit `RIMA_QUERY`, kasus smoke test.
- `scripts/rima-eval.mts`: jalankan seluruh golden set melewati **pipeline yang sama
  dengan runtime** (detectRimaDataQuery → classify) lalu laporkan:
  intent-accuracy KB, slot-accuracy data-query, false-positive rate data-query
  (pertanyaan KB yang tersasar ke data), deny-recall.
- **No-regression gate**: skrip exit 1 bila akurasi turun vs snapshot
  `golden-baseline.json` → bisa dipasang di CI (gate C, opsional).
- DoD: `npx tsx scripts/rima-eval.mts` mencetak metrik; baseline tercatat di git.

### RAL-2 — Active learning: tangkap label gratis dari interaksi
- **Klik kandidat A5 = label lemah.** Saat user memilih kandidat, kirim
  `POST /api/rima/feedback` dgn `kind:'CANDIDATE_PICK'` + `chosen_intent`.
- **👍/👎 di balon jawaban Rima** (khusus jawaban data-query & KB, bukan deny):
  `kind:'THUMBS'`, simpan intent yang dijawab + verdict. 👎 pada jawaban data =
  sinyal false-positive G-F.
- Perluasan tabel (migration `migration-rima-feedback-v4.sql` + update
  `docs/schema-mysql.sql`):
  ```sql
  ALTER TABLE rima_unanswered
    ADD COLUMN kind ENUM('UNANSWERED','CANDIDATE_PICK','THUMBS_UP','THUMBS_DOWN')
      NOT NULL DEFAULT 'UNANSWERED',
    ADD COLUMN chosen_intent VARCHAR(64) NULL,
    ADD COLUMN label_intent  VARCHAR(64) NULL,
    ADD COLUMN label_status  ENUM('BARU','DILABELI','DIABAIKAN') NOT NULL DEFAULT 'BARU',
    ADD COLUMN labeled_by    INT NULL,
    ADD COLUMN labeled_at    DATETIME NULL;
  ```
  (tanpa `IF NOT EXISTS` di ADD COLUMN — aturan MySQL repo ini; FK labeled_by →
  users.id ON DELETE SET NULL.)
- Zod di `app/api/rima/feedback/route.ts` diperluas (allowlist `kind`,
  `chosen_intent` max 64); rate-limit existing 30/60 dipertahankan.
- DoD: klik kandidat & 👍/👎 tercatat; tidak ada PII (redactPii tetap 2 lapis).

### RAL-3 — Labeling workbench di panel RIMA FEEDBACK (admin)
- Upgrade `app/(dashboard)/admin/_panels/RimaFeedbackPanel.tsx`:
  1. **Clustering ringan** pertanyaan serupa (token-overlap Jaccard + Levenshtein,
     reuse `normalize.mjs` — hitung di server, bukan N² di browser; cap 500 baris).
  2. Aksi per cluster: **assign ke intent existing** (dropdown dari daftar intent
     KB + intent data `app.intent`) / **Abaikan** / **usul intent KB baru**
     (judul + jawaban → masuk `knowledge.mjs` lewat PR biasa, bukan runtime).
  3. Tombol **Export dataset**: unduh JSONL `{text, intent}` dari semua baris
     `DILABELI` + `CANDIDATE_PICK` (label lemah ditandai `weak:true`).
- Guard: SA/ADMIN (existing), aksi label diaudit (`writeAuditLog` event
  `RIMA_LABEL`), UI pakai `<PrimaButton>` + `confirmDialog()` (aturan design system).
- DoD: admin bisa melabeli 50 pertanyaan < 5 menit; export JSONL valid.

### RAL-4 — Pipeline retrain lokal + versi model
- Port `scripts/rima-train.mjs` dari repo prima-web asli ke repo ini (train &
  runtime WAJIB share `normalize.mjs` yang sama — sudah didesain begitu).
- Input: dataset seed (bawaan) + export JSONL RAL-3. Label lemah (`weak:true`)
  diberi bobot dokumen lebih kecil (mis. 0.5) di NB.
- Augmentasi yang sudah ada dipertahankan: typo M1, dan **paraphrase via SYNONYMS
  terbalik** (kanonik → beberapa surface form) untuk memperbanyak variasi — semua
  offline & deterministik (P1).
- Output `model.json` + `meta: {version, trainedAt, docs, accuracy}` → git diff
  reviewable (P5). **Gate**: retrain otomatis menjalankan `rima-eval.mts`; akurasi
  golden turun → build model ditolak.
- DoD: `npm run rima:train` menghasilkan model baru + laporan delta akurasi.

### RAL-5 — Data-query v2: slot-filling terpusat + filter status + typo modul
- Refactor `detect*()` per modul → **parser slot tunggal** yang mengisi
  `{app, intent, tahun, status?, topn, no}` dengan skor per slot; modul & intent
  dipilih dari skor tertinggi, bukan urutan if-else (urutan anti-tabrakan v3
  dipertahankan sebagai tie-breaker).
- **Slot status baru** (klien-side dulu): "berapa usulan yang **ditolak** 2026" →
  tetap intent `rekap` (server tak berubah), tapi formatter menyorot baris status
  yang diminta: "Yang DITOLAK: 12 dari 87 usulan…". Fase 2 (opsional): param
  `status` di provider + Zod allowlist per modul.
- **Typo keyword modul**: token panjang ≥5 di luar keyword dicek Levenshtein ≤1
  ke daftar keyword modul ("usulen"→usulan, "kinrja"→kinerja) — reuse
  `levenshtein()` dari `normalize.mjs`, maxDist kecil (P4 tetap konservatif).
- **Ambigu → bertanya balik**: dua modul sama-sama match tanpa pemenang jelas →
  Rima kirim chips klarifikasi ("Maksudmu Usulan atau BLUD?") — jawaban chip =
  label CANDIDATE_PICK (nyambung RAL-2).
- DoD: golden set slot-accuracy naik; false-positive rate tidak naik (gate RAL-1).

### RAL-6 — Konteks percakapan (multi-turn, murni klien)
- State ringan di RimaChat: `lastDataQuery {app, intent, tahun, status}` + TTL
  5 menit / reset saat topik ganti (pertanyaan non-data atau modul lain).
- Deteksi kalimat lanjutan (anafora): diawali `kalau|kalo|yang|gimana dengan|trus|
  bagaimana dgn` ATAU hanya berisi slot tanpa modul ("2025?", "yang ditolak?",
  "per bidang dong") → warisi slot kosong dari `lastDataQuery`.
- Zero perubahan server; endpoint & guard sama persis (P2).
- DoD: dialog "berapa usulan 2026" → "kalau 2025?" → "yang ditolak?" jalan;
  kasus multi-turn masuk golden set.

### RAL-7 — (Opsional) Paraphrase augmentation berbantuan LLM, OFFLINE-only
- Developer (bukan runtime) boleh memakai LLM untuk memperbanyak parafrase dataset
  training; hasil **di-review manusia**, masuk git sebagai dataset biasa, lalu
  di-train pipeline RAL-4 yang deterministik.
- Batasan keras: tidak ada network call di aplikasi, tidak ada model eksternal di
  runtime, pertanyaan user TIDAK PERNAH dikirim keluar (P1/P3).

## 4. Ringkasan file yang disentuh per fase

| Fase | File |
|---|---|
| RAL-1 | `scripts/rima-eval.mts` (baru), `lib/sentinel/nlu/golden-set.json` (baru) |
| RAL-2 | `app/api/rima/feedback/route.ts`, `components/sentinel/RimaChat.tsx`, `docs/migrations/migration-rima-feedback-v4.sql` (baru), `docs/schema-mysql.sql` |
| RAL-3 | `app/(dashboard)/admin/_panels/RimaFeedbackPanel.tsx`, `app/api/rima/feedback/route.ts` (PATCH label) |
| RAL-4 | `scripts/rima-train.mjs` (port), `lib/sentinel/model.json`, `package.json` (script `rima:train`) |
| RAL-5 | `lib/sentinel/data-query.ts`, `components/sentinel/RimaChat.tsx`, `scripts/rima-detect-test.mts` |
| RAL-6 | `components/sentinel/RimaChat.tsx`, `lib/sentinel/data-query.ts` (fungsi `mergeWithContext`) |

## 5. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Label lemah (klik kandidat) berisik → model memburuk | Bobot 0.5 di NB (RAL-4) + gate no-regression golden set |
| Slot status/typo modul menaikkan false-positive data-query | Ambang Levenshtein ketat (≤1, kata ≥5) + metrik FP di RAL-1 sebagai gate |
| PII bocor ke dataset training | redactPii 2 lapis (existing) + review manusia saat export (RAL-3) |
| Panel label jadi beban admin | Clustering + aksi per-cluster; target 50 label < 5 menit |
| Konteks multi-turn salah warisan slot | TTL pendek + reset agresif saat ganti topik; kasus di golden set |

## 6. Urutan eksekusi yang disarankan

`RAL-1 → RAL-2 → RAL-3 → RAL-4` (loop belajar tertutup, nilai terbesar) →
`RAL-5 → RAL-6` (kecerdasan runtime) → `RAL-7` (opsional). Tiap fase berdiri
sendiri dan bisa dirilis terpisah; tidak ada fase yang mengubah kontrak API
provider existing kecuali fase-2 opsional RAL-5.
