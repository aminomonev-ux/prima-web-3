# CONCEPT — Pembagian Peran BLUD (izin dua sumbu)

> Status: **konsep lengkap, siap dieksekusi — tidak ada keputusan yang menggantung** · Ditulis 2026-07-27
> Terkait: `docs/CONCEPT-blud-realisasi.md` §7.4 · `docs/AUDIT-blud.md` (S5 selesai — cikal bakal bentuknya) · `docs/TUTORIAL-blud.md` §9.2

---

## 1. Masalah

Akses BLUD hari ini **biner**: `isBludRole(role, appAccess)` menjawab satu pertanyaan
saja — boleh masuk atau tidak. Yang lolos mendapat **semuanya**.

```
SUPER_ADMIN / ADMIN ─┐
                     ├─→ isBludRole → 12 menu, semua bisa diedit
app_access 'blud'  ──┘
```

Akibatnya, memberi grant `app_access: 'blud'` kepada bendahara supaya ia bisa
mengisi Buku Kas **sekaligus** memberinya wewenang mengubah DPA dan Pergeseran.
Itu bukan yang diinginkan siapa pun; yang menahannya selama ini cuma kehati-hatian
saat memberi grant — dan itu bukan pagar, cuma kebiasaan.

Dua pengecualian sudah dipasang lebih dulu dan terbukti bentuknya enak dipakai:

| Fungsi | Berkas | Isi |
|---|---|---|
| `canHapusVersi(role)` | `lib/blud/schemas.ts` | `['SUPER_ADMIN','ADMIN']` |
| `bolehBukaPeriode(role)` | `lib/blud/realisasi-schemas.ts` | `['SUPER_ADMIN']` |

Dokumen ini menyelesaikan sepuluh baris sisanya dengan pola yang sama, hanya
sumbunya bertambah satu: **peran × menu**, bukan cuma peran.

---

## 2. Keputusan #41 — izin dua sumbu, satu tabel

Satu tabel di satu berkas menjawab satu pertanyaan: *peran ini, di menu ini, boleh
apa?* Jawabannya tiga kemungkinan:

| Jawaban | Arti |
|---|---|
| `EDIT` | boleh mengubah, menyimpan, menghapus baris |
| `LIHAT` | boleh membuka layarnya dan **mengunduh**, tidak boleh mengubah apa pun |
| `TIDAK` | menunya tidak muncul di ribbon; route-nya menolak |

Tabel itu dibaca **dua** pihak, dan itu syaratnya: ribbon (untuk menyembunyikan menu
& tombol) dan setiap route (sebagai pagar sungguhannya). Kalau hanya ribbon yang
membacanya, yang dibuat cuma dekorasi — pelajaran yang sudah ditulis di S5.

## 3. Arti "lihat" — mengunduh tetap boleh

Keputusan pemilik (2026-07-27): **`LIHAT` mencakup unduh.** Kabid keuangan yang
hanya boleh melihat DPA tetap bisa menarik Excel-nya; yang dilarang mengubah dan
menghapus, bukan membaca.

Konsekuensi teknisnya perlu disebut terang-terangan, karena mudah keliru: tiga
endpoint di bawah **bukan** aksi tulis walaupun metodenya `POST`.

| Endpoint | Metode | Sifat |
|---|---|---|
| `realisasi/export` | GET | unduh SPJ — baca |
| `export-log` | POST | mencatat jejak unduhan, tidak mengubah data keuangan |
| Cetak (`/blud/cetak`) | GET | baca |

Aturannya: **yang menentukan bukan metode HTTP, melainkan apakah angka resminya
berubah.** `export-log` menulis ke audit, dan justru harus tetap jalan untuk
pemegang `LIHAT` — kalau tidak, unduhan mereka tidak berjejak.

---

## 4. Tabel peran × menu

Peran yang terlibat (nama persis dari `lib/constants.ts`):

- `SUPER_ADMIN`, `ADMIN` — admin sistem & admin staf
- `PROGRAM` — sub-bidang di bawah RENBANG, pemegang perencanaan anggaran
- `KEUANGAN` — **bidang**, atasan dari PERBENDAHARAAN / AKUNTANSI / PENGEMBANGAN PENDAPATAN
- `PERBENDAHARAAN` — sub-bidang, bendahara pengeluaran

| Menu | SUPER_ADMIN | ADMIN | PROGRAM | KEUANGAN | PERBENDAHARAAN |
|---|---|---|---|---|---|
| Beranda | LIHAT | LIHAT | LIHAT | LIHAT | LIHAT |
| Master Akun | EDIT | EDIT | **EDIT** | LIHAT | LIHAT |
| Kode Besar | EDIT | EDIT | **EDIT** | LIHAT | LIHAT |
| Penanggung Jawab | EDIT | EDIT | **EDIT** | LIHAT | LIHAT |
| DPA BLUD | EDIT | EDIT | **EDIT** | LIHAT | LIHAT |
| Pergeseran DPA | EDIT | EDIT | **EDIT** | LIHAT | LIHAT |
| Buku Kas | EDIT | EDIT | LIHAT | LIHAT | **EDIT** |
| Bukti Setor | EDIT | EDIT | LIHAT | LIHAT | **EDIT** |
| Realisasi | EDIT | EDIT | LIHAT | LIHAT | **EDIT** |
| Tutup Kas | EDIT | EDIT | LIHAT | **EDIT** | **EDIT** |
| Cetak | LIHAT | LIHAT | LIHAT | LIHAT | LIHAT |
| Pengaturan | EDIT | EDIT | **EDIT** | **EDIT** | **EDIT** |

Tiga aksi tidak cukup diwakili kolom menu, karena beratnya berbeda dari isi menunya:

| Aksi | Siapa | Catatan |
|---|---|---|
| **Buka kembali periode** | SUPER_ADMIN · ADMIN · **KEUANGAN** | PERBENDAHARAAN boleh menutup, **tidak** membuka — pemisahan yang jadi inti rancangan ini. KEUANGAN boleh dua-duanya (menu Tutup Kas = EDIT) |
| **Hapus versi DPA/Pergeseran** | SUPER_ADMIN · ADMIN | sudah berlaku (S5). PROGRAM boleh mengedit isinya, tidak menghapus versinya |
| **Tolak permintaan pergeseran** | SUPER_ADMIN · ADMIN · **PROGRAM** | yang boleh menolak = yang bisa memenuhinya |

> **Pengaturan sengaja terbelah.** Layarnya memuat dua hal dengan berat berbeda:
> Pejabat SPJ (semua peran boleh mengisi) dan hapus versi (dua peran). Jadi menunya
> `EDIT` untuk semua, tapi bagian hapusnya dijaga `canHapusVersi` yang sudah ada.
> Ini satu-satunya menu yang izinnya tidak seragam di dalam dirinya sendiri —
> disebut di sini supaya tidak dikira kelalaian.

**PERBENDAHARAAN memegang satu rentang utuh**: Buku Kas → Bukti Setor → Realisasi →
Tutup Kas → Cetak. Itu memang satu pekerjaan yang berurutan, bukan lima menu terpisah.

**Inti pemisahannya**: PERBENDAHARAAN tangan yang mengerjakan, KEUANGAN tanda tangan
yang membuka kunci. Bendahara boleh mengunci pekerjaannya sendiri, tapi tidak boleh
membuka kunci itu lagi — harus ada orang kedua.

---

## 5. Bentuk teknis

### 5.1 Satu berkas, satu tabel

`lib/blud/peran.ts` — **modul daun**, tidak mengimpor apa pun dari `next/server`
maupun data layer, supaya klien (ribbon, tombol) bisa memakainya tanpa menarik
seisi server. Pola yang sama dengan `lib/blud/alokasi-rule.ts`.

```ts
export const MENU_BLUD = ['beranda','master-akun','kode-besar','penanggung-jawab',
  'dpa','pergeseran','buku-kas','bukti-setor','realisasi','tutup-kas',
  'cetak','pengaturan'] as const
export type MenuBlud = typeof MENU_BLUD[number]
export type Izin = 'EDIT' | 'LIHAT' | 'TIDAK'

export function izinMenu(role: string, menu: MenuBlud): Izin
export function bolehEdit(role: string, menu: MenuBlud): boolean
export function bolehBuka(role: string, menu: MenuBlud): boolean   // EDIT atau LIHAT
```

Tabelnya `Record<string, Partial<Record<MenuBlud, Izin>>>` + satu nilai bawaan per
peran, supaya barisnya pendek: cukup tulis yang menyimpang dari bawaannya.

### 5.2 Grant `app_access` tetap jadi pintu masuk

Dua lapis, dan urutannya penting:

1. `hasAppAccess(userId, role, isBludRole)` — **boleh masuk modul?** (tidak berubah)
2. `izinMenu(role, menu)` — **di dalam, boleh apa?** (baru)

Peran tanpa grant tetap tidak bisa masuk sama sekali, walaupun namanya ada di tabel.
Memberi grant tidak lagi berarti memberi segalanya — dan itu justru yang membuat
grant aman diberikan lebih longgar dari sekarang.

### 5.3 Peran yang tidak ada di tabel

Peran ber-grant yang tidak terdaftar (mis. `AKUNTANSI`, `ADMIN_KABAG`) mendapat
**`LIHAT` untuk semua menu**. Bukan `TIDAK`: mereka sudah lolos pemeriksaan grant,
jadi memang sengaja diberi akses; dan bukan `EDIT`: peran yang belum dipikirkan
tidak boleh diam-diam mewarisi wewenang menulis.

> ⚠️ **Ini perubahan perilaku bagi pemegang grant yang sudah ada.** Hari ini mereka
> bisa mengedit; sesudah ini hanya bisa melihat sampai perannya dimasukkan ke tabel.
> Di basis data pengembangan sekarang **tidak ada satu pun pemegang grant** (hanya
> ada akun `SUPER_ADMIN` dan `PROGRAM`), jadi tidak ada yang terdampak — tapi
> **server kantor wajib diperiksa lebih dulu**:
> ```sql
> SELECT username, role FROM users WHERE app_access LIKE '%blud%';
> ```

### 5.4 Pemetaan route → menu

18 berkas route di `app/api/blud/`. Tiap berkas menyatakan menunya sekali, lalu
guard-nya membaca tabel — bukan menulis daftar peran sendiri.

| Route | Menu | Guard tulis |
|---|---|---|
| `master-akun` · `kode-besar` · `penanggung-jawab` | masing-masing | `bolehEdit(role, menu)` |
| `dpa` · `dpa/import-usulan` | `dpa` | `bolehEdit` + `canHapusVersi` utk DELETE |
| `pergeseran` · `pergeseran/inject` | `pergeseran` | idem |
| `realisasi/tx` · `realisasi/pagu` | `buku-kas` | `bolehEdit` |
| `bukti-setor` | `bukti-setor` | `bolehEdit` |
| `realisasi/register` | `realisasi` | baca saja |
| `realisasi/periode` · `realisasi/gu` | `tutup-kas` | `bolehEdit` + `bolehBukaPeriode` utk DELETE |
| `realisasi/permintaan` | `buku-kas` (POST) / `pergeseran` (PATCH tolak) | dua menu berbeda dalam satu berkas |
| `realisasi/export` · `export-log` · `rekap-pk` | `cetak` | `bolehBuka` — unduh boleh saat LIHAT |
| `pejabat` | `pengaturan` | `bolehEdit` |

> `realisasi/permintaan` satu-satunya berkas yang izinnya berbeda antar-metode:
> **mengajukan** permintaan itu pekerjaan bendahara (menu Buku Kas), **menolaknya**
> pekerjaan yang memegang Pergeseran. Jangan disederhanakan jadi satu menu.

### 5.5 Ribbon & tombol

- `blud-shell.tsx` menyaring tile dengan `bolehBuka(role, menu)`.
- Layar ber-`LIHAT` menyembunyikan tombol Simpan/Tambah/Hapus, **bukan** menonaktifkannya
  — tombol mati tanpa penjelasan lebih membingungkan daripada tombol yang tidak ada.
- Satu spanduk tipis di atas layar: *"Anda membuka menu ini sebagai pembaca — unduh
  tetap bisa, perubahan tidak disimpan."*

---

## 6. Yang tidak berubah

- **Tanpa ownership per-record** (AUTHZ-02/V5). Peran menentukan menu, bukan baris:
  dua akun PERBENDAHARAAN tetap saling bisa mengubah transaksi masing-masing. BLUD
  memang modul kolaboratif; ini keputusan lama yang tetap berlaku.
- Seluruh pagar integritas (T1, T2, S1, S2, S3) berjalan **di atas** izin ini, bukan
  digantikan olehnya. Peran menjawab "boleh menyentuh?", pagar menjawab "hasilnya sah?".
- `bludRateLimit`, kode konfirmasi hapus, dan alasan wajib tetap seperti sekarang.

---

## 7. Tiga hal yang sempat dikira pertanyaan — semuanya sudah terjawab

Ditulis di sini bukan sebagai pertanyaan terbuka, melainkan supaya jawabannya tidak
hilang dan tidak ditanyakan ulang oleh siapa pun yang membaca dokumen ini nanti.

1. **KEUANGAN boleh menutup, bukan cuma membuka.** Keputusan pemilik: kabid keuangan
   diberi akses **edit** untuk menu Tutup Kas — jadi dua-duanya. Yang dipisah justru
   di sisi PERBENDAHARAAN: boleh menutup, **tidak** boleh membuka. Itu inti
   pemisahannya, dan tabel §4 sudah menyatakannya utuh.
2. **Sub-bidang keuangan yang lain** (`AKUNTANSI`, `PENGEMBANGAN PENDAPATAN`) tidak
   perlu keputusan tersendiri: aturan bawaan §5.3 sudah menanganinya. Tanpa grant
   mereka tidak bisa masuk sama sekali; dengan grant mereka dapat `LIHAT` semua menu.
   Keduanya hasil yang aman, jadi tidak ada yang menggantung.
3. **Akun PERBENDAHARAAN lebih dari satu** semuanya boleh menutup kas. Ini konsekuensi
   langsung AUTHZ-02/V5 yang sudah berlaku di seluruh modul: izin melekat pada peran,
   bukan pada baris atau pada orang tertentu. Kalau suatu saat perlu dibatasi ke satu
   bendahara utama, pemisahnya bukan peran lagi melainkan penunjukan per-akun — dan
   itu rancangan yang berbeda, bukan bagian dokumen ini.

---

## 8. Rencana eksekusi bertahap

Tiga fase, masing-masing bisa berdiri sendiri dan diuji sebelum lanjut.

| Fase | Isi | Risiko |
|---|---|---|
| **A** | `lib/blud/peran.ts` + uji regresi tabelnya (murni, tanpa DB). Belum dipasang di mana pun. | nol — tidak ada perilaku yang berubah |
| **B** | Pasang di 18 route sebagai pagar tulis. Ribbon & tombol belum disentuh. | sedang — di sinilah pemegang grant lama kehilangan wewenang tulis; periksa §5.3 dulu |
| **C** | Ribbon menyaring tile, layar `LIHAT` menyembunyikan tombol + spanduk. | rendah — kosmetik, pagarnya sudah berdiri di fase B |

Urutannya sengaja **pagar dulu, tampilan belakangan**. Kalau dibalik, ada jendela
waktu ketika tombolnya hilang tapi endpoint-nya masih terbuka — dan itu justru
keadaan yang paling menyesatkan: kelihatan aman, padahal belum.

Uji regresi fase A menembak tabelnya langsung (`izinMenu` untuk 5 peran × 12 menu =
60 pemeriksaan), ditambah kasus peran tak terdaftar. Pola berkasnya mengikuti
`scripts/test-blud-izin-periode.mjs` yang sudah ada.
