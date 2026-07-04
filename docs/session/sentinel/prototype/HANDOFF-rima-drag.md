# Handoff — RIMA Drag &amp; Drop "Roket Lepas Landas"

> Status: **SELESAI — terintegrasi ke produksi + verified** (2026-06-15, opsi B).
> Diintegrasi ke `RimaAvatar.tsx` (nozzle/api/boost), `SentinelBot.tsx` (drag+persist), `app/globals.css` (kelas `.rima-*` flight + reduced-motion). Verifikasi live (login superadmin): diam=tampilan identik aslinya · drag=badan berputar `atan2` + 4 pendorong ber-api · boost saat cepat · lepas=mendarat tegak + persist `localStorage rima_pos` (restore saat reload) · `tsc` bersih · 0 console error.
> **Tambahan di luar purwarupa (permintaan user):** (1) **tangan juga jadi nozzle ber-api** seperti kaki (total 4 pendorong) · (2) **flame boost** — api pusat besar + semua api ×1.4 + glow terang saat drag cepat (kecepatan ≥ ambang `BOOST_SPEED`).
> Catatan integrasi: viewBox **tetap** `0 0 120 150` (BUKAN 172 spt rencana awal) — api memanjang ke bawah via `overflow:visible` yang sudah ada → tampilan diam tak bergeser di semua call-site (RimaTour, toggle). Rotasi & posisi di-set imperatif via ref (CSS var `--rima-rot` + `left/top`) → nol re-render React per-frame.
> Preview standalone: [`rima-drag-rocket.html`](./rima-drag-rocket.html) — buka di browser, seret Rima atau klik "Putar 2 dtk".

## Tujuan
Maskot RIMA (bot pojok) bisa **di-drag ke segala arah**. Saat di-drag, kaki berubah jadi
**nozzle roket ber-api** dan **seluruh kepala+badan berputar 360° menghadap arah gerak**
(kepala memimpin, semburan api ke belakang). Saat dilepas → mendarat tegak, kembali ke posisi home.

## Perilaku yang sudah jadi di purwarupa
1. **Nozzle**: 2 kaki (`<rect class="foot">`) disembunyikan saat `.flying`, muncul 2 bell-nozzle metalik + rim gelap.
2. **Api berlapis**: inti putih→biru (`#FFFFFF`→`#BFE0FF`→transparan) di dalam selubung oranye→merah (`#FFD27A`→`#EF9F27`→`#E24B4A`→transparan). Flicker `@keyframes fl` (scaleY) per-nozzle beda fase.
3. **Orientasi arah**: `rot = atan2(vy, vx)*180/π + 90` dari vektor kecepatan pointer. Smoothing lerp 0.4 (drag) / 0.5 (autoplay) + wrap-around via `norm()`. CSS `.pose{transition:transform .16s}`.
4. **Trail kecepatan**: 3 garis (`.streaks i`) menyembur ke belakang.
5. **Autoplay "Putar 2 dtk"**: orbit melingkar penuh untuk demo orientasi.
6. **`prefers-reduced-motion`**: api/trail dimatikan, rotasi diperlambat (sudah ada di HTML, WAJIB dipertahankan saat porting).

## Rencana integrasi ke produksi
| Item | Lokasi | Catatan |
|---|---|---|
| SVG maskot + nozzle/flame | `components/sentinel/RimaAvatar.tsx` | Tambah prop `flying?: boolean` + elemen `nozzle`/`flame-g`. SVG di purwarupa = salinan persis RimaAvatar + tambahan; **jangan** fork — extend komponen asli. viewBox berubah `0 0 120 150` → `0 0 120 172` (api memanjang ke bawah). |
| Keyframes `.rima-*` (fl, trail) + kelas flying | `app/globals.css` | Ikuti pola rule global `.rima-*` & `prima-del-top` yg sudah ada di sana (GPU compositor). JANGAN inline `<style>` di komponen. |
| Logika drag + orientasi | `components/sentinel/SentinelBot.tsx` | Bot di-mount sekali oleh `SentinelProvider`. Pakai pointer events + `setPointerCapture`. |
| Persist posisi | — | Simpan `{x,y}` terakhir ke `localStorage` (mis. `rima_pos`). Pertimbangkan clamp ke viewport saat resize. |
| Aksesibilitas | — | Hormati `prefers-reduced-motion`. Avatar `aria-hidden` (sudah). Drag handle perlu fallback non-pointer? (opsional) |

## Token design system (WAJIB — `docs/design/DESIGN-SYSTEM.md`)
- Amber/glow & logo P: `#EF9F27` · Api panas/danger: `#E24B4A` · Canvas: `#020F1C` · Surface card: `#042C53` · Teks dark: `#E6F1FB`.
- Info-blue trail (`#7FB6F0`/`#BFE0FF`) = turunan ramp biru; konfirmasikan ke design system bila perlu token resmi.

## Catatan / belum dikerjakan
- Purwarupa pakai posisi absolut dalam "zone". Di produksi bot mengambang di seluruh layar — perlu strategi container/portal + clamp tepi.
- Belum ada throttle pointermove (60fps cukup, tapi cek perangkat low-end).
- Konsep induk RIMA: `docs/session/sentinel/CONCEPT-rima-v3-data-aware.md` & `CONCEPT-sentinel-bot.md`.
