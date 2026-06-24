# Prima Web — Design System

## Overview

Prima Web reads like a government financial management platform that wants to feel both **authoritative and trustworthy**. The base atmosphere is a **deep navy canvas** (`{colors.canvas-dark}` — #020F1C) holding near-white type and a single, deliberate accent: **Prima Gold** (`{colors.primary}` — #EF9F27). That gold does almost all the brand's heavy lifting — it carries every primary CTA, every key metric headline, every "Simpan" and "Inject" button, every active sidebar indicator, and the wordmark badge itself. There is no secondary brand color. The system trusts gold's warmth against cold navy to carry both trustworthiness and urgency.

Type runs **Inter** as the primary stack for all editorial and UI copy, and a **monospace** stack (`JetBrains Mono` or `IBM Plex Mono`) for all financial figures — kode rekening, rupiah amounts, volume, and harga. Inter carries navigation, labels, paragraphs, and button copy. The mono stack appears on every number that needs to read at a glance in a dense table row.

The product is **dual-theme**: the default is dark navy (all dashboard and data surfaces), with a light mode toggle available. The same gold CTAs, teal success states, and navy-blue hairlines thread through both — only canvas, surface, and text tones flip. Financial **teal** (`{colors.financial-up}` — #1D9E75) and **red** (`{colors.financial-down}` — #E24B4A) signal positive and negative delta values in pergeseran tables across both modes.

**Key Characteristics:**
- Single accent color: `{colors.primary}` (#EF9F27) does all brand voltage — primary CTAs, active nav states, kode rekening highlights, logo badge. Used scarcely for emphasis; ubiquitous on interactive controls.
- Two-font stack: Inter for all UI copy and labels; monospace for all rupiah values, kode rekening strings, volume, and harga fields. Mixing them is not optional — mono on financial data is what makes the table readable at speed.
- Dual-theme: default dark (`{colors.canvas-dark}`); light mode available via toggle. Gold CTAs and teal/red financial signals are shared across both.
- Hierarchy through navy depth: the system uses six navy stops to express elevation — page floor, sidebar, card surface, table header, hover state, and active state. No shadows needed; depth comes from lightness steps alone.
- Table row semantics: GRANDMASTER rows use `{colors.surface-row-master}` (#0C447C background), MASTER rows use a mid-navy tint, CHILD rows sit on transparent over card surface. Obsolete inject rows receive `{colors.surface-row-obsolete}` with strikethrough text.
- Border radius is small to medium: `{rounded.sm}` (6px) for buttons and inputs, `{rounded.md}` (10px) for cards and table wrappers, `{rounded.lg}` (14px) for page-level containers and modals.
- Spacing follows a 4-multiple scale; major layout sections sit at `{spacing.section}` (48px) — tighter than marketing sites because data tables and form toolbars need density.

---

## Colors

### Brand & Accent

- **Prima Gold** (`{colors.primary}` — #EF9F27): The single brand accent. Used for primary CTA backgrounds, the wordmark badge, active sidebar icons, inject button outlines, key metric values, and column highlights in pergeseran tables. Its warmth against cold navy is the system's defining visual relationship.
- **Prima Gold Hover** (`{colors.primary-hover}` — #FAC775): The hover / focus-brighter variant. Slightly lighter gold for hover states on `{component.button-primary}`.
- **Prima Gold Dark** (`{colors.primary-bg-dark}` — #633806): A dark amber used as background on gold-tinted badges (e.g. status "Dalam Proses") over dark canvas.

### Surface — Dark Mode (Default)

- **Canvas Dark** (`{colors.canvas-dark}` — #020F1C): The primary page floor. Near-black with a deep navy tint — never pure black. All sidebar, topbar, and content areas sit on this.
- **Surface Card** (`{colors.surface-card}` — #042C53): Cards, sidebar background, dropdown menus, inject toolbar. One visible step above canvas.
- **Surface Elevated** (`{colors.surface-elevated}` — #0C447C): Table headers, active nav items, hovered rows, modal header bands. Two steps above canvas — clearly elevated without needing a shadow.
- **Surface Hover** (`{colors.surface-hover}` — #185FA5): Hover state for interactive rows and sidebar items. The most visible navy stop.

### Surface — Light Mode

- **Canvas Light** (`{colors.canvas-light}` — #F5F5F7): Page floor on light mode. **Off-white ~5%** (bukan pure white) supaya mata user tidak silau di pencahayaan rendah / kerja lama. Pattern mirip Apple system gray-6 (#F2F2F7) — netral, bersih, nyaman utk reading lama.
- **Surface Card Light** (`{colors.surface-card-light}` — #FAFAFA): Cards and sidebars on light canvas.
- **Surface Elevated Light** (`{colors.surface-elevated-light}` — #F1EFE8): Table headers, input backgrounds in light mode.

### Hairlines & Borders

- **Hairline Default** (`{colors.hairline}` — #0C447C): The standard 0.5px border on dark surfaces. Used on cards, table dividers, input outlines, and sidebar separators. Matches `{colors.surface-elevated}` — borders feel like surface steps, not ink lines.
- **Hairline Active** (`{colors.hairline-active}` — #185FA5): The 0.5px border on focused inputs and hovered cards. One step brighter than the default hairline.
- **Hairline Light** (`{colors.hairline-light}` — #D3D1C7): The 0.5px border tone on light surfaces.

### Text

- **Text Primary Dark** (`{colors.text-primary-dark}` — #E6F1FB): The strongest text on dark canvas. Headings, table cell values, active labels. Slightly blue-tinted white — never pure white, which would look fluorescent against navy.
- **Text Secondary Dark** (`{colors.text-secondary-dark}` — #B5D4F4): Default running text, table body copy, form labels on dark.
- **Text Muted Dark** (`{colors.text-muted-dark}` — #85B7EB): Captions, column headers, breadcrumbs, helper text. Works on dark canvas and card surfaces.
- **Text Primary Light** (`{colors.text-primary-light}` — #042C53): Headings and strong text on light canvas.
- **Text Secondary Light** (`{colors.text-secondary-light}` — #185FA5): Body text on light canvas.
- **Text Muted Light** (`{colors.text-muted-light}` — #378ADD): Captions and helper text on light canvas.
- **On Primary** (`{colors.on-primary}` — #020F1C): Near-black text on gold CTA backgrounds. The system's signature pairing.

### Financial Semantics

- **Financial Up / Teal** (`{colors.financial-up}` — #1D9E75): Positive delta in pergeseran tables (bertambah_berkurang > 0). Applied as text color on the delta cell. Also used for "Berhasil" status badges.
- **Financial Down / Red** (`{colors.financial-down}` — #E24B4A): Negative delta values. Same usage — text color, never card background.
- **Financial Up Background** (`{colors.financial-up-bg}` — #085041): Badge background for success states over dark canvas.
- **Financial Down Background** (`{colors.financial-down-bg}` — #791F1F): Badge background for error / danger states.

### Action Button Colors

These tokens exist specifically for interactive button surfaces. They are **not** interchangeable with the financial semantic tokens (`financial-up`, `financial-down`) even when the hex is shared — the action tokens carry UI intent, the financial tokens carry data meaning.

- **Action Danger** (`{colors.action-danger}` — #E24B4A): Background for destructive buttons (Hapus, Reset, Tolak). Text: `{colors.on-action-light}` (#FFFFFF).
- **Action Danger Hover** (`{colors.action-danger-hover}` — #C0392B): Darker red on hover for danger buttons.
- **Action Danger Bg** (`{colors.action-danger-bg}` — #791F1F): Muted background for ghost-danger buttons and danger badge backgrounds on dark canvas.
- **Action Success** (`{colors.action-success}` — #1D9E75): Background for confirm/approve buttons (Setujui, Konfirmasi, Terima). Text: `{colors.on-action-light}` (#FFFFFF).
- **Action Success Hover** (`{colors.action-success-hover}` — #158A62): Darker green on hover.
- **Action Success Bg** (`{colors.action-success-bg}` — #085041): Ghost-success and badge background on dark canvas.
- **Action Purple** (`{colors.action-purple}` — #7C5CFC): Background for submit/review-flow buttons (Ajukan, Kirim Review, Proses). Text: `{colors.on-action-light}` (#FFFFFF).
- **Action Purple Hover** (`{colors.action-purple-hover}` — #6344E0): Darker violet on hover.
- **Action Purple Bg** (`{colors.action-purple-bg}` — #2D1A6E): Ghost-purple and badge background on dark canvas.
- **Action Warning** (`{colors.action-warning}` — #BA7517): Background for cautionary action buttons (Revisi, Perhatian). Text: `{colors.on-primary}` (#020F1C).
- **Action Warning Hover** (`{colors.action-warning-hover}` — #9A5F10): Darker amber on hover.
- **On Action Light** (`{colors.on-action-light}` — #FFFFFF): White text used on colored action button backgrounds (danger, success, purple).

### Status

- **Warning** (`{colors.warning}` — #BA7517): Warning states, "Dalam Proses" badges.
- **Warning Background** (`{colors.warning-bg}` — #633806): Warning badge background on dark canvas.
- **Info** (`{colors.info}` — #378ADD): Info badges, focus rings, informational inline states.
- **Info Background** (`{colors.info-bg}` — #0C447C): Info badge background.

---

## Typography

### Font Family

The system runs **Inter** for all display, heading, body, and UI label copy. For all numerical and financial data — rupiah amounts, kode rekening strings, volume, harga — it uses a **monospace** stack (`'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace`).

The split is functional:
- Inter → navigation, headings, paragraphs, button labels, badges, form labels
- Monospace → kode rekening, rupiah values, vol/harga/jumlah cells, pergeseran delta, versi tanggal strings

Mixing them is mandatory — Inter on a rupiah cell loses the tabular-financial character; monospace on a heading paragraph feels cold and developer-only.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display}` | 22px | 500 | 1.3 | Page titles, modal headers |
| `{typography.heading-lg}` | 18px | 500 | 1.35 | Section headings, card titles |
| `{typography.heading-md}` | 15px | 500 | 1.4 | Sub-section labels, topbar title |
| `{typography.body}` | 13px | 400 | 1.6 | Default running text, table body, form labels |
| `{typography.body-sm}` | 11px | 400 | 1.5 | Captions, helper text, badge labels, column headers |
| `{typography.body-xs}` | 10px | 400 | 1.4 | Timestamps, version strings, secondary meta |
| `{typography.number-lg}` | 17px | 500 | 1.2 | Metric card values (stat cards in dashboard) — monospace |
| `{typography.number-md}` | 13px | 400 | 1.4 | Table cell rupiah values, jumlah columns — monospace |
| `{typography.number-sm}` | 11px | 400 | 1.4 | Inline kode rekening, small delta values — monospace |
| `{typography.button}` | 12px | 500 | 1 | Button labels, topbar action buttons |
| `{typography.label}` | 10px | 500 | 1 | Column header caps, section caps (uppercase, 0.08em tracking) |
| `{typography.nav}` | 13px | 400 | 1 | Sidebar tooltip labels, dropdown menu items |

### Principles

Display and heading weights stay at 500 — heavier than typical dashboards but softer than a consumer trading app. This balance fits a government financial system: authoritative but not aggressive. The system will not go to 700 for any heading; the navy-gold contrast does the visual weight work that font weight does elsewhere.

`{typography.number-md}` and `{typography.number-lg}` always render in monospace regardless of surrounding Inter copy. Rupiah amounts, kode rekening, volume, and harga must never render in Inter — tabular alignment in dense rows depends entirely on monospace metrics.

### Note on Font Substitutes

If Inter is unavailable, **Plus Jakarta Sans** is the closest substitute with the same humanist proportions and similar x-height. For the monospace stack, **JetBrains Mono** is preferred (wider numerals, better at small sizes in tables); **IBM Plex Mono** is the fallback with a slightly narrower glyph footprint.

---

## Layout

### Spacing System

- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 64px.
- **Section padding (vertical):** `{spacing.section}` (64px) — tighter than marketing sites because Prima Web pages are dense data surfaces, not editorial landing pages.
- **Card internal padding:** `{spacing.md}` (16px) for table wrapper cards; `{spacing.lg}` (24px) for stat cards and menu cards; `{spacing.sm}` (12px) for toolbar bars (inject bar, topbar action clusters).
- **Table row padding:** 6px vertical × 10px horizontal — tight enough for dense financial tables, with enough breathing room to read kode rekening strings at `{typography.number-sm}`.
- **Gutters:** `{spacing.sm}` (12px) between stat cards in 3-up grids; `{spacing.xs}` (8px) between toolbar buttons in topbar.

### App Shell Grid

- **Sidebar:** 56px fixed width, icon-only. No label text — hover tooltip only. This constraint keeps the table area maximally wide, which matters for 10-column pergeseran tables.
- **Main area:** `calc(100vw - 56px)` fluid. Carries topbar (44px fixed height) + content area (remainder).
- **Topbar:** 44px fixed height. Left: page title + version badge. Right: action button cluster (History, Inject, Lock toggle, Simpan).
- **Content area:** Scrollable. Padding `{spacing.md}` (14px) on all sides. Tables fill 100% width with `table-layout: fixed` to prevent column blowout.

### Whitespace Philosophy

Prima Web is denser than marketing sites — data tables, toolbar bars, and stat grids are stacked with minimal breathing room. The system trusts the navy depth hierarchy (six stops from canvas to active surface) to do visual separation work, not whitespace. Where whitespace appears, it follows the 4-multiple scale strictly — no ad-hoc margins.

---

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Floor | `{colors.canvas-dark}` (#020F1C), no border | Page background, content area behind cards |
| Card | `{colors.surface-card}` (#042C53) + 0.5px `{colors.hairline}` border | Sidebar, table wrappers, menu cards, modal bodies |
| Elevated | `{colors.surface-elevated}` (#0C447C) background | Table headers (`<thead>`), inject toolbar, section cap bars |
| Active / Hover | `{colors.surface-hover}` (#185FA5) background | Hovered table rows, active sidebar items, selected menu cards |
| Focus ring | `0 0 0 2px {colors.primary}` at 60% alpha | Input + button keyboard focus state |

The elevation philosophy is **flat surfaces with navy-depth separation**. Prima Web uses no drop shadows — depth comes from the lightness jump between navy stops. A `{colors.surface-card}` card over `{colors.canvas-dark}` reads clearly elevated because of the 12-step lightness difference, not shadow.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Small inline badges, tight chip pills |
| `{rounded.sm}` | 6px | Buttons, inputs, select elements, sidebar icons |
| `{rounded.md}` | 10px | Cards, table wrapper, modal bodies, menu cards |
| `{rounded.lg}` | 14px | Page-level containers, large modal frames |
| `{rounded.pill}` | 9999px | Status badges, version pills, topbar badge labels |
| `{rounded.full}` | 50% | Avatar initials circles, sidebar logo badge |

Prima Web's radius scale is tighter than consumer apps — financial government tools benefit from a crisper, more rectangular feel. The only pill shape is reserved for status badges and version labels, where a rounded pill signals "this is metadata, not an action."

---

## Components

### App Shell

**`app-sidebar`** — The 56px fixed sidebar. Background `{colors.surface-card}`. Top: logo badge (34×34px, gold background, "P" initial, `{rounded.full}`). Middle: icon nav items (36×36px, `{rounded.sm}`, `{colors.text-muted-dark}` color default, `{colors.primary}` on active, `{colors.surface-elevated}` background on active/hover). Divider: 24px wide, 0.5px, `{colors.hairline}`. Bottom: user avatar circle (28×28, `{colors.surface-hover}`, initials in `{typography.body-xs}`).

**`app-topbar`** — 44px fixed header. Background `{colors.surface-card}`, bottom border 0.5px `{colors.hairline}`. Left: page title in `{typography.heading-md}` + version badge (`{component.badge-blue}`). Right: action button cluster — History, Inject, Lock toggle, Simpan — using `{component.button-topbar}` and `{component.button-topbar-gold}`.

**`app-content`** — Scrollable content area. Background `{colors.canvas-dark}`, padding 14px. Contains stat grid, table wrappers, menu grids depending on page.

#### 🔴 App Brand Lockup & Minimize — Pattern Standar (WAJIB seragam)

Setiap app shell (BLUD, PK, Usulan, E-Anggaran, Rencana Aksi) WAJIB pakai brand lockup yang **seragam format**: **icon container + judul + sub-judul**. Hanya **glyph icon** yang dibedakan per app.

**Judul** — format tunggal `PRIMA · <Modul>` (mis. `PRIMA · BLUD`, `PRIMA · E-Anggaran`, `PRIMA · Rencana Aksi`). Gradient amber `linear-gradient(135deg,#EF9F27,#FAC775)` (dark) / ungu-pink `linear-gradient(135deg,#8B5CF6,#EC4899)` (light) via `-webkit-background-clip:text`, weight 800, letter-spacing .3px. Ukuran **16px** untuk shell top-strip (BLUD/PK, ruang lebar), **13px + `white-space:nowrap`** untuk shell left-sidebar (Usulan/E-Anggaran/RA) supaya judul panjang muat 1 baris di rail sempit.

**Icon container** — **seragam**: 36×36px, `{rounded.md}` (10px), border 1.5px, gradient amber `linear-gradient(135deg,#633806,#EF9F27)` (dark) / ungu-pink `linear-gradient(135deg,#8B5CF6,#EC4899)` (light), shadow lembut. Glyph pakai **lucide** (stroke konsisten — JANGAN emoji/teks), warna `#020F1C` (dark, kontras atas amber) / `#FFFFFF` (light). Glyph **dibedakan per app**: BLUD `Landmark`, PK `FileSignature`, Usulan `ShieldCheck`, E-Anggaran `TrendingUp`, Rencana Aksi `Target`.

**Sub-judul** — selalu `RSJD Dr. Amino Gondohutomo` (title-case, bukan singkatan/uppercase). 9–10px, `{colors.text-muted-dark}`.

**Minimize / collapse — aturan tunggal:** saat dikecilkan, **ICON selalu tetap tampil** (di-center di rail 64px), **judul + sub-judul disembunyikan**, nav jadi icon-only center, dan **tombol toggle tetap terjangkau** untuk expand. Pola rail acuan: head jadi `flex-direction:column` (icon di atas, tombol toggle di bawah); atau icon dijadikan clickable untuk expand kalau tombol toggle tak muat. **DILARANG** menyembunyikan icon brand saat collapsed.

> 2 arsitektur shell: **top-strip + ribbon** (BLUD/PK — brand permanen di strip atas, yang mengecil adalah ribbon nav) dan **left-sidebar → rail** (Usulan/E-Anggaran/RA — collapse ke rail 64px sesuai aturan di atas).

### Login

**`login-page`** — Full-page background `{colors.canvas-dark}`. Centered single card `{component.login-card}` (280px wide, `{colors.surface-card}` background, `{colors.hairline-active}` border, `{rounded.md}` radius, 28px padding).

**`login-card`** — Contains: logo row (34px gold badge + "Prima Web" in `{typography.heading-md}` + sub-label in `{typography.body-xs}` at `{colors.text-muted-dark}`); two `{component.input-dark}` fields (Username, Password); `{component.button-primary}` full-width; footer copyright in `{typography.body-xs}` centered.

### Buttons

> 🔴 **WAJIB**: Untuk primary toolbar/modal/form CTA, gunakan komponen [`<PrimaButton>`](#-primabutton--sci-fi-engraved-standar-wajib-primary-toolbar-button) (lihat section di bawah). Token-token `button-*` berikut adalah **referensi warna/variant** yang dipakai PrimaButton secara internal — JANGAN pakai sebagai inline `<button style={...}>` baru.

> 🔴 **Hapus & Unduh (komponen khusus, bukan PrimaButton)**: tombol/ikon **hapus** WAJIB pakai `<DeleteButton>` (bulat, row-action) / `<DeleteIcon>` (in-place di PrimaButton danger/kebab) — lihat section ["DeleteButton / Animated Trash"](#deletebutton--animated-trash-standar-tunggal-hapus). Tombol **export/unduh** pakai `<DownloadButton>` (PDF merah / Excel hijau, animasi) — lihat section ["DownloadButton"](#downloadbutton-tombol-export-animasi). DILARANG `<Trash2>` polos / emoji 🗑.

**`button-primary`** — Signature gold CTA. Background `{colors.primary}`, text `{colors.on-primary}` (near-black on gold), type `{typography.button}`, padding 7px × 16px, height 32px, `{rounded.sm}` (6px). Hover: `{colors.primary-hover}`. The system's one universal CTA — same appearance on dark and light canvas.

**`button-topbar`** — Compact action button for topbar clusters. Transparent background, 0.5px `{colors.hairline-active}` border, text `{colors.text-secondary-dark}`, height 28px, padding 0 × 10px, `{rounded.sm}`. Contains optional Tabler icon + label at `{typography.button}`.

**`button-topbar-gold`** — The "Simpan" variant of `{component.button-topbar}`. Background `{colors.primary}`, text `{colors.on-primary}`, same dimensions. Replaces transparent background to signal the page's primary save action.

**`button-topbar-amber`** — The "Inject" variant. Transparent background with 0.5px `{colors.primary}` border, text `{colors.primary}`, same dimensions. Signals a data-mutation action without being as heavy as the full gold fill.

**`button-ghost`** — Tertiary action. 0.5px `{colors.hairline}` border, transparent background, text `{colors.text-muted-dark}`. Used for History, Load, and informational actions.

**`button-danger`** — Destructive action (Hapus, Tolak, Reset). Background `{colors.action-danger}`, text `{colors.on-action-light}` (#FFFFFF), height 32px, padding 7px × 16px, `{rounded.sm}`. Hover: `{colors.action-danger-hover}`. Use for any irreversible delete action. Never use gold or teal for this purpose.

**`button-danger-ghost`** — Softer destructive. Transparent background, 0.5px `{colors.action-danger}` border, text `{colors.action-danger}`. Use when delete is secondary to the primary CTA on the same surface — the ghost variant signals danger without dominating the visual hierarchy.

**`button-success`** — Confirm / approve action (Setujui, Konfirmasi, Terima). Background `{colors.action-success}`, text `{colors.on-action-light}`, same dimensions as `{component.button-primary}`. Hover: `{colors.action-success-hover}`. Reserved for approval workflow endpoints — do not use for generic "Simpan" (use gold `{component.button-primary}` for save).

**`button-purple`** — Submit / review-flow action (Ajukan, Kirim Review, Proses). Background `{colors.action-purple}`, text `{colors.on-action-light}`, same dimensions. Hover: `{colors.action-purple-hover}`. Use for actions that move an item through a workflow stage but are not final approvals.

**`button-warning-action`** — Cautionary mutation (Revisi, Kembalikan). Background `{colors.action-warning}`, text `{colors.on-primary}` (near-black), same dimensions. Hover: `{colors.action-warning-hover}`. Distinct from `{component.badge-amber}` — this is an interactive button, not a status label.

### Inputs & Forms

**`input-dark`** — Standard input on dark canvas. Background `{colors.surface-elevated}`, border 0.5px `{colors.hairline-active}`, text `{colors.text-primary-dark}`, placeholder `{colors.text-muted-dark}`, `{rounded.sm}`, padding 7px × 10px, height 32px. Focus ring: `0 0 0 2px {colors.primary}` at 50% alpha.

**`select-dark`** — Same visual treatment as `{component.input-dark}`. Used for tanggal selectors, DPA acuan selectors, load history dropdowns.

**`date-input`** — `input[type=date]` with same treatment as `{component.input-dark}`. Width 140px in topbar contexts.

### Cards

**`stat-card`** — Metric summary card. Background `{colors.surface-card}`, 0.5px `{colors.hairline}` border, `{rounded.md}`, padding 10px × 12px. Label: `{typography.body-xs}` in `{colors.text-muted-dark}` above. Value: `{typography.number-lg}` in `{colors.primary}` (monospace). Sub-label: `{typography.body-xs}` in `{colors.info}` below.

**`menu-card`** — Navigation card on the BLUD hub page. Background `{colors.surface-card}`, 0.5px `{colors.hairline}` border, `{rounded.md}`, padding 14px, hover border-color `{colors.primary}`. Contains: icon box (36×36, `{colors.surface-elevated}` background, `{colors.primary}` icon, `{rounded.sm}`); title `{typography.heading-md}`; description `{typography.body-sm}` in `{colors.info}`.

**`table-wrapper`** — The outer container for all data tables. Background `{colors.surface-card}`, 0.5px `{colors.hairline}` border, `{rounded.md}`, overflow hidden. Contains `<table>` with 100% width, `border-collapse: collapse`, `table-layout: fixed`.

### Tables

#### 🔴 Satuan Combobox — Pattern Standar (WAJIB)

**Aturan**: Setiap app yang punya input "satuan" (unit of measurement) WAJIB pakai `<SatuanCombobox>` dari `components/shared/SatuanCombobox.tsx` dengan list `SATUAN_OPTIONS` dari `lib/constants.ts` — single source of truth untuk ~58 satuan lazim di lingkungan RSJD/pemerintahan/BLUD.

**Kategori list**: Kuantitas (Unit/Buah/Pcs/Set/...), Kemasan (Paket/Dos/Lusin/Rim/...), Berat/Volume (Kg/Liter/M³/...), Panjang (Meter/Cm/M²/...), Waktu (Tahun/Bulan/Jam/...), Personil (Orang/OH/OB/OJ/OK/...), Dokumen (Lembar/Rim/Eksemplar/...), Kesehatan (Pasien/Vial/Ampul/Strip/Tube/Sachet/...), Keuangan (Persen/LS), fallback (Lainnya).

#### Pattern by use case

**A) App dengan form input (Usulan Kebutuhan, future app baru)** — pakai class `form-control` supaya visual identik dengan input lain di form:
```tsx
<SatuanCombobox
  value={currentItem.satuan || ''}
  onChange={v => updateCurrent('satuan', v)}
  placeholder="Silahkan pilih…"
  inputClassName="form-control"
/>
```
Hasilnya: input punya border + padding + bg sama dengan input Nama Barang, Spesifikasi, Harga, dll. Theme-aware via existing `.form-control` rules.

**B) Table cell editing (DPA BLUD)** — TIDAK pakai `inputClassName` karena dalam `<td>` kolom yang sempit, butuh input kompak tanpa border tebal:
```tsx
<SatuanCombobox
  value={row.satuan ?? ''}
  onChange={v => updateRow(row.row_id, 'satuan', v || null)}
  style={{ color: isGM ? '#fff' : undefined }}
  placeholder="—"
/>
```
Input pakai default styling browser (kompak), color inherit dari row hierarchy.

#### Default value
WAJIB **empty string** (`''`) bukan `'Unit'`. Placeholder "Silahkan pilih…" muncul saat empty. Reasoning: user diminta pilih eksplisit, bukan asumsi default "Unit" yang bisa keliru (mis. obat satuan-nya "Vial" bukan "Unit").

```tsx
// ❌ JANGAN:
const newItem = () => ({ ..., satuan: 'Unit', ... })

// ✅ HARUS:
const newItem = () => ({ ..., satuan: '', ... })  // placeholder Silahkan pilih akan muncul
```

#### Behavior
- Search-as-you-type: filter SATUAN_OPTIONS yg match query
- Free-text: value yg user ketik tetap disimpan walaupun tidak match list (fallback untuk satuan spesifik yg tidak lazim)
- Keyboard: ↑↓ navigasi, Enter pilih, Esc tutup
- Portal dropdown (tidak terpotong scroll-wrapper / overflow:auto parent)
- Theme-safe styling via `.pj-combo-item` + `data-active` (sesuai DESIGN-SYSTEM combobox rule)

**Rule**: Saat tambah app baru yg butuh input satuan, pakai pattern A. JANGAN reinvent native `<select>` atau combobox baru.

---

#### 🔴 Table Header Light Theme — Unified Pattern (WAJIB)

**Semua tabel di seluruh aplikasi PRIMA WAJIB pakai pattern light theme yang sama** untuk header. Sebelumnya DPA BLUD pakai gradient saturated (0.95/0.85) + text putih → inkonsisten dengan E-Anggaran, Usulan, Master Akun yang sudah pakai soft pastel.

#### Standar Light Theme Header (single source of truth)
```css
background: linear-gradient(135deg, rgba(139,92,246,.49), rgba(236,72,153,.45)) !important;
color: #0F0F12 !important;  /* near-black, WCAG AA pass di atas gradient .49 saturasi */
border-bottom: 1px solid rgba(139,92,246,.22) !important;
font-weight: 700;
```

**Visual**: gradient soft pastel violet (kiri) → pink (kanan), text purple-700 (dark, readable), hairline border bawah violet 22% opacity.

#### Token reference
| Property | Value | Catatan |
|---|---|---|
| Background gradient | `linear-gradient(135deg, rgba(139,92,246,.14), rgba(236,72,153,.10))` | 14% violet → 10% pink |
| Text color | `#5B21B6` | purple-700 (kontras tinggi di white bg) |
| Border bawah | `1px solid rgba(139,92,246,.22)` | hairline violet 22% |
| Font weight | `700` | bold |

#### Existing impl (sudah pakai pattern ini)
- `[data-theme="light"] .blud-scroll-wrapper thead th` (DPA BLUD)
- `[data-theme="light"] .ma-scroll-wrapper thead th` (Master Akun, Kode Besar)
- `[data-theme="light"] .dpa-table th` (DPA BLUD inner)
- `[data-theme="light"] .ua-table th` (Usulan Kebutuhan)
- Inline `color: isLight?'#5B21B6':'#E6F1FB'` (E-Anggaran MasterTab, RealisasiTab, PendapatanCrrTab, LaporanTab, CetakTab)

#### Saat tambah tabel baru di app baru
WAJIB ikut pattern ini di light theme. JANGAN bikin gradient saturated berbeda — bikin user merasa "ini app lain" padahal masih PRIMA.

---

#### 🔴 Table Header Alignment Rule (WAJIB — no exception)

**Semua kolom header `<th>` di seluruh aplikasi PRIMA WAJIB center-aligned**, terlepas dari tipe data di body cell.

- ✅ Header label centered (readable, simetris secara visual)
- ✅ Body cells (`<td>`) tetap pakai alignment masing-masing: **right** untuk numeric (Rp, %, vol), **left** untuk text (uraian, nama)
- ❌ JANGAN set `textAlign: 'left'` atau `'right'` di inline `<th>` JSX

**Implementasi**: CSS rule project-wide di `globals.css`:
```css
table thead th,
table tr th {
  text-align: center !important;
}
```
Rule ini auto-apply ke semua `<table>` (DPA BLUD, E-Anggaran, Usulan Kebutuhan, Admin, dll) tanpa perlu edit per-file. Inline `style={{ textAlign: '...' }}` di JSX `<th>` akan ter-override.

**Kenapa**: Konsistensi visual lintas-module. Header centered = readable label, body cells tetap data-aligned. Pattern standar di app spreadsheet modern (Notion, Linear, Airtable).

**Reference impl**: `globals.css` baris ~167 — "PROJECT-WIDE — Table column header MUST be center-aligned".

---

**`table-header`** — `<thead>` background `{colors.surface-elevated}`. `<th>` padding 6px × 10px, `{typography.label}` in `{colors.text-muted-dark}`, **text-align center (WAJIB, lihat Table Header Alignment Rule)**. No bottom border — the background contrast with tbody is separation enough.

**`table-row-default`** — Standard CHILD/MEMBER row. Transparent background over `{colors.surface-card}`. `<td>` padding 6px × 10px, `{typography.body}` in `{colors.text-secondary-dark}`. Top border 0.5px `{colors.hairline}`.

**`table-row-master`** — GRANDMASTER or MASTER row. Background `{colors.surface-elevated}`. Text `{colors.text-primary-dark}`, `{typography.body}` weight 500. Jumlah value in `{colors.primary}` monospace.

**`table-row-group`** — LEADER or PLETON-LEADER row. Background `{colors.surface-elevated}` at 33% alpha tint. Text `{colors.text-primary-dark}`, weight 500.

**`table-row-active`** — A row that was recently updated by inject. No special background — the changed jumlah cell uses `{colors.primary}` text to signal the update.

**`table-row-obsolete`** — A Pergeseran row that did not match any DPA row during inject. Opacity 0.4, text `{colors.financial-down}`, `text-decoration: line-through`. Pushed to bottom of table by the two-pass sort.

**`table-cell-kode`** — Kode rekening cell. `{typography.number-sm}` monospace, `{colors.text-secondary-dark}`. Column width fixed at 100–110px.

**`table-cell-rupiah`** — Jumlah, harga, pergeseran cells. `{typography.number-md}` monospace, right-aligned. Color defaults to `{colors.text-secondary-dark}`; gold `{colors.primary}` when the row is the active/changed row; `{colors.financial-up}` for positive delta; `{colors.financial-down}` for negative delta.

**`table-cell-delta`** — Bertambah_berkurang cell. `{typography.number-md}` monospace, right-aligned. Prefix "+" for positive, no prefix for negative (sign is already implied). Color: `{colors.financial-up}` if > 0, `{colors.financial-down}` if < 0, `{colors.text-muted-dark}` if 0.

**`table-col-pergeseran`** — The 4 rightmost columns (Vol P, Harga P, Pergeseran, +/-) have a distinct background tint (`#0F3158` — a deep blue-tint between surface-card and surface-elevated). Column headers use `{colors.primary}` text instead of muted to signal editability. This visual band makes the pergeseran columns feel like a separate editable zone from the DPA read-only columns.

### Badges & Status

**`badge-green`** — Success / Berhasil. Background `{colors.financial-up-bg}` (#085041), text `{colors.financial-up}` (#5DCAA5), `{rounded.pill}`, padding 2px × 7px, `{typography.body-xs}`.

**`badge-amber`** — Warning / Dalam Proses. Background `{colors.warning-bg}` (#633806), text `{colors.primary-hover}` (#FAC775), same shape.

**`badge-red`** — Error / Gagal. Background `{colors.financial-down-bg}` (#791F1F), text `{colors.financial-down}` (#F09595), same shape.

**`badge-blue`** — Informational / Tersimpan. Background `{colors.info-bg}` (#0C447C), text `{colors.text-muted-dark}` (#85B7EB), same shape.

**`badge-version`** — Tanggal versi string in topbar. Background `{colors.surface-elevated}`, text `{colors.text-muted-dark}`, 0.5px `{colors.hairline-active}` border, `{rounded.pill}`, `{typography.body-xs}`.

### Toolbar & Controls

**`inject-bar`** — Secondary toolbar below the main topbar on Pergeseran page. Background `{colors.surface-elevated}`, bottom border 0.5px `{colors.hairline-active}`, padding 8px × 14px. Contains: label text in `{typography.body-xs}` + `{component.select-dark}` for tanggal pergeseran; label + `{component.select-dark}` for DPA acuan; `{component.badge-green}` for inject status notification.

**`light-dark-toggle`** — Pill track 32×18px, background `{colors.info-bg}` default. Thumb 14×14px circle, background `{colors.primary}`, positioned right when dark mode active. Label `{typography.body-xs}` in `{colors.text-muted-dark}` beside track.

### Versi Picker — Neo-Brutalist Outline-Only (E-Anggaran scoped)

Varian khusus VersiPickerKinerja (SSK + Realisasi). **Scoped via class** `.versi-dropdown--brutalist` — tidak mempengaruhi BLUD `VersiDropdown` (pill style tetap). Adapt dari Neo-Brutalism "The Outline Only" → tone PRIMA (purple `#7C5CFC` + amber `#EF9F27`).

**Kapan dipakai**: dropdown versi MURNI/PERUBAHAN di modul E-Anggaran yang punya semantic "snapshot terpisah". JANGAN dipakai untuk dropdown biasa (rekap bulan, sort, filter) — bentuk loud-nya akan steal focus.

**`versi-trigger` (brutalist)**:
- Bentuk: rectangle radius `4px` (BUKAN capsule 999px)
- Border `2px solid {colors.action-purple}` (#7C5CFC)
- Background `rgba(4,44,83,.55)` dark · `#FFFFFF` light
- Hard shadow `3px 3px 0 rgba(124,92,252,.40)` (purple glow, signature brutalism)
- Font: Inter, weight 700, **UPPERCASE**, letter-spacing `.04em`, size `11px`
- Padding `6px 11px`, min-width `220px`
- Active (click): `translate(1px,1px)` + shadow reduced ke 2px
- Numbers di meta (`· 16 baris`): font-family `JetBrains Mono`, lowercase

**`versi-menu` (floating cards)**:
- Container `background: transparent` (no menu bg) — biar tiap item terlihat sebagai card terpisah ("stack of version snapshots" metaphor)
- No menu border, no menu shadow
- Padding-top 5px (jarak dari trigger)

**`versi-item` (each as floating card)**:
- Border `2px solid rgba(124,92,252,.55)`, radius `4px`
- Background `{colors.surface-card}` dark · `#FFFFFF` light
- Hard shadow `2px 2px 0 rgba(124,92,252,.35)`
- Margin-bottom `5px` antar item (visual separation antar card)
- Padding `7px 10px`, font 11px weight 700 UPPERCASE
- **Hover**: bg solid purple `#7C5CFC`, color white, `translate(1px,1px)`, shadow reduced
- **Active item**: **border ganti amber** `#EF9F27` (BUKAN bg color), shadow amber `rgba(239,159,39,.45)` — tetap punchy

**`versi-badge-latest`**:
- Kotak tajam radius `2px` (sharper than other badges)
- Background `{colors.primary}` (#EF9F27 amber)
- Color `{colors.canvas-dark}` (#020F1C — high contrast)
- Border `1px solid {colors.canvas-dark}` (extra punch)
- Font 900 UPPERCASE letter-spacing `.4px`, size 8px menu / 7.5px trigger
- **Selalu visible di trigger** kalau versi aktif = latest (bukan cuma di dropdown items)

**Aturan WAJIB**:
- Numbers (jumlah baris) pakai `JetBrains Mono`, lowercase, color `#B8A7FE` dark / `#6D45F0` light
- Locked indicator: ikon `Lock` 12px opacity .6-.7, di-render inline sebelum badge LATEST
- Light mode tetap punchy — invert ke white surface + shadow purple ringan (alpha .30)
- Tidak boleh dipakai untuk dropdown non-versi (mis. dropdown bulan, sumber, filter) — keep scoped via `versi-dropdown--brutalist` class

**Trade-off vs pill style**:
- Pill (BLUD): soft, restrained, scan-able dalam baris padat
- Brutalist (Kinerja): punchy, anchor visual, signal "versi penting / arsip"
- Pilih pill untuk picker bantu, brutalist untuk picker primary navigation antar snapshot

### Select — Soft Brutalist via `<SoftSelect>` (Cetak helper dropdowns)

**Custom dropdown component** menggantikan native `<select>` untuk dark theme. Native `<option>` popup tidak bisa di-style cross-browser (selalu jadi panel putih default OS), sehingga clash dengan PRIMA dark canvas. Jalan tengah antara select biasa dan VersiPicker brutalist penuh.

**Komponen**: [`components/ui/SoftSelect.tsx`](components/ui/SoftSelect.tsx) — generic `<SoftSelect<T>>` dengan props `value`, `options[{ value, label }]`, `onChange`, optional `minWidth`/`disabled`/`placeholder`.

**Class CSS**:
- `.select-brutalist-soft` — styling trigger button (juga reusable untuk standalone button)
- `.soft-select` / `.soft-select-trigger` / `.soft-select-menu` / `.soft-select-item` — dropdown structure

**Kapan dipakai**:
- Filter dropdown di toolbar `no-print` CetakTab (`rekapBulan`, `rekapDepth`, `cetakBulan`)
- Helper dropdown lain yang butuh **konsistensi visual dengan VersiPicker brutalist** tanpa loud-ness penuh
- Setiap tempat yang sebelumnya pakai native `<select>` di dark theme — wajib migrate ke `<SoftSelect>`

**JANGAN dipakai** untuk dropdown utama yang harus stand-out (VersiPicker → `.versi-dropdown--brutalist`) atau form input native yang butuh browser autocomplete.

**Spec trigger** (`.select-brutalist-soft` + `.soft-select-trigger`):
- Bentuk: rectangle radius `4px` (sharp match VersiPicker, BUKAN 8px)
- Border `1.5px solid {colors.action-purple}` (#7C5CFC) — lebih tipis dari brutalist penuh (2px)
- Background `rgba(4,44,83,.55)` dark · `#FFFFFF` light
- **TANPA hard shadow** — perbedaan utama vs VersiPicker brutalist
- Chevron ikon Lucide `<ChevronDown size={12}>` — rotate 180° saat open (BUKAN background-image SVG)
- Font Inter weight 600, size `11.5px`, letter-spacing `.02em` (NOT uppercase)
- Padding `6px 10px`, gap 8px ke chevron
- Hover: border `#9B82FF`, bg purple `rgba(124,92,252,.12)`
- Focus: outline 2px purple `rgba(124,92,252,.5)`
- Disabled: opacity .5, cursor not-allowed

**Spec dropdown menu** (`.soft-select-menu`):
- Position absolute, top `calc(100% + 4px)`, full width trigger (min-width 100%)
- Background `{colors.surface-card}` (#042C53) dark · `#FFFFFF` light
- Border `1.5px solid {colors.action-purple}` + radius `4px`
- Hard shadow `2px 2px 0 rgba(124,92,252,.30)` — soft brutalism (tidak setajam VersiPicker brutalist 3px)
- Padding `4px`, max-height `280px` dengan `overflow-y: auto`
- Z-index 60 (di atas toolbar)

**Spec item** (`.soft-select-item`):
- Padding `6px 10px`, radius `3px` (subtle pill di dalam menu)
- Font 11.5px weight 600 letter-spacing `.02em` (NOT uppercase)
- Default color `{colors.text-primary-dark}` · `#1F2937` light
- Hover: bg `rgba(124,92,252,.20)`, color white
- **Active item**: bg `rgba(239,159,39,.15)` amber tint, color `#FBBF24`, font-weight 700, ikon ✓ `Check size={12}` color amber di kanan

**Trade-off**:
- Lebih restrained dari VersiPicker brutalist (no uppercase, shadow lebih tipis, item bukan floating card)
- Lebih konsisten daripada native select (popup match dark theme)
- Bukan native `<select>` → kehilangan native keyboard combobox behavior (panah atas/bawah saat menu close masih perlu dibuka manual dengan Enter/Space). Trade-off acceptable untuk konteks visual-first.

**Migration dari native `<select>`**:
```tsx
// BEFORE: native, popup jelek di dark theme
<select value={x} onChange={e => setX(e.target.value)}>
  <option value="a">Label A</option>
</select>

// AFTER: SoftSelect custom dropdown
<SoftSelect
  value={x}
  onChange={(v) => setX(v)}
  options={[{ value: 'a', label: 'Label A' }]}
  minWidth={160}
/>
```

### 🔴 PrimaButton — Sci-Fi Engraved (STANDAR WAJIB primary toolbar button)

**WAJIB** komponen tombol primary untuk **seluruh PRIMA**. Adapt dari Concept 4 "Sci-Fi Engraved" → design token PRIMA. **Chamfered corner** (clip-path polygon) + **3px left accent stripe** per variant.

**Status roll-out**: ✅ **Applied global** per 2026-05-28 — E-Anggaran, Perjanjian Kinerja, BLUD (semua sub-modul), Usulan Kebutuhan (15 panel + 5 modal + shell) sudah migrated. **App baru / fitur baru WAJIB pakai PrimaButton sejak commit pertama**, bukan native `<button>` inline-styled (mis. `className="btn btn-primary"` atau `style={btnPrimary}`) atau shadcn `<Button>`.

**Komponen**: [`components/ui/PrimaButton.tsx`](components/ui/PrimaButton.tsx) — props `variant`, `size`, `iconLeft`, `iconRight`, plus standard `<button>` attrs.

**Class CSS**: `.btn-prima` base + `[data-variant=...]` + `[data-size=...]`.

**🔴 WAJIB dipakai untuk**:
- Primary toolbar button (Simpan, Inject, Tambah, Excel, PDF, Print, Hapus Semua, Buat Baru, Import, dll)
- Header action button (Form Baru, Finalisasi, Unduh, Sinkronkan)
- Form action button (Submit, Cancel, Reset)
- Modal CTA button (Mengerti, Konfirmasi, Batal, Ya/Tidak, Lanjutkan)
- Empty-state CTA (Mulai Form Baru, Buat Pertama Kali)

**❌ JANGAN dipakai untuk**:
- Row-action button kecil: **hapus WAJIB pakai `<DeleteButton>` (bulat) / `<DeleteIcon>` (in-place) — lihat section "DeleteButton / Animated Trash"**; ✏️ edit inline / ⬆️⬇️ geser baris tetap inline `<button>` atau shadcn icon button. Tombol export/unduh pakai `<DownloadButton>` (lihat section "DownloadButton").
- Pagination chevron (◀ ▶ ⏮ ⏭) — tetap inline icon
- Modal close X — tetap inline icon
- Tab pill / nav toggle (TabPill, ribbon nav) — tetap custom
- Filter chip toggle (legend chips, status filter) — tetap chip-style
- Versi picker (pakai `<VersiPickerKinerja>` / `.versi-dropdown--brutalist`)
- Dropdown filter (pakai `<SoftSelect>`)
- Search "Jump" inline tag — tetap inline
- Shell navigation (sidebar, mobile menu, year picker, profile dropdown, logout) — tetap custom shell button

**Variant mapping (semantic — WAJIB ikuti):**
| Kebutuhan | Variant | Contoh tombol |
|---|---|---|
| CTA utama save | `primary` | Simpan, Simpan Semua, Submit, Mulai Form Baru |
| Approve/konfirmasi | `success` | Finalisasi, Inject, Sinkronkan, Excel, Merge, Impor |
| Destructive | `danger` | Hapus, Wipe, Reset, Replace All, PDF (jika export critical) |
| Review/submit-flow | `purple` | Tambah, Buat Pergeseran, Ajukan, Unduh Word, Form Baru, Buat Form |
| Caution mutation | `warning` | Revisi, Kembalikan |
| Secondary/cancel | `ghost` | Batal, Tutup, Muat Ulang, Format (helper) |

**Variants** (semua dengan left-border 3px accent):
| Variant | Stripe | Text dark | Text light | Untuk |
|---|---|---|---|---|
| `primary` | `#EF9F27` amber | `#FBBF24` | `#B45309` | CTA utama (Simpan, Submit) |
| `success` | `#1D9E75` green | `#4ADE80` | `#047857` | Approve, Inject, OK |
| `danger`  | `#E24B4A` red | `#FCA5A5` | `#B91C1C` | Hapus, Reject |
| `purple`  | `#7C5CFC` purple | `#B8A7FE` | `#5B21B6` | Review, Ajukan, Versi-related |
| `warning` | `#BA7517` warning | `#FBBF24` | `#8B5710` | Revisi, Caution |
| `ghost`   | (no stripe) | `#E6F1FB` | `#1F2937` | Excel, PDF, Cancel (secondary) |

**Sizes**:
| Size | Padding | Font | Untuk |
|---|---|---|---|
| `sm` | `6px 12px` | 11px | Compact toolbar dense |
| `md` (default) | `8px 16px` | 12px | Standard toolbar |
| `lg` | `10px 22px` | 13px | Modal CTA hero |

**Spec base**:
- Background `{colors.surface-card}` dark / `#FFFFFF` light
- 1px border hairline `rgba(133,183,235,.30)` dark / `rgba(15,15,18,.10)` light
- 3px left border = accent stripe (override 1px left)
- **Chamfered corner**: `clip-path: polygon(5px 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%, 0% 5px)` — sudut atas-kiri & bawah-kanan terpotong 5px
- Font Inter weight 600 size 12px letter-spacing `.01em` (NOT uppercase — biar tidak kelelahan saat dipakai banyak)
- Hover: bg tint match variant accent color (alpha .12-.14)
- Active: `transform: translateY(1px)` (tactile feedback)
- Disabled: opacity `.45`, cursor not-allowed
- Focus: `box-shadow: 0 0 0 2px rgba(124,92,252,.55)` ring (PAKAI box-shadow, BUKAN outline — karena clip-path memotong outline)

**Aksesibilitas**:
- Focus ring pakai `box-shadow` ring 2px purple — visible meski clip-path memotong corners
- `disabled` state opacity drop + cursor not-allowed
- `data-variant` exposed via data-attribute → easy testing/styling per state

**Usage example**:
```tsx
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import DeleteIcon from '@/components/ui/DeleteIcon'
import DownloadButton from '@/components/ui/DownloadButton'
import { Save, Download } from 'lucide-react'

<PrimaButton variant="primary" iconLeft={<Save size={14} />} onClick={save}>
  Simpan Semua
</PrimaButton>

<PrimaButton variant="success" iconLeft={<Download size={14} />} onClick={inject}>
  Inject Rekening
</PrimaButton>

{/* Hapus: ikon trash animasi (DeleteIcon) di dalam PrimaButton danger — teks dipertahankan */}
<PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />} onClick={destroy}>
  Hapus Semua
</PrimaButton>

{/* Row delete icon-only → tombol bulat animasi */}
<DeleteButton onClick={del} data-tooltip="Hapus baris" />

{/* Export download (Rencana Aksi) → tombol animasi, PDF merah / Excel hijau */}
<DownloadButton variant="pdf" label="PDF" onClick={exportPdf} />
<DownloadButton variant="excel" label="Excel" onClick={exportExcel} />
```

**Roll-out completed** (2026-05-28): semua 4 app (E-Anggaran, PK, BLUD, Usulan) primary buttons sudah migrated dalam 8 commit. **App / fitur baru WAJIB pakai PrimaButton sejak commit pertama** — code review akan REJECT PR yang masih introduce native `<button style={...}>` atau `className="btn btn-primary"` atau shadcn `<Button>` untuk primary toolbar/modal/form CTA. Lihat L48 di `docs/audit/AUDIT_LESSONS_LEARNED.md` untuk anti-pattern + cara cek via grep.

### Modals & Overlays

**`modal-overlay`** — Faux-viewport wrapper `min-height: 400px`, background `rgba(2, 15, 28, 0.85)` (canvas-dark at 85%). Uses normal-flow flex centering (no `position: fixed`).

**`modal-card`** — Centered modal body. Background `{colors.surface-card}`, 0.5px `{colors.hairline-active}` border, `{rounded.lg}`, padding 24px. Header band uses `{colors.surface-elevated}` tint. Confirm CTA: `{component.button-primary}`. Cancel: `{component.button-ghost}`.

### Scroll Wrapper untuk Tabel Besar

**`blud-scroll-wrapper` / `ma-scroll-wrapper`** — Container scrollable untuk tabel data panjang (DPA, Pergeseran, Master Akun, Kode Besar).

- `max-height: 65vh` (60vh untuk Master Akun), `overflow-y: auto`, `overflow-x: auto`
- `border-radius: 10px`, `border: 1px solid {colors.hairline-active}`
- `thead th { position: sticky; top: 0; z-index: 3; }` — header selalu visible saat scroll
- **Sticky row L1 (TOTAL/GRANDMASTER)**: `tbody .row-grandmaster td { position: sticky; top: 36px; z-index: 2; }` — agar total selalu kelihatan saat scroll jauh
- Theme-aware: dark = `#042C53`, light = `#FFFFFF` dengan thead gradient ungu-pink

**JANGAN** pakai pagination untuk tabel dengan hierarki parent-child (DPA/Pergeseran) — memotong konteks. Pagination OK untuk tabel flat (Master Akun, Kode Besar).

### BLUD Table v2 — DPA & Pergeseran (Spec Opsi D-4)

**Status:** ACTIVE per 2026-05-26. Apply via `className="blud-scroll-wrapper v2"` + `className="dpa-table v2"`. CSS source: `app/globals.css` blok "BLUD v2 — Spec-faithful redesign" (Opsi D-4, Section 1c/1d).

#### Anatomi Row
- **Container** (`<tr>`): `background: #042C53` (PRIMA navy surface) · `border-radius: 8px` via `td:first-child` + `td:last-child` · gap 6px antar row (`border-spacing: 0 6px` di `table { border-collapse: separate }`)
- **Border-left accent** (`td:first-child`): `4px solid <level-color>` + `padding-left: 16px` (jarak konten dari edge colored)
- **Glow gradient** (`td:first-child::before`): width 80px, `linear-gradient(90deg, rgba(<level>,.20), rgba(<level>,0))` — efek subtle warna level di sisi border
- **Hover state**: `background: #334155` (slate-700) + `color: #FFFFFF` di semua td, transition 150ms

#### Palet Per-Level Border + Glow (15 level)
Map class `lv-l1 .. lv-l81` mirror `TIPE_LABEL` order (lib/blud/format.ts):

| Class | Level (TIPE) | Hex border-left | Glow alpha |
|---|---|---|---|
| `.lv-l1`  | GRANDMASTER (Level 1)        | `#EF9F27` (PRIMA primary)   | rgba(239,159,39,.20)  |
| `.lv-l2`  | MASTER (Level 2)             | `#1D9E75` (PRIMA success)   | rgba(29,158,117,.20)  |
| `.lv-l21` | CHILD (Level 2.1)            | `#7C5CFC` (PRIMA purple)    | rgba(124,92,252,.20)  |
| `.lv-l3`  | LEADER (Level 3)             | `#BA7517` (PRIMA warning)   | rgba(186,117,23,.20)  |
| `.lv-l31` | MEMBER (Level 3.1)           | `#D946EF` (fuchsia accent)  | rgba(217,70,239,.20)  |
| `.lv-l4`  | PLETON-LEADER (Level 4)      | `#06B6D4` (cyan accent)     | rgba(6,182,212,.20)   |
| `.lv-l41` | PLETON-MEMBER (Level 4.1)    | `#38BDF8` (sky accent)      | rgba(56,189,248,.20)  |
| `.lv-l5`  | KETUA-KELOMPOK-A (Level 5)   | `#F97316` (orange accent)   | rgba(249,115,22,.20)  |
| `.lv-l51` | ANGGOTA-KELOMPOK-A (Lv 5.1)  | `#FB923C` (orange-light)    | rgba(251,146,60,.20)  |
| `.lv-l6`  | KETUA-KELOMPOK-B (Level 6)   | `#F43F5E` (rose)            | rgba(244,63,94,.20)   |
| `.lv-l61` | ANGGOTA-KELOMPOK-B (Lv 6.1)  | `#FB7185` (rose-light)      | rgba(251,113,133,.20) |
| `.lv-l7`  | L7-HEAD (Level 7)            | `#6366F1` (indigo)          | rgba(99,102,241,.20)  |
| `.lv-l71` | L7-SUB (Level 7.1)           | `#818CF8` (indigo-light)    | rgba(129,140,248,.20) |
| `.lv-l8`  | L8-HEAD (Level 8)            | `#94A3B8` (slate-400)       | rgba(148,163,184,.20) |
| `.lv-l81` | L8-SUB (Level 8.1)           | `#CBD5E1` (slate-300)       | rgba(203,213,225,.20) |

#### Header Thead (dark mode)
- Background: `#0C447C` SOLID (bukan rgba) — wajib opaque supaya saat sticky-scroll konten di bawah tidak bleed
- Text: `#FAC775` (amber) + `font-weight: 800` + `text-transform: uppercase` + `letter-spacing: .08em` + `font-size: 10.5px`
- Border-bottom: `1px solid #185FA5`
- **Box-shadow tebal**: `0 6px 0 #0F172A, 0 8px 8px rgba(0,0,0,.25)` — strip 6px solid menutup gap `border-spacing` saat sticky

#### Header Thead (light mode)
- Background: `linear-gradient(135deg, #8B5CF6, #EC4899)` — SOLID purple-pink mix
- Text: `#FFFFFF` + `text-shadow: 0 1px 1px rgba(0,0,0,.18)` (readability)
- Border-bottom: `1px solid rgba(139,92,246,.5)`
- Box-shadow override: `0 6px 0 #F5F5F7, 0 8px 8px rgba(0,0,0,.08)` (light color, jangan pakai `#0F172A` dark)

#### Sticky L1 Row (GRANDMASTER)
- `position: sticky; top: 36px; z-index: 2`
- BG opaque (dark: `#042C53`, light: `#FFFFFF`) + box-shadow `0 6px 0 #0F172A, 0 10px 12px rgba(0,0,0,.35)` (dark) / `0 6px 0 #F5F5F7, 0 10px 12px rgba(0,0,0,.10)` (light)
- Hover tetap jalan: `#334155` (dark) / `#F1F5F9` (light)

#### Struktur Kolom DPA (per 2026-05-26 split)
10 kolom (sebelumnya 9, +1 NEW kolom paling kiri):

| # | Kolom | Width | Konten |
|---|---|---|---|
| 1 | **NEW** | 100px | Checkbox + panah geser ↑↓ horizontal (flex side-by-side, BUKAN stack vertical) |
| 2 | Level Badge | 48px (-50% dari 95px) | Pill `.blud-level-badge` L1/L2/L2.1 standalone |
| 3 | Kode Rekening | 140px | Input readonly, font mono |
| 4 | Uraian | auto (shrink ~10%) | Combobox MasterAkun |
| 5 | Vol | 76px | Input number |
| 6 | Satuan | 114px (-5% dari 120px) | SatuanCombobox |
| 7 | Harga (Rp) | 148px | Input formatted rupiah |
| 8 | Jumlah (Rp) | 158px | Computed readonly |
| 9 | Penanggung Jawab | 124px | PenanggungJawabCombobox |
| 10 | Aksi | 44px | Kebab menu |

Pergeseran TIDAK ada kolom 1+2 (langsung mulai dari Kode Rekening) karena struktur tabel beda.

### Row Hover (DPA / Pergeseran / Master Akun / Kode Besar)

**Aturan WAJIB**: Hover row harus jelas terlihat tanpa peduli warna asli row. Gunakan solid dark gray overlay.

- Dark mode: `background: #1F2937 !important` + teks putih + amber strip `#FBBF24` 4px di kiri (`inset 4px 0 0`)
- Light mode: `background: #111827 !important` + teks putih + amber strip `#EF9F27` 4px di kiri
- Input/select di dalam row hover: `background: rgba(255,255,255,.10)` + border `rgba(255,255,255,.35)`
- Transition: `120ms`

Pakai `!important` untuk override row-color (yang juga `!important`). Strip amber kiri = visual indicator hover state.

### Kebab Menu Action (Kolom AKSI Tabel)

**Pattern** menggantikan multiple action buttons inline (yang overflow kolom sempit).

**Trigger** `blud-act-kebab` 24×24 dengan ikon `MoreVertical`, border `rgba(255,255,255,.15)` dark / `rgba(0,0,0,.12)` light.

**Popup** `.blud-act-menu` — horizontal toolbar berisi tombol icon (`Plus` = Tambah, `<DeleteIcon>` = Hapus) styling sama dengan `.blud-act-{add,sibling,del}` lama. Tombol Hapus pakai `<DeleteIcon>` (animasi lid-rotate) — bukan `<Trash2>`. WAJIB render via `createPortal(...)` ke `document.body` + `position: fixed` dengan koordinat dari `triggerRef.current.getBoundingClientRect()`. Tujuan: escape clipping dari scroll-wrapper.

**Auto-flip**: kalau `spaceBelow < MENU_HEIGHT + 12px` → flip ke atas (`top: trigger.top - 4 - MENU_H`). Mencegah popup ke-clip di baris paling bawah.

**Close handler**: outside click + scroll (capture phase) + resize.

### Filter Chip — Toggle Pill (Legend Functional)

**`blud-legend-chip`** — Toggle pill iOS-style untuk legend level di bar atas DPA/Pergeseran. UPDATE 2026-05-26 (sebelumnya chip kotak dengan swatch persegi).

- **Shape**: pill rounded `border-radius: 20px` (fully rounded) · padding `4px 12px 4px 5px` (asimetris: kiri sempit utk knob, kanan lebar utk label)
- **Knob `.swatch`**: circle 16×16px, `border-radius: 50%`, border putih 2px, drop-shadow `0 1px 3px rgba(0,0,0,.35)`. Warna fill ikut level (inline style `item.bg`)
- **Label**: font-size 11.5px, font-weight 600, di sebelah kanan knob
- **State `is-active`** (default tampil): bg `rgba(255,255,255,.10)`, text putih
- **State `is-hidden`** (level disembunyikan): opacity `.45`, knob jadi abu-abu `#6B7280 !important` (override warna level)
- **Hover**: bg `rgba(255,255,255,.10)`, border lebih terang
- **Tooltip**: pakai `[data-tooltip]` (CSS pseudo standar) — wajib ada utk affordance "Sembunyikan/Tampilkan {level}"
- **Group chip "Level Lainnya"**: single toggle multi-level (L5..L8.1) dengan knob gradient multi-color
- **Light mode**: bg `rgba(0,0,0,.04)`, hover `rgba(0,0,0,.07)`, active `rgba(0,0,0,.06)` + text `#111827`. Knob border `#FFFFFF` + shadow `0 1px 2px rgba(0,0,0,.18)`

### Pagination

**Pattern** untuk tabel flat 50 baris/page (default `PAGE_SIZE = 50`).

- 5 tombol: ChevronsLeft (first), ChevronLeft (prev), badge `[N / Total]`, ChevronRight (next), ChevronsRight (last)
- Page badge: background `rgba(239,159,39,.15)` + border `rgba(239,159,39,.30)`, padding 5px 10px, min-width 60px
- Tombol pager: 28×28, border `1px solid #185FA5`, disabled opacity `.35`
- Auto-reset ke page 1 saat filter/search berubah
- "Tambah Baris" lompat ke last page (langsung lihat row baru)

### Search Jump (Cari di Tabel Hierarki)

**Pattern** input search + tombol "Jump" → auto-scroll ke first match + highlight 2.5s.

- Match logic: `kode_rekening.includes(q) || uraian.includes(q)` case-insensitive
- Scroll: `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Highlight: `@keyframes blud-row-flash` box-shadow `inset 0 0 0 3px #FBBF24` + glow amber, fade 2.5s
- Auto un-hide level kalau match-nya kebetulan ke-filter (filter chip aktif)
- Toast "Tidak ada match" kalau gagal

### Confirm Modal — Destructive (Kode Random 4-Digit)

**Pattern WAJIB** untuk aksi destructive permanen (hapus versi DPA, hapus snapshot, dll).

- Generate kode 4-digit random (`Math.floor(1000 + Math.random() * 9000)`) saat modal open
- Tampilkan kode di kotak merah: `font-family: monospace`, `font-size: 22px`, `font-weight: 800`, `letter-spacing: 4px`, `color: #FCA5A5`
- Input wajib match (numeric only, maxLength 4)
- Tombol Hapus disabled sampai kode match
- Border input berubah hijau `#10B981` saat match
- Pesan "Kode tidak cocok" muncul setelah 4 digit diketik tapi tidak match

JANGAN pakai checkbox saja atau modal konfirmasi biasa untuk aksi permanen — rentan mis-click.

### Tombol Menu (Top Bar Standardization)

**Pattern WAJIB** untuk tombol "Menu" di top bar setiap modul (konsisten antar E-Anggaran, BLUD, Usulan).

- Icon `Home` (Lucide), size 13
- Label: **"Menu"** (pendek, BUKAN "Kembali ke Menu")
- Padding `5px 10px`, border-radius 8px, fontSize 11, fontWeight 700
- Border: dark = `1.5px solid #185FA5`, light = `1.5px solid rgba(0,0,0,0.15)`
- Hover: dark = border + color amber `#EF9F27`, light = border + color purple `#6D28D9` + bg `rgba(139,92,246,0.06)`
- onClick → `router.push('/menu')`

### Versi Dropdown (Pill + LATEST Badge)

**`versi-trigger`** + `versi-menu` — Custom pill-shaped dropdown untuk pilih versi DPA/Pergeseran.

- Trigger: `min-width: 260px`, padding 6px 12px, border-radius 999px, History icon + label + (opsional) badge
- Badge LATEST muncul di trigger SAAT selected = versi terbaru (item[0] dari history desc). Background `#10B981`, font 8.5px (varian trigger lebih kecil dari menu)
- Menu: `min-width: 280px`, border-radius 10px, max-height 320px scroll
- Theme-aware: dark = `#042C53` + cyan accent, light = `#FFFFFF` + purple accent

### Combobox / Dropdown Item List — Theme-Safe Styling (WAJIB)

**Aturan**: Untuk komponen combobox (search-as-you-type dropdown), **JANGAN inline `color` / `background` di button item via JSX style prop**. Pakai **className + `data-active` attribute**, style murni di CSS theme-aware.

**Kenapa**: Inline style `color: '#FFFFFF'` (didesain untuk dark theme) **kalah cascade** dengan CSS `globals.css` rule yang punya `!important` (mis. `.row-master td input { color: #FFFFFF !important }`) atau dengan light theme override. Hasilnya: text invisible (white-on-cream) di light theme, mustahil di-fix kecuali refactor inline.

#### ❌ JANGAN (anti-pattern)
```tsx
<button
  style={{
    background: i === highlight ? 'rgba(239,159,39,.18)' : 'transparent',
    color: i === highlight ? '#FFFFFF' : '#E6F1FB',  // hardcoded dark-theme color
  }}
>{label}</button>
```

#### ✅ HARUS (data-attribute pattern)
```tsx
// Component: hanya struktural inline style (padding, font-size, border, cursor)
<button
  className="pj-combo-item"
  data-active={i === highlight ? '1' : '0'}
  style={{
    padding: '6px 10px', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 12,
  }}
>{label}</button>
```

```css
/* globals.css — Default (dark theme): canvas dark + amber highlight */
.pj-combo-item {
  color: #E6F1FB;
  background: transparent;
}
.pj-combo-item[data-active="1"] {
  color: #FFFFFF;
  background: rgba(239,159,39,.18);
}
/* Light theme override: white canvas + purple highlight */
[data-theme="light"] .pj-combo-item {
  color: #1F2937;
  background: transparent;
}
[data-theme="light"] .pj-combo-item[data-active="1"] {
  color: #5B21B6;
  background: rgba(139,92,246,.12);
}
```

#### Token highlight (kedua tema)
| State | Dark | Light |
|---|---|---|
| Idle text | `#E6F1FB` | `#1F2937` |
| Idle bg | transparent | transparent |
| Active text | `#FFFFFF` | `#5B21B6` (purple-700) |
| Active bg | `rgba(239,159,39,.18)` amber | `rgba(139,92,246,.12)` lavender |

#### Existing implementation reference
- `components/blud/PenanggungJawabCombobox.tsx` + CSS `.pj-combo-item` di `globals.css`
- `components/blud/MasterAkunCombobox.tsx` + CSS `.ma-combo-item` (pattern serupa)

**Rule**: Setiap combobox dropdown baru WAJIB pakai pattern ini sejak awal. JANGAN reinvent dengan inline color/bg.

### Number Input Spinner — Hidden Project-Wide (WAJIB)

**Aturan**: Native number spinner WAJIB di-hide **di seluruh app PRIMA**, no exception. Selector global `input[type="number"]`.

**Kenapa**:
- Di tabel keuangan sempit (DPA BLUD, E-Anggaran) — spinner overlap teks nominal
- Di form input (Usulan Kebutuhan, Admin, dll) — spinner native browser tidak follow theme. Light mode (canvas cream) → spinner icon cream → invisible. Dark mode → spinner gelap di atas canvas dark.
- Konsistensi UX: semua field numerik behave sama project-wide

```css
input[type="number"] {
  -moz-appearance: textfield;  /* Firefox */
  appearance: textfield;
  accent-color: #FBBF24;
}
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none; appearance: none; margin: 0;
}
```

**User experience**: Ketik manual (digit), atau focus + keyboard ↑/↓ untuk increment — keduanya tetap fungsional. Visual lebih bersih, konsisten antar tema.

**Rule**: Saat tambah app baru dengan numeric input, **JANGAN** override rule ini per-component. Pattern global sudah handle semua.

### Date Input Theme

**Aturan**: Native `<input type="date">` calendar icon HARUS visible di kedua tema. Pakai `color-scheme` CSS property.

```css
input[type="date"] { color-scheme: dark; }
[data-theme="light"] input[type="date"] { color-scheme: light; }
```

`color-scheme` membuat browser render picker UI sesuai tema — icon kalender otomatis adapt (putih di dark, gelap di light).

### Warning Banner Destructive

**Pattern** untuk peringatan permanent action (di Pengaturan, Modal konfirmasi, dll).

- Background `rgba(239,68,68,.10)`, border `1px solid rgba(239,68,68,.35)`, border-radius 10px
- Padding `10px 14px`, font-size 11.5px, color `#FCA5A5`
- Icon `AlertTriangle` size 16 (color = bg accent merah)
- Heading bold `#FECACA` dengan kata kunci "Peringatan:" / "Permanen"

### Tooltips — **STANDAR TUNGGAL** (WAJIB diikuti)

**Aturan:** Seluruh tooltip di aplikasi WAJIB pakai 1 style yang sama. JANGAN pakai native HTML `title` attribute (kotak putih browser-default) karena tidak konsisten dengan tema.

**Token:**
- Dark mode: `linear-gradient(135deg, #EF9F27, #FAC775)` background + `#020F1C` text + amber shadow `rgba(239,159,39,.35)`
- Light mode: `linear-gradient(135deg, #8B5CF6, #EC4899)` background + `#FFFFFF` text + purple shadow `rgba(139,92,246,.40)`
- Font: 11px, weight 700, letter-spacing .2px
- Padding: 5px 10px, border-radius 6px
- Arrow segitiga 7px ke bawah (≈ panah sub-ribbon)
- Animasi: fade-in 180ms ease-out + translate-up 4px

**2 cara implementasi (pilih sesuai konteks):**

1. **CSS pseudo `::after`** (paling simple) — untuk tombol di kontainer yang TIDAK punya `overflow:auto/hidden`:
   ```html
   <button data-tooltip="Tambah Anak" class="my-btn">+</button>
   ```
   ```css
   .my-btn[data-tooltip]::after { ... /* sama dengan .blud-act[data-tooltip]::after */ }
   ```
   Reference implementasi: `.blud-act[data-tooltip]` di `app/globals.css`.

2. **Portal-based via createPortal** (WAJIB) — untuk tombol di dalam scroll-wrapper / kontainer yang clip pseudo (`overflow:auto`):
   ```tsx
   const [hover, setHover] = useState(false)
   const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null)
   function handleEnter() {
     const r = triggerRef.current!.getBoundingClientRect()
     setTipPos({ top: r.top - 6, left: r.left + r.width / 2 })
     setHover(true)
   }
   {hover && tipPos && createPortal(
     <div className="blud-tip-portal" style={{ position: 'fixed', top: tipPos.top, left: tipPos.left }}>
       Tooltip text
     </div>,
     document.body
   )}
   ```
   Reference class: `.blud-tip-portal` di `app/globals.css` (sudah theme-aware).

**Mana yang dipakai kapan:**
- Kalau tombol di sticky / modal / topbar (tidak ada ancestor `overflow:auto`) → pakai CSS pseudo (`data-tooltip`)
- Kalau tombol di scrollable table / nested scroll area → pakai portal helper

**Variant — tooltip muncul DI BAWAH (tambahan attribute `data-tooltip-pos="below"`):**
Untuk tombol di top bar / area sticky atas yang tooltip default (atas) ke-clip oleh viewport top edge.
```html
<button data-tooltip="Kecilkan menu" data-tooltip-pos="below">…</button>
```
CSS rule sudah ada universal — tinggal tambah attribute. Panah segitiga otomatis flip ke atas.

**Variant — tooltip muncul DI KANAN (`data-tooltip-pos="right"`):**
Untuk **sidebar collapsed / rail icon-only** (nav vertikal). Tooltip keluar ke kanan trigger.
```html
<button data-tooltip="Realisasi" data-tooltip-pos="right">…</button>
```
⚠️ Rail tooltip pos="right" gampang ke-clip ancestor `overflow:auto`. Pastikan wrapper rail `overflow:visible` saat collapsed (rail pendek tak butuh scroll) **dan** elemen sidebar `position:relative;z-index` di atas konten — kalau `position:static`, `z-index` tak aktif dan konten (DOM setelahnya) menimpa tooltip. Ref fix: `app/(dashboard)/rencana-aksi/_components/Sidebar.tsx`.

**JANGAN:**
- ❌ HTML `<button title="...">` (browser-native, kotak putih) — **berlaku semua tombol di semua menu**. Konversi `title="X"` → `data-tooltip="X"` (+ `data-tooltip-pos` sesuai posisi). Pengecualian: `title` yang BUKAN tooltip (mis. prop komponen `<Modal title>`, `<PanelHeader title>`) tetap boleh.
- ❌ Bikin gradient/style tooltip sendiri di luar 2 standar di atas
- ❌ Library tooltip eksternal kecuali ada justification kuat (a11y, complex positioning)

---

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (#EF9F27) for CTAs, active nav states, metric values, and inject-changed cells. Its scarcity against cold navy is what makes it powerful — every gold pixel signals importance.
- Keep `{component.button-primary}` (gold with near-black text) as the universal primary CTA on both dark and light canvas. The same button appears identically in both modes.
- Use monospace for every financial figure. Kode rekening, rupiah amounts, volume, harga, jumlah, pergeseran — all monospace. Inter on a jumlah cell breaks tabular alignment.
- Distinguish GRANDMASTER, MASTER, and CHILD rows with background stops from the navy depth scale, not color hues. The hierarchy should read through lightness, not rainbow coding.
- Keep the `{component.table-col-pergeseran}` band visually distinct with its `#0F3158` tint — it must be immediately clear which columns are editable (Vol P, Harga P) and which are read-only (injected from DPA).
- Apply `{colors.financial-up}` and `{colors.financial-down}` to delta cells as text color only. Never as card background fills.
- Use `{component.badge-green}` immediately after a successful Inject or Simpan action to confirm the operation without a modal interruption.

### Don't
- Don't introduce a second **brand** color. The system has exactly one brand accent (`{colors.primary}`). Action button colors (`action-danger`, `action-success`, `action-purple`, `action-warning`) are semantic utility tokens — they are not brand colors and must not appear in the logo, sidebar active state, or primary CTA position.
- Don't use gold for table body text or large surface fills. It is for focal-point actions and key metrics only. A table row with gold text in every cell loses its signal value.
- Don't use `{colors.financial-up}` or `{colors.financial-down}` for generic "success" or "error" states unrelated to financial delta. Teal means "the number went up"; red means "the number went down" — they carry semantic budget meaning, not generic UI feedback.
- Don't soften heading weight below 500. `{typography.display}` and `{typography.heading-lg}` at 500 look authoritative on dark navy — dropping to 400 reads as decorative, not governmental.
- Don't add atmospheric gradients, mesh backgrounds, or glow effects to the canvas. The navy depth hierarchy does all the surface separation work.
- Don't round corners to pill shapes on table rows or section containers. `{rounded.pill}` is reserved for badges and version labels only. Large pill-shaped cards feel consumer-app, not government-financial.
- Don't invert `{component.button-primary}`'s text color. Near-black on gold (`{colors.on-primary}` on `{colors.primary}`) is the system's signature — white text on gold loses contrast and brand recognition.

---

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar collapses to bottom tab bar; topbar drops secondary action labels (icon-only); tables scroll horizontally in wrapper; stat grid drops to 1-up; menu grid 1-up |
| Tablet | 768–1024px | Sidebar stays at 56px; topbar shows icons + key labels only; tables show 6 core columns, pergeseran columns hidden behind scroll; stat grid 2-up |
| Desktop | 1024–1440px | Full layout: 56px sidebar + full topbar + all table columns visible; stat grid 3-up |
| Wide | > 1440px | Same as desktop; content max-width 1400px centered; outer canvas visible on sides |

### Touch Targets
- `{component.button-primary}` minimum 32px height — meets WCAG AA with surrounding spacing.
- Sidebar icon items are 36×36px tap target with 4px gap between items — at least 40px effective vertical target.
- Table rows minimum 32px height — enough for touch selection with enough density for desktop data review.

### Table Collapse Strategy
- At tablet, the four `{component.table-col-pergeseran}` columns (Vol P, Harga P, Pergeseran, +/-) become horizontally scrollable but the first three columns (Kode, Uraian, Jumlah) stay sticky.
- At mobile, tables switch to a card-per-row layout showing kode rekening, uraian, and jumlah only. Pergeseran detail opens in a bottom sheet.
- The inject toolbar's date selectors stack vertically at mobile instead of inline.

---

## Theme Toggle Behavior

Light mode mengganti canvas, surface, text, brand accent, dan action button tone. **Default: dark.** User preference disimpan ke `localStorage`; OS `prefers-color-scheme` dipakai sebagai fallback awal jika belum ada stored preference.

### Canvas, Surface & Text

| Token | Dark value | Light value |
|---|---|---|
| `{colors.canvas-dark/light}` | #020F1C | #FAFAFB |
| `{colors.surface-card}` | #042C53 | #FFFFFF |
| `{colors.surface-elevated}` | #0C447C | #F4F4F7 |
| `{colors.hairline}` | #0C447C | #E5E5EA |
| `{colors.text-primary}` | #E6F1FB | #0F0F12 |
| `{colors.text-secondary}` | #B5D4F4 | #3A3A42 |
| `{colors.text-muted}` | #85B7EB | #8A8A95 |

### Brand Accent (berubah di light)

| Token | Dark value | Light value |
|---|---|---|
| `{colors.primary}` — CTA utama (Simpan) | `#EF9F27` gold solid | `linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)` gradient ungu-pink |
| `{colors.primary-hover}` | `#FAC775` | `brightness(1.08)` pada gradient |
| `{colors.brand-tint-50}` | — | `#F5F0FF` (badge bg ungu tipis) |
| `{colors.brand-tint-100}` | — | `#EDE4FF` (hover ringan) |

### Action Buttons (disesuaikan kontras untuk white bg)

| Token | Dark value | Light value | Keterangan |
|---|---|---|---|
| `{colors.action-danger}` | #E24B4A | #E53E3E | Lebih gelap ~5% |
| `{colors.action-danger-hover}` | #C0392B | #C53030 | Lebih gelap ~5% |
| `{colors.action-danger-bg}` | #791F1F | #FFF5F5 | Flip ke pastel terang |
| `{colors.action-success}` | #1D9E75 | #0B8A63 | Lebih gelap ~10% |
| `{colors.action-success-hover}` | #158A62 | #096B4D | Lebih gelap ~10% |
| `{colors.action-success-bg}` | #085041 | #F0FDF8 | Flip ke pastel terang |
| `{colors.action-purple}` | #7C5CFC | #7C5CFC | **Sama — tidak berubah** |
| `{colors.action-purple-hover}` | #6344E0 | #6344E0 | **Sama** |
| `{colors.action-purple-bg}` | #2D1A6E | #F5F0FF | Flip ke pastel terang |
| `{colors.action-W}` | #BA7517 | #B45309 | Lebih gelap ~5% |
| `{colors.action-W-hover}` | #9A5F10 | #92400E | Lebih gelap ~5% |
| `{colors.action-W-bg}` | #633806 | #FFFBEB | Flip ke pastel terang |

### Financial Semantics (disesuaikan kontras untuk white bg)

| Token | Dark value | Light value |
|---|---|---|
| `{colors.financial-up}` | #1D9E75 | #059669 — lebih gelap untuk white bg |
| `{colors.financial-up-bg}` | #085041 | #ECFDF5 — pastel terang |
| `{colors.financial-down}` | #E24B4A | #DC2626 — lebih gelap untuk white bg |
| `{colors.financial-down-bg}` | #791F1F | #FEF2F2 — pastel terang |

### Border Radius (soft di light)

| Token | Dark value | Light value |
|---|---|---|
| `{rounded.sm}` — button, input | 6px | 8px |
| `{rounded.md}` — card, modal | 10px | 12px |
| `{rounded.lg}` — container | 14px | 16px |

### Depth Strategy

| | Dark | Light |
|---|---|---|
| Cara membuat depth | 6 navy stops (no shadow) | Soft shadows (`shadow-sm/md/lg`) |
| Shadow default card | tidak ada | `0 2px 8px rgba(15,15,18,.06)` |
| Shadow hover card | tidak ada | `0 8px 24px rgba(15,15,18,.08)` |
| Shadow CTA button | tidak ada | `0 2px 8px rgba(139,92,246,.25)` |

---

## Iteration Guide

1. Focus on one component at a time. Reference its token key directly (`{component.button-primary}`, `{component.table-row-master}`).
2. When adding a new page, decide first whether its tables are read-only (DPA BLUD — no editable columns) or editable (Pergeseran — pergeseran band editable). This determines whether `{component.table-col-pergeseran}` tint appears.
3. Variants of an existing component (`-hover`, `-active`, `-disabled`) live as separate entries in `components:` — never as nested state objects.
4. Use `{token.refs}` everywhere prose mentions a color, a radius, a typography role, or a spacing value.
5. Never document hover animations. The system documents Default and Active/Pressed states only.
6. All rupiah values use monospace; all editorial copy uses Inter. Mixing them is a system violation.
7. Financial teal and red are semantic delta tokens — never repurpose them for generic "success" or "error" UI states.

---

## Known Gaps

- Animation and transition timings (row highlight flash on inject, table sort transitions) are not in scope for this version.
- Form validation states beyond `{component.input-dark}` focus defaults are not yet specified — error/success input border variants need the login flow and save-failure states to finalize.
- The print / PDF export layout for DPA BLUD and Pergeseran reports is not documented here — it requires a separate light-only print stylesheet.
- Role-based UI differences (admin sees "Kelola Pengguna", staff does not) are product behavior, not design system tokens.
- Chart and data visualization components (rekapitulasi pie chart, anggaran bar chart) are not in this version — they require a dedicated charting sub-system once the data schema is confirmed stable.
- Mobile bottom-tab-bar component for sidebar collapse at < 768px is specified behaviorally but not yet detailed at component level.

---

> **CATATAN PEMBACA:** Seluruh spec di atas (sejak baris pertama) adalah **TEMA DARK (Default — Navy + Gold)** — identitas utama Prima Web.
> Di bawah ini adalah **TEMA LIGHT (Alternative — Soft + Gradient Ungu-Pink)** sebagai opsi tema kedua, terinspirasi dari AI Popovers Component (@davidm_ai). Tema ini ditujukan untuk konteks UI yang membutuhkan kesan **lembut, premium, modern AI-product** — misalnya popover kontekstual, AI assistant panel, atau halaman onboarding.

---

# Prima Web — Design System (Tema Light / Soft Gradient)

> Referensi: AI Popovers Component oleh @davidm_ai
> Sumber: [learning.atheros.ai/ui-components/ai-popovers](https://learning.atheros.ai/ui-components/ai-popovers)
> Mode: **Light Only** (alternatif untuk konteks AI/popover, **bukan pengganti** tema dark utama)

## 1. Konsep & Tujuan

AI Popovers adalah kumpulan komponen popover interaktif berbasis AI dengan tampilan **modern, soft, dan glassmorphism**. Setiap popover dipicu oleh **trigger card** yang ketika diklik akan menampilkan konten kontekstual (model picker, status, user card, form, dll).

Karakter visual utama:

- **Light & airy** — dominasi putih dengan aksen ungu/pink lembut
- **Soft shadows** — bayangan halus, tidak tajam
- **Rounded corners** — sudut bulat di mana-mana
- **Gradient accents** — gradien ungu→pink sebagai aksen brand
- **Minimal & clean** — banyak white space, tipografi rapi

---

## 2. Color Tokens (Light Mode)

### Background

| Token | Hex | Penggunaan |
|---|---|---|
| `--bg-base` | `#FAFAFB` | Background halaman utama (off-white) |
| `--bg-surface` | `#FFFFFF` | Permukaan kartu, popover |
| `--bg-subtle` | `#F4F4F7` | Background trigger button, chip |
| `--bg-hover` | `#EEEEF2` | State hover untuk elemen subtle |
| `--bg-gradient-soft` | `linear-gradient(180deg, #FDFBFF 0%, #F6F3FB 100%)` | Background hero / section |

### Text

| Token | Hex | Penggunaan |
|---|---|---|
| `--text-primary` | `#0F0F12` | Heading utama, judul |
| `--text-secondary` | `#3A3A42` | Body text |
| `--text-muted` | `#8A8A95` | Label, caption, meta |
| `--text-numbered` | `#A5A5B0` | Angka indikator (1, 2, 3...) |

### Brand / Accent (Gradient Ungu–Pink)

| Token | Hex | Penggunaan |
|---|---|---|
| `--brand-primary` | `#8B5CF6` | Ungu utama |
| `--brand-secondary` | `#EC4899` | Pink |
| `--brand-gradient` | `linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)` | CTA button, judul highlight |
| `--brand-tint-50` | `#F5F0FF` | Background sangat tipis (untuk badge) |
| `--brand-tint-100` | `#EDE4FF` | Hover ringan |

### Border

| Token | Hex | Penggunaan |
|---|---|---|
| `--border-default` | `#ECECEF` | Border kartu |
| `--border-subtle` | `#F2F2F5` | Pembatas dalam |
| `--border-focus` | `#8B5CF6` | State focus / aktif |

### Semantic / Status

| Token | Hex | Penggunaan |
|---|---|---|
| `--success` | `#10B981` | Status sukses (neutral, untuk icon/text saja) |
| `--warning` | `#F59E0B` | Peringatan (neutral) |
| `--info` | `#3B82F6` | Informasi |
| `--notification` | `#8B5CF6` | Badge notifikasi |

### Action Buttons (PRIMA semantics — light-adapted)

| Token | Hex | Bg Ghost | Penggunaan |
|---|---|---|---|
| `--action-danger` | `#E53E3E` | `#FFF5F5` | Hapus, Tolak, Reset |
| `--action-danger-hover` | `#C53030` | — | Hover danger button |
| `--action-success` | `#0B8A63` | `#F0FDF8` | Setujui, Konfirmasi, Terima |
| `--action-success-hover` | `#096B4D` | — | Hover success button |
| `--action-purple` | `#7C5CFC` | `#F5F0FF` | Ajukan, Kirim Review, Proses |
| `--action-purple-hover` | `#6344E0` | — | Hover purple button |
| `--action-warning` | `#B45309` | `#FFFBEB` | Revisi, Perhatian |
| `--action-warning-hover` | `#92400E` | — | Hover warning button |
| `--on-action` | `#FFFFFF` | — | Teks di atas semua action button |

### Financial Semantics (light-adapted)

| Token | Hex | Background | Penggunaan |
|---|---|---|---|
| `--financial-up` | `#059669` | `#ECFDF5` | Delta positif (+), Berhasil badge |
| `--financial-down` | `#DC2626` | `#FEF2F2` | Delta negatif (−), Gagal badge |

### Status Badges (pastel light)

| Badge | Background | Text | Penggunaan |
|---|---|---|---|
| Success | `#ECFDF5` | `#059669` | Berhasil, Disetujui |
| Danger | `#FEF2F2` | `#DC2626` | Gagal, Ditolak |
| Warning | `#FFFBEB` | `#B45309` | Dalam Proses, Revisi |
| Info | `#EFF6FF` | `#2563EB` | Diajukan Review |
| Purple | `#F5F0FF` | `#7C5CFC` | Menunggu Telaah |
| Brand pill | `linear-gradient(135deg, #8B5CF6, #EC4899)` | `#FFFFFF` | Label brand, versi |

---

## 3. Typography (Light Theme)

```css
--font-sans: 'Inter', 'SF Pro Display', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', monospace;
```

| Scale | Size | Weight | Penggunaan |
|---|---|---|---|
| `display` | 48px / 56px | 700 | "AI Popovers" hero |
| `h1` | 32px / 40px | 600 | Section title |
| `h2` | 24px / 32px | 600 | Card title |
| `h3` | 18px / 26px | 600 | Popover title |
| `body` | 15px / 22px | 400 | Body text |
| `label` | 13px / 18px | 500 | Label trigger |
| `caption` | 11px / 16px | 600 (uppercase, tracking 0.08em) | "CONTEXT", "LATENCY", dll |

> **Catatan:** Tema light pakai weight lebih berat (600–700) untuk heading karena kontras dengan background putih lebih lemah daripada navy. Berbeda dengan tema dark yang cukup 500.

---

## 4. Spacing & Layout (Light Theme)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

**Grid utama:** 2 kolom, gap 16–20px, padding container 24px.

---

## 5. Radius & Shadow (Light Theme)

### Radius
```css
--radius-sm: 8px;     /* Chip, badge */
--radius-md: 12px;    /* Button, input */
--radius-lg: 16px;    /* Trigger card */
--radius-xl: 20px;    /* Popover panel */
--radius-full: 9999px; /* Pill (OPENAI badge) */
```

### Shadow (soft, untuk light mode)
```css
--shadow-xs: 0 1px 2px rgba(15, 15, 18, 0.04);
--shadow-sm: 0 2px 6px rgba(15, 15, 18, 0.05);
--shadow-md: 0 8px 20px rgba(15, 15, 18, 0.06);
--shadow-lg: 0 16px 40px rgba(139, 92, 246, 0.10);  /* sedikit nuansa ungu */
--shadow-popover: 0 20px 48px rgba(15, 15, 18, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.02);
```

> **Beda dengan tema dark:** tema dark **tidak pakai shadow sama sekali** — depth diciptakan via 6 navy stops. Tema light **wajib pakai shadow** karena dominan putih tidak punya stop yang cukup.

---

## 6. Komponen Utama (Light Theme)

### 6.1 Trigger Card

Kartu putih dengan label di kiri-atas (nomor + nama) dan tombol trigger di tengah-bawah.

```
┌─────────────────────────────┐
│ ① Basic                     │
│                             │
│        [ Details ]          │
│                             │
└─────────────────────────────┘
```

**Spec:**
- Background: `--bg-surface`
- Border: `1px solid --border-default`
- Radius: `--radius-lg` (16px)
- Padding: 20px
- Shadow: `--shadow-sm`
- Number badge: lingkaran 24px, bg `--brand-tint-50`, text `--text-numbered`
- Hover: shadow naik ke `--shadow-md`, border `--brand-tint-100`

### 6.2 Trigger Button (di dalam card)

- Background: `--bg-subtle`
- Text: `--text-secondary`, 13px / 500
- Padding: 10px 18px
- Radius: `--radius-md`
- Hover: bg `--bg-hover`
- Active: bg putih + border `--brand-primary`

### 6.3 Popover Panel

Panel yang muncul saat trigger diklik.

**Spec:**
- Background: `--bg-surface` (putih murni)
- Radius: `--radius-xl` (20px)
- Padding: 20px
- Shadow: `--shadow-popover`
- Border: `1px solid rgba(0,0,0,0.03)`
- Backdrop: opsional `backdrop-filter: blur(8px)` untuk efek glass
- Animasi muncul: `scale(0.96) → scale(1)` + `opacity 0 → 1`, durasi 180ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`

### 6.4 Model Picker (contoh isi popover)

```
┌────────────────────────────┐
│ ← Back                     │
│                            │
│ GPT-5            [OPENAI]  │  ← pill badge gradient
│                            │
│   1M       $12      45ms   │
│ CONTEXT  /1M TOK  LATENCY  │
│                            │
│  ┌──────────────────────┐  │
│  │    Select Model      │  │  ← gradient button
│  └──────────────────────┘  │
└────────────────────────────┘
```

- **Header "Back":** text `--text-muted`, 13px, ikon chevron 14px
- **Model name "GPT-5":** 22px / 700, `--text-primary`
- **OPENAI pill:** bg `--brand-gradient`, text white, padding 4px 10px, radius full, 11px uppercase tracking 0.06em
- **Stats row:** 3 kolom flex, gap 16px
  - Value (1M / $12 / 45ms): 18px / 600, `--text-primary`
  - Label (CONTEXT / /1M TOK / LATENCY): caption style, `--text-muted`
- **CTA "Select Model":** width 100%, height 44px, bg `--brand-gradient`, text white 14px/600, radius 12px, shadow `--shadow-lg`

### 6.5 Badge & Pills

| Tipe | Background | Text | Contoh |
|---|---|---|---|
| Brand pill | `--brand-gradient` | white | OPENAI |
| Notification dot | `--notification` | white | "3" di bell icon |
| Status chip | `--brand-tint-50` | `--brand-primary` | Status indicator |

### 6.6 Gradient Border (komponen #9)

Kartu dengan border gradien tipis sebagai aksen:
```css
.gradient-border {
  background: linear-gradient(#fff, #fff) padding-box,
              linear-gradient(135deg, #8B5CF6, #EC4899) border-box;
  border: 1.5px solid transparent;
  border-radius: 16px;
}
```

---

## 7. Daftar 10 Komponen Popover

| # | Nama | Trigger Label | Konten Popover |
|---|---|---|---|
| 1 | Basic | Details | Info dasar / deskripsi |
| 2 | Model Selector | Select Model | List model AI + spec |
| 3 | Training Status | Status | Progress bar, log status |
| 4 | User Card | @david_ai | Avatar, nama, bio mini |
| 5 | Nested Menu | Actions (⋮) | Sub-menu bertingkat |
| 6 | Form | Add Label | Input field + submit |
| 7 | Notification | 🔔 (3) | List notifikasi |
| 8 | Command Palette | ⌘K | Search + shortcut |
| 9 | Gradient Border | Showcase | Demo border gradient |
| 10 | Token Breakdown | $0.042 | Detail biaya token |

---

## 8. Interaction & Motion (Light Theme)

- **Trigger click:** scale `0.97` selama 80ms (feedback tekan)
- **Popover open:** fade + scale dari titik trigger, 180ms ease-out
- **Popover close:** reverse, 120ms ease-in
- **Hover trigger:** transisi `box-shadow` 200ms
- **Gradient button hover:** brightness `1.05` + shadow naik

```css
@keyframes popover-in {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

---

## 9. Accessibility (Light Theme)

- Kontras teks minimum **WCAG AA** (4.5:1) — `--text-primary` di `--bg-surface` ≈ 18:1 ✓
- Tombol trigger: `role="button"`, `aria-haspopup="dialog"`, `aria-expanded`
- Popover: `role="dialog"`, fokus terjebak di dalam, `Esc` untuk menutup
- Gradient pill: tetap menyertakan text label (bukan hanya warna)
- Min target tap: 44×44px di mobile

---

## 10. Implementasi (CSS Variables — Light Theme)

```css
:root[data-theme="light"] {
  /* ── Canvas & Surface ── */
  --bg-base:          #FAFAFB;
  --bg-surface:       #FFFFFF;
  --bg-subtle:        #F4F4F7;
  --bg-hover:         #EEEEF2;
  --bg-gradient-soft: linear-gradient(180deg, #FDFBFF 0%, #F6F3FB 100%);

  /* ── Text ── */
  --text-primary:   #0F0F12;
  --text-secondary: #3A3A42;
  --text-muted:     #8A8A95;
  --text-numbered:  #A5A5B0;

  /* ── Brand / Primary CTA (ganti gold) ── */
  --brand-primary:   #8B5CF6;
  --brand-secondary: #EC4899;
  --brand-gradient:  linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);
  --brand-tint-50:   #F5F0FF;
  --brand-tint-100:  #EDE4FF;

  /* ── Border ── */
  --border-default: #E5E5EA;
  --border-subtle:  #F2F2F5;
  --border-focus:   #8B5CF6;

  /* ── Shadow (ganti depth navy stops) ── */
  --shadow-xs:      0 1px 2px rgba(15, 15, 18, 0.04);
  --shadow-sm:      0 2px 8px rgba(15, 15, 18, 0.06);
  --shadow-md:      0 8px 24px rgba(15, 15, 18, 0.08);
  --shadow-lg:      0 16px 40px rgba(139, 92, 246, 0.12);
  --shadow-popover: 0 20px 48px rgba(15, 15, 18, 0.10), 0 0 0 1px rgba(0, 0, 0, 0.03);
  --shadow-btn-primary: 0 2px 8px rgba(139, 92, 246, 0.25);

  /* ── Radius (lebih rounded dari dark) ── */
  --radius-xs:   4px;
  --radius-sm:   8px;   /* button, input (dark: 6px) */
  --radius-md:   12px;  /* card, modal (dark: 10px) */
  --radius-lg:   16px;  /* container (dark: 14px) */
  --radius-xl:   20px;  /* popover */
  --radius-pill: 9999px;

  /* ── Action Buttons (light-adapted, kontras WCAG AA di white) ── */
  --action-danger:        #E53E3E;
  --action-danger-hover:  #C53030;
  --action-danger-bg:     #FFF5F5;   /* ghost bg */
  --action-danger-text:   #C53030;   /* ghost text */

  --action-success:       #0B8A63;
  --action-success-hover: #096B4D;
  --action-success-bg:    #F0FDF8;
  --action-success-text:  #0B8A63;

  --action-purple:        #7C5CFC;
  --action-purple-hover:  #6344E0;
  --action-purple-bg:     #F5F0FF;
  --action-purple-text:   #7C5CFC;

  --action-warning:       #B45309;
  --action-warning-hover: #92400E;
  --action-warning-bg:    #FFFBEB;
  --action-warning-text:  #B45309;

  --on-action: #FFFFFF; /* teks di atas semua action button */

  /* ── Financial Semantics (light-adapted) ── */
  --financial-up:      #059669;
  --financial-up-bg:   #ECFDF5;
  --financial-down:    #DC2626;
  --financial-down-bg: #FEF2F2;

  /* ── Status Badges ── */
  --badge-success-bg:   #ECFDF5;  --badge-success-text: #059669;
  --badge-danger-bg:    #FEF2F2;  --badge-danger-text:  #DC2626;
  --badge-warning-bg:   #FFFBEB;  --badge-warning-text: #B45309;
  --badge-info-bg:      #EFF6FF;  --badge-info-text:    #2563EB;
  --badge-purple-bg:    #F5F0FF;  --badge-purple-text:  #7C5CFC;
}
```

> **Cara pakai toggle:** set `data-theme="light"` di `<html>` tag saat user klik toggle. Default (tanpa attribute) = dark.

---

## 11. Catatan Tone Visual (Light Theme)

- **Mood:** lembut, premium, modern AI-product
- **Hindari:** warna jenuh, shadow tajam, kontras ekstrem
- **Tekankan:** white space yang bernapas, gradien sebagai "moment" bukan dominasi, mikro-interaksi yang halus

> Filosofi: *"Quiet UI, loud moments"* — antarmuka tenang, tapi aksen gradien dan animasi popover memberi karakter yang berkesan.

---

## 12. Perbandingan Tema Dark vs Light

| Aspek | Tema Dark (Default) | Tema Light (Alternatif) |
|---|---|---|
| **Konteks pakai** | Dashboard, tabel data BLUD/usulan, halaman utama PRIMA | Popover AI, panel onboarding, modal kontekstual |
| **Background dominan** | Deep navy (`#020F1C`) | Off-white (`#FAFAFB`) |
| **Brand accent** | Prima Gold (`#EF9F27`) — solid, single accent | Ungu-Pink gradient (`#8B5CF6 → #EC4899`) — gradient accent |
| **Depth strategy** | 6 navy stops (no shadow) | Shadows (soft, halus) |
| **Font weight heading** | 500 (cukup karena kontras navy-white tinggi) | 600–700 (kontras putih-grey lebih lemah) |
| **Radius scale** | 4–14px (rectangular feel) | 8–20px (rounded, friendly) |
| **Type semantic** | Authoritative, governmental | Premium, soft, AI-product |
| **Financial tokens** | Teal/red untuk delta, monospace untuk angka | Tidak ada konteks financial (popover AI saja) |

> **Aturan kapan pakai mana:**
> - Default untuk seluruh modul PRIMA (Usulan, BLUD, Kinerja, Admin) → **Tema Dark**.
> - Kalau menambah fitur AI assistant, popover kontekstual, atau halaman premium baru → boleh pakai **Tema Light (Soft)**.
> - **Dilarang** mencampur token dari dua tema di komponen yang sama (mis. gold CTA dengan background putih → pakai gradient CTA kalau di tema light).

---

## 12. BLUD — Layout & Token Khusus

> Modul BLUD pakai layout berbeda dari modul lain (Usulan / E-Anggaran pakai sidebar vertikal). BLUD pakai **Top Ribbon Nav** karena menu sedikit (3 tile) → real-estate sidebar 228px sia-sia, content jadi full-width.
>
> File referensi: `app/(dashboard)/blud/blud-shell.tsx`, `app/(dashboard)/blud/dashboard-client.tsx`, `app/(dashboard)/blud/page.tsx`.

### 12.1 Struktur Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo💰] PRIMA · BLUD                  [← Kembali] [🌙] [User▼]    │ ← Brand strip (sticky, 58px)
├─────────────────────────────────────────────────────────────────────┤
│  [📊]    [📄]      [🔀]                                              │ ← Ribbon (sticky, ~80px)
│ Dashboard DPA BLUD Pergeseran                                       │
│         ── ANGGARAN ──                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│              Page content (full-width)                              │
│                                                                      │
```

- **Brand strip**: sticky top, padding `10px 20px`, blur backdrop 16px.
- **Ribbon nav**: sticky top:58, gap 18px antar group, padding `10px 20px 6px`. Horizontal scroll kalau overflow.
- **Tile**: icon-on-top (36×36 r10) + label-bottom (11.5px w600). Active = border accent color + gradient bg + box-shadow glow.
- **Section label**: di **bawah** tile group (bukan di atas), 9px w800 uppercase letter-spacing 1.4px, opacity .7.
- **Mobile (≤768px)**: ribbon disembunyikan, hamburger toggle reveal sebagai vertical drawer.

### 12.2 Token Warna Tile (icon-variety palette)

> Token ini **eksklusif untuk identitas modul/menu** (tile, ikon sidebar, KPI card). **TIDAK** dipakai untuk CTA, alert, atau status financial. Untuk CTA tetap pakai `{component.cta-primary}` (gradient violet→pink).

| Modul / Konteks | Warna Hex | Pakai untuk |
|---|---|---|
| `icon.blue` | `#3B82F6` | Dashboard / overview tile |
| `icon.violet` | `#8B5CF6` | DPA BLUD / dokumen utama (= `colors.accent-light`, alias) |
| `icon.pink` | `#EC4899` | Pergeseran / perubahan / nilai aktif |
| `icon.emerald` | `#10B981` | Realisasi keuangan / Δ positif (≈ `colors.action-success` #1D9E75, lebih cerah utk icon-only) |
| `icon.red` | `#EF4444` | Hapus / Δ negatif / berkurang (≈ `colors.action-danger` #E24B4A, lebih cerah utk icon-only) |
| `icon.cyan` | `#06B6D4` | Master rekening / data referensi |
| `icon.amber` | `#F59E0B` | Antrian verifikasi / sedang ditelaah |
| `icon.indigo` | `#6366F1` | Pengaturan / konfigurasi |
| `icon.teal` | `#14B8A6` | Bidang / review |

**Pattern aplikasi:**
- **Active tile icon-box**: `background: {icon.X}` solid + `color: #FFFFFF` ikon + `box-shadow: 0 3px 10px {icon.X}55`.
- **Inactive tile icon-box**: `background: {icon.X}15` (dark) / `{icon.X}22` (light) + `color: {icon.X}` ikon.
- **Active tile container**: `border: 1.5px solid {icon.X}` + `background: linear-gradient(180deg, {icon.X}1f, {icon.X}08)` + label color `{icon.X}` w800.

### 12.3 Dashboard KPI Cards (Landing /blud)

- **Grid**: 4 kolom desktop, 2 kolom tablet (≤960px), 1 kolom mobile (≤540px). Gap 14px.
- **Card**: padding `16px 18px`, radius 14px. Background dark `rgba(4,44,83,.6)`, light `#FFFFFF`. Border `1px` rgba.
- **Hover**: `translateY(-2px)` + shadow lift. Card clickable (Link ke modul terkait).
- **Icon box**: 40×40 r10 di kanan card, background solid icon-color, ikon putih.
- **Value**: 20px w800 letter-spacing -.3px. Pakai `JetBrains Mono` kalau value berisi rupiah/angka, Inter kalau berisi tanggal/teks.
- **Label**: 11px w700 uppercase letter-spacing .8px, color = icon-color.
- **Sub**: 11px opacity .75.

### 12.4 History Panel

- **Container**: `background: rgba(4,44,83,.6)` (dark) / `#FFFFFF` (light), radius 14px, padding `18px 20px`.
- **Header**: ikon-box 32×32 r9 + title 14px w800 + sub 11px (5 versi terbaru).
- **Row**: grid `1fr auto`, padding `9px 0`, border-bottom `rgba(255,255,255,.06)` (dark) / `rgba(0,0,0,.06)` (light).
- **Tanggal**: 12.5px w700 (primary text). **Meta**: 11px w500 (sub text). **Value**: 12px monospace w700.

### 12.5 Light Theme Cascade (Pragmatic Hack)

BLUD DPA & Pergeseran client (`dpa-client.tsx`, `pergeseran-client.tsx`) masih punya 30+ inline `style={{background:'#042C53', color:'#E6F1FB', ...}}` yang hardcoded dark. Daripada refactor masal, BLUD shell pakai **CSS attribute substring match** untuk auto-recolor di light theme:

```css
[data-theme="light"] [style*="#042C53"]{background:#FFFFFF!important;}
[data-theme="light"] [style*="#0C447C"]{border-color:rgba(139,92,246,0.18)!important;}
[data-theme="light"] [style*="#E6F1FB"]{color:#0F0F12!important;}
[data-theme="light"] [style*="#85B7EB"]{color:#6B7280!important;}
/* ...dst */
```

**Catatan:**
- Ini **tactical solution** untuk modul BLUD yang belum pakai isLight prop pattern (seperti E-Anggaran token-based).
- Hanya berlaku di shell BLUD — tidak global. Modul lain TIDAK boleh mengandalkan hack ini.
- Kalau nanti BLUD dpa-client/pergeseran-client di-refactor ke isLight token pattern, hapus blok ini.

### 12.6 Aturan WAJIB di BLUD

| ❌ JANGAN | ✅ HARUS |
|---|---|
| Tambah menu BLUD lewat 5 tile tanpa overflow handling | Kalau >5 tile, group jadi 2 baris atau buat "More" dropdown |
| Pakai `icon.X` palette untuk CTA tombol | CTA tetap `colors.primary` (#EF9F27 dark) / gradient `#8B5CF6→#EC4899` (light) |
| Hardcode hex di inline style baru | Pakai `Tile.color` per metric (sudah didefinisi di `TILES[]` constant) |
| Pakai sidebar vertical di modul BLUD | BLUD layout adalah top ribbon — konsisten dengan pattern di section ini |

### 12.7 Menu Cetak — Toolbar + Render + Export

> File referensi: `app/(dashboard)/blud/cetak/cetak-client.tsx`, `lib/blud/cetak-data.ts`, `lib/blud/export/{pdf,excel}.ts`, `lib/blud/audit-pj.ts`.
>
> Port pattern dari Aplikasi BLUD (Google Apps Script) — adapted ke MySQL + jsPDF + exceljs.

**Layout Cetak:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Cetak Laporan BLUD                                                  │
│  ── divider ──                                                       │
│  MENU          VIEW           HISTORY DPA      TANGGAL    [BTNS]    │
│  [DPA BLUD ▼]  [DPA BLUD ▼]   [-- Terbaru --]  [date]     [🖨][📄][📊] │
│                                                            [💾 Simpan PK*] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Tabel hasil render (atau empty state "Klik Cetak dulu")            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
*Tombol "Simpan Rekap PK" hanya muncul untuk view Penanggung Jawab.
```

**View matrix:**

| Menu | View(s) | Sumber data |
|---|---|---|
| `dpa` | `dpa`, `penanggungJawab` | GET /api/blud/dpa (existing endpoint) |
| `pergeseran` | `rekapPergeseran` | GET /api/blud/pergeseran |
| `master-akun` | `masterAkun` | GET /api/blud/master-akun |

**Tombol & action:**

| Tombol | Warna | Action | Dynamic import |
|---|---|---|---|
| 🖨 Cetak | gradient blue `#1855bb→#3B82F6` (dark) / `#8B5CF6→#A78BFA` (light) | Fetch data + render tabel HTML via `cetak-data.renderCetakHtml()` | tidak |
| 📄 PDF | gradient grey `#475569→#64748B` (dark) / `#6B7280→#94A3B8` (light) | `exportToPdf()` via jspdf + jspdf-autotable (A4 landscape) | ✅ |
| 📊 Excel | gradient green `#16a34a→#22c55e` | `exportToExcel()` via exceljs (bold header + ribuan format) | ✅ |
| 💾 Simpan PK | gradient amber `#d97706→#f59e0b` | POST /api/blud/rekap-pk — snapshot ke tabel `rekap_pk` | tidak |

**Audit hybrid (no AI):**
- View Penanggung Jawab otomatis run `auditRekapPJ()` → render panel ringkasan di bawah tabel
- Diagnostic: Double Entry (rowId + ancestor sama-sama di-rekap → double-counted), Belum Entry (jumlah>0 + tidak di-rekap + tidak ada ancestor di-rekap), Selisih Saldo (grandTotal rekap vs total DPA Belanja Daerah)
- Status badge: SESUAI (✅ hijau) / SELISIH LEBIH (🔴 merah) / SELISIH KURANG (🟡 amber)

**Anti-pattern compliance (PERF-C3 dynamic-import):**

```tsx
// ❌ JANGAN — top-level import jspdf (800KB bundle)
import jsPDF from 'jspdf'

// ✅ HARUS — dynamic import di handler
async function onPdf() {
  const { exportToPdf } = await import('@/lib/blud/export/pdf')
  await exportToPdf({ ... })
}
```

**Table `rekap_pk` (snapshot):**

| Kolom | Tipe | Catatan |
|---|---|---|
| `versi_dpa` | DATE | Versi DPA yang di-rekap |
| `label` | VARCHAR(255) | Nama PJ atau label total ("TOTAL BELANJA BLUD") |
| `nominal` | DECIMAL(18,2) | Total nominal |
| `saved_at` | DATETIME | Auto via CURRENT_TIMESTAMP |
| `saved_by` | INT UNSIGNED | FK users.id, ON DELETE SET NULL |

Pattern save: `withTransaction({tx,conn} => { DELETE old + bulkInsert new })` — replace-latest per versi. Audit log event `BLUD_SAVE_REKAP_PK`.

---

## DeleteButton / Animated Trash (STANDAR TUNGGAL hapus)

Tombol/ikon hapus di SELURUH aplikasi WAJIB pakai komponen animasi ini — adaptasi Uiverse.io (vinodjangid07) ke token PRIMA. Animasi: tutup tong (`bin-top`/`.prima-del-top`) berputar 160° saat tombol induk di-hover; bg tombol bulat transisi ke `#E24B4A` (token `action-danger`). DILARANG balik ke `<Trash2>` polos atau emoji 🗑.

Dua varian (pilih sesuai konteks, JANGAN bikin tombol hapus baru di luar ini):

| Komponen | Kapan dipakai | Bentuk |
|---|---|---|
| `<DeleteButton>` (`components/ui/DeleteButton.tsx`) | Hapus **icon-only standalone** di sel aksi tabel (tanpa styling host khusus) | Tombol bulat ~30px, bg dark `#13202F` → hover `#E24B4A` |
| `<DeleteIcon>` (`components/ui/DeleteIcon.tsx`) | Ikon di dalam host ber-styling/stateful: `<PrimaButton variant="danger">` (teks dipertahankan), tombol toggle/disabled (PK `btnIconDanger`), kebab `RowActionsMenu`, editor LKJIP, tombol Tailwind | Hanya ikon trash animasi; warna ikut `currentColor` host |

Animasi tutup dipicu rule global `button:hover .prima-del-top { transform: rotate(160deg) }` di `globals.css`, jadi otomatis jalan di kedua varian tanpa class tambahan. Tooltip: teruskan `data-tooltip="..."` (styled otomatis via `[data-tooltip]` global). Props: `DeleteButton` extends `<button>` + `iconSize?` (default 13); `DeleteIcon` cuma `size?` (default 14).

```tsx
// row-action standalone:
<DeleteButton onClick={() => deleteRow(i)} data-tooltip="Hapus baris" iconSize={13} />
// di dalam PrimaButton teks (animasi + teks tetap):
<PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />}>Hapus Semua</PrimaButton>
```

Pengecualian (TIDAK diganti): ikon non-hapus (mis. `Trash2` ikon LOGOUT) dan tombol hapus yang sengaja dinonaktifkan (RealisasiTab).

---

## Row-Action Buttons — Edit & Realisasi (keluarga DeleteButton)

Tombol row-action bulat satu keluarga dengan `<DeleteButton>` (bulat 30px, bg dark `#13202F` / light `#1F2937`, ikon SVG dengan bagian yang bergerak saat hover, active scale .92, varian light via `data-theme`). Bedanya hanya warna hover sesuai makna aksi:

| Komponen | Animasi hover | Warna hover | Untuk |
|---|---|---|---|
| `<EditButton>` (`components/ui/EditButton.tsx`) | Pensil miring ke posisi menulis + underline ter-gambar (`.prima-edit-pencil`/`.prima-edit-line`) | `#7C5CFC` (action-purple) | Edit baris di sel aksi tabel |
| `<RealisasiButton>` (`components/ui/RealisasiButton.tsx`) | Koin jatuh masuk dompet (`.prima-real-coin`/`.prima-real-body`) | `#1D9E75` (action-success) | Set realisasi / aksi finansial per baris |

Props: extends `<button>` + `iconSize?` (Edit default 14, Realisasi 15). Teruskan `onClick`/`disabled`/`data-tooltip` lewat rest; bisa juga dibungkus `<Tip>`. CSS: `.prima-edit-btn`/`.prima-real-btn` di `globals.css` (blok setelah `.prima-del-btn`).

```tsx
<Tip label="Edit"><EditButton onClick={() => openEdit(row)} /></Tip>
<Tip label="Set realisasi"><RealisasiButton onClick={() => openRealisasi(row)} /></Tip>
<Tip label="Hapus"><DeleteButton onClick={() => del(row)} iconSize={12} /></Tip>
```

Dipakai: Buku Besar Aset (sel Aksi tabel register). Saat butuh edit/realisasi row-action bulat di modul lain, pakai komponen ini — jangan emoji ✏️/💰 atau ikon polos.

---

## DownloadButton (tombol export animasi)

`components/ui/DownloadButton.tsx` — tombol export/unduh animasi (adaptasi Uiverse vinodjangid07 ke token PRIMA). Badan tombol (`.prima-dl-face`) ikut surface tema (dark `#1E2733` / light `#FFFFFF`); layer warna (`.prima-dl-slide`) nyembul ~3px di bawah, **turun + box-shadow** saat hover, ikon panah download bounce. Variant warna by makna:

| variant | warna slide | untuk |
|---|---|---|
| `pdf` | `#E24B4A` (danger) | export PDF |
| `excel` | `#1D9E75` (success) | export Excel |
| `word` | `#2B579A` (Word blue) | export Word/.docx |

Props: extends `<button>` + `label` (string, mis. "PDF"/"Excel"/"Word") + `variant?` ('pdf'|'excel'|'word', default 'pdf') + `size?` ('sm'|'md', default 'md'). `md` = tinggi 36px/font 13px — samakan dgn sibling `PrimaButton` md (toolbar lega: tab E-Anggaran/kinerja, BLUD Cetak, PK form). `sm` = tinggi 30px/font 12px/ikon 15px — samakan dgn sibling `PrimaButton size="sm"` (panel usulan, modal preview PK, card daftar LKJIP). Teruskan `onClick`/`disabled`/`data-tooltip` lewat rest.

```tsx
<DownloadButton variant="pdf" label="PDF" onClick={handlePdf} disabled={!rows} data-tooltip="Unduh PDF" />
<DownloadButton variant="excel" label="Excel" size="sm" onClick={handleExcel} />
<DownloadButton variant="word" label="Word" size="sm" onClick={handleWord} />
```

**WAJIB**: semua tombol export/unduh **PDF / Excel / Word** di seluruh app pakai `<DownloadButton>` — BUKAN `<PrimaButton>` ber-ikon `FileSpreadsheet`/`FileText`/`Download`. Sudah diterapkan: Rencana Aksi (CetakPanel, DataEntryForm, ra-client), E-Anggaran/`kinerja` (6 tab `md`: SSK/Rekening/Realisasi/Cetak/Pendapatan-CRR/Laporan), Usulan (panel Bidang/DataUsulan/Milik/Semua), BLUD Cetak, PK (form + modal preview riwayat), LKJIP (card daftar). **Skip** (tetap native): row-action ikon di dalam **tabel/kolom** (mis. ikon Unduh per baris riwayat PK), tombol render **Cetak/Print** (`window.print()` — bukan download), dan item **FloatingDock** (shell-nav, mis. "Unduh Word" di dock editor LKJIP). Ukuran tinggi/lebar disesuaikan container: `md` toolbar lega, `sm` toolbar padat.

---
