# CONCEPT — DPA Perubahan (BLUD)

> Status: **KONSEP v3** (2026-10-08) — belum ada kode. Keputusan pemilik tercatat
> di §0; yang masih terbuka di §14.
> Permintaan awal: DPA BLUD punya versi **Perubahan**, yang boleh menambah dan
> mengurangi anggaran sehingga **totalnya berbeda** dari DPA murni.

---

## 0. Keputusan pemilik (2026-10-08)

| # | Keputusan |
|---|---|
| 1 | Satu tombol di layar DPA BLUD — **Jadikan DPA Perubahan** — mengambil **angka yang sedang jadi pagu**: pergeseran terakhir (kolom P dipindah ke kolom DPA), atau DPA terakhir kalau tahun itu belum punya pergeseran. Lalu diberi tanda Perubahan. Tidak ada pilihan sumber di layar. |
| 2 | Tombol **mengisi layar dulu**; yang menyimpan tetap tombol Simpan (§5). |
| 3 | Kolom **Sebelum** ikut dikerjakan, dengan sakelar untuk menyembunyikannya di layar, dan dua format cetak: **Ringkas** (kolom persis DPA murni) dan **Lengkap** (Sebelum · Sesudah · Bertambah/(Berkurang)) (§7). |
| 4 | Impor mengenali jenis berkas sendiri (murni / Perubahan Ringkas / Perubahan Lengkap / Pergeseran) dan bertindak sesuai keadaan (§11). |
| 5 | Impor-balik Excel unduhan PRIMA **ke versi yang sedang terbuka** disediakan sebagai jalur cadangan ("sunting di Excel lalu masukkan lagi"), dengan penjaga (§11.3). |
| 6 | Baris yang sudah ada sebelum Perubahan **dinolkan, tidak dihapus**; baris yang lahir di Perubahan tetap bisa dihapus (§10). |
| 7 | Perubahan **boleh lebih dari sekali** setahun; nomornya ke-1, ke-2, … dari urutan. |
| 8 | Versi pergeseran diberi lencana babak (**MURNI** / **PERUBAHAN KE-n**), hanya di tahun yang punya Perubahan. **Nomor pergeseran berlanjut** setahun, tidak mulai dari 1 lagi (§9). |
| 9 | Realisasi wajib dipagari di setiap jalur (§10). |

## 1. Contoh angka

Pergeseran terakhir: **A 80 · B 70 · C 30** juta (total 180 jt). B sudah terserap
65 jt. Perubahan: A +15 jt, C −10 jt, rekening baru D 25 jt.

Format **Lengkap** (sakelar Sebelum menyala):

| Rekening | Sebelum | Sesudah | Bertambah/(Berkurang) |
|---|---|---|---|
| A | 80 | 95 | +15 |
| B | 70 | 70 | 0 |
| C | 30 | 20 | (10) |
| D | — | 25 | +25 |
| **Total** | **180** | **210** | **+30** |

Format **Ringkas** (sakelar mati): kolom Vol · Satuan · Harga · Jumlah persis DPA
murni, berisi angka Sesudah, dengan label versi **PERUBAHAN KE-1**.

## 2. Bedanya dengan Pergeseran

| | Pergeseran | Perubahan |
|---|---|---|
| Total | wajib berimbang (`PERGESERAN_TIDAK_BERIMBANG`) | boleh naik/turun |
| Disimpan di | `pergeseran_dpa` | `dpa_blud` — Perubahan **adalah** DPA mulai tanggal itu (§3) |
| Sesudahnya | putaran berikutnya | pergeseran berikutnya **mengacu DPA Perubahan** (§9) |

## 3. Perubahan adalah versi DPA, bukan tabel baru

Versi Perubahan ditulis ke `dpa_blud` lewat `saveDpa` yang sudah ada. Pembaca
"DPA mana yang berlaku" otomatis membaca Perubahan tanpa diajari apa pun:

- **Buat Pergeseran** menarik DPA berlaku
  ([pergeseran-client.tsx:1446](../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx:1446)),
  dan **Sinkronkan DPA** memakai `getDpaVersiBerlaku`
  ([inject/route.ts:53](../app/api/blud/pergeseran/inject/route.ts:53));
- Rekap PJ ([rekap-pk-data.ts:35](../lib/blud/rekap-pk-data.ts:35)) dan
  `/dashboard` ([dashboard.ts:147](../lib/data/dashboard.ts:147)) membaca
  `getDpaLatestDate`, sedangkan Salin Tahun membaca `GET /api/blud/dpa?tahun=`.

**Ditolak: tabel `dpa_perubahan` tersendiri.** Setiap pembaca DPA harus diajari
tabel ketiga, dan pembaca yang terlewat tetap membaca DPA murni tanpa galat. Itu
bentuk L69 yang paling sulit ditemukan.

## 4. Tanda Perubahan = tanggal mulai

Tidak ada kolom bendera di tiap baris. Tabel penanda baru, mengikuti pola
`blud_pergeseran_tutup`:

```sql
CREATE TABLE blud_dpa_perubahan (
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  versi_mulai    DATE     NOT NULL COMMENT 'Versi DPA pertama yang berstatus Perubahan',
  sumber_dasar   ENUM('PERGESERAN','DPA') NOT NULL COMMENT 'Tabel asal angka dasar — DPA hanya kalau tahun itu belum punya pergeseran',
  versi_dasar    DATE     NOT NULL COMMENT 'Versi yang diambil — sumber kolom Sebelum',
  dibuat_pada    DATETIME NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  dibuat_oleh    INT          NULL,
  catatan        TEXT         NULL COMMENT 'Opsional: nomor/tanggal penetapan untuk kop cetak',
  PRIMARY KEY (tahun_anggaran, versi_mulai),
  CONSTRAINT fk_bdp_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL
);
```

- **Versi DPA bertanggal ≥ `versi_mulai` adalah versi Perubahan.** Simpanan hari
  berikutnya otomatis ikut berlabel Perubahan. Nomor "ke-n" dihitung dari urutan
  baris tabel ini, tidak disimpan (L55).
- Kenapa tanggal dan bukan bendera per baris: 558 baris satu versi tidak bisa
  saling berbeda pendapat, dan tidak ada jalur tulis (Simpan, Pulihkan, Salin
  Versi, Pulihkan Cadangan, Impor) yang bisa lupa mengisinya.
- **Penanda dibuang bersama versi Perubahan terakhir.** Kalau tidak tersisa satu
  pun versi DPA ≥ `versi_mulai`, penandanya dihapus di transaksi yang sama (pola
  `hapusTutupTerkaitVersi`). Tanpa itu aturan pagu §8 melihat babak Perubahan yang
  tidak punya DPA.

## 5. Tombol "Jadikan DPA Perubahan" — berhenti di FORM

1. Tombolnya di layar DPA, di samping Salin Versi. Sumbernya **yang sedang jadi
   pagu**, ditanyakan ke `sumberPaguTahun` (§8), bukan dihitung ulang di layar:
   pergeseran terakhir, atau DPA terakhir kalau belum ada pergeseran. Untuk Perubahan
   ke-2 dan seterusnya, itu pergeseran terakhir babak Perubahan sebelumnya, atau
   versi Perubahan terakhir. Kalau sumbernya DPA, pemetaannya `dpaKeInput` apa
   adanya (langkah 3–4 hanya untuk sumber pergeseran).
2. Modal menampilkan versi yang akan diambil: jenis, tanggal, jumlah baris, dan
   total. Untuk sumber pergeseran, modal juga menyebut dua keadaan yang perlu
   diketahui sebelum melanjutkan:
   - pergeseran itu disimpan sebagai **draft tak berimbang** (route mengizinkan
     `draft=true`) — selisihnya disebut;
   - DPA direvisi **sesudah** pergeseran itu tanpa disinkronkan — revisi itu tidak
     ikut terbawa.
3. **Lanjutkan** mengisi **isi layar** (bukan menulis DB): `vol ← vol_p`,
   `harga ← harga_p`, `jumlah ← pergeseran`, dengan kode, uraian, PJ, keterangan,
   dan pohon ikut. **`anggaran_key` dibawa**, karena tahunnya dan barisnya sama,
   jadi realisasi tetap menempel. Pergeseran tidak menyimpan jejak usulan
   (`origin`/`usulan_item_id`), jadi jejak itu diambil dari baris DPA acuannya lewat
   `row_id`. Tanpa itu, Sentinel anti-dobel usulan buta di versi Perubahan.
4. Pemetaannya **bukan salinan ketiga daftar kolom**. `pergeseranKeTahunBaruInput`
   ([row-map.ts:165](../lib/blud/row-map.ts:165)) dipecah jadi
   `pergeseranKeDpaInput` (jangkar dibawa) dan pembungkus Tahun Baru yang melepas
   jangkar. Kolom yang lupa didaftar terbuang tanpa suara.
5. Orang menambah, mengurangi, dan menambah rekening di layar, lalu menekan
   **Simpan**. Body membawa `asal_perubahan = { versi_dasar }`. Di **transaksi yang
   sama** server menulis baris `blud_dpa_perubahan` (pola `asal_tutup` →
   `catatTutupPergeseran`). PRIMARY KEY yang menolak pembuatan ganda, bukan
   SELECT-dulu (L69-a).
6. `asal_perubahan` **wajib dilepas** di setiap jalur yang mengganti isi layar
   (Form Baru, Impor, Salin Versi, Salin Tahun, Pulihkan, Pulihkan Cadangan, ganti
   tahun, ganti periode, buka versi) dan sesudah Simpan berhasil. Kalau tertinggal,
   simpanan berikutnya mencoba membuat Perubahan kedua.

Karena yang menulis tetap Simpan, semua pagar yang sudah ada berlaku otomatis:
kunci optimistik, ambang turun drastis, `pagarSimpanVersi`, kunci setahun L84,
audit, dan riwayat simpan. Tidak ada endpoint tulis baru, dan izinnya sama dengan
`bolehEditMenu('dpa')`.

### 5.1 Sasaran: hari ini, dan hari ini belum punya versi DPA

Perubahan disimpan ke bulan berjalan. Satu pagar baru, diperiksa di dalam
transaksi dengan `existing` yang dibaca di bawah kunci (pola pagar Tutup #2):
**tanggal sasaran belum boleh berisi versi DPA.**

Tanpa pagar ini, DPA murni yang disimpan tadi pagi ditimpa dan berubah jenis.
Lebih buruk lagi, pergeseran yang mengacu DPA tadi pagi tiba-tiba "mengacu
Perubahan" dan menurut aturan §8 dianggap pergeseran babak baru. Pagunya mundur
ke geseran lama tanpa satu pesan pun. Karena versi DPA tidak bisa bertanggal
sesudah hari ini, satu syarat ini sekaligus menjamin semua pergeseran yang sudah
ada adalah babak lama.

Akibatnya: kalau hari ini sudah ada simpanan DPA, Perubahan disimpan besok. Ini
sama dengan keputusan L83b (Tutup Pergeseran "besok atau sesudahnya"). Kalimat
penolakannya disusun tiga bagian: masalah, sebab, jalan keluar.

## 6. Kolom Sebelum — milik server

Empat kolom baru di `dpa_blud`, NULL-able: `vol_sebelum`, `satuan_sebelum`,
`harga_sebelum`, `jumlah_sebelum`.

- **Diisi server pada SETIAP Simpan di babak Perubahan**, dari versi dasar
  (`sumber_dasar` + `versi_dasar` di tabel penanda; kolom `pergeseran`/`vol_p`/
  `harga_p` untuk pergeseran, `jumlah`/`vol`/`harga` untuk DPA), dicocokkan lewat
  `anggaran_key`. Isian
  kolom Sebelum dari layar maupun dari berkas **diabaikan**. Akibatnya, jalan masuk
  apa pun (Simpan, impor, Salin Versi, Pulihkan, Pulihkan Cadangan) tidak bisa
  membuat kolom Sebelum salah. Sejumlah penjaga yang dirancang di v1 untuk itu jadi
  tidak perlu.
- Baris yang `anggaran_key`-nya tidak ada di versi dasar (lahir di Perubahan)
  bernilai NULL dan tampil "—". Baris DPA murni juga NULL.
- **Versi dasar dikunci**, baik pergeseran maupun DPA. Menyimpan ulang atau
  menghapusnya ditolak `VERSI_DASAR_PERUBAHAN`, dengan pola yang sama seperti versi
  DPA yang dirujuk pergeseran (`BludVersiDirujukError`). Tanpa kunci ini, kolom
  Sebelum di dokumen yang sudah dicetak bisa bergeser pada simpanan berikutnya.
- **Recalc tidak pernah menyentuhnya** (L86).
- **Beku per baris tetap benar walau pohonnya diubah.** Anak baru di bawah induk A
  membuat sesudah-A naik dan sebelum-A tetap. Baris yang dipindah dari induk A ke
  B membuat A "berkurang" dan B "bertambah", dan memang itu yang terjadi. Total
  akar Sebelum = total pergeseran dasar.
- **Bertambah/(Berkurang) tidak disimpan** (`jumlah − jumlah_sebelum`, dihitung saat
  tampil/cetak). Nilai turunan tidak disimpan — presedennya `is_latest` dan L86.

## 7. Tampilan & cetak

- **Lencana versi**: daftar versi dan pil versi berbunyi **MURNI** / **PERUBAHAN
  KE-n** (pola `catatanVersi` di layar Pergeseran).
- **Sakelar "Tampilkan kolom Sebelum"** muncul saat versi yang dibuka atau sasaran
  Simpan ada di babak Perubahan.
  - Nyala: Sebelum (Vol · Harga · Jumlah) + Bertambah/(Berkurang), hanya-baca. Baris
    total berbunyi "Sebelum Rp 180 jt → Sesudah Rp 210 jt (+30 jt)".
  - Mati: kolom persis DPA murni.
  - Pilihannya disimpan di `localStorage` (kenyamanan per orang, dibungkus
    try/catch), bawaannya **nyala**, karena kolom selisih membantu saat menyunting.
- **Cetak versi Perubahan, dua format**:
  - **Ringkas**: tata letak DPA murni. Kopnya berbunyi "DPA PERUBAHAN KE-n" dan
    mencatat tahun, versi, serta angka kunci simpanan (bahan penjaga §11.3).
  - **Lengkap**: Kode · Uraian · Sebelum (Vol · Satuan · Harga · Jumlah) · Sesudah
    (Vol · Satuan · Harga · Jumlah) · Bertambah/(Berkurang) · PJ · Ket. Bentuknya
    hampir sama dengan `buatWorkbookPergeseran`, jadi pembangunnya dipakai ulang.
  - Judul dan susunan kolom akhir menunggu contoh berkas kantor (§14).

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
sebagai pagu, tanpa galat. Layar DPA menampilkan 210 jt, Realisasi tetap
menghitung terhadap 180 jt, dan rekening D tidak punya pagu.

Aturan baru:

```
M     = versi_mulai Perubahan TERAKHIR tahun itu (tidak ada → −∞)
Pagu  = Pergeseran terbaru yang ACUAN-nya (dpa_versi_tanggal) ≥ M
        → belum ada: DPA terbaru (pasti versi Perubahan, karena semuanya ≥ M)
```

Tanpa Perubahan, M = −∞ dan hasilnya **identik** dengan aturan lama. Patokannya
**acuan**, bukan tanggal pergeseran: pergeseran bertanggal hari Perubahan yang
dibuat **sebelum** Perubahan tetap mengacu DPA murni, jadi ia babak lama dan tidak
boleh jadi pagu.

Keenam tempat **disatukan dulu jadi satu fungsi** `sumberPaguTahun(q: Penanya,
tahun)` yang memulangkan `{ tabel, versi }`. Penanya ikut supaya fungsi ini bisa
dipakai di dalam transaksi (L69-b). Ini **Tahap 0**, tanpa perubahan perilaku,
diuji sebelum Perubahan ada (L78: satu aturan, satu tempat). `PaguSumber` dapat
nilai `'PERUBAHAN'` + nomornya, supaya Realisasi dan Beranda berbunyi "Pagu dari
DPA Perubahan ke-1 · 9 Okt 2026".

## 9. Pergeseran sesudah Perubahan

- **Pagar baru di `savePergeseran`**: pergeseran bertanggal ≥ M wajib mengacu DPA
  ≥ M, kalau tidak ditolak `PERGESERAN_ACUAN_SEBELUM_PERUBAHAN`. Pagar ini juga
  berlaku untuk cadangan `dpa_versi_tanggal || getDpaLatestDate`
  ([pergeseran/route.ts:157](../app/api/blud/pergeseran/route.ts:157)).
- **Layar Pergeseran yang membuka versi babak lama** menampilkan spanduk: "DPA
  Perubahan berlaku sejak 9 Okt 2026. Pergeseran ini mengacu DPA sebelum perubahan
  dan tidak lagi menentukan pagu. Tekan **Buat Pergeseran** untuk memulai dari DPA
  Perubahan."
- **Buat Pergeseran** sudah menarik DPA berlaku, jadi isinya otomatis dari
  Perubahan dengan `vol_p = vol`. Yang diubah cuma kuncinya: `alasanKunciBorongan`
  ([pergeseran-client.tsx:1902](../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx:1902))
  mengecualikan versi babak lama. Tanpa pengecualian itu, satu-satunya jalan keluar
  terkunci justru saat dibutuhkan. Tidak perlu tombol baru.
- **Sinkronkan DPA pada versi babak lama dimatikan.** `injectDpaKePergeseran`
  mempertahankan `vol_p`/`harga_p` baris yang "sudah digeser", jadi geseran lama
  akan ditempel kembali di atas angka Perubahan (L82b lewat pintu lain).
- **Tutup Pergeseran babak lama**: sasarannya ≥ M dengan acuan < M, jadi sudah
  tertolak pagar pertama. Kalimat penolakannya menyebut Buat Pergeseran.
- Sasaran pergeseran pertama babak baru tidak boleh sudah berisi versi pergeseran
  (pagar sasaran Tutup #2).
- **Lencana babak** di daftar versi dan pil versi Pergeseran: **MURNI** /
  **PERUBAHAN KE-n**, diturunkan dari acuannya (`dpa_versi_tanggal` ≥ `versi_mulai`),
  tanpa kolom baru. Hanya muncul di tahun yang punya Perubahan; tahun lain tampil
  persis seperti sekarang. **Nomor "Pergeseran ke-n" berlanjut** setahun (keputusan
  #8): dua "Pergeseran ke-1" dalam satu tahun bisa tertukar di surat atau rekap yang
  tidak memuat lencananya.
- **Kop cetak Pergeseran** menyebut acuannya, mis. "mengacu DPA Perubahan ke-1
  (9 Okt 2026)".

## 10. Pagar realisasi (keputusan #9)

Uang yang sudah keluar di Buku Kas tidak boleh kehilangan pagunya, dan tidak boleh
lepas dari rekeningnya, lewat jalur mana pun. Daftar pagarnya — yang **sudah ada**
ditandai, sisanya baru:

| # | Pagar | Menjaga dari | Status |
|---|---|---|---|
| R1 | Aturan sumber pagu disatukan dan sadar Perubahan (§8) | Perubahan tersimpan tapi Buku Kas tetap memakai pagu lama — rekening baru tak bisa dibelanjakan, rekening yang dikurangi tetap bisa dibelanjakan sampai angka lama | baru |
| R2 | `pagarSimpanVersi`: pagu baru < terserap → Simpan ditolak, menyebut rekening dan kurangnya | Perubahan, revisinya, atau impor-balik yang menurunkan pagu di bawah uang terpakai | sudah ada; aktif karena R1 menjadikan Perubahan sumber pagu |
| R3 | `anggaran_key` dibawa dari versi dasar; `periksaJangkar` menolak baris dikenal tanpa jangkar, tidak bisa ditembus `force` | Realisasi lepas dari rekeningnya (jadi yatim) | jangkar dibawa: baru; pemeriksaan: sudah ada |
| R4 | Baris lama dinolkan, tidak dihapus (keputusan #6) | Baris berealisasi lenyap dari dokumen. Kalau baris itu sudah terpakai, menolkannya pun ditolak R2 | baru |
| R5 | Hapus versi Perubahan memeriksa pagu PENERUS (`paguPenerus` lewat R1): pagu kembali ke pergeseran lama, dan rekening yang cuma ada di Perubahan (mis. D) menjadi tanpa pagu → ditolak kalau sudah terserap | Menghapus Perubahan sesudah belanja di rekening D dicatat | pagar sudah ada; penerusnya baru benar sesudah R1 |
| R6 | Pergeseran bertanggal ≥ M wajib mengacu DPA ≥ M (§9) | Pergeseran lama disimpan ulang lalu jadi pagu lagi, membatalkan Perubahan | baru |
| R7 | Kunci setahun (L84) sebagai perintah pertama di jalur simpan/hapus, kunci pagu per rekening urut menaik, pagu dibaca di bawah kunci (`bacaPaguTerkunci` lewat R1) | Transaksi belanja yang commit di sela pemeriksaan dan simpan Perubahan (TOCTOU) | sudah ada; R1 tidak boleh memindahkan pembacaan ke luar transaksi (fungsinya menerima `Penanya`) |
| R8 | **Turunkan paksa** (`turunkan_paksa` + alasan wajib) **ditutup** untuk versi Perubahan | Pagu dokumen Perubahan resmi berada di bawah uang yang sudah terpakai | baru — §14 no. 2 |
| R9 | Sidik pagu `getPaguCap` ikut R1, jadi layar Realisasi yang sedang terbuka tahu pagunya berganti dan menampilkan "Pagu diperbarui" | Orang mencatat belanja terhadap angka lama di layar | sudah ada; terhubung lewat R1 |

**Uji yang menyertainya** (bagian dari Definition of Done §15): uji DB balapan
**transaksi belanja × simpan Perubahan** dan **transaksi belanja × hapus Perubahan**
pada tahun uji 2099, pola `test-blud-race-hapus-versi.mjs` (dijalankan dua kali,
tanpa dan dengan kunci, supaya terbukti pagarnya yang menahan, bukan kebetulan),
plus uji mutasi untuk R1–R8.

Aturan hapus di layar (R4): di babak Perubahan, aksi hapus pada baris yang punya
kolom Sebelum mengosongkan vol/harga-nya, jadi dokumen berbunyi "Rp X → Rp 0" dan
tidak lenyap dari daftar. Baris yang lahir di Perubahan tetap bisa dihapus biasa.
Pagarnya juga di server, bukan cuma tombol (L82): simpanan Perubahan yang membuang
baris ber-Sebelum ditolak.

## 11. Impor

### 11.1 Mengenali berkas

| Berkas | Penandanya |
|---|---|
| Excel Pergeseran | judul `Vol P` + `Harga P` (sudah ada, `berkasPergeseran`) |
| Excel Perubahan **Lengkap** | judul Sebelum dan Sesudah |
| Excel Perubahan **Ringkas** | kop "DPA PERUBAHAN KE-n" (ditulis ekspor, §7) |
| Excel DPA murni / unduhan lama / formulir luar | tidak punya penanda di atas |

Modal impor menyebut hasil bacanya sebelum apa pun diterapkan, misalnya
*"Terbaca: Excel DPA Perubahan ke-1 · unduhan PRIMA · versi 12 Okt 2026 ·
558 baris"*.

### 11.2 Ke periode yang belum punya versi (perilaku impor sekarang)

| Berkas | Tahun belum punya Perubahan | Tahun sudah punya Perubahan |
|---|---|---|
| DPA murni / formulir luar | diimpor seperti sekarang | **peringatan dulu**: "Berkas ini DPA murni. Mengimpornya ke versi Perubahan mengganti angka Perubahan dengan angka murni", lengkap dengan selisih totalnya |
| Perubahan **Ringkas** | ditolak: "Perubahan dibuat lewat tombol Jadikan DPA Perubahan" | diterima |
| Perubahan **Lengkap** | ditolak | ditolak: "unduh format Ringkas lalu impor" |
| Pergeseran | ditolak (sudah) | ditolak |

Format Lengkap ditolak dengan alasan yang sama seperti Excel Pergeseran: dua set
kolom Vol/Harga/Jumlah membuat pembaca bisa mengambil sisi Sebelum, dan angka
Perubahan hilang tanpa terasa. Kolom Sebelum tidak perlu dibaca dari berkas mana
pun — server yang mengisinya (§6).

### 11.3 Jalur cadangan: impor-balik ke versi yang sedang terbuka

Untuk "unduh Excel, sunting di Excel, masukkan lagi". Saat ini Form Baru/Impor
dikunci selama versi tersimpan terbuka (`alasanKunciBorongan`, L79c), karena
keduanya membawa baris **tanpa jangkar**. Excel unduhan PRIMA **membawa jangkar**
(kolom `anggaran_key` di
[dpa-dokumen.ts:302](../lib/blud/export/dpa-dokumen.ts:302)), dan impor sudah
memakai ulang jangkar yang sah (`AK-<32 hex>`, sekali per berkas,
[import-dpa.ts:618](../lib/blud/import-dpa.ts:618)). Sifatnya sama dengan Pulihkan
Cadangan, yang dulu dilepas dari kunci yang sama dengan alasan yang sama
(CONCEPT-blud-cadangan-json §8). Berlaku untuk DPA murni **dan** Perubahan: satu
aturan, bukan dua.

Syarat dan penjaganya:

1. **Hanya Excel unduhan PRIMA** dengan kolom jangkar. Formulir luar tetap lewat
   §11.2.
2. **Jenis harus cocok**: berkas Perubahan ke versi Perubahan, berkas murni ke versi
   murni. Format Lengkap tetap ditolak.
3. **Jangkar harus dikenal**: setiap jangkar di berkas ada di versi yang terbuka.
   Jangkar asing (berkas tahun lain, versi lain, atau sudah disunting tangan)
   membuat berkas ditolak. Baris tanpa jangkar diperlakukan sebagai baris baru.
4. **Berkas basi diperingatkan.** Kop mencatat versi dan angka kunci saat
   diunduh. Kalau versi yang terbuka sudah disimpan lagi sesudahnya, modal berbunyi:
   "Berkas ini diunduh dari simpanan ke-3 (12 Okt). Yang terbuka sekarang simpanan
   ke-5. Suntingan sesudah simpanan ke-3 yang tidak ada di berkas akan tertimpa."
5. **Bandingkan dulu, baru terapkan** (L82b): panel menampilkan baris yang angkanya
   berubah, baris baru, baris yang tidak ada di berkas, dan selisih total. Baris
   yang tidak ada di berkas mengikuti aturan hapus §10. Ambang turun drastis yang
   sudah ada tetap berlaku saat Simpan.
6. **Berhenti di form**: impor hanya mengganti isi layar. Simpan menulis dengan
   angka kunci versi terbuka yang diambil segar (L77), jadi kalau orang lain
   menyimpan di sela, Simpan menjawab 409.
7. **Audit**: `asal_impor` yang sudah ada mendapat penanda `ke_versi_terbuka`,
   supaya baris audit bisa membedakan impor ke periode kosong dari impor yang
   menimpa versi tersimpan.

## 12. Jalur lain yang ikut disesuaikan

- **Salin Versi** di babak Perubahan hanya menawarkan sumber dari babak yang sama.
  Kolom Sebelum tetap aman karena milik server (§6), tapi menyalin angka murni ke
  slot Perubahan hampir pasti salah pencet.
- **Pulihkan / Pulihkan Cadangan**: Zod kolom Sebelum **opsional**, karena 50 foto
  riwayat dan cadangan Drive lahir sebelum kolom ini ada (pelajaran L86).
- **Salin Tahun** dari tahun yang berakhir di Perubahan memakai angka Sesudah.
  `dpaKeTahunBaruInput` mendaftar kolomnya satu per satu, jadi kolom Sebelum tidak
  terbawa dan tahun baru lahir murni. Dijaga uji.

## 13. Yang sengaja TIDAK dikerjakan

- **Tabel terpisah** untuk Perubahan (§3).
- **Formulir luar dijadikan Perubahan.** Berkas luar tidak membawa jangkar, jadi
  barisnya harus dicocokkan lewat kode/uraian. Itu tebakan, dan tebakan yang salah
  membuat realisasi menempel ke rekening keliru atau lepas.
- **`versi_tanggal` = tanggal penetapan lampau.** Itu menjadikan entri historis
  sebagai pagu, dan sudah ditolak `tolakHistorisJadiPagu`. Nomor/tanggal penetapan
  cukup jadi `catatan` penanda untuk kop cetak.
- Sinkron ke E-Anggaran/Kinerja. Modul itu punya versi MURNI/PERUBAHAN sendiri.

## 14. Masih terbuka

1. **Contoh berkas dokumen perubahan** yang biasa dipakai kantor, untuk judul dan
   susunan kolom cetak format Lengkap. Tidak menghalangi Tahap 0–3.
2. **R8 — turunkan paksa ditutup untuk Perubahan?** Jalur Simpan DPA/Pergeseran
   sekarang punya pintu darurat: pagu boleh diturunkan di bawah uang terpakai asal
   alasannya ditulis (masuk audit). Usulan: pintu itu **ditutup** untuk versi
   Perubahan, karena dokumen Perubahan yang sah tidak pernah menganggarkan kurang
   dari yang sudah dibelanjakan. Kalau realisasinya yang salah catat, yang
   dibetulkan Buku Kasnya dulu. Kalau ditutup dan ternyata ada kasus sah yang
   terhalang, pintunya bisa dibuka lagi tanpa membongkar apa pun.

## 15. Tahapan

| Tahap | Isi | Catatan |
|---|---|---|
| **0** | `sumberPaguTahun` menggantikan 6 salinan aturan pagu | tanpa perubahan perilaku; uji membuktikan hasil identik |
| **1** | migrasi (4 kolom + tabel penanda), `schema-mysql.sql`, Zod, `pergeseranKeDpaInput`, `saveDpa` + `asal_perubahan`, pengisian Sebelum oleh server, pagar §5.1 / §6 / §9, aturan pagu §8, penanda ikut terhapus | inti data; uji DB balapan dua pembuatan bersamaan (pola `test-blud-race-hapus-versi.mjs`) |
| **2** | layar DPA: tombol + modal + kolom Sebelum + sakelar + lencana + aturan hapus | verifikasi di aplikasi dengan data 2026 (558 baris) |
| **3** | layar Pergeseran: spanduk babak lama, kunci Buat Pergeseran, Sinkron dimatikan | |
| **4** | Cetak Ringkas/Lengkap + kop penanda + impor §11.1–11.2 | menunggu §14 no. 1 untuk tata letak Lengkap |
| **5** | impor-balik ke versi terbuka §11.3 | jalur cadangan |

**Definition of Done**: `npx tsx scripts/test-blud-dpa-perubahan.mts` beserta uji
mutasi untuk setiap pagar (pemeriksaan "tidak boleh ada lagi" membuang komentar
dulu, kutipan utuh sampai kurung buka — L82c), `tsc`, `npm run lint --
--max-warnings 0`, suite BLUD lama tetap hijau (`test-blud-tutup-pergeseran`,
`test-blud-salin-versi`, `test-blud-salin-tahun`, `test-blud-riwayat-simpan`,
`test-blud-kunci-versi`, `test-blud-beranda-serapan`, `test-blud-impor-bolak-balik`),
dan satu putaran penuh di aplikasi: Jadikan DPA Perubahan → Simpan → Realisasi
membaca pagu baru → Buat Pergeseran mengacu Perubahan → unduh Ringkas, sunting,
impor-balik → hapus Perubahan → pagu kembali ke pergeseran lama.
