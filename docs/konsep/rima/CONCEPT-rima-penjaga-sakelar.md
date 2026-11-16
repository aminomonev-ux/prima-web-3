# Penjaga sakelar RIMA — menutup jalur data, bukan cuma tombolnya

> Status: **selesai** — dieksekusi 2026-09-16. Lihat §7 untuk yang berubah dari rencana.
> Pemicu: kartu merah "Sakelar yang tidak menutup apa pun" di Admin Panel → Tinjauan (P10 nomor 6).

## 1. Masalah

`app_status_sentinel_bot` ("RIMA (seluruh bot)") punya tombol di App Control, tapi
satu-satunya yang membacanya adalah `components/sentinel/SentinelProvider.tsx:75` —
dan berkas itu berjalan **di peramban**. Mematikan sakelarnya menyembunyikan tombol
RIMA di layar; tidak ada satu pun handler di server yang ikut menutup.

Ini bentuk T-1 yang sama persis: sakelar yang berbunyi benar, jalan tanpa galat, lalu
tidak menutup apa pun. Bedanya kali ini ia sudah kelihatan — registry menandainya
`dijagaDi: null`, dan uji regresi `scripts/test-tahap-4.mts:96` **menegaskan** ia belum
terjaga. Jadi yang dikerjakan konsep ini bukan menemukan lubangnya, tapi menutupnya.

Besarnya: keempat endpoint yang dipanggil bot hanya memeriksa `getSession()`. Artinya
siapa pun yang **sudah login** dan tahu alamatnya tetap bisa memakainya selagi RIMA
berstatus pemeliharaan. Bukan pintu terbuka ke publik — tapi sakelarnya menjanjikan
sesuatu yang tidak ia lakukan, dan itu justru lebih berbahaya daripada tidak punya
sakelar sama sekali: orang mengira sudah tertutup.

## 2. Yang sudah ada, jangan dibangun ulang

`lib/security/guard.ts` sudah punya penjaganya, lengkap:

- `modulMati(keys, { role })` — memulangkan `NextResponse` 503 atau `null`
- sakelar **global** disisipkan di satu tempat (`bacaKeadaan` → `kunciDenganGlobal`),
  bukan diingat tiap pemanggil
- gagal baca MySQL → `'gagal'` → ditolak (fail-closed pada kegagalan, bukan pada baris
  yang belum di-seed)
- BEKU ditangani lewat header `x-prima-metode` dari proxy, jadi route tidak perlu
  mengoper `req.method` (L54/V3-1)
- kalimat galat diisi ke **tiga** laci (`error`/`message`/`msg`, T3) supaya sampai ke
  klien mana pun

Sembilan modul sudah memakainya. RIMA tinggal ikut.

## 3. Keputusan pokok

### K1 — Pakai `modulMati`, buang kueri sakelar tulisan tangan

`app/api/rima/query/route.ts:27` dan `app/api/rima/summary/route.ts:26` membaca
`app_config` dengan SQL-nya sendiri. Itu **salinan kedua** dari aturan yang sudah punya
rumah — bentuk T1/T14 yang berulang kali melahirkan cacat di repo ini. Keduanya diganti
`modulMati`.

Satu beda perilaku yang harus disengaja, bukan kebetulan: pada versi tulisan tangan,
baris `app_config` yang **hilang** ikut menutup fiturnya (`flag !== 'online'`),
sedangkan `bacaKeadaan` menganggap baris hilang = `online` ("modul baru tidak boleh mati
hanya karena seed tertinggal"). Yang dipilih: ikut `bacaKeadaan`. Alasannya bukan
kemudahan — kalau baris hilang menutup, RIMA mati diam-diam di setiap basis data yang
seed-nya tertinggal, dan tidak ada yang tahu sebabnya. Jalur **kegagalan baca** tetap
fail-closed, jadi janji G30 yang sesungguhnya tidak dilepas. Barisnya sendiri sudah ada
di `docs/schema-mysql.sql:93`.

`session.role` ikut dioper, supaya `PERAN_TEMBUS_SAKELAR` berlaku sama seperti di
sembilan modul lain (S1): SUPER_ADMIN tetap bisa mencoba RIMA selagi dimatikan untuk
orang lain.

### K2 — Sakelar bot jadi INDUK sakelar Tanya Data

Hari ini `app_status_rima_query` berdiri sendiri. Akibatnya mematikan **seluruh bot**
tidak mematikan Tanya Data — padahal itu justru bagian RIMA yang menyentuh data
anggaran. Jadi `query` dan `summary` memeriksa **dua** kunci:

```
['app_status_sentinel_bot', 'app_status_rima_query']
```

Berjenjang seperti BLUD → Realisasi: mematikan induk ikut mematikan anaknya, tidak
sebaliknya. `keadaanTerburuk` sudah menangani penggabungannya.

### K3 — `/api/admin/app-status` dan `/api/user/access` TIDAK dijaga. Ini jebakannya.

Kartu di Admin Panel berbunyi "jalur datanya tidak ikut tertutup", dan godaannya adalah
menutup **semua** yang dipanggil bot. Dua dari empat endpoint itu bukan milik bot:

| Endpoint | Siapa lagi yang memakainya |
|---|---|
| `/api/admin/app-status` | `menu-client.tsx:191` (halaman /menu, semua orang) · `TabAppControl.tsx:49` · `TabSecurityStatus.tsx:38` |
| `/api/user/access` | `menu-client.tsx:200` (halaman /menu, semua orang) |

Menjaganya dengan sakelar RIMA berarti: mematikan RIMA **merusak halaman /menu untuk
seluruh pegawai**, dan — lebih buruk — membutakan tab App Control, yaitu satu-satunya
tempat untuk menyalakan RIMA kembali. Sakelar yang mengunci pintunya sendiri dari luar.

Keduanya sengaja dibiarkan. Bot memanggilnya hanya untuk membaca keadaan sakelar dan
hak akses pemakainya sendiri — bukan jalur data RIMA.

### K4 — Di `/api/rima/feedback`, hanya POST yang dijaga

- `POST` = telemetri bot (`UNANSWERED` / `CANDIDATE_PICK` / `THUMBS_*`) → **dijaga**
- `GET` + `PATCH` = panel admin "RIMA FEEDBACK" (SUPER_ADMIN/ADMIN, label & ekspor
  dataset) → **tidak dijaga**

Sebabnya: orang mematikan RIMA justru untuk memperbaikinya, dan membaca pertanyaan yang
gagal dijawab adalah cara memperbaikinya. Sakelar pemeliharaan yang ikut membutakan
panel perbaikan membuat pemeliharaannya mustahil.

Pengecualian ini **ditulis di registry beserta alasannya**, bukan disimpan di komentar
route — supaya gate G bisa menagihnya (lihat K6).

### K5 — BEKU tetap tidak ditawarkan

`bisaBeku` tetap `false`. "RIMA hanya-baca" bukan keadaan yang berarti bagi pemakai, dan
tombol yang hidup tanpa akibat adalah cacat tersendiri (L79c). Tombolnya tetap
disembunyikan di layar **dan** ditolak di API (L82).

Catatan yang perlu diketahui: karena `modulMati` menangani `readonly` lewat header
metode, seandainya nilai `readonly` sampai masuk ke barisnya, POST feedback & lampir
akan tertutup sementara Tanya Data tetap jalan. Perilaku itu masuk akal, jadi tidak
perlu dicegah — ia hanya tidak ditawarkan.

### K6 — `terjaga: true` harus bisa ditagih CI, bukan cuma diketik

Kalau `dijagaDi` sekadar diganti jadi daftar berkas, lencana TERJAGA berubah jadi janji
yang tidak ditagih siapa pun — dan `scripts/test-tahap-12.mts:152` sudah menuliskan
pelajarannya: *"Lencana TERJAGA yang tidak bisa dibuktikan justru kebalikan gunanya
(T-1)"*.

Gate G hari ini hanya memindai `MODUL_APPS_DATA`, dan RIMA bukan modul — itulah kenapa
lubang ini lolos CI sejak awal. Jadi `SAKELAR_LAIN` **pindah ke `apps-data.mjs`**
(JavaScript polos), dengan alasan yang sudah tertulis di kepala berkas itu: gate G jalan
dengan `node` biasa di CI dan `tsx` bukan devDependency (diperiksa: tidak ada di
`package.json`). `apps.ts` tetap memegang tipenya dan meng-ekspor ulang, jadi enam
pemakainya tidak disentuh.

Bentuk barunya menyebut handler, bukan berkas — gate G untuk modul sudah belajar itu di
Tahap 14d (route yang menjaga di GET saja dulu tetap lulus):

```js
{
  kunci: 'app_status_sentinel_bot',
  label: 'RIMA (seluruh bot)',
  dijagaDi: [
    { berkas: 'app/api/rima/lampir/route.ts',   metode: ['POST'] },
    { berkas: 'app/api/rima/feedback/route.ts', metode: ['POST'],
      kecuali: [{ metode: ['GET', 'PATCH'],
                  sebab: 'Panel admin RIMA FEEDBACK — membacanya justru dibutuhkan saat botnya dimatikan.' }] },
    { berkas: 'app/api/rima/query/route.ts',    metode: ['GET'] },
    { berkas: 'app/api/rima/summary/route.ts',  metode: ['GET'] },
  ],
}
```

Gate G pass kedua menagih: **tiap handler yang diekspor di berkas terdaftar wajib ada di
`metode` ATAU di `kecuali`** — tidak boleh tidak disebut sama sekali. Handler baru yang
lahir besok tanpa penjaga akan menggagalkan CI, dan membiarkannya terbuka menuntut
sebuah kalimat alasan yang tertulis. Itu yang membedakan pengecualian dari kelalaian.

## 4. Berkas yang diubah

| Berkas | Perubahan |
|---|---|
| `lib/registry/apps-data.mjs` | terima `SAKELAR_LAIN_DATA` (pindahan) dengan bentuk `dijagaDi` baru |
| `lib/registry/apps.ts` | tipe `SakelarLain` diperluas; `SAKELAR_LAIN` jadi re-export bertipe; `kunciSakelarLain()` baru; kalimat `sebab` disesuaikan |
| `app/api/rima/_guard.ts` | **baru** — `rimaMati` / `rimaTanyaMati`, cermin `app/api/blud/_guard.ts` |
| `app/api/rima/lampir/route.ts` | `modulMati` di POST, sesudah `getSession`, sebelum `hasAppAccess` |
| `app/api/rima/feedback/route.ts` | `modulMati` di POST saja |
| `app/api/rima/query/route.ts` | blok SQL tangan → `modulMati` dua kunci |
| `app/api/rima/summary/route.ts` | sama |
| `scripts/test-killswitch-modul.mjs` | pass kedua untuk `SAKELAR_LAIN` |
| `scripts/test-tahap-4.mts` | asersi dibalik: `terjaga === true`, `SAKELAR_TANPA_PENJAGA` kosong |
| `scripts/test-tahap-9.mts` | nilai `bisaBeku` tetap; komentarnya ("hanya dibaca peramban") sudah tidak benar |

Urutan penjaga mengikuti yang sudah berlaku dan ditagih `cek-urutan-penjaga.mjs`:
**session → sakelar → hak akses → rate-limit → kerja**.

### Yang SENGAJA tidak diubah

- `lib/admin/pemeriksaan.ts` — kartunya akan hijau **dengan sendirinya** karena
  `SAKELAR_TANPA_PENJAGA` jadi kosong. Menyentuh panelnya supaya kartunya hijau adalah
  kebalikan dari memperbaikinya.
- `components/sentinel/SentinelProvider.tsx` — separuh-layarnya benar dan tetap
  dibutuhkan; yang kurang separuh-servernya.
- Nol tabel, nol kolom, nol migrasi, nol endpoint baru.

### Satu asersi yang hilang dan perlu pengganti

`test-tahap-4.mts:100` berbunyi `SAKELAR_TANPA_PENJAGA.length > 0`. Bagian `> 0` itu ada
supaya pemeriksaan kesamaannya tidak lulus secara hampa (dua himpunan kosong selalu
sama). Sesudah perbaikan ini himpunannya memang kosong, jadi asersi itu **tidak bisa
sekadar dibalik** — yang menggantikan gigitannya adalah gate G pass kedua, yang menagih
klaimnya ke kode sungguhan, bukan ke isi registry.

## 5. Cara membuktikannya

Statis:

```
npm run check:killswitch
npx tsx scripts/test-tahap-4.mts
npx tsx scripts/test-tahap-9.mts
npx tsx scripts/test-tahap-12.mts
npx tsc --noEmit
```

Uji mutasi wajib (kalau tidak menggigit, pemeriksaannya hiasan):

1. buang `modulMati` dari `lampir` → gate G pass kedua gagal
2. buang satu entri `dijagaDi` → gate G gagal (handler tak disebut)
3. hapus `kecuali` pada feedback GET → gate G gagal
4. kembalikan `dijagaDi: null` → `test-tahap-4` gagal

Di aplikasi (uji dengan akun **selain** superadmin — SUPER_ADMIN menembus sakelar):

- App Control → matikan RIMA → tombol RIMA hilang **dan** `POST /api/rima/feedback`
  memulangkan 503 `MODUL_MATI`
- selagi mati: halaman `/menu` tetap normal, tab App Control tetap terbuka
  (pembuktian K3)
- selagi mati: panel RIMA FEEDBACK tetap bisa dibaca & dilabeli (pembuktian K4)
- matikan **hanya** Tanya Data → bot tetap hidup, pertanyaan data ditolak
- nyalakan kembali → Admin Panel → Tinjauan: kartu "Sakelar yang tidak menutup apa pun"
  jadi **hijau, 0**

## 6. Risiko

Kecil dan terbatas: semua yang disentuh adalah penolakan **sebelum** kerja dimulai —
tidak ada kueri data, tidak ada tulisan, tidak ada bentuk balasan yang berubah pada
jalur sukses. Kalau penjaganya salah pasang, gejalanya 503 yang langsung kelihatan,
bukan angka yang diam-diam bergeser.

Yang paling perlu dijaga saat eksekusi adalah K3 — memasukkan `/api/admin/app-status` ke
daftar akan lolos `tsc`, lolos gate G, dan baru ketahuan saat ada yang mematikan RIMA di
jam kerja.

## 7. Hasil eksekusi (2026-09-16)

Semua keputusan K1–K6 berlaku apa adanya. Lima hal bertambah, empat di antaranya
lahir dari pelaksanaan, satu dari uji mutasi:

1. **`app/api/rima/_guard.ts`** — cermin `app/api/blud/_guard.ts`. Empat route memanggil
   penjaga yang sama; menaruh pemanggilannya langsung di tiap route berarti empat
   salinan daftar kunci, bentuk yang K1 baru saja membuangnya.
2. **`kunciSakelarLain(kunci)` di `apps.ts`** — sepadan `kunciSakelarUntuk` untuk modul.
   Berjenjang K2 dihitung registry, bukan diketik di route. Route yang menyertakan kunci
   Tanya Data saja akan lolos `tsc` DAN lolos gate G — penjaganya memang ada, cuma
   kuncinya kurang satu — lalu tetap hidup saat seluruh bot dimatikan.
3. **`penanda` per berkas di `dijagaDi`** — gate G perlu tahu nama fungsi apa yang harus
   muncul di badan handler, sepadan `penjagaApi.penanda` milik modul.
4. **`dijagaDi: null` sekarang MENGGAGALKAN CI**, mencerminkan `TANPA_PENJAGA` di pass
   modul. Tanpa itu, sakelar lintas-modul berikutnya bisa lahir tanpa penjaga persis
   seperti yang ini, dan CI tetap hijau.
5. **`dirApi` + sapuan direktori — ditemukan uji mutasi, bukan dari membaca kode.**
   Rancangan aslinya memeriksa berkas yang DIDAFTAR saja, jadi menghapus satu entri dari
   `dijagaDi` membuat route-nya lolos tanpa satu pemeriksaan pun: daftar penjaga yang
   terpisah dari daftar yang dijaga, persis cacat yang seluruh registry ini ada untuk
   membuangnya. Gate G kini menyapu `app/api/rima` dan menuntut tiap `route.ts` di sana
   terdaftar.

### Yang dibuktikan

Statis — `check:killswitch` (95 route · 156 handler modul + 8 handler lintas-modul),
`tsc --noEmit` bersih, ESLint bersih, `rima-readonly-check` bersih, Tahap 4 (111),
Tahap 9 (142), Tahap 12 (68) semuanya LULUS.

**8 uji mutasi, 8 tertangkap**: penjaga dilepas dari lampir · satu berkas dihapus dari
`dijagaDi` · pengecualian GET/PATCH dihapus · `sebab` dikosongkan · handler yang tak ada
didaftar · `penanda` salah nama · `dijagaDi` dikembalikan ke `null` · `induk` dilepas.
Yang kedua awalnya **LOLOS** — itu yang melahirkan nomor 5 di atas.

Di aplikasi — kartu `tanpa-penjaga` di `/api/admin/pemeriksaan` memulangkan
`jumlah: 0, keparahan: 'aman', contoh: []`, tanpa `lib/admin/pemeriksaan.ts` disentuh
sama sekali. Keempat route RIMA tetap jalan: `summary` & `query` 200 `ok:true`;
`feedback` POST berbadan kosong dan `lampir` POST tanpa berkas sampai ke validasinya
masing-masing (400), membuktikan penjaganya jalan dan memulangkan `null` tanpa menulis
apa pun.

Penutupannya dibuktikan terhadap **MySQL sungguhan** lewat skrip sementara yang dibuang
sesudah dipakai (nilai `app_config` dikembalikan di `finally`), 9 pemeriksaan lulus:
bot dimatikan → 503 `MODUL_MATI` untuk peran ADMIN; Tanya Data **ikut** tertutup
(berjenjang); Tanya Data dimatikan sendiri → bot tetap hidup (satu arah); SUPER_ADMIN
menembus; tanpa `role` tidak ada yang dikecualikan.

### Diuji ujung-ke-ujung di aplikasi, dengan akun bukan superadmin

Dijalankan 2026-09-16 memakai sesi Chrome yang login sebagai **`uji.program` (role
PROGRAM)** untuk sisi pemakai, dan sesi superadmin untuk membalik sakelarnya lewat
layar App Control sungguhan (bukan menulis `app_config` langsung).

| Keadaan | `uji.program` | Yang dibuktikan |
|---|---|---|
| Semua AKTIF | feedback POST 400 · summary 200 · lampir POST 400 · tombol RIMA ada | dasar |
| **Bot PEMELIHARAAN** | keempat jalur 503 `MODUL_MATI` · tombol RIMA hilang | penjaganya menutup |
| Bot PEMELIHARAAN | `/api/admin/app-status` 200 · `/api/user/access` 200 · `/menu` tetap utuh (9 modul) | **K3** |
| Bot PEMELIHARAAN, Tanya Data **masih AKTIF** | `query` & `summary` tetap 503 | **K2**, berjenjang |
| Bot PEMELIHARAAN (sisi superadmin) | `feedback` GET & `?view=label` 200 | **K4** |
| Bot PEMELIHARAAN (sisi superadmin) | `summary` 200 | SUPER_ADMIN menembus (S1) |
| **Hanya Tanya Data PEMELIHARAAN** | `query`/`summary` 503, `feedback`/`lampir` 400 | berjenjang SATU arah |
| Dikembalikan AKTIF | summary 200 · feedback 400 · tombol RIMA kembali | tidak ada sisa |

Layar Sakelar kini menulis **TERJAGA** untuk kedua baris RIMA, dan tombol HANYA BACA-nya
mati dengan tooltipnya — K5 terlihat di layar, bukan cuma di data. Seluruh sakelar
dikembalikan ke `online` dan diperiksa: tidak ada satu pun yang tertinggal mati.

### Satu cacat yang lahir dari perubahan ini, dan ikut dibetulkan

`SEBAB_TAK_BISA_BEKU` — tooltip tombol HANYA BACA yang dimatikan — berbunyi *"Bagian ini
tidak punya data yang bisa diubah, jadi mode hanya baca tidak berpengaruh apa pun."*
Kalimat itu benar selama kedua pemakainya endpoint baca. Begitu sakelar bot ikut menjaga
dua jalur TULIS (POST feedback & lampir), ia berbohong tentang salah satunya — dan
klausa kedua lebih buruk dari yang pertama: mode hanya baca justru AKAN berpengaruh di
situ (menutup POST, membiarkan Tanya Data jalan). Ketahuan saat menguji layar Sakelar,
bukan dari membaca kode.

Ditulis ulang menyebut alasan yang berlaku untuk keduanya — BEKU itu untuk LAYAR yang
dibuka sambil penyimpanannya ditahan, dan keduanya bukan layar semacam itu. Dua asersi
yang memakunya ikut disesuaikan (`test-tahap-18` menyamakan kalimatnya persis,
`test-tahap-9` kini melarang kembalinya dua klaim yang tidak benar itu). Tanda pisah
panjang di kalimat `sebab` registry ikut dibuang — `test-tahap-18` memang melarangnya
untuk kalimat yang dibaca orang.

### Yang TIDAK diverifikasi

Panel RIMA FEEDBACK dibuktikan lewat endpointnya (200 selagi bot mati), bukan dengan
membuka tabnya dan melihat daftarnya terisi. Isi panelnya sendiri tidak berubah oleh
pekerjaan ini.
