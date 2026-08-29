# CONCEPT — Tutup Pergeseran (BLUD)

> Status: **terpasang** (2026-08-29). Regresi:
> `npx tsx scripts/test-blud-tutup-pergeseran.mts` (71), 11 uji mutasi tertangkap.
> Lihat §16 — cacat jalur HAPUS yang ditemukan pemakai pada hari yang sama.
> Lahir dari permintaan langsung: pada bulan Februari, yang jadi pembanding
> seharusnya **hasil pergeseran Januari**, bukan DPA murni.

---

## 1. Yang diminta

Kolom pergeseran (`vol_p` · `harga_p` · `pergeseran`) disalin ke kolom kiri
(`vol` · `harga` · `jumlah`), kolom P dibiarkan apa adanya. Sesudah itu selisih
jadi nol, dan geseran berikutnya dihitung terhadap hasil putaran sebelumnya.

Contoh tiga rekening — DPA murni **A 100 jt · B 50 jt · C 30 jt**, Januari
menggeser 20 jt dari A ke B:

| | kiri (`jumlah`) | kolom P (`pergeseran`) | selisih |
|---|---|---|---|
| Versi Januari, sebelum ditutup | 100 / 50 / 30 | 80 / 70 / 30 | −20 / +20 / 0 |
| Versi basis, sesudah ditutup | **80 / 70 / 30** | 80 / 70 / 30 | 0 / 0 / 0 |
| Versi Februari (geser 10 jt C→A) | 80 / 70 / 30 | 90 / 70 / 20 | **+10 / 0 / −10** |

Tanpa penutupan, baris ketiga akan berbunyi `−10 / +20 / −10` — campuran Januari
dan Februari. Pagunya sama-sama benar; yang salah **dokumennya**, dan dokumen itu
yang jadi bahan Rekap Penanggung Jawab.

## 2. Ini "tutup putaran", bukan "tutup bulan"

Batas penutupan ditentukan kebijakan — tanggal terakhir unit lain boleh
mengajukan pergeseran. Bisa jatuh di tengah bulan, bisa lebih dari sekali dalam
sebulan. Karena itu penomorannya **Pergeseran ke-1, ke-2, ke-3**, bukan nama
bulan, dan tidak ada aturan "bulannya harus sudah lewat".

Aturan seperti itu sempat diusulkan lalu dicabut — lihat §10.

## 3. Keputusan pokok — Tutup berhenti di FORM

Tutup **mengubah isi layar**, menyalakan `belumTersimpan`, dan (hanya bila perlu,
§5) menyetel pemilih periode. Yang menulis tetap tombol **Simpan**.

Alasannya L78 dan L80, dua-duanya sudah dibayar mahal: modal yang memegang
tanggal versi **dan** jalur tulisnya sendiri di samping tombol Simpan halaman
adalah persis cara impor DPA dulu menimpa 558 baris bulan berjalan. Satu jalur
tulis, satu rumus tanggal (`sasaranSimpan`, [tanggal.ts:204](../lib/blud/tanggal.ts:204)).

Akibat yang bagus dan gratis: seluruh pagar yang sudah menjaga Simpan otomatis
berlaku — ambang turun drastis, `PERGESERAN_TIDAK_BERIMBANG`, `pagarSimpanVersi`,
kunci optimistik, audit, dan pagar akses (§8). Nol endpoint tulis baru, jadi tidak
ada lubang L69-a (`FOR UPDATE` pada baris yang belum ada).

## 4. Bulan bukan kotak — tabelnya rentetan versi

Ini yang membubarkan beberapa aturan yang sempat dikarang di tahap konsep.
`pergeseran_dpa` tidak punya dimensi bulan; yang ada hanya versi berurut tanggal,
dan **pagu selalu `MAX(versi_tanggal)`**.

Jadi tidak ada langkah "membawa hasil Januari ke Februari". Barisnya membawa
kolom kirinya sendiri ke versi berikutnya:

```
20 Jan  simpan geseran      → 2027-01-20   kiri 100/50/30 · P 80/70/30
21 Jan  Tutup → Simpan      → 2027-01-21   kiri  80/70/30 · P 80/70/30
 3 Feb  buka (versi terbaru termuat), geser, Simpan
                            → 2027-02-03   kiri  80/70/30 · P 90/70/20
```

Tanpa Salin Versi, tanpa memilih periode, tanpa langkah tambahan.

## 5. Sasaran simpan

Tetap `sasaranSimpan(periodeTulis)` — tidak ada rumus baru.

Tutup menyetel `periodeTulis` **hanya** ketika yang ditutup adalah **arsip
periode** (kasus mengisi mundur: menutup `2026-01-31` diarahkan ke Februari).
Pada alur normal periodenya tidak disentuh; sasarannya memang sudah hari ini.

Pemindahan sasaran itu terlihat (chip periode berganti) dan diumumkan di
konfirmasi. Itu bedanya dengan yang dilarang L80: di sana memindahkan sasaran
adalah efek samping yang tidak diminta siapa pun, di sini periode berikutnya
**adalah** pekerjaannya.

### Dua pagar di Simpan

| Pagar | Mencegah |
|---|---|
| Sasaran harus bertanggal **sesudah** versi yang ditutup | Dokumen yang ditutup kehilangan selisihnya — Simpan itu hapus-lalu-tulis-ulang per `(tahun, versi_tanggal)` ([data.ts:862](../lib/blud/data.ts:862)) |
| Sasaran **tidak boleh menimpa versi yang sudah ada** | Dua bahaya sekaligus: menimpa versi yang sedang jadi acuan realisasi (mis. `2026-08-29` saat mengisi mundur Januari), dan menimpa arsip periode yang sudah berisi |

Contoh penolakan yang harus menyebut jalan keluarnya:

> *"Versi ini bertanggal hari ini. Basisnya baru bisa disimpan besok
> (21 Jan 2027), supaya dokumen pergeseran 20 Jan tidak tertimpa."*

> *"Basis akan bertanggal 29 Agu 2026 dan menggantikan versi Agustus yang
> sekarang jadi acuan realisasi. Pilih Periode Februari dulu."*

## 6. Kenapa realisasi tidak mungkin terganggu

Rantai buktinya tiga lapis, semuanya sudah ada:

1. **Pagu dibaca dari kolom `pergeseran` versi terbaru** ([realisasi-data.ts:420](../lib/blud/realisasi-data.ts:420),
   [pagu.ts:83](../lib/blud/pagu.ts:83)). Tutup tidak menyentuh `vol_p`/`harga_p`,
   dan `recalcPergeseranJumlah` menghitung `pergeseran = vol_p × harga_p`
   ([recalc.ts:118](../lib/blud/recalc.ts:118)) — angkanya identik.
2. **`anggaran_key` ikut sendiri**: barisnya disalin satu-lawan-satu. Di atasnya
   `warisiJangkar` ([data.ts:470](../lib/blud/data.ts:470)) mengisi yang kosong
   dan `periksaJangkar` **menolak simpan** kalau masih bolong — gagalnya bersuara.
3. **`pagarSimpanVersi`** membandingkan pagu baru vs serapan nyata di bawah kunci.
   Karena angkanya identik, tidak ada rekening yang bisa jatuh di bawah serapannya.

## 7. Tabel baru

```sql
CREATE TABLE IF NOT EXISTS blud_pergeseran_tutup (
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  versi_ditutup  DATE     NOT NULL COMMENT 'Versi pergeseran yang dikunci',
  versi_basis    DATE     NOT NULL COMMENT 'Versi yang lahir dari penutupan',
  ditutup_pada   DATETIME NOT NULL COMMENT 'Jam WIB, distempel server',
  ditutup_oleh   INT          NULL,
  catatan        TEXT         NULL,
  PRIMARY KEY (tahun_anggaran, versi_ditutup),
  CONSTRAINT fk_bpt_user FOREIGN KEY (ditutup_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Kunci utamanya yang menjaga**, bukan penguncian tambahan: satu versi hanya bisa
ditutup sekali, klik dobel ditolak kunci tabelnya sendiri — atomik, dan tanpa
`SELECT … FOR UPDATE` pada baris yang belum ada (L69-a).

**Nomor putaran TIDAK disimpan**, dihitung saat dibaca dari urutan
`versi_ditutup`. Menyimpannya berarti hitung-lalu-tulis, anti-pattern L55.

`ditutup_pada` pakai `waktuSekarangWIB()`, **bukan `NOW()` MySQL** — alasannya
sama dengan `blud_riwayat_simpan`: `versi_tanggal` datang dari klien lewat
`tanggalHariIniWIB()`, dan pada dini hari WIB keduanya bisa beda tanggal kalau
server UTC.

Ditulis dari **`asal_tutup`** di body Simpan — pola persis `asal_salin` /
`asal_pulihkan` / `asal_impor` — di dalam transaksi yang sama dengan barisnya,
dan ikut memperpanjang detail audit `BLUD_SAVE_PERGESERAN`.

## 8. Izin — nol tambahan

Yang boleh menutup = yang boleh **mengedit** menu Pergeseran. Karena Tutup
menulis lewat POST yang sudah ada, pagarnya sudah terpasang:
`bolehEditMenu(userId, role, 'pergeseran')`
([route.ts:108](../app/api/blud/pergeseran/route.ts:108)).

Peran yang aksesnya hanya lihat (mis. Keuangan secara bawaan) otomatis tidak bisa
menutup — tombolnya ikut aturan yang sama dengan tombol Simpan. Tidak ada pagar
baru yang perlu dikarang, dan karena itu tidak ada pagar baru yang bisa terlewat.

## 9. Sinkronkan DPA — dua perbaikan wajib

### 9.1 Sadar periode (memperbaiki bug yang SUDAH ada)

Route inject selalu mengambil DPA **terbaru** ([inject/route.ts:44](../app/api/blud/pergeseran/inject/route.ts:44)).
Menekannya di versi Januari hari ini menarik DPA Agustus; Simpan memang menolak
lewat pagar `dpa_versi_tanggal > versi_tanggal`, **tapi tabelnya sudah terlanjur
tertimpa**. Ini rusak sekarang, terlepas dari fitur tutup.

Perbaikannya memakai aturan yang sudah dipakai tombol "Buat Pergeseran"
(`generate` di `pergeseran-client.tsx`): **DPA terakhir yang tanggalnya ≤ tanggal
versi sasaran**. Untuk bulan berjalan hasilnya sama persis dengan sekarang —
tanggal versi DPA tidak mungkin melewati hari ini (`pagarVersiTanggal`), jadi
"terakhir ≤ hari ini" = "terbaru".

### 9.2 Bandingkan dulu, baru bertanya

Sesudah penutupan, **semua baris punya `vol_p === vol`**, dan itulah tanda yang
dipakai inject untuk memutuskan "belum digeser"
([recalc.ts:588](../lib/blud/recalc.ts:588)). Akibatnya seluruh tabel bisa ditarik
balik ke DPA murni — dan karena `vol_p`/`harga_p` ikut berubah, **pagu realisasi
ikut mundur**. Semua pengaman diam: jumlah baris sama, selisih tetap nol.

Tapi memblokirnya juga salah: kalau user sudah membuat DPA versi Februari yang
isinya sama dengan basis, sinkron tidak mengubah apa pun dan memang aman.
Bedanya bukan pada niat orangnya, **bedanya pada apakah DPA-nya sudah cocok** —
dan itu bisa dihitung, tidak perlu ditanyakan.

Jadi: hitung selisihnya sebelum mengubah apa pun.

- Nol perubahan → jalan, tanpa gangguan.
- Ada perubahan → tampilkan barisnya dan nominalnya, sebutkan kalau itu akan
  membatalkan hasil penutupan.

**Bukan kode konfirmasi.** Kode membuktikan "tidak salah klik"; yang dibutuhkan
di sini adalah orangnya tahu apa yang akan hilang. Kalau tetap mau ada gesekan,
yang diketik harus **angkanya** — L76: yang diketik = sasarannya.

## 10. Aturan yang sempat diusulkan lalu DICABUT

Ditulis supaya tidak dihidupkan lagi oleh orang berikutnya.

| Usulan | Kenapa dicabut |
|---|---|
| Penutupan menerbitkan **versi DPA** baru | Menulis ke modul yang izinnya terpisah, dan bukan itu yang diminta. Yang diminta tetap di layar Pergeseran |
| Kolom pembeda (`babak`) supaya muat dua versi sehari | `versi_tanggal` dipakai ~298 kali di 38 berkas; perbaikan setengah jalan di jalur tulis persis kegagalan L69 |
| "Basis lahir di bulan berikutnya" | Tidak perlu — §4: bulan bukan kotak. Sasarannya cukup `sasaranSimpan` yang sudah ada |
| "Bulan yang ditutup harus sudah lewat" | Memblokir pemakaian yang sah: batas penutupan adalah **kebijakan**, bisa tanggal 20 |
| Kode konfirmasi pada Tutup | Tutup tidak merusak apa pun — muat ulang halaman membatalkannya. Yang berbahaya Simpan, dan itu dijaga dua pagar §5 |

## 11. Konfirmasi — menampilkan, bukan menyuruh memilih

Bukan modal pemilih versi: modal yang mengambil dari tempat lain **dan**
memindahkan sasaran Simpan adalah bentuk L80. Yang ditutup = **yang sedang
dilihat**; mau menutup Januari, buka Januari dulu.

Isinya, urut:

```
Yang ditutup          Pergeseran Januari 2026 — versi 31 Jan 2026 (558 baris)
Akan disimpan sebagai Periode Februari 2026 (28 Feb 2026)
Total pagu            Rp 68.383.000.000 → Rp 68.383.000.000 · tidak berubah
Yang berubah          kolom kiri jadi sama dengan kolom pergeseran, selisih nol
⚠ Belum tersimpan sampai Anda menekan Simpan.
```

Baris "total pagu" bukan hiasan: kalau angkanya sampai berbeda, ada yang salah,
dan itu terlihat **sebelum** disimpan.

## 12. Yang sengaja TIDAK dikerjakan

- **Membangun ulang rantai Januari–Juli supaya Agustus jadi akumulasinya.**
  Angka Agustus sudah benar dan sudah dipakai; membongkarnya demi kerapian rantai
  itu risiko besar untuk manfaat kosmetik. Bulan lampau diisi sebagai **dokumen**,
  disiplin penutupan dimulai dari bulan berjalan.
- **Menyentuh `dpa_blud`** — nol perubahan.
- **Endpoint tulis baru** — nol.
- **Mengubah `versi_tanggal` jadi DATETIME** — lihat CONCEPT-blud-riwayat-simpan §2.
- **Membuat versi yang ditutup jadi baca-saja.** **Ditunda — keputusan pemilik
  aplikasi, 2026-08-29.** Jangan diangkat lagi tanpa ada kejadian nyata yang
  membutuhkannya. Alasannya: membukanya lalu
  Simpan mendarat di hari ini, bukan menimpa versi itu (`periodeUntukVersi`
  memulangkan `''` untuk revisi harian), jadi bahayanya kecil. Ditinjau ulang
  sesudah dipakai.

## 13. Definition of Done

- [x] `migration-blud-pergeseran-tutup.sql` + tabel masuk `docs/schema-mysql.sql`
- [x] `asal_tutup` di `PergeseranBodySchema` (Zod sentral)
- [x] Penulisan baris penutupan di dalam transaksi `savePergeseran`
- [x] Dua pagar §5 di sisi server, bukan hanya di layar — #1 di Zod, #2 di dalam
      transaksi memakai `existing` yang sudah dibaca di bawah kunci
- [x] Sinkronkan DPA sadar periode (§9.1) — tombolnya ikut **hidup lagi** di
      periode historis, karena sebab dimatikannya sudah hilang
- [x] Panel pembanding sebelum sinkron (§9.2)
- [x] Lencana "Pergeseran ke-n · ditutup …" + "basis dari …" di daftar versi
- [x] `scripts/test-blud-tutup-pergeseran.mts` (59) — 6 uji mutasi tertangkap
- [x] `tsc` + eslint bersih · Gate E token · Gate G sakelar · suite BLUD lain hijau
      (`periode-terkunci` 86 disesuaikan: dua pemeriksaan mengunci bentuk lama
      tombol Sinkron DPA)
- [x] Diuji di aplikasi dengan data nyata (§15)

## 14. Urutan

1. Migrasi + schema + Zod (`asal_tutup`)
2. Sinkronkan DPA sadar periode — **berdiri sendiri**, memperbaiki bug yang sudah
   ada, dan aman di-commit lebih dulu
3. Transformasi Tutup di layar + konfirmasi
4. Dua pagar sasaran + penulisan baris penutupan
5. Panel pembanding sebelum sinkron
6. Lencana di daftar versi
7. Regresi + uji mutasi + uji di aplikasi

## 15. Hasil verifikasi di aplikasi (2026-08-29)

Data nyata BLUD 2026: pergeseran `2026-01-31` (558 baris, 4 baris digeser senilai
Rp 10 juta) dan `2026-08-29` yang sedang **BERLAKU**.

| Yang diuji | Hasil |
|---|---|
| Tutup pada versi berlaku (29 Agu) | **ditolak** — sasarannya versi itu sendiri; tombol mati, sebabnya tertulis |
| Tutup arsip Januari | sasaran otomatis **Februari 2026**, chip periode ikut berganti |
| Total pagu di lembar konfirmasi | 68.383.000.000 → 68.383.000.000 · tidak berubah |
| Simpan | lahir `2026-02-28`, 558 baris, **0 baris berselisih**, 558 jangkar utuh |
| Kolom kiri Februari | = kolom P Januari, baris per baris (4 baris tergeser dicek satu-satu) |
| Versi Januari | **tidak tersentuh** — masih 4 baris tergeser |
| Versi 29 Agu | **tidak tersentuh**, tetap `MAX(versi_tanggal)` → tetap acuan realisasi |
| `dpa_versi_tanggal` basis | ikut Januari (`2026-01-31`) — pagar `dpa > versi` tetap terpenuhi |
| Audit | `… BASIS dari penutupan Pergeseran 2026-01-31 (kolom pergeseran disalin ke kolom kiri, pagu tidak berubah)` |
| Tutup versi yang sama lagi | tombol mati — "Versi 31 Jan 2026 sudah ditutup." |
| Sinkron DPA di basis Februari | mengambil **DPA 31 Jan** (bukan DPA 29 Agu) → §9.1 terbukti |
| Panel pembanding | 4 baris ±5 juta terdaftar lengkap + spanduk merah "Versi ini basis hasil penutupan" |

Ditemukan saat diuji di layar, tidak akan pernah tertangkap skrip: kedua kotak
peringatan memakai warna sebaris, dan tema terang **tidak menimpanya** — teks
merah muda di atas latar merah muda, praktis tidak terbaca. Dijadikan kelas
`.tp-galat`/`.tp-ingat` dengan pasangan `[data-theme="light"]`, mengikuti pola
`.rl-minus-banner`. Diperiksa ulang di kedua tema.

## 16. Cacat jalur HAPUS (ditemukan pemakai, 2026-08-29 sore)

Pemakai menghapus versi pergeseran lalu membangunnya ulang, dan melapor: *"klik
Simpan otomatis jadi tutup ya? padahal saya belum klik Tutup."*

Simpan **tidak** menutup apa pun — audit membuktikannya, hanya satu baris yang
membawa keterangan `BASIS dari penutupan`. Yang terjadi: catatan penutupan di
`blud_pergeseran_tutup` **tidak ikut terhapus** bersama versinya.

| Akibatnya | |
|---|---|
| Lencana | Daftar versi mengumumkan "ditutup 28 Feb 2026" untuk basis yang sudah tidak ada |
| Tombol Tutup | **Mati permanen** — `alasanKunciTutup` membaca catatan yang tertinggal |
| Kalau ditembus | `PRIMARY KEY (tahun_anggaran, versi_ditutup)` menolak penutupan yang sah |

Jalan buntu, dan sampainya lewat pemakaian biasa: Pengaturan → Hapus Versi.

Ini kegagalan **L69** lagi, dan pada fitur yang seluruh dokumennya membahas L69:
pagarnya dipasang di jalur SIMPAN, jalur HAPUS tidak pernah ditengok.

### Perbaikannya

`hapusTutupTerkaitVersi(tx, tahun, versi)` membuang **kedua sisi**:

- **basis dihapus** → penutupan itu tidak meninggalkan apa pun.
- **versi yang ditutup dihapus** → `versi_tanggal` cuma tanggal, jadi apa pun yang
  nanti disimpan lagi di tanggal itu adalah dokumen **baru**. Catatan yang
  bertahan membuatnya lahir dalam keadaan "sudah ditutup".

Dipanggil di **dua** tempat, di dalam transaksi masing-masing:
`deletePergeseranVersi`, dan cabang **kosong+force** `savePergeseran` —
mengosongkan versi membuatnya lenyap dari `getPergeseranHistory`, jadi akibatnya
sama dengan menghapus. Cabang itu tidak bisa dicapai lewat HTTP (`rows` minimal 1
di Zod), tapi pagar yang cuma di jalur utama persis kegagalan yang sedang diobati.

Riwayatnya tidak hilang: `audit_log` menyimpan `BASIS dari penutupan Pergeseran …`,
dan itu memang arsipnya. `blud_pergeseran_tutup` keadaan yang berjalan (lencana +
pagar "sudah ditutup"), bukan arsip. Jumlah yang dibuang ikut disebut di baris
audit penghapusan.

### Dua temuan lain dari tinjauan kode di putaran yang sama

**Kalimat penolakan menawarkan tindakan yang tidak ada.** Saat bulan tujuan sudah
berisi, pesannya berbunyi "atau pilih periode lain" — padahal sasaran penutupan
**diturunkan** dari versi yang ditutup, tidak bisa dipilih orang. Diganti: sebutkan
bahwa hasilnya kemungkinan memang sudah dibawa ke sana, dan kalau perlu diulang,
hapus dulu versi tujuannya.

**Peringatan kecocokan longgar hilang di jalur yang paling membutuhkannya.**
Tombol "Terapkan perubahan ini" mengoper larik kosong sebagai `low_confidence`,
jadi peringatan "dipasangkan berdasarkan kemiripan" hanya muncul di jalur yang
TIDAK mengubah angka. Sekarang ikut disimpan di state pratinjau.

Ditambah satu koreksi kecil: pesan "tidak ada angka yang berubah" sekarang
menyebut jumlah rekening baru kalau sinkron menambah baris — menyisipkan rekening
sambil bilang tidak ada yang berubah itu tidak benar, walau memang tidak merusak.

### Verifikasi

Dijalankan sungguhan lewat aplikasi: tutup Januari → basis `2026-02-28` lahir →
hapus versi itu lewat Pengaturan → catatan penutupan **ikut hilang** (0 baris
tersisa), audit berbunyi `… · 1 catatan penutupan ikut dibuang · Alasan: …`, dan
tombol Tutup di Januari **hidup kembali** dengan tooltip normal.

Regresi bagian H (12 pemeriksaan), 5 uji mutasi tertangkap. Dua di antaranya
sempat "gagal" karena jendela regex-nya salah, bukan kodenya: `Promise<{ … }>`
menaruh `}` di kolom 0 sehingga potongan fungsi berhenti di tanda tangan, dan
`saveDpa` punya cabang `if (!incoming)` kembar yang letaknya lebih awal. Keduanya
sekarang berjangkar eksplisit.
