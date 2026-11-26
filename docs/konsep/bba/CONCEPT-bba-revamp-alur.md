# Konsep FINAL: Revamp alur Buku Besar Aset

Status: **KONSEP FINAL** (2026-11-26), menunggu "eksekusi".
Arah tampilan yang dipilih pemilik: **tabel bertahap (A) + lembar keputusan anggaran (D)**, dengan pagu yang bisa diambil dari DPA/Pergeseran BLUD.
Ditambah menu **Penawaran Rekanan** (§5A) serta **Excel seragam + salinan otomatis ke Google Drive** (§5B). Tahap 1–4 & 6 nol migrasi. Tahap 5 (Penawaran) butuh satu migrasi (2 tabel + 1 kolom).

---

## 0. Keluhan yang dijawab

1. Alur di luar menu Buku Aset membingungkan. Contohnya, menandai **didanai** baru bisa sesudah mencentang baris, karena bilah tombolnya baru muncul setelah itu.
2. Tombol tidak menyebut langkah berikutnya. Di Pengadaan ada satu tombol bulat yang isinya *select* status, dan "Dalam Proses" tidak terbaca sebagai "sudah dipesan".
3. Data uji tidak bisa dihapus, "bahkan dari database".
   - Kasus nyata di server kantor: BBA-000003 "laptop" berstatus **Dalam Proses**, belum ada penerimaan maupun register.
   - Hapus item hanya boleh untuk status Direncanakan.
   - Jalan mundurnya (ubah status ke Direncanakan) tersembunyi di *select* modal Proses.
   - Barang "Laptop" ikut terkunci karena masih ditunjuk rencana itu (FK `RESTRICT`, galat 1451). Pagar ini sengaja dipasang, bukan bug.

Rantai data dan pagarnya:

```
bba_barang ◄─RESTRICT─ buku_besar_aset ◄─RESTRICT─ bba_penerimaan ◄─RESTRICT─ bba_aset (register)
                        (rencana)          (barang datang)                (Tempatkan)
```

## 1. Alur A–Z

| # | Langkah | Siapa (bawaan) | Halaman | Hasil |
|---|---|---|---|---|
| A | Siapkan master **Barang** & **Ruangan** | Umum Aset | Master | daftar jenis barang & ruangan |
| B | **Impor KIB** provinsi (isi awal Buku Aset) | Umum Aset | Buku Aset | register + kondisinya |
| C | Kumpulkan **rencana**: Tarik dari Usulan / Tambah rencana | Perencanaan | Rencana | tahap *Perlu dilengkapi* |
| D | **Lengkapi**: barang, jenis (ganti/tambah/baru/pelihara/rehab), alasan, aset yang diganti, 3 referensi harga | Perencanaan | Rencana | tahap *Siap diputuskan* |
| E | **Putuskan anggaran** di lembar keputusan (Danai / Tidak / Nanti), dibandingkan dengan pagu | Perencanaan | Rencana → tab *Siap diputuskan* | *Didanai* → muncul di Pengadaan |
| F | **Tandai dipesan** (tanggal kontrak/SPK) | Pengadaan | Pengadaan | *Dipesan* |
| G | **Catat barang datang** (boleh bertahap) + unggah BAST/foto | Pengadaan | Pengadaan | *Diterima sebagian / penuh* |
| H | **Catat di Buku Aset**: tempatkan unit ke ruangan; rehab → perbarui kondisi gedung | Umum Aset | Buku Aset | register "belum teregister"; aset lama yang diganti → *siap dihapus* |
| I | **Impor KIB** berikutnya → nomor register provinsi terisi otomatis | Umum Aset | Buku Aset | register resmi |
| J | Perawatan: opname kondisi, pindah ruangan, hapus dengan SK | Umum Aset | Buku Aset | — |
| K | **Cetak**: KIB, KIR, Rekap, BI, daftar Rencana | semua | Cetak | dokumen |
| Z | Tahun berikutnya: rencana *Tidak didanai* ditawarkan lagi → kembali ke C | Perencanaan | Rencana | — |

Kalimat pengingat: **rencanakan → putuskan → pesan → terima → catat.**

## 2. Prinsip

1. **Satu "Tahap" per item.** Tahap dihitung, tidak disimpan. Aturannya satu fungsi murni `tahapRencana()` di `lib/bba/tahap.ts`, dipakai layar, ringkasan server, dan uji. Masukannya kolom yang sudah ada: `status`, `anggaran`, `usulan_keputusan`, kelengkapan referensi (`perluReferensi`), Σ penerimaan, dan jumlah register ber-`penerimaan_id`.
   - Urutan utama: `Perlu dilengkapi → Siap diputuskan → Didanai → Dipesan → Diterima sebagian → Diterima penuh → Tercatat di Buku Aset`.
   - Cabang di luar urutan utama: `Tidak didanai`, `Batal dibeli` (status Tidak Terealisasi), `Usulan ditolak`.
2. **Tiap baris punya tepat satu tombol langkah berikutnya**, berlabel kata kerja + benda. Aksi lain ada di menu ⋯ baris itu.
3. **Tombol yang tidak bisa dipakai menunjuk jalan keluarnya.** Bentuknya tombol/tautan ke langkah yang harus dikerjakan dulu, bukan sekadar tooltip (§5).
4. **Tidak ada aksi yang tersembunyi di balik centang.**
5. **Satu jalur tulis** (L78). Tombol baru memanggil route yang sudah ada. Sakelar keputusan hanya mengubah isi layar; tombol Simpan yang menulis.
6. Semua tombol utama memakai `PrimaButton` (§3.6). Tooltip memakai `data-tooltip`, bukan `title`.

## 3. Rancangan layar

### 3.1 Pita alur (semua halaman BBA)

Pita ini ada di bawah tab navigasi:

```
1 Rencana: 3 perlu dilengkapi │ 2 Anggaran: 4 menunggu │ 3 Pengadaan: 2 siap dipesan · 1 menunggu barang │ 4 Buku Aset: 2 unit belum dicatat
```

- Tiap kotak adalah tautan ke tab yang tepat.
- Kotak yang punya pekerjaan untuk peran pembaca diberi warna. Kotak lain netral.
- Angkanya dari `GET /api/buku-besar-aset/ringkas-alur?tahun=` (baca saja, dihitung dengan `tahapRencana`).

### 3.2 Halaman Rencana

**Kepala halaman:** judul "Rencana {tahun}", pemilih tahun, dan dua tombol: "+ Tambah rencana" (purple) dan "Tarik dari Usulan" (ghost).

**Tab tahap**, menggantikan tab Semua/Disetujui/Ditolak dan dua *dropdown*:
`Perlu dilengkapi (n) · Siap diputuskan (n) · Didanai (n) · Tidak didanai (n) · Usulan ditolak (n) · Semua`.
Saringan sumber, asal, jenis, dan pencarian pindah ke tombol "Saringan".

**Tab selain "Siap diputuskan" berbentuk tabel:**

| Kolom | Isi |
|---|---|
| Rencana | uraian (tebal) + baris kecil: kode BBA · jenis · jumlah · ref n/3 |
| Nilai | rupiah, lebar tetap, rata kanan, mono |
| Tahap | garis 5 titik + label tahap |
| Langkah berikutnya | satu tombol + ⋯ |

Tombol langkah berikutnya per tahap:

| Tahap | Tombol |
|---|---|
| Perlu dilengkapi | "Lengkapi referensi n/3" / "Pilih barang" / "Pilih jenis" (yang pertama kurang) |
| Didanai | "Lihat di Pengadaan →" |
| Dipesan / Diterima | "Lihat di Pengadaan →" |
| Diterima, belum dicatat | "Lihat di Buku Aset →" |
| Tidak didanai | ⋯ "Ajukan lagi tahun depan" (saran tahun lalu yang sudah ada) |

Menu ⋯ berisi: Ubah, Bukti dukung, Riwayat dan batalkan (§5.1), dan Hapus (atau "Cara menghapus…" bila belum boleh).

**Tab "Siap diputuskan" = lembar keputusan anggaran (konsep D):**

- **Kartu pagu** di atas daftar (§4):
  - sumber pagu, angka pagu, bilah, dan teks "Sudah didanai X + pilihan ini Y · sisa pagu Z";
  - bilah merah dengan kalimat "melebihi pagu Rp …" bila pilihan melewati pagu. Ini **peringatan, bukan penolakan**: anggaran bisa ditambah lewat Perubahan.
- **Daftar dikelompokkan per jenis rencana.** Kepala kelompok berisi jumlah rencana dan total nilai.
- **Tiap baris** berisi uraian + keterangan (jumlah, yang diganti/dimiliki, ref n/3), nilai, garis tahap, dan **sakelar tiga posisi Danai / Tidak / Nanti**. "Nanti" berarti `BELUM` dan menjadi bawaan.
- Baris yang **belum lengkap** tetap tampil, tetapi redup dan tanpa sakelar. Gantinya tombol "Lengkapi …", jadi rencana tanpa referensi tidak bisa terdanai tanpa disadari. Rencana *Didanai* tidak tampil di tab ini.
- Pilihan yang berbeda dari yang tersimpan diberi **titik oranye**.
- **Bilah lengket di bawah** muncul begitu ada perubahan: "n keputusan belum disimpan · a didanai (Rp …), b tidak", dengan tombol **Batal** (ghost) dan **Simpan keputusan (n)** (primary).
- Pindah tab, ganti tahun, atau keluar halaman saat ada pilihan belum tersimpan → ditanya dulu. Caranya: pengingat belum-tersimpan yang sudah ada (`useIngatkanBelumTersimpan`), dan layarnya didaftarkan di `test-keluar-belum-tersimpan.mts`.
- Tombol "Putuskan anggaran" dan "Pilih banyak" dari rancangan sebelumnya **dibuang**, karena tab ini sendiri adalah tempat memutuskan. Borongan cukup lewat kepala kelompok: "Danai semua di kelompok ini".

**Mengembalikan keputusan:** di tab *Didanai* atau *Tidak didanai*, menu ⋯ berisi "Kembalikan ke belum diputuskan". Aturan `alasanTakBisaUbahAnggaran` tetap berlaku. Rencana yang sudah dipesan tidak bisa dicabut, dan kalimatnya menunjuk "Batalkan pesanan dulu di Pengadaan".

**Modal item** tetap tiga tab (Data · Referensi · Bukti). Kepalanya ditambah garis tahap dan tombol langkah berikutnya.

### 3.3 Halaman Pengadaan

**Tab:** `Siap dipesan · Dipesan · Diterima sebagian · Selesai · Batal dibeli`.

*Select* status di modal Proses **dibuang**, diganti tombol eksplisit per tahap:

| Tahap | Tombol utama | Menu ⋯ |
|---|---|---|
| Siap dipesan | **Tandai dipesan** (isian: tanggal kontrak/SPK) | Tidak jadi dibeli |
| Dipesan | **Catat barang datang** | Batalkan pesanan (→ Siap dipesan) |
| Diterima sebagian | **Catat barang datang (sisa n)** | — |
| Diterima penuh, belum dicatat | **Lihat di Buku Aset →** | — |
| Batal dibeli | **Pesan lagi** | — |

Modal Proses dipecah jadi dua modal kecil, **Tandai dipesan** dan **Catat barang datang**. Unggah BAST/foto ada langsung di modal "Catat barang datang". Daftar penerimaan dan hapus penerimaan pindah ke panel Riwayat dan batalkan (§5.1). Route yang dipakai tetap `PATCH /proses` dan `POST /pengadaan`.

### 3.4 Buku Aset

Antrean "barang datang, belum dicatat" naik ke **paling atas** dengan judul "Menunggu dicatat (n unit)". Tiap baris punya tombol **Catat di Buku Aset** (Tempatkan), atau **Perbarui kondisi gedung** untuk rehab. Bagian lain halaman tidak berubah.

### 3.5 Tombol Menu pindah ke lencana profil (semua modul)

**Diputuskan pemilik: seragam.**

- `UserBadge` (komponen bersama) mendapat butir pertama **Menu aplikasi** (ikon `LayoutGrid`) di atas Ganti Password.
- Pindahnya lewat `bolehTinggalkanHalaman()` supaya pengingat belum-tersimpan tetap berbunyi.
- Tombol Menu di FloatingDock dibuang di **BBA, Dashboard (2 layar), IKI (2), dan LKJIP (2)**. Dock tinggal berisi bagian modul + aksi halaman.

### 3.6 Bahasa & warna tombol

| Aksi | Contoh label | `PrimaButton` |
|---|---|---|
| Tambah | "+ Tambah rencana" | purple |
| Simpan isian / keputusan | "Simpan", "Simpan keputusan (n)" | primary |
| Langkah maju positif | "Danai", "Tandai dipesan", "Catat barang datang", "Catat di Buku Aset" | success |
| Keputusan negatif | "Tidak didanai", "Tidak jadi dibeli" | danger |
| Mundur satu langkah | "Batalkan pesanan", "Kembalikan ke …" | warning |
| Batal dialog / navigasi | "Batal", "Lihat di Pengadaan →" | ghost |

Sakelar Danai/Tidak/Nanti bukan `PrimaButton`, melainkan kontrol segmen. Posisi aktif memakai token yang sama: Danai = `#1D9E75`, Tidak = `#E24B4A`, Nanti = netral. Angka rupiah selalu mono dengan lebar kolom tetap.

## 4. Pagu di lembar keputusan

### 4.1 Sumber pagu (dipilih di kartu pagu)

| Pilihan | Angka | Keterangan di layar |
|---|---|---|
| **Yang berlaku sekarang** (bawaan bila tersedia) | sumber pagu BLUD tahun itu menurut `sumberPaguTahun` | "Pergeseran 31 Okt 2026 · DPA Perubahan ke-1" / "DPA murni 29 Agu 2026" |
| **DPA BLUD terbaru** | versi DPA terakhir tahun itu (murni atau Perubahan) | "DPA Perubahan ke-1 · 15 Okt 2026" |
| **Pergeseran terbaru** | versi pergeseran terakhir, kolom `pergeseran` (pasca-geser) | "Pergeseran 31 Okt 2026 (mengacu DPA Perubahan ke-1)" |
| **Ketik sendiri** | angka yang diketik | "Diketik, tidak disimpan" |

- Angka DPA/Pergeseran = **total belanja modal**. Itu adalah Σ jumlah baris "akar belanja modal": baris yang `kode_rekening`-nya berawalan `5.2` sementara induknya tidak. Contoh DPA 2026: cabang `5.2.02` = Rp 17.514.900.000, dan `5.2.03` yang tersimpan sebagai anak `5.2.02` tidak dihitung dua kali. Bila tidak ada baris berkode `5.2`, dipakai baris ber-uraian "BELANJA MODAL" teratas. Aturannya fungsi murni `paguBelanjaModal(rows)` di `lib/bba/pagu.ts`.
- **Pagu BLUD hanya dibandingkan dengan rencana bersumber BLUD.** Kartu pagu punya pemilih sumber dana (BLUD · APBD · DAK · Lainnya · Semua). APBD/DAK/Lainnya hanya bisa diketik. Kalau dipilih "Semua", pagu harus diketik.
- Tahun pagu = tahun rencana. DPA tahun itu belum ada (lazim: rencana 2027 disusun di 2026) → kalimat "DPA BLUD 2027 belum ada — ketik pagu sendiri", dan pilihan DPA/Pergeseran mati beserta sebabnya.
- Pilihan sumber dan angka ketikan diingat per peramban (`localStorage` ber-try/catch, kunci per tahun). Tidak disimpan ke server: pagu ini alat bantu memutuskan, bukan data anggaran. Data anggarannya tetap DPA.

### 4.2 Route baca pagu

`GET /api/buku-besar-aset/pagu-blud?tahun=&jenis=berlaku|dpa|pergeseran`:
- **Pagar:** izin LIHAT bagian Rencana BBA + sakelar BBA. Jalan ini disengaja: pemegang Rencana BBA belum tentu punya akses modul BLUD, dan route ini hanya memulangkan **angka total belanja modal + label versi**, bukan baris DPA. Bila sakelar BLUD sedang mati (`modulSedangMati`), jawabannya "tidak tersedia" dan layar jatuh ke Ketik sendiri.
- **Bacaan:** satu `sumberPaguTahun` / `getDpaVersiBerlaku` / `getPergeseranVersiBerlaku`. Jangan menulis `MAX(versi_tanggal)` sendiri (aturan `sumber-pagu.ts`). Label babak lewat `jenisSumberPagu`/`catatanBabak`.
- Hasilnya: `{ tersedia, nilai, label, versi, tabel }`. Tanpa audit (bacaan angka ringkas, seperti Beranda).

### 4.3 Hitungan di kartu

- **Sudah didanai** = Σ `anggaran_nilai` rencana tahun itu yang tersimpan DIDANAI, sesuai sumber dana terpilih (sudah ada di data daftar).
- **Pilihan ini** = Σ nilai rencana yang sakelarnya berubah ke Danai, dikurangi yang berubah dari Didanai.
- **Sisa** = pagu − keduanya.

Hitungan ini fungsi murni `hitungKartuPagu()` di `lib/bba/pagu.ts`, dipakai kartu dan diuji.

### 4.4 Per rekening (opsional, tahap akhir)

Rencana yang punya `kode_rekening` bisa dibandingkan dengan pagu rekening itu di DPA (mis. "Belanja modal Personal computer" Rp 162,5 jt). Ini hanya tampil sebagai baris kecil di kartu bila ada rencana berkode. Data rencana saat ini **belum ada yang berkode rekening** (dev: 0 dari 3), jadi bagian ini menunggu kebiasaan pengisian kode.

## 5. Mundur & hapus yang jelas

### 5.1 Panel "Riwayat dan batalkan" per item

Panel ini dibuka dari menu ⋯ di Rencana dan Pengadaan. Isinya tangga tahap, langkah terbaru di atas:

```
✓ Dicatat di Buku Aset (n register)   [Batalkan penempatan]
✓ Diterima n/m  (tgl · BAST)           [Hapus penerimaan …]    ← mati: "batalkan penempatan dulu"
✓ Dipesan (tgl)                        [Batalkan pesanan]       ← mati: "hapus penerimaan dulu"
✓ Didanai (tgl · oleh)                 [Kembalikan ke belum diputuskan]
✓ Dibuat (tgl · asal)                  [Hapus item]
```

- Hanya **langkah teratas** yang hidup. Tombol yang mati menyebut langkah yang harus dibatalkan lebih dulu.
- Semua tombol memanggil route & aturan yang **sudah ada** (`ubahStatusProses`/`alasanTolakProses`, hapus penerimaan + `bolehKoreksiMundur`, `batalTempatkan`, `alasanTakBisaHapus`). Panel ini menyatukan **tampilannya**, bukan aturannya.
- Tombol **Hapus** yang belum boleh, di tabel maupun menu, menjadi "Cara menghapus…" yang membuka panel ini.
- Kasus BBA-000003 jadi dua klik: "Batalkan pesanan", lalu "Hapus item".

### 5.2 Hapus data salah input sekali jalan (khusus Admin)

Route `POST /api/buku-besar-aset/hapus-berantai`, izin `bolehBatalkanFinal` (Admin/SA), diperiksa di route DAN di data layer.

**Yang dihapus dalam SATU transaksi:** item + penerimaan + register hasil Tempatkan + aset sasaran rencana itu.

**Ditolak bila** (kalimatnya menyebut penyebabnya):
- ada register yang **sudah bernomor KIB provinsi**, karena sudah masuk buku resmi (kosongkan registernya dulu);
- ada register yang riwayatnya lebih dari TERIMA (dicek, dipindah, dihapus SK), atau yang jadi sasaran rencana lain / gedung ruangan (syarat sama dengan `alasanTakBisaGabung`);
- ada penerimaan `pindahan` (data lama migrasi).

**Syarat dan jejaknya:**
- Alasan wajib, minimal 10 huruf.
- Yang diketik untuk konfirmasi adalah **kode BBA-nya** (L76).
- Audit `BBA_RENCANA_HAPUS_BERANTAI` menyimpan potret item, penerimaan, dan register.
- Berkas di Drive tetap ada.

**Urutan di dalam transaksi:** rencana `FOR UPDATE` → penerimaan → register (urut id), sama dengan urutan Tempatkan supaya tidak saling mengunci (L84). Lalu `UPDATE bba_lokasi SET gedung_aset_id = NULL`, `asal_rencana_id = NULL` pada salinan tahun berikut, dan DELETE dari hilir ke hulu (urutan yang sama dengan skrip SQL kantor 2026-11-26, yang sudah dicoba).

Ini pengecualian ketiga dari §10 butir 4 `CONCEPT-bba-buku-aset.md`. Batasnya disengaja: hanya catatan yang **belum keluar dari PRIMA**.

### 5.3 Master Barang

Hapus barang yang masih dipakai saat ini cuma menolak dengan jumlah. Sesudah revamp, kalimatnya menyebut **siapa** pemakainya (≤ 5 kode BBA/register, tiap kode berupa tautan), plus pilihan **Gabungkan ke barang lain** yang sudah ada.

## 5A. Menu baru: Penawaran Rekanan (desain 1 + 2, dipilih pemilik)

Penawaran ini adalah **gudang penawaran** dari rekanan (alkes, komputer, mebel, apa saja). Tujuannya jadi bahan referensi harga dan pembanding, supaya harga tidak diketik ulang tiap kali menyusun rencana. Mengetik manual di tab Referensi harga tetap bisa.

### 5A.1 Tampilan

Menu "Penawaran" di bilah tab BBA, di antara Pengadaan dan Master. Ada dua tampilan dari data yang sama:

**Per surat (desain 1, bawaan) — tempat mencatat.**
- Tabel surat penawaran berisi: rekanan · nomor surat · kategori, tanggal surat, berlaku s.d., jumlah item, berkas.
- Baris bisa dibuka untuk melihat item di dalamnya: barang · merk/tipe, spesifikasi, satuan, harga satuan, dan lencana "dipakai n rencana".
- Saringan: cari (rekanan/nomor/barang) dan masa berlaku (Masih berlaku · Semua · Kedaluwarsa).
- Tombol: **+ Catat surat penawaran** (purple) dan **Impor Excel** (ghost).
- Modal "Catat surat penawaran" berisi kepala surat + satu berkas (PDF/foto, ke Drive seperti bukti), lalu tabel item yang bisa ditambah baris. Tiap item dipilih barangnya dari Master Barang (atau "barang baru", sama dengan modal rencana). Satu Simpan menulis surat + semua item dalam satu transaksi.

**Bandingkan (desain 2) — tempat membandingkan.**
- Baris = barang, kolom = rekanan. Kolom bisa digulir mendatar bila rekanan banyak; kolom pertama lengket.
- Sel = harga satuan penawaran **terbaru yang masih berlaku** dari rekanan itu. Klik sel → surat, merk/tipe, spesifikasi, berkas.
- Hijau = termurah yang masih berlaku. Abu-abu = kedaluwarsa, tetap terlihat tetapi tidak ikut rata-rata dan tidak bisa jadi termurah.
- Kolom akhir: rata-rata (yang berlaku) dan jumlah penawaran.
- Dibandingkan hanya bila **satuannya sama**. Satuan berbeda dipisah jadi baris "Laptop (paket)" vs "Laptop (unit)", tidak dicampur.
- Item yang belum ditautkan ke barang dikumpulkan di kelompok "Belum ditautkan", dengan tombol "Tautkan ke barang".
- Saringan kategori + Unduh Excel.

Aturan "terbaru yang berlaku", "termurah", "rata-rata", dan "kedaluwarsa" adalah fungsi murni `lib/bba/penawaran.ts`, dipakai tampilan Bandingkan, pemilih di modal rencana, unduhan, dan uji.

### 5A.2 Dipakai di rencana

Tab **Referensi harga** di modal rencana mendapat tombol **Ambil dari penawaran** di samping "+ Ketik manual":
- Daftar penawaran untuk **barang rencana itu** (termurah di atas, kedaluwarsa bertanda) dengan centang, lalu "Pakai n penawaran".
- Yang dipakai **DISALIN** jadi baris referensi: penyedia = rekanan, merk/tipe, harga, tanggal = tanggal surat, berkas = berkas surat. Salinan dipakai karena referensi dibekukan begitu rencana dipesan (`referensiBeku`). Tautan hidup akan mengubah catatan sejarah begitu penawaran disunting.
- Jejaknya kolom `bba_referensi_harga.penawaran_item_id` (soft-FK). Kolom ini hanya untuk lencana "dipakai n rencana" dan tautan "lihat surat". Referensi asal penawaran dihitung sah sama seperti yang diketik (aturan `lib/bba/referensi.ts` tidak berubah).
- Rencana yang barangnya belum dipilih → tombol mati dengan sebab "pilih barang dulu".

### 5A.3 Data (migrasi `migration-bba-penawaran.sql`)

| Tabel / kolom | Isi |
|---|---|
| `bba_penawaran` | `id`, `rekanan` VARCHAR(160), `nomor_surat`, `tgl_surat` DATE, `berlaku_sampai` DATE NULL, `kategori` VARCHAR(80) NULL, `file_id` (soft-FK `uploaded_files`, context `buku_besar_aset`), `catatan`, `version`, `created_by/updated_by/at` |
| `bba_penawaran_item` | `id`, `penawaran_id` FK CASCADE, `barang_id` FK `bba_barang` RESTRICT NULL, `nama_barang` (teks asli surat), `merk_tipe`, `spesifikasi` VARCHAR(500), `satuan`, `harga_satuan` DECIMAL(18,2), `urutan` |
| `bba_referensi_harga.penawaran_item_id` | BIGINT NULL, soft-FK (jejak salinan) |

- Rekanan sengaja teks + saran dari nama yang sudah ada, bukan master baru. Master rekanan bisa menyusul bila ejaannya mulai berantakan.
- Hapus surat boleh walaupun itemnya sudah dipakai, karena referensinya salinan. `penawaran_item_id` dikosongkan di transaksi yang sama, dan referensinya tetap utuh.
- Barang yang dirujuk penawaran ikut dihitung di pesan hapus barang dan di Gabungkan barang (L69). Gabungkan memindah item penawaran juga.
- **Izin:** lihat = semua pemegang BBA; catat/ubah/hapus = EDIT bagian **Rencana** ATAU **Pengadaan** (keduanya menerima penawaran). Pagar di route, sesudah `guard()`, ikut uji C3 `test-bba-peran`, gate G, dan sakelar BBA.
- **Impor Excel** memakai templat seragam (§5B), dibaca lewat `cariBarisKepala`/`barisDataImpor`. Satu berkas = satu surat (kepala surat diisi di modal). Pratinjau dulu, server membaca ulang berkas yang sama saat Simpan (pola impor KIB).

## 5B. Unduh Excel seragam + salinan otomatis ke Google Drive

### 5B.1 Dua berkas

| Berkas | Isi | Format |
|---|---|---|
| **"BBA {tahun} — Rencana s.d. Pengadaan.xlsx"** | satu lembar per menu, urut alur: **Ringkasan** (angka pita alur, pagu & sumbernya) · **Rencana** (semua rencana + tahap + keputusan anggaran) · **Pengadaan** (rencana didanai: dipesan, diterima, nilai) · **Penerimaan** (satu baris per penerimaan: tanggal, jumlah, harga riil, yang dibeli, penyedia) · **Penawaran** (satu baris per item penawaran + surat & masa berlaku) | templat seragam "Resmi berwarna" (`DokTabel` → `tulisTabelExcel`, kop, kepala baris 7, catatan di bawah tabel) |
| **"BBA — Buku Aset (KIB).xlsx"** | Buku Aset, terpisah (sesuai permintaan) | **format provinsi** yang sudah ada (`kib-excel.ts`, satu lembar per golongan A–F). Tidak diubah ke templat seragam, karena bentuk itu harus identik dengan ekspor provinsi |

- Tombol **Unduh Excel** di Rencana, Pengadaan, dan Penawaran mengunduh berkas pertama (semua lembar). Lembar menu yang sedang dibuka diaktifkan saat berkas dibuka.
- Isinya disusun **satu penyusun** `susunBukuRencana(tahun)` (server). Unduhan tombol dan salinan Drive memakai penyusun yang sama, jadi isinya tidak bisa berbeda (L78).
- Izin unduh = izin LIHAT bagian bersangkutan. Lembar Penawaran ikut untuk semua pemegang BBA.

### 5B.2 Folder Drive

- Tujuan baru `bba_laporan` di `DRIVE_TUJUAN`, dengan subfolder **"07 Laporan Buku Besar Aset"** di bawah folder induk Drive terpusat. Isinya satu subfolder per tahun ("2027"). Subfolder dibuat otomatis lewat `folderUntuk()` / `cariAtauBuatFolder`.
- Ini terpisah dari "04 Buku Besar Aset" (berkas bukti dan surat penawaran): di sana ratusan PDF, di sini hanya beberapa laporan untuk dibuka.
- Berkas di Drive **ditimpa di tempat** (`files.update`, fungsi baru `perbaruiBerkasDrive` di `lib/services/drive.ts`), bukan ditambah berkas baru tiap simpan. Folder tetap berisi satu berkas per jenis. Drive sendiri menyimpan riwayat revisinya ("Kelola versi"). ID berkas tercatat di manifest `drive_arsip`. ID hilang/terhapus → dibuat baru.
- Folder induk wajib **Restricted** (aturan Drive terpusat). Yang boleh membuka dibagikan per akun Google dari Drive, bukan "siapa saja yang punya tautan".

### 5B.3 Kapan diunggah — "tiap simpan" dengan jeda

Bisa, tetapi **tidak di dalam tombol Simpan itu sendiri.** Alasannya:
- Satu panggilan Google bisa 1–30 detik. Itu terlalu lama untuk ditunggu di tiap klik (sakelar keputusan, catat penerimaan, ubah referensi).
- Kalau Drive sedang gagal, simpanannya tidak boleh ikut gagal.
- Cadangan JSON BLUD sudah memakai pelajaran yang sama: unggahan yang ditempel ke Simpan menahan kunci transaksi.

Yang diusulkan:
1. Tiap simpan BBA yang berhasil (rencana, keputusan, proses, penerimaan, penawaran, impor/Tempatkan di Buku Aset) menandai **"perlu dikirim"**: `app_config` `bba_drive_kotor` = waktu simpan terakhir per tahun / per berkas. Ditulis SESUDAH commit, gagal = diam, satu `UPDATE`.
2. **Cron tiap 5 menit** (`/api/cron/bba-drive`, `verifyCronSecret`, pola cadangan BLUD, lewat crontab/MySQL EVENT kantor) mengirim berkas yang ditandai **dan sudah 2 menit tidak disentuh**. Rentetan simpan dalam rapat anggaran jadi satu unggahan, bukan dua puluh. Tanda dilepas hanya bila unggahan berhasil. Gagal → dicoba lagi 5 menit kemudian, dan `drive_health` + audit mencatatnya.
3. Hasilnya, Drive **paling lambat ± 7 menit** di belakang aplikasi.
4. Tombol **Kirim ke Drive sekarang** (Admin/SA) + baris **"Terakhir terkirim: 26 Nov 14:52 · berhasil"** di halaman Cetak BBA. Tanda hidup yang terlihat adalah pelajaran dari cadangan DB yang dulu berhenti 2 bulan tanpa ada yang sadar.
5. Laptop server mati tiap malam, jadi selama mati tidak ada yang dikirim. Saat menyala lagi, cron pertama mengejar.

Lembar KIB (Buku Aset) ikut mekanisme yang sama, dengan tanda sendiri. Ia berubah jauh lebih jarang (impor KIB, Tempatkan, opname).

## 5C. Akses dari luar kantor

Dipindah ke konsep tersendiri: `docs/konsep/sistem/CONCEPT-akses-luar-kantor.md` (draf diskusi). Di konsep ini cukup §5B: laporan di Drive bisa dibuka dari mana saja tanpa membuka aplikasi.


## 6. Perubahan server (ringkas)

| Route | Perubahan | Pagar |
|---|---|---|
| `POST /anggaran` | Menerima `item: [{id, expected_version, anggaran}]` (keputusan per item) dalam **satu** transaksi. Bentuk lama `{anggaran, item:[{id, expected_version}]}` tetap diterima. Satu versi basi → seluruh simpanan 409 (L77); layar memuat ulang lalu memasang pilihan yang belum tersimpan di atas data terbaru. | izin EDIT Rencana (sudah ada) |
| `GET /ringkas-alur` | baru, baca | izin LIHAT salah satu bagian BBA + sakelar |
| `GET /pagu-blud` | baru, baca | §4.2 |
| `POST /hapus-berantai` | baru, tulis | §5.2 + sakelar + `bbaRateLimit` + Zod; ikut gate G (killswitch) & uji C3 `test-bba-peran` |

| `GET/POST/PATCH/DELETE /penawaran` | baru (§5A) | izin EDIT Rencana atau Pengadaan, Zod, sakelar, audit `BBA_PENAWARAN_*` |
| `POST /penawaran/impor?step=pratinjau\|simpan` | baru (§5A) | sama |
| `GET /unduh?tahun=` | baru (§5B), workbook Rencana s.d. Pengadaan | izin LIHAT, audit `BBA_UNDUH` |
| `POST /api/cron/bba-drive` + `POST /drive-kirim` | baru (§5B), cron + tombol Admin | `verifyCronSecret` / `bolehBatalkanFinal` |

Tahap 1–4 tanpa kolom/tabel/migrasi baru. Tahap 5 (Penawaran) butuh `migration-bba-penawaran.sql` (**WAJIB sebelum kodenya dipasang**). Tahap 6 tanpa migrasi (status kirim di `app_config` + `drive_arsip` yang sudah ada).

## 7. Tahapan eksekusi

| Tahap | Isi | Uji |
|---|---|---|
| 1 | `tahapRencana()` + pita alur + halaman Rencana (tab tahap, kolom Tahap, tombol langkah berikutnya, lembar keputusan + bilah Simpan) + `POST /anggaran` per item + Menu ke lencana profil (semua modul) | `test-bba-tahap.mts` (semua kombinasi status × anggaran × referensi × penerimaan × register), simpan keputusan di MySQL kotak pasir (2099, satu transaksi, 409 basi), uji mutasi, `test-keluar-belum-tersimpan` |
| 2 | Pagu: `pagu.ts` + `GET /pagu-blud` + kartu pagu (4 sumber, sumber dana) | akar belanja modal pada pohon acak + data salinan DPA 2026 di kotak pasir, pagar akses tanpa izin BLUD, sakelar BLUD mati |
| 3 | Pengadaan (tab tahap, modal Tandai dipesan / Catat barang datang, *select* dibuang) + antrean Buku Aset naik ke atas | jalur proses & penerimaan lama tetap hijau (`test-bba-penerimaan`) |
| 4 | Panel Riwayat dan batalkan + Hapus berantai Admin + kalimat Master Barang | hapus berantai di MySQL kotak pasir (berhasil + 4 penolakan), balapan dengan Tempatkan |
| 5 | Menu Penawaran (per surat + Bandingkan) + "Ambil dari penawaran" di Referensi harga + impor Excel penawaran | `penawaran.ts` (terbaru-berlaku, termurah, satuan beda, kedaluwarsa), salinan tetap utuh sesudah surat disunting/dihapus, Gabungkan barang memindah item, MySQL kotak pasir |
| 6 | Unduh Excel seragam (5 lembar) + tujuan Drive `bba_laporan` + tanda "perlu dikirim" + cron + tombol Kirim sekarang | isi unduhan = isi Drive (penyusun sama), rentetan simpan = satu unggahan, gagal Drive tidak menggagalkan simpan, `files.update` menimpa berkas yang sama; uji Drive sungguhan lewat `UJI_DRIVE_INDUK` (pola `test-drive-terpusat`) |

Tiap tahap diverifikasi di peramban dengan akun dummy pada tahun kotak pasir (375 px, tema terang & gelap), lalu commit sendiri.

## 8. Yang sengaja TIDAK berubah

- Aturan bisnis: lima bagian izin, referensi beku sejak dipesan, penerimaan = satu-satunya sumber realisasi, rencana belum didanai tidak bisa dipesan.
- `RESTRICT` di database. Jalan resminya §5.
- Halaman Buku Aset (selain §3.4), Master (selain §5.3), dan Cetak.

## 9. Arah lain yang dipertimbangkan

Arah ini dipertimbangkan tetapi tidak dipilih: B papan alur (kanban), C kotak kerja daftar+detail, E siklus per barang, F beranda tugas + panduan langkah. Bagian E (barang sebagai titik masuk) dan F (panduan Tambah rencana) bisa dipakai lagi kelak di atas tahap ini, tanpa mengubah aturan.

## 10. Belum terverifikasi

- Penanda babak "Perubahan ke-n" untuk tahun yang belum punya penanda: diasumsikan berbunyi "murni" lewat `jenisSumberPagu`. Ini dicek di Tahap 2.
- Pola kode belanja modal `5.2` dicek pada DPA 2026 laptop dev. Formulir DPA tahun lain bisa berkode lain; aturan cadangan "BELANJA MODAL" menutupinya, tetapi belum dicoba pada berkas lain.
