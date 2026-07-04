# PROMPT LANJUTAN — Implementasi RIMA F1 (PRIMA Sentinel Bot)

> Tempel prompt di bawah ini ke sesi Claude berikutnya, ATAU cukup ketik:
> "lanjutkan implementasi RIMA F1, baca docs/session/sentinel/PROMPT-LANJUTAN-F1.md"

---

Wajib baca dan patuhi CLAUDE.md root, `docs/design/DESIGN-SYSTEM.md`, dan
`docs/audit/AUDIT_LESSONS_LEARNED.md`. Gunakan lean-ctx (ctx_read/ctx_search/
ctx_shell/ctx_tree) + graphify, bukan tool native.

**Konteks:** Konsep bot asisten visual **RIMA** sudah FINAL dan ter-commit
(a60ecab) di `docs/session/sentinel/CONCEPT-sentinel-bot.md`. Bahan baku KB
juga sudah lengkap: `GOLDEN-QUESTIONS.md` (±335 pertanyaan, 18 kategori) +
`PERSONA.md` (persona pelayanan prima: de-eskalasi §4, template penolakan §5,
daftar kata terlarang utk lint CI) + `workflows/WORKFLOW-*.md` (8 modul:
Mermaid end-to-end + tabel tombol level-label + anchor `data-rima` siap F3).
Baca file-file itu PERTAMA — semua keputusan §11 sudah terjawab:

- Nama bot = **RIMA** (dari P-RIMA)
- Banner sentinel lama **tetap berdampingan** di F1 (dihapus di F2 setelah bot stabil)
- Urutan fase: **F1 Pengawas → F2 Chat+Rima Belajar → F3 Tur → F4 Perluasan modul**
- **TANPA LLM** — 100% lokal/deterministik/gratis/ringan
- Guardrails G1–G16 (G16: bot struktural read-only — tanpa callback mutasi, tanpa endpoint)

**Tugas: implementasikan F1 — Penyatuan + Bot Pengawas** sesuai konsep §2–§4 + §8:

1. `lib/sentinel/types.ts` + `registry.ts` — `SentinelRule`/`SentinelFinding`/
   `SentinelCtx`, severity `info|warning|critical`.
2. Refactor 3 sentinel lama jadi rules: `pj-conflict`, `dup-hard` (critical),
   `dup-heuristic`, `swap` — logic dari `lib/blud/dup-guard.ts` dan banner PJ di
   `dpa-client.tsx`/`pergeseran-client.tsx`; + rule baru `dup-parent-child`
   (kasus "RAM — 1 tera" induk-anak yang lolos heuristik leaf-only; severity
   info, dismissible).
3. Hook `useSentinel(rows, scope)` — debounce 300 ms + memo per hash rows.
4. `components/sentinel/RimaAvatar.tsx` — SVG maskot sesuai §3 (chibi 3D-look:
   badan putih glossy, visor gelap, mata ring glow, antena, logo P amber di
   dada; state ok/warning/critical/talk + gesture idle/point/wave/think) +
   `SentinelBot.tsx` (bubble + panel temuan + [Lihat] jumpToRow+flash +
   [Abaikan] persist `rima:dismiss` ring-buffer LRU sesuai §9c + daftar
   "Diabaikan" bisa dibatalkan + ringkasan pre-save + audit log
   `BLUD_SENTINEL_ACK` saat Simpan).
5. Mount `<SentinelBot/>` SEKALI di `app/(dashboard)/layout.tsx` (route-aware
   via `usePathname`); feed rows dari dpa-client/pergeseran-client via context
   provider ringan.
6. **Banner lama JANGAN dihapus** — berdampingan dengan bot di F1.
7. Keyframes `.rima-*` theme-aware (dark+light) di globals.css; patuhi design
   system (token warna, PrimaButton, confirmDialog L58, tooltip standar —
   JANGAN native `title=`) + anti-pattern L1–L58; TANPA kolom DB baru.
8. Verifikasi live via preview sebelum commit: di DPA BLUD buat duplikat
   induk-anak "RAM — 1 tera" → bubble muncul, Lihat/Abaikan jalan, pre-save
   summary jalan, light theme OK. Kalau CSS baru tidak muncul: hapus `.next` +
   restart dev server (cache Turbopack basi — kejadian sesi lalu).
9. Setelah selesai, tanya user soal `/graphify . --update` (banyak file baru).

**Backlog setelah F1** (jangan dikerjakan tanpa diminta): F2 chat + Rima Belajar
(Naive Bayes §9e, `scripts/rima-train.ts`) · F3 tur terbang · F4 perluasan
modul · P3 import usulan di Pergeseran (ditunda, `CONCEPT-import-usulan-dpa-v2.md`).

---

## STATUS SUB-AGENT (2026-06-12 — KEDUANYA SELESAI, jangan dikerjakan ulang)

### ✅ Sub-Agent 1 — Workflow visual per modul (commit d8341da)
- `workflows/WORKFLOW-<modul>.md` × 8 modul (usulan-kebutuhan, blud-dpa,
  blud-pergeseran, buku-besar-aset, kinerja, perjanjian-kinerja, lkjip, admin):
  flowchart Mermaid end-to-end + tabel langkah level tombol (label persis +
  komponen sumber + role) + usulan anchor `data-rima` per tombol (siap tur F3).
- **Sisa TODO**: screenshot layar kunci — `workflows/img/` masih kosong.
  Kerjakan saat dev server tersedia (login tema dark, simpan
  `img/<modul>-<langkah>.png`, embed di MD). Akun dummy DEV (bukan produksi):
  `dummy_admin` / `dummy_kasubag` / `dummy_kabag` / `dummy_program` /
  `dummy_renbang` (password `Password123`) · `superadmin` (password `Prima123`).

### ✅ Sub-Agent 2 — PERSONA + dataset hitung/sopan (commit 2bd2bed + lanjutan 2026-06-12)
- `PERSONA.md`: aturan bahasa "pelayanan prima" (sopan-sabar-humanis, tidak
  pernah membalas nada), daftar kata terlarang utk profanity-lint CI, pola
  de-eskalasi §4, template penolakan §5 — termasuk **Penolakan 4
  `deny.curhat-sensitif`**: empati tanpa menilai + rujuk resmi **Sub Bagian
  Kepegawaian** (nama unit keputusan user 2026-06-12, BUKAN "unit SDM").
- `GOLDEN-QUESTIONS.md` ±335 pertanyaan / 18 kategori — termasuk 15 `hitung.*`
  (rumus ground ke `lib/blud/recalc.ts` + data layer kinerja/BBA), 16 `sopan.*`,
  17 `deny.*`, 18 `umum-sistem.*`, plus 3 entri **tombol by design**
  (`usulan.putusan-per-role` · `dpa.import-isi-baris-induk` ·
  `kin.realisasi-hapus`) — pola jawaban: alasan desain + arahan tindakan benar,
  bukan "itu bug". Tambah entri baru dari fail-log berkala.
- **Sisa TODO** (kerjakan bersama F2, bukan sekarang): script profanity-lint
  template KB (build gagal bila template mengandung kata terlarang PERSONA.md)
  + fixture `rima-nlu.test.ts` (CI gate C: akurasi ★ ≥90%, total ≥75%).

Setelah F1 selesai: review, commit, dan tanya user soal `/graphify . --update`.
