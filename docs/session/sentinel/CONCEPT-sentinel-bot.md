# CONCEPT — PRIMA Sentinel Bot ("Rima")

> Status: **DRAFT — menunggu persetujuan user** (2026-06-11).
> Gabungan 4 ide yang sudah didiskusikan: ① penyatuan 3 sentinel jadi satu kerangka
> · ② maskot bot 3D (desain chibi putih + logo P, DISETUJUI dari mockup) · ③ bot bisa
> diajak chat + tur terbang step-by-step antar menu/tombol · ④ guardrail keamanan.
> **Scope: SELURUH aplikasi** (keputusan user 2026-06-11) — bot di-mount sekali di
> `app/(dashboard)/layout.tsx`, hadir di semua menu/halaman; rule pengawas aktif
> per-halaman sesuai scope, chat & tur tersedia di mana saja. Konten (intent + tur)
> diisi bertahap per modul, BLUD duluan.
> **Keputusan user**: 100% lokal-deterministik, ringan & gratis — opsi LLM DIBATALKAN
> (lihat §7 G9).

## 1. Tujuan

Satu asisten visual bernama **Rima** (dari P**RIMA** — nama final, keputusan user 2026-06-11) yang:
1. **Mengawasi** (existing, disatukan): mendeteksi masalah form secara realtime —
   konflik PJ, entri ganda, anomali — lalu "berbicara" lewat bubble dengan aksi
   [Lihat] / [Abaikan], menggantikan 3 banner sentinel terpisah.
2. **Menjawab** (baru): user bisa bertanya lewat panel chat ("bagaimana menjalankan
   aplikasi BLUD dari awal sampai akhir?") dan mendapat jawaban + tawaran tur.
3. **Memandu** (baru): bot **terbang** ke menu/tombol yang dijelaskan, **tangan
   menunjuk** elemennya, layar di-spotlight, menerangkan step-by-step dengan
   kontrol Lanjut/Kembali/Stop.

## 2. Penyatuan 3 sentinel — Rule Registry

Semua deteksi menjadi **rule** dengan kontrak seragam; bot adalah satu-satunya UI.

```ts
// lib/sentinel/types.ts
interface SentinelFinding {
  ruleId:    string
  severity:  'info' | 'warning' | 'critical'   // critical = blokir Simpan
  message:   string                            // template, sudah jadi kalimat bot
  targets:   { row_id: string; label: string }[] // tombol jump
  dismissKey?: string                          // ada = boleh di-Abaikan (info/warning)
}
interface SentinelRule<Row> {
  id: string
  scope: string[]   // route-scope: 'blud/dpa', 'blud/pergeseran', nanti: 'usulan', 'bba', …
  evaluate(rows: Row[], ctx: SentinelCtx): SentinelFinding[]
}
```

| Rule | Asal | Severity |
|---|---|---|
| `pj-conflict` | refactor `pj-conflict.ts` (banner merah PJ chain) | warning |
| `dup-hard` | `dup-guard.ts` HARD (usulan_item_id kembar) | **critical** (tanpa Abaikan) |
| `dup-heuristic` | `dup-guard.ts` HEURISTIK (leaf uraian+satuan+harga) | warning |
| `swap` | refactor `use-sentinel-swap.ts` (pergeseran) | warning |
| `dup-parent-child` | **BARU** — induk & anak uraian ternormalisasi sama (kasus "RAM — 1 tera") | info |
| `dup-fuzzy` | **BARU** — kemiripan uraian ≥ ~85% (typo/variasi tanda baca) | info |
| `row-incomplete` | **BARU** — leaf tanpa kode rekening / PJ / vol×harga 0 (ringkasan pre-save) | info |

- `useSentinel(rows, scope)`: evaluasi **debounce 300 ms** + memo per hash rows;
  rule berat (fuzzy O(n²)) dipecah per-chunk / Web Worker bila baris > ~1.000.
- **Memori Abaikan**: `dismissKey` (per pasangan row + versi) disimpan localStorage;
  panel bot punya daftar "Diabaikan" yang bisa di-batalkan. `critical` tidak punya
  dismissKey. Saat Simpan, daftar temuan yang diabaikan ikut dicatat ke audit log
  (`BLUD_SENTINEL_ACK`) — jejak "user sudah diperingatkan".
- Banner lama (`pj-sentinel-banner`, banner Sentinel Guard) **tetap berdampingan**
  dengan bot di F1 (keputusan user 2026-06-11) — baru dihapus di F2 setelah bot
  terbukti stabil. Validasi server lapis-3 existing tidak berubah.

## 3. Maskot — "Rima" (desain DISETUJUI dari mockup)

Chibi 3D: bodi putih glossy (cel-shading SVG berlapis, tanpa asset raster), visor
gelap, **mata cincin menyala** (`currentColor`), antena ganda, ear pods, **logo P
amber** (#EF9F27) di dada, badge counter merah saat ada temuan.

- **Komponen**: `components/sentinel/RimaAvatar.tsx` — pure SVG + props
  `{ state, gesture, size }`. Animasi murni CSS keyframes di globals.css
  (float, blink, antena sway, glow pulse) — pola `prima-del-top` (rule global).
- **State** (mata + badge): `ok` hijau #1D9E75 · `info/warning` amber #EF9F27 ·
  `critical` merah #E24B4A · `talk` (mulut/visor berdenyut saat bubble tampil).
- **Gesture tangan** (lengan = grup SVG ber-`transform-origin` bahu):
  `idle` · `point-left` / `point-right` / `point-up` (lengan terangkat + telunjuk
  pill kecil, dipakai saat tur menunjuk elemen) · `wave` (sapa saat pertama dibuka)
  · `think` (tangan ke dagu saat "mengetik" jawaban). Semua CSS rotate — murah.
- **Posisi**: floating pojok kanan-bawah area konten (di atas FloatingDock),
  `position: fixed`, bisa diciutkan jadi kepala saja; `z-index` **di bawah**
  `confirmDialog` (4000) — bot tidak boleh menutupi konfirmasi destruktif.

## 4. Mode Pengawas (default)

- Temuan baru → bot berubah state + **bubble bicara** (template kalimat per rule,
  ada beberapa variasi supaya tidak monoton): *"Psst — ada 2 uraian sama: 'RAM — 1
  tera' di induk dan anaknya. Sengaja?"* + tombol **[Lihat]** (jumpToRow + flash,
  >1 target = lompat bergiliran) dan **[Abaikan]** (kecuali critical).
- **Anti-spam**: bubble hanya muncul saat set temuan **berubah** (diff by key);
  auto-collapse 10 dtk → badge counter tetap. Klik bot → panel daftar semua
  temuan aktif per rule + tab "Diabaikan".
- **Pre-save**: hook ke tombol Simpan — masih ada warning aktif → `confirmDialog`
  "2 peringatan Sentinel belum dibereskan — tetap simpan?"; ada critical → Simpan
  diblokir dengan pesan bot (mirror validasi server).

## 5. Mode Chat

Klik bot → panel chat kecil (riwayat bubble dua arah, input teks, **quick-reply
chips**). "Otak" fase awal = **deterministik, lokal, tanpa LLM**:

- `lib/sentinel/knowledge.ts` — daftar **intent**: keyword/regex → jawaban template
  + aksi opsional (`startTour(id)` / `listMenu()` / `showFinding()`).
- Contoh intent BLUD: `cara-dpa-awal-akhir` ("jalankan dpa dari awal", "step by
  step", "mulai dari mana") → jawaban ringkas + chip **[▶ Mulai Tur DPA]** ·
  `apa-itu-pergeseran` · `cara-import-usulan` · `cara-kunci-versi` (kunci versi
  riil hanya ada di Kinerja/SSK — "Buat Perubahan Baru" mengunci versi lama;
  DPA versinya otomatis per tanggal, lihat workflows/) · `apa-itu-pj` ·
  `kenapa-tidak-bisa-simpan` (cek temuan critical aktif → jawab kontekstual).
- **Fallback** tidak dikenali → bot menawarkan pilihan: *"Aku belum paham
  pertanyaannya. Menu mana yang ingin kamu pelajari?"* + chips daftar topik
  (DPA · Pergeseran · Import Usulan · Versi & Kunci · Penanggung Jawab · Cetak).
- **Context-aware**: jawaban menyesuaikan `SentinelCtx` (halaman aktif, versi
  terkunci?, role user, jumlah temuan) — mis. user di Pergeseran bertanya soal DPA
  → bot menawarkan pindah halaman dulu (link, bukan auto-navigate).
- **TANPA LLM/AI eksternal — final.** Seluruh "kecerdasan" = intent matching +
  knowledge base statis di repo. Konsekuensi: gratis, tanpa internet, tanpa beban
  server (semua berjalan di browser user), jawaban 100% bisa diaudit, dan bot
  *secara konstruksi tidak mungkin* membocorkan hal di luar KB.

## 6. Mode Tur — bot terbang & menunjuk

- **Anchor**: elemen penting diberi atribut `data-rima="dpa.form-baru"`,
  `data-rima="dpa.kebab-import"`, dst. (non-invasif, cuma atribut). Registry anchor
  per halaman di `lib/sentinel/anchors.ts` (id → deskripsi + halaman).
- **Skrip tur** statis di repo — `lib/sentinel/tours/dpa-end-to-end.ts`:
  ```ts
  { id: 'dpa-end-to-end', title: 'DPA dari awal sampai akhir', page: '/blud/dpa',
    steps: [
      { anchor: 'dpa.versi-dropdown', text: 'Mulai dari sini — pilih atau buat versi DPA…' },
      { anchor: 'dpa.form-baru',      text: 'Form Baru membangun kerangka dari Kode Besar…' },
      { anchor: 'dpa.kolom-uraian',   text: 'Isi uraian lewat pencarian Master Akun…' },
      { anchor: 'dpa.kebab-import',   text: 'Atau tarik langsung dari Usulan final — ada 2 mode…' },
      { anchor: 'dpa.kolom-pj',       text: 'Tetapkan Penanggung Jawab — aku mengawasi konflik chain…' },
      { anchor: 'dpa.simpan',         text: 'Simpan — aku cek dulu entri ganda & PJ sebelum lolos…' },
      // temuan audit workflow 2026-06-12: DPA tidak punya tombol "kunci versi"
      // (versi otomatis per tanggal) — step terakhir diganti:
      { anchor: 'dpa.versi-dropdown', text: 'Selesai! Versi tersimpan otomatis per tanggal — versi terbaru jadi acuan Pergeseran.' },
    ] }
  ```
  Tur lain: `pergeseran-dasar`, `import-usulan`, `kelola-versi`, `cetak-rekap`.
- **Mekanik terbang**: bot = elemen fixed; per step → `getBoundingClientRect()`
  anchor → `scrollIntoView` + bot ber-`transition: transform .6s
  cubic-bezier` ke sisi elemen (kiri/kanan otomatis dari ruang tersedia) → gesture
  `point-left/right` ke arah elemen → bubble step + kontrol **[◀ Kembali] [Lanjut ▶]
  [✕ Stop]** + progress "3/7".
- **Spotlight**: overlay gelap berlubang di sekitar anchor (4 div panel — teknik
  tanpa clip-path; pointer-events none kecuali area target) supaya fokus.
- **Resilien**: anchor tidak ditemukan (fitur role-hidden / layout berubah) → step
  di-skip dengan catatan kecil; resize/scroll → posisi bot dihitung ulang
  (observer pola `RowActionsMenu` close-on-scroll, versi follow).
- Tur **tidak pernah meng-klik** apa pun — murni menunjuk + menjelaskan. Kalau
  step butuh kondisi (mis. modal import harus terbuka), teks step memandu user
  membukanya sendiri, bot menunggu (listener kemunculan anchor berikutnya).

## 6b. Pendalaman Tur (hasil analisa lanjutan)

1. **Dua mode tur**:
   - **Tunjukkan** (demo pasif) — bot terbang + menunjuk + menjelaskan, user cukup
     klik Lanjut. Cepat, aman, untuk orientasi.
   - **Latihan** (learning-by-doing) — per step bot MENUNGGU user melakukan aksinya
     sendiri (`waitFor`: anchor berikut muncul / field terisi / panel terbuka),
     baru lanjut + pujian singkat. Yang beraksi tetap 100% user (G1 utuh) — bot
     hanya memverifikasi "sudah dilakukan". Sebelum step bermutasi (Ajukan/Simpan)
     bot berhenti menunjuk dan menegaskan konsekuensi: *"Yang ini beneran tersimpan
     ya — lanjutkan kalau datanya memang mau diajukan."*
2. **Varian per role**: satu tur bisa bercabang — step ber-`roles?: Role[]`.
   Contoh `usulan-end-to-end`: SUB_BIDANG melihat langkah mengusulkan; ADMIN
   melihat telaah; KASUBAG/KABAG melihat putusan. Step di luar role user otomatis
   diganti narasi ringkas ("setelah ini usulanmu ditelaah Admin — bukan bagianmu").
3. **Prasyarat step** (`requires`): panel tertentu terbuka / versi belum terkunci /
   data minimal ada. Tidak terpenuhi → bot menyisipkan micro-step pemandu
   ("buka dulu menu Buat Usulan di sidebar — kutunjukkan") atau skip + alasan.
4. **Intent "di mana?" (locate)**: *"di mana tombol export?"* → micro-tour 1
   langkah: terbang ke anchor + tunjuk + 1 kalimat. Paling sering dipakai sehari-hari.
5. **Tur lintas halaman (deep-link)**: `?rima-tour=<id>&step=<n>` — bot menaruh link
   navigasi (user yang klik), tur otomatis lanjut di halaman tujuan. Hanya tour id
   terdaftar yang divalidasi (anti-inject); param asing diabaikan.
6. **Resume**: progres tur per user di localStorage → *"kemarin berhenti di langkah
   4/9 — lanjutkan?"*
7. **Contoh skrip nyata — `usulan-buat-baru`** (role SUB_BIDANG, grounded ke
   panel existing `app/(dashboard)/usulan-kebutuhan/_panels/`):
   | # | Anchor | Narasi singkat |
   |---|---|---|
   | 1 | `usulan.sidebar-buat` | "Mulai dari sidebar — klik **Buat Usulan**" (waitFor: BuatPanel tampil) |
   | 2 | `usulan.field-nama` | "Isi nama barang — yang jelas & spesifik supaya telaah cepat" |
   | 3 | `usulan.field-spesifikasi` | "Spesifikasi teknis di sini (merek/tipe/ukuran)" |
   | 4 | `usulan.field-qty` + `usulan.field-satuan` | "Jumlah & satuannya" |
   | 5 | `usulan.field-harga` | "Harga estimasi per unit — angka tampil monospace, total dihitung otomatis" |
   | 6 | `usulan.preview-no` | "Nomor usulan dipratinjau otomatis — tidak perlu ngarang nomor" |
   | 7 | `usulan.btn-ajukan` | (mode Latihan: bot berhenti menunjuk) "Kalau sudah yakin, Ajukan — ini tersimpan beneran" |
   | 8 | `usulan.tab-tracking` | "Pantau statusnya di **Tracking** — alurnya: telaah Admin → Kasubag → putusan Kabag" |
   | 9 | — (penutup) | "Selesai! Mau lanjut tur 'Membaca hasil telaah' atau cukup?" + chips |
   Tur Usulan lain: `usulan-telaah` (ADMIN) · `usulan-putusan` (KABAG) ·
   `usulan-rekap-export` · `usulan-set-pagu` (admin) — konten F4.
8. **Anchor governance (→ G15)**: konvensi nama `modul.area-aksi`; **test CI ringan**
   (node script di gate C) memvalidasi setiap anchor yang dipakai `tours/*.ts` &
   `knowledge.ts` benar-benar ada di source (`grep data-rima=`) → build gagal kalau
   UI berubah tanpa update tur (anti tur-zombie).

## 7. Guardrail (keamanan & keselamatan)

| # | Guard | Detail |
|---|---|---|
| G1 | **Read-only mutlak** | Bot TIDAK PERNAH men-trigger aksi mutasi (klik Simpan/Hapus/submit). Whitelist aksi: scroll, highlight/spotlight, jumpToRow, buka/tutup panel sendiri, navigasi via `<Link>` yang diklik **user**. |
| G2 | **Tanpa eksekusi dinamis** | Skrip tur & intent = data statis di repo (typed). Tidak ada `eval`, tidak ada instruksi dari server/DB yang dieksekusi jadi perilaku. |
| G3 | **Role & access aware** | Tur/jawaban difilter `SentinelCtx.role` + `hasAppAccess` client-mirror: menu yang user tidak punya akses tidak pernah ditunjuk/disebut. (Bukan security boundary — server tetap pemegang otoritas; ini mencegah bocor informasi fitur.) |
| G4 | **Sanitasi input chat** | Input user dirender plain-text (tanpa innerHTML), cap 300 char, intent matching lokal — tidak dikirim ke server di fase deterministik. |
| G5 | **Tanpa data sensitif** | Pesan bot hanya merefer data yang sudah tampil di layar user (uraian/kode di form). Tidak menyebut data user lain / lintas sub-bidang. |
| G6 | **Kill switch & preferensi** | App-flag `app_status_sentinel_bot` (matikan global oleh SUPER_ADMIN via Admin Panel pattern existing) + toggle per-user "Sembunyikan Rima" (localStorage). Bot mati → fallback banner lama TIDAK kembali; validasi server tetap. |
| G7 | **Z-index & fokus** | Di bawah `confirmDialog` (4000) dan modal (1000 ke atas disesuaikan); saat modal/dialog terbuka bot auto-minimize. `aria-live="polite"` untuk pesan; ESC menutup panel/tur. |
| G8 | **Jejak audit** | Abaikan warning + tur yang dijalankan dicatat ringan saat Simpan / selesai tur (`BLUD_SENTINEL_ACK`, `SENTINEL_TOUR_DONE`) — silent-fail pola `auditlog.ts`. |
| G9 | **LLM DIBATALKAN (keputusan user)** | Tidak ada endpoint chat, tidak ada AI eksternal, tidak ada biaya, tidak ada beban server. Bila suatu saat dipertimbangkan lagi → wajib konsep + audit terpisah. |
| G10 | **Anti-bocor teknis (whitelist-by-construction)** | KB dilarang memuat: path file, nama tabel/kolom DB, env var, API key, endpoint internal, mekanisme auth/secret. Karena bot hanya bisa menjawab dari KB, hal di luar KB *mustahil* bocor. Deny-list intent eksplisit: pertanyaan mengandung "source code / api key / password / database / token / env / secret" → jawaban penolakan standar: *"Itu di luar wilayahku — aku cuma paham cara pakai aplikasi. Tanya admin IT ya."* |
| G11 | **Tidak bahas akun/user lain** | Pertanyaan soal password, reset akun, data user lain, kuota role → arahkan ke prosedur resmi (Admin Panel / SUPER_ADMIN), tanpa detail mekanisme. |
| G12 | **Tanpa error mentah** | Bot tidak pernah menampilkan stack trace / pesan error mentah sistem — selalu kalimat ramah + saran langkah. |
| G13 | **Tidak menyimpan ketikan sensitif** | Riwayat chat hanya di memori sesi browser (hilang saat tutup), tidak dikirim/disimpan ke server; bot tidak pernah MEMINTA data (password/NIK/dll) — kalau user mengetikkannya, tidak diproses dan diberi peringatan singkat. |
| G14 | **KB = kode** | Knowledge base & skrip tur hanya bisa berubah lewat commit di repo (review seperti kode biasa) — tidak bisa diedit dari UI/DB, tidak bisa "diajari" user. |
| G15 | **Anchor integrity di CI** | Test build memvalidasi semua anchor tur/KB ada di source — UI berubah tanpa update tur → build gagal (anti tur menunjuk ke tombol yang sudah pindah/hilang). |
| G16 | **Tidak bisa hapus/ubah data — struktural, bukan sekadar aturan** | `SentinelBot` menerima data **readonly** (snapshot rows + ctx) dan TIDAK pernah dioper callback mutasi (`onChange`/setter form tidak ada di props-nya) + tidak memanggil API apa pun (zero endpoint baru, zero `fetch` mutasi). Jalur kode untuk menghapus/mengubah data *tidak eksis* di dalam bot — hapus/simpan tetap eksklusif lewat tombol existing yang dijaga session + role + confirmDialog + validasi server. Bahkan bila KB salah tulis, yang terburuk hanyalah teks/tunjukan yang keliru — bukan aksi. |

> **Status surface nyata (update v3, 2026-06-15 — sinkron L-4).** Klaim "nol-endpoint"
> (G9) sudah **diperhalus**. Permukaan jaringan Rima saat ini: **(a)** 2 GET di
> `SentinelProvider` — `/api/admin/app-status` + `/api/user/access` (self-scoped) ·
> **(b)** `POST /api/rima/lampir` = **parse-only** (baca Excel di RAM, buffer dibuang,
> NOL tulis DB — "POST" di sini = parse, bukan mutasi) · **(c)** `GET /api/rima/query`
> = **baca-data F6a** (CONCEPT-rima-v3 §11, modul Usulan, IMPLEMENTED 2026-06-15)
> ber-guard penuh: akses dari role server-side (L60/G20), guard modul di baris pertama
> (L61), Zod intent+field allowlist (G24/G25), kill-switch fail-closed (G30),
> rate-limit + audit `RIMA_QUERY`. **Rima tetap GET/parse-only — tak pernah menulis
> DB (G16 utuh).** Mutasi tetap eksklusif lewat endpoint app + Simpan user (Model A′).

## 8. Rencana file

| File | Aksi |
|---|---|
| `lib/sentinel/types.ts` + `registry.ts` | baru — kontrak rule + daftar rule per scope |
| `lib/sentinel/rules/*.ts` | refactor pj-conflict/dup-guard/swap jadi rule + rule baru (parent-child, fuzzy, incomplete) |
| `lib/sentinel/use-sentinel.ts` | baru — hook evaluasi (debounce+memo) + dismiss memory |
| `lib/sentinel/knowledge.ts` | baru — intents + jawaban + fallback chips |
| `scripts/rima-train.ts` + `lib/sentinel/model.json` | baru — pipeline latih Naive Bayes saat build (§9e) + model hasil latih |
| `docs/session/sentinel/GOLDEN-QUESTIONS.md` | baru (SUDAH DIBUAT) — ±232 pertanyaan berlabel = fixture test + data latih |
| `lib/sentinel/anchors.ts` + `tours/*.ts` | baru — registry anchor + skrip tur |
| `components/sentinel/RimaAvatar.tsx` | baru — SVG maskot (state+gesture) |
| `components/sentinel/SentinelBot.tsx` | baru — orkestrator: bubble, panel temuan, chat, tour engine, spotlight |
| `app/globals.css` | + keyframes `.rima-*` (float/blink/point/fly) theme-aware |
| `app/(dashboard)/layout.tsx` | mount `<SentinelBot/>` SEKALI untuk seluruh aplikasi (route-aware via `usePathname`) |
| `dpa-client.tsx` / `pergeseran-client.tsx` | feed `rows` ke bot via context provider ringan + atribut `data-rima`; banner lama tetap di F1, dihapus di F2 |
| Modul lain (usulan/BBA/kinerja/PK/LKJIP/admin) | hanya atribut `data-rima` + konten KB/tur — bertahap, tanpa ubah logic |
| `docs/schema-mysql.sql` | TIDAK berubah (tanpa kolom baru; app-flag pakai tabel flag existing) |

## 9. Fase implementasi

1. **F1 — Penyatuan + Bot Pengawas** (mount global di layout): registry + refactor
   3 rule + rule `dup-parent-child` + RimaAvatar + bubble/panel + Abaikan/Lihat +
   pre-save summary; banner lama TETAP berdampingan (dihapus di F2 setelah bot
   stabil). (Menjawab kasus "RAM — 1 tera".)
2. **F2 — Chat + Rima Belajar (Level 2 langsung)** ✅ SELESAI (2026-06-12): panel
   chat (tersedia semua halaman) + **ensemble keyword→Naive Bayes→TF-IDF** dilatih
   dari golden questions (§9e, pipeline build + CI) + intents BLUD + intents
   navigasi umum + fallback chips + context-aware + deny-list G10/G11.
   Catatan implementasi: B1 = topik terakhir ditawarkan via CHIP di fallback
   (retry prepend-judul DIBATALKAN — menjawab ngawur utk gibberish/typo berat, M4);
   vocab koreksi typo A1 = HANYA `model.idf` (token pertanyaan asli), bukan tf NB
   (tf berisi augmentasi typo M1 → typo user tak pernah terkoreksi). Gate CI:
   `npm run rima:check` di job quality-gate (train --check + nlu-test + lint
   PERSONA §3). Banner sentinel lama BELUM dihapus — tunggu keputusan user
   setelah bot terbukti stabil.
3. **F3 — Tur terbang** ✅ SELESAI (2026-06-12): anchors (`lib/sentinel/anchors.ts`,
   27 id) + tour engine (`components/sentinel/RimaTour.tsx` — fly/point/spotlight
   4 panel/skip-by-absence/recompute scroll-resize/ESC/K4/K5) + skrip
   `dpa-end-to-end` + `import-usulan` + `pergeseran-dasar` + `kenal-prima`
   (`lib/sentinel/tours/`) + chip tur di KB + resume §6b-6 (auto dari
   `rima:tour:*`, tawaran Lanjutkan/Dari awal via chip chat) + `waitFor`
   Latihan-ringan (amati kemunculan anchor → auto-lanjut, tanpa klik — G1) +
   intent locate §6b-4 ("di mana X" → micro-tour 1 langkah) + anchor-check G15
   (`scripts/rima-anchor-check.mjs`, ikut `rima:check`). Role-varian penuh,
   deep-link `?rima-tour=`, mode Latihan ber-`requires` → F4. Audit
   `SENTINEL_TOUR_DONE` ditunda (prinsip nol-endpoint, K6 metrik lokal dulu).
   Catatan dev: CSS baru tidak muncul = cache Turbopack basi → hapus `.next` +
   restart (kejadian ketiga kalinya).
4. **F4 — Perluasan konten + lanjutan**: intents & tur modul Usulan/BBA/Kinerja/
   PK/LKJIP/Admin (bertahap) + rule fuzzy + Web Worker + audit ack + kill switch
   admin + preferensi user.
   **+ Paket "Rima Hidup" (keputusan user 2026-06-12)** — tetap 100% lokal,
   tanpa LLM, aman laptop kentang:
   - **Small-talk pack**: kategori `sapa.*` di GOLDEN-QUESTIONS + KB (hai/halo/
     selamat pagi/terima kasih/siapa kamu/lagi apa) → retrain — sapaan kasual
     dijawab ramah, bukan fallback.
   - **Jawaban dinamis ber-token**: placeholder `{{jam}}`/`{{hari}}`/
     `{{salam-waktu}}` di template KB, diisi client-side dari jam browser
     ("jam berapa?" → "Sekarang 14.07 ☀️"). Deterministik, nol server.
   - **Interaksi ambient**: idle ≥5 menit → avatar state `sleep` (animasi CSS
     murni, GPU); 1 timer per menit cek waktu → bubble proaktif sekali
     ("Udah jam 12 nih — istirahat dulu yuk 🍚"); daftar sapaan waktu = statis
     di repo (G14), throttle ketat 1×/sesi/jenis (simpan `rima:profile`),
     tidak muncul saat tur/modal aktif (G7), hormati `prefers-reduced-motion`.
     Budget: animasi CSS compositor + 1 interval 60 dtk + bundle < 5 KB.
   - **Tur per modul langsung dari chat**: intent prosedural ("gimana cara buat
     usulan") → jawaban ringkas + chip ▶ tur modulnya LANGSUNG (skrip dari
     workflows/: `usulan-buat-baru`, `usulan-telaah`, `bba-entry`, dst) —
     pola sama dengan chip tur BLUD di F3.
   - **Guardrail tidak berubah**: tetap bukan obrolan bebas — topik di luar KB
     ditolak halus (G10/G11), small-talk = daftar terkurasi yang direview (G14).

## 9b. Peningkatan AI-like — tetap lokal, ringan, gratis — **DISETUJUI SEMUA (user 2026-06-11)**

> Pemetaan fase: A1/A2/A4/A5 + B1/B5 + D2 → **F2** · D1 + mode Latihan/locate/deep-link/resume → **F3** · A3 + B2/B3/B4 + C1/C2 + B6 (opsional, default off) → **F4**.

### Otak lebih pintar (NLU-lite, murni JS)
- **A1 Toleransi typo**: fuzzy match Levenshtein pada kata kunci — "pergesran",
  "imporr usulan" tetap dikenali.
- **A2 Kamus sinonim + bahasa sehari-hari**: gimana=bagaimana, gak bisa=tidak bisa,
  duit=anggaran, hapus=delete=buang — tabel statis di KB.
- **A3 Stemming Indonesia** (port Sastrawi ringan / aturan imbuhan sederhana):
  "menjalankan/dijalankan/jalankan" → "jalan" sebelum matching.
- **A4 Scoring TF-IDF/cosine** antar pertanyaan ↔ entri KB (index precomputed saat
  build, zero biaya runtime) → jawaban diranking, bukan exact-match.
- **A5 Confidence rendah** → bukan langsung fallback, tapi tawarkan 3 kandidat:
  *"Mungkin maksudmu: ① cara import usulan ② cara isi baris ③ …"*.

### Terasa "hidup" dan berkonteks
- **B1 Memori percakapan pendek**: topik terakhir diingat — pertanyaan lanjutan
  ("terus habis itu?", "kalau gagal?") dipahami dalam konteks topik sebelumnya.
- **B2 Profil belajar per user** (localStorage): tur yang sudah selesai, menu yang
  belum pernah dibuka → sapaan kontekstual: *"Kamu belum pernah ke Pergeseran —
  mau kuajak keliling?"* (sekali, tidak nyepam).
- **B3 Deteksi kebingungan** (rule-based): bolak-balik halaman cepat / form dibuka
  lama tanpa aksi → bot menawarkan bantuan, throttle ketat (maks 1×/sesi/halaman).
- **B4 Onboarding & what's-new**: login pertama → tawaran tur orientasi; rilis fitur
  baru (daftar statis dari changelog) → badge kecil "ada yang baru di DPA".
- **B5 Efek mengetik** (typing indicator + jawaban muncul per karakter) + variasi
  template kalimat + ekspresi avatar sinkron isi — kosmetik murni tapi paling
  terasa "AI".
- **B6 (Opsional) Suara**: Web Speech API `speechSynthesis` — bawaan browser,
  offline, gratis; toggle off default.

### Menjawab data — aman (G5 tetap)
- **C1 Mini query engine atas data di layar**: "total belanja modal berapa?",
  "berapa baris belum ada PJ?" → dihitung client-side dari rows form yang memang
  sedang dilihat user. Bukan akses DB baru, tidak lintas sub-bidang.
- **C2 "Ringkas form ini"**: jumlah baris per level, total per jenis belanja,
  temuan sentinel aktif — satu bubble terstruktur.

### Akses cepat
- **D1 Command palette Ctrl+K** terintegrasi bot: ketik pertanyaan/nama menu dari
  halaman mana pun → jawab/lompat (link yang diklik user — G1 aman).
- **D2 Telemetri pertanyaan gagal** (lokal → ikut audit log ringan saat ada sesi):
  pertanyaan yang tidak terjawab jadi backlog pengisian KB — bot "makin pintar"
  lewat loop developer, bukan machine learning.

Prioritas saran: **A1+A2+A4** (otak), **B1+B5** (rasa hidup), **C1** (wow-factor),
**D1** (produktivitas) — sisanya menyusul. Semua tanpa dependency berat; estimasi
tambahan bundle < 30 KB.

## 9c. Memori & Cache — budget tetap + auto-clean gradual (keputusan user 2026-06-11)

Prinsip: **semua penyimpanan ber-cap (ring buffer)** — penuh → yang TERTUA keluar
satu-satu (gradual), tidak pernah "hapus semua". Nol penyimpanan server/DB.

### Lapisan penyimpanan
| Lapisan | Isi | Cap | Eviction |
|---|---|---|---|
| RAM (state sesi) | Riwayat bubble chat | 50 bubble | push ke-51 → bubble tertua dibuang; hilang total saat tab ditutup (G13) |
| localStorage `rima:profile` | Menu pernah dibuka, tur selesai, fitur-baru sudah dilihat | 1 objek ≤ 2 KB | field-level, overwrite |
| localStorage `rima:dismiss:*` | Temuan diabaikan per versi dokumen | 200 entri | LRU — `lastUsed` tertua keluar; entri versi yang sudah dihapus / umur > 30 hari ikut tersapu |
| localStorage `rima:tour:*` | Progres/resume tur | 1 key per tur (puluhan byte) | tur selesai → key dihapus |
| localStorage `rima:fail-log` | Pertanyaan tak terjawab (telemetri D2) | 30 entri FIFO | tertua keluar duluan |

### Auto-clean
- **Sweep saat init bot** (sekali per sesi, < 1 ms): hapus entri kadaluarsa (TTL) +
  bila total namespace `rima:` > **budget 50 KB** → evict LRU sampai ≤ budget.
- **Ring buffer by design**: pembersihan terjadi alami saat menulis — tidak ada
  job pembersih besar, tidak ada momen "bot lupa segalanya".
- **Versi schema** `rima:v`: update app mengubah format → migrasi per-key; gagal
  migrasi → drop key itu saja (bukan nuke namespace).

### Budget performa (target "spek kentang")
- **Idle**: bot = 1 SVG (~8 KB DOM) + animasi CSS murni (GPU compositor, bukan
  loop JS) → CPU ~0% saat diam; `prefers-reduced-motion` → animasi mati.
- **Lazy-load**: initial bundle cuma avatar + bubble (±10–15 KB gzip); engine
  chat/tur + KB di-dynamic-import saat pertama dipakai; KB di-split per modul
  (buka halaman BLUD → cuma KB BLUD yang dimuat).
- **Index TF-IDF dihitung saat build** (bukan runtime) → dimuat sebagai JSON kecil.
- **Rule evaluation**: debounce 300 ms + memo per-hash; fuzzy (F4) hanya jalan
  > threshold via `requestIdleCallback`/worker — worker dibuat saat butuh dan
  di-terminate setelah 30 dtk idle (tidak ada thread nganggur makan RAM).
- **Target total**: tambahan heap < 5 MB di halaman terberat · nol request network
  · nol beban server. Browser lama/PC kentang: fitur degradasi anggun (animasi
  mati, chat tetap jalan).

## 9d. Konten, kualitas & jangkauan (penyempurnaan, keputusan user 2026-06-11)

### K1 — Proses konten + persona (REKOMENDASI DIPILIH: interaktif)
- **Persona Rima**: bahasa Indonesia ramah-santai tapi sopan ("aku/kamu"), istilah
  resmi PRIMA tetap dipakai (DPA, telaah, putusan — tidak diganti istilah gaul).
  **Selalu interaktif**: SETIAP jawaban ditutup ajakan/chips langkah berikutnya
  ("Mau kutunjukkan?", "Lanjut tur?", "Topik lain?") — tidak pernah jawaban buntu.
- **Alur produksi konten**: draft intent/tur ditulis developer → review user/admin
  → merge (KB = kode, G14). Satu file copy-guide pendek (`lib/sentinel/PERSONA.md`)
  jadi acuan gaya semua penulis.
- **Definition of Done fitur baru**: PR fitur UI wajib menyertakan update anchor +
  intent + (bila flow berubah) step tur — masuk checklist app-baru di AUDIT_REPORT.

### K2 — Golden questions (fixture test NLU)
- File `docs/session/sentinel/GOLDEN-QUESTIONS.md` — ≥200 pertanyaan berlabel
  intent + frekuensi (★ sering / ◇ jarang), lintas semua modul.
- Jadi fixture test CI (`sen-nlu.test.ts`, ikut gate C): target akurasi ≥90% untuk
  ★ dan ≥75% keseluruhan; di bawah target → build gagal. Pertanyaan baru dari
  fail-log ditambahkan berkala ke file ini.

### K3 — Anchor di virtual list (react-virtuoso) — resolver 2 tahap
Baris tabel DPA/modal import yang di luar viewport TIDAK ada di DOM. Strategi:
1. Query `[data-rima=…]` di DOM → ketemu → normal.
2. Tidak ketemu & anchor terdaftar bertipe `virtual` → minta host halaman
   scroll-ke-index lewat **registry callback readonly-scroll** (satu-satunya
   callback yang boleh dioper ke bot; scroll ≠ mutasi — G1/G16 tetap utuh) → tunggu
   render → re-query.
3. Tetap gagal → fallback: tunjuk container tabel + narasi tekstual langkahnya.

### K4 — Aksesibilitas (spec wajib)
Panel chat & tur = `role="dialog"` + **focus-trap** saat aktif · ESC menutup ·
tab-order logis (input → chips → tombol) · pesan bot via `aria-live="polite"` ·
spotlight tidak menghilangkan fokus keyboard dari elemen target ·
`prefers-reduced-motion` → semua animasi (terbang/float/ketik) jadi instan.

### K5 — Layar sempit (<768px)
Avatar menyusut jadi kepala 40px · panel chat = bottom-sheet penuh-lebar ·
tur TANPA terbang (bot diam, spotlight + bubble menempel elemen target) ·
gesture tangan off · semua fungsi tetap jalan.

### K5b — Ganti komputer: lewati tutorial sekali klik (keputusan user)
Profil localStorage hilang (komputer/browser baru) → bot menyapa seperti user
baru, TAPI sapaan pertama selalu menyertakan chip **"Sudah pernah pakai PRIMA —
lewati tutorial"** → satu klik menandai seluruh onboarding/tur selesai (set flag
borongan di profil baru). Tidak ada paksaan tur ulang; tawaran tur per-fitur
tetap bisa diakses manual dari panel chat kapan pun.

### K6 — Metrik keberhasilan (REKOMENDASI: lokal dulu)
F1–F4: metrik 100% lokal — fail-log + tur selesai + intent terpakai tersimpan di
profil (cap §9c); user/admin bisa lihat via perintah chat **"statistik"** dan
menyalin daftar pertanyaan-gagal untuk dilaporkan manual. Dashboard agregat di
Admin Panel (perlu endpoint + tabel) = **F5 opsional, keputusan terpisah** —
mempertahankan prinsip nol-endpoint selama mungkin.

## 9e. "Rima Belajar" — AI lokal Level 2 (Naive Bayes buatan sendiri) — **DISETUJUI, masuk F2 langsung** (user 2026-06-11)

Intent classifier machine-learning klasik, ditulis sendiri (±150 baris TS, nol
dependency), dilatih **saat build** dari GOLDEN-QUESTIONS.md → model JSON 3–10 KB
→ klasifikasi di browser < 1 ms. Dipasang sebagai **ensemble 3 lapis**:
`exact-keyword` (presisi, menang duluan) → `naive-bayes` (generalisasi parafrase)
→ `tf-idf` (jaring terakhir) → fallback chips.

### Pipeline build (`scripts/rima-train.ts`, jalan di `npm run build` + CI)
1. Parse GOLDEN-QUESTIONS.md + file contoh tambahan per intent.
2. Normalisasi: lowercase · strip tanda baca · stemming imbuhan ringan
   (me-/di-/ke-/ber-/-kan/-nya/-i) · ekspansi kamus sinonim (A2).
3. **Augmentasi otomatis** (M1): tiap contoh digandakan dengan variasi sinonim +
   typo umum (transposisi/omisi huruf) → data latih membengkak tanpa nulis manual.
4. Split **train/test 80/20** → latih (hitung prior + likelihood Laplace) → ukur
   akurasi + **confusion report** (intent yang saling tertukar dicetak ke console
   build) → tulis `lib/sentinel/model.json`.
5. Gate CI: akurasi test-set ★ ≥90% / total ≥75% (selaras K2) **+ minimal 10
   contoh per intent** — kurang → build gagal (M2: "lupa nambah contoh" mustahil
   lolos).

### Mitigasi cons (M1–M5)
| Con | Mitigasi |
|---|---|
| Lapar data | **M1**: seed = 232 golden questions hari pertama + augmentasi sinonim/typo otomatis (×3–5 lipat) + loop fail-log→label→retrain; CI enforce ≥10 contoh/intent (M2). |
| Disiplin latih ulang | **M2**: training 100% otomatis di build — tidak ada langkah manual; DoD fitur baru (K1) mewajibkan contoh kalimat; CI merah kalau intent miskin contoh. |
| Kalimat majemuk / multi-maksud | **M3**: pemecah klausa sederhana (split di "tapi/kalau/terus/dan/atau") → klasifikasi per klausa → 2 intent kuat berbeda → bot menjawab berurutan atau bertanya prioritas; + memori topik B1. |
| Salah tapi percaya diri | **M4**: threshold dikalibrasi dari test-set (titik presisi ~95%, bukan angka karangan) + margin-check (skor #1 ≈ #2 → tampilkan kandidat, jangan jawab langsung) + tombol "bukan ini?" selalu ada; klik kandidat koreksi oleh user otomatis tercatat di fail-log sebagai label baru. |
| Typo parah | **M5**: lapisan fuzzy A1 di depan + model ikut dilatih dengan varian typo (augmentasi M1) — dua arah. |

### Batas yang diterima (jujur, tidak dilawan)
Tetap bukan AI generatif: tidak mengarang kalimat, tidak menalar logika berlapis.
Untuk aplikasi prosedur keuangan ini = fitur (jawaban selalu hasil review manusia).

## 10. Kepatuhan anti-pattern

L21 komponen terpisah (bot bukan bagian god-component dpa-client) · L58
confirmDialog/toast · tooltip standar DS · token warna DS (amber/hijau/merah/purple)
· L43 rate-limit bila endpoint chat dibuat · L36 Zod · audit log silent-fail ·
JANGAN ubah `proxy.ts`/auth — bot murni client-side di fase 1-3.

## 11. Keputusan dibutuhkan user

1. ~~Nama bot~~ ✅ DIPUTUSKAN (2026-06-11): nama bot = **"RIMA"** (dari P**RIMA**; dipakai di copy: "Rima menemukan 2 entri ganda…")
2. ~~Banner sentinel lama~~ ✅ DIPUTUSKAN (2026-06-11): **tetap berdampingan** di F1
   (bot + banner), baru dihapus di F2 setelah bot terbukti stabil.
3. ~~Urutan fase~~ ✅ DIPUTUSKAN (2026-06-11): sesuai rekomendasi —
   **F1 Pengawas → F2 Chat+Rima Belajar → F3 Tur → F4 Perluasan modul**.

> Semua keputusan terjawab — konsep SIAP IMPLEMENTASI (mulai F1).

> Sudah diputuskan user 2026-06-11: scope = seluruh aplikasi · tanpa LLM (ringan,
> gratis, tanpa beban server) · guardrail anti-bocor G10–G14 wajib.
