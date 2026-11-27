# Konsep: Penawaran Rekanan mengikuti Matriks Inventarisasi + form isian tersambung Master

- **Modul:** Buku Besar Aset → menu **Penawaran** (`app/(dashboard)/buku-besar-aset/penawaran`)
- **Acuan:** berkas pemilik *Matriks Inventarisasi Penawaran RSJD dr. AMINO.xlsx*, lembar 1 "Matriks Inventarisasi" (16 kolom A–P, tiga kelompok kepala), plus lembar "Petunjuk Pengisian" dan "Ringkasan & Dashboard".
- **Berdiri di atas:** `CONCEPT-bba-revamp-alur.md` §5A (Penawaran per surat + Bandingkan + Ambil dari penawaran) dan `CONCEPT-bba-master-kategori.md` (Kategori → Jenis → Kode Rekening, `PilihKategori`).
- **Status:** DRAF untuk diputuskan pemilik. Belum ada kode.
- **Gambar:** `gambar/penawaran-revamp-1-daftar.png` (daftar matriks), `gambar/penawaran-revamp-2-form.png` (form pengisian). Baris surat diambil dari berkas Matriks pemilik; kode rekening, barang "Lisensi DICOM", dan isi spesifikasi/syarat di gambar hanya contoh ilustrasi.

---

## 1. Yang diminta

1. Kolom menu Penawaran disamakan dengan lembar 1 Matriks. Yang sudah sama dipertahankan, yang bisa ditingkatkan ditingkatkan.
2. Isian yang punya pasangan di Master **disambungkan**. Orang cukup memilih dari dropdown yang bisa dicari, atau mengetik manual kalau belum ada.
3. Tampilan form pengisian dirombak supaya enak dipakai.

## 2. Kolom Matriks ↔ PRIMA sekarang

| Kol | Matriks | PRIMA sekarang | Keputusan |
|---|---|---|---|
| A | No. | — (urutan tampil) | **Sama**, dihitung saat tampil/unduh |
| B | Tgl Surat | `bba_penawaran.tgl_surat` | **Sama** |
| C | No. Surat Rekanan | `nomor_surat` | **Sama**. Satu surat bisa membawa dua nomor (contoh baris 1 & 3, dipisah baris baru); tetap satu isian teks, baris baru diizinkan |
| D | Jenis Surat (dropdown) | — | **Baru** `jenis_surat` — dropdown 6 pilihan Matriks + ketik sendiri (§4.3) |
| E | Nama Rekanan / Vendor | `rekanan` teks + saran datalist | **Ditingkatkan**: Master Rekanan (§4.1). Teks tetap disimpan di surat sebagai potret |
| F | PIC & Kontak | — | **Baru** `pic_kontak` di surat, terisi otomatis dari Master Rekanan, boleh diubah |
| G | Kategori Belanja / Jasa (dropdown) | `kategori` + `jenis_kategori` + `kode_rekening` lewat `PilihKategori` | **Sama, ditingkatkan**: pakai Master Kategori 2 tingkat yang baru dipush, bukan daftar 6 kategori Matriks (§4.4) |
| H | Nama Barang | `bba_penawaran_item.nama_barang` + `barang_id` | **Sama**, pemilihnya tetap Master Barang dan kini menyambung isian lain (§4.2) |
| I | Merk | `merk_tipe` (gabung) | **Dipisah**: kolom baru `merk`; `merk_tipe` kini berarti *Tipe* (§3.2) |
| J | Tipe / Spesifikasi | `merk_tipe` + `spesifikasi` | **Sama**, dua isian: Tipe (pendek) dan Spesifikasi (panjang) |
| K | Satuan | `satuan` teks bebas | **Ditingkatkan**: `SatuanCombobox` (daftar `SATUAN_OPTIONS` yang sama dengan DPA & Usulan) |
| L | Harga Penawaran (Rp) | `harga_satuan` **wajib > 0** | **Diubah**: boleh kosong = "belum ada harga" (§3.3) |
| M | Status Pajak | — | **Baru** `status_pajak` per item: Termasuk PPN / Belum termasuk PPN / Bebas PPN / Tidak disebut |
| N | Link E-Katalog / Ref. | — | **Baru** `tautan` per item. Ikut tersalin ke referensi rencana (§3.4) |
| O | Garansi | — | **Baru** `garansi` per item, teks + pilihan cepat (1/2/3/5 tahun) |
| P | Masa Berlaku SPH | `berlaku_sampai` DATE | **Ditingkatkan**: tanggal tetap jadi penentu, isiannya bisa durasi ("14 hari", "1 bulan") yang dihitung dari tanggal surat; teks aslinya disimpan `masa_berlaku_teks` |
| (Q)* | Syarat & Pengecualian | `catatan` | **Sama**, labelnya diganti "Syarat & pengecualian" |
| (T)* | Status Tindak Lanjut | — | **Usulan tambahan** `status_tindak_lanjut` per surat (§4.5) |

\* Q dan T tidak ada di lembar 1, tetapi disebut di "Petunjuk Pengisian" dan direkap di "Ringkasan & Dashboard". Rekap status di berkas itu sekarang `#REF!` semua (rumusnya menunjuk kolom yang sudah dihapus), jadi PRIMA yang mengambil alih rekapnya.

**Yang berbeda bentuk, sengaja:** Matriks satu baris = satu surat × satu barang. PRIMA tetap **surat → item** (satu surat bisa banyak barang). Kolom A–G milik surat, H–O milik item. Daftar dan unduhan Excel tetap menampilkan satu baris per item persis seperti Matriks, dengan kolom surat diulang. Jadi bentuk yang dilihat sama, tetapi datanya tidak diketik berulang.

## 3. Perubahan aturan

### 3.1 Surat tanpa item / tanpa harga boleh dicatat
Matriks mencatat juga surat "Presentasi produk", "Penawaran Produk", dan "Company Profile" yang belum berharga (baris 2, 4, 6, 7). PRIMA sekarang menolak surat tanpa item berharga.

- `jenis_surat` yang **berharga** (Penawaran Harga (SPH), Penawaran Harga & Presentasi): minimal satu item berharga, sama seperti sekarang.
- Jenis lain: boleh tanpa item, dan item boleh tanpa harga.
- Aturannya satu fungsi murni `syaratSurat(jenis, item)` di `lib/bba/penawaran.ts`, dipakai tombol Simpan (sebab tombol mati) dan Zod `superRefine`.
- Jenis yang diketik sendiri (bukan pilihan) dianggap **tidak berharga**. Bila ternyata ada harga, item berharga tetap tersimpan biasa.

### 3.2 Merk dipisah dari Tipe
`bba_penawaran_item` dapat kolom `merk` VARCHAR(80). Kolom lama `merk_tipe` tidak di-rename (L69: dibaca referensi, laporan, Drive balik, Bandingkan) dan kini tampil sebagai **Tipe**.

- Teks yang dipakai di luar (referensi rencana, sel Bandingkan, lembar Excel lama) = `gabungMerkTipe(merk, tipe)` satu fungsi. Data lama (`merk` NULL) tampil persis seperti sekarang.
- Salinan ke referensi rencana tetap mengisi `bba_referensi_harga.merk_tipe` dengan hasil gabungan, jadi tidak ada kolom baru di referensi.

### 3.3 Harga boleh kosong
`harga_satuan` → `DECIMAL(18,2) NULL`. Item tanpa harga:
- tidak ikut **Bandingkan**, rata-rata, dan termurah (`bandingkanPenawaran` menyaring `harga_satuan != null`);
- tidak muncul di **Ambil dari penawaran** (`itemPenawaran(barang)` menyaring di SQL);
- di daftar tampil "belum ada harga" (abu), dan tidak ikut Total nilai.

Semua pembaca `harga_satuan` didata saat dikerjakan (L69): `penawaran.ts`, `bba-penawaran.ts`, `laporan-excel.ts` (lembar Penawaran), `drive-balik` (pembanding lembar), `AmbilPenawaran.tsx`, uji `test-bba-penawaran` & `test-bba-laporan`.

### 3.4 Link E-Katalog membuat referensi sah tanpa berkas
Aturan `referensiSah` = harga > 0 **dan** (tautan aman **atau** berkas). Sekarang salinan dari penawaran hanya membawa berkas surat, jadi surat tanpa PDF menghasilkan referensi yang belum sah. Dengan `tautan` item ikut tersalin ke `url` referensi (`referensiDariPenawaran`), item berharga yang punya link e-katalog langsung sah. Sumber referensi ditebak `tebakSumber(url)`: link `katalog.inaproc.id` = EKATALOG. Tautan diperiksa `tautanAman` yang sama dengan referensi.

### 3.5 Masa berlaku: tanggal tetap jadi penentu
- Isian **Berlaku s.d.** punya dua cara: pilih tanggal, atau pilih durasi cepat (14 hari · 30 hari · 1 bulan · 3 bulan · tanpa batas) yang dihitung dari tanggal surat.
- `berlaku_sampai` tetap satu-satunya yang dibaca aturan `masihBerlaku`. `masa_berlaku_teks` hanya mencatat bunyi surat ("14 (empat belas) hari") untuk unduhan Excel.
- Ubah tanggal surat sesudah memilih durasi: tanggal berlaku ikut digeser, karena durasinya yang dipilih. Kalau yang dipilih tanggal, tidak digeser.

## 4. Isian tersambung Master

Prinsip: **memilih dari Master = mengisi form**. Yang menulis tetap satu tombol Simpan surat (L78). Isian yang terisi otomatis tetap bisa diubah, dan tanda "dari Master" hilang begitu diubah.

### 4.1 Rekanan → Master Rekanan (baru)
Konsep §5A.3 dulu menunda master rekanan "sampai ejaannya berantakan". Matriks sudah menunjukkan ejaan berantakan: "PT. Medal Darma Buana⏎" (baris baru di ujung), "PT. RIVER MARINE OFFSHORE" kapital semua, "PT." vs "PT". Kini PIC & kontak juga perlu tempat tinggal.

- Tabel `bba_rekanan`: `nama` (unik setelah dirapikan), `pic_nama`, `telepon`, `email`, `alamat`, `catatan`. Tab baru **Master → Rekanan** (izin Master, sama dengan Barang).
- Form: combobox **Rekanan** mencari nama/PIC/telepon. Memilih mengisi **PIC & Kontak**. Ketik nama yang belum ada → pilihan "+ Rekanan baru: PT …" (dibuat saat Simpan, di transaksi yang sama; pola `barang_baru`). Nama dirapikan dulu (`rapikanNamaRekanan`: buang spasi/baris baru ganda, "PT" → "PT."), jadi "PT Medal Darma Buana" tidak lahir dua kali.
- Surat menyimpan `rekanan_id` **dan** teks `rekanan` + `pic_kontak` sebagai potret. Master yang diganti nama tidak mengubah surat lama, sama seperti referensi.
- Centang kecil "Perbarui kontak di Master Rekanan" muncul kalau PIC/kontak diubah. Bawaan mati, supaya kontak sekali pakai tidak menimpa kontak tetap.
- Migrasi mengisi `bba_rekanan` dari `DISTINCT` nama rekanan surat yang ada (sesudah dirapikan) lalu menautkan `rekanan_id`.
- Bandingkan dan saringan memakai `rekanan_id` bila ada, supaya dua ejaan satu rekanan tidak jadi dua kolom.

### 4.2 Nama Barang → Master Barang
Pemilih yang ada (`PilihBarang`) dipertahankan, ditambah sambungannya:
- Memilih barang mengisi **Satuan** dari `bba_barang.satuan` (bila satuan item masih kosong) dan menampilkan **Kategori · Jenis · Kode rekening** barang itu sebagai keterangan baris.
- Barang yang sudah pernah ditawarkan menampilkan petunjuk "terakhir Rp 15,73 M dari PT. Aneka Medika (27 Okt 2026) · 2 penawaran lain". Ini bahan cek cepat saja, tidak mengisi harga.
- **Nama di surat** tetap isian sendiri, karena itu bunyi asli surat. Bawaannya mengikuti nama barang yang dipilih, dan bisa diganti.
- Ketik nama baru → "+ Barang baru" (sudah ada) atau "Belum ditautkan" (biarkan tanpa Master).

### 4.3 Jenis Surat → daftar tetap + manual
Enam pilihan Matriks (Penawaran Harga (SPH) · Penawaran Harga & Presentasi · Permohonan Presentasi · Permohonan Demo & Brosur · Company Profile & Penawaran Jasa · Lainnya) di konstanta `JENIS_SURAT` (`lib/bba/penawaran.ts`). Combobox bisa dicari dan bisa diketik bebas. Isi Matriks yang tidak persis daftar ("Presentasi produk", "Penawaran Produk") dicocokkan saat impor ke pilihan terdekat bila tunggal (`cocokJenisSurat`), selebihnya disimpan apa adanya.

### 4.4 Kategori → Master Kategori (searchable)
Daftar kategori Matriks ("Alkes Radiologi & Diagnostik", "Sistem IT & Integrasi SIM-RS", …) **tidak** dibuat master tandingan. Isi kolom G di Matriks justru uraian rekening ("Belanja Modal Alat Kedokteran"), jadi cocoknya Jenis Kategori di Master Kategori yang baru.
- `PilihKategori` ditingkatkan: isian **Jenis Kategori** jadi combobox yang mencari kode rekening **dan** uraian di semua induk. Memilih jenis mengisi Kategori induk + Kode Rekening + Kelompok KIB sekaligus. Dua `<select>` berantai sekarang dipertahankan sebagai cadangan di ponsel.
- Karena komponennya satu, peningkatan ini ikut ke form Rencana dan Master Barang.
- Kategori tetap milik **surat** (bawaan untuk barang baru). Item yang barangnya punya kategori sendiri menampilkannya. Kategori per item tidak dibuat: satu SPH lazimnya satu jenis belanja, dan Master Barang sudah menjawab sisanya.

### 4.5 Status Tindak Lanjut (usulan tambahan, keputusan pemilik)
`status_tindak_lanjut` per surat, enam nilai dari lembar Ringkasan: Menunggu Jadwal Presentasi · Menunggu Jadwal Demo · Perlu Telaah Teknis & Anggaran · Disetujui / Lanjut Proses · Arsip / Referensi Vendor · Ditolak / Tidak Sesuai. Warna lencana mengikuti petunjuk Matriks (kuning menunggu, biru telaah, hijau lanjut, abu arsip, merah ditolak), memakai token design system.
- Bisa diubah dari menu ⋯ baris tanpa membuka form (satu PATCH kecil, angka kunci surat).
- Status **tidak** mengubah aturan harga. Surat "Ditolak" tetap ada di Bandingkan, dengan tanda. Yang mengatur ikut-tidaknya harga tetap masa berlaku.

### 4.6 Isian lain
| Isian | Bentuk |
|---|---|
| Merk | combobox saran dari merk yang sudah tercatat di penawaran + Merk/Type KIB, ketik bebas |
| Satuan | `SatuanCombobox` |
| Status pajak | pilihan 4 nilai. Bawaan diambil dari item sebelumnya di surat yang sama. Tombol kepala kolom "samakan semua" |
| Garansi | teks + chip 1/2/3/5 tahun |
| Link e-katalog | teks, dicek `tautanAman`, sumbernya ditebak dan ditampilkan ("e-Katalog") |

## 5. Tampilan

### 5.1 Daftar = Matriks (gambar 1)
- **Kartu ringkas di atas**, pengganti lembar "Ringkasan & Dashboard": Surat terdata · Surat berharga · Total nilai penawaran berharga · lencana per status tindak lanjut (klik = saring).
- **Tabel satu baris per item** dengan kepala dua tingkat seperti Matriks: *I. Identitas surat & rekanan* (No · Tgl · No. Surat · Jenis · Rekanan & PIC · Kategori) · *II. Barang/jasa & spesifikasi* (Barang · Merk · Tipe/Spesifikasi · Satuan) · *III. Harga & syarat komersial* (Harga · Pajak · E-Katalog · Garansi · Berlaku) · Status · ⋯. Kolom surat dirangkum (rowspan) untuk surat berbarang banyak. Kolom No dan Rekanan lengket saat digulir mendatar.
- Baris kaki **TOTAL NILAI PENAWARAN BERHARGA** seperti baris 31 Matriks.
- Saringan: cari · Kategori · Jenis surat · Status · Masa berlaku. Tampilan **Bandingkan** tetap ada, tidak berubah selain mengikuti §3.3.
- Ponsel: tabel jadi kartu per surat (pola Data Entry Renaksi).

### 5.2 Form pengisian (gambar 2)
Modal sempit sekarang (980 px, item enam kotak sebaris) diganti **panel lebar** dengan tiga bagian bernomor sesuai kelompok Matriks, dan ringkasan di kanan:
1. **Identitas surat & rekanan**: Rekanan (combobox Master) → PIC & kontak terisi, Jenis surat, Nomor, Tanggal, Berlaku s.d. (tanggal atau chip durasi), Berkas surat (seret-lepas PDF/foto, pratinjau kecil).
2. **Barang/jasa & spesifikasi**: tabel item ala lembar kerja (Nama barang (Master) · Merk · Tipe · Satuan · Harga · Pajak), Tab/Enter pindah sel, **tempel baris dari Excel** (Ctrl+V beberapa baris = beberapa item), baris bisa dibuka untuk Spesifikasi · Link e-katalog · Garansi. Keterangan kategori/kode rekening barang tampil kecil di bawah nama.
3. **Harga & syarat komersial**: Kategori surat (Jenis Kategori searchable), Syarat & pengecualian, Status tindak lanjut.
- **Panel kanan lengket**: total nilai, jumlah item berharga, centang kelengkapan (berkas terlampir · tiap item berharga punya link atau berkas = referensi sah · masa berlaku belum lewat), dan sebab tombol Simpan mati.
- Penanda kecil **"dari Master"** di isian yang terisi otomatis, supaya terlihat mana yang diketik dan mana yang terambil.
- Belum tersimpan: `useIngatkanBelumTersimpan` + ditanya saat menutup panel (layar baru ini didaftarkan di `test-keluar-belum-tersimpan`).

## 6. Impor & unduhan Excel

- **Impor Matriks langsung.** Pembaca baru `bacaMatriksPenawaran` mengenali kepala Matriks (16 kolom, kepala bertingkat, baris TOTAL di bawah dilewati) dan **banyak surat per berkas**: baris dikelompokkan per (rekanan + nomor surat + tanggal). Pratinjau menampilkan per surat: rekanan dicocokkan ke Master Rekanan, barang ke Master Barang, jenis surat ke daftar, masa berlaku "1 Bulan"/"14 hari" diurai jadi tanggal, harga "-" = kosong. Simpan membaca ulang berkas yang sama di server (pola impor KIB, satu transaksi). Berkas Matriks pemilik jadi data kalibrasi uji.
- Templat lama "satu berkas = satu surat" tetap terbaca (`bacaPenawaranWorkbook`), supaya berkas yang sudah beredar tidak mati.
- **Unduh Excel** lembar Penawaran mengikuti kolom Matriks A–P (+ Syarat, Status), kepala dua tingkat, baris TOTAL, lewat templat seragam `tulisTabelExcel` (kepala baris 7 tetap aturan PRIMA). Tombol **Unduh templat impor** = lembar yang sama tanpa isi, jadi unduhan bisa diimpor balik.

## 7. Data (migrasi `migration-bba-penawaran-matriks.sql`)

| Tabel / kolom | Isi |
|---|---|
| `bba_rekanan` baru | `id`, `nama` VARCHAR(160) UNIQUE, `pic_nama` VARCHAR(120), `telepon` VARCHAR(60), `email` VARCHAR(120), `alamat` VARCHAR(255), `catatan` VARCHAR(500), `created_by/at`, `updated_at` |
| `bba_penawaran` | + `rekanan_id` INT UNSIGNED NULL (FK `bba_rekanan` RESTRICT), + `pic_kontak` VARCHAR(255), + `jenis_surat` VARCHAR(80), + `masa_berlaku_teks` VARCHAR(60), + `status_tindak_lanjut` VARCHAR(40) NULL. `catatan` 500 → 1000 (syarat) |
| `bba_penawaran_item` | + `merk` VARCHAR(80), + `status_pajak` ENUM('TERMASUK','BELUM','BEBAS','TIDAK_DISEBUT') NULL, + `tautan` VARCHAR(500), + `garansi` VARCHAR(120); `harga_satuan` → NULL-able |

- Isi awal: `bba_rekanan` dari nama surat yang ada (dirapikan), `rekanan_id` ditautkan. Kolom baru lain kosong; surat lama tampil persis seperti sekarang.
- Kolom/teks baru WAJIB lewat `ItemPenawaranSchema`/`KepalaPenawaranSchema`. Kunci yang tidak dikirim = jangan sentuh (L87), sebab tinjauan Drive balik dan tab lama mengirim bentuk lama.
- `rekanan_id` dicek ada (`FOR SHARE`, L68). Hapus rekanan yang dipakai surat ditolak dengan jumlahnya. Gabungkan rekanan (dua ejaan) memindah surat, pola Gabungkan barang.
- Wajib ditambahkan ke `docs/schema-mysql.sql`.

## 8. Tahap pengerjaan

| Tahap | Isi | Migrasi |
|---|---|---|
| 1 | Kolom item & surat baru + harga boleh kosong + `syaratSurat` + salinan tautan ke referensi + daftar matriks + unduhan Excel | ya |
| 2 | Master Rekanan + combobox rekanan + PIC otomatis + Gabungkan rekanan | ya (bagian Rekanan) |
| 3 | Form panel baru (tiga bagian, tabel item ala lembar kerja, tempel dari Excel, panel kanan) + `PilihKategori` searchable | tidak |
| 4 | Impor Matriks banyak surat + templat baru | tidak |
| 5 (pilihan) | Status tindak lanjut + kartu ringkas per status | ikut migrasi tahap 1 bila disetujui |

Satu berkas migrasi untuk semuanya (dijalankan sekali di server kantor sebelum kode tahap 1 dipasang), supaya tidak ada tiga migrasi untuk satu menu.

## 9. Yang perlu diputuskan pemilik

1. **Status tindak lanjut** (§4.5): dipasang atau tidak? Rekomendasi: pasang. Lembar Ringkasan Matriks memang merekapnya, dan rumus di berkas itu sudah rusak.
2. **Master Rekanan** (§4.1): setuju dibuat sekarang? Rekomendasi: ya. Tanpa itu PIC & kontak tidak punya sumber otomatis, dan ejaan rekanan akan memecah Bandingkan.
3. **Kategori Matriks vs Master Kategori** (§4.4): setuju memakai Master Kategori 2 tingkat (yang baru dipush), bukan enam kategori Matriks? Rekomendasi: ya. Kalau enam kategori Matriks tetap dibutuhkan untuk laporan pimpinan, keenamnya bisa dimasukkan sebagai **Jenis Kategori** di bawah induk yang sesuai. Itu cukup diisi di Master, tanpa kode baru.
4. **Status pajak per item atau per surat**? Rekomendasi: per item (Matriks per baris, dan Bandingkan harus adil antara harga termasuk/belum PPN), dengan tombol "samakan semua".

## 10. Uji yang direncanakan

- `scripts/test-bba-penawaran.mts` diperluas: `syaratSurat`, harga kosong tidak ikut Bandingkan/Ambil, `gabungMerkTipe`, tautan tersalin + sumber EKATALOG + referensi sah tanpa berkas, durasi → tanggal (termasuk akhir bulan: 31 Jan + 1 bulan = 28/29 Feb), rapikan & cocokkan rekanan, L87 kolom tak dikirim.
- Kalibrasi `bacaMatriksPenawaran` dengan berkas Matriks pemilik (7 surat, 3 berharga, total Rp 34.081.318.604 = baris TOTAL berkas).
- Bagian MySQL kotak pasir: migrasi isi awal rekanan, FK rekanan, hapus/gabung rekanan, impor banyak surat satu transaksi.
- Uji mutasi untuk tiap aturan murni di atas.
