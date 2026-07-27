# CONCEPT — Menu Access Control (Registry Menu Dinamis + Akses Per-Menu)

> Status: **KONSEP — belum dieksekusi.** Dokumen ini disetujui dulu, baru kode ditulis.
> Dibuat: 2026-07-25 · Modul terdampak: Admin Panel, Menu Hub, seluruh modul aplikasi

---

## 1. Masalah

Permintaan: di Admin Panel, pengaturan **Manajemen Aplikasi & Role** dibuat lebih detail —
sampai bisa mengatur **menu mana** yang boleh dibuka user, dan daftar menunya **dinamis**
(tambah menu baru → otomatis muncul di pengaturan, tanpa edit manual di banyak tempat).

Kondisi sekarang punya 2 keterbatasan:

### 1.1 Granularitas baru sebatas MODUL, belum MENU

`users.app_access` (kolom JSON) berisi array id modul, mis. `['blud','iki']`. Konsekuensinya
siapa pun yang dapat `blud` otomatis bisa membuka **semua** sub-halaman BLUD — DPA, Pergeseran,
Master Akun, Kode Besar, Penanggung Jawab, Cetak, dan Pengaturan. Tidak ada cara memberi
seseorang "BLUD tapi hanya DPA".

### 1.2 Daftar modul di-hardcode di 6 tempat terpisah

| # | Daftar | Lokasi | Isi |
|---|---|---|---|
| 1 | `APP_CARDS` | `app/(dashboard)/menu/menu-client.tsx:21` | kartu di halaman hub `/menu` |
| 2 | `APP_ACCESS_LIST` | `app/(dashboard)/admin/admin-client.tsx:58` | checkbox modal "Atur Akses Aplikasi" |
| 3 | `APP_STATUS_LABELS` | `app/(dashboard)/admin/admin-client.tsx:43` | label tab "App Control" |
| 4 | `AppAccessKeyEnum` | `lib/data/admin-schemas.ts:36` | whitelist Zod server (SDL-L4) |
| 5 | `ALLOWED_KEYS` app-status | `app/api/admin/app-status/route.ts:7` | key `app_status_*` kill-switch |
| 6 | `APP_CHECKS` | `app/api/user/access/route.ts` | id modul → fungsi `isXxxRole` |

Enam daftar ini **tidak saling terikat secara tipe**. Tambah modul baru = edit 6 tempat manual;
kalau satu terlewat, gejalanya senyap (kartu muncul tapi tidak bisa di-grant, atau bisa di-grant
tapi Zod menolak dengan 400, atau kill-switch tidak berfungsi). Sudah terbukti pernah terjadi:
komentar di `admin-schemas.ts` menulis *"Match `APP_CARDS.id` di menu-client.tsx"* — sinkronisasi
manual yang dijaga komentar, bukan compiler.

Catatan: `APP_ACCESS_LIST` (6 daftar di atas, #2) saat ini **tidak memuat `admin`**, sedangkan
`AppAccessKeyEnum` memuatnya. Contoh nyata drift yang dimaksud.

---

## 2. Ruang lingkup

### Yang BERUBAH
- Sumber data daftar modul & menu → satu registry.
- `users.app_access` bisa menampung key bertingkat (`blud.dpa`).
- Enforcement akses bertambah satu lapis granular (per menu).

### Yang TIDAK berubah
- **Desain tampilan.** Layout, komponen, token warna, ikon, badge — semua tetap. Modal
  "Atur Akses Aplikasi" tetap modal yang sama; hanya isi daftarnya di-generate dari registry
  dan (di Fase 2) bertambah baris sub-menu ber-indent di bawah modul induknya.
- Nama cookie, `getSession()`, `verifyToken()`, `setSessionCookie()`.
- Skema tabel — **tidak ada migration SQL**. `users.app_access` sudah bertipe JSON array.
- Model kolaboratif per-modul (AUTHZ-02/V5): ini mengatur **menu mana yang bisa dibuka**,
  BUKAN membuat data jadi privat per-user. Tidak ada ownership per-record baru.

### NON-GOALS (sengaja tidak dikerjakan)
- ❌ Menu yang dibuat admin lewat UI saat runtime (butuh tabel `app_menu` + routing dinamis).
  Menu baru selalu datang bersama deploy kode baru — registry statis sudah cukup.
- ❌ Role baru / mengubah taksonomi role di `lib/constants.ts`.
- ❌ Permission level aksi (view/edit/delete per menu). Ini akses **buka menu**, titik.
  Aksi tetap dijaga role check masing-masing route seperti sekarang.
- ❌ Mengubah `RIMA_APPS` di `lib/rima/registry.ts` (daftar provider Q&A, konsern berbeda).

---

## 3. Inventaris menu per modul

Penting karena PRIMA punya **dua pola menu** yang enforcement-nya berbeda.

### 3.1 Pola A — menu = route (bisa dijaga `proxy.ts` + guard halaman)

| Modul | Key modul | Sub-menu | Sumber |
|---|---|---|---|
| BLUD | `blud` | Beranda · Master Akun · Kode Besar · Penanggung Jawab · DPA BLUD · Pergeseran DPA · Cetak · Pengaturan | `blud-shell.tsx:20-27` |
| Perjanjian Kinerja | `perjanjian_kinerja` | Beranda · Master Sasaran · Master Program · Form PK · Riwayat · Master Pejabat · Master Unit | `pk-shell.tsx:22-28` |
| Buku Besar Aset | `buku_besar_aset` | Beranda · Master | `app/(dashboard)/buku-besar-aset/` |
| Dashboard | `dashboard` | Overview · Detail per modul | `dashboard/[modul]/` |
| IKI | `iki` | Daftar · Editor | `iki/[id]/` |
| LKJIP | `lkjip` | Daftar · Editor | `lkjip/[id]/` |
| Admin Panel | `admin` | 10 tab (lihat pola B) | `admin-client.tsx:26` |

### 3.2 Pola B — menu = tab client-side (URL tidak berubah)

| Modul | Key modul | Tab | Sumber |
|---|---|---|---|
| E-Anggaran | `new_econtrolling` | Dashboard · Master · Rekening · SSK · Realisasi · Pendapatan/CRR · Laporan · Cetak · Pengaturan | `kinerja/_tabs/` (9 file) |
| Usulan Kebutuhan | `usulan_aset` | 15 panel (Buat · Milik · Antrian · Tracking · Data Usulan · Rekap · Kelola User · dst.) | `usulan-kebutuhan/_panels/` |
| Admin Panel | `admin` | Sessions · App Control · Attack Monitor · User Mgmt · Security · Broadcast · Audit Trail · Email · Promotion · RIMA Feedback | `admin-client.tsx:26` |
| Renaksi & Kinerja | `rencana_aksi` | komponen `_components/` | `rencana-aksi/` |

**Konsekuensi desain:** Pola B tidak bisa dijaga `proxy.ts` (URL-nya sama). Enforcement-nya:
sembunyikan tab di client **+** guard di setiap route API yang tab itu panggil. Karena itu
Fase 2 diprioritaskan ke Pola A dulu (nilai keamanan tertinggi, effort terendah), Pola B
menyusul modul per modul.

Catatan Usulan Kebutuhan: modul ini **sudah** punya pembatasan panel per-role sendiri
(`getPanels` per role) dan sengaja terbuka untuk semua role. Jangan dobel-atur — Usulan
masuk registry sebagai modul tanpa sub-key sampai ada permintaan eksplisit.

---

## 4. Desain

### 4.1 Registry tunggal — `lib/registry/apps.ts`

Satu file, **data murni**, tanpa import React/ikon/DB — supaya bisa diimpor `proxy.ts`
(Edge Runtime) maupun route API Node tanpa efek samping.

```ts
export type MenuNode = {
  key: string;            // 'blud' | 'blud.dpa'
  label: string;          // 'DPA BLUD'
  href: string | null;    // null = tab client-side (Pola B)
  pathPrefix?: string;    // untuk match di proxy.ts, mis. '/blud/dpa'
  roles?: readonly string[]; // batas role keras (mis. admin → SUPER_ADMIN)
  children?: readonly MenuNode[];
};

export const APP_REGISTRY: readonly MenuNode[] = [ /* … */ ];
```

Turunan yang di-generate dari registry (bukan ditulis ulang):

| Turunan | Dipakai di | Cara derive |
|---|---|---|
| `ALL_ACCESS_KEYS` | `AppAccessKeyEnum` (Zod) | flatten seluruh `key` |
| `APP_STATUS_KEYS` | `app-status/route.ts` | `app_status_${key}` untuk node **level 1** saja |
| daftar checkbox | modal Admin Panel | render pohon `APP_REGISTRY` |
| kartu `/menu` | `menu-client.tsx` | node level 1 + map `key → {icon, accent, badge}` lokal |
| `pathPrefix → key` | `proxy.ts` | flatten node ber-`pathPrefix`, urut terpanjang dulu |

Ikon/warna **tetap di `menu-client.tsx`** sebagai map terpisah `key → visual`. Alasannya dua:
registry harus bebas dependency React, dan pemisahan ini yang menjamin **desain tidak berubah**.

### 4.2 Format key & aturan implikasi

- Modul: `blud` · Sub-menu: `blud.dpa` (titik sebagai pemisah, snake_case tetap: `blud.master_akun`).
- **Aturan implikasi (WAJIB):** punya `blud.dpa` ⟹ dianggap punya `blud`. Diimplementasikan di
  satu fungsi `hasKey(appAccess, key)`, bukan disebar di pemanggil.
- **Aturan warisan (WAJIB):** punya `blud` **tanpa** sub-key apa pun ⟹ dianggap punya
  **semua** sub-menu BLUD. Ini yang membuat data lama tetap jalan tanpa migrasi (§5).
- Begitu satu sub-key BLUD diberikan, mode berubah jadi eksplisit: hanya sub-key yang
  tercantum yang terbuka. Aturan ini harus tampil sebagai teks bantuan di modal Admin Panel,
  karena tidak intuitif.

### 4.3 Tiga titik enforcement

Menyembunyikan menu di UI saja = *security theater*. Ketiganya wajib.

| Lapis | Berkas | Peran |
|---|---|---|
| 1. UI | `menu-client.tsx`, `blud-shell.tsx`, `pk-shell.tsx`, shell modul lain | sembunyikan/kunci menu — **kenyamanan, bukan keamanan** |
| 2. Route halaman | `proxy.ts` (`pathPrefix → key`) + guard server component tiap `page.tsx` | blokir akses URL langsung |
| 3. API | `requireAccess()` / `hasAppAccess()` di `lib/security/guard.ts` + `_guard.ts` tiap modul | blokir `curl`/fetch langsung — satu-satunya lapis yang benar-benar mengunci data |

`proxy.ts` **tidak boleh** query DB (Edge Runtime, tidak ada koneksi MySQL). Maka lapis 2
untuk halaman hanya bisa memakai data yang ada di JWT. Dua opsi:

- **Opsi A (dipilih):** `proxy.ts` tetap hanya jaga role (`ROLE_ROUTES`, apa adanya). Cek
  per-menu dilakukan di **server component `page.tsx`** tiap route (sudah punya akses DB lewat
  `hasAppAccess`). Tidak menyentuh JWT, tidak ada risiko token basi.
- **Opsi B (ditolak):** masukkan `app_access` ke payload JWT. Ditolak — akses jadi basi sampai
  user login ulang, dan cabut akses tidak berefek langsung. Bahaya untuk kontrol akses.

### 4.4 Fungsi baru di `lib/security/guard.ts`

```ts
hasKey(appAccess: string[] | null, key: string): boolean   // + implikasi & warisan §4.2
requireMenu(key: string): Promise<GuardResult>             // wrapper requireAccess
```

`hasAppAccess()` — **God Node**, dipakai lintas modul — signature-nya **tidak diubah**.
Fungsi `isBludRole`/`isIkiRole`/dst. juga tidak diubah signature-nya. Perilaku per-menu
ditambahkan lewat fungsi baru, bukan mengubah yang lama. Ini syarat mutlak Fase 1.

---

## 5. Migrasi data & kompatibilitas mundur

- **Tidak ada migration SQL.** Kolom `users.app_access` sudah JSON array.
- Data lama (`['blud','iki']`) tetap valid: aturan warisan §4.2 membuatnya = akses penuh
  ke semua sub-menu kedua modul itu. **Tidak ada user yang terkunci saat deploy.**
- `AppAccessKeyEnum.max(10)` di `admin-schemas.ts:68` **harus dinaikkan** — dengan sub-key
  jumlahnya bisa 50+. Kalau terlewat, simpan akses gagal 400 senyap.
- SUPER_ADMIN & ADMIN: `/api/user/access` sudah mengembalikan `app_access: null` (= tak
  terbatas) untuk keduanya. Perilaku ini **dipertahankan** — SUPER_ADMIN tidak boleh bisa
  mengunci dirinya sendiri.

---

## 6. Tampilan Admin Panel (tetap, hanya bertingkat)

Modal "Atur Akses Aplikasi" yang sudah ada:
- checkbox "Semua Aplikasi" di atas → tetap.
- Daftar checkbox → dari flat menjadi pohon 2 level: modul (tebal) + sub-menu ber-indent.
  Klik modul = centang semua anaknya; sebagian anak tercentang = state indeterminate.
- Komponen, radius, warna, tipografi → token `docs/design/DESIGN-SYSTEM.md` yang sama.
  Tidak ada komponen baru, tidak ada hex baru.
- Tambahan satu baris teks bantuan menjelaskan aturan warisan §4.2.

Kolom ringkas di tabel user (`{n} app`) tetap, hitungannya jadi jumlah **modul** yang punya
minimal satu key (bukan total key mentah) supaya angkanya tetap terbaca.

---

## 7. Fase eksekusi

Wajib bertahap. Fase 1 **tidak boleh mengubah perilaku sama sekali** — murni refactor.

### Fase 0 — Persiapan
- [ ] Dokumen ini disetujui.
- [ ] Tentukan sub-menu mana saja yang benar-benar perlu dibatasi (§3 daftar lengkap;
      kemungkinan besar tidak semua perlu — mis. "Beranda" tiap modul sebaiknya selalu terbuka).

### Fase 1 — Registry dinamis (perilaku identik)
- [ ] Buat `lib/registry/apps.ts` — level 1 saja (10 modul), **belum ada sub-menu**.
- [ ] Ganti 6 daftar hardcoded (§1.2) jadi turunan registry.
- [ ] Naikkan cap `.max()` di `admin-schemas.ts`.
- [ ] **DoD:** `npx tsc --noEmit` + ESLint bersih; grant/revoke akses & kill-switch maintenance
      berperilaku persis sama seperti sebelum perubahan; tidak ada perubahan visual.
- **Nilai yang didapat**: tambah modul baru = edit 1 file, otomatis muncul di semua tempat.

### Fase 2 — Sub-menu Pola A (route-based)
- [ ] Tambah `children` di registry untuk BLUD & PK dulu (2 modul, paling banyak sub-menu).
- [ ] `hasKey()` + `requireMenu()` di `guard.ts`.
- [ ] Guard di `page.tsx` tiap sub-route + `_guard.ts` API terkait.
- [ ] Sembunyikan tile di `blud-shell.tsx` / `pk-shell.tsx`.
- [ ] Modal Admin Panel jadi pohon 2 level.
- [ ] **DoD:** uji manual — user dengan `['blud.dpa']` bisa buka `/blud/dpa`, dapat 403 saat
      `curl` API `/api/blud/master-akun`, dan tidak melihat tile Master Akun. User lama
      dengan `['blud']` tetap bisa semua.

### Fase 3 — Sub-menu Pola B (tab client-side), opsional & per modul
- [ ] E-Anggaran (9 tab) → sembunyikan tab + guard tiap route `app/api/kinerja/*`.
- [ ] Admin Panel (10 tab) → hanya kalau nanti ADMIN diberi akses sebagian panel.
- [ ] Usulan Kebutuhan → **tidak disarankan**, sudah punya `getPanels` per-role sendiri.

---

## 8. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| UI-only hiding, guard API lupa | Bypass via `curl` — data bocor antar bidang | §4.3 lapis 3 wajib; checklist per route di DoD Fase 2 |
| Aturan warisan salah implementasi | Semua user terkunci saat deploy, atau semua over-grant | §4.2 satu fungsi `hasKey()`; uji dengan data user produksi sebelum deploy |
| `hasAppAccess()` God Node berubah | Seluruh modul terdampak | Signature dikunci; fungsi baru terpisah (§4.4) |
| Cap `.max(10)` terlewat | Simpan akses gagal 400 senyap | Checklist Fase 1 |
| `proxy.ts` diberi query DB | Crash Edge Runtime | Opsi A dipilih (§4.3); `proxy.ts` tidak disentuh di Fase 1–2 |
| Registry meng-import ikon lucide | `proxy.ts` gagal build | Registry = data murni; map visual tetap di `menu-client.tsx` |
| Admin salah konfigurasi lalu terkunci | Tidak bisa masuk Admin Panel | SUPER_ADMIN bypass dipertahankan (`app_access: null`) |

### Batas jaminan keamanan
Fitur ini adalah **kontrol akses internal antar pegawai** — mencegah pemegang akses satu bidang
membuka menu bidang lain. Ini **bukan** pertahanan terhadap penyerang luar. Tidak ada endpoint
publik baru; seluruh permukaan tetap di balik `getSession()`. Pertahanan terhadap penyerang luar
tetap berasal dari lapis yang sudah ada: JWT + revocation, lockout login atomik (V3-5/L55),
rate limit, CSP nonce, security headers, dan 5 gate CI.

---

## 9. Berkas yang tersentuh

**Baru**
- `lib/registry/apps.ts`

**Diubah — Fase 1**
- `lib/data/admin-schemas.ts` (`AppAccessKeyEnum` derive + cap)
- `app/(dashboard)/admin/admin-client.tsx` (`APP_ACCESS_LIST`, `APP_STATUS_LABELS`)
- `app/(dashboard)/menu/menu-client.tsx` (`APP_CARDS` → registry + map visual)
- `app/api/admin/app-status/route.ts` (allowlist key)
- `app/api/user/access/route.ts` (`APP_CHECKS`)

**Diubah — Fase 2**
- `lib/security/guard.ts` (`hasKey`, `requireMenu`)
- `app/(dashboard)/blud/blud-shell.tsx`, `app/(dashboard)/perjanjian-kinerja/pk-shell.tsx`
- `page.tsx` tiap sub-route BLUD & PK
- `app/api/blud/*`, `app/api/perjanjian-kinerja/*` (guard per menu)
- `app/(dashboard)/admin/admin-client.tsx` (modal jadi pohon)

**Tidak disentuh**
- `proxy.ts` · `lib/security/auth.ts` · `lib/constants.ts` · `docs/schema-mysql.sql`
- `docs/design/DESIGN-SYSTEM.md` dan seluruh token desain

---

## 10. Keputusan yang menunggu konfirmasi

1. **Cakupan Fase 2** — BLUD & PK dulu saja, atau langsung semua modul Pola A?
2. **Beranda tiap modul** — selalu terbuka bagi pemegang key modul, atau ikut bisa dibatasi?
3. **Fase 3** — perlu sekarang, atau tunggu sampai ada kebutuhan nyata?
4. **Audit log** — apakah perlu event terpisah (`USER_MENU_ACCESS`) atau cukup `USER_UPDATE`
   yang sudah mencatat isi `app_access` seperti sekarang?
