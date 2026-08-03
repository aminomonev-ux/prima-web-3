# CONCEPT — Menu Access Control (Registry Menu Dinamis + Akses Per-Menu)

> Status: **FINAL — siap dieksekusi, tidak ada keputusan menggantung.**
> Dibuat 2026-07-25 · **Direvisi 2026-08-01 (dua kali)** — pagi: telaah ulang commit BLUD
> terbaru · sore: model penyimpanan diganti dari sub-key ke dua tabel (§0.1)
> Modul terdampak: Admin Panel, Menu Hub, seluruh modul aplikasi
> Terkait: **`docs/CONCEPT-blud-peran.md` (keputusan #41)** — wajib dibaca lebih dulu

---

## 0. Revisi 2026-08-01 — apa yang berubah dan kenapa

Konsep versi pertama ditulis tanpa memperhitungkan commit BLUD yang menyusul
(`d122088 pembagian peran x menu — pagar tulis di 18 route`, `977d3d6`, dan seterusnya).
Telaah ulang mengubah tiga hal mendasar:

| Yang ditulis versi pertama | Kenyataan di kode | Akibatnya pada rancangan |
|---|---|---|
| Enforcement per-menu **perlu dirancang** | **Sudah ada dan berjalan** di BLUD — `app/api/blud/_guard.ts` + `realisasi/_guard.ts`, **19** berkas route | Fase 2 menyusut drastis: pagarnya tidak dibangun, cuma disambungkan ke Admin Panel |
| Izin itu **biner** (buka / tidak) — lihat NON-GOALS lama | **Tri-state**: `EDIT` / `LIHAT` / `TIDAK` (`lib/blud/peran.ts`) | Registry wajib ikut tri-state, kalau tidak BLUD justru mundur |
| "Opsi A gugur karena `DELETE /api/blud/dpa` dipakai menu Pengaturan" | **Keliru.** Tabrakan itu sudah diselesaikan dengan pemeriksaan **per-aksi** (`canHapusVersi`) yang ditumpuk di atas pagar per-menu | Bukan opsi baru — pola yang sudah terbukti dipakai |

Yang tidak berubah: masalah pokok (§1), enam daftar hardcoded, dan jaminan bahwa
desain tampilan tidak disentuh.

## 0.1 Revisi kedua 2026-08-01 (sore) — model penyimpanan diganti

Sesudah menelusuri maksud pemilik lebih jauh, satu hal yang sebelumnya tidak
tertangkap: yang diminta bukan cuma **perkecualian per orang**, melainkan
kemampuan **mendefinisikan ulang aturan peran itu sendiri dari Admin Panel**.
Perbedaannya menentukan bentuk rancangan, bukan sekadar detail.

Penimpa per-orang saja tidak bisa mereproduksi sistem hari ini. Aturan yang
berlaku sekarang adalah aturan **peran** ("KEUANGAN pada dasarnya lihat saja,
kecuali Tutup Kas"). Menyatakannya lewat penimpa per-orang berarti mencentang
ulang untuk tiap pegawai keuangan, satu per satu, dan mengulanginya tiap ada
pegawai baru. Itu memindahkan pekerjaan developer ke klik, bukan menghapusnya.

| Versi sebelumnya | Versi ini | Kenapa |
|---|---|---|
| Izin disimpan sebagai sub-key ber-suffix di `users.app_access` (`blud.dpa:edit`) | **Dua tabel baru**; `users.app_access` **tidak disentuh sama sekali** | Suffix membuat `AppAccessKeyEnum` harus memuat hasil kali key × tingkat (≈46 nilai), dan daftar teks tidak bisa mencegah isian bertabrakan (`blud.dpa:edit` + `blud.dpa:tidak` sama-sama sah) |
| Satu lapis: penimpa per-orang | **Dua lapis**: matriks peran (dapat diedit) + perkecualian per-orang | Hanya lapis pertama yang bisa mereproduksi aturan hari ini |
| "Tidak ada migration SQL" | **Ada satu migration** — dua tabel baru | Menambah tabel baru berisiko nol; yang berisiko justru mengubah arti kolom lama yang dibaca sepuluh modul |
| Tiga posisi setara di UI | **Kotak centang** (centang = boleh ubah), posisi `TIDAK` di balik "opsi lanjutan" | `TIDAK` hari ini **tidak dipakai satu peran pun** — menyetarakannya di UI membebani pemakaian harian demi kasus yang belum ada |

Ukuran keberhasilannya ikut berubah dan jadi jauh lebih tegas: **panel dianggap
benar kalau ia bisa menghasilkan aturan yang berlaku hari ini, sel per sel, tanpa
satu baris kode pun** (uji 60 sel, §7 Fase 2).

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
- Aturan izin per menu pindah dari kode ke **dua tabel baru** yang bisa diatur admin:
  matriks peran + perkecualian per orang (§4.5).
- Enforcement akses bertambah satu lapis granular (per menu).

### Yang TIDAK berubah
- **Desain tampilan.** Layout, komponen, token warna, ikon, badge — semua tetap. Modal
  "Atur Akses Aplikasi" tetap modal yang sama; hanya isi daftarnya di-generate dari registry
  dan (di Fase 2) bertambah baris sub-menu ber-indent di bawah modul induknya.
- Nama cookie, `getSession()`, `verifyToken()`, `setSessionCookie()`.
- **`users.app_access` — bentuk maupun isinya.** Ia tetap daftar datar id modul
  (`['blud','iki']`), tetap dibaca `hasAppAccess()` apa adanya. Izin per-menu hidup di
  tabelnya sendiri. Ini disengaja: `hasAppAccess()` God Node, dan mengubah **bentuk data**
  yang ia baca sama berisikonya dengan mengubah kodenya. Ikutannya, `AppAccessKeyEnum`
  tetap 10 nilai datar dan cap `.max(10)` tidak perlu dinaikkan.
- Model kolaboratif per-modul (AUTHZ-02/V5): ini mengatur **menu mana yang bisa dibuka**,
  BUKAN membuat data jadi privat per-user. Tidak ada ownership per-record baru.

### Yang bertambah di skema
Satu migration: **dua tabel baru** (`menu_role_access`, `menu_user_access`, §4.5).
Keduanya kosong saat dibuat dan diisi dari `TABEL` yang ada di kode — jadi hari pertama
sesudah deploy, perilakunya identik dengan hari sebelumnya.

### NON-GOALS (sengaja tidak dikerjakan)
- ❌ Menu yang dibuat admin lewat UI saat runtime (butuh tabel `app_menu` + routing dinamis).
  Menu baru selalu datang bersama deploy kode baru — registry statis sudah cukup.
- ❌ Role baru / mengubah taksonomi role di `lib/constants.ts`.
- ❌ ~~Permission level aksi (view/edit/delete per menu)~~ — **dicoret 2026-08-01.**
  BLUD sudah tri-state (`EDIT`/`LIHAT`/`TIDAK`), jadi registry harus ikut. Yang tetap
  NON-GOAL: **aksi berat tertentu** (hapus versi, buka periode) — itu selamanya dijaga
  fungsi per-aksi berbasis role, **tidak boleh** bisa diatur dari Admin Panel (§4.5).
- ❌ Mengubah `RIMA_APPS` di `lib/rima/registry.ts` (daftar provider Q&A, konsern berbeda).

---

## 3. Inventaris menu per modul

Penting karena PRIMA punya **dua pola menu** yang enforcement-nya berbeda.

### 3.1 Pola A — menu = route (bisa dijaga `proxy.ts` + guard halaman)

| Modul | Key modul | Sub-menu | Sumber |
|---|---|---|---|
| BLUD | `blud` | **12 menu** — Beranda · Master Akun · Kode Besar · Penanggung Jawab · DPA BLUD · Pergeseran DPA · Buku Kas · Bukti Setor · Realisasi · Tutup Kas · Cetak · Pengaturan | **`lib/blud/peran.ts` → `MENU_BLUD`** (bukan lagi `blud-shell.tsx` — sudah dipindah ke modul daun) |
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

**Catatan Usulan Kebutuhan — direvisi 2026-08-01, MASUK cakupan (Fase 3).**
Versi pertama menulis "tidak disarankan, sudah punya `getPanels` per-role". Itu salah
membaca masalahnya. `getPanels` memang ada, tapi **hardcoded di kode** — mau membuka atau
menutup satu panel untuk satu orang harus lewat developer dan deploy ulang. Justru itu
keluhan yang melahirkan dokumen ini.

Rancangannya karena itu **bukan menggantikan** `getPanels`, melainkan menumpanginya:

```
getPanels(role)          → bibit awal isi menu_role_access
menu_role_access         → aturan peran, dapat diedit dari Admin Panel
menu_user_access         → perkecualian per orang
```

Pola ini identik dengan yang dipakai BLUD (§4.5) — dua tabel yang sama, cuma `app_key`-nya
`usulan_aset`. Satu mekanisme, dua modul; bukan dua logika yang harus dijaga tetap sinkron.

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
| `ALL_ACCESS_KEYS` | `AppAccessKeyEnum` (Zod) | key node **level 1 saja** — `app_access` tetap sebatas modul (§2) |
| `ALL_MENU_KEYS` | validasi `menu_key` di tabel izin | flatten seluruh `key` termasuk anak |
| `APP_STATUS_KEYS` | `app-status/route.ts` | `app_status_${key}` untuk node **level 1** saja |
| daftar checkbox | modal Admin Panel | render pohon `APP_REGISTRY` |
| kartu `/menu` | `menu-client.tsx` | node level 1 + map `key → {icon, accent, badge}` lokal |
| `pathPrefix → key` | `proxy.ts` | flatten node ber-`pathPrefix`, urut terpanjang dulu |

Ikon/warna **tetap di `menu-client.tsx`** sebagai map terpisah `key → visual`. Alasannya dua:
registry harus bebas dependency React, dan pemisahan ini yang menjamin **desain tidak berubah**.

### 4.2 Format key & arti tiap tingkat

- Modul: `blud` · Sub-menu: `blud.dpa` (titik sebagai pemisah, snake_case tetap: `blud.master_akun`).
- Key modul dipakai di `users.app_access` (pintu masuk modul, apa adanya seperti sekarang).
  Key sub-menu **hanya** dipakai di dua tabel izin §4.5 — tidak pernah masuk `app_access`.
- **Akses modul tetap pintu pertama.** Izin per-menu tidak pernah memberi jalan masuk ke
  modul yang grant-nya tidak dimiliki. Ia hanya membagi-bagi yang sudah di dalam.

Tiga tingkat, sama persis dengan `Izin` di `lib/blud/peran.ts` — tidak ada tipe baru:

| Tingkat | Arti | Di UI |
|---|---|---|
| `LIHAT` | boleh membuka layarnya **dan mengunduh**, tidak boleh mengubah | kotak **tidak** dicentang — inilah keadaan bawaan |
| `EDIT` | boleh mengubah | kotak **dicentang** |
| `TIDAK` | menunya hilang dari ribbon, route-nya menolak | hanya muncul di **"opsi lanjutan"** |

**Kenapa `LIHAT` yang jadi keadaan bawaan, bukan `TIDAK`.** Karena begitulah sistem yang
berjalan sekarang: seluruh lima peran di `TABEL` berbentuk `bawaan: 'LIHAT'` + daftar menu
yang naik jadi `EDIT`, dan **`TIDAK` tidak dipakai satu peran pun**. Semua pemegang akses
BLUD bisa melihat semua menu; yang dibatasi hanya menulis. Menyalakan `TIDAK` sebagai
posisi setara di UI berarti membebani pemakaian harian demi kasus yang belum pernah ada.

`TIDAK` tetap disediakan — kolom `izin` sudah bertipe tiga nilai, dan
`izinMenu()` sudah menanganinya — tapi letaknya di balik "opsi lanjutan", dengan peringatan
bahwa menu yang disembunyikan akan membuat orangnya melapor "aplikasi saya beda sendiri".

⚠️ **`TIDAK` tidak boleh dinyalakan sebelum pagar baca dibereskan.** Satu layar bisa
memanggil endpoint yang dijaga menu lain — layar Realisasi memanggil `pagu` (guard-nya
menyebut Buku Kas) dan `dpa`. Menyembunyikan Buku Kas akan membuat layar Realisasi gagal
memuat dengan 403 padahal menunya terbuka. Selama ini tak pernah terjadi karena `TIDAK`
memang tidak dipakai. Perbaikannya ada di pagar route, bukan di panel — §11
"Ketergantungan antar-menu", dikerjakan **bersama** opsi lanjutan.

**Beranda selalu terbuka (keputusan pemilik 2026-08-01).** Beranda tiap modul tidak
pernah bisa di-`TIDAK`-kan. Alasannya bukan teknis melainkan pengalaman pakai: orang yang
sudah berhak masuk modul tapi dilempar keluar dari halaman depannya akan mengira akunnya
rusak. Ini sudah sejalan dengan `MENU_BACA_SAJA` di `lib/blud/peran.ts` yang mengunci
`beranda` dan `cetak` maksimal di `LIHAT`. Di registry, node ber-flag `selaluTerbuka: true`
tidak dirender sebagai checkbox di Admin Panel — bukan dirender lalu di-disable, karena
checkbox mati tanpa penjelasan lebih membingungkan daripada baris yang memang tidak ada.

### 4.3 Tiga titik enforcement

Menyembunyikan menu di UI saja = *security theater*. Ketiganya wajib.

| Lapis | Berkas | Peran |
|---|---|---|
| 1. UI | `menu-client.tsx`, `blud-shell.tsx`, `pk-shell.tsx`, shell modul lain | sembunyikan/kunci menu — **kenyamanan, bukan keamanan** |
| 2. Route halaman | `proxy.ts` (`pathPrefix → key`) + guard server component tiap `page.tsx` | blokir akses URL langsung |
| 3. API | `requireAccess()` / `hasAppAccess()` di `lib/security/guard.ts` + `_guard.ts` tiap modul | blokir `curl`/fetch langsung — satu-satunya lapis yang benar-benar mengunci data |

`proxy.ts` **tidak boleh** query DB (Edge Runtime, tidak ada koneksi MySQL). Maka lapis 2
untuk halaman hanya bisa memakai data yang ada di JWT. Dua opsi:

- **Dipilih:** `proxy.ts` tetap hanya jaga role (`ROLE_ROUTES`, apa adanya). Cek
  per-menu dilakukan di **server component `page.tsx`** tiap route (sudah punya akses DB lewat
  `hasAppAccess`). Tidak menyentuh JWT, tidak ada risiko token basi.
- **Ditolak:** masukkan `app_access` ke payload JWT. Ditolak — akses jadi basi sampai
  user login ulang, dan cabut akses tidak berefek langsung. Bahaya untuk kontrol akses.

> BLUD sudah memakai bentuk yang dipilih ini: `app/(dashboard)/blud/_izin.ts` — satu fungsi
> `izinLayar(menu)` dipanggil tiap `page.tsx`, membaca `x-user-role` dari header yang
> **di-set proxy di sisi request** (V3-1/L54), lalu `redirect('/blud')` kalau tidak berhak.
> Perhatikan ke mana ia melempar: **ke Beranda modul, bukan ke `/menu`** — orangnya berhak
> masuk BLUD, cuma tidak ke menu itu. Melemparnya keluar modul akan terasa seperti kehilangan
> akses. Detail itu wajib ditiru saat pola ini dibawa ke modul lain.

### 4.4 Pagar API: per-handler, bukan per-berkas — **sudah terbukti di BLUD**

Ini jawaban pertanyaan #5, dan telaah kode menyelesaikannya: bentuk yang mau kita pilih
**sudah dipakai di produksi**, di 19 berkas route BLUD.

Tiga bentuk yang sempat dipertimbangkan:

| Bentuk | Isi | Putusan |
|---|---|---|
| Satu key per **berkas route** | `dpa/route.ts` → key `blud.dpa`, selesai | **Gugur.** Satu berkas bisa melayani beberapa menu dengan berat berbeda |
| **Peta terpusat** menu → daftar endpoint | tabel besar `'blud.pengaturan' → ['DELETE /api/blud/dpa', …]` | **Ditolak.** Tabelnya hidup jauh dari kode yang dijaganya; route baru yang lupa didaftarkan = lubang senyap. Persis penyakit §1.2 |
| **Deklarasi per handler** | tiap `GET`/`POST`/`DELETE` menyebut menunya sendiri di baris pertama | ✅ **DIPILIH — dan sudah berjalan** |

Bentuknya seperti ini di `app/api/blud/dpa/route.ts`:

```ts
export async function GET(req)    { … bolehBukaMenu(uid, role, 'dpa')  → forbidden()  }
export async function POST(req)   { … bolehEditMenu(uid, role, 'dpa')  → tolakEdit()  }
export async function DELETE(req) { … bolehBukaMenu(uid, role, 'dpa')
                                     + canHapusVersi(role)             → 403          }
```

Empat sifat yang membuatnya menang:

1. **Granular sampai per-aksi.** `POST` (simpan DPA) dan `DELETE` (hapus versi) di berkas
   yang sama bisa punya syarat berbeda.
2. **Tidak ada daftar terpusat untuk dirawat.** Nama menu satu-satunya sumbernya `MENU_BLUD`;
   salah ketik ketahuan `tsc`, bukan di produksi.
3. **Route baru tidak bisa lupa.** Polanya seragam dengan `requireRole`/`requireAccess` yang
   sudah wajib sejak L60/L61 — route tanpa guard sudah dianggap cacat.
4. **Baca dan tulis dipisah rapi**: `bolehBukaMenu` untuk `GET`, `bolehEditMenu` untuk tulis.

**Koreksi atas versi pertama dokumen ini.** Saya sempat menulis bahwa "satu key per berkas"
gugur karena `DELETE /api/blud/dpa` milik menu Pengaturan sedangkan `POST`-nya milik menu DPA.
Kesimpulannya benar, alasannya keliru — dan kekeliruan itu perlu dicatat karena melahirkan
pola yang harus ditiru. Kode nyatanya **tidak** memberi hapus-versi key menu sendiri. Ia
memakai **pemeriksaan per-aksi** yang ditumpuk di atas pagar per-menu:

| Aksi berat | Fungsi penjaga | Berkas | Siapa |
|---|---|---|---|
| Hapus versi DPA / Pergeseran | `canHapusVersi(role)` | `lib/blud/schemas.ts:48` | SUPER_ADMIN · ADMIN |
| Buka kembali periode | `bolehBukaPeriode(role)` | `lib/blud/realisasi-schemas.ts:48` | SUPER_ADMIN · ADMIN · KEUANGAN |
| Tolak permintaan pergeseran | menu `pergeseran` pada `PATCH` | `realisasi/permintaan/route.ts` | pemegang menu Pergeseran |

Kenapa dipisah begitu, dan bukan dijadikan menu tersendiri: ketiganya bukan "layar", melainkan
**tombol di dalam layar**. Menjadikannya key menu akan memunculkan menu hantu di Admin Panel
yang tidak punya halaman. Yang lebih penting: `PERBENDAHARAAN` boleh **menutup** periode tapi
tidak boleh **membukanya** — pemisahan tugas yang jadi inti rancangan BLUD. Aturan seperti itu
tidak boleh bisa dilonggarkan dari Admin Panel oleh admin yang sedang buru-buru.

### 4.5 Dua lapis izin — matriks peran + perkecualian per orang

Inilah **satu-satunya yang benar-benar kurang** di BLUD hari ini. `TABEL` di
`lib/blud/peran.ts` dikunci per peran di dalam kode; yang diminta adalah mengaturnya dari
Admin Panel — **baik aturan perannya maupun perkecualian per orangnya**.

#### 4.5.1 Dua tabel

```sql
-- Lapis 1: aturan peran. Menggantikan TABEL yang sekarang hardcoded.
CREATE TABLE menu_role_access (
  app_key    VARCHAR(32) NOT NULL,          -- 'blud'
  role       VARCHAR(32) NOT NULL,          -- 'PERBENDAHARAAN'
  menu_key   VARCHAR(64) NOT NULL,          -- 'blud.tutup_kas'
  izin       ENUM('EDIT','LIHAT','TIDAK') NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  PRIMARY KEY (app_key, role, menu_key),
  CONSTRAINT fk_mra_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Lapis 2: perkecualian per orang. Menang atas lapis 1.
CREATE TABLE menu_user_access (
  user_id    INT NOT NULL,
  app_key    VARCHAR(32) NOT NULL,
  menu_key   VARCHAR(64) NOT NULL,
  izin       ENUM('EDIT','LIHAT','TIDAK') NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  PRIMARY KEY (user_id, app_key, menu_key),
  CONSTRAINT fk_mua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mua_by   FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
```

Bentuk **peta**, bukan daftar teks, dan itu disengaja: kunci utamanya `(…, menu_key)`
membuat dua nilai bertabrakan untuk satu menu **mustahil secara struktur** — bukan aturan
yang harus dijaga kode. Daftar teks ber-suffix (rancangan lama) menerima
`blud.dpa:edit` dan `blud.dpa:tidak` berdampingan tanpa keberatan.

`ON DELETE CASCADE` di lapis 2 menutup satu kebocoran yang tidak kelihatan: user dihapus,
barisnya ikut hilang. Kalau tidak, id-nya suatu saat dipakai ulang oleh pegawai lain yang
mewarisi hak orang sebelumnya.

#### 4.5.2 Urutan penyelesaian

```
menu_user_access (orang ini, menu ini)     ─┐ ada? pakai
menu_role_access (peran ini, menu ini)     ─┤ ada? pakai
TABEL di lib/blud/peran.ts                 ─┤ bibit & jaring pengaman
BAWAAN_TAK_TERDAFTAR = 'LIHAT'             ─┘ peran ber-grant yang belum dikenal
        ↓
   pagar atas (§4.5.4) — tidak bisa ditembus dari Admin Panel
```

Baris ketiga penting: **tabel di kode tidak dibuang.** Ia jadi bibit saat migrasi dan
tetap jadi jawaban kalau baris DB hilang. Jatuhnya harus ke aturan yang dikenal, **tidak
pernah ke "semua boleh"**.

#### 4.5.3 `peran.ts` tetap modul daun

Bentuk perubahannya kecil dan terpusat di satu fungsi:

```ts
// sebelum
export function izinMenu(role: string, menu: MenuBlud): Izin

// sesudah — argumen ketiga opsional, semua pemanggil lama tetap sah
export function izinMenu(role: string, menu: MenuBlud, penimpa?: Izin | null): Izin
```

`penimpa` = hasil lapis 1+2 yang sudah **diselesaikan di sisi server**, bukan dicari
sendiri oleh `peran.ts` — berkas itu **wajib tetap modul daun tanpa import**, karena ribbon
di klien memakainya. Begitu ia menyeret data layer, bundel klien ikut menarik server dan
layar mulai memakai salinan aturannya sendiri.

Konsekuensi ke layar: yang dikirim ke klien adalah **peta izin yang sudah jadi**
(`Record<MenuBlud, Izin>`), bukan bahan mentah untuk dihitung ulang di sana. Satu tempat
yang menghitung, dan layar tidak punya kesempatan berbeda pendapat dengan server.

**Cache wajib.** Dua tabel ini dibaca di hampir tiap panggilan API BLUD. Simpan di memori
proses (`Map` sederhana), dibersihkan saat admin menyimpan. Tanpa itu, tiap klik di BLUD
menambah dua query.

#### 4.5.4 Pagar atas yang tidak bisa dilewati Admin Panel

Dievaluasi *sesudah* kedua lapis, jadi tidak pernah bisa ditembus dari layar pengaturan:

1. `MENU_BACA_SAJA` (`beranda`, `cetak`, dan `realisasi` — §11) tidak pernah jadi `EDIT`;
   tidak ada jalur tulisnya. Di UI kotaknya ditampilkan **mati dengan keterangan**
   "tidak ada yang bisa diubah di sini", bukan dihilangkan diam-diam.
2. `hasAppAccess(userId, role, isBludRole)` tetap lapis pertama. Izin per-menu **tidak**
   memberi akses masuk modul kepada yang tidak punya grant.
3. Tiga aksi berat di tabel §4.4 (`canHapusVersi`, `bolehBukaPeriode`, dan pemeriksaan
   per-aksi lain) **tidak** membaca kedua tabel ini sama sekali.
4. Sakelar mati modul (`app_status_blud`, `app_status_blud_realisasi`) menang atas segalanya
   — itu 503, bukan 403, dan dijawab lebih dulu.
5. **Baris `SUPER_ADMIN` terkunci** di matriks peran. Kalau bisa diedit, cepat atau lambat
   ada yang mencabut aksesnya sendiri dan tidak tersisa siapa pun yang bisa memperbaikinya.

#### 4.5.5 Rincian per-aksi (opsional, sesudah matriks jalan)

Permintaan pemilik menyebut "bisa lebih spesifik: edit, simpan, dan seterusnya". Itu bisa,
tapi hanya berguna di menu yang **memang punya percabangan aksi**. Kalau dibuat seragam
untuk 12 menu, sebagian besar kotaknya tidak menyambung ke apa pun — admin mencentang,
tidak terjadi apa-apa, lalu melapor sistemnya rusak.

| Menu | Aksi yang layak dipisah |
|---|---|
| DPA BLUD | simpan · tarik dari Usulan · 🔒 hapus versi |
| Pergeseran DPA | simpan · suntik ke DPA · 🔒 hapus versi |
| Buku Kas | catat & ubah transaksi · hapus transaksi · ajukan permintaan |
| Tutup Kas | isi neraca (kas fisik/bank) · tutup bulan · 🔒 buka kembali |

Delapan menu sisanya hanya punya satu perbuatan (simpan) — kotak centang menunya sudah
memadai, tidak perlu rincian sama sekali. Yang bertanda 🔒 **ditampilkan tapi tidak bisa
dicentang** (pagar atas nomor 3); menampilkannya justru berguna, supaya admin melihat siapa
pemegangnya dan tahu kenapa toggle-nya tidak ada — bukan mengira fiturnya lupa dibuat.

Dikerjakan **sesudah** matriks 12 menu terbukti jalan, bukan bersamaan.

### 4.6 Fungsi baru di `lib/security/guard.ts`

```ts
izinMenuUser(userId, role, appKey, menuKey): Promise<Izin>       // resolusi 2 lapis + cache
petaIzin(userId, role, appKey): Promise<Record<string, Izin>>    // sekali baca untuk 1 layar
```

`hasAppAccess()` — **God Node**, dipakai lintas modul — signature-nya **tidak diubah**.
Fungsi `isBludRole`/`isIkiRole`/dst. juga tidak diubah signature-nya. Perilaku per-menu
ditambahkan lewat fungsi baru, bukan mengubah yang lama. Ini syarat mutlak Fase 1.

---

## 5. Migrasi data & kompatibilitas mundur

- **Satu migration**: dua tabel baru (§4.5.1). `users.app_access` tidak disentuh — bentuk
  maupun isinya. Ikutannya: `AppAccessKeyEnum` tetap 10 nilai datar dan cap `.max(10)` di
  `admin-schemas.ts:68` **tidak perlu dinaikkan** (rancangan lama mengharuskannya).
- Data lama (`['blud','iki']`) tetap valid apa adanya — ia menjawab pertanyaan yang sama
  seperti sebelumnya: boleh masuk modul apa. **Tidak ada user yang terkunci saat deploy.**
- **Kedua tabel dibuat KOSONG — bibit 60 baris dibatalkan** (keputusan saat eksekusi,
  2026-08-01). Rancangan sebelumnya menyalin `TABEL` ke dalam migration. Menjalankannya
  memperlihatkan dua hal yang lebih baik dari itu: (a) menyalin 60 baris ke SQL membuka
  satu-satunya kesempatan salah salin yang ada di seluruh rencana ini, padahal aturannya
  sudah hidup di kode; (b) jalur cadangan "baris tidak ada → pakai kode" jadi hanya
  terpakai di tes — dan jalur yang cuma hidup di tes akan diam-diam rusak. Dengan tabel
  kosong, jalur itu **dipakai di produksi sejak hari pertama**, jadi ia tidak bisa busuk
  tanpa ketahuan. Efeknya sama: hari pertama sesudah deploy, tiap orang mendapat izin yang
  persis sama seperti hari sebelumnya.
- **Yang disimpan hanya SELISIH terhadap bawaan.** Admin mencentang 12 kotak, yang tertulis
  ke DB cuma yang berbeda. Sama dengan bawaan = tidak ada baris = ikut mengikuti kalau
  bawaannya suatu saat berubah. "Kembalikan ke bawaan" karena itu = hapus barisnya.
- SUPER_ADMIN & ADMIN: `/api/user/access` sudah mengembalikan `app_access: null` (= tak
  terbatas) untuk keduanya. Perilaku ini **dipertahankan** — SUPER_ADMIN tidak boleh bisa
  mengunci dirinya sendiri (§4.5.4 nomor 5).

### Menu yang berganti nama atau dihapus

Rancangan lama tidak membahas arah ini dan itu celah nyata. Kalau suatu saat sebuah menu
dihapus atau di-*rename*, barisnya di kedua tabel jadi yatim: tidak berbahaya (resolusi
tidak akan pernah menanyakannya), tapi tidak ada yang membersihkan dan tidak ada yang
memberi tahu admin bahwa centangannya sudah tak berarti.

Aturannya: **`menu_key` yang tidak ada di registry diabaikan saat resolusi, dan dibuang
saat admin menyimpan akses orang/peran itu.** Tidak perlu cron, tidak perlu layar khusus —
data dibersihkan pada saat ia memang sedang disentuh orang. Panel pratinjau (§6)
menampilkannya sebagai baris kelabu "menu tidak dikenal lagi" supaya perubahannya kelihatan,
bukan hilang diam-diam.

---

## 6. Tampilan Admin Panel

Dua tempat, sesuai dua lapis §4.5 — dan keduanya memakai daftar yang sama persis, cuma
sasarannya beda.

### 6.1 Modal "Atur Akses Aplikasi" (per orang) — yang sudah ada, bertambah isi

```
Akses BLUD — Budi Santoso (PERBENDAHARAAN)          [ Ikut bawaan peran ]

  Yang tidak dicentang tetap bisa dibuka & diunduh — hanya tidak bisa diubah.

  ☐ Beranda                    — tidak ada yang bisa diubah di sini
  ☐ Master Akun
  ☐ Kode Besar
  ☐ Penanggung Jawab
  ☐ DPA BLUD                                                  ⚙ rincian
  ☐ Pergeseran DPA                                            ⚙ rincian
  ☑ Buku Kas                                                  ⚙ rincian
  ☑ Bukti Setor
  ☑ Realisasi                  — tidak ada yang bisa diubah di sini
  ☑ Tutup Kas                                                 ⚙ rincian
  ☐ Cetak                      — tidak ada yang bisa diubah di sini
  ☑ Pengaturan (Pejabat SPJ)                                  ⚙ rincian

  ▸ Opsi lanjutan — sembunyikan menu tertentu dari orang ini

  ── Hasil untuk Budi ─────────────────────────────────────────
     Bisa ubah: Buku Kas · Bukti Setor · Tutup Kas · Pengaturan
     Lihat saja: 8 menu lainnya
     🔒 Buka kembali periode: KEUANGAN · ADMIN · SUPER_ADMIN — diatur di kode
```

Empat hal yang tidak boleh hilang dari layar ini:

- **Tombol "Ikut bawaan peran".** Tanpa itu, 20 pegawai × 12 menu = 240 kotak yang harus
  diurus manual, dan tiap pegawai baru mulai dari nol. Dengan itu, per-orang tetap bisa
  tapi tidak harus.
- **Blok "Hasil untuk …"** — admin melihat akibat kliknya, bukan menebaknya. Ini jaring
  pengaman paling murah untuk sebuah layar konfigurasi.
- **Baris 🔒** yang menampilkan pemegang aksi berat, jelas-jelas tidak bisa dicentang.
- **Keterangan pada menu tanpa jalur tulis** — kotaknya mati **dengan alasan**, bukan
  hilang. Checkbox mati tanpa penjelasan lebih membingungkan daripada baris yang tidak ada;
  tapi baris yang tidak ada sama sekali membuat admin mengira menunya terlewat.

### 6.2 Tab baru "Akses per Peran" (matriks)

Daftar yang sama, tapi sasarannya peran — inilah yang membuat "tanpa coding" jadi nyata,
karena aturan yang berlaku hari ini adalah aturan peran, bukan aturan per orang.

- Matriks peran × menu; baris `SUPER_ADMIN` tampil **terkunci** (§4.5.4 nomor 5).
- Tombol **"Kembalikan ke bawaan"** per peran → tulis ulang dari `TABEL` di kode. Sesudah
  admin mengutak-atik dan hasilnya jadi aneh, harus ada satu klik untuk pulang.
- Peringatan sebelum simpan kalau perubahannya mengenai lebih dari satu orang:
  *"Perubahan ini berlaku untuk 4 pengguna berperan KEUANGAN."*

### 6.3 Yang tetap

- Komponen, radius, warna, tipografi → token `docs/design/DESIGN-SYSTEM.md` yang sama.
  Tidak ada komponen baru, tidak ada hex baru. `PrimaButton` untuk CTA, `confirmDialog`
  untuk konfirmasi — bukan `window.confirm`.
- Kolom ringkas di tabel user (`{n} app`) tetap menghitung **modul**, bukan menu — supaya
  angkanya tetap terbaca.

---

## 7. Fase eksekusi

Wajib bertahap. Fase 1 **tidak boleh mengubah perilaku sama sekali** — murni refactor.

### Fase 0 — Persiapan ✅ SELESAI
- [x] Dokumen ini disetujui (revisi 2026-08-01).
- [x] Sub-menu yang dibatasi ditentukan: **BLUD 12 menu** (§11), Beranda & Cetak dikunci
      `selaluTerbuka` / baca-saja.
- [ ] **Periksa server kantor lebih dulu** — siapa saja pemegang grant yang akan terdampak:
      ```sql
      SELECT username, role, app_access FROM users WHERE app_access LIKE '%blud%';
      ```
      Wajib sebelum Fase 2. Peringatan yang sama sudah ditulis di `CONCEPT-blud-peran.md` §5.3.

### Fase 1 — Registry dinamis (perilaku identik)
- [ ] Buat `lib/registry/apps.ts` — level 1 saja (10 modul), **belum ada sub-menu**.
- [ ] Ganti 6 daftar hardcoded (§1.2) jadi turunan registry.
- [ ] `AppAccessKeyEnum` di-derive dari node level 1. Cap `.max(10)` **tetap** — `app_access`
      tidak bertambah isi (§2).
- [ ] **DoD:** `npx tsc --noEmit` + ESLint bersih; grant/revoke akses & kill-switch maintenance
      berperilaku persis sama seperti sebelum perubahan; tidak ada perubahan visual.
- **Nilai yang didapat**: tambah modul baru = edit 1 file, otomatis muncul di semua tempat.

### Fase 2 — BLUD saja — ✅ DIKERJAKAN 2026-08-01

> Diverifikasi langsung di peramban sesudah migration dijalankan ke DB lokal — sebagai
> SUPER_ADMIN **dan** sebagai akun uji `uji.perbendaharaan` (PERBENDAHARAAN), supaya yang
> diuji bukan cuma layar admin melainkan pengalaman orang yang dibatasi.
>
> **Dengan kedua tabel kosong** (keadaan sesudah deploy): tab "AKSES MENU" menampilkan
> aturan KEUANGAN persis seperti yang berlaku di kode — Tutup Kas + Pengaturan bisa ubah,
> 10 menu lihat saja. Bendahara uji melihat 12 tile; `GET` master-akun/dpa/pagu **200**,
> `POST` dpa & master-akun **403**, buka-kembali-periode **403**.
>
> **Dengan `blud.dpa = EDIT` untuk orang itu saja**: `POST /api/blud/dpa` berubah jadi
> **400** (ditolak Zod karena body uji kosong — artinya pagarnya sudah lolos), sementara
> `POST /api/blud/master-akun` **tetap 403**. Itu bukti model penimpa per-menu: yang
> dicentang terbuka, yang lain tidak ikut terbawa. Dua pagar atas tetap menolak:
> hapus versi DPA **403** (`canHapusVersi`) dan buka periode **403** (`bolehBukaPeriode`)
> — pemisahan tugas tidak bisa ditembus dari Admin Panel, walau menunya sudah EDIT.
> Tombol "Simpan Rekap PK" di layar Cetak **muncul**, padahal peran PERBENDAHARAAN tidak
> pernah memegang EDIT DPA — bukti `cetak/page.tsx` memakai izin hasil resolusi, bukan role.
>
> **Dengan `blud.buku_kas = TIDAK`**: tile Buku Kas hilang, `/blud/buku-kas` melempar balik
> ke Beranda BLUD, `POST /realisasi/tx` **403** — tapi layar **Bukti Setor tetap utuh**
> (`GET /realisasi/tx` **200**, konsol bersih), karena pagar bacanya menyebut kedua menu.
> Itu justru kelas kerusakan yang §11 "Ketergantungan antar-menu" ada untuk mencegah.
> Hal yang sama pada SUPER_ADMIN dengan `blud.dpa = TIDAK`: `?mode=tahun-list` tetap **200**
> sementara `?tahun=2026` **403** — pemisahan per-mode bekerja.
>
> Seluruh baris uji dihapus sesudahnya; kedua tabel kembali kosong dan tampilan pulih
> (tile Buku Kas kembali, tombol Simpan Rekap PK hilang lagi).
>
> **Jejak audit diperiksa langsung di tabel**, bukan hanya "kodenya ada" — `writeAuditLog`
> gagal diam-diam kalau bermasalah, jadi keberadaan barisnya harus dilihat sendiri. Empat
> penyimpanan menghasilkan empat baris `USER_UPDATE` berisi sebelum→sesudah, nama pengubah,
> IP, dan waktu; mengembalikan ke bawaan tercatat sebagai `… → (ikut bawaan)`.
>
> **Beban & cache diukur** (`node scripts/bench-menu-access.mjs`, keadaan terburuk yang
> masuk akal: 4 peran × 12 menu terisi penuh + perkecualian per orang):
>
> | | hasil |
> |---|---|
> | Panggilan pertama (cache dingin) | **2 query** |
> | 100 panggilan berikutnya | **0 query** |
> | 20 pemanggilan (5 orang × 4 peran) | 9 query — satu per orang + satu per peran, bukan satu per panggilan |
> | 50 permintaan **berbarengan**, cache dingin | **2 query** |
> | 50 pengguna serentak, cache dingin | 9 query, **2,4 ms** |
> | 50 pengguna serentak, cache panas | 0 query, **1 ms** |
> | 1.000× `getPetaPenimpa` lewat cache | 1,9 ms |
>
> TTL 15 detik terbukti kedaluwarsa tepat waktu, dan menyimpan membersihkan cache seketika
> di proses yang menyimpan. Skala acuannya nyata: pemilik menyebut **maksimal 50 pengguna
> serentak, wajarnya ~20**. Pada angka itu bebannya tidak terukur secara praktis.
>
> **Serbuan bersamaan ditutup** (*cache stampede*, diperbaiki atas permintaan pemilik).
> Pengukuran pertama menunjukkan 50 permintaan yang datang berbarengan tepat saat cache
> dingin menghasilkan **100 query** — semuanya meleset sebelum yang pertama selesai mengisi
> cache. Perbaikannya: yang disimpan di cache adalah **janji**-nya, bukan hasilnya, sehingga
> yang menyusul ikut menunggu janji yang sama. Hasilnya 100 → **2 query**, dan 50 pengguna
> berbeda 100 → 9 query (17 ms → 2,4 ms).
>
> Dua hal yang menentukan benarnya, dan keduanya mudah terlewat kalau pola ini ditiru:
> pemasangan kotak harus terjadi **sebelum `await` pertama** (karena itu `lewatCache()`
> sengaja bukan `async` — kalau tidak, celahnya terbuka lagi di antara "mulai membaca" dan
> "menyimpan hasil"); dan **janji yang gagal harus dibuang dari cache**, kalau tidak DB
> putus sedetik akan disajikan sebagai penolakan selama seperempat menit bagi semua orang.
> Pembuangannya diberi syarat `rak.get(kunci) === kotak` supaya tidak ikut menghapus
> pembacaan lebih baru yang sudah menggantikannya.
>
> Ini bukan race condition yang merusak data — semua peserta membaca baris yang sama dan
> menulis nilai yang sama, jadi siapa pun yang menang hasilnya benar. Yang terbuang cuma
> pekerjaan. Bedakan dari balapan di N1/L55, yang kalau dibiarkan menghasilkan **keadaan
> yang mustahil dibenarkan** (bulan tertutup di atas bulan terbuka, percobaan login yang
> hilang) — itu wajib dikunci, ini boleh dioptimalkan.

### Enam temuan sesudah fitur jalan (2026-08-01) — semuanya sudah ditutup

Ditemukan saat menelaah ulang hasil kerja sendiri, bukan dari laporan pengguna. Lima
pertama diuji langsung di peramban sesudah diperbaiki.

| # | Temuan | Perbaikan |
|---|---|---|
| 1 | `/api/admin/menu-access` **tanpa rem laju** — satu-satunya yang menyimpang dari 9 route admin lain | `checkRateLimit` 10/60 detik + `Retry-After`. Diuji: permintaan ke-11 menjawab 429 |
| 2 | **Perkecualian bertahan saat peran diganti** — kewenangan yang diberikan selagi ia PROGRAM ikut terbawa ke jabatan barunya | Dihapus di transaksi yang sama dengan perubahan peran; jumlahnya dicatat di audit dan disebut di pesan. Modal UBAH ROLE memperingatkan **sebelum** disetujui (jumlahnya dibawa kolom `menu_exceptions` di daftar user) |
| 3 | **Dua admin menyimpan bersamaan, satu perubahan hilang tanpa suara** | Sidik jari keadaan tersimpan dikirim balik saat menyimpan → 409 `BERUBAH`, layar memuat ulang. Dikunci `acquireBludLock` lebih dulu, karena **L69-a**: keadaan awalnya KOSONG dan `FOR UPDATE` pada baris yang belum ada tidak mengunci apa pun |
| 4 | **Baris yatim** saat grant modul dicabut | Ikut dihapus di `set-app-access` untuk tiap modul yang tidak lagi ada di daftar |
| 5 | **Tautan antar-menu** masih mengarah ke menu yang tertutup | `izinLayar` mengembalikan peta 12 menu; `components/blud/TautanMenu.tsx` menurunkan tautan jadi teks tebal, kartu KPI Beranda jadi `div` (angkanya tetap tampil), tombol Unduh SPJ ikut izin `cetak`/`tutup-kas` |
| 6 | Nama modul `'blud'` **ditulis di tiga tempat** | `lib/registry/menu-apps.ts` — bentuk kecil dari registry Fase 1. Menambah modul = satu baris. Zod, daftar key, dan panel semuanya diturunkan dari sana |

Satu lagi yang ketemu sambil jalan dan ikut ditutup: **Beranda ternyata masih bisa
di-`TIDAK`-kan**, padahal §4.2 menyatakan ia selalu terbuka. Akibatnya lingkaran —
`izinLayar` melempar orang ke Beranda, dan Beranda-nya sendiri menolak. Sekarang
`MENU_SELALU_TERBUKA` di `peran.ts` menurunkan `TIDAK` → `LIHAT` untuk Beranda,
dievaluasi sesudah penimpa persis seperti `MENU_BACA_SAJA`.

Temuan 3 dijaga uji regresi di `scripts/concurrency-test.js` — **T10a** menjalankan dua
penyimpanan barengan dari tabel kosong **tanpa** kunci dan membuktikan dua-duanya menjawab
"tersimpan" padahal hanya satu yang bertahan (perubahan admin pertama hilang tanpa 409);
**T10b** menjalankan yang sama **dengan** `acquireBludLock` dan menuntut tepat 1 tersimpan
+ 1 ditolak. Diperiksa juga bahwa yang menahan memang `INSERT IGNORE`-nya, bukan
`FOR UPDATE`-nya: dengan `FOR UPDATE` saja pada tabel kosong, hasilnya bukan penolakan
anggun melainkan **deadlock 1213** — persis bunyi L69-a.

**Yang diperiksa dan memang bukan masalah:** CSRF (cookie `sameSite: 'lax'` + `httpOnly`
— endpoint baru berlindung di balik mekanisme yang sama dengan seluruh aplikasi);
pelebaran pagar baca (sembilan-sembilannya data di dalam modul yang aksesnya memang sudah
diberikan, tidak ada yang menyeberang); dan tidak ada dependensi baru sama sekali.


Pagar per-menu **sudah ada** (§4.4). Yang dikerjakan cuma menyambungkannya ke Admin Panel.
PK **tidak** ikut di fase ini — ia belum punya tabel peran seperti BLUD, jadi menggarapnya
bersamaan berarti membangun dua hal berbeda dalam satu langkah.

- [x] Migration dua tabel (§4.5.1), **dibuat kosong** — `docs/migrations/migration-menu-access.sql`
      + `docs/schema-mysql.sql`.
- [ ] Registry: `children` BLUD di-derive dari `MENU_BLUD` + `LABEL_MENU`, **bukan diketik
      ulang**. Kalau diketik ulang, kita baru saja membuat daftar hardcoded ke-7.
- [ ] `izinMenu(role, menu, penimpa?)` — tambah argumen ketiga (§4.5.3). `peran.ts` tetap
      modul daun tanpa import.
- [ ] `izinMenuUser()` + `petaIzin()` + cache di `guard.ts`; `_guard.ts` BLUD meneruskan
      hasilnya ke `bolehBukaMenu` / `bolehEditMenu`. **Tidak satu pun dari 19 route disentuh.**
- [ ] `_izin.ts` meneruskan penimpa juga, supaya layar dan server sepakat.
- [ ] `blud-shell.tsx` + `layout.tsx`-nya menerima **peta izin jadi** dari server
      (§9) — tanpa ini tile-nya tampil lalu route-nya menolak.
- [ ] Modal Admin Panel jadi daftar kotak centang + blok "Hasil untuk …" (§6.1).
- [ ] Tab "Akses per Peran" + tombol "Kembalikan ke bawaan" (§6.2).
- [ ] `bolehLihatSalahSatu()` + lebarkan **9 pagar baca** sesuai tabel §11 (audit 12 layar
      sudah selesai) + pindahkan pemeriksaan klien dari role ke izin hasil resolusi
      (`cetak/page.tsx:13`, `blud-shell.tsx:88`) — **satu paket dengan
      "opsi lanjutan"**, karena `TIDAK` tanpa ini merusak layar yang menunya justru terbuka.
      Delapan berkas route ini **satu-satunya pengecualian** dari "19 route tidak disentuh",
      dan semuanya hanya pada handler `GET`.
- [ ] **DoD:**
      - **uji 60 sel**: 5 peran × 12 menu hasil resolusi dua lapis **identik** dengan
        `TABEL` di kode. Ini uji regresi terpenting — membuktikan deploy tidak mengubah
        perilaku siapa pun. Skrip: `scripts/test-menu-access.mjs`;
      - user `PERBENDAHARAAN` tanpa baris di `menu_user_access` → perilakunya persis
        seperti sebelum deploy;
      - centang DPA untuk satu orang → tile DPA bisa diedit, `POST /api/blud/dpa` lolos,
        **rekan seperannya tidak ikut berubah**;
      - `curl POST /api/blud/master-akun` oleh pemegang `LIHAT` tetap 403;
      - centang Pengaturan untuk PROGRAM → **tetap tidak bisa** hapus versi
        (`canHapusVersi` menolak) — pagar atas §4.5.4 nomor 3 berfungsi;
      - centang Tutup Kas untuk PERBENDAHARAAN → **tetap tidak bisa** buka periode
        (`bolehBukaPeriode` menolak) — pemisahan tugas tidak bisa ditembus dari panel;
      - kosongkan `menu_role_access` → sistem jatuh ke `TABEL` di kode, **bukan** ke
        "semua boleh";
      - matikan `app_status_blud_realisasi` → 503 / halaman pemeliharaan, bukan 403.

### Arah ketergantungan kunci — ✅ dirapikan 2026-08-03

`lib/data/menu-access.ts` itu berkas umum (BLUD hari ini, PK dan Usulan menyusul), tapi
ia mengimpor `lib/blud/lock.ts` yang milik satu modul — panah yang menghadap ke arah
salah. Hari ini tidak terasa; yang repot nanti, saat ada kunci untuk modul Usulan yang
diambil lewat berkas bernama "blud".

Mekanismenya dipindah ke **`lib/data/locks.ts`** (`getBludVersion`, `assertBludVersion`,
`bumpBludVersion`, `acquireBludLock`, `dropBludVersion`, `BludVersionConflictError`).
`lib/blud/lock.ts` menyimpan yang memang khas BLUD — nama entity dan pembentuk key —
lalu **mengekspor ulang** sisanya, jadi 12 pemanggil lama tidak disentuh sama sekali.
Nama fungsi juga tidak diganti: mengganti nama berarti menyentuh dua belas berkas demi
kerapian, dan itu menghapus satu-satunya kelebihan langkah ini — diff-nya kecil.

**Nama tabel `blud_locks` tetap.** Migration rename menyentuh semua pemanggil demi nama
saja; risikonya tidak sepadan. Melesetnya ditulis di komentar `lib/data/locks.ts`.

Yang tersentuh: 2 berkas kode + 4 skrip uji (daftar berkas yang di-`tsc` bertambah satu).
Nol perubahan data, nol perubahan perilaku — `tsc` bersih, 5 rangkaian uji lulus, dan
jalur simpan→409→kembalikan-bawaan diuji langsung di peramban.

### Ditunda ke modul kedua — keputusannya sudah diambil, tinggal dikerjakan

Yang ditunda **pekerjaannya**, bukan keputusannya — supaya nanti tidak diputuskan ulang
dari nol.

- [ ] **Urutan penguncian: peran dulu, baru orang.** `lib/blud/lock.ts` mewajibkan
      mengunci menurut urutan key menaik supaya tidak ada lingkaran tunggu (dibuktikan
      T8a/T8b di `concurrency-test.js`). Hari ini aturan itu belum berlaku — tiap
      penyimpanan izin mengambil **tepat satu** kunci. Ia baru berlaku kalau nanti ada
      satu transaksi yang menyentuh `menu_role_access` **dan** `menu_user_access`
      sekaligus (mis. "terapkan aturan peran ini, lalu bersihkan perkecualian di
      bawahnya"). Urutannya: `blud:role:*` dulu, baru `blud:user:*` — searah dengan
      pewarisan izin, dan kebetulan juga urutan key menaik. Tulis sebagai komentar di
      `lib/data/menu-access.ts` dekat `kunciPeran`/`kunciOrang` saat modul kedua digarap.

**Yang diputuskan TIDAK dikerjakan:** menyatukan pola "INSERT IGNORE → FOR UPDATE →
cocokkan sidik jari → ganti-semua" jadi satu helper bersama. Baru ada satu wujudnya;
abstraksi yang bentuknya ditebak dari satu contoh biasanya salah bentuk. Tinjau ulang
kalau modul kedua ternyata butuh bentuk yang persis sama. Baris kunci yang menumpuk di
`blud_locks` juga dibiarkan — plafonnya di bawah 80 baris (22 peran + ±50 orang, kunci
dipakai ulang bukan ditambah), dan membersihkannya berarti menambah jalur kode.

### Fase 3 — Usulan Kebutuhan (Pola B)
- [ ] Registry `children` untuk 15 panel `usulan-kebutuhan/_panels/`.
- [ ] `getPanels(role)` jadi **bibit** `menu_role_access` untuk `app_key='usulan_aset'` (§3.2).
- [ ] Sembunyikan panel di klien **+** guard tiap route `app/api/usulan/*` — panel bukan
      route, jadi lapis API satu-satunya pagar sungguhan.
- [ ] **DoD:** panel disembunyikan **dan** endpoint-nya menolak `curl`. Kalau cuma
      disembunyikan, yang dibuat dekorasi.

### Fase 4 — sisanya, kalau memang dibutuhkan
- [ ] Perjanjian Kinerja (7 menu) — perlu tabel peran dulu, meniru `lib/blud/peran.ts`.
- [ ] E-Anggaran (9 tab), Admin Panel (10 tab) — belum ada permintaan; jangan dikerjakan
      sebelum ada.

---

## 8. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| UI-only hiding, guard API lupa | Bypass via `curl` — data bocor antar bidang | §4.3 lapis 3 wajib; checklist per route di DoD Fase 2 |
| Bibit migration salah/tidak jalan | Semua user terkunci saat deploy, atau semua over-grant | Uji 60 sel di DoD Fase 2; jaring pengaman jatuh ke `TABEL` di kode, bukan ke "semua boleh" (§4.5.2) |
| `hasAppAccess()` God Node berubah | Seluruh modul terdampak | Signature **dan bentuk data yang dibacanya** dikunci — izin per-menu hidup di tabel terpisah (§2) |
| **Matriks peran diedit sembarangan** — mis. `bawaan` KEUANGAN dinaikkan jadi EDIT di semua menu | Pemisahan tugas hilang tanpa jejak yang jelas | Tombol "Kembalikan ke bawaan" per peran (§6.2); peringatan jumlah user terdampak sebelum simpan; audit `USER_UPDATE` sebelum→sesudah |
| **Admin mengunci dirinya sendiri** | Tidak ada yang bisa masuk memperbaiki | Baris `SUPER_ADMIN` terkunci di matriks (§4.5.4 nomor 5) + `app_access: null` dipertahankan |
| Tabel izin dibaca tiap request tanpa cache | Tiap klik di BLUD menambah 2 query | Cache memori proses, dibersihkan saat admin menyimpan (§4.5.3) |
| Baris yatim sesudah menu di-*rename* | Centangan tak berarti menumpuk, admin tidak tahu | Diabaikan saat resolusi + dibuang saat menyimpan; tampil kelabu di pratinjau (§5) |
| **Menu disembunyikan padahal layar lain memanggilnya** — mis. Buku Kas di-`TIDAK` sedangkan layar Realisasi memanggil `pagu` | Layar yang menunya masih terbuka gagal memuat 403; terbaca "aplikasi rusak" | Pagar **baca** menyebut semua menu yang menampilkan datanya (pola `permintaan` GET); dikunci tes per-layar di `test-menu-access.mjs`. Bukan divalidasi di Admin Panel — itu melahirkan daftar kedua yang harus dijaga sinkron (§11) |
| **Pelebaran pagar baca kebablasan** — seluruh `GET /api/blud/dpa` dibuka ke pemegang Realisasi demi `mode=tahun-list` | Pohon DPA lengkap ikut terbuka — kebocoran sungguhan | Pelebaran **per-mode**, bukan per-handler (§11); `mode=tahun-list` saja yang melebar |
| `proxy.ts` diberi query DB | Crash Edge Runtime | Opsi A dipilih (§4.3); `proxy.ts` tidak disentuh di Fase 1–2 |
| Registry meng-import ikon lucide | `proxy.ts` gagal build | Registry = data murni; map visual tetap di `menu-client.tsx` |
| Admin salah konfigurasi lalu terkunci | Tidak bisa masuk Admin Panel | SUPER_ADMIN bypass dipertahankan (`app_access: null`) |
| **Pengaturan dipakai menembus pemisahan tugas** — mis. Tutup Kas dicentang untuk bendahara supaya bisa membuka periode sendiri | Kontrol internal keuangan hilang; tidak ada lagi orang kedua | §4.5.4 pagar atas nomor 3: `bolehBukaPeriode` & `canHapusVersi` **tidak membaca tabel izin sama sekali**. Diuji eksplisit di DoD Fase 2 |
| **`peran.ts` diberi import** supaya bisa membaca tabel izin sendiri | Data layer ikut ke bundel klien; ribbon & server mulai pakai salinan aturan berbeda | Izin diselesaikan pemanggil di sisi server lalu **dioper sebagai argumen**; klien menerima peta yang sudah jadi. `peran.ts` wajib tetap modul daun |
| Registry mengetik ulang `MENU_BLUD` | Lahir daftar hardcoded ke-7 — persis penyakit §1.2 | Registry **derive** dari `MENU_BLUD` + `LABEL_MENU`; DoD Fase 2 |

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
- `docs/migrations/migration-menu-access.sql` (dua tabel §4.5.1 + bibit 60 baris)
- `lib/data/menu-access.ts` (baca/tulis dua tabel + cache)
- `lib/data/locks.ts` (mekanisme kunci, pindahan dari `lib/blud/lock.ts`)
- `scripts/test-menu-access.mjs` (uji 60 sel)

**Diubah — Fase 1**
- `lib/data/admin-schemas.ts` (`AppAccessKeyEnum` derive; cap `.max(10)` tetap)
- `docs/schema-mysql.sql` (dua tabel baru)
- `app/(dashboard)/admin/admin-client.tsx` (`APP_ACCESS_LIST`, `APP_STATUS_LABELS`)
- `app/(dashboard)/menu/menu-client.tsx` (`APP_CARDS` → registry + map visual)
- `app/api/admin/app-status/route.ts` (allowlist key)
- `app/api/user/access/route.ts` (`APP_CHECKS`)

**Diubah — Fase 2 (BLUD) — 8 berkas inti + 8 route (`GET` saja) + 1 klien**

Angka "6 berkas" di versi sebelumnya sudah tidak berlaku: audit ketergantungan antar-menu
(§11) menambah 8 berkas route yang pagar **bacanya** dilebarkan, dan `blud-shell.tsx`
ternyata harus ikut. Yang tidak berubah adalah sifatnya — tidak satu pun pagar **tulis**
disentuh.

**Inti:**
- `lib/security/guard.ts` (`izinMenuUser` + `petaIzin` + cache)
- `lib/blud/peran.ts` (argumen ketiga `penimpa` di `izinMenu`; tetap modul daun)
- `app/api/blud/_guard.ts` + `app/api/blud/realisasi/_guard.ts` (teruskan penimpa)
- `app/(dashboard)/blud/_izin.ts` (teruskan penimpa ke layar)
- `app/(dashboard)/blud/layout.tsx` (hitung `petaIzin` sekali, oper ke shell)
- `app/(dashboard)/blud/blud-shell.tsx` (terima prop `izin`, ganti `bolehBuka(role, …)`)
- `app/(dashboard)/admin/admin-client.tsx` (modal §6.1 + tab matriks §6.2)
- `lib/registry/apps.ts` (`children` BLUD, di-derive dari `MENU_BLUD`)

**Pelebaran pagar baca (handler `GET` saja, §11):**
- `app/api/blud/dpa/route.ts` (per-mode) · `pergeseran/route.ts` (per-mode)
- `master-akun` · `penanggung-jawab` · `kode-besar`
- `realisasi/pagu` · `realisasi/tx` · `realisasi/export`

**Klien:**
- `app/(dashboard)/blud/cetak/page.tsx` (`bolehEdit(role,'dpa')` → izin hasil resolusi;
  `cetak-client.tsx` sendiri tidak berubah — prop-nya sudah benar)

> **Koreksi atas versi sebelumnya.** `blud-shell.tsx` sempat masuk daftar "TIDAK disentuh"
> dengan alasan "sudah menyaring tile lewat `bolehBuka`". Itu justru sebabnya ia **harus**
> ikut: baris 88 memanggil `bolehBuka(role, t.menu)` dan props-nya hanya
> `{username, role, themePreference}` — tidak ada jalan bagi pengaturan per-orang untuk
> sampai ke sana. Dibiarkan apa adanya, tile-nya tetap tampil lalu route-nya menolak:
> persis gejala "layar rusak" yang dokumen ini hati-hati hindari di tempat lain.

**TIDAK disentuh di Fase 2** — dan ini poin pentingnya:
- **11 dari 19 berkas route `app/api/blud/*`** — pagarnya sudah benar, cukup helper-nya
  yang berubah. Delapan berkas dilebarkan pagar **bacanya** (hasil audit §11
  "Ketergantungan antar-menu"): `dpa` · `pergeseran` · `master-akun` · `penanggung-jawab` ·
  `kode-besar` · `realisasi/pagu` · `realisasi/tx` · `realisasi/export`. **Tidak satu pun
  pagar tulis disentuh** — itu batas yang menjaga perubahan ini tetap aman.
- `lib/blud/schemas.ts` (`canHapusVersi`) · `lib/blud/realisasi-schemas.ts` (`bolehBukaPeriode`)
- `users.app_access` beserta `hasAppAccess()` dan seluruh `isXxxRole`

**Tidak disentuh**
- `proxy.ts` · `lib/security/auth.ts` · `lib/constants.ts` · `docs/schema-mysql.sql`
- `docs/design/DESIGN-SYSTEM.md` dan seluruh token desain

---

## 10. Keputusan — FINAL (2026-08-01)

Tidak ada lagi yang menggantung.

| # | Pertanyaan | Keputusan | Alasan |
|---|---|---|---|
| 1 | Cakupan Fase 2 | **BLUD saja**, lalu Usulan Kebutuhan | Dua modul inilah yang benar-benar multi-peran. PK ditunda ke Fase 4 karena belum punya tabel peran |
| 2 | Beranda tiap modul | **Selalu terbuka**, tidak bisa dibatasi | Boleh dilihat siapa pun yang berhak masuk modul; lihat §4.2 |
| 3 | Fase 3 (Usulan Kebutuhan) | **Ya, dikerjakan** | Sudah multi-peran, tapi pengaturannya belum ada di Admin Panel — `getPanels` hanya bisa diubah developer |
| 4 | Audit log | **Pakai `USER_UPDATE` yang ada** | Ia sudah mencatat isi `app_access` sebelum & sesudah. Event baru cuma memecah jejak yang seharusnya satu |
| 5 | Bentuk pagar API | **Deklarasi per handler** (§4.4) | Bukan pilihan baru — sudah berjalan di 19 route BLUD |
| 6 | Bentuk penyimpanan izin | **Dua tabel baru**, `app_access` tidak disentuh | Peta `(peran,menu)`/`(user,menu)` membuat nilai bertabrakan mustahil; God Node `hasAppAccess()` tidak berubah bentuk datanya (§0.1) |
| 7 | Aturan saat satu menu dicentang | **Penimpa per-menu**, bukan mode eksklusif | Aksi admin harus mengerjakan persis yang tertulis di layarnya. Mencentang satu baris yang diam-diam mengubah 11 baris lain membuat akibat kliknya tak bisa diperkirakan |
| 8 | Posisi `TIDAK` di UI | **Di balik "opsi lanjutan"** | `TIDAK` tidak dipakai satu peran pun hari ini; menyetarakannya membebani pemakaian harian demi kasus yang belum ada (§4.2) |
| 9 | Rincian per-aksi | **Hanya 4 menu yang punya percabangan**, dikerjakan sesudah matriks jalan | Grid seragam 12 menu × 3 aksi menghasilkan puluhan kotak yang tidak menyambung ke apa pun (§4.5.5) |
| 10 | Layar yang memanggil endpoint menu lain | **Pagar bacanya yang dilebarkan**, bukan Admin Panel yang memvalidasi | Validasi di panel = daftar kedua yang harus dijaga sinkron dengan `fetch()`; lubangnya senyap. Pagar hidup di berkas yang dijaganya, dan gagalnya nyaring saat dikembangkan (§11) |

---

## 11. Peta eksekusi BLUD (Fase 2)

Kolom **"Pagar sekarang"** menunjukkan yang **sudah terpasang dan berjalan**. Fase 2 hanya
menyambungkan penimpa ke pagar itu — isi route tidak disentuh.

| Menu | Key | Bawaan tertinggi | Route yang menjaganya | Pagar sekarang |
|---|---|---|---|---|
| Beranda | — (selalu terbuka) | LIHAT | — | `MENU_BACA_SAJA` |
| Master Akun | `blud.master_akun` | EDIT | `master-akun` | ✅ buka + edit |
| Kode Besar | `blud.kode_besar` | EDIT | `kode-besar` | ✅ buka + edit |
| Penanggung Jawab | `blud.penanggung_jawab` | EDIT | `penanggung-jawab` | ✅ buka + edit |
| DPA BLUD | `blud.dpa` | EDIT | `dpa` · `dpa/import-usulan` · `rekap-pk` | ✅ + `canHapusVersi` di DELETE |
| Pergeseran DPA | `blud.pergeseran` | EDIT | `pergeseran` · `pergeseran/inject` · `realisasi/permintaan` (PATCH) | ✅ + `canHapusVersi` di DELETE |
| Buku Kas | `blud.buku_kas` | EDIT | `realisasi/tx` · `realisasi/pagu` · `realisasi/permintaan` (POST) | ✅ `bolehLihat`/`bolehInput` |
| Bukti Setor | `blud.bukti_setor` | EDIT | `bukti-setor` | ✅ `bolehLihat`/`bolehInput` |
| Realisasi | `blud.realisasi` | **LIHAT** (baca-saja) | `realisasi/register` | ✅ baca saja |
| Tutup Kas | `blud.tutup_kas` | EDIT | `realisasi/periode` · `realisasi/gu` · `realisasi/saldo-awal` | ✅ + `bolehBukaPeriode` di DELETE |
| Cetak | `blud.cetak` | **LIHAT** (baca-saja) | `realisasi/export` · `export-log` | ✅ `bolehBuka` — unduh boleh saat LIHAT |
| Pengaturan | `blud.pengaturan` | EDIT | `pejabat` | ✅ `bolehLihat`/`bolehInput`; hapus versi dijaga `canHapusVersi` |

> Dihitung ulang 2026-08-01 (sore) lawan `977d3d6`: **38 titik pemeriksaan** di **19**
> berkas route, semuanya menyebut menunya secara eksplisit. Tidak ada handler yang terlewat.
> Angka berkasnya sempat tertulis 18 di empat tempat — keliru, dan berbahaya justru karena
> dipakai orang sebagai daftar periksa: menemukan 18 lalu berhenti berarti satu berkas
> tidak pernah ditinjau.

Tiga hal yang mudah salah dan sudah benar di kode — **jangan diubah saat Fase 2**:

1. **`realisasi/permintaan` memakai dua menu berbeda dalam satu berkas.** `POST` (mengajukan)
   = menu Buku Kas, pekerjaan bendahara. `PATCH` (menolak) = menu Pergeseran, pekerjaan yang
   bisa memenuhinya. `GET`-nya menerima **salah satu** dari keduanya (baris 34–35) — dua pihak
   memang perlu melihat daftar yang sama. Jangan disederhanakan jadi satu key.
2. **`export-log` POST tapi bukan aksi tulis.** Ia mencatat jejak unduhan dan justru harus
   tetap jalan bagi pemegang `LIHAT` — kalau tidak, unduhan mereka jadi tak berjejak.
   Penentunya bukan metode HTTP, melainkan apakah angka resminya berubah.
3. **`rekap-pk` POST memang aksi tulis** walau terdengar seperti cetakan — ia menulis tabel
   `rekap_pk`. Karena itu ia dijaga `bolehEditMenu('dpa')`, bukan `bolehBuka('cetak')`.
4. **Menu Pengaturan dijaga `bolehLihat`/`bolehInput`** (alias tipis `bolehBukaMenu`/
   `bolehEditMenu` di `realisasi/_guard.ts:23,27`), bukan helper `_guard.ts` induk. Efeknya
   sama; disebut supaya tidak "dirapikan" jadi salah.
5. **Menu Realisasi tidak punya jalur tulis sama sekali.** `realisasi/register/route.ts`
   hanya mengekspor `GET`. Karena itu ia masuk `MENU_BACA_SAJA` bersama `beranda` dan
   `cetak` — kalau tidak, admin bisa mencentang "boleh ubah" dan tidak terjadi apa-apa,
   lalu melapor sistemnya rusak. **Perlu diperiksa saat eksekusi:** apakah ada tombol di
   klien yang saat ini bersandar pada `bolehEdit(role, 'realisasi')`; kalau ada, tombol itu
   memang tidak pernah menyambung ke endpoint mana pun dan ikut dibereskan.

**Aturan turunannya, untuk menu baru mana pun:** sebuah menu boleh bertingkat `EDIT` hanya
kalau ada route yang benar-benar mengubah angka resmi. Penentunya bukan metode HTTP dan
bukan namanya — lihat catatan 2 dan 3 di atas.

### Ketergantungan antar-menu — risiko yang baru muncul bersama `TIDAK`

Diperiksa 2026-08-01 (sore), sesudah keputusan menyediakan posisi `TIDAK`. Satu layar bisa
memanggil endpoint yang dijaga menu **lain**. Contoh nyata, layar Realisasi:

| Yang dipanggil `realisasi-client.tsx` | Menu penjaganya |
|---|---|
| `GET /api/blud/realisasi/pagu` (baris 92, 137, 151) | **Buku Kas** (`pagu/route.ts:25`) |
| `GET /api/blud/dpa?mode=tahun-list` (baris 77) | **DPA** (`dpa/route.ts:44`) |
| layarnya sendiri (`_izin.ts`) | Realisasi |

Selama `TIDAK` tidak dipakai — keadaan hari ini — ini tidak pernah jadi masalah: semua
pemegang akses BLUD bisa membaca semua menu. Begitu admin bisa menyembunyikan menu,
menyembunyikan **Buku Kas** membuat layar **Realisasi** gagal memuat dengan 403, padahal
menu Realisasi-nya sendiri terbuka. Gejalanya terbaca "aplikasi rusak", bukan "Anda tidak
berhak" — persis kelas kesalahan yang sudah dua kali kita tutup di modul ini.

#### Perbaikannya: di pagar route, bukan di Admin Panel

> **Rekomendasi ini menggantikan usulan pertama saya** (menyimpan `butuhBaca` di registry
> lalu membuat Admin Panel menolak kombinasi yang mustahil). Usulan itu keliru arah, dan
> alasannya perlu dicatat karena menggoda: ia melahirkan **daftar kedua** yang harus dijaga
> sinkron dengan `fetch()` yang sebenarnya. Tambah satu `fetch()` dan lupa memperbarui
> `butuhBaca` → lubangnya senyap, ketahuan di kantor orang lain. Itu penyakit §1.2, ditulis
> ulang dengan nama baru.

**Akar masalahnya bukan di panel, melainkan di cara pagar dibaca.** Guard `pagu` menyebut
`buku-kas` seolah data pagu itu *milik* menu Buku Kas. Padahal pagu adalah **data yang
ditampilkan dua layar**. Kepemilikan itu asumsi yang tidak pernah benar.

Aturan penggantinya, dan ini yang sudah terbukti di kode:

> **Untuk endpoint BACA, guard menyebut semua menu yang layarnya menampilkan data itu.
> Untuk endpoint TULIS, tetap satu menu — pemiliknya.**

Polanya bukan barang baru. `realisasi/permintaan/route.ts:34-35` sudah memakainya persis:

```ts
const bolehBaca = await bolehLihat(session.userId, session.role, 'buku-kas')
  || await bolehLihat(session.userId, session.role, 'pergeseran')
```

`GET`-nya menerima salah satu dari dua menu karena dua pihak memang perlu melihat daftar
yang sama, sementara `POST`-nya tetap `buku-kas` dan `PATCH`-nya tetap `pergeseran`. Yang
kurang cuma satu: pola itu belum diberlakukan ke `pagu` dan `dpa`.

**Kenapa ini tidak melonggarkan keamanan.** Pemegang menu Realisasi sudah boleh melihat
angka pagu — layarnya memang menampilkannya. Membiarkan `pagu` menolaknya bukan
menjaga apa pun; ia cuma membuat layar yang sah jadi rusak. Guard yang menolak data yang
toh sudah tampil di layar bukan pagar, melainkan bug yang kebetulan belum terpicu.

**Satu kehalusan yang wajib diperhatikan pada `dpa`.** `GET /api/blud/dpa` melayani dua
bentuk data: pohon DPA lengkap **dan** `mode=tahun-list` (sekadar daftar tahun). Melebarkan
seluruh `GET`-nya ke pemegang Realisasi akan ikut membuka pohon DPA — itu kebocoran
sungguhan. Pelebarannya karena itu **per-mode, bukan per-handler**:

```ts
// dpa/route.ts GET — prinsip §4.4 diturunkan satu tingkat lagi
const modeRingan = searchParams.get('mode') === 'tahun-list'
const boleh = modeRingan
  ? await bolehLihatSalahSatu(uid, role, ['dpa', 'realisasi', 'pergeseran'])
  : await bolehBukaMenu(uid, role, 'dpa')
```

Ini perluasan alami dari keputusan §4.4 ("deklarasi per handler"): begitu satu handler
melayani beberapa bentuk data dengan kepekaan berbeda, pagarnya ikut turun ke tingkat itu.

#### Hasil audit 12 layar BLUD (2026-08-01, sebelum eksekusi)

Tiap `fetch('/api/blud/…')` di `app/(dashboard)/blud/**` dan `components/blud/**` dibaca
lalu dicocokkan ke guard route-nya. **Empat layar bersih, delapan bergantung pada menu lain.**

| Layar | Menu-nya | Memanggil endpoint milik menu lain |
|---|---|---|
| Beranda | `beranda` | — tidak ada `fetch` sama sekali (data dari server) ✅ |
| Master Akun | `master_akun` | — ✅ |
| Kode Besar | `kode_besar` | — ✅ |
| Penanggung Jawab | `penanggung_jawab` | — ✅ |
| DPA BLUD | `dpa` | `master-akun` · `penanggung-jawab` · `kode-besar` (GET, isi combobox) |
| Pergeseran | `pergeseran` | `master-akun` (GET) · `dpa?tahun=` (pohon penuh) |
| Buku Kas | `buku_kas` | `dpa?mode=tahun-list` |
| Bukti Setor | `bukti_setor` | `realisasi/tx` (GET, milik Buku Kas) · `dpa?mode=tahun-list` |
| Realisasi | `realisasi` | `realisasi/pagu` (milik Buku Kas) · `dpa?mode=tahun-list` |
| Tutup Kas | `tutup_kas` | `dpa?mode=tahun-list` · **`realisasi/export` (milik Cetak)** |
| Cetak | `cetak` | `dpa?mode=history` · `pergeseran?mode=history` · **`rekap-pk` POST (tulis, milik DPA)** |
| Pengaturan | `pengaturan` | `dpa?mode=tahun-list` · `dpa?mode=history` · `pergeseran?mode=history` |

**Temuan terbesar: `dpa?mode=tahun-list` dipanggil 7 dari 12 layar.** Ia bukan data DPA —
ia isi dropdown tahun, dan tiap layar BLUD punya dropdown itu. Menempelkannya ke menu DPA
adalah kekeliruan penggolongan, bukan kebijakan yang pernah diputuskan siapa pun.

**Dua temuan yang lebih dari sekadar pelebaran pagar:**

1. **`realisasi/export` dipanggil dari layar Tutup Kas lewat `window.location.href`**
   (`tutup-kas-client.tsx:304`), bukan `fetch`. Guard-nya menu `cetak`. Pelajarannya bukan
   soal satu tombol: **mencari ketergantungan dengan hanya menyisir `fetch(` akan meleset.**
   Unduhan yang dipicu navigasi, `<a href>`, dan `window.open` ikut membawa cookie sesi dan
   ikut kena guard yang sama. Audit ulang di modul lain wajib menyisir ketiganya.
2. **`rekap-pk` POST dipanggil dari layar Cetak** (`cetak-client.tsx:186`) sedangkan
   guard-nya `bolehEditMenu('dpa')`. Ini **bukan** kesalahan pagar — `rekap-pk` memang
   menulis tabel, dan §11 catatan 3 sudah menjelaskannya. **Dan tombolnya sudah dijaga
   benar**: `cetak/page.tsx:13` mengoper `bolehSimpanRekap={bolehEdit(role, 'dpa')}`,
   dipakai di `cetak-client.tsx:202`. Layar yang memuat aksi tulis milik menu lain karena
   itu bukan cacat — asal tombolnya ikut izin menu pemiliknya, bukan izin layarnya.

   Yang **memang** perlu diubah di Fase 2: pemeriksaan itu berbasis `role` saja
   (`bolehEdit(role, 'dpa')`), jadi pengaturan per-orang tidak akan berpengaruh padanya.
   Sama persis kasusnya dengan `blud-shell.tsx` — keduanya harus menerima izin **hasil
   resolusi dua lapis**, bukan menghitung sendiri dari role.

Catatan kecil: beberapa layar memuat tautan ke menu lain (`<a href="/blud/dpa">` di
Realisasi, Buku Kas, Tutup Kas). Kalau menu tujuannya `TIDAK`, `izinLayar` akan melempar
balik ke Beranda BLUD — tidak berbahaya, tapi tautannya sebaiknya ikut disembunyikan.

#### Perubahan pagar yang diperlukan

Hanya **baca** yang dilebarkan. Tidak satu pun pagar tulis disentuh.

| Endpoint | Guard sekarang | Jadi |
|---|---|---|
| `dpa?mode=tahun-list` | menu `dpa` | **akses modul BLUD saja**, tanpa syarat menu |
| `dpa?mode=history` | menu `dpa` | `['dpa','cetak','pengaturan']` |
| `pergeseran?mode=history` | menu `pergeseran` | `['pergeseran','cetak','pengaturan']` |
| `master-akun` GET | menu `master_akun` | `['master_akun','dpa','pergeseran']` |
| `penanggung-jawab` GET | menu `penanggung_jawab` | `['penanggung_jawab','dpa']` |
| `kode-besar` GET | menu `kode_besar` | `['kode_besar','dpa']` |
| `realisasi/pagu` GET | menu `buku_kas` | `['buku_kas','realisasi']` |
| `realisasi/tx` GET | menu `buku_kas` | `['buku_kas','bukti_setor']` |
| `realisasi/export` GET | menu `cetak` | `['cetak','tutup_kas']` — lihat catatan letak tombol di bawah |
| `dpa?tahun=` (pohon penuh) | menu `dpa` | **tetap** — Pergeseran memang membaca isi DPA |
| `rekap-pk` POST | edit menu `dpa` | **tetap** — aksi tulis; tombolnya yang disembunyikan |

Sembilan baris pertama menyentuh **delapan berkas route**: `dpa`, `pergeseran`,
`master-akun`, `penanggung-jawab`, `kode-besar`, dan tiga di bawah `realisasi/`
(`pagu`, `tx`, `export`) — semuanya hanya pada handler `GET`.

**Kenapa tombol Unduh SPJ tidak dipindah ke menu Cetak** (dipertimbangkan 2026-08-01).
Memindahkannya memang menghilangkan pelebaran pagar, tapi menukarnya dengan dua kerugian.
Pertama, alur kerja: SPJ Bulanan adalah dokumen yang lahir **dari** menutup bulan —
bendahara menutup Juni lalu mengambil SPJ Juni di tempat yang sama. Kedua, dan ini yang
menentukan: sesudah dipindah, bendahara jadi **butuh** menu Cetak untuk mengambil SPJ-nya
sendiri. Menyembunyikan Cetak darinya akan memutus akses ke dokumennya sendiri —
ketergantungan baru dengan arah terbalik, bukan ketergantungan yang hilang.

Aturan umumnya, dan berlaku untuk tiap perdebatan serupa nanti: **letak tombol ditentukan
alur kerja, pagarnya yang mengikuti.** Kalau pagar yang menentukan tata letak, lama-lama
layar disusun menurut kerapian kode dan bukan menurut cara orang bekerja.

#### Langkah kerja

1. **Tambah `bolehLihatSalahSatu(userId, role, menus[])`** di `_guard.ts` BLUD — membungkus
   pola `||` yang sudah ada (`permintaan/route.ts:34-35`) supaya tidak disalin-tempel
   delapan kali dan supaya niatnya kelihatan.
2. **Terapkan tabel di atas.** `dpa` dan `pergeseran` per-mode; sisanya per-handler.
3. **Ganti pemeriksaan berbasis-role di klien** ke izin hasil resolusi:
   `cetak/page.tsx:13` (`bolehEdit(role,'dpa')` → izin DPA orang itu) dan `blud-shell.tsx:88`.
   Tombolnya sudah ada penjaganya; yang kurang cuma sumber izinnya. Sekalian sembunyikan
   tautan antar-menu (`<a href="/blud/dpa">` dst.) kalau tujuannya `TIDAK`.
4. **Kunci dengan tes, bukan dengan daftar**: `scripts/test-menu-access.mjs` menambah satu
   babak — untuk tiap layar, dengan hanya menu layar itu yang `LIHAT` dan sisanya `TIDAK`,
   seluruh `fetch()`/navigasi-unduhnya harus menjawab 200. Drift ketahuan di CI, bukan di
   kantor orang.

Sesudah keempatnya, Admin Panel **tidak perlu** memvalidasi kombinasi sama sekali —
menyembunyikan menu apa pun tidak lagi bisa merusak layar lain. Itu ukuran bahwa
perbaikannya kena di akar: yang hilang bukan gejalanya, melainkan kemungkinannya.

### Layar campuran — aturan yang akan berulang di modul lain

Satu layar boleh memuat panel dari sub-modul yang punya **sakelar matinya sendiri**.
`/blud/pengaturan` contohnya: panel Pejabat SPJ ikut sakelar `app_status_blud_realisasi`,
sedangkan Hapus Versi DPA/Pergeseran tidak.

**Aturannya: yang mati cukup panelnya, bukan layarnya.** Konsekuensi teknisnya wajib
ditulis di sini karena tidak kelihatan dari kode mana pun sendirian:

- `MENU_REALISASI` (`peran.ts:35`) **sengaja tidak sejajar** dengan daftar route yang dijaga
  `realisasiMati()`. Route `pejabat` ikut sakelar itu, tapi menu `pengaturan` tidak masuk
  daftar. **Ketidaksejajaran itu disengaja** — memasukkannya akan ikut mematikan Hapus Versi
  DPA yang tak ada urusannya dengan penatausahaan, persis alasan `'cetak'` juga dikeluarkan
  (komentar `peran.ts:31-33`). Tanpa catatan ini orang berikutnya akan "merapikan"-nya.
- Sebagai gantinya, **panel semacam itu wajib mengenali 503 sebagai keadaan, bukan galat** —
  tampilan pemeliharaan sendiri, bukan toast merah. Sudah diterapkan di
  `components/blud/PejabatSpjPanel.tsx:93` (deteksi) dan `:211-216` (tampilan).

Pola ini berlaku untuk tiap layar campuran berikutnya, di modul mana pun.

### Yang BELUM tersentuh sama sekali di BLUD

Satu-satunya kekurangan nyata: **`TABEL` di `lib/blud/peran.ts` masih dikunci per peran di
dalam kode.** Lima peran punya barisnya (`SUPER_ADMIN`, `ADMIN`, `PROGRAM`, `KEUANGAN`,
`PERBENDAHARAAN`); peran lain yang punya grant dapat `LIHAT` semua menu. Belum ada cara
mengubah aturan sebuah peran, maupun memberi satu orang kewenangan berbeda dari peran-nya,
tanpa deploy. Itulah, dan hanya itulah, yang ditambahkan Fase 2.

Perlu ditegaskan karena mudah salah baca: **aturan yang berlaku sekarang sudah benar** dan
Fase 2 tidak bermaksud mengubahnya. Yang dipindahkan adalah **tempat aturan itu tinggal** —
dari kode ke tabel yang bisa diatur admin. Bukti bahwa maksud ini tercapai adalah uji 60 sel
di DoD: kalau satu sel saja berbeda, yang terjadi bukan "fitur baru" melainkan perubahan hak
akses yang tidak diminta siapa pun.
