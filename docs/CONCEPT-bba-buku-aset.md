# NARASI — Buku Aset: mencatat yang dimiliki, merencanakan dari yang tercatat

> Status: **narasi, belum desain sistem.** Versi 1 (2026-10-26 pagi) disetujui arahnya oleh pemilik. Versi 2 (2026-10-26 siang) menyesuaikan dengan **contoh Excel dari sistem aset provinsi** (KIB C "Data Gedung dan Bangunan – Bangsal Jiwa" dan "Rekap Aset 2025") dan menetapkan **tiga peran**: Umum Aset (RT), Perencanaan (Program), Pengadaan.
> Versi 3 (2026-10-26 sore): format semua golongan **mengikuti templat provinsi** yang ikut dalam berkas ekspor (contoh KIB B/KIR berisi data tidak diperlukan), dan **pengaturan akses tiga peran lewat Admin Panel** (§3.1).
> Desain layar, tabel, dan tahapannya dibahas SESUDAH narasi ini disetujui. Pendahulunya: `docs/CONCEPT-bba-perencanaan.md` (Tahap 1–3 sudah terpasang); bagaimana yang sudah ada bergeser → §12.

## 1. Intinya

Rumah sakit perlu **satu buku** yang menjawab dua pertanyaan sekaligus:

1. **Kita punya apa?** Barang apa saja, berapa banyak, di ruangan mana, diperoleh tahun berapa, kondisinya bagaimana. Untuk tanah dan bangunan: luasnya berapa.
2. **Kita perlu apa?** Dan apakah kebutuhan itu masuk akal **dilihat dari yang sudah dimiliki**.

Pertanyaan pertama dijawab **Umum Aset (RT)**. Pertanyaan kedua dijawab **Perencanaan (Program)** sambil membaca jawaban pertanyaan pertama. **Pengadaan** membeli yang sudah masuk anggaran tahun ini. Begitu barang diterima, ia masuk lagi ke buku sebagai aset. Bukunya berputar:

```
     ┌───────────────────────────────────────────────────────────────────────┐
     ▼                                                                       │
 ① CATAT ASET ──► ② RAWAT DATANYA ──► ③ RENCANAKAN ──► ④ BELI ──────► ⑤ TERIMA
    Umum Aset        Umum Aset           Perencanaan      Pengadaan       Pengadaan → Umum Aset
   (impor KIB,      (opname, rusak,     (baca buku aset, (rencana yang   (barang datang,
    lengkapi)        pindah ruangan)     tulis rencana)   masuk anggaran) masuk buku lagi)
     │
     └──► ⑥ HAPUS (rusak berat, sudah ada SK penghapusan — riwayatnya tetap ada)
```

BBA yang sekarang **berangkat dari rencana belanja**; kondisi eksisting ditempelkan sebagai pelengkap. Narasi ini membalik urutannya: **buku aset dulu, rencana berdiri di atasnya**, dan buku asetnya **berbentuk sama dengan KIB provinsi** — diisi dari Excel provinsi dan bisa dicetak kembali dalam format yang sama.

## 2. Kenapa yang sekarang terasa kurang

| Yang dibutuhkan | Yang ada sekarang |
|---|---|
| Daftar semua aset yang dimiliki, termasuk yang diperoleh puluhan tahun lalu | Hanya barang yang pernah masuk rencana BBA |
| Tahun perolehan tiap aset | Pendataan hanya menghitung baik / rusak ringan / rusak berat per ruangan |
| Luas tanah, luas & konstruksi bangunan, tanah tempat gedung berdiri | Tidak ada; semua diperlakukan seperti barang ber-unit |
| Tiga peran dengan pekerjaan masing-masing | Satu hak akses untuk semuanya |
| Excel berformat KIB provinsi | Tidak ada |
| Barang yang baru diterima langsung jadi catatan aset | Kartu barang hanya menulis "perlu didata ulang" |

## 3. Tiga peran

| Peran | Pekerjaannya | Yang ia lihat |
|---|---|---|
| **Umum Aset (RT)** — pemilik buku aset | Mengimpor KIB dari sistem provinsi; melengkapi ruangan, nama sehari-hari, dan kondisi; opname; memindah ruangan; menempatkan barang yang baru diterima; mengisi nomor register sesudah barang dicatat di sistem provinsi; mengusulkan penghapusan; mencetak KIB/KIR | Seluruh buku aset; rencana (hanya baca) |
| **Perencanaan (Program)** | Menyusun rencana: jenis, jumlah, alasan, referensi harga; menimbang usulan unit (modul Usulan Kebutuhan); menandai rencana yang **masuk anggaran** tahun berjalan | Buku aset (hanya baca) + seluruh rencana |
| **Pengadaan** | Membuka daftar **yang dibeli tahun ini** (rencana yang masuk anggaran); mengecek spesifikasi, referensi harga, dan eksisting; menandai Dalam Proses; mencatat penerimaan (jumlah, tanggal, harga riil, BAST, foto) | Rencana tahun berjalan + ringkasan buku aset barang yang dibeli |

Di luar tiga peran itu: unit/ruangan tetap mengusulkan kebutuhan lewat modul **Usulan Kebutuhan** yang sudah ada, dan pimpinan bisa diberi akses baca bila nanti dibutuhkan.

### 3.1 Akun dan pengaturan akses di Admin Panel

**Tidak ada role baru dan tidak ada akun khusus.** Tiap orang memakai akun PRIMA-nya sendiri; yang diatur adalah **izin per bagian BBA**. Admin Panel sudah punya matriks izin per menu (dipakai BLUD dan Perjanjian Kinerja) dengan dua lapis: **per role** (berlaku untuk semua akun ber-role itu) dan **per orang** (menimpa untuk satu akun saja). BBA tinggal didaftarkan ke sana.

BBA dibagi lima bagian, masing-masing **Ubah / Lihat / Tidak**:

| Bagian BBA | Umum Aset (role `RUMAH TANGGA`) | Perencanaan (role `PROGRAM`) | Pengadaan (diberikan per orang) | SUPER_ADMIN / ADMIN | Akun lain yang diberi akses BBA |
|---|---|---|---|---|---|
| Buku Aset (catat, opname, pindah, terima, hapus, impor KIB) | **Ubah** | Lihat | Lihat | Ubah | Lihat |
| Rencana (rencana per tahun, referensi harga, tanda masuk anggaran) | Lihat | **Ubah** | Lihat | Ubah | Lihat |
| Pengadaan (yang dibeli tahun ini, proses, penerimaan, BAST) | Lihat | Lihat | **Ubah** | Ubah | Lihat |
| Master (kamus barang, gedung & ruangan) | **Ubah** | Lihat | Lihat | Ubah | Lihat |
| Cetak & Excel | Lihat | Lihat | Lihat | Lihat | Lihat |

"Lihat" juga berarti boleh mengunduh. Dua role pertama (`RUMAH TANGGA`, `PROGRAM`) sudah ada di PRIMA dan **langsung dapat bawaannya** — tidak perlu diberi akses BBA satu per satu. Yang perlu satu langkah admin hanya petugas pengadaan.

**Kenapa Pengadaan diberikan per orang, bukan per role.** Petugas pengadaan tidak punya role sendiri; ia bisa ber-role apa saja (staf keuangan, staf umum, dsb.). Kalau izinnya dipasang per role, misalnya "semua akun KEUANGAN boleh mengubah Pengadaan", seluruh staf keuangan ikut mendapatkannya. Dengan izin per orang, hanya orang yang ditunjuk yang bisa.

**Contoh memberi akses petugas pengadaan** (nama karangan): Rina, akun PRIMA ber-role `KEUANGAN`, ditunjuk sebagai pejabat pengadaan.
1. Super Admin membuka **Admin Panel → Pusat Akses**, memilih akun Rina.
2. Membuka pintu modul **Buku Besar Aset** untuk Rina. Sejak itu Rina bisa membuka BBA, tapi semua bagian baru "Lihat".
3. Di bawah modul itu (perkecualian per orang), bagian **Pengadaan** diubah ke **Ubah**, lalu **Simpan** — satu simpan bersama pintu modulnya.
4. Rina masuk: daftar "yang dibeli tahun ini" bisa ia isi (Dalam Proses, penerimaan, BAST); buku aset dan rencana hanya bisa ia baca.

Bawaan per role (kolom Umum Aset & Perencanaan di tabel atas) diatur di tab **Peran** Admin Panel, sama seperti BLUD dan Perjanjian Kinerja. Kalau Rina belum punya akun, ia mendaftar seperti biasa dengan role unitnya, lalu Super Admin mengerjakan langkah 2–3. Kalau petugas pengadaan berganti, admin mengembalikan izin Pengadaan orang lama ke bawaan dan memberikannya ke orang baru. Satu orang boleh memegang dua bagian sekaligus bila di kantor memang dirangkap (misalnya RT yang juga petugas pengadaan: cukup Pengadaan → Ubah di akunnya).

Perubahan izin tercatat di audit Admin Panel seperti izin modul lain.

## 4. Pelajaran dari Excel sistem provinsi

Dua berkas yang diberikan pemilik adalah **ekspor sistem aset provinsi** (BPKAD Jateng memakai SIMASET Jateng; dokumentasi fiturnya tidak terbuka untuk umum, jadi yang dijadikan acuan adalah bentuk ekspornya). Satu berkas ekspor memuat **semua templat** sekaligus — lembar yang berisi data dibiarkan tampil, sisanya disembunyikan:

| Lembar | Isi |
|---|---|
| `KIBA` … `KIBF` | Kartu Inventaris Barang per golongan: A Tanah, B Peralatan & Mesin, C Gedung & Bangunan, D Jalan/Irigasi/Jaringan, E Aset Tetap Lainnya, F Konstruksi Dalam Pengerjaan |
| `KIR` | Kartu Inventaris **Ruangan** — kop menyebut Kode Gedung dan Ruang; kolomnya punya **Keadaan (Baik/Rusak Ringan/Rusak Berat)** |
| `BI` | Buku Inventaris BMD — semua golongan dalam satu daftar |
| `KIBAInv` … `KIBFInv`, `RKPInv` | **Hasil sensus** per golongan (= KIB + kolom Kondisi + tahun sensus) dan rekapnya |
| `Rekap` | Rekapitulasi BMD per kode akun/objek: jumlah dan nilai |
| `AsetPJP_*`, `AsetF` | Aset pinjam pakai (+ kolom Pemanfaat) |

Templat semua lembar ikut di setiap berkas ekspor, jadi **kolom KIB B, KIR, dan golongan lain diambil dari templat itu** — contoh berisi data untuk tiap golongan tidak diperlukan. Data nyata yang dipakai menguji impor: KIB C Bangsal Jiwa (dan berkas lain bila menyusul).

Yang terbaca dari isinya:

1. **Satu baris KIB = satu register (satu unit).** Delapan gedung bangsal = delapan baris, register 000002 … 000008. Untuk peralatan, Rekap 2025 menunjukkan skalanya: **6.457 unit** peralatan & mesin (2.055 alat kedokteran, 3.348 alat kantor & rumah tangga, 635 komputer), **59** gedung & bangunan, **22** jalan/jaringan, **305** aset tetap lainnya, **2** bidang tanah — total **6.845 barang, Rp 349,19 M** (periode s.d. Desember 2025). Jumlah ini kecil untuk basis data, jadi PRIMA bisa menyimpan per register juga.
2. **Kode barang memuat tahun perolehan.** Contoh: `11.01.33.74.010206.00000.00000.1984-1.3.3.01.01.02.001` = kode pemilik & lokasi RS (`010206`) · **tahun perolehan `1984`** · kode barang `1.3.3.01.01.02.001`. KIB C sendiri tidak punya kolom tahun, jadi tahun perolehan diambil dari kode ini saat impor.
3. **Nama resmi sering tidak menggambarkan bangunannya.** Kedelapan bangsal jiwa tercatat sebagai **"Bangunan gudang tertutup permanen"**; identitas sebenarnya cuma di kolom Keterangan: "Gedung Bangsal I" … "Gedung Bangsal VIII". Perencana mencari "Bangsal", bukan "gudang". PRIMA perlu **nama sehari-hari** di samping nama resmi.
4. **Gedung terkait ke tanahnya** lewat kolom *Nomor Kode Tanah* (kedelapan bangsal menunjuk tanah perolehan 1980). Jadi "gedung ini berdiri di tanah mana" sudah ada datanya.
5. **Kondisi di sistem provinsi tidak bisa dipercaya begitu saja.** Kedelapan bangsal (dibangun 1984 dan 1987, umur 39–42 tahun) semuanya tercatat **BAIK** tanpa tanggal pemeriksaan. KIB B bahkan tidak punya kolom kondisi sama sekali; kondisi peralatan hanya ada di KIR dan hasil sensus.
6. **Sebutan kondisi tidak seragam** di templatnya sendiri: KIR memakai Baik / Rusak Ringan / Rusak Berat, Buku Inventaris memakai B / KB / R.
7. **Ruangan sudah dikenal sistem provinsi** (lewat KIR), tapi KIB tidak memuatnya. Kalau KIR di sistem provinsi terisi, ruangan bisa ikut diimpor; kalau tidak, RT mengisinya di PRIMA.

## 5. Apa yang dicatat di buku aset

### 5.1 Satu catatan = satu register, ditampilkan berkelompok

Mengikuti KIB: **satu catatan = satu register.** Ini membuat impor dan cetak ulang KIB lurus satu-satu, dan tiap unit punya kondisinya sendiri.

Supaya tidak tenggelam di 6.457 baris, layar **mengelompokkan** catatan yang sejenis, setahun perolehan, dan seruangan:

| Barang | Tahun | Ruangan | Register | Baik | RR | RB |
|---|---|---|---|---|---|---|
| Kursi roda | 2016 | Bangsal III | 4 unit (000011–000014) | 1 | 1 | 2 |
| Kursi roda | 2021 | Bangsal III | 3 unit (000031–000033) | 3 | – | – |
| Kursi roda | 2021 | IGD | 3 unit (000034–000036) | 2 | 1 | – |

Saat opname, RT bisa memilih beberapa register sekaligus lalu menetapkan kondisinya ("4 unit ini: 1 baik, 1 rusak ringan, 2 rusak berat" — tinggal menunjuk yang mana). Data tetap per unit, jadi KIR dan hasil sensus bisa dicetak per baris.

### 5.2 Data per golongan = kolom KIB provinsi

Setiap golongan menyimpan **persis kolom KIB-nya**, supaya impor dan cetak tidak kehilangan apa pun:

| Golongan | Kolom KIB (dari templat provinsi) |
|---|---|
| **A. Tanah** | Nama, kode barang, register, luas (m²), tahun pengadaan, letak/alamat, status tanah: hak · sertifikat tanggal · nomor, penggunaan, asal usul, harga, keterangan |
| **B. Peralatan & mesin** | Kode, nama, register, merk/type, ukuran/CC, bahan, warna, tahun pembelian, nomor: pabrik · rangka · mesin · polisi · BPKB, asal usul, harga, keterangan |
| **C. Gedung & bangunan** | Nama, kode, register, kondisi, konstruksi: bertingkat/tidak · beton/tidak, luas bangunan (m²), letak/alamat, dokumen gedung: tanggal · nomor, luas tanah bangunan (m²), status tanah, nomor kode tanah, asal usul, harga, keterangan |
| **D. Jalan, irigasi, jaringan** | Nama, kode, register, konstruksi, panjang, lebar, luas, letak, dokumen: tanggal · nomor, status tanah, nomor kode tanah, asal usul, harga, kondisi, keterangan |
| **E. Aset tetap lainnya** | Nama, kode, register, judul/pencipta, spesifikasi, asal daerah, pencipta, bahan, jenis, ukuran, jumlah, tahun cetak/pembelian, asal usul, harga, keterangan |
| **F. Konstruksi dalam pengerjaan** | Nama, kondisi, bertingkat/tidak, beton/tidak, luas lantai, letak, dokumen: tanggal · nomor, tanggal mulai pekerjaan, status tanah, nomor kode tanah, asal usul, nilai kontrak, keterangan |

**Tambahan milik PRIMA** (tidak ada di KIB, justru inilah nilainya):
- **Nama sehari-hari** ("Gedung Bangsal I") — terisi otomatis dari Keterangan saat impor, bisa diubah.
- **Ruangan** (untuk peralatan) dan **gedung** tempat ruangan itu berada.
- **Kondisi bertanggal & bernama** untuk semua golongan kecuali tanah — termasuk peralatan, yang di KIB B tidak punya kolom kondisi.
- **Foto, catatan kerusakan, riwayat** (perpindahan, perubahan kondisi, rehab).
- **Status registrasi**: sudah punya kode & register provinsi, atau "baru diterima, belum teregister".
- **Kaitan ke rencana**: rencana mana yang membeli/merehab aset ini.

### 5.3 Arti kondisi

- **Baik** — berfungsi normal.
- **Rusak ringan** — masih bisa dipakai, atau perlu perbaikan kecil yang biayanya wajar.
- **Rusak berat** — tidak bisa dipakai, dan memperbaikinya tidak sebanding dengan biayanya. Kandidat penggantian dan penghapusan.

Kondisi **selalu bertanggal dan bernama** ("rusak ringan — dicek Budi, 12 Agu 2026"). Kondisi yang datang dari impor diberi tanda **"dari sistem provinsi, belum dicek"** sampai RT memeriksanya — supaya "BAIK" pada bangsal 1984 tidak dibaca sebagai hasil pemeriksaan. Untuk cetak Buku Inventaris yang memakai B/KB/R, padanannya: Baik → B, Rusak ringan → KB, Rusak berat → R.

## 6. Siklus dalam satu tahun (gambaran)

| Waktu | Yang terjadi | Siapa |
|---|---|---|
| Jan | Rencana yang masuk anggaran tahun ini ditandai → muncul di daftar Pengadaan | Perencanaan |
| Jan–Mar | Impor KIB terbaru dari sistem provinsi; opname kondisi per ruangan | Umum Aset |
| Sepanjang tahun | Laporan rusak, pindah ruangan | Umum Aset |
| Sepanjang tahun | Pembelian diproses, barang diterima | Pengadaan |
| Sesudah diterima | Barang ditempatkan di ruangan, lalu diregister di sistem provinsi | Umum Aset |
| Mar–Jun | Unit mengusulkan kebutuhan tahun depan (Usulan Kebutuhan) | Unit |
| Jun–Agu | Perencana menimbang usulan sambil membaca buku aset, menyusun rencana tahun depan | Perencanaan |
| Akhir tahun | Barang rusak berat diusulkan dihapus | Umum Aset |

Jadwalnya ilustrasi; aplikasinya tidak memaksa urutan bulan.

## 7. Alur rinci dengan contoh

### 7.1 Pendataan awal — impor dari Excel provinsi

1. RT mengekspor KIB dari sistem provinsi (berkas seperti "Data Gedung dan Bangunan – Bangsal Jiwa") dan mengunggahnya ke PRIMA. PRIMA mengenali lembar KIB yang berisi data, membaca tiga baris kepalanya, lalu menampilkan **pratinjau** sebelum menyimpan apa pun.
2. Dari tiap baris: kode barang (sekaligus tahun perolehan), register, nama resmi, semua kolom KIB, dan **nama sehari-hari dari Keterangan**.
3. Impor ulang tahun berikutnya **dicocokkan lewat kode barang + register**: yang sudah ada diperbarui kolom KIB-nya, tambahan PRIMA (ruangan, kondisi bertanggal, foto) tidak disentuh; register baru ditambahkan; register yang hilang dari ekspor dilaporkan ("mungkin sudah dihapus di provinsi"), tidak dihapus diam-diam.
4. RT melengkapi yang tidak ada di KIB: ruangan untuk peralatan, kondisi untuk semua.

> Contoh nyata: impor KIB C Bangsal Jiwa menghasilkan 8 catatan gedung — Bangsal I–VII perolehan 1984, Bangsal VIII 1987; masing-masing 300 m², tidak bertingkat, beton, di atas tanah perolehan 1980, nilai Rp 243.551.100, total Rp 1.948.408.800. Nama sehari-harinya langsung "Gedung Bangsal I" … "VIII". Kondisinya "BAIK — dari sistem provinsi, belum dicek".

### 7.2 Merawat datanya (sepanjang tahun)

- **Opname.** RT membuka satu ruangan (atau satu gedung), muncul semua aset di situ, lalu ia memperbarui kondisinya. Yang tidak berubah cukup ditandai "sudah dicek".
- **Laporan rusak.** Monitor pasien di ICU mati 3 Sep 2026 → rusak berat, catatan "power supply terbakar, teknisi: tidak ekonomis".
- **Pindah ruangan.** 2 kursi roda dipindah dari Bangsal III ke IGD; perpindahannya tercatat.
- **Rehab bangunan.** Atap Bangsal III diganti 2027 → kondisi naik ke baik, tahun rehab terakhir 2027, nilai rehab tercatat di riwayat.

### 7.3 Merencanakan (Perencanaan membaca buku aset)

Rencana punya **jenis**, karena alasannya berbeda dan buku aset menjawabnya berbeda pula:

| Jenis rencana | Kapan masuk akal | Yang dicek di buku aset |
|---|---|---|
| **Penggantian** | Barangnya ada tapi rusak berat / terlalu tua | Ada yang rusak berat? Umurnya? |
| **Penambahan** | Ada dan baik, tapi kurang jumlahnya | Berapa yang dimiliki, semuanya baik? |
| **Pengadaan baru** | RS belum pernah punya | Benar belum pernah dimiliki / dibeli? |
| **Pemeliharaan / perbaikan** | Rusak ringan, masih layak diperbaiki | Ada yang rusak ringan? |
| **Rehab / renovasi** | Gedung atau jaringan rusak | Luas, umur, konstruksi, rehab terakhir, kondisi |

Contoh:

**a. Bangsal jiwa — rehab (dari data nyata).** Perencana menyiapkan rencana 2027 untuk bangsal. Buku aset: 8 gedung, masing-masing 300 m² (total 2.400 m²), tidak bertingkat, beton, umur 39–42 tahun, kondisi "BAIK — dari sistem provinsi, **belum dicek**". PRIMA menahan perencana dengan petunjuk: *"Kondisi 8 gedung belum pernah diperiksa; minta Umum Aset mengecek dulu."* RT memeriksa: Bangsal III dan V rusak ringan (atap bocor, plafon lapuk), sisanya baik. Rencananya jadi **rehab atap & plafon Bangsal III dan V, 600 m²**, nilai dihitung per m² dari luas yang tercatat — bukan rehab delapan gedung sekaligus.

**b. Kursi roda — penggantian.** IGD mengusulkan 4 kursi roda. Buku aset: 10 unit, 2 rusak berat (perolehan 2016), 2 rusak ringan. Rencana: **penggantian 2 unit** + **perbaikan 2 unit**, bukan beli 4. Alasannya tercatat: "ganti 2 RB perolehan 2016".

**c. Ventilator — penambahan.** ICU mengusulkan 2. Buku aset: 4 unit, semuanya baik (2021, 2023). Ini **penambahan**, butuh alasan layanan ("tempat tidur ICU 6 → 8 pada 2027") + 3 referensi harga.

**d. Alat EEG — pengadaan baru.** Buku aset: belum pernah dimiliki, belum pernah ada di rencana mana pun. Rencana **pengadaan baru** dengan alasan layanan.

**e. Tanah — rencana gedung baru.** Buku aset: 2 bidang tanah (KIB A — luas dan sertifikatnya ikut impor), beserta gedung-gedung yang menunjuk tanah itu lewat Nomor Kode Tanah dan luas bangunannya. Perencana melihat gedung apa saja yang sudah berdiri di tanah itu. Hitungan "lahan kosong" tidak dibuat — itu butuh denah.

Contoh a–e kecuali bangsal adalah karangan untuk menggambarkan alur.

### 7.4 Pengadaan — yang dibeli tahun ini

1. Awal tahun, Perencanaan menandai rencana yang **masuk anggaran** tahun ini. Hanya itu yang muncul di daftar Pengadaan — rencana yang tidak didanai tidak membingungkan.
2. Pengadaan membuka satu rencana dan melihat sekaligus: spesifikasi, referensi harga, alasan, dan **ringkasan buku aset barang itu** (supaya tahu, misalnya, merk yang sudah dipakai RS dan kondisinya).
3. Barang dipesan → **Dalam Proses**.
4. Barang datang: 2 kursi roda diterima 14 Mei 2027, harga riil Rp 3.900.000/unit, BAST & foto diunggah → **Diterima 2 dari 2**. Saat mencatat penerimaan, Pengadaan menyebut **yang benar-benar dibeli**: pilih salah satu dari 3 referensi (merk/tipe, penyedia, dan tautannya ikut tersalin) atau isi sendiri kalau akhirnya membeli di tempat lain.
5. Sejak rencana **Dalam Proses**, referensi harga dibekukan — tidak bisa diubah lagi lewat Rencana. Survei harga yang dipakai saat membeli itu catatan sejarah, bukan draf.

### 7.5 Penerimaan → buku aset

1. Penerimaan memunculkan antrean **"barang diterima, belum dicatat"** di layar RT.
2. RT menempatkannya: ruangan IGD, kondisi baik. Sejak itu ia **catatan aset perolehan 2027**, berstatus **"belum teregister"**.
3. RT mencatatnya di sistem provinsi seperti biasa. Begitu kode barang dan register keluar, RT mengisinya di PRIMA (atau impor KIB berikutnya mencocokkannya otomatis) → status **teregister**.
4. Karena rencananya **penggantian**, 2 kursi roda rusak berat perolehan 2016 ditandai **siap diusulkan dihapus**.

Kenapa tidak otomatis masuk tanpa RT? Aplikasi tidak tahu barangnya ditaruh di ruangan mana, dan nomor register hanya keluar dari sistem provinsi. Mengarang keduanya membuat buku aset salah sejak hari pertama.

### 7.6 Penghapusan

Sesudah ada SK penghapusan, RT menandai catatan itu **dihapus** dengan nomor dan tanggal SK. Catatannya tidak lenyap — pindah ke "aset dihapus", supaya "dulu kita pernah punya berapa" tetap terjawab.

### 7.7 Tahun berikutnya — belajar dari pembelian lama

Tahun 2029 IGD mengusulkan kursi roda lagi. Saat Perencanaan membuka rencananya, modal item menampilkan **pembelian sebelumnya** untuk barang yang sama:

```
Pembelian sebelumnya — KURSI RODA
2027  2 unit · Merk A tipe KR-809 · e-Katalog (tautan) · Rp 3.900.000/unit · BAST · foto
      dibandingkan waktu itu: Merk A Rp 3.950.000 · Merk B Rp 4.200.000 · Merk C Rp 4.600.000
      kondisi sekarang: 2 baik (IGD)
2021  6 unit · Merk B tipe ST-21 · toko daring (tautan) · Rp 5.400.000/unit · BAST
      kondisi sekarang: 4 baik · 2 rusak ringan
2016  4 unit · Merk C (dari kolom Merk/Type KIB — sebelum PRIMA, tanpa tautan & BAST)
```

Dari situ Perencanaan bisa menimbang: Merk A lebih murah dan keduanya masih baik, sedangkan Merk B sudah ada yang rusak ringan sesudah enam tahun. Tautan, BAST, dan foto bisa dibuka langsung dari situ. Tombol **Pakai sebagai referensi** menyalin pilihan lama ke referensi rencana baru; tanggal ceknya tetap tanggal lama, jadi kelihatan harganya perlu dicek ulang. (Merk & angka di atas karangan.)

Dua syarat supaya ini tetap bisa dijawab bertahun-tahun kemudian:
- **Tidak ada yang dibuang.** Referensi, tautan, pilihan yang dibeli, BAST, dan foto tersimpan bersama rencananya; rencana yang sudah diproses atau punya bukti tidak bisa dihapus (§10 butir 7).
- **Rencananya tertaut ke kamus barang.** Pembelian sebelumnya dicari lewat Master Barang, jadi rencana lama yang belum ditautkan tidak ikut muncul — karena itu tombol "Tautkan sekaligus" (Tahap 2) tetap penting.

## 8. Yang dilihat Perencanaan dan Pengadaan tentang satu barang

```
KURSI RODA                                   B · peralatan & mesin · 1.3.2.07.xx
────────────────────────────────────────────────────────────────────────────────
Dimiliki      10 unit di 2 ruangan     6 baik · 2 rusak ringan · 2 rusak berat
Umur          4 unit perolehan 2016 (10 th) · 6 unit perolehan 2021 (5 th)
Rusak berat   2 unit, perolehan 2016, Bangsal III (reg. 000013, 000014)
Pernah dibeli 2016: 4 unit · Merk C (kolom Merk/Type KIB)
              2021: 6 unit · Merk B tipe ST-21 · Rp 5.400.000/unit · tautan · BAST
Sedang proses —
Rencana 2027  Penggantian 2 unit (diusulkan IGD) · masuk anggaran
Kondisi dicek terakhir 12 Agu 2026
```

```
GEDUNG BANGSAL I–VIII                          C · gedung & bangunan · 8 register
────────────────────────────────────────────────────────────────────────────────
Luas          8 × 300 m² = 2.400 m² · tidak bertingkat · beton
Umur          7 gedung 1984 (42 th) · 1 gedung 1987 (39 th) · rehab terakhir: belum tercatat
Kondisi       BAIK menurut sistem provinsi — belum pernah dicek di PRIMA
Tanah         tanah perolehan 1980 (KIB A)
Nilai         Rp 1.948.408.800
```

Petunjuk, bukan larangan:
- Penambahan padahal ada yang rusak berat → "Ada 2 rusak berat, mungkin cukup penggantian?"
- Penggantian padahal semuanya baik → "Tidak ada yang rusak berat, apa alasan penggantiannya?"
- Pengadaan baru padahal barangnya sudah ada → "RS sudah punya 10 unit."
- Kondisi belum pernah dicek / dicek lebih dari setahun lalu → "Minta Umum Aset memeriksa dulu."

## 9. Keluaran Excel

**Format provinsi persis** — supaya bisa dipakai di mana pun KIB diminta. Bentuknya mengikuti templat yang diberikan: kop "KARTU INVENTARIS BARANG (KIB) C. GEDUNG DAN BANGUNAN · PROVINSI JAWA TENGAH", Kode Lokasi / Bidang / Sub Bidang / Satuan Kerja, kepala tiga baris dengan sel gabung, baris nomor kolom 1–17, baris Jumlah, tanda tangan "Mengetahui, Kepala SKPD" dan "Pengurus Barang", kertas A4 mendatar. Contoh hasil untuk bangsal (kolom dipersingkat):

| No | Jenis/Nama Barang | Kode Barang | Register | Kondisi | Bertingkat | Beton | Luas (m²) | … | Asal Usul | Harga | Keterangan |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Bangunan gudang tertutup permanen | …1984-1.3.3.01.01.02.001 | 000002 | Baik | Tidak | Beton | 300 | … | Belanja modal | 243.551.100 | Gedung Bangsal I |
| … | | | | | | | | | | | |
| 8 | Bangunan gudang tertutup permanen | …1987-1.3.3.01.01.02.001 | 000002 | Baik | Tidak | Beton | 300 | … | Belanja modal | 243.551.100 | Gedung Bangsal VIII |
| | | | | | | | | | **Jumlah** | **1.948.408.800** | |

Bedanya dengan ekspor provinsi: kolom **Kondisi** berisi hasil pemeriksaan terakhir di PRIMA (bila sudah dicek), bukan salinan dari provinsi.

Daftar keluaran:

| Keluaran | Bentuk | Gunanya |
|---|---|---|
| KIB A–F | Format provinsi persis, satu lembar per golongan | Laporan / pencocokan dengan provinsi |
| KIR per ruangan | Format provinsi persis (Kode Gedung, Ruang, Keadaan B/RR/RB) | Ditempel di ruangan, dasar opname |
| Hasil sensus per golongan + rekap | Format provinsi (KIB + kolom Kondisi + tahun) | Hasil opname tahunan |
| Rekap BMD | Format provinsi (per kode akun/objek, jumlah & nilai) | Ringkasan untuk pimpinan |
| Buku Inventaris | Format provinsi (B/KB/R) | Bila diminta |
| **Format kerja PRIMA** | KIB + kolom tambahan: nama sehari-hari, ruangan, kondisi dicek kapan/oleh siapa, rencana terkait | Bahan kerja internal |
| **Daftar rencana per tahun** | Per jenis rencana, dengan data eksisting tiap barang (pola RKBMD pengadaan & pemeliharaan) | Bahan penyusunan anggaran & pengadaan |

## 10. Aturan main (kebijakan, bukan teknis)

1. **Buku aset diubah Umum Aset; rencana ditulis Perencanaan; status beli & penerimaan dicatat Pengadaan.** Semua bisa membaca milik yang lain.
2. **Barang yang dibeli belum jadi aset sebelum diterima dan ditempatkan** (§7.5).
3. **Kode barang & register milik sistem provinsi.** PRIMA tidak membuat nomor register sendiri; ia menunggu nomor dari provinsi.
4. **Riwayat tidak dihapus.** Kondisi lama, perpindahan, rehab, dan penghapusan bisa ditelusuri: kapan, oleh siapa, kenapa.
5. **Kondisi hasil impor bukan hasil pemeriksaan** sampai RT mengeceknya (§5.3).
6. **Rencana selalu punya jenis dan alasan.**
7. **Survei harga dan bukti beli disimpan selamanya.** Tiga referensi (merk, tautan, harga), pilihan yang dibeli, BAST, dan foto tersimpan bersama rencananya. Rencana yang sudah diproses atau punya bukti tidak bisa dihapus. Gunanya untuk pembelian berikutnya (§7.7).

## 11. Hubungan dengan sistem provinsi

Yang disarankan: **PRIMA = buku kerja, sistem provinsi = buku resmi.**

- **Masuk**: impor Excel KIB dari sistem provinsi, dicocokkan lewat kode barang + register (§7.1).
- **Ditambahkan PRIMA**: nama sehari-hari, ruangan, kondisi bertanggal, foto, riwayat, kaitan ke rencana dan pengadaan.
- **Keluar**: Excel berformat provinsi (§9) — untuk laporan dan untuk mencocokkan; penginputan resmi tetap di sistem provinsi.
- **Tidak dikerjakan PRIMA**: penerbitan register, penyusutan, laporan resmi BMD.

## 12. Posisi terhadap BBA yang sudah dibangun (sekilas — rinciannya di tahap sistem)

- **Tetap terpakai:** referensi harga & bukti dukung (Tahap 1) — dibekukan sejak Dalam Proses dan dipakai lagi sebagai **pembelian sebelumnya** (§7.7), status Dalam Proses & penerimaan, kamus barang (Master Barang), Master Lokasi (= ruangan), tampilan per barang.
- **Bergeser:** pendataan eksisting (hitungan baik/RR/RB per barang × ruangan) diganti kondisi **per register** di buku aset. "Perlu didata ulang" diganti antrean **barang diterima, belum dicatat**. Baris BBA sekarang menjadi **rencana** yang punya jenis dan tanda "masuk anggaran".
- **Baru:** buku aset per golongan dengan kolom KIB, impor & ekspor Excel format provinsi, gedung ↔ tanah, ruangan ↔ gedung, perpindahan, penghapusan, tiga peran.

## 13. Pertanyaan sebelum bicara sistem

| # | Pertanyaan | Usulan bawaan |
|---|---|---|
| 1 | PRIMA = buku kerja, sistem provinsi = buku resmi (§11)? | Ya |
| 2 | Yang menandai "masuk anggaran" tahun berjalan: Perencanaan? | Ya |
| 3 | Opname kondisi berapa kali setahun? | Sekali setahun (sensus) + laporan rusak kapan saja |
| 4 | Keluaran Excel: format provinsi persis saja, atau juga format kerja PRIMA? | Keduanya |
| 5 | Penghapusan dicatat di sini (tanda + nomor & tanggal SK)? | Ya |
| 6 | Kondisi peralatan dicatat per unit (bisa pilih banyak sekaligus) atau cukup per kelompok? | Per unit, diisi per kelompok (§5.1) |

**Sudah diputuskan pemilik (26 Okt):**
- Tiga peran = `RUMAH TANGGA` (Umum Aset), `PROGRAM` (Perencanaan), Pengadaan diberikan per orang lewat Admin Panel (§3.1).
- Format semua golongan mengikuti templat provinsi; ruangan diisi RT di PRIMA bila tidak ikut dari ekspor.
- Nomor 1–4 sesuai usulan bawaan: **Program menandai masuk anggaran**; **opname setahun sekali** dan jaraknya berupa pengaturan (bisa diubah ke 6 bulan tanpa memperbarui aplikasi); Excel **dua format** (persis provinsi + format kerja PRIMA).

---

# BAGIAN II — Desain sistem & tahapan (draf, 2026-10-26)

> Disusun sesudah narasi disetujui. Desain layar per menu → konsep visual yang disajikan bersamaan di percakapan. Angka & nama kolom tabel di bawah masih draf; final saat eksekusi tiap tahap.

## 14. Peta menu

BBA menjadi lima bagian, masing-masing satu halaman dan satu baris izin di Admin Panel (§3.1):

| Bagian | Alamat | Isi |
|---|---|---|
| **Buku Aset** | `/buku-besar-aset/aset` | Daftar aset per golongan (Semua · A–F), dikelompokkan sejenis-setahun-seruangan; ringkasan nilai & kondisi; saringan (ruangan/gedung, kondisi, tahun, belum dicek, belum teregister, dihapus); antrean **barang diterima, belum dicatat**; tombol Impor KIB, Opname, Cetak. Klik baris → **kartu aset** (kolom KIB, tambahan PRIMA, riwayat, foto, rencana terkait). |
| **Rencana** | `/buku-besar-aset` (halaman yang sekarang) | Rencana per tahun; tampilan Per Item / Per Barang; jenis rencana, alasan, aset sasaran, referensi harga, tanda anggaran (Belum · Didanai · Tidak didanai); tandai masuk anggaran borongan; saran dari rencana tahun lalu yang tidak didanai. Modal item tiga kolom (Tahap 1) tetap — kolom tengahnya jadi **ringkasan barang dari buku aset + petunjuk + pembelian sebelumnya** barang yang sama (§7.7). |
| **Pengadaan** | `/buku-besar-aset/pengadaan` | Hanya rencana **Didanai** tahun berjalan; status Belum diproses · Dalam proses · Diterima sebagian · Diterima penuh; catat penerimaan bertahap (tanggal, jumlah, harga riil, **yang dibeli** — merk/tipe · penyedia · tautan, BAST, foto). |
| **Master** | `/buku-besar-aset/master` (yang sekarang) | Kamus barang, gedung & ruangan, kategori, **pengaturan** (jarak opname; kop & penanda tangan Excel: kode lokasi, bidang, sub bidang, satuan kerja, Kepala SKPD, Pengurus Barang). |
| **Cetak & Excel** | `/buku-besar-aset/cetak` | KIB A–F, KIR per ruangan, hasil sensus + rekapnya, Rekap BMD, Buku Inventaris (format provinsi persis), format kerja PRIMA, daftar rencana per tahun. |

## 15. Data (draf)

**Isi kolom KIB disimpan sebagai JSON per golongan, bukan 60-an kolom tabel.** Enam golongan punya 14–17 kolom berbeda; kolom yang dipakai untuk menyaring/menjumlah (golongan, kode, register, tahun, nama, ruangan, kondisi, harga, status) berdiri sebagai kolom biasa, sisanya (luas, konstruksi, dokumen, nomor rangka, dst.) di `kib`. Definisi kolom per golongan hidup di **satu** berkas `lib/bba/kib.ts` (kunci, judul kepala tiga tingkat, tipe, lebar Excel) — dipakai Zod, impor, kartu aset, dan Excel sekaligus. Kalau provinsi mengubah templatnya, yang disunting satu berkas itu (L78).

| Tabel | Kolom pokok | Catatan |
|---|---|---|
| **`bba_aset`** (baru) | `golongan` A–F · `kode_barang` · `register` · `kode_objek` · `tahun_perolehan` · `nama_resmi` · `nama` (sehari-hari) · `barang_id` → kamus barang · `lokasi_id` → ruangan · `kib` JSON · `harga` · `asal_usul` · `keterangan` · `kondisi` B/RR/RB · `kondisi_tgl` · `kondisi_oleh` · `kondisi_sumber` IMPOR/CEK · `status` AKTIF/DIHAPUS · `hapus_sk_nomor` · `hapus_sk_tgl` · `siap_dihapus` · `penerimaan_id` · `version` | Pencocok impor = `kunci_impor` UNIK (`kode|register`; KIB F yang tak ber-kode: nama + letak + tanggal mulai), NULL untuk yang belum teregister. Tidak pernah dihapus fisik. `penerimaan_id` ditambahkan di Tahap E. |
| **`bba_aset_riwayat`** (baru) | `aset_id` · `jenis` IMPOR/UBAH/KONDISI/PINDAH/TERIMA/REGISTER/REHAB/HAPUS · `sebelum` JSON · `sesudah` JSON · `catatan` · `file_id` (foto) · `oleh` · `dicatat_pada` | Ditulis di transaksi yang sama dengan perubahannya. |
| `bba_lokasi` (ada) | + `gedung_aset_id` → `bba_aset` golongan C | Ruangan ada di gedung mana; KIR dicetak per ruangan dengan Kode Gedung. |
| `buku_besar_aset` = rencana (ada) | + `jenis_rencana` (PENGGANTIAN/PENAMBAHAN/PENGADAAN_BARU/PEMELIHARAAN/REHAB) · `alasan` · `anggaran` BELUM/DIDANAI/TIDAK_DIDANAI · `anggaran_vol` · `anggaran_nilai` · `anggaran_pada` · `anggaran_oleh` · `asal_rencana_id` | Rencana lama tanpa jenis tetap sah (jenis kosong = "belum digolongkan"). |
| **`bba_rencana_aset`** (baru) | `rencana_id` · `aset_id` | Aset sasaran: yang diganti, diperbaiki, atau direhab. |
| `bba_referensi_harga` (ada) | + `merk_tipe` | Tetap ditulis ulang tiap Simpan item, tapi **ditolak sejak Dalam Proses** (beku). Rencana dari Usulan yang belum pernah menyimpan referensi: saat masuk Dalam Proses, tautan usulan (`url_merk1–3`, selama ini dibaca lewat JOIN) ditulis jadi referensi — supaya tidak ikut hilang kalau usulannya berubah. |
| **`bba_penerimaan`** (baru) | `rencana_id` · `tgl` · `vol` · `harga_satuan` · `referensi_urutan` (NULL = beli di tempat lain) · `merk_tipe` · `penyedia` · `url` · `catatan` · `created_by` | Yang dibeli disimpan sebagai **salinan**, bukan rujukan ke baris referensi — baris referensi ditulis ulang tiap Simpan item sehingga id-nya berganti. Penerimaan bertahap. `vol_realisasi`/`nilai_realisasi`/`tgl_realisasi` rencana = turunan Σ penerimaan, ditulis HANYA oleh jalur penerimaan (satu jalur tulis). |
| `app_config` (ada) | satu kunci `bba_pengaturan` (JSON: kop, tanda tangan, `opname_bulan` 12) — `lib/bba/pengaturan.ts` | Ditulis lewat route BBA (izin Master), bukan panel Config admin. Satu kunci, satu skema Zod, satu tulisan (Tahap B). |
| `bba_eksisting` (Tahap 3) | — | **Dipensiunkan** di Tahap C: hitungan baik/RR/RB per barang × ruangan digantikan kondisi per register. Di server kantor belum berisi data (migrasinya baru dijalankan), jadi tidak ada yang perlu dipindahkan. |

**Antrean "barang diterima, belum dicatat"** dihitung, tidak disimpan: Σ `vol` penerimaan − jumlah `bba_aset` yang menunjuk penerimaan itu. Untuk rencana **rehab**, penerimaan tidak melahirkan aset baru; antreannya berbunyi "rehab selesai — perbarui kondisi gedung sasaran", dan pembaruannya tercatat sebagai riwayat REHAB pada gedung itu. Aset yang lahir dari penerimaan golongan B membawa `merk_tipe` penerimaannya ke kolom Merk/Type KIB, jadi merk yang dibeli ikut tercetak di KIB B.

## 16. Aturan teknis

- **Izin**: `lib/bba/peran.ts` (bagian × EDIT/LIHAT/TIDAK, bawaan per role) + satu entri di `lib/registry/menu-apps.ts`; registry BBA `punyaMenu: true`, `peranBawaan` ditambah `RUMAH TANGGA` dan `PROGRAM`. Setiap route tulis memeriksa `bolehEditMenu` untuk bagiannya — pagar di API, tombol mati di layar hanya cermin (L82).
- **Impor KIB**: pratinjau dulu tanpa menulis; simpan dalam satu `withTransaction` + `bulkInsert`; dicocokkan lewat `(kode_barang, register)`; kolom KIB diperbarui, tambahan PRIMA tidak disentuh; register yang hilang dilaporkan, tidak dihapus. Sel dibaca lewat `nilaiSelExcel` (`lib/shared/excel-sel.ts`), jumlah lembar & ukuran berkas dibatasi (L67). Tahun perolehan & `kode_objek` diurai dari kode barang oleh fungsi murni.
- **Kondisi, pindah, opname**: baris aset dikunci `FOR UPDATE` + `version` (CAS); riwayat ditulis di transaksi yang sama; opname borongan = satu transaksi untuk semua register yang dipilih.
- **Rencana**: tanda anggaran hanya lewat izin Rencana; daftar Pengadaan = `anggaran = DIDANAI` dan tahun berjalan; penerimaan ditolak untuk rencana yang belum didanai (pagar API).
- **Pengaman riwayat**: hapus rencana ditolak bila statusnya bukan DIRENCANAKAN atau sudah punya bukti — hari ini `deleteAset` menghapus tanpa syarat apa pun, dan `ON DELETE CASCADE` membawa referensi & bukti ikut lenyap. Referensi ditolak diubah sejak Dalam Proses; pagarnya di `updateAset`, bukan cuma tombol mati (L82).
- **Excel**: `exceljs`, A4 mendatar, kepala tiga baris + nomor kolom + Jumlah + tanda tangan dari pengaturan; kondisi ditulis seperti KIB provinsi (BAIK / RUSAK RINGAN / RUSAK BERAT), Buku Inventaris B/KB/R. Isinya diuji dengan membuka berkasnya kembali (pola uji ekspor BLUD).
- **Audit**: jenis baru `BBA_ASET_*`, `BBA_RENCANA_ANGGARAN`, `BBA_PENERIMAAN_*`, `BBA_PENGATURAN` — wajib digolongkan di `retensi-audit.ts`.
- Gerbang yang berlaku: G (sakelar), H (`sqlInt`), I (DATE lewat `DATE_FORMAT`), J (tanpa `title=`), E (token warna), `check-schema`.

## 17. Tahapan

Tiap tahap bisa dipasang sendiri; migrasi dijalankan di server kantor **sebelum** kodenya.

| Tahap | Isi | Migrasi | Bergantung |
|---|---|---|---|
| **A — Akses & kerangka** ✅ 26 Okt | Lima bagian di navigasi; halaman Rencana & Master yang sekarang masuk ke kerangka; izin per bagian di Admin Panel; `RUMAH TANGGA`/`PROGRAM` langsung masuk; pagar `bolehEditMenu` di semua route BBA yang ada; **pengaman riwayat** (hapus rencana yang sudah diproses/berbukti ditolak, referensi beku sejak Dalam Proses) | — | — |
| **B — Buku aset + impor + KIB** ✅ 26 Okt | `bba_aset` + riwayat; impor Excel KIB A–F (pratinjau → simpan, impor ulang mencocokkan); halaman Buku Aset + kartu aset; nama sehari-hari; Excel KIB A–F format provinsi persis; pengaturan kop & tanda tangan | 1 | A |
| **C — Kondisi & ruangan** ✅ 27 Okt | Gedung ↔ ruangan; opname per ruangan/gedung (pilih banyak); laporan rusak; pindah ruangan; foto; peringatan "belum dicek"/"lewat jarak opname"; Excel KIR, hasil sensus + rekap, Rekap BMD, Buku Inventaris, format kerja PRIMA; pensiun `bba_eksisting` | 1 | B |
| **D — Rencana di atas buku aset** | Jenis rencana + alasan + aset sasaran; ringkasan barang & petunjuk di modal; tanda masuk anggaran / tidak didanai (borongan); saran dari rencana tahun lalu yang tidak didanai; **pembelian sebelumnya** barang yang sama di modal (§7.7); Excel daftar rencana | 1 | B (C dianjurkan) |
| **E — Pengadaan & penerimaan** | Halaman Pengadaan; penerimaan bertahap dengan **yang dibeli** (merk/tipe, penyedia, tautan — melengkapi pembelian sebelumnya); antrean di Buku Aset → tempatkan → "belum teregister" → isi register / cocok otomatis saat impor; penggantian menandai aset lama "siap dihapus"; penghapusan dengan SK; rehab memperbarui gedung sasaran | 1 | D |

**Catatan Tahap C (27 Okt).** Laporan rusak = "Catat kondisi" pada satu/beberapa register (kartu aset atau centang di Buku Aset) — pintu yang sama dengan opname, satu tanggal + satu foto per catatan. Kalibrasi templat menemukan satu beda yang tidak terlihat dari KIB: lembar **KIBEInv** mengelompokkan Kode Barang + Register di bawah "Nomor" (KIB E tidak), kini ditiru. "Tidak Ada" di rekap sensus selalu 0 — PRIMA belum mencatat aset yang tidak ditemukan (§18).

Uji per tahap mengikuti pola Tahap 1–3: `scripts/test-bba-*.mts` (fungsi murni + bagian MySQL kotak pasir 2086–2089, bersih otomatis) + uji mutasi; impor dikalibrasi dengan berkas **KIB C Bangsal Jiwa** dan templat **Rekap Aset 2025** (keduanya tidak masuk repo); dicoba di peramban (tema gelap/terang, 375 px). Data 2026 hanya dibaca.

## 18. Sengaja tidak dikerjakan

- Menerbitkan kode barang/register, penyusutan, laporan resmi BMD — milik sistem provinsi.
- Sambungan otomatis ke sistem provinsi (tidak ada API terbuka); pertukarannya lewat Excel.
- Hitungan lahan kosong (butuh denah).
- Laporan rusak langsung dari ruangan/unit — menyusul sesudah Tahap C.
- Penandaan anggaran otomatis dari DPA BLUD — menyusul; Tahap D memakai tanda manual oleh Program.

## 19. Keputusan terbuka (bawaan dipakai bila tidak ada keberatan)

| # | Pertanyaan | Bawaan |
|---|---|---|
| 1 | Pendataan eksisting Tahap 3 (`bba_eksisting`, Modal Pendataan) dipensiunkan di Tahap C? | Ya — digantikan kondisi per register |
| 2 | Urutan tahap A → E? | Ya |
| 3 | Lima bagian di navigasi memakai bilah tab di atas halaman (seperti modul lain) + FloatingDock? | Ya |
