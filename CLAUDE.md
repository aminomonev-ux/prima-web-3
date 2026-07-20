# PRIMA — RSJD Dr. Amino Gondohutomo | Next.js Web App

> ⚠️ **WAJIB DIIKUTI SELURUHNYA. Tidak ada pengecualian.**

---

## 🛡️ AUDIT-AWARE DEVELOPMENT

> ⚠️ **Catatan prima-web-3**: folder dokumentasi audit (`docs/audit/`, `docs/security-audit/`, `docs/audit-v3/`) **tidak ikut ter-copas** ke workspace ini. Referensi kode di bawah (SEC-C1, L45, V3-1, dll) tetap dipakai sebagai konvensi, tapi file cheatsheet-nya ada di repo `prima-web` asli. Kalau butuh detail, copy folder tersebut ke sini dulu.

PRIMA punya 102 findings audit dari multiple wave (Audit v1.0, Tahap 11/12/14/15, SDL-Audit v1.1, BLUD v1.2, Audit V3 V3-1..V3-6). Ringkasan anti-pattern kritis di tabel bawah.

### 🔴 WAJIB DIPATUHI (highlight 6 pattern paling kritis):

| ❌ JANGAN | ✅ HARUS | Ref |
|---|---|---|
| `process.env.JWT_SECRET \|\| 'fallback'` | Throw kalau env kosong | SEC-C1 |
| `.toISOString()` ke kolom DATETIME MySQL | `toMysqlDatetime(date)` helper | MySQL 8.4 |
| `for (...) await sql\`INSERT...\`` loop | `bulkInsert(table, cols, rows)` | PERF-C1 |
| `DELETE; for INSERT;` tanpa transaksi | `withTransaction(async ({tx}) => {...})` | BUG-C2 |
| `UPDATE WHERE id = ?` tanpa ownership | Tambah `AND recipient/user_id IN (...)` | SEC-C4 IDOR |
| Simpan `*_token` plaintext di DB | `SHA256(rawToken)` at-rest, raw di email URL | **SDL-M18 / SEC-C5 / L45** |
| Set `x-user-*` di `response.headers` (spoofable) | Strip header klien + set di **request** header proxy | **V3-1 / L54** |
| Counter baca-lalu-tulis di JS (`x = col+1` → `UPDATE SET col=${x}`) | Atomik `UPDATE SET col = col + 1` (lost-update) | **V3-5 / L55** |

Anti-pattern terbaru (2026-06-15): **L66** `sqlInt()` utk `LIMIT`/`OFFSET` (mysql2 tolak `LIMIT ?` — lolos tsc, ketahuan saat live), **L67** cap jumlah sheet exceljs anti zip-bomb (di parser bersama), **L68** Zod + cek-eksistensi soft-FK di SEMUA cabang tulis termasuk tabel peta/lookup.

## 🚨 WAJIB — Navigasi Codebase (lean-ctx)
**DILARANG** membaca file sembarangan atau grep membabi buta. Gunakan tool lean-ctx.

> ℹ️ **Catatan prima-web-3**: `graphify-out/` (knowledge graph) tidak ter-copas ke workspace ini, jadi langkah "baca GRAPH_REPORT.md dulu" & command `/graphify` di-skip. Kalau mau graph, jalankan `/graphify .` untuk generate ulang.

### Tool mapping (TIDAK BOLEH dilanggar):
| ❌ DILARANG | ✅ WAJIB PAKAI |
|------------|---------------|
| `Read` / `cat` | `ctx_read(path, mode)` |
| `Grep` / `rg` | `ctx_search(pattern, path)` |
| `Bash` / `Shell` | `ctx_shell(command)` |
| `ls` / `find` | `ctx_tree(path, depth)` |
| Edit butuh Read? | `ctx_edit(path, old, new)` |

---

## 🚨 WAJIB — Aturan Edit

- Surgical: edit HANYA bagian bermasalah, jangan sentuh yang benar dan ketika memperbaiki/menambah, fungsi lain yang berhubungan juga disesuaikan
- Selalu cek `docs/schema-mysql.sql` sebelum menyebut kolom/tabel
- Setiap kolom/tabel baru: **WAJIB** tambahkan ke `docs/schema-mysql.sql` + buat `docs/migrations/migration-*.sql` (MySQL syntax, tanpa `IF NOT EXISTS` pada `ADD COLUMN`)
- Client fetch: pisah `fetch()` dan `.json()`, bungkus try/catch
- **Multi-statement write WAJIB `withTransaction`** (CQ-01/V5): setiap INSERT/UPDATE/DELETE >1 statement yang harus all-or-nothing dibungkus `withTransaction({tx,conn})` + `bulkInsert`; recompute turunan (mis. `updateHeaderStats`) setelah commit. Jangan loop `await sql` lepas.
- **Modul kolaboratif tanpa ownership per-record** (AUTHZ-02/V5): BLUD/Kinerja/LKJIP/BBA/Rencana-Aksi/IKI sengaja akses berbasis role+`app_access` (semua pemegang akses bisa edit semua record) — BUKAN IDOR. Konsekuensinya: pemberian `app_access` harus konservatif & direview berkala. Modul yang butuh batasan sub-bidang (mis. unduh file Usulan) menerapkan scoping eksplisit (lihat `upload/download/route.ts`).

## 🚨 WAJIB — Comment Style (Minimal Comments)

**Rely on self-explanatory naming, BUKAN komentar.** Function name + variable name harus cukup jelas tanpa komentar tambahan.

| ✅ Boleh komentar | ❌ JANGAN komentar |
|---|---|
| **WHY**: decision, anti-pattern reference, edge case, workaround | **WHAT**: ngulang code yang sudah self-explanatory |
| Pointer ke audit lesson (e.g. `// L4: withTransaction wajib`) | `// Set name to John` di atas `name = 'John'` |
| Browser/library bug workaround | Komentar dekoratif tanpa info |
| Non-obvious algorithm + reference | Section divider `// ─────` tanpa konteks |
| TODO/FIXME dengan context spesifik | Komentar yang outdated/tidak match code |

Header file/section comment tetap OK untuk navigasi (1-2 baris ringkas). Hindari long-form explanation di code — kalau perlu doc panjang, taruh di `docs/*.md`.

## 🚨 WAJIB — Response
1. 🔴 WAJIB Tool dulu, penjelasan sangat ringkas di akhir. (Ringkas: file + perubahan, narasi sangat singkat to the point.)
2. 🔴 **"tanya saja"** → jawab tanpa rubah code (zero tool call kecuali read untuk verify). Jangan eksekusi sampai user explicit minta.
3. 🔴 **"jawab singkat"** → balasan 1-3 kalimat max. Tanpa table, tanpa heading, tanpa narasi panjang. To the point only.


## 🎨 WAJIB — Design System

**Semua UI/UX WAJIB mengikuti `docs/design/DESIGN-SYSTEM.md`.** Tidak boleh membuat warna, tipografi, radius, spacing, atau komponen button baru di luar token yang sudah didefinisikan di sana.

### Ringkasan token kritis:
| Kebutuhan | Token | Hex |
|---|---|---|
| Primary CTA (Simpan) | `{colors.primary}` | #EF9F27 |
| Hapus / Tolak | `{colors.action-danger}` | #E24B4A |
| Setujui / Konfirmasi | `{colors.action-success}` | #1D9E75 |
| Ajukan / Review | `{colors.action-purple}` | #7C5CFC |
| Revisi / Perhatian | `{colors.action-warning}` | #BA7517 |
| Batal / Ghost | `{component.button-ghost}` | transparent + hairline |
| Canvas (dark) | `{colors.canvas-dark}` | #020F1C |
| Surface card | `{colors.surface-card}` | #042C53 |
| Teks utama (dark) | `{colors.text-primary-dark}` | #E6F1FB |

### Aturan UI wajib:
- **Font**: Inter untuk semua UI copy; monospace (`JetBrains Mono`) untuk semua angka keuangan (rupiah, kode rekening, vol, harga)
- **Radius**: 6px button/input · 10px card · 14px modal
- **Warna**: HANYA gunakan token dari design system — jangan hardcode hex baru
- **Button (WAJIB)**: Semua primary toolbar/modal/form CTA WAJIB pakai `<PrimaButton>` dari `components/ui/PrimaButton.tsx` — TIDAK BOLEH inline `<button style={...}>` atau shadcn `<Button>` untuk action utama. Variants: `primary` (Simpan), `success` (Approve/Inject/Excel), `danger` (Hapus), `purple` (Tambah/Ajukan/Form Baru), `warning` (Revisi), `ghost` (Batal/Cancel). Skip rules: row-action inline, pagination chevron, modal close X, tab pill, filter chip, shell navigation — tetap native. Spec lengkap → `docs/design/DESIGN-SYSTEM.md` section "PrimaButton"
- **Konfirmasi/notif (WAJIB)**: DILARANG native `window.confirm`/`alert()` (kotak putih browser). Konfirmasi destruktif pakai `confirmDialog()` dari `components/ui/ConfirmDialog.tsx` (`if (!(await confirmDialog({title,message,variant:'danger'}))) return`) — imperative, mount portal sendiri, tema dari `data-theme`. Pesan error/sukses pakai `toast` (sonner). Lihat **L58**.
- **Komponen shell shared**: `components/ui/UserBadge.tsx` (avatar+role+dropdown logout), `components/ui/FloatingDock.tsx` (bar nav mengambang antar-modul + aksi cepat), `components/ui/ConfirmDialog.tsx` — reuse, jangan re-implement inline.
- **Delete (WAJIB)**: Semua tombol/ikon hapus pakai `components/ui/DeleteButton.tsx` (bulat ~30px, hapus icon-only standalone di tabel) atau `components/ui/DeleteIcon.tsx` (ikon trash animasi di dalam `<PrimaButton variant="danger">`/kebab/toggle — teks & state host dipertahankan). Animasi lid-rotate + hover `#E24B4A` via rule global `button:hover .prima-del-top` di globals.css. DILARANG `<Trash2>` polos / emoji 🗑 untuk aksi hapus. Spec → `docs/design/DESIGN-SYSTEM.md` section "DeleteButton / Animated Trash".
- **Button danger**: background `#E24B4A`, teks putih — bukan outline merah
- **Jangan** pakai `financial-up/down` (#1D9E75 / #E24B4A) untuk state UI umum — itu khusus delta tabel
- **Tooltip** (WAJIB 1 standar): gradient amber dark / purple-pink light + arrow segitiga + fade 180ms. JANGAN pakai native HTML `title=""` (kotak putih browser). 2 cara: (1) CSS pseudo `::after` via `data-tooltip` attr untuk tombol di non-scroll area (ref: `.blud-act[data-tooltip]` di globals.css), (2) Portal `.blud-tip-portal` via `createPortal` untuk tombol di dalam scroll-wrapper/overflow:auto (ref: `RowActionsMenu` di dpa-client.tsx). Detail spec → `docs/design/DESIGN-SYSTEM.md` section "Tooltips — STANDAR TUNGGAL"
- Detail lengkap → `docs/design/DESIGN-SYSTEM.md`

---

## Stack
Next.js 16.2.6 · React 19 · TypeScript · MySQL 8.4 (mysql2) · JWT (jose) · Zod · Upstash Redis (atau Redis lokal) · Cloudflare Turnstile
Branch aktif: **mysql** — referensi schema: `docs/schema-mysql.sql` (bukan schema.sql/migrations — itu Postgres lama)

**Deployment**: server IT kantor (Linux/Windows Server) + PM2 + Nginx + MySQL EVENT/crontab — **bukan Vercel**. Untuk cron job, pakai MySQL EVENT (rekomendasi) atau Linux crontab → JANGAN tulis logic yg assume `vercel.json` cron.


### 🚧 Audit status — semua tahap DONE
- **Tahap 4** ✅ split `usulan-client.tsx` (-58.1%) · **Tahap 11/12** ✅ audit 5-pilar BLUD + Kinerja API (Zod sentral + getSession + bulkInsert/transaction)
- **Tahap 14** ✅ audit 5-pilar PK (`isPkRole` + Zod sentral) · **Tahap 15** ✅ Role Promotion Ladder (anti-pattern L52)
- **BLUD** ✅ Chain Hierarchy L1→L8.1 (mig 019) · Pengaturan Hapus Versi (`bludRateLimit`) · optimistic lock generic (L51, `lib/blud/lock.ts`)
- **E-Anggaran/Kinerja** ✅ Versi MURNI/PERUBAHAN (`canonical_id`, mig 020-022) · Checkpoint D drop 10 kolom turunan (mig 031) · Sumber +3 tab (mig 030) · kolom % Real Keu · bugfix unlock-latest
- **Audit V3** ✅ (2026-05-31..06-01) Auth surface + Fase A–E: V3-1 anti header-spoof `x-user-*` (L54) · V3-2 register anti-enumeration (`SIGNUP_BLOCKED`) · V3-3 kuota `AKTIF` · V3-4 kuota enforce di verify-email (`FOR UPDATE`) · V3-5 lockout login atomik (L55) · V3-6 Kinerja SSK/Realisasi optimistic-lock (L51 reuse `blud_locks`, live-verified). Fase A race (harness `scripts/concurrency-test.js` 9/9) · B state-machine · C/D/E 0 defect

## File Kritis
- `proxy.ts` — Edge Runtime, route guard, role access, CSP nonce — **JANGAN buat middleware.ts** (konflik fatal, error saat dev)
- `lib/data/db.ts` — MySQL pool, tagged template `sql\`\``, plus `withTransaction({tx})`, `bulkInsert`, `sqlInt`, `safeInt`
- `lib/security/auth.ts` — JWT, session, bcrypt; throw kalau JWT_SECRET kosong; cek revocation di getSession
- `lib/security/auditlog.ts` — audit trail semua aksi kritis (silent fail, JANGAN hapus try/catch)
- `lib/services/notifications.ts` — `addNotif()`, `sanitizeNotif()`, `buildNotifRecipients()`
- `lib/constants.ts` — roles, BIDANG_TO_SUBBIDANG, SUBBIDANG_TO_BIDANG
- `next.config.ts` — HTTP security headers (X-Frame-Options, HSTS, nosniff, dll) — **JANGAN hapus/lemahkan `securityHeaders`**; CSP dikelola di `proxy.ts` (nonce per-request)
- `.github/workflows/security-scan.yml` — **5 gate CI** (push/PR ke mysql/main): **A** Semgrep SAST · **B** npm-audit (block HIGH) · **C** tsc+ESLint · **D** Gitleaks secret-scan (`.gitleaks.toml`, allowlist `docs/` = contoh/placeholder, kode+`.env` tetap dipindai). CI pakai **Node 20 / npm 10.8.2** → `package-lock.json` WAJIB regen dgn npm versi sama (`npx npm@10.8.2 install`) biar `npm ci` tak EUSAGE (**L57**)
- `package.json` — `overrides` (`postcss`/`uuid`) untuk patch CVE transitif tanpa downgrade `next`/`exceljs`; JANGAN `npm audit fix --force` (**L56**)
- `app/(dashboard)/usulan-kebutuhan/usulan-client.tsx` — modul usulan (client)
- `app/api/usulan/` — CRUD, bidang, telaah, putusan, export
- `app/api/rima/query/` + `app/api/rima/summary/` + `lib/rima/registry.ts` — Rima Q&A baca-data (F6a, GET read-only): registry **7 provider** (`usulan/bba/pk/lkjip/blud/kinerja/rencana_aksi`, masing-masing 1 file `*-provider.ts`, reuse guard modul G31). Intent: `rekap/lookup/top/tren/inbox`. `/summary` = "Tugasku" lintas-modul (agregasi `provider.inbox`). Ownership dari role server (L60/G20), guard modul (L61), Zod intent+field allowlist (G24/G25), anti-scraping (G26), kill-switch fail-closed `app_status_rima_query` (G30), audit `RIMA_QUERY`/`RIMA_QUERY_ABUSE`. **Tambah modul = 1 provider + 1 baris registry** (DoD: §24.5 CONCEPT). Fail-log: `app/api/rima/feedback/` (#2) + panel admin "RIMA FEEDBACK" (SA-only). Klien: `lib/sentinel/data-query.ts`.
- `app/(auth)/reset-password/page.tsx` — UI form reset password (consumer dari email link)
- `app/api/auth/reset-password/route.ts` — POST consumer token (hashed)
- `app/(dashboard)/blud/` — modul BLUD (hub, DPA, Pergeseran)
- `app/api/blud/` — API DPA & Pergeseran DPA
- `lib/blud/data.ts` + `lib/blud/recalc.ts` — kalkulasi hierarki DPA BLUD
- `app/(dashboard)/perjanjian-kinerja/` — modul PK (form + 5 tab master + riwayat)
- `app/api/perjanjian-kinerja/` — 8 route file (units/sasaran/program/pejabat/dokumen/finalize/download/blud-nominal)
- `lib/data/pk.ts` + `lib/data/pk-schemas.ts` — PK data layer + Zod sentral + `pkRateLimit`
- `lib/pk/docgen.ts` + `lib/pk/templates/*.docx` — Word generator (docxtemplater + escapeXml + dynamic import)
- `app/(dashboard)/buku-besar-aset/` — modul BBA (Buku Besar Aset): page + client (tabel/filter/KPI/entry/realisasi) + UserBadge + FloatingDock
- `app/api/buku-besar-aset/` — `route.ts` (CRUD list/create/update/delete), `realisasi/route.ts` (set realisasi), `_guard.ts` (`isAsetRole`)
- `lib/data/buku-besar-aset.ts` + `lib/data/buku-besar-aset-schemas.ts` — BBA data layer + Zod sentral + `bbaRateLimit`; `canonical_id` atomik (prefix `BBA-`), CAS per-row (L48 `assertCas`), validasi transisi status (`BbaTransitionError`/`BbaVersionConflictError`)
- `app/(dashboard)/lkjip/` — modul LKJIP (penyusun Laporan Kinerja tahunan): `page.tsx`+`lkjip-client.tsx` (daftar dokumen), `[id]/page.tsx`+`editor-client.tsx` (editor outline 3-panel: tree·blok·inspector + menu ⚙ Pengaturan Dokumen), `[id]/TiptapNarasi.tsx` (editor rich-text Tiptap, dynamic ssr:false)
- `app/api/lkjip/` — `route.ts` (list/create/delete dokumen), `[id]/route.ts` (detail/header+style_config), `[id]/finalize`, `[id]/generate` (Word — **murni download, tanpa efek samping**), `[id]/versi/route.ts` (GET list riwayat / POST simpan versi + arsip Drive best-effort), `[id]/versi/[versiId]/restore` (POST pulihkan), `section/route.ts`, `block/route.ts`, `_guard.ts` (`isLkjipRole`)
- `lib/lkjip/` — `data.ts` (CRUD+seed skeleton+CAS+guard DRAFT+validasi move pohon), `schemas.ts` (Zod sentral+role+`lkjipRateLimit`+`StyleConfig`+`sanitizeNarasiHtml`), `numbering.ts` (nomor section DIHITUNG dari pohon, tidak disimpan), `docgen.ts` (Word .docx dari nol via PizZip: styles dinamis dari `style_config` + parser HTML→OOXML utk rich-text + **Daftar Isi/Tabel/Gambar OTOMATIS via field TOC + caption SEQ** + footer/nomor halaman + penomoran romawi-depan/arab-isi multi-section), `versi.ts` (hybrid riwayat: snapshot JSON→DB utk pulihkan/edit-ulang + retention 20). Editor narasi = **Tiptap** (MIT). Arsip docx→Drive via `lib/services/drive.ts` (env `GOOGLE_DRIVE_FOLDER_ID_LKJIP`, best-effort, saat Simpan Versi). Fase 1+formatting+riwayat selesai; PDF (LibreOffice) & composer auto-pull = fase lanjut

- `app/(dashboard)/dashboard/` — modul **Dashboard** (ringkasan lintas-modul, READ-ONLY): `page.tsx`+`dashboard-client.tsx` (overview 5 widget: Usulan/E-Anggaran/BLUD/Renaksi/Realisasi Kinerja — KPI+mini chart) · `[modul]/page.tsx`+`detail-client.tsx` (drill-down DI DALAM app: KPI+pie+bar+tabel rekap; tombol "Lihat Detail" TIDAK ke aplikasi modul, tetap dijaga `isDashboardRole` yang sama). Akses default SUPER_ADMIN/ADMIN/KASUBAG/KABAG + grant `app_access:'dashboard'`.
- `app/api/dashboard/` — `route.ts` (GET overview) + `[modul]/route.ts` (GET detail, allowlist `isDashModule` → 404). `lib/data/dashboard.ts` (`getDashboardSummary`/`getModuleDetail` reuse data-layer tiap modul) + `lib/data/dashboard-schemas.ts` (`isDashboardRole`, `dashboardRateLimit`, Zod). app_access key: `dashboard`. app flag: `app_status_dashboard`
- `app/(dashboard)/iki/` — modul **IKI** (Indikator Kinerja Individu, konsep `docs/CONCEPT-iki.md`): `page.tsx`+`iki-client.tsx` (daftar dokumen per pejabat/tahun), `[id]/editor-client.tsx` (editor Data Pribadi + grup RHK×4 TW + modal import 2 tab Renaksi/IKI-Atasan), `_lib/types.ts` (types client). 2 varian layout: `STANDAR` (11 kolom, 2 ttd) / `DIREKTUR` (8 kolom, ttd tunggal)
- `app/api/iki/` — `_guard.ts` (`isIkiRole`: SUPER_ADMIN/ADMIN + app_access `iki`), `route.ts` (list/create/delete), `[id]/route.ts` (detail + save replace-all `withTransaction`+`bulkInsert`, CAS L48), `[id]/finalize` (POST FINAL / DELETE unlock SA-only), `import-renaksi` (mapping `rencana_aksi`: jenis→aspek_b 1:1, q1..q4→target TW), `import-atasan` (kaskade RHK), `import-excel` (POST preview-only parse file Excel "VERSI BPSDMD" → `lib/iki/import-excel.ts`, dikalibrasi 20 file asli; tulis via create+save existing dari `ImportIkiModal.tsx` dgn pemutakhiran pejabat/atasan dari Master PK), `pejabat` (suggest dari `pk_pejabat`), `[id]/duplicate` (salin dokumen ke tahun lain — soft-FK di-NULL-kan, atasan di-resolve via NIP), `[id]/versi` + `[id]/versi/[versiId]/restore` (riwayat snapshot), `export-log` (audit IKI_DOWNLOAD — export digenerate client-side)
- `lib/data/iki.ts` + `lib/data/iki-schemas.ts` — data layer + Zod sentral (superRefine per varian) + `ikiRateLimit` · `lib/iki/layout.ts` (grid descriptor bersama PDF+Excel — 1 sumber merge/rowspan/penomoran kolom) + `lib/iki/export-pdf.ts` (jspdf-autotable) + `export-excel.ts` (exceljs) — layout WAJIB identik 5 PDF referensi. Tabel: `iki_dokumen`→`iki_rhk`→`iki_rhk_triwulan` (migration-iki.sql; UNIQUE `(nip, tahun, jabatan)` — migration-iki-nip-jabatan.sql, 1 orang boleh dokumen per jabatan utk kasus Plt.) + `iki_versi` (migration-iki-versi.sql — snapshot otomatis saat FINALIZE/UNFINALIZE, retention 20). `lib/iki/validate.ts` — validasi LUNAK target TW vs tahunan (Akumulatif=jumlah, Progres±=TW IV; Pengulangan di-skip; tidak memblokir). Banner "atasan berubah" = `atasan_stale` server-computed (banding `updated_at` di SQL). Export massal = zip client-side (PizZip, cap 100). app flag: `app_status_iki`. Audit: `IKI_*`

## Database — MySQL 8
- Placeholder: `?` bukan `$1`. Template: `sql\`SELECT ... WHERE id = ${val}\``
- `ONLY_FULL_GROUP_BY`: kolom non-aggregate wajib di GROUP BY atau pakai `ANY_VALUE()`
- `JSON_OBJECTAGG` → pakai `pool.query()` bukan prepared statement
- BIGINT (`audit_log.id`, `user_sessions.id`): mysql2 bisa return BigInt → gunakan `CAST(col AS UNSIGNED)`
- `NOW()` = waktu server MySQL. `timezone: '+07:00'` di pool hanya untuk JS Date parsing
- Kolom baru (audit Tahap 3): `usulan_headers.jumlah_item_admin`, `total_nilai_admin` — di-maintain `updateHeaderStats()`
- Kolom baru (fitur Theme Toggle): `users.theme_preference` ENUM('dark','light') DEFAULT 'dark' — migration 017
- Tabel baru (fitur Cetak BLUD): `rekap_pk` (snapshot rekap Penanggung Jawab BLUD) — migration 024. Kolom: `versi_dpa`, `label`, `nominal`, `saved_at`, `saved_by` (INT, FK users.id ON DELETE SET NULL). Pattern save: `withTransaction` DELETE+bulkInsert per versi (replace-latest)
- Tabel baru (fitur Kode Besar BLUD): `kode_besar` — migration 025+026. Kolom: `kode` (UNIQUE), `uraian`, `level` (L1/L2/L2.1, migration 026), `parent_kode` (FK soft ke kode_besar.kode, migration 026), `urutan`. Mirror master_akun pattern (replace-all atomic via withTransaction + bulkInsert). Seed 8 default rows via INSERT IGNORE (5.X/5.1/5.2/5.1.1/5.1.2/5.2.2/5.2.3/5.2.6 — standar BLUD). Fungsi: template awal saat klik "Form Baru" di DPA — overlay select per row, build hierarki L1→L2→L2.1 otomatis.
- Tabel baru (fitur Penanggung Jawab BLUD): `penanggung_jawab` — migration 027. Kolom: `label` (UNIQUE), `urutan`. Seed 13 default Kasubbag/Kasi/Kabid via INSERT IGNORE. Fungsi: master list untuk dropdown kolom Penanggung Jawab di DPA (PenanggungJawabCombobox di components/blud/). Kolom kode_rekening di DPA + Pergeseran sekarang `readOnly` — value derive dari MasterAkunCombobox pick di kolom Uraian.
- Tabel baru (fitur Buku Besar Aset/BBA, eks "Inventaris Modal"): `buku_besar_aset` — migration `migration-inventaris-modal.sql` (create) + `migration-rename-buku-besar-aset.sql` (rename tabel/flag/app_access/prefix) + `migration-bba-simplify-status.sql` (status 6→4, drop luncuran/parent_row_id, nilai_rencana auto). Register belanja modal lintas-tahun + lifecycle. Kolom kunci: `canonical_id` (identitas stabil lintas-tahun, prefix `BBA-`, UNIQUE `(canonical_id, tahun_anggaran)`), `tahun_anggaran`, `status` ENUM(DIRENCANAKAN/REALISASI_PENUH/REALISASI_SEBAGIAN/TIDAK_TEREALISASI) — **DILUNCURKAN/DIBATALKAN dihapus + infra luncuran (`parent_row_id`/`getAsetChain`) dibuang**, `sumber_anggaran` ENUM(BLUD/APBD/DAK/LAINNYA), `nilai_rencana` (**OTOMATIS = vol × harga, dihitung server di create/update — bukan input**)/`nilai_realisasi`, `version` (optimistic lock per-row — L48 CAS). Kolom turunan (sisa/pct/aging) TIDAK disimpan — dihitung server-side. App flag: `app_status_buku_besar_aset`. app_access key: `buku_besar_aset`.
- Kolom baru BBA (fitur Import dari Usulan) — migration `migration-bba-import-usulan.sql`: `origin` ENUM(MANUAL/USULAN), `usulan_item_id` (UNIQUE `uq_bba_usulan_item` — anti double-entry), `usulan_no`, `usulan_keputusan` ENUM(DISETUJUI/DITOLAK), `ditolak_oleh` ENUM(ADMIN/KASUBAG/KABAG — diturunkan dari kolom jejak putusan), `sub_bidang`, `vol_realisasi` DECIMAL(18,2) (unit terealisasi, validasi 0 ≤ vol_realisasi ≤ vol). Baris `origin=USULAN`: uraian/vol/harga/keputusan read-only; keputusan DITOLAK → realisasi terkunci (vol & nilai realisasi 0). Endpoint tarik: `app/api/buku-besar-aset/import-usulan/route.ts` (mode preview/commit, khusus ADMIN/SUPER_ADMIN).
- Tabel baru (modul LKJIP): `lkjip_dokumen` + `lkjip_section` + `lkjip_block` — migration `migration-lkjip.sql`. Penyusun Laporan Kinerja tahunan berbasis outline-tree + blok. `lkjip_dokumen`: `canonical_id` (prefix `LKJIP-`, atomik dari AUTO_INCREMENT), `tahun`, `status` ENUM(DRAFT/FINAL) (FINAL=immutable), `version` (optimistic lock dokumen-level L48 CAS). `lkjip_section`: pohon adjacency-list (`parent_id` TANPA FK — subtree delete via app `withTransaction`; `depth`/`urutan`; `locked`=1 untuk 4 BAB seed), **nomor DIHITUNG di `numbering.ts`, tidak disimpan**. `lkjip_block`: `tipe` ENUM(NARASI/TABEL/GAMBAR/GRAFIK) + `payload` JSON, FK CASCADE ke section (GRAFIK = migration `migration-lkjip-grafik.sql`; payload pie/bar/line via recharts→PNG html2canvas-pro→embed Word lewat pipeline gambar `imageFileId`; sumber data manual atau dari blok TABEL). `style_config` JSON (font/ukuran/spasi/justify+nomor halaman+footer+romawi-depan — migration `migration-lkjip-style.sql`). Tabel `lkjip_versi` (migration `migration-lkjip-versi.sql`): snapshot JSON struktur dokumen utk riwayat/pulihkan (hybrid — `drive_file_id` arsip docx di Drive, retention 20/dok, list metadata-only anti-lemot). App flag: `app_status_lkjip`. app_access key: `lkjip`.
- Kolom baru DPA BLUD (fitur Import dari Usulan) — migration `migration-dpa-import-usulan.sql`: `dpa_blud.origin` ENUM(MANUAL/USULAN), `usulan_item_id` INT NULL (non-UNIQUE — versioned snapshot, keunikan per-versi via Sentinel Guard), `usulan_no`. Tombol import per-baris di kebab DPA (L2 ke bawah) → modal **workbench** (`components/blud/ImportUsulanModal.tsx`, rewrite 2026-06-11 per `CONCEPT-import-usulan-dpa-v2.md`): 2 mode — **"Isi baris ini"** (1 item radio menimpa uraian/vol/satuan/harga baris leaf yang diklik, kode rekening/PJ/posisi dipertahankan, baris berisi → confirmDialog "Timpa") dan **"Sisip baris baru"** (multi, dock **Panel Susunan** kanan: indent/outdent ◀▶ + urutan ↑↓ eksplisit → parent resolve dari urutan susunan, bukan urutan tampil). Rail kiri jenis belanja→sub-bidang + search-first + react-virtuoso (skala ribuan item) + filter TA + sort. Styling theme-aware via kelas `.blud-imp-*` di globals.css (dark+light). Tarik item usulan final disetujui Kabag. Endpoint: `app/api/blud/dpa/import-usulan` (GET). **Sentinel Guard** anti-dobel 3 lapis: modal disable item yg sudah di form · banner live `lib/blud/dup-guard.ts` (HARD usulan_item_id kembar + HEURISTIK uraian+satuan+harga) · server 400 via `validateTreeIntegrity`.
- Untuk bulk INSERT pakai `bulkInsert(table, cols, rows[][])` — single round-trip, atomic via `withTransaction`

## Auth & Security
- Cookie: `prima_session` (HTTP-only JWT) — JANGAN ubah nama
- Fungsi kritis — JANGAN ubah: `verifyToken()` `getSession()` `setSessionCookie()`
- `proxy.ts` — DILARANG import `bcryptjs` atau `next/headers`, gunakan `jose`
- Login: max 5 attempts → lock 15 menit. Session timeout: 60 menit

## Role System
4 level: `SUPER_ADMIN / ADMIN / ADMIN_KASUBAG / ADMIN_KABAG` → `BIDANG_*` (4) → `SUB_BIDANG` (18 roles)
Detail mapping: `lib/constants.ts` → `BIDANG_TO_SUBBIDANG`, `SUBBIDANG_TO_BIDANG`

### Role Quota (max akun per role)
- `ROLE_QUOTA = 3` (existing) — berlaku untuk **6 BIDANG_ROLES** (RENBANG, UMUM, KEUANGAN, PELAYANAN, PENUNJANG, KEPERAWATAN)
- `ADMIN_QUOTA = 6` — max ADMIN (Admin Staff)
- `SUPER_ADMIN_QUOTA = 4` — max SUPER_ADMIN
- ADMIN_KASUBAG, ADMIN_KABAG, sub-bidang (18 roles) → **tidak di-cap**
- Enforcement: real-time `COUNT(*) WHERE role = ? AND status = 'AKTIF'`, BUKAN counter terpisah di DB
- Cek di entry point: register, edit role (User Management Admin Panel), promotion target

### 🔴 PENTING — 2 panel user berbeda (jangan dicampur)
| Panel | Lokasi | Peruntukan | Aksi |
|---|---|---|---|
| **"Kelola User"** | `/usulan-kebutuhan` → sidebar PENGATURAN → Kelola User | **Khusus modul Usulan** — sub-modul untuk admin Usulan ubah role user yang terlibat di flow Usulan | **Hanya ubah role**, banner explicit: "Aksi lain tersedia di Admin Panel" |
| **"User Management"** | `/admin` → tab User Management | **Sistem-wide** — full CRUD user untuk seluruh PRIMA | Nonaktif, reset password, hapus, atur akses aplikasi, ubah role, (rencana) unlock promotion lock |

**Jangan refactor / rename / merge keduanya** — peruntukan berbeda:
- "Kelola User" hidup di scope `app/(dashboard)/usulan-kebutuhan/_panels/KelolaUserPanel.tsx`
- "User Management" hidup di scope `app/(dashboard)/admin/admin-client.tsx`

## God Nodes (fungsi paling banyak dipakai — hati-hati saat ubah)
- `writeAuditLog()` · `sql()` · `hasAppAccess()` · `getSession()` — perubahan di sini berdampak luas.
