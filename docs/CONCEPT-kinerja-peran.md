# Akses per-menu modul Kinerja (E-Anggaran) — TIDAK DIKERJAKAN

> ## ⛔ Keputusan 2026-08-04: konsep ini DITOLAK, sengaja
>
> Kinerja **tetap memakai buka/tutup akses setingkat aplikasi** (`app_access`
> `new_econtrolling`) seperti sekarang. Tidak ada pengaturan per menu.
>
> **Alasannya, dari isi dokumen ini sendiri:** tabel peran di §5 keluar datar — ketujuh
> peran dapat `EDIT` di semua menu. Itu bukan rancangan yang belum matang, itu memang
> kenyataannya (§4): Kinerja tidak membedakan satu peran pun, dan keputusan audit Tahap
> 12 sengaja menyamakan allow-list GET dan PUT. Membangun sembilan laci berkunci lalu
> memberi kunci semuanya ke semua orang cuma menambah mesin, bukan aturan.
>
> **Yang menguatkan:** pemegang grant `new_econtrolling` di basis data **0 orang**
> (§5.1), dan dua aksi tajamnya sudah berpagar hari ini — reset data hanya SUPER_ADMIN,
> hapus master hanya SUPER_ADMIN/ADMIN.
>
> **Yang direlakan, dan disebut terus terang:** karena Kinerja tidak memisahkan "lihat"
> dari "ubah", memberi seseorang akses Kinerja berarti memberi wewenang mengubah angka
> anggaran. Selama grant `app_access` diberikan konservatif — sudah jadi kewajiban di
> CLAUDE.md untuk modul kolaboratif (AUTHZ-02) — risikonya tinggal di atas kertas.
>
> **Kenapa berkas ini tidak dihapus:** peta route → menu di §7 dan alasan penolakan di
> atas tetap berguna. Kalau suatu saat Kinerja mulai membedakan peran — misalnya ada
> peninjau yang boleh lihat tapi tidak boleh ubah — dokumen ini titik mulainya, dan
> §5.1 sudah menandai satu-satunya perubahan perilaku yang perlu diambil. Sebaliknya,
> kalau ada yang mengusulkan hal yang sama enam bulan lagi, jawabannya ada di sini.

Status: **ditolak, tidak dieksekusi** · 2026-08-04
Pendahulunya: `docs/CONCEPT-menu-access-control.md` (rancangan induk) · `docs/CONCEPT-pk-peran.md` (modul kedua)

---

## 1. Yang mau dicapai

Hari ini Kinerja punya **satu saklar**: `isKinerjaRole`. Lolos → boleh membuka
sembilan menu sekaligus **dan** boleh mengubah semuanya. Tidak ada jalan memberi
seseorang "boleh lihat Laporan saja" tanpa mengubah kode.

Sesudahnya: tiap pasangan (peran × menu) punya izin `EDIT` / `LIHAT` / `TIDAK`, bisa
diatur dari Admin Panel per peran maupun per orang, memakai mesin yang sudah ada.

**Aturan besi yang tidak boleh dilanggar:** dengan kedua tabel izin kosong — keadaan
di hari pertama, dan mungkin selamanya — perilakunya wajib **persis sama** dengan hari
ini. Satu-satunya penyimpangan yang disengaja ada di §5, dan disebut terang-terangan.

---

## 2. Kenapa Kinerja tidak sama dengan BLUD & PK

Dua modul sebelumnya punya **satu halaman per menu**, jadi penjaganya bisa dipasang di
`page.tsx` masing-masing (`_izin.ts` PK). Kinerja **satu halaman dengan tab**:
`kinerja-client.tsx` menyimpan `activeTab` di state, dan seluruh isi modul dirender
dari berkas yang sama.

Akibatnya, tiga hal berubah bentuk:

1. **Tidak ada `_izin.ts` per layar.** `page.tsx` menyelesaikan peta izin **sembilan
   menu sekali jalan** (`petaIzinKinerja`), lalu mengopernya sebagai prop ke klien.
   Satu pembacaan DB, sama seperti `petaIzinPk`.
2. **Penjagaan tab terjadi di klien**, bukan lewat `redirect`. Sidebar menyaring item
   yang izinnya `TIDAK`, dan `nav()` menolak pindah ke tab tertutup.
3. **`?tab=` harus ikut disaring.** `kinerja-client.tsx:58` menerima nama tab dari URL
   dan menyetelnya tanpa memeriksa apa pun. Hari ini itu tidak berbahaya karena tiap
   tab tertutup punya penjaga sendiri di dalamnya (`PengaturanTab.tsx:132` menolak
   non-SUPER_ADMIN), tapi begitu ada sembilan menu yang bisa ditutup, satu penjaga
   di dalam tiap tab bukan lagi cara yang bisa dipercaya. Penyaringan dipusatkan.

Yang **tidak** berubah: pagar sungguhannya tetap di route. Klien cuma menyembunyikan.

---

## 3. Sembilan menu

Diambil dari `KTab` (`_types.ts:11`) dan urutan sidebar (`_components/Sidebar.tsx`).

| key | label | ada jalur tulis? |
|---|---|---|
| `dashboard` | Beranda | tidak — **baca-saja** |
| `laporan` | Laporan Konsolidasi | tidak — **baca-saja** |
| `master` | Master Rekening | ya (POST/PUT/DELETE + init-renaksi) |
| `rekening` | Rekening | ya (PUT) |
| `ssk` | RKO | ya (PUT + nullify + perubahan) |
| `realisasi` | Realisasi | ya (PUT + nomen + import) |
| `cetak` | Cetak Realisasi | tidak — **baca-saja** |
| `pend-crr` | Pendapatan & CRR | ya (PUT + import) |
| `pengaturan` | Pengaturan | ya (reset — destruktif) |

`cetak` masuk baca-saja bukan karena namanya, melainkan karena diperiksa: `CetakTab.tsx`
tidak memanggil satu pun endpoint sendiri — ia memakai data yang sudah ditarik induknya.
Aturan penentu tetap sama dengan PK: **sebuah menu boleh bertingkat `EDIT` hanya kalau
ada route yang benar-benar mengubah angka resmi.** Bukan metode HTTP, bukan namanya.

`SUMBER_LIST` (GAJI/BLUD/HARLEP/…) **tidak** dijadikan menu — lihat §9.

---

## 4. Keadaan hari ini, apa adanya

Sumber: `lib/data/kinerja-schemas.ts:49-63` + pembacaan 16 berkas route.

```
KINERJA_ALLOWED_ROLES = SUPER_ADMIN · ADMIN · ADMIN_KASUBAG · ADMIN_KABAG
                        RENBANG · PROGRAM · KEUANGAN
KINERJA_APP_KEY       = 'new_econtrolling'
```

Ada catatan keputusan audit Tahap 12 di berkas itu: **GET dan PUT sengaja memakai
allow-list yang sama.** Artinya ketujuh peran di atas hari ini boleh mengubah semua
menu yang bisa mereka buka.

Ini beda penting dengan PK. Di PK sudah ada pembelahan alami — `ADMIN_KABAG` ada di
`PK_ALLOWED_ROLES` tapi tidak di `PK_EDIT_ROLES`, jadi ia peninjau baca-saja, dan
tabel peran PK tinggal merekam kenyataan itu. **Kinerja tidak punya pembelahan
apa pun.** Konsekuensinya lugas: tabel peran Kinerja mulai dengan `EDIT` untuk
ketujuhnya. Menurunkan salah satunya ke `LIHAT` adalah perubahan kebijakan, dan itu
keputusan Anda, bukan keputusan saya — begitu tabelnya ada, menurunkannya cukup satu
baris, tanpa developer.

Dua pagar keras yang sudah berlaku hari ini:

| pagar | letak | cakupan |
|---|---|---|
| hapus master hanya SUPER_ADMIN/ADMIN | `master/[id]/route.ts:9,44` | **satu aksi**, bukan satu menu |
| reset data hanya SUPER_ADMIN | `reset/route.ts:33,128` | satu menu penuh |
| tab Pengaturan hanya SUPER_ADMIN | `Sidebar.tsx:234` + `PengaturanTab.tsx:132` | tampilan |

---

## 5. Tabel peran usulan

```
SUPER_ADMIN     EDIT semua
ADMIN           EDIT semua
ADMIN_KASUBAG   EDIT semua
ADMIN_KABAG     EDIT semua
RENBANG         EDIT semua
PROGRAM         EDIT semua
KEUANGAN        EDIT semua
```

Plus `pengaturan` tertutup bawaan untuk semua yang bukan SUPER_ADMIN
(`MENU_TERTUTUP_BAWAAN`), dan `dashboard` selalu terbuka + baca-saja.

Kelihatan datar, dan memang harus datar — itu konsekuensi aturan besi. Nilainya bukan
pada isi tabel hari ini, melainkan pada adanya tempat untuk mengubahnya.

### 5.1 Satu perubahan perilaku yang disengaja

`BAWAAN_TAK_TERDAFTAR = 'LIHAT'` — sama seperti PK §5.2.

Hari ini `isKinerjaRole` (`kinerja-schemas.ts:60`) mengembalikan `true` untuk **peran
apa pun** yang punya grant `new_econtrolling`, dan karena GET dan PUT memakai
allow-list yang sama, grant itu berarti **wewenang penuh mengubah anggaran**. Peran
sub-bidang yang diberi grant "supaya bisa lihat" hari ini sebenarnya bisa menulis.

Sesudahnya mereka mulai dari `LIHAT`. Wewenang mengubah dikembalikan dengan mencentang
menunya di Admin Panel — bedanya, itu jadi keputusan yang diambil seseorang, bukan
akibat samping dari sebuah grant.

**Ini menurunkan wewenang sebagian orang** — jadi datanya dicek dulu, bukan
diperkirakan. Hasil pemeriksaan `prima_db_3` (2026-08-04):

```
Pemegang grant new_econtrolling : 0   (dari 5 user)
  - peran di luar allow-list     : 0
```

**Tidak ada seorang pun yang kehilangan apa pun.** Perubahan §5.1 ini murni menutup
pintu yang belum pernah dilewati, bukan mencabut wewenang yang sedang dipakai. Karena
PRIMA belum terpasang di server kantor, basis data lokal inilah satu-satunya data yang
ada — tidak ada populasi lain yang perlu dikhawatirkan.

---

## 6. `LANTAI_EDIT` — dan kenapa `master` TIDAK masuk

`LANTAI_EDIT` = pagar peran yang **tidak bisa ditembus matriks Admin Panel**, di-AND
dengan izin, bukan menggantikannya.

```
pengaturan → ['SUPER_ADMIN']
```

Hanya satu. Alasannya: `reset` menghapus data SSK dan Realisasi satu tahun sekaligus.

**`master` sengaja tidak dimasukkan**, walau ia juga punya pagar peran. Pagarnya cuma
menyentuh **DELETE**, sementara PUT/POST tetap terbuka untuk ketujuh peran. Kalau
`master` dijadikan lantai menu, KEUANGAN dan RENBANG ikut kehilangan wewenang
menambah/mengubah master — itu perubahan perilaku yang tidak diminta siapa pun.

Jadi cek `DELETE_ONLY_ROLES` **tetap tinggal di route-nya**, apa adanya. `LANTAI_EDIT`
adalah alat setingkat menu; memaksanya mengurus satu aksi akan merusak menu itu.
Turunannya: matriks Admin Panel akan menampilkan "boleh ubah" untuk Master Rekening
bagi KEUANGAN, dan itu **benar** — ia memang boleh mengubah, hanya tidak boleh
menghapus. Perbedaan itu tidak muncul di matriks, dan §9 menjelaskan kenapa dibiarkan.

---

## 7. Peta route → menu

16 berkas route, 24 handler. Prinsip yang diwarisi dari BLUD dan PK:
**pagar sebuah endpoint baca menyebut menu yang MENAMPILKAN datanya, bukan menu yang
"memiliki" datanya.** Kalau tidak, menutup satu menu diam-diam mematikan menu lain.

| route | verb | pagar |
|---|---|---|
| `dashboard` | GET | `bolehBukaMenu('dashboard')` |
| `laporan` | GET | `bolehBukaMenu('laporan')` |
| `master` | GET | `bolehLihatSalahSatu(['master','rekening'])` ¹ |
| `master` | POST | `bolehEditMenu('master')` |
| `master/[id]` | PUT | `bolehEditMenu('master')` |
| `master/[id]` | DELETE | `bolehEditMenu('master')` **+ cek `DELETE_ONLY_ROLES` yang sudah ada** |
| `master/init-renaksi` | POST | `bolehEditMenu('master')` |
| `rekening` | GET | `bolehLihatSalahSatu(['rekening','ssk'])` ² |
| `rekening` | PUT | `bolehEditMenu('rekening')` |
| `ssk` | GET | `bolehLihatSalahSatu(['ssk','realisasi','cetak'])` ³ |
| `ssk` | PUT | `bolehEditMenu('ssk')` |
| `ssk/versi-list` | GET | `bolehLihatSalahSatu(['ssk','realisasi'])` |
| `ssk/check-deletable` | GET | `bolehLihatSalahSatu(['ssk'])` |
| `ssk/nullify` | PATCH | `bolehEditMenu('ssk')` |
| `ssk/perubahan` | POST | `bolehEditMenu('ssk')` |
| `realisasi` | GET | `bolehLihatSalahSatu(['realisasi','cetak'])` |
| `realisasi` | PUT | `bolehEditMenu('realisasi')` |
| `realisasi/nomen` | GET / PUT | lihat `realisasi` / `bolehEditMenu('realisasi')` |
| `realisasi/import` | POST | `bolehEditMenu('realisasi')` |
| `pendapatan` | GET / PUT | `bolehBukaMenu('pend-crr')` / `bolehEditMenu('pend-crr')` |
| `pendapatan/import` | POST | `bolehEditMenu('pend-crr')` |
| `pendapatan/belanja-auto` | GET | `bolehBukaMenu('pend-crr')` |
| `reset` | GET / POST | **cek SUPER_ADMIN yang sudah ada dipertahankan**, ditambah `bolehEditMenu('pengaturan')` |

¹ `kinerja-client.tsx:218-222` menarik master untuk mengisi pilihan di tab Rekening.
² `kinerja-client.tsx:206` menarik rekening saat tab RKO dibuka.
³ `kinerja-client.tsx:265` — tab Realisasi menarik SSK sebagai pembanding.

Ketiganya adalah alasan kenapa peta ini ditulis dulu sebelum kode disentuh: tanpa
membaca `useEffect` di klien, wajar sekali memasang `bolehBukaMenu('ssk')` di
`ssk` GET — dan tab Realisasi langsung mati untuk siapa pun yang RKO-nya ditutup.

---

## 8. Berkas

**Baru**

| berkas | isi |
|---|---|
| `lib/kinerja/peran.ts` | tabel peran × menu. **Modul daun** — tanpa impor, supaya sidebar tidak menyeret kode server ke bundel klien |
| `lib/kinerja/izin-server.ts` | resolusi dua lapis: `menu_user_access` > `menu_role_access` > `TABEL`; `petaIzinKinerja` membaca 9 menu sekali jalan |
| `app/api/kinerja/_guard.ts` | `bolehBukaMenu` / `bolehEditMenu` / `bolehLihatSalahSatu` / `bolehModulKinerja` / `tolakEdit` — cermin `_guard.ts` PK, bentuk balasan `{ ok, message }` mengikuti klien Kinerja |

**Disentuh**

- `lib/registry/menu-apps.ts` — satu entri + `keyMenuKinerja`
- 16 berkas route — ganti `hasAppAccess(..., isKinerjaRole)`
- `app/(dashboard)/kinerja/page.tsx` — resolusi peta izin, oper ke klien
- `kinerja-client.tsx` — terima `izin`, saring `?tab=`, jaga `nav()`
- `_components/Sidebar.tsx` — saring item, sembunyikan yang `TIDAK`
- 9 berkas tab — sembunyikan tombol tulis saat `LIHAT` + `<SpandukLihat>`
- `scripts/test-menu-access.mjs` — matriks Kinerja + uji lantai
- `scripts/bench-menu-access.mjs` — tambah `lib/kinerja/peran.ts` ke daftar kompilasi
- `CLAUDE.md`

### 8.1 Satu jebakan yang harus tepat: nama key

Key modul di registry **wajib** `new_econtrolling`, bukan `kinerja`.

`app/api/admin/users/route.ts:224` membandingkan `MENU_APP_KEYS` dengan daftar grant
`app_access` untuk menghapus baris izin yatim saat grant dicabut. Kalau key registry
`kinerja` sementara grant-nya `new_econtrolling`, perbandingan itu **tidak pernah
cocok** — izin per-menu akan hidup terus untuk orang yang aksesnya sudah dicabut, dan
menyala kembali diam-diam kalau grant-nya diberikan lagi nanti.

Jadi key menunya: `new_econtrolling.dashboard`, `new_econtrolling.pend_crr`, dst.
Nama modul yang tampil di Admin Panel tetap boleh "E-Anggaran".

---

## 9. Yang sengaja TIDAK dikerjakan

- **Izin per-sumber** (RKO GAJI boleh, RKO BLUD tidak). Ini sumbu ketiga —
  peran × menu × sumber — dan akan melipattigakan matriks jadi 8 × 9 kolom. Kalau
  memang dibutuhkan nanti, bentuknya bukan perluasan matriks ini melainkan pagar
  terpisah setingkat data.
- **Izin per-tombol** (boleh Simpan tapi tidak boleh Hapus). Sudah dijawab di sesi
  sebelumnya: satuan yang dipakai sistem ini adalah menu. `DELETE_ONLY_ROLES` di
  Master Rekening adalah contoh kebutuhan itu, dan cara menanganinya tetap seperti
  sekarang — cek peran langsung di route-nya.
- **Menggabungkan tiga `peran.ts`** (BLUD, PK, Kinerja). Ditinjau ulang tiap modul
  baru. Kinerja menambah satu bentuk yang belum ada — lantai satu-aksi (§6) — tapi
  bentuk itu justru **tidak** masuk ke `peran.ts`, jadi tetap tidak ada yang cukup
  berulang untuk diangkat jadi helper bersama.

---

## 10. Risiko

| risiko | penanganan |
|---|---|
| ~~Peran ber-grant kehilangan wewenang tulis (§5.1)~~ | **Gugur** — sudah dicek: 0 pemegang grant `new_econtrolling` di DB |
| Endpoint lintas-tab dipagari terlalu sempit | Peta §7 diturunkan dari `useEffect` di klien, bukan dari nama endpoint |
| `?tab=` menembus tab tertutup | Disaring terpusat di klien (§2 nomor 3) |
| Key modul salah → baris yatim | §8.1 |
| Uji tidak ikut memakai modul baru | Daftar kompilasi kedua harness ditambah — ini pernah terlewat waktu PK |

---

## 11. Langkah eksekusi

1. ~~Cek data pemegang grant~~ — **sudah, hasilnya 0** (§5.1)
2. `lib/kinerja/peran.ts` + entri registry (key `new_econtrolling`)
3. `lib/kinerja/izin-server.ts` + `app/api/kinerja/_guard.ts`
4. Pasang pagar di 16 route sesuai peta §7
5. `page.tsx` → peta izin; `kinerja-client.tsx` + `Sidebar.tsx` → saring tab & `?tab=`
6. 9 tab: sembunyikan tombol tulis + spanduk
7. Uji: matriks 7 peran × 9 menu + lantai + ribbon; kedua harness diperbarui
8. Verifikasi peramban: sebagai SUPER_ADMIN dan sebagai satu peran ber-perkecualian
9. `CLAUDE.md` + catatan eksekusi di berkas ini

Perkiraan: sebanding dengan PK, sedikit lebih ringan karena tidak ada 7 `page.tsx`
terpisah — tapi lebih berisiko di klien, karena seluruh modul hidup di satu berkas.
