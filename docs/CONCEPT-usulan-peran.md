# Akses per-panel modul Usulan Kebutuhan — TIDAK DIKERJAKAN

> ## ⛔ Keputusan 2026-08-04: dibatalkan, sengaja
>
> Usulan **tetap memakai `getPanels(role)` di kode**. Tidak ada pengaturan per panel di
> Admin Panel.
>
> **Alasannya:** pembagian panel yang berjalan sekarang sudah pas — tidak ada kasus
> "si A perlu beda sendiri" yang menunggu diselesaikan. Yang dipindahkan ke Admin Panel
> hanyalah kemampuan mengubah sesuatu yang tidak perlu diubah.
>
> **Yang menguatkan, dari isi dokumen ini sendiri (§4):** di Usulan sebagian besar panel
> berbagi satu endpoint `/api/usulan?scope=…`, dan hak baca sudah diturunkan dari peran
> di sisi server (L60). Jadi menyembunyikan panel di sini **keputusan tampilan, bukan
> pagar keamanan** — nilainya lebih kecil daripada di BLUD/PK, di mana tiap menu punya
> endpoint sendiri sehingga menutup menu berarti menutup pintunya sungguhan.
>
> **Kenapa berkas ini tidak dihapus:** §2 (tabel `getPanels` dalam bentuk terbaca), §4
> (batas jaminan + daftar 5 panel yang PUNYA endpoint sendiri), dan §6 (jebakan nama key
> `usulan_aset`) tetap berguna sebagai peta modul ini. Kalau suatu saat benar-benar ada
> kebutuhan "satu orang perlu beda sendiri", rancangannya sudah siap pakai dari §3
> ke bawah.

Status: **dibatalkan, tidak dieksekusi** · 2026-08-04
Pendahulunya: `docs/CONCEPT-menu-access-control.md` (rancangan induk) · `docs/CONCEPT-pk-peran.md` (modul kedua) · `docs/CONCEPT-kinerja-peran.md` (**ditolak** — bacaan pembanding: kapan modul TIDAK butuh ini)

---

## 1. Yang diminta, apa adanya

> "Persis seperti pengaturan peran yang sudah tertanam di kode — peran ini tidak bisa
> lihat menu A, bisa lihat menu B — hanya saja pengaturannya dibuat di Admin Panel
> alih-alih harus mengubah *source code*."

Jadi sasarannya bukan aturan baru. Sasarannya **memindahkan aturan yang sudah ada dari
kode ke layar**. Itu penting, karena menentukan bentuk yang benar (§3) dan menentukan
apa yang **tidak** boleh dijanjikan (§4).

---

## 2. Aturan yang mau dipindahkan sudah ada, dan cuma satu fungsi

`app/(dashboard)/usulan-kebutuhan/_utils.tsx:43` — `getPanels(role)`:

| peran | panel yang muncul | jumlah |
|---|---|---|
| SUPER_ADMIN | semuanya | 16 |
| ADMIN | dashboard · semua · data-admin · rekap · kelola-user · batas-waktu · set-pagu · hapus-usulan | 8 |
| ADMIN_KASUBAG / ADMIN_KABAG | dashboard · antrian · data-usulan · rekap-verif | 4 |
| BIDANG_* (4 peran) | dashboard · bidang-antrian · bidang-data | 3 |
| SUB_BIDANG (18 peran) | dashboard · buat · milik · tracking | 4 |
| selain itu | dashboard | 1 |

Ini kabar bagus. Di BLUD dan PK, tabel semacam ini harus **dikarang dulu** dengan
menyisir belasan berkas dan menebak niat aslinya. Di sini sudah jadi, di satu tempat,
dan sudah diturunkan dari perilaku nyata. Bagian yang paling melelahkan sudah selesai
sebelum dimulai.

---

## 3. Dua keadaan, bukan tiga — dan itu bukan penyederhanaan

Usulannya: panel Usulan didaftarkan sebagai **tanpa saklar "boleh ubah"**. Matriks
Admin Panel hanya menawarkan satu hal: **tampilkan atau sembunyikan**.

Alasan pertama, dan ini yang menentukan: **`getPanels` sendiri tidak punya dimensi
"ubah".** Ia cuma daftar panel yang muncul. Kalau sasarannya memindahkan `getPanels`
ke layar, maka dua keadaan bukan versi kurang lengkap — dua keadaan itu **persis
seukuran** barangnya.

Alasan kedua: di Usulan, "boleh ubah" bukan sifat panel melainkan sifat **tahapan**.
KASUBAG di panel Antrian Verif bisa menyetujui atau tidak bukan karena dicentang, tapi
karena usulannya memang sedang ada di mejanya (`putusan/route.ts`, `putusan-bulk/route.ts`
memeriksa status, bukan cuma peran). Kalau kolom "boleh ubah" dipasang, banyak selnya
akan **berbohong**: kelihatan dicentang tapi tombolnya tetap tidak muncul karena
alurnya belum sampai. Itu persis cacat yang selama ini dihindari — pagar di API tapi
tidak di layar (L69).

Alasan ketiga, yang lebih mendasar: untuk sebagian besar panel, **melihat = bertindak**.
Panel "Buat Usulan" ya formulir pembuatan; "Hapus Usulan" ya layar penghapusan. Tidak
ada keadaan bermakna "boleh buka Hapus Usulan tapi tidak boleh menghapus". Menyembunyikan
panelnya sudah mencabut wewenangnya.

### 3.1 Cara memasangnya tanpa mesin baru

Registry sudah punya `bacaSaja` (`lib/registry/menu-apps.ts:29`) yang artinya "menu ini
tidak punya saklar ubah" — kotak centangnya mati, tapi opsi **sembunyikan** di panel
lanjutan tetap jalan. Keenam belas panel Usulan ditandai begitu. Nol baris mesin baru.

Ganjalannya jujur disebut: nama `bacaSaja` akan terbaca janggal untuk "Buat Usulan",
yang jelas menulis. Yang dimaksud sebenarnya *"tidak ada saklar ubah di sini"*.
Rekomendasi: **ganti namanya jadi `tanpaSaklarUbah`** sekalian — mekanis, 3 tempat
pemakaian (registry, `MenuAccessPanel.tsx`, endpoint admin), dan mencegah salah paham
yang akan berumur panjang. Kalau tidak mau menyentuh BLUD/PK sekarang, pakai apa adanya
dan tinggalkan komentar.

---

## 4. Sejauh mana ini menjamin sesuatu — batas yang harus disebut di depan

**Menyembunyikan panel di Usulan adalah keputusan tampilan, bukan pagar keamanan.**

Sebabnya ada di arsitektur endpoint-nya, dan ini beda tajam dengan BLUD/PK. Di sana
tiap menu punya endpoint sendiri, jadi menutup menu = menutup endpoint. Di Usulan,
sebagian besar panel **berbagi satu endpoint** `/api/usulan?scope=…`, dan servernya
sudah menurunkan hak baca dari **peran**, bukan dari parameter yang dikirim klien —
lihat catatan L60 di `app/api/usulan/route.ts:106`:

> *ownership di-enforce berbasis ROLE, BUKAN nilai param `scope`*

Artinya: menyembunyikan panel "Rekap & Laporan" dari seorang ADMIN membuat panelnya
hilang dari sidebar, tapi endpoint di baliknya tetap membalas sesuai perannya kalau
dipanggil langsung.

**Itu bukan kemunduran** — hari ini pun `getPanels` cuma berjalan di klien, jadi
keadaannya **sama persis kuatnya dengan sekarang**. Yang bertambah cuma: aturannya bisa
diubah tanpa developer. Yang penting adalah tidak menjualnya sebagai pengamanan, supaya
tidak ada yang memakai fitur ini untuk menyembunyikan sesuatu yang benar-benar rahasia.

Batas keamanan tetap di tempatnya: penyaringan berbasis peran di dalam tiap endpoint.

### 4.1 Panel yang BISA dijaga sungguhan di server

Lima panel punya endpoint sendiri, jadi untuk kelimanya penyembunyian bisa **diikuti
pagar server sungguhan** — dan memang harus, supaya tidak setengah jalan:

| panel | endpoint | pagar hari ini |
|---|---|---|
| `set-pagu` | `POST /api/config` | `ADMIN_ROLES` |
| `batas-waktu` | `POST /api/config` | `ADMIN_ROLES` |
| `hapus-usulan` | `DELETE /api/usulan/[id]` | `ADMIN_ROLES` |
| `kelola-user` | endpoint user modul Usulan | admin Usulan |
| `rekap` (ekspor) | `POST /api/usulan/export` | `ADMIN_ROLES` |

Untuk kelimanya, guard ditambah `bolehBukaMenu('<panel>')` **di samping** cek peran
yang sudah ada, bukan menggantikannya.

`set-pagu` dan `batas-waktu` berbagi satu endpoint (`/api/config`). Kalau dibedakan,
pembedanya harus dari **isi permintaan**, bukan dari nama panel — dan kalau itu terasa
dipaksakan, lebih jujur menjaga keduanya dengan `bolehLihatSalahSatu(['set-pagu','batas-waktu'])`
lalu menyembunyikannya di layar secara terpisah. **Rekomendasi: yang kedua.**

---

## 5. Tabel peran

Isinya **salinan persis `getPanels`** (§2). Aturan besi berlaku seperti dua modul
sebelumnya: dengan kedua tabel izin kosong, hasilnya wajib identik dengan hari ini.

Bentuknya: tiap peran punya daftar panel yang `LIHAT`; sisanya `TIDAK`. Tidak ada satu
sel pun bernilai `EDIT` di modul ini — konsekuensi §3.

**`getPanels` tidak digandakan, ia DIGANTI.** Fungsi lama memanggil tabel baru, supaya
tidak ada dua sumber kebenaran yang cepat atau lambat berselisih. Ini beda dengan PK,
di mana `PK_ALLOWED_ROLES` lama masih hidup berdampingan.

### 5.1 Beda dari PK: tidak ada perubahan perilaku sama sekali

Di PK ada satu penurunan yang disengaja (peran ber-grant tak terdaftar: `EDIT` → `LIHAT`).
Di sini **tidak ada**. `getPanels` sudah menutup semua peran yang tidak dikenal dengan
`return ['dashboard']`, jadi bawaan untuk peran tak terdaftar sudah ketat sejak awal —
tinggal disalin.

### 5.2 Dua pengaman yang wajib ikut

- **`dashboard` selalu terbuka.** Semua cabang `getPanels` memberikannya, termasuk
  cabang terakhir. Kalau bisa disembunyikan, orang yang berhak masuk modul akan
  mendarat di halaman kosong dan mengira akunnya rusak.
- **SUPER_ADMIN tidak bisa diatur**, sama seperti BLUD dan PK — supaya tidak ada yang
  mengunci dirinya sendiri di luar.

---

## 6. Jebakan nama key

Key modul di registry **wajib `usulan_aset`**, bukan `usulan` atau `usulan_kebutuhan`.

Itu `APP_CARDS.id` kartu Usulan di `menu-client.tsx:111` (href-nya `/usulan-kebutuhan`,
jadi mudah tertukar). `app/api/admin/users/route.ts:224` mencocokkan `MENU_APP_KEYS`
dengan daftar grant `app_access` untuk membuang baris izin yatim saat grant dicabut;
kalau namanya beda, perbandingan itu tidak pernah cocok dan izin per-panel hidup terus
untuk orang yang aksesnya sudah dicabut.

Key panelnya: `usulan_aset.dashboard`, `usulan_aset.bidang_antrian`, dst. Nama modul
yang tampil di Admin Panel tetap boleh "Usulan Kebutuhan".

---

## 7. Berkas

**Baru**

| berkas | isi |
|---|---|
| `lib/usulan/peran.ts` | tabel peran × panel, salinan `getPanels`. **Modul daun** — tanpa impor |
| `lib/usulan/izin-server.ts` | resolusi dua lapis + `petaIzinUsulan` (16 panel sekali baca) |
| `app/api/usulan/_guard.ts` | `bolehBukaMenu` / `bolehLihatSalahSatu` — **tanpa `bolehEditMenu`**, karena tidak ada sel `EDIT` di modul ini |

**Disentuh**

- `lib/registry/menu-apps.ts` — satu entri, key `usulan_aset`, semua panel `tanpaSaklarUbah`
- `_utils.tsx` — `getPanels` jadi pembungkus tabel baru
- `usulan-client.tsx` — terima peta izin dari server, bukan menghitung dari peran
- `page.tsx` — resolusi peta izin
- 5 route di §4.1 — tambah guard
- `scripts/test-menu-access.mjs` + `bench-menu-access.mjs`
- `CLAUDE.md`

Perkiraan: **lebih ringan dari PK.** Tidak ada tabel peran yang perlu dikarang, tidak
ada `LANTAI_EDIT`, tidak ada perubahan perilaku, dan jumlah route yang disentuh 5
(bukan 13). Yang lebih berat cuma satu: `usulan-client.tsx` adalah berkas terbesar di
proyek ini.

---

## 8. Yang sengaja TIDAK dikerjakan

- **Izin per-tombol** (boleh Setujui tapi tidak boleh Tolak). Itu urusan alur kerja,
  dan alur kerja tetap satu-satunya yang memutuskan. §3.
- **Mengubah alur kerja** (siapa menyetujui di tahap mana). Di luar cakupan sepenuhnya.
- **Menggabungkan "Kelola User" dan "User Management"** — CLAUDE.md melarang, dan
  larangan itu tetap berlaku. Yang dikerjakan cuma menyembunyikan panelnya.
- **Menjadikan penyembunyian panel sebagai pagar keamanan** untuk panel berbagi
  endpoint. §4 — dan itu perlu ditulis di layar Admin Panel juga, bukan cuma di sini.

---

## 9. Risiko

| risiko | penanganan |
|---|---|
| Admin mengira menyembunyikan panel = mengamankan data | Kalimat penjelas di panel Admin (§4). Ini risiko terbesar di modul ini |
| Orang tersesat di modul tanpa panel apa pun | `dashboard` tidak bisa disembunyikan (§5.2) |
| `getPanels` dan tabel baru berselisih | `getPanels` diganti isinya, bukan digandakan (§5) |
| Key modul salah → baris yatim | §6 |
| Uji tidak ikut memakai modul baru | Daftar kompilasi kedua harness ditambah — pernah terlewat waktu PK |

---

## 10. Langkah eksekusi

1. Putuskan `bacaSaja` → `tanpaSaklarUbah` (ganti nama sekalian) atau pakai apa adanya
2. `lib/usulan/peran.ts` — salin `getPanels` + entri registry (key `usulan_aset`)
3. `lib/usulan/izin-server.ts` + `app/api/usulan/_guard.ts`
4. `getPanels` diarahkan ke tabel baru; `page.tsx` + `usulan-client.tsx` pakai peta izin
5. Guard di 5 route §4.1
6. Kalimat penjelas §4 di Admin Panel
7. Uji: matriks 6 kelompok peran × 16 panel + pengaman §5.2; kedua harness diperbarui
8. Verifikasi peramban: SUPER_ADMIN, satu ADMIN dengan satu panel disembunyikan, satu
   sub-bidang
9. `CLAUDE.md` + catatan eksekusi di berkas ini
