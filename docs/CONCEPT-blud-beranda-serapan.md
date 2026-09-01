# CONCEPT — Beranda BLUD dapat sisi Realisasi

> Status: **selesai** (2026-09-01). Nol kolom, nol tabel, nol migrasi.
> Lahir dari pertanyaan langsung: *"agar terlihat live serapan realisasi kurang
> melebihi pagu anggaran gimana?"* — dan dari temuan bahwa Beranda BLUD hari ini
> **tidak bisa menjawabnya sama sekali**.
>
> **Revisi 2026-09-01** sesudah konsep ini diadu dengan kodenya baris per baris.
> Empat keputusan yang semula tidak tertulis ternyata masing-masing bisa
> melahirkan dua layar yang berbantah tentang angka yang sama — persis penyakit
> yang §2 ditulis untuk mencegahnya. Semuanya kini disebut terang-terangan:
> §5.0 (sisa yang mana), §8.2 (sakelar maintenance), §9.1 (akar vs daun), dan §10
> yang berubah dari "tambah dua kolom" jadi pembenahan tersendiri.

---

## 1. Yang diminta, dan lubang yang ditemukan

Beranda BLUD ([dashboard-client.tsx](../app/(dashboard)/blud/dashboard-client.tsx))
punya 4 kartu dan 2 panel riwayat. Semuanya sisi **anggaran**:

| Kartu | Isi |
|---|---|
| DPA BLUD — Versi Terbaru | 29 Agu 2026 · 550 baris |
| Total Anggaran DPA | Rp 68.383.000.000 |
| Pergeseran DPA — Versi | 31 Agu 2026 · 575 baris |
| Δ Pergeseran Net | Rp 0 |

Tidak ada satu pun angka realisasi. Orang yang membuka Beranda bisa tahu **pagunya
berapa**, tapi tidak bisa tahu **sudah terpakai berapa** — pertanyaan pertama yang
ditanyakan orang, dan satu-satunya yang penting menjelang tutup bulan.

Lubang yang sama ada di modul `/dashboard`: `BludSummary`
([dashboard.ts:32](../lib/data/dashboard.ts:32)) hanya memulangkan `versi_tanggal`,
`total_pagu`, `total_baris`, `leaf_baris`. Padahal `EanggaranSummary` tepat di
atasnya sudah punya `pct_serapan`. Jadi modul yang paling dipakai sehari-hari
justru yang paling bisu soal serapan.

## 2. Pagu acuannya wajib satu sumber — ini yang paling gampang salah

Hari ini ada **tiga** jawaban berbeda untuk "berapa pagu BLUD", dan ketiganya
hidup di repo yang sama:

| Tempat | Cara menghitung | Lingkup tahun |
|---|---|---|
| Kartu "Total Anggaran DPA" ([page.tsx:11](../app/(dashboard)/blud/page.tsx:11)) | `SUM(jumlah)` baris `GRANDMASTER` di **dpa_blud** | tahun terpilih |
| Layar Realisasi ([pagu.ts](../lib/blud/pagu.ts)) | kolom `pergeseran` versi Pergeseran terbaru; jatuh ke DPA kalau belum ada | tahun terpilih |
| `/dashboard` ([dashboard.ts:120](../lib/data/dashboard.ts:120)) | baris ber-uraian **literal** `'BELANJA DAERAH'` | **tahun apa pun** — lihat §10 |

Realisasi **tidak** diukur terhadap DPA. Layar Realisasi menuliskannya
terang-terangan di toolbar: *"Pagu dari Pergeseran 31 Agu 2026"*.

Sekarang yang pertama dan kedua kebetulan sama, karena Δ Pergeseran Net = Rp 0.
Begitu ada pergeseran yang benar-benar menggeser, Beranda akan melaporkan
**% serapan yang berbeda** dari layar Realisasi untuk hal yang sama persis — dan
tidak ada yang bisa memutuskan mana yang benar.

Karena itu:

- Kartu serapan mengambil pagu lewat **jalur yang sama** dengan layar Realisasi
  (`getPaguSumber` / `getPaguEfektif`), bukan menjumlah ulang dari DPA.
- Kartu itu **menyebutkan versi acuannya** di bawah angka, persis seperti toolbar
  Realisasi. Angka pagu tanpa keterangan versi adalah angka yang tidak bisa
  diperiksa.
- Kartu "Total Anggaran DPA" yang lama **tetap apa adanya** — ia memang bicara
  soal DPA, dan itu pertanyaan yang berbeda. Yang dilarang bukan menampilkan
  dua angka, tapi menampilkan dua angka yang **mengaku menjawab hal yang sama**.
- Definisi ketiga (`'BELANJA DAERAH'`) tidak dibiarkan hidup berdampingan dengan
  angka serapan di layar yang sama — §10.

## 3. Ambang "mepet" tetap 10% — satu ambang, tiga layar

Modal Pratinjau Serapan sudah memakai ambang **10%**, tapi sebagai angka telanjang
di tengah penyaring ([PratinjauSerapanModal.tsx:77](../components/blud/PratinjauSerapanModal.tsx:77)
— `r.sisaSetelah / r.pagu < 0.1`); yang ada di `:46` cuma labelnya. Ambang itu
dipakai ulang apa adanya di dua tempat baru: warna baris tabel Realisasi (§5) dan
kartu "Perlu Perhatian" di Beranda (§4).

Kalau tabel memakai 20% sementara modal memakai 10%, dua layar akan saling
membantah tentang rekening yang sama — dan orang berhenti mempercayai keduanya.
Ambangnya diangkat jadi konstanta bernama di `pratinjau-serapan.ts`, bukan
disalin tiga kali.

`EPS_PRATINJAU = 0.005` ([pratinjau-serapan.ts:15](../lib/blud/pratinjau-serapan.ts:15))
juga dipakai ulang untuk batas "sudah menembus". `lebihPagu`
([realisasi-client.tsx:231](../app/(dashboard)/blud/realisasi/realisasi-client.tsx:231))
hari ini masih menulis `-0.005` sendiri — ikut disatukan sekalian, karena dua
salinan angka yang sama adalah cara L78 lahir.

## 4. Yang ditambah di Beranda

### Baris kartu kedua (baru), sejajar 4 kartu lama

| Kartu | Nilai | Keterangan di bawahnya |
|---|---|---|
| Terserap | total realisasi setahun (§9.1) | tanggal transaksi terakhir |
| % Serapan | persentase | versi pagu acuan (§2) |
| Sisa Anggaran | pagu − terserap | — |
| Perlu Perhatian | "3 menembus · 12 mepet" | tautan ke Realisasi tersaring (§6) |

Kartu **Perlu Perhatian** yang membuat Beranda jadi tempat bertindak, bukan
sekadar tempat melihat: angkanya diklik, layar Realisasi terbuka sudah tersaring
ke baris-baris itu. Tanpa tautan, orang tetap harus menggulir 391 rekening
sendiri dan kartunya cuma jadi hiasan. Tautannya bukan pekerjaan sepele — §6.

### Dua panel baru, berdampingan dengan riwayat yang sudah ada

- **Status Tutup Kas** — strip 12 bulan (Jan…Des) bertanda BUKA/TUTUP, dibaca
  dari `blud_periode.status`, plus saldo kas & bank **hari ini**. Menjawab dua
  pertanyaan yang ditanyakan tiap minggu: *"sudah tutup sampai bulan apa?"* dan
  *"uang kita berapa?"*

  Dua catatan yang menentukan cara membacanya:
  - Bulan **tanpa baris** `blud_periode` berarti BUKA. Baris itu dibuat
    `kunciPeriode()` lewat `INSERT IGNORE` semata untuk penguncian, jadi ada
    tidaknya baris bukan penanda apa pun — stripnya berangkat dari 12 bulan
    penuh lalu ditimpa yang berstatus TUTUP, bukan dari daftar baris yang ada.
  - Saldo **tidak tersimpan** untuk bulan selain Januari (§9.3).
- **Tren Serapan** — batang kecil serapan per bulan sepanjang tahun.
  Memperlihatkan polanya: merata, atau menumpuk di akhir tahun. Batangnya harus
  tahan **nilai negatif**: `blud_realisasi_alokasi.nilai` boleh minus untuk jenis
  `PENGEMBALIAN`, jadi bulan dengan pengembalian besar bisa berbatang ke bawah.

Tata letaknya jadi 2 baris kartu × 4 kolom, lalu 2 baris panel × 2 kolom.
`.blud-kpi-grid` sudah punya titik henti responsif (960px → 2 kolom, 540px → 1
kolom), jadi tidak ada aturan lebar baru.

## 5. Warna baris di tabel Realisasi

### 5.0 Sisa yang mana — diputuskan lebih dulu, sebelum warnanya

Layar Realisasi memajang **dua** angka sisa yang berbeda, dan keduanya benar untuk
pertanyaannya masing-masing:

| Angka | Rumus | Lingkup |
|---|---|---|
| kolom `sisa` di tabel | `pagu − sd_bulan` | **sampai bulan terpilih** |
| `lebihPagu` & seluruh Pratinjau Serapan | `pagu − terserap` | **setahun** |

Keduanya lahir di satu tempat: [route pagu](../app/api/blud/realisasi/pagu/route.ts:79)
sengaja membuat `sisa` dan `persen` mengikuti bulan (layar Realisasi itu
*laporan*, seluruh kolomnya harus menunjuk titik waktu yang sama), sementara
`terserap` selalu setahun.

**Warna mepet memakai yang SETAHUN.** Kalau memakai kolom `sisa`, membuka bulan
Juni membuat rekening yang jebol di Agustus tampil tanpa warna — sementara modal
Pratinjau di layar yang sama menyebutnya "akan menembus". Pagar pagu di server
menjumlah setahun tanpa saringan bulan, jadi angka per-bulan selalu melaporkan
sisa yang **lebih longgar dari kenyataan**. Alasan yang sama sudah tertulis di
[pratinjau-serapan.ts:22](../lib/blud/pratinjau-serapan.ts:22), dan itulah kenapa
`sisa` sengaja tidak ikut di tipe `BarisPratinjau`.

Penjaga `r.pagu > 0` dari modal ikut dibawa: tanpa itu rekening berpagu nol
menghitung `0/0` dan seluruhnya mengaku mepet.

### 5.1 Tingkatnya

Yang **sudah ada**: satu tingkat saja. Baris yang melebihi pagu diberi merah —
`.rl-row-minus` ([globals.css:3121](../app/globals.css:3121)), latar
`rgba(226,75,74,.14)`, sisa merah tebal, dan sudah punya pasangan tema terang di
[globals.css:3170](../app/globals.css:3170).

Yang **ditambah**: tingkat di antaranya.

| Keadaan (dasar: sisa SETAHUN, §5.0) | Tanda | Alasan |
|---|---|---|
| Sisa negatif | merah, latar penuh — **sudah ada** | keadaan salah, pantas mencolok |
| Sisa 0 s/d < 10% pagu, dan pagu > 0 | amber `#BA7517`, **strip 3px tepi kiri** + sel SISA & % berwarna | ruang belanja hampir habis |
| Sisa ≥ 10%, atau pagu = 0 | **tanpa warna** | — |

Empat keputusan di baliknya:

**a. Yang aman sengaja TIDAK diberi hijau.** Ada 391 rekening. Kalau yang aman
ikut berwarna, seluruh tabel jadi berwarna dan yang genting tenggelam. Proyek ini
sudah menuliskan pelajarannya sendiri di
[migration-blud-saldo-awal-ditetapkan.sql](migrations/migration-blud-saldo-awal-ditetapkan.sql):
*peringatan yang selalu menyala padahal tidak ada yang salah akan berhenti dibaca
orang*.

**b. Amber pakai strip tepi, bukan latar penuh.** "Hampir habis" itu kabar, bukan
kesalahan. Memberinya latar sekuat merah membuat dua keadaan yang berbeda tingkat
kegawatannya terlihat sederajat.

**c. Hanya baris daun yang diwarnai.** Pagar pagu server bekerja di baris terbawah
— `hitungPratinjau` menyaring `is_leaf`
([pratinjau-serapan.ts:48](../lib/blud/pratinjau-serapan.ts:48)) — di situlah
realisasi menempel. Kalau induk ikut ditint, satu baris mepet akan mewarnai enam
tingkat induk di atasnya dan tabelnya belang tanpa menambah informasi. Untuk
induk cukup sel `%`-nya. `is_leaf` sudah ikut di setiap baris yang dikirim route
pagu, jadi tidak perlu diterka dari `parent_key` di klien.

**d. Kelas baru wajib berpasangan `[data-theme="light"]`.** L82 sudah membayar ini:
`.tp-galat`/`.tp-ingat` sempat tidak ditimpa tema terang dan jadi merah muda di
atas merah muda. Warnanya diambil dari token yang ada (`action-warning #BA7517`),
bukan hex baru.

### 5.2 Pelengkap yang lebih berguna daripada warnanya sendiri

Banner `.rl-minus-banner` ([realisasi-client.tsx:369](../app/(dashboard)/blud/realisasi/realisasi-client.tsx:369))
sekarang hanya menyebut yang melebihi pagu. Ditambah hitungan mepet + tombol yang
**menyaring tabel** ke baris-baris itu. Dengan 391 baris, menggulir mencari warna
tetap pekerjaan manual; penyaring yang menghapusnya.

## 6. Penyaring tabel Realisasi + tautan dari Beranda

Ini butir tersendiri, bukan lampiran kartu §4 — layar Realisasi hari ini **tidak
membaca satu pun parameter URL**. Tahunnya diambil dari `?mode=tahun-list`,
bulannya dari tanggal hari ini
([realisasi/page.tsx](../app/(dashboard)/blud/realisasi/page.tsx) tidak menerima
`searchParams` sama sekali). Jadi "kartu diklik → Realisasi tersaring" berarti
tiga hal, dan ketiganya harus ada:

1. Keadaan penyaring di tabel (`semua` / `menembus` / `mepet`) — dipakai tombol
   banner §5.2 maupun tautan dari Beranda. Namanya sama dengan penyaring modal
   Pratinjau supaya orang tidak belajar dua kosakata.
2. `page.tsx` Realisasi menerima `searchParams` dan meneruskannya sebagai prop.
   **Lewat server component, bukan `useSearchParams` di klien** — pola yang sudah
   dipakai Beranda BLUD, dan menghindari keharusan `Suspense` yang dituntut Next
   untuk hook itu.
3. Tahun ikut dibawa. Tanpa itu, mengklik dari Beranda tahun 2025 mendarat di
   tabel tahun berjalan dan hitungannya tidak cocok dengan kartunya.

## 7. Serapan ikut segar tiap 30 detik

Yang **sudah ada** ([realisasi-client.tsx:149](../app/(dashboard)/blud/realisasi/realisasi-client.tsx:149)):
satu kueri ringan tiap 30 detik ke `/api/blud/realisasi/pagu?mode=cap`, memuat
ulang tabel kalau **versi pagu** berubah — misalnya rekan menyimpan Pergeseran
baru.

Yang **belum**: pemeriksaan itu hanya melihat pagu, bukan transaksi. Kalau rekan
mencatat belanja di Buku Kas sementara layar Realisasi terbuka, angka serapan
tidak ikut naik sampai ganti periode atau muat ulang halaman. Menjelang tutup
bulan, saat beberapa orang mengetik bersamaan, celah ini terasa.

Perbaikannya menumpang kueri yang sudah berjalan: respons `mode=cap` ikut
memulangkan **total terserap setahun**, dan `capSama` ikut membandingkannya.
Kalau angkanya bergeser, muat ulang. Nol permintaan jaringan tambahan, nol
endpoint baru.

**Satu jebakan yang wajib dihindari.** `muat(tahun, bulan, bandingkan)`
([realisasi-client.tsx:95](../app/(dashboard)/blud/realisasi/realisasi-client.tsx:95))
cuma punya dua watak, dan keduanya salah untuk keperluan ini:

| `bandingkan` | Yang terjadi | Kenapa salah di sini |
|---|---|---|
| `true` | membandingkan pagu lama vs baru | pagunya memang tidak berubah — pembandingan sia-sia |
| `false` | **mereset** `paguLama` dan `setPerubahan(null)` | spanduk "Pagu diperbarui" + chip ▲▼ yang belum sempat dibaca orang **hilang begitu saja** |

Jadi butuh jalur ketiga: muat ulang angkanya **tanpa menyentuh pembanding pagu**.
Kalau tidak, fitur yang menyegarkan serapan justru menghapus kabar tentang pagu.

## 8. Izin dan sakelar — dua pagar berbeda, dua-duanya wajib

### 8.1 Izin per-menu

Kartu baru ikut peta menu, dan **nama kuncinya bertanda hubung** (`'tutup-kas'`,
bukan `tutup_kas` — lihat `MENU_BLUD` di [peran.ts](../lib/blud/peran.ts)):

| Kartu / panel | Izin |
|---|---|
| Terserap · % Serapan · Sisa · Perlu Perhatian | `peta['realisasi']` |
| Status Tutup Kas + saldo | `peta['tutup-kas']` |
| Tren Serapan | `peta['realisasi']` |

Kalau tidak, orang yang tidak boleh membuka Realisasi tetap membaca angkanya di
Beranda — bocor lewat pintu belakang, dan pagar di API tidak menolongnya karena
Beranda memang berhak memanggil (L69: perbaikan belum selesai sampai semua jalur
kena).

**Kartu baru DISEMBUNYIKAN, kartu lama tetap tampil — dan itu memang beda.**
Aturan yang berlaku sekarang di grid yang sama ditulis di
[dashboard-client.tsx:25](../app/(dashboard)/blud/dashboard-client.tsx:25):
menu tertutup → kartunya tetap tampil, cuma tidak bisa diklik. Kartu baru
menyimpang dari itu dengan sengaja, karena yang dijaga berbeda jenisnya: kartu
lama memajang **pagu**, angka rencana yang memang beredar di rapat; kartu baru
memajang **uang yang sudah keluar** beserta saldo kas. Yang pertama cukup ditahan
tautannya; yang kedua angkanya sendiri yang tidak boleh terbaca. Perbedaan ini
ditulis sebagai komentar di kode — kalau tidak, orang berikutnya akan
"merapikan" salah satunya agar seragam.

### 8.2 Sakelar maintenance — yang paling gampang terlewat

`app_status_blud_realisasi` mematikan Buku Kas, Bukti Setor, Realisasi, dan Tutup
Kas lewat `MENU_REALISASI` ([peran.ts:35](../lib/blud/peran.ts:35)). **`beranda`
tidak ada di daftar itu, dan memang tidak boleh ada** — Beranda tidak pernah bisa
ditutup. Akibatnya: sakelar dimatikan, empat layar berubah jadi halaman
pemeliharaan, tapi Beranda tetap memajang serapan, sisa, dan saldo kas dari
sub-modul yang sedang dimatikan.

Ini L72 apa adanya: sakelar yang cuma mengabukan kartu bukan sakelar.

Yang berlaku: saat sakelarnya mati, **kartu & panel realisasi tidak tampil**, dan
di tempatnya satu baris keterangan "Realisasi sedang dimatikan sementara" —
bukan angka basi, bukan juga ruang kosong tanpa sebab. Kartu DPA/Pergeseran
tidak ikut mati; sakelar itu memang tidak menyentuh sisi anggaran.

**Gate CI tidak akan menangkap ini.** `npm run check:killswitch`
([test-killswitch-modul.mjs:25](../scripts/test-killswitch-modul.mjs:25)) hanya
memindai direktori `app/api/*`; Beranda BLUD adalah server component yang bertanya
ke database langsung, tanpa route file. Jadi penjagaannya harus ikut di uji
regresi §12 — kalau tidak, ini akan jadi satu-satunya permukaan realisasi yang
tidak terpindai apa pun.

## 9. Kueri — jangan menambah N+1, dan jangan salah pilih baris

`page.tsx` sudah memanggil database di dalam perulangan riwayat
([page.tsx:110](../app/(dashboard)/blud/page.tsx:110) dan
[page.tsx:125](../app/(dashboard)/blud/page.tsx:125)) — 10 kueri tambahan untuk
2×5 versi. Tambahan di §4 **tidak boleh** mengikuti pola itu.

### 9.1 Total terserap = jumlah baris AKAR, bukan jumlah baris daun

Ini bukan selera; dua pilihan yang tampak wajar keduanya menghasilkan angka yang
berbeda dari layar Realisasi:

- **`SELECT SUM(nilai) FROM blud_realisasi_alokasi WHERE tahun_anggaran = ?`
  salah.** Ia ikut menjumlah alokasi yang `anggaran_key`-nya sudah **lenyap** dari
  versi pagu berjalan. `gulungKeAtas` hanya menggulung key yang ada di pohon, jadi
  angka yatim itu tidak pernah masuk total layar Realisasi. Bukan kasus teori —
  layar Realisasi sudah punya spanduk *"rekening hilang — periksa realisasinya"*.
- **Menjumlah baris daun juga salah.** Baris yang dulu daun bisa punya anak
  sesudah pergeseran, sementara alokasi lamanya tetap menempel di sana.

Yang cocok cuma satu: **jumlah baris akar**, persis `akar.reduce`
([realisasi-client.tsx:218](../app/(dashboard)/blud/realisasi/realisasi-client.tsx:218)).
Itu juga definisi yang membuat total layar Realisasi cocok dengan Buku Kas.

**Hitungan menembus/mepet tetap dari baris DAUN** (§5.1c) — pertanyaannya berbeda,
dan `hitungPratinjau` sudah menyaringnya begitu. Satu kueri boleh memulangkan
dua-duanya, asal keduanya tidak tertukar.

### 9.2 Tren per bulan butuh JOIN

`blud_realisasi_alokasi` **tidak punya kolom `bulan`** — bulannya milik
`blud_realisasi_tx`. Jadi trennya `JOIN` lalu `GROUP BY t.bulan`. Tetap satu
kueri, tapi bukan `GROUP BY` polos di satu tabel.

### 9.3 Saldo bukan satu kueri ke `blud_periode`

Kolom `saldo_awal_kas` / `saldo_awal_bank` **hanya berarti di baris `bulan = 1`**
— itu saldo awal TAHUN. Saldo bulan lain diturunkan dari arus kas, tidak disimpan
(§4.6 konsep Realisasi). `kas_fisik` / `bank_koran` hanya terisi di bulan yang
sudah ditutup.

Jadi "uang kita berapa hari ini" = `getSaldoAwal(tahun, 13)`
([realisasi-data.ts:108](../lib/blud/realisasi-data.ts:108)) — saldo awal tahun
plus seluruh arus tahun itu. Dua kueri, **memakai fungsi yang sudah ada**. Menulis
rumus saldo yang kedua di Beranda adalah cara tercepat membuat Beranda dan Tutup
Kas berbeda pendapat soal uang.

### 9.4 Targetnya

| # | Isi | Catatan |
|---|---|---|
| 1 | serapan setahun (akar) + hitungan menembus/mepet (daun) | satu kueri, dikelompokkan per `anggaran_key` |
| 2 | tren serapan per bulan | `JOIN` ke `blud_realisasi_tx` (§9.2) |
| 3 | status 12 bulan | satu kueri ke `blud_periode` |
| 4 | saldo kas & bank hari ini | `getSaldoAwal(tahun, 13)` — 2 kueri, dipakai ulang |

Tanggal transaksi terakhir (keterangan kartu Terserap) menumpang kueri #2, bukan
kueri kelima.

## 10. Modul `/dashboard` — pembenahan, bukan penambahan dua kolom

`getBludSummary()` ([dashboard.ts:114](../lib/data/dashboard.ts:114)) menyeret tiga
masalah sekaligus, dan menempelkan `pct_serapan` di atasnya hanya akan
memperbanyaknya:

1. **Tidak menerima `tahun`.** Satu-satunya ringkasan modul yang begitu —
   `getDashboardSummary(tahun)` ([dashboard.ts:175](../lib/data/dashboard.ts:175))
   meneruskan tahun ke semua modul lain, tapi BLUD memakai `getDpaLatest()`, yaitu
   DPA dengan tanggal terbaru **tahun apa pun**. Pemilih tahun di `/dashboard`
   sama sekali tidak berpengaruh pada widget BLUD hari ini. Serapan wajib
   setahun tertentu, jadi tahunnya harus diputuskan dulu — bukan disimpulkan
   dari versi DPA yang kebetulan paling baru.
2. **Pagunya definisi ketiga** (§2): baris ber-uraian literal `'BELANJA DAERAH'`.
   Kalau `pct_serapan` dihitung terhadap pagu Pergeseran sementara `total_pagu` di
   sebelahnya tetap angka ini, satu kartu akan membantah kartu di sampingnya.
   `getBludDetail()` ([dashboard.ts:287](../lib/data/dashboard.ts:287)) memakai
   definisi yang sama — kalau diperbaiki, dua-duanya sekaligus (L69).
3. **Tidak membaca izin BLUD.** `/dashboard` dijaga `isDashboardRole` saja. Orang
   dengan akses `dashboard` tapi `peta['realisasi'] === 'TIDAK'` akan membaca
   angka serapan di sana — pagar §8 bocor lewat pintu sebelah, satu modul
   berikutnya. Sakelar `app_status_blud_realisasi` juga tidak diperiksa di sana.

Perhitungannya sendiri **satu fungsi dipakai dua tempat** — kalau disalin, cepat
atau lambat keduanya berbeda pendapat, dan itu pola yang sudah melahirkan L78.

> Catatan sampingan, di luar lingkup: `leaf_baris` di sini mendefinisikan daun
> sebagai `vol > 0 || harga > 0`, berbeda dari `is_leaf` (tidak punya anak). Dari
> perbaikan rumus #VALUE! (2026-08-31) kita tahu ada **22 baris daun tanpa
> vol/harga** di 2026, jadi angkanya memang kurang 22. Disebut di sini semata
> supaya tidak dikira regresi baru saat orang membandingkannya.

## 11. Yang sengaja TIDAK dikerjakan

**Hijau untuk baris aman** — §5.1a.

**Virtualisasi tabel Realisasi** — di luar lingkup; alasannya sudah tercatat di
L81 (empat tempat memanggil `getElementById` pada baris, jadi baris di luar layar
diam-diam berhenti bekerja).

**Memperbaiki tombol "Salin daftar yang perlu digeser" agar jalan di LAN.**
`navigator.clipboard` hanya tersedia di *secure context* — HTTPS atau loopback.
Server LAN memakai `http://` dengan nama host, bukan loopback, jadi peramban
memblokirnya; nama host tidak mengubah apa pun, yang dilihat peramban adalah
skema. Jalan cadangan sudah ada dan bekerja: teksnya muncul dalam kotak yang
sudah tersorot, tinggal Ctrl+C
([PratinjauSerapanModal.tsx:99](../components/blud/PratinjauSerapanModal.tsx:99)).
Menambal ini butuh HTTPS di server — keputusan infrastruktur, bukan kode.
Diputuskan **dibiarkan** (2026-09-01).

**Membetulkan `leaf_baris`** — §10 catatan sampingan. Angkanya salah, tapi
memperbaikinya mengubah widget yang tidak ada urusannya dengan serapan.

**Modul lain di `/dashboard`** (IKI, LKJIP, Buku Besar Aset, Perjanjian Kinerja)
belum punya widget sama sekali. Ditunda — menutup lubang BLUD yang sudah ada
lebih dulu.

## 12. Definition of Done

- [x] Beranda BLUD menampilkan terserap, % serapan, sisa, dan hitungan
      menembus/mepet — dengan **versi pagu acuan tertulis** di kartunya
- [x] Angka terserap di Beranda **sama** dengan **total tahun** di layar Realisasi
      (jumlah baris akar, §9.1) — diuji dengan bulan terpilih **bukan** Desember,
      supaya perbedaan bulan-vs-tahun ketahuan; dan diuji dengan pergeseran yang
      benar-benar menggeser, bukan Δ = 0
- [x] Ada rekening yang alokasinya yatim (key-nya tidak ada di versi pagu) →
      Beranda dan layar Realisasi **tetap** melaporkan angka yang sama
- [x] Warna mepet dihitung dari sisa **setahun**, bukan kolom `sisa` — dibuktikan
      dengan membuka bulan sebelum transaksi yang menjebolkan
- [x] Baris mepet berwarna amber di tabel Realisasi, **daun saja**, `pagu > 0`
      saja, berpasangan tema terang
- [x] Banner Realisasi menyebut hitungan mepet + tombol saring
- [x] Kartu "Perlu Perhatian" diklik → Realisasi terbuka **di tahun yang sama**
      dan tersaring (§6)
- [x] Panel Status Tutup Kas + Tren Serapan tampil, ikut izin menu §8.1; bulan
      tanpa baris `blud_periode` terbaca BUKA
- [x] Saldo di panel = `getSaldoAwal(tahun, 13)`, bukan rumus baru (§9.3)
- [x] Sakelar `app_status_blud_realisasi` dimatikan → kartu & panel realisasi di
      Beranda **hilang** beserta angkanya, kartu DPA/Pergeseran tetap (§8.2)
- [x] Serapan ikut segar dalam 30 detik saat orang lain mencatat transaksi —
      **tanpa** menghapus spanduk "Pagu diperbarui" yang sedang tampil (§7)
- [x] `BludSummary` di `/dashboard` menerima `tahun`, memakai pagu §2, memakai
      fungsi hitung yang sama, dan tunduk izin + sakelar BLUD (§10)
- [x] Beranda tidak menambah kueri per-baris (§9)
- [x] Ambang 10% dan `EPS_PRATINJAU` tinggal di satu tempat, tidak disalin —
      termasuk `lebihPagu` yang sekarang menulis `-0.005` sendiri
- [x] Regresi: `scripts/test-blud-beranda-serapan.mts` — uji mutasi yang **wajib**
      tertangkap: (a) pagu acuan ditukar ke DPA, (b) sisa mepet ditukar ke kolom
      per-bulan, (c) total terserap ditukar ke `SUM` mentah, (d) penjaga
      `pagu > 0` dilepas, (e) pemeriksaan sakelar dilepas

## 13. Urutan

1. **Serapan di Beranda** (§2, §4 baris kartu, §9.1) — paling terasa, dan §2 + §9.1
   harus diputuskan benar sebelum apa pun menumpang di atasnya
2. **Izin + sakelar** (§8) — dikerjakan **bersama** langkah 1, bukan sesudahnya;
   kartunya tidak boleh pernah hidup tanpa pagarnya
3. **Warna di tabel Realisasi** (§5) — kecil, begitu §5.0 diputuskan
4. **Penyaring + tautan** (§6) — bagian yang paling banyak menyentuh berkas
5. **Live 30 detik** (§7) — kecil, tapi hati-hati pada jalur ketiga `muat`
6. **Panel Tutup Kas & Tren** (§4 panel, §9.2–9.3)
7. **Modul `/dashboard`** (§10) — terakhir, memakai fungsi yang sudah matang;
   lingkupnya pembenahan `getBludSummary`, bukan menambah dua kolom

Nol kolom baru, nol tabel baru, nol migrasi. Semua dibaca dari `dpa_blud`,
`pergeseran_dpa`, `blud_periode`, dan transaksi Buku Kas yang sudah ada.

---

## 14. Yang berubah saat dikerjakan (2026-09-01)

Empat hal ketahuan hanya karena dijalankan sungguhan, bukan dari membaca kode.

**Aturan borongan menelan warna sel di tema terang.** `blud-shell.tsx:628` memasang
`[data-theme="light"] table tbody td { color: #374151 !important }` untuk SELURUH
modul BLUD. Amber baru tertelan — dan ketahuan bahwa angka sisa pada baris
**melebihi pagu** sudah lama ikut tertelan: di tema terang ia tampil abu-abu
seperti angka biasa, jadi satu-satunya tanda tinggal latar merah mudanya.
Diperbaiki dengan `!important` pada dua sel itu saja; mengubah aturan borongannya
berjangkauan seluruh modul untuk masalah yang cuma menyentuh dua sel.

**Chip saringan yang aktif jadi tak terbaca.** Aturan `:hover` lebih spesifik
daripada `.aktif`, jadi chip yang BARU SAJA diklik berubah jadi teks putih di atas
latar nyaris transparan — tepat ketika kursornya masih di sana. `:not(.aktif)` pada
kedua aturan hover.

**"0,0%" pada serapan yang bukan nol.** Pagu BLUD puluhan miliar, jadi transaksi
awal tahun membulat ke nol dan kartunya berbunyi seperti "belum ada apa-apa".
Di bawah 0,05% ditampilkan `< 0,1%`.

**Lima warna karangan ditolak Gate E**, dan itu benar. Diganti nilai yang sudah
ada: `#854F0B` (teks peringatan tema terang, dari `.bk-warn`), `#FAC775` (teks
peringatan tema gelap, sumber yang sama), `#34D399` / `#0F5C44` (hijau strip Tutup
Kas). Token `action-warning #BA7517` tetap dipakai untuk **strip 3px**-nya: sebagai
elemen grafis ia cukup terbaca, sebagai teks di atas kanvas gelap tidak.

### Uji mutasi

`npx tsx scripts/test-blud-beranda-serapan.mts` (47 pemeriksaan), 6 mutasi
tertangkap. Satu di antaranya sempat **LOLOS**: pemeriksaan penyaring tren cuma
bertanya "ada?", padahal kueri itu punya DUA cabang (sumber PERGESERAN dan DPA) —
membuangnya dari satu cabang tetap cocok. Sekarang yang dihitung kemunculannya.
Bentuk kesalahan yang sama dengan L82c, dan pengingat L69 di sisi tesnya: sebuah
pemeriksaan belum selesai sampai ia menutup semua cabang.

