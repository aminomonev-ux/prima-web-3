# CONCEPT — DPA Perubahan (BLUD)

> Status: **KONSEP** (2026-10-08) — belum ada kode. Menunggu keputusan §15.
> Permintaan: DPA BLUD punya versi **Perubahan**. Saat membuatnya ada dua
> pilihan titik awal — simpanan DPA terkini, atau hasil pergeseran terakhir
> (kolom Vol P · Harga P · dst). Beda dengan pergeseran, perubahan boleh
> menambah dan mengurangi, jadi **totalnya berbeda** dari DPA murni.

---

## 1. Yang diminta, dalam angka

Tiga rekening. DPA murni **A 100 jt · B 50 jt · C 30 jt** = 180 jt. Pergeseran
ke-1 memindahkan 20 jt dari A ke B → **80 · 70 · 30** (total tetap 180 jt). Sampai
September, B sudah terserap **65 jt** — sah, pagunya 70 jt.

Oktober ada Perubahan: A ditambah 15 jt, C dikurangi 10 jt, rekening baru D 25 jt.

| | A | B | C | D | Total |
|---|---|---|---|---|---|
| **Pilihan 1** — titik awal DPA terkini | 100 | 50 | 30 | — | 180 |
| → sesudah diubah | 115 | **50** | 20 | 25 | 210 |
| **Pilihan 2** — titik awal pergeseran terakhir | 80 | 70 | 30 | — | 180 |
| → sesudah diubah | 95 | 70 | 20 | 25 | 210 |

Kedua pilihan berakhir di total yang sama, tetapi pembagiannya berbeda.
**Pilihan 1 diam-diam membatalkan pergeseran ke-1**: B kembali ke 50 jt padahal
sudah terserap 65 jt. Simpan akan ditolak `pagarSimpanVersi` (sudah ada,
[data.ts:400](../lib/blud/data.ts:400)), dan alasannya harus sudah terlihat di
modal sebelum orang mulai mengetik, bukan baru muncul saat Simpan (§6).

Kedua pilihan tetap disediakan sesuai permintaan. **Bawaannya** adalah sumber
yang sedang jadi pagu (§6.3).

## 2. Bedanya dengan Pergeseran

| | Pergeseran | Perubahan |
|---|---|---|
| Total | wajib berimbang (`PERGESERAN_TIDAK_BERIMBANG`) | boleh naik/turun |
| Baris baru | boleh | boleh |
| Disimpan di | `pergeseran_dpa` | `dpa_blud` — Perubahan **adalah** DPA mulai tanggal itu (§3) |
| Dokumen cetak | DPA kiri · P kanan · selisih | Sebelum · Sesudah · Bertambah/(Berkurang) (§12) |
| Sesudahnya | putaran berikutnya | pergeseran berikutnya **mengacu DPA Perubahan** |

## 3. Keputusan pokok A — Perubahan adalah versi DPA, bukan tabel baru

Versi Perubahan ditulis ke `dpa_blud` lewat `saveDpa` yang sudah ada. Alasannya:
banyak pembaca bertanya "DPA mana yang berlaku", dan semuanya otomatis memperoleh
jawaban yang benar tanpa diajari apa pun:

- tombol **Buat Pergeseran** menarik DPA berlaku
  ([pergeseran-client.tsx:1446](../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx:1446)),
  dan **Sinkronkan DPA** memakai `getDpaVersiBerlaku`
  ([inject/route.ts:53](../app/api/blud/pergeseran/inject/route.ts:53)), jadi
  pergeseran sesudah Perubahan mengacu Perubahan dengan sendirinya;
- Rekap PJ ([rekap-pk-data.ts:35](../lib/blud/rekap-pk-data.ts:35)) dan
  `/dashboard` ([dashboard.ts:147](../lib/data/dashboard.ts:147)) membaca
  `getDpaLatestDate`, sedangkan Salin Tahun membaca `GET /api/blud/dpa?tahun=`
  (versi terbaru). Ketiganya otomatis membaca Perubahan.

**Ditolak: tabel `dpa_perubahan` berbentuk seperti `pergeseran_dpa`.** Bentuknya
memang cocok untuk dokumen (sebelum dan sesudah sebaris). Tetapi setiap pembaca
DPA di atas harus diajari ada tabel ketiga, dan pembaca yang terlewat akan tetap
membaca DPA murni tanpa galat. Itu bentuk L69 yang paling sulit ditemukan.

## 4. Keputusan pokok B — jenis versi ditentukan TANGGAL MULAI

Tidak ada kolom bendera per baris. Tabel penanda baru, mengikuti pola
`blud_pergeseran_tutup`:

```sql
CREATE TABLE blud_dpa_perubahan (
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  versi_mulai    DATE     NOT NULL COMMENT 'Versi DPA pertama yang berstatus Perubahan',
  sumber         ENUM('DPA','PERGESERAN') NOT NULL COMMENT 'Pilihan titik awal',
  sumber_versi   DATE     NOT NULL COMMENT 'Versi sumber yang diambil',
  dibuat_pada    DATETIME NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  dibuat_oleh    INT          NULL,
  catatan        TEXT         NULL COMMENT 'Opsional: nomor/tanggal penetapan untuk kop cetak',
  PRIMARY KEY (tahun_anggaran, versi_mulai),
  CONSTRAINT fk_bdp_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL
);
```

Aturannya: **versi DPA yang bertanggal ≥ `versi_mulai` adalah versi Perubahan.**
Nomor "Perubahan ke-n" tidak disimpan, tetapi dihitung dari urutan baris tabel ini (L55).

Kenapa tanggal mulai dan bukan bendera `jenis` di tiap baris `dpa_blud`: dengan
bendera, 558 baris satu versi harus sepakat satu sama lain dan dengan versi
tetangganya, dan setiap jalur tulis (Simpan, Pulihkan, Salin Versi, Pulihkan
Cadangan) harus ingat mengisinya. Tanggal mulai tidak bisa saling bertentangan.

**Penanda dibuang bersama versi Perubahan terakhir.** Selama masih ada versi DPA
≥ `versi_mulai`, babak Perubahan tetap ada (menghapus versi tanggal mulai saja
tidak mengubah apa pun). Kalau tidak tersisa satu pun, penandanya ikut dihapus di
transaksi yang sama, mengikuti pola `hapusTutupTerkaitVersi`. Tanpa itu aturan pagu
§8 melihat babak Perubahan yang tidak punya DPA.

## 5. Kolom "sebelum" — foto basis, dibekukan

Empat kolom baru di `dpa_blud`, NULL-able:

| Kolom | Isi |
|---|---|
| `vol_sebelum` | vol (pilihan 1) / `vol_p` (pilihan 2) |
| `satuan_sebelum` | satuan |
| `harga_sebelum` | harga / `harga_p` |
| `jumlah_sebelum` | jumlah / `pergeseran` |

- **Diisi hanya sekali, saat Perubahan dibuat**, dan di semua baris basis,
  induk maupun daun. Baris yang lahir di Perubahan bernilai NULL (tampil "—").
  Baris DPA murni juga NULL, jadi kolomnya tidak tampil.
- **Recalc tidak pernah menyentuhnya** (L86). Kolom ini tidak diketik dan tidak
  dihitung; ia catatan sejarah.
- **Disimpan, bukan di-JOIN ke versi sumber saat cetak.** Presedennya Pergeseran
  yang membawa salinan kolom DPA-nya sendiri: dokumen yang sudah terbit tidak
  boleh ikut berubah. Versi sumber bisa disimpan ulang di tanggal yang sama
  (Simpan = hapus lalu tulis ulang), jadi JOIN membuat kolom "sebelum" bergeser
  sesudah dokumen ditandatangani.
- **Beku per baris tetap benar walau pohonnya diubah.** Anak baru di bawah induk A
  membuat sesudah-A naik dan sebelum-A tetap. Daun yang mendapat anak tetap memegang
  sebelum-nya sendiri. Baris yang dipindah dari induk A ke B membuat A "berkurang"
  dan B "bertambah", dan itu memang yang terjadi. Total akar sebelum = total basis
  di semua keadaan.
- **Bertambah/(Berkurang) tidak disimpan** (`jumlah − jumlah_sebelum`, dihitung
  saat tampil/cetak). Nilai turunan tidak disimpan, presedennya `is_latest` dan L86.

### 5.1 Dijaga server, bukan cuma oleh layar (L82)

1. **Saat dibuat**, server mengisi kolom sebelum **sendiri** dari versi sumber
   (dibaca di bawah kunci, dicocokkan lewat `anggaran_key`). Isian kolom sebelum
   dari klien diabaikan, sehingga dokumen Perubahan tidak bisa memuat angka
   "sebelum" karangan.
2. **Saat revisi berikutnya**, kolom sebelum setiap `anggaran_key` harus sama
   dengan versi Perubahan sebelumnya. Kalau berbeda, simpanan ditolak
   `SEBELUM_BERUBAH`. Kalau tidak dijaga, "beku" cuma janji layar.
3. **Konten murni yang masuk ke slot Perubahan ditolak** (`PERUBAHAN_TANPA_SEBELUM`):
   sasaran ≥ `versi_mulai` tetapi tidak ada satu baris pun yang membawa kolom
   sebelum. Ini menangkap Pulihkan, Salin Versi, atau Pulihkan Cadangan dari versi
   murni ke tanggal Perubahan, yang akan menghapus seluruh kolom sebelum tanpa suara.

## 6. Dua pilihan sumber — inti permintaan

### 6.1 Pemetaan

- **Pilihan 1, DPA terkini**: `dpaKeInput` apa adanya. Kolom sebelum diisi dari
  vol/satuan/harga/jumlah yang sama.
- **Pilihan 2, Pergeseran terakhir**: `vol ← vol_p`, `harga ← harga_p`,
  `jumlah ← pergeseran`, dengan **`anggaran_key` dibawa** (tahunnya sama, barisnya
  sama). Pergeseran tidak menyimpan jejak usulan (`origin`/`usulan_item_id`), jadi
  jejak itu diambil dari baris DPA acuannya lewat `row_id`. Tanpa itu, Sentinel
  anti-dobel usulan buta di versi Perubahan.

  Mapper ini **tidak boleh jadi salinan ketiga daftar kolom.**
  `pergeseranKeTahunBaruInput` ([row-map.ts:165](../lib/blud/row-map.ts:165))
  dipecah jadi `pergeseranKeDpaInput` (jangkar dibawa) dan pembungkus Tahun Baru
  yang melepas jangkar. Hasilnya satu daftar kolom untuk dua pemakai, sebab kolom
  yang lupa didaftar terbuang tanpa suara.

### 6.2 Modal: tampilkan akibatnya, jangan bertanya "yakin?"

Pelajaran Sinkronkan DPA (L82b) berlaku: bandingkan dulu, baru tampilkan.
Modal "Buat DPA Perubahan" memuat kedua sumber berdampingan: tanggal, jumlah
baris, total akar, lalu **bedanya** (memakai ulang `bedaSinkron`, per `row_id`,
hanya uang):

- rekening yang angkanya berbeda antara kedua pilihan, beserta nominalnya;
- baris yang **lahir di pergeseran** (tidak ada di DPA). Dengan pilihan 1 baris ini
  hilang, dan kalau sudah ada realisasinya, Simpan pasti ditolak. Sebutkan
  rekening dan nominalnya **di modal**;
- rekening yang dengan pilihan 1 akan jatuh di bawah terserap (contoh B di §1);
- kalau DPA direvisi **sesudah** pergeseran terakhir tanpa disinkronkan, modal
  menyebutnya, karena di keadaan itulah kedua pilihan berbeda lebih dari sekadar
  geseran;
- kalau pergeseran terakhir disimpan sebagai **draft tak berimbang** (route
  mengizinkan `draft=true`), modal menyebut selisihnya.

Kalau kedua sumber identik (belum pernah ada pergeseran, atau isinya sama), modal
cukup berbunyi "sama", tanpa pilihan yang tidak bermakna.

### 6.3 Bawaan

Bawaan adalah **sumber yang sedang jadi pagu** (`getPaguSumber`), diberi label
"(pagu yang berlaku sekarang)". Biasanya ini pergeseran terakhir. Alasannya: angka
"sebelum perubahan" di dokumen seharusnya angka yang benar-benar berlaku menjelang
perubahan, dan realisasi berdiri di atas angka itu.

## 7. Alur — berhenti di FORM (L78/L80/L82)

Tombol **Buat DPA Perubahan** di layar DPA, di samping Salin Versi:

1. Modal §6 mengisi **isi layar** (kolom sesudah = basis, kolom sebelum = basis
   untuk pratinjau), menyalakan `belumTersimpan`, dan memasang jejak
   `asalPerubahan = { sumber, versi }`. **Modal tidak menulis apa pun.**
2. Orang menambah, mengurangi, dan menambah rekening di layar seperti biasa.
3. **Simpan** menulis lewat `saveDpa`. `asal_perubahan` ikut di body, lalu di
   **transaksi yang sama** server mengisi kolom sebelum (§5.1) dan menulis baris
   `blud_dpa_perubahan`. Pola ini sama dengan `asal_tutup` → `catatTutupPergeseran`.
   PRIMARY KEY yang menolak pembuatan ganda, bukan SELECT-dulu (L69-a).
4. `asal_perubahan` **wajib dilepas** di setiap jalur yang mengganti isi layar
   (Form Baru, Impor, Salin Versi, Salin Tahun, Pulihkan, Pulihkan Cadangan, ganti
   tahun, ganti periode, buka versi) dan sesudah Simpan berhasil. Kalau tertinggal,
   simpanan berikutnya mencoba membuat Perubahan kedua. Ujinya meniru pemeriksaan
   `asal_berkas` terhadap `asalSalinRef`.

Akibat baik yang didapat tanpa biaya: semua pagar Simpan berlaku otomatis (kunci
optimistik, ambang turun drastis, `pagarSimpanVersi`, kunci setahun L84, audit,
riwayat simpan). Tidak ada endpoint tulis baru, dan izinnya sama dengan
`bolehEditMenu('dpa')` tanpa guard baru.

### 7.1 Sasaran: hari ini, dan hari ini belum punya versi DPA

Perubahan disimpan ke **bulan berjalan**. Sasaran bertanggal lampau akan menjadi
pagu, dan `tolakHistorisJadiPagu` sudah menolak itu. Satu pagar baru, diperiksa
di dalam transaksi dengan `existing` yang dibaca di bawah kunci (pola pagar Tutup
#2):

> **Tanggal sasaran belum boleh berisi versi DPA.**

Tanpa pagar ini, DPA murni yang disimpan tadi pagi akan ditimpa dan berubah jenis
jadi Perubahan. Lebih buruk lagi, pergeseran yang mengacu DPA tadi pagi tiba-tiba
"mengacu Perubahan" dan oleh aturan §8 dianggap pergeseran babak baru. Pagunya
mundur ke geseran lama tanpa satu pesan pun.

Karena versi DPA tidak bisa bertanggal sesudah hari ini dan acuan pergeseran
selalu versi DPA yang ada, satu syarat ini sekaligus menjamin **semua pergeseran
yang sudah ada adalah babak lama**. Akibatnya: kalau hari ini sudah ada simpanan
DPA, Perubahan dibuat besok. Ini sama dengan keputusan L83b (Tutup Pergeseran
"besok atau sesudahnya") yang sudah diterima. Tombolnya dimatikan dengan alasan
yang tertulis di `data-tooltip` (L79c), dan kalimatnya mengikuti bentuk tiga bagian
L83b: masalah, sebab, jalan keluar. Lihat §15 no. 2.

## 8. Aturan pagu baru — bagian paling berbahaya

Hari ini aturannya **"Pergeseran terbaru menang atas DPA terbaru"**, dan tertulis
di **enam tempat**:

| Tempat | Pemakai |
|---|---|
| `getPaguSumber` [pagu.ts:83](../lib/blud/pagu.ts:83) | layar Realisasi, Beranda, Buku Kas |
| `getPaguEfektif` [pagu.ts:102](../lib/blud/pagu.ts:102) | pohon pagu, SPJ Excel, Beranda |
| `getPaguCap` [pagu.ts:264](../lib/blud/pagu.ts:264) | deteksi "pagu berubah" layar Realisasi |
| `paguPenerus` [data.ts:246](../lib/blud/data.ts:246) | pagar hapus versi |
| `versiJadiSumberPagu` [data.ts:346](../lib/blud/data.ts:346) | pagar simpan & pagar historis |
| `bacaPaguTerkunci` [realisasi-data.ts:420](../lib/blud/realisasi-data.ts:420) | pagar tiap transaksi belanja |

**Kalau aturan ini tidak diubah, Perubahan tidak berpengaruh apa pun ke
Realisasi.** Tahun yang sudah punya pergeseran tetap memakai pergeseran lama
sebagai pagu, tanpa galat. Rekening D di §1 tidak punya pagu di mata Buku Kas, dan
tambahan 15 jt di A tidak bisa dibelanjakan. Layar DPA menampilkan 210 jt
sementara Realisasi tetap menghitung terhadap 180 jt.

Aturan baru:

```
M     = versi_mulai Perubahan TERAKHIR tahun itu (tidak ada → −∞)
Pagu  = Pergeseran terbaru yang ACUAN-nya (dpa_versi_tanggal) ≥ M
        → belum ada: DPA terbaru (pasti versi Perubahan, karena semuanya ≥ M)
```

Tanpa Perubahan, M = −∞ dan hasilnya **identik** dengan aturan lama. Kenapa
patokannya **acuan** dan bukan tanggal pergeseran: pergeseran bertanggal hari
Perubahan yang dibuat **sebelum** Perubahan tetap mengacu DPA murni. Ia termasuk
babak lama dan tidak boleh jadi pagu.

**Enam tempat itu disatukan dulu jadi satu fungsi** `sumberPaguTahun(q: Penanya,
tahun)` yang memulangkan `{ tabel, versi }`. Penanya ikut supaya fungsi ini bisa
dipakai di dalam transaksi (L69-b). Ini **Tahap 0**, tanpa perubahan perilaku,
dikerjakan dan diuji sebelum Perubahan ada (L78: satu aturan, satu tempat).
Mengubah enam salinan rumus satu per satu adalah cara L69 lahir.

`PaguSumber` dapat nilai baru `'PERUBAHAN'` (+ nomor ke-n), supaya Realisasi dan
Beranda berbunyi "Pagu dari DPA Perubahan ke-1 · 9 Okt 2026", bukan sekadar "DPA".

## 9. Pergeseran sesudah Perubahan

- **Pagar baru di `savePergeseran`**: pergeseran bertanggal ≥ M wajib mengacu DPA
  ≥ M, kalau tidak ditolak `PERGESERAN_ACUAN_SEBELUM_PERUBAHAN`. Route juga punya
  cadangan `dpa_versi_tanggal || getDpaLatestDate`
  ([pergeseran/route.ts:157](../app/api/blud/pergeseran/route.ts:157)), dan
  pagarnya berlaku untuk jalur itu juga.
- **Layar Pergeseran membuka versi babak lama** (pergeseran terakhir masih mengacu
  DPA murni). Spanduk: "DPA Perubahan berlaku sejak 9 Okt 2026. Pergeseran ini
  mengacu DPA sebelum perubahan dan tidak lagi menentukan pagu. Tekan **Buat
  Pergeseran** untuk memulai dari DPA Perubahan."
- **Buat Pergeseran** sudah menarik DPA berlaku, jadi isinya otomatis dari
  Perubahan dengan `vol_p = vol`. Yang perlu diubah cuma kuncinya:
  `alasanKunciBorongan`
  ([pergeseran-client.tsx:1902](../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx:1902))
  mengecualikan versi babak lama. Tanpa pengecualian itu, tombol satu-satunya jalan
  keluar terkunci justru di keadaan yang membutuhkannya. Tidak perlu tombol baru.
- **Sinkronkan DPA pada versi babak lama dimatikan.** `injectDpaKePergeseran`
  mempertahankan `vol_p`/`harga_p` baris yang "sudah digeser", jadi geseran lama
  ditempel kembali di atas angka Perubahan. Ini L82b lewat pintu lain.
- **Tutup Pergeseran babak lama** sasarannya ≥ M dengan acuan < M, sehingga sudah
  tertolak pagar pertama. Kalimat penolakannya menyebut Buat Pergeseran.
- Sasaran pergeseran pertama babak baru tidak boleh sudah berisi versi pergeseran
  (pagar sasaran yang sama dengan Tutup #2). Pergeseran babak lama yang disimpan
  di hari yang sama dengan Perubahan berarti pergeseran pertama babak baru dibuat
  besok.

## 10. Kenapa realisasi tidak terganggu

- `anggaran_key` ikut dari basis di **kedua** pilihan, jadi alokasi Buku Kas tetap
  menempel di baris yang sama.
- Pagu turun di bawah terserap atau baris berealisasi hilang ditolak
  `pagarSimpanVersi`. Pagar ini sudah ada, berjalan di bawah kunci pagu, dan aktif
  karena Perubahan menjadi sumber pagu menurut §8.
- **Baris basis tidak dihapus, tetapi dinolkan.** Di babak Perubahan, aksi hapus
  pada baris yang punya kolom sebelum mengosongkan vol/harga-nya. Dokumen lalu
  berbunyi "Rp X → Rp 0, berkurang X", tidak lenyap dari daftar. Baris yang lahir
  di Perubahan tetap bisa dihapus biasa. Bonusnya, jangkar realisasi tidak pernah
  hilang lewat jalur ini.

## 11. Layar DPA di babak Perubahan

- Daftar versi dan pil versi diberi lencana **MURNI** / **PERUBAHAN KE-n**
  (pola `catatanVersi` di layar Pergeseran).
- Kalau versi yang dibuka **atau** sasaran Simpan ada di babak Perubahan, muncul
  kolom hanya-baca **Sebelum (Vol · Harga · Jumlah)** dan **Bertambah/(Berkurang)**.
  Baris total: "Sebelum Rp 180 jt → Sesudah Rp 210 jt (+30 jt)".
- Form Baru dan Impor tetap terkunci (`alasanKunciBorongan`), karena keduanya
  membawa baris tanpa jangkar dan tanpa kolom sebelum.
- Salin Versi di babak Perubahan hanya menawarkan sumber **dari babak yang sama**.
  Menyalin versi murni ke slot Perubahan menghapus kolom sebelum (dan tetap
  tertolak §5.1-3).
- Pulihkan dan Pulihkan Cadangan: Zod kolom sebelum **opsional** karena 50 foto
  riwayat dan cadangan Drive lahir sebelum kolom ini ada. Pelajaran L86: kalau
  diwajibkan, seluruh riwayat jadi tak terpakai.

## 12. Cetak & impor

- Excel/PDF versi Perubahan memakai tata letak dokumen perubahan:
  Kode · Uraian · **Sebelum** (Vol · Satuan · Harga · Jumlah) · **Sesudah** (Vol
  · Satuan · Harga · Jumlah) · Bertambah/(Berkurang) · PJ · Ket. Bentuknya hampir
  sama dengan `buatWorkbookPergeseran` (14 kolom), jadi pembangunnya dipakai ulang
  dengan kop berbeda. Judul dan susunan kolom akhir **menunggu contoh berkas** yang
  biasa dipakai kantor (§15 no. 5).
- **Impor DPA menolak berkas Perubahan**, seperti `BerkasPergeseranError` menolak
  Excel Pergeseran. Kalau tidak, pembaca kolom memilih salah satu dari dua kolom
  "Vol", dan berkas unduhan sendiri terbaca salah (§3.10 konsep impor).
- Salin Tahun dari tahun yang berakhir di Perubahan memakai angka **sesudah**.
  `dpaKeTahunBaruInput` mendaftar kolomnya satu per satu, jadi kolom sebelum tidak
  terbawa dan tahun baru lahir murni. Ini dijaga uji.

## 13. Perubahan kedua dalam setahun

Strukturnya sudah mendukung: penanda kedua `M2 > M1`, basis dipilih lagi, dan
kolom sebelum diisi ulang dari basis saat itu. Tidak ada batas buatan. Kalau
kantor memastikan perubahan cuma sekali setahun, satu pagar cukup menolak penanda
kedua (§15 no. 4).

## 14. Yang sengaja TIDAK dikerjakan

- **Tabel terpisah** untuk Perubahan (§3).
- **Kolom sebelum lewat JOIN** ke versi sumber (§5).
- **`versi_tanggal` = tanggal penetapan lampau.** Itu menjadikan entri historis
  sebagai pagu, dan sudah ditolak `tolakHistorisJadiPagu`. Tanggal/nomor penetapan
  cukup jadi `catatan` penanda untuk kop cetak.
- **Impor Excel langsung jadi Perubahan.** Bisa jadi tahap lanjut, tetapi berkas
  luar tidak membawa jangkar, jadi kolom sebelum harus dicocokkan lewat kode/uraian.
  Itu tebakan, dan tebakan di kolom sebelum menghasilkan dokumen resmi yang salah.
- Sinkron ke E-Anggaran/Kinerja. Modul itu punya versi MURNI/PERUBAHAN sendiri.

## 15. Keputusan yang dibutuhkan

1. **Bawaan pilihan sumber** = sumber pagu yang berlaku sekarang (biasanya
   pergeseran terakhir), dengan pilihan DPA terkini tetap tersedia. Setuju?
2. **Hari yang sudah punya simpanan DPA** → Perubahan dibuat besok (§7.1).
   Alternatifnya menimpa simpanan hari itu dengan syarat tak ada pergeseran yang
   mengacunya: lebih longgar, tetapi aturannya bersyarat dan lebih sulit
   dijelaskan. Rekomendasi: besok.
3. **Baris lama dinolkan, tidak dihapus** di babak Perubahan (§10). Setuju?
4. **Perubahan lebih dari sekali setahun** boleh, atau dibatasi satu?
5. **Nama dan dokumen**: di layar "DPA Perubahan"? Judul cetaknya apa? Mohon
   contoh berkas Excel/PDF dokumen perubahan yang biasa dipakai, supaya susunan
   kolomnya mengikuti yang sudah dikenal, bukan karangan.

## 16. Tahapan

| Tahap | Isi | Catatan |
|---|---|---|
| **0** | `sumberPaguTahun` menggantikan 6 salinan aturan pagu | tanpa perubahan perilaku; uji membuktikan hasil identik |
| **1** | migrasi (4 kolom + tabel penanda), `schema-mysql.sql`, Zod, row-map, `saveDpa` + `asal_perubahan`, pagar §5.1 / §7.1 / §9, aturan pagu §8, penanda ikut terhapus | inti data; uji DB balapan dua "Buat Perubahan" bersamaan (pola `test-blud-race-hapus-versi.mjs`) |
| **2** | layar DPA: tombol + modal dua pilihan + kolom sebelum/selisih + lencana + nolkan | verifikasi di aplikasi dengan data 2026 (558 baris) |
| **3** | layar Pergeseran: spanduk babak lama, kunci Buat Pergeseran, Sinkron dimatikan | |
| **4** | Cetak dokumen Perubahan + Impor menolak berkasnya | menunggu §15 no. 5 |

**Definition of Done**: `npx tsx scripts/test-blud-dpa-perubahan.mts` beserta uji
mutasi untuk setiap pagar (pemeriksaan "tidak boleh ada lagi" membuang komentar
dulu, dan kutipan dibuat utuh sampai kurung buka, L82c), `tsc`, `npm run lint --
--max-warnings 0`, suite BLUD lama tetap hijau (`test-blud-tutup-pergeseran`,
`test-blud-salin-versi`, `test-blud-salin-tahun`, `test-blud-riwayat-simpan`,
`test-blud-kunci-versi`, `test-blud-beranda-serapan`), dan satu putaran penuh di
aplikasi: buat Perubahan dari pergeseran → Realisasi membaca pagu baru → Buat
Pergeseran mengacu Perubahan → hapus Perubahan → pagu kembali ke pergeseran lama.
