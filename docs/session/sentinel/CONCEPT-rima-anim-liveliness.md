# CONCEPT — RIMA "Lebih Hidup": Gesture, Auto-Terbang & Tidur di Kasur (F4d)

> Status: **konsep / belum diimplementasi**. Lanjutan dari F4b/F4c (obrolan otomatis
> proaktif) & drag "Roket Lepas Landas". Tujuan: maskot terasa hidup — melambai saat
> menyapa, sesekali terbang sendiri, dan benar-benar "rebahan" saat tidur.
> Induk: [`CONCEPT-sentinel-bot.md`](./CONCEPT-sentinel-bot.md) · drag: [`prototype/HANDOFF-rima-drag.md`](./prototype/HANDOFF-rima-drag.md)

## 0. Prinsip yang DIPERTAHANKAN (jangan dilanggar)
- **Animasi murni CSS keyframes `.rima-*` di `app/globals.css`** (GPU compositor, CPU idle ~0%). JANGAN inline `<style>` di komponen. (pola `prima-del-top`).
- **Per-frame imperatif lewat ref/CSS-var, bukan setState** (pola drag: `--rima-rot` + kelas `.rima-flying` di `.rima-pose`). Gesture berbasis state boleh (jarang berubah).
- **`prefers-reduced-motion`**: semua animasi baru WAJIB dimatikan/diperlembut di blok `@media (prefers-reduced-motion: reduce)` yang sudah ada.
- **Token DESIGN-SYSTEM** untuk warna apa pun (kasur, selimut, dst). Tidak ada hex baru di luar token.
- **G7**: tidak mengganggu saat panel/tur/modal/confirm aktif. **G1/G16**: tetap read-only, tak mengklik apa pun.
- Hormati `document.visibilityState` — animasi auto (terbang) berhenti saat tab tidak terlihat (hemat baterai, sinkron pola interval ambient).

## 1. Komponen perilaku

### A. Gesture saat menyapa / celetukan (chat & ambient)
**Sekarang:** `wave` hanya saat panel dibuka & sapaan pertama. Celetukan ambient (F4c) muncul **tanpa** gerakan.
**Target:** setiap bubble proaktif (sapaan waktu / celetukan idle / pengingat istirahat) **DAN** jawaban chat memicu **gesture acak singkat** supaya ekspresif.

- Channel: **reuse `RimaGesture`** (`components/sentinel/RimaAvatar.tsx`). Tambah varian baru:
  - `wave` (sudah ada — `.rima-g-wave .rima-arm-r`)
  - **`wave-l`** (lambai tangan kiri — variasi)
  - **`cheer`** (dua tangan terangkat singkat — untuk sapaan ceria/pengingat)
  - **`hop`** (loncat kecil — transform translateY pada `.rima-float`/root, bukan lengan)
- Pemilihan acak deterministik-ringan: helper `pickGesture()` di `SentinelBot` (boleh `Math.random` karena di event/timer, bukan jalur render — sama seperti `pickPhrase`).
- Mapping niat → kandidat gesture (biar pas konteks):
  - sapaan waktu (`AMBIENT_GREETINGS`) → `wave` / `wave-l` / `cheer`
  - pengingat istirahat (`WORK_BREAK_REMINDERS`) → `cheer` / `hop` (menarik perhatian halus)
  - celetukan idle (`IDLE_CHATTER` / `MODULE_TIPS`) → `wave` / `hop` / `point-up`
  - jawaban chat "yakin" → tetap `nod` (reaction existing); boleh tambah `wave` saat greeting/onboarding.
- Trigger: di `say()` (effect ambient F4c) panggil `setGesture(pickGesture(intent))` + reset ke `idle` via timer (~2.6s, pola existing `gestureTimer`). Untuk chat, di `answerIntent`/greeting RimaChat lewat `onReact`-style channel (atau prop baru `onGesture`).
- **Opsional (nilai tambah):** tag gesture per-frasa di `knowledge.mjs` (mis. `{ text, gesture:'cheer' }`) supaya bisa diatur penulis konten. Kalau tak ada tag → fallback `pickGesture` per kategori.

### B. Auto-terbang sendiri tiap ~6 menit, 2 detik
**Ide:** sesekali Rima "lepas landas" sendiri sebentar (orbit/hop kecil) lalu mendarat — persis autoplay "Putar 2 dtk" di purwarupa, tapi periodik & lebih kalem.

- **Reuse total mekanisme drag** yang sudah ada di `SentinelBot`: kelas `.rima-flying` (+ `.rima-boosting` opsional) di `.rima-pose`, CSS var `--rima-rot`, nozzle+api+trail. **Tidak perlu SVG baru.**
- Loop `requestAnimationFrame` 2 detik (≈ autoplay purwarupa): gerak orbit kecil di sekitar posisi home/last-pos (radius kecil ~30–40px supaya tidak "kabur" jauh), rotasi mengikuti vektor kecepatan (`atan2`), lalu **mendarat tegak** (`--rima-rot`→0, hapus `.rima-flying`) & balik ke posisi semula.
- **Timing:** konstanta `AUTO_FLY_EVERY_MS = 6 * 60_000`, `AUTO_FLY_DURATION_MS = 2_000`. Dicek di interval ambient 30 dtk (sudah ada) atau timer terpisah.
- **Guard (WAJIB):** hanya jalan bila — panel tertutup (`!openRef`), tak ada tur (`!tourRef`), **tidak sedang di-drag** (`!dragRef.active`), **tidak tidur** (auto-fly justru membangunkan? → pilih: tidak terbang saat tidur), tab terlihat (`visibilityState==='visible'`), dan `!prefers-reduced-motion` (kalau reduced-motion → skip total atau ganti "hop" kecil tanpa rotasi/api).
- **Anti-tabrakan bubble:** saat auto-fly, sembunyikan bubble (sama seperti drag `setBubble(null)`), atau tampilkan celetukan singkat "ngecek sekeliling~" (opsional, throttle).
- **Persist:** auto-fly TIDAK mengubah `rima_pos` (kembali ke posisi awal). Berbeda dari drag yang menyimpan posisi.

### ★ MATURED (2026-06-15) — Tangga "kebosanan" idle, DUA jam terpisah
Model final (menggantikan deskripsi A/B/C lama yang tercerai). Konfirmasi user lengkap.
**Kunci: ada 2 jam berjalan paralel.**

#### Jam A — "Bosan" (berbasis CHAT-idle) — jalan WALAU user aktif kerja
Pemicu = lama tak diajak ngobrol oleh user (bukan aktivitas mouse). Tangga ini **berulang
dan DIBATASI sampai NGANTUK** — TIDAK PERNAH naik ke kasur selama masih ada aktivitas page.
Reset jam A saat: user chat ke Rima / buka panel / dibangunkan dari kasur.

1. **Ngobrol sendiri** — `DOZE_ENTER_MS` (~90 dtk) tak diajak chat → nyeletuk random (F4c).
2. **Terbang bebas 10 dtk** — tiap beberapa siklus (~3 mnt) → "bosan ngobrol" → lepas landas,
   **orbit kecil di pojok home** (radius ~55–65px = orbit kecil **+25%**), **zona aman: tak
   pernah masuk tengah/menutup konten** → mendarat tegak. Boleh selingi celetukan singkat.
   Reuse total mekanisme drag (`.rima-flying` + `--rima-rot` + nozzle/api/trail). Durasi
   `AUTO_FLY_DURATION_MS = 10_000`. **Tidak ubah `rima_pos`** (balik ke pojok).
3. **Ngantuk (Zzz, BERDIRI)** — lanjut tanpa interaksi → Zzz berdiri (mata terpejam, float
   lambat) sebentar → bangun nyeletuk lagi → loop ke 1. **CAP di sini.**

Urutan terasa: ngobrol ↔ terbang berselang-seling, sesekali ngantuk, terus berulang.

#### Jam B — "Tidur nyenyak di kasur" (berbasis PAGE-idle) — SATU-SATUNYA jalan ke kasur
Pemicu = **benar-benar tak ada aktivitas user sama sekali** (mouse/keyboard/scroll/touch)
selama `SLEEP_AFTER_MS` (~10 mnt). → **rebah di kasur** (deep). Meng-**override** jam A
(batalkan ladder). Tetap tidur sampai ada aktivitas → **bangun + menggeliat (`stretch`)** →
reset jam A & B, mulai dari "Aktif".

> Penegasan user: "user beraktivitas TETAP ada animasi idle, **tapi maksimal cuma sampai
> ngantuk**, tidak sampai kasur. Kasur hanya saat benar-benar idle tanpa aktivitas sama sekali."

#### Status implementasi tangga
- ✅ **1 Ngobrol sendiri** (jam A) — doze-wake celetukan (`SentinelBot`).
- ✅ **3 Ngantuk Zzz berdiri** (jam A) — `dozing` state + `.rima-dozing` (chat-idle, tak ke kasur).
- ✅ **Jam B kasur + stretch** — `.rima-sleeping` rebah + bangun menggeliat (page-idle).
  Kasur = ranjang tampak-samping jelas (sandaran/rangka kayu `#BA7517` + kasur `#042C53` +
  bantal `#CBD8E4` kiri + selimut amber). Badan `translate(6px,31px) rotate(-82deg) scale(.56)`
  → **mengecil & rebah, kepala KIRI di bantal**, muat di atas kasur (verified live 2026-06-15).
- ✅ **2 Terbang bebas 10 dtk** (jam A) — `startAutoFly` rAF orbit pojok (lintasan lingkaran
  `dx=sin·R, dy=-(1-cos)·R` menyinggung home → melayang ke ATAS pojok, tak ke tengah),
  `AUTO_FLY_RADIUS=60` (+25%), `AUTO_FLY_DURATION_MS=10_000`, tiap `AUTO_FLY_EVERY=2` siklus.
  Reuse `.rima-flying`+`--rima-rot`. Guard panel/tur/drag/sleep + `document.hidden` +
  reduced-motion (skip terbang→ngantuk). `cancelFly` restore home (tak ubah `rima_pos`).
  Dibatalkan saat reset/chat/bed-escalate. tsc+eslint bersih.

#### Guard & aksesibilitas (semua tahap)
Panel/tur/modal tutup · tak sedang drag · tab terlihat (`visibilitychange` → pause) ·
`prefers-reduced-motion` (terbang → hop kecil tanpa api/rotasi atau skip; kasur → statis;
gesture → instan). Terbang & ngantuk TIDAK ubah `rima_pos`.

### C. Tidur "rebahan di kasur"
**Sekarang:** tidur = mata terpejam + Zzz + float lebih lambat (berdiri).
**Target:** muncul **kasur kecil** dan Rima **berbaring** di atasnya.

- **SVG baru di `RimaAvatar.tsx`** (selalu dirender, opacity 0 saat tidak tidur — pola sama seperti nozzle/flame): grup `.rima-bed`:
  - alas/frame kasur (rounded rect), bantal, selimut — warna dari token (mis. surface `#042C53`, hairline `rgba(230,241,251,.18)`, aksen amber `#EF9F27` tipis).
  - posisi di bawah badan (sekitar `y` kaki), lebar sedikit > badan.
- **Pose berbaring:** saat `.rima-sleeping`, putar seluruh maskot ~`-78°…-90°` (rebah ke kanan) via transform pada `.rima-pose`/root dengan transform-origin di titik "punggung", + sedikit translate supaya pas di atas kasur. Mata tetap terpejam (`.rima-eye scaleY` existing), antena lemas, Zzz mengambang (existing).
- **Transisi rapi:** berdiri → rebah pakai `transition: transform .5s` (bukan loop). Bangun (ada aktivitas) → kembali tegak + **gesture `stretch`** singkat (menggeliat) sebelum `idle`.
- **Reduced-motion:** tampilkan kasur + pose rebah **statis** (tanpa transisi/zzz beranimasi).
- Catatan tata-letak: maskot di pojok layar — pastikan kasur tidak keluar viewport (kasur muncul "di tempat", bukan menggeser posisi root). Kalau dekat tepi, cukup tampil apa adanya (overflow visible sudah aktif).

### D. Sentuhan kecil lain (opsional, murah)
- **Bangun = menggeliat** (`stretch`): lengan terangkat + badan memanjang 0.4s sekali saat keluar dari tidur.
- **Look-around idle**: tiap idle lama, mata/kepala bergeser kecil kiri-kanan (1 keyframe) — kesan "celingukan".
- **Mendarat dari auto-fly** → micro-`hop` + 1 kedip.
- **Hover toggle** (sudah ada scale) → boleh tambah lambaian kecil 1×.

## 2. Perubahan file (rencana)
| File | Perubahan |
|---|---|
| `components/sentinel/RimaAvatar.tsx` | + grup `.rima-bed` (kasur/bantal/selimut, opacity 0 default). Tipe `RimaGesture` + `'wave-l' \| 'cheer' \| 'hop' \| 'stretch'`. |
| `app/globals.css` | Keyframes baru: `rimaWaveL`, `rimaCheer`, `rimaHop`, `rimaStretch`; rules `.rima-g-*`; blok `.rima-sleeping` → tampilkan `.rima-bed` + transform rebah pada `.rima-pose`; tambah semua animasi baru ke blok `@media (prefers-reduced-motion)`. |
| `components/sentinel/SentinelBot.tsx` | `pickGesture(intent)` + picu gesture di `say()` (F4c). Timer **auto-fly** (reuse loop drag/`.rima-flying` + `--rima-rot`, guard panel/tur/drag/sleep/visibility/reduced-motion). Gesture `stretch` saat bangun (di `onActivity` keluar dari `sleeping`). |
| `components/sentinel/RimaChat.tsx` | (opsional) prop `onGesture` untuk memicu `wave`/`cheer` saat sapaan/jawaban chat. |
| `lib/sentinel/knowledge.mjs` | (opsional) tag `gesture` per item `AMBIENT_GREETINGS`/`IDLE_CHATTER`/`WORK_BREAK_REMINDERS`; + update `knowledge.d.mts`. |

## 3. Konstanta timing (usulan)
```
AUTO_FLY_EVERY_MS    = 6 * 60_000   // 6 menit
AUTO_FLY_DURATION_MS = 2_000        // 2 detik
GESTURE_RESET_MS     = 2_600        // reset gesture → idle (pola existing)
SLEEP_AFTER_MS       = 10 * 60_000  // (existing F4c) → mulai rebah di kasur
```
Auto-fly dicek di interval ambient 30 dtk yang sudah ada (jejak `lastAutoFlyRef`), bukan interval baru.

## 4. Aksesibilitas & kinerja
- `prefers-reduced-motion`: gesture → instan/none; auto-fly → **skip** (atau hop kecil tanpa api/rotasi); tidur → kasur+pose statis.
- `visibilitychange`: auto-fly & gesture timer berhenti saat tab tersembunyi.
- Semua animasi pakai `transform`/`opacity` (compositor). Tidak ada layout thrash. Tidak ada setState per-frame.
- Bot tetap 1 instance (mount sekali via `SentinelProvider`).

## 5. Edge cases
- Auto-fly saat user mulai drag di tengah animasi → batalkan auto-fly (cek `dragRef.active`, hentikan `raf`).
- Pindah halaman (SPA) saat auto-fly/rebah → reset (pola `pathname` effect existing yang sudah me-reset bubble/tour).
- Tidur lalu langsung diseret → bangun + masuk mode flying drag normal (hapus `.rima-bed`/pose rebah dulu).
- Auto-fly tak boleh menabrak tepi: clamp radius kecil + pakai `clampPos` existing.

## 6. Fasing (saran urut implementasi)
1. ✅ **Gesture ambient** (A) — **SELESAI** (2026-06-15). `RimaGesture` + `wave-l`/`cheer`/`hop`
   (RimaAvatar.tsx) · keyframes `rimaWaveL`/`rimaCheerL/R`/`rimaHop` + reduced-motion
   (globals.css) · `pickGesture(intent)` + map `greet`/`work`/`idle` dipicu di `say()`
   ambient (SentinelBot.tsx). tsc bersih. **Belum:** gesture saat jawaban chat (prop
   `onGesture` di RimaChat — opsional) & tag gesture per-frasa di knowledge.mjs (opsional).
2. ✅ **Tidur** (C) — **SELESAI + dikoreksi jadi 2 tingkat** (lihat "C-koreksi" di atas):
   DOZE (Zzz berdiri, chat-idle, loop bangun→nyeletuk) + SLEEP (rebah di kasur, page-idle,
   escalate). Ranjang tampak-samping + pose `rotate(-82°) scale(.56)` (kepala kiri di bantal,
   muat di atas kasur) + `stretch` saat bangun. Verified live.
3. ✅ **Terbang bebas 10 dtk** (B) — **SELESAI** (2026-06-15). Rung ke-2 jam A: `startAutoFly`
   orbit pojok (radius +25%, zona aman ke atas), tiap `AUTO_FLY_EVERY=2` siklus, reuse
   `.rima-flying`, guard penuh + reduced-motion, `cancelFly` restore home. tsc+eslint bersih.
4. **Sentuhan kecil** (D) — menggeliat, look-around, dst.

## 7. Verifikasi (saat implementasi)
- Live (login superadmin): picu celetukan (turunkan threshold sementara) → lihat gesture; tunggu/percepat auto-fly → orbit 2 dtk lalu mendarat; idle 10 mnt (atau set sementara) → muncul kasur + rebah; aktivitas → menggeliat bangun.
- `tsc --noEmit` + `eslint` bersih; 0 console error; cek `prefers-reduced-motion` (preview emulate).
