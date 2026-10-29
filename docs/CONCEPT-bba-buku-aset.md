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
4. Karena rencananya **penggantian**, 2 kursi roda rusak berat perolehan 2016 ditandai **siap diusulkan dihapus** — begitu penggantinya **diterima penuh**. Selama baru sebagian yang datang, belum ada yang ditandai: aplikasi tidak tahu unit lama mana yang sudah ada penggantinya. Sejak ada barang diterima, jenis rencana dan aset sasarannya tidak bisa diubah lagi.

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
4. **Riwayat tidak dihapus.** Kondisi lama, perpindahan, rehab, dan penghapusan bisa ditelusuri: kapan, oleh siapa, kenapa. Dua pengecualian: penempatan yang dibatalkan sebelum teregister (§20.1) — catatan itu tidak pernah jadi aset di buku resmi; jejaknya di audit log. Dan catatan kembar yang dibuang saat digabung (§23.2) — riwayatnya hanya impor, isinya salinan berkas; jejak gabungnya di riwayat catatan yang tersisa + audit log.
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
| **D — Rencana di atas buku aset** ✅ 27 Okt | Jenis rencana + alasan + aset sasaran; ringkasan barang & petunjuk di modal; tanda masuk anggaran / tidak didanai (borongan); saran dari rencana tahun lalu yang tidak didanai; **pembelian sebelumnya** barang yang sama di modal (§7.7); Excel daftar rencana | 1 | B (C dianjurkan) |
| **E — Pengadaan & penerimaan** ✅ 27 Okt | Halaman Pengadaan; penerimaan bertahap dengan **yang dibeli** (merk/tipe, penyedia, tautan — melengkapi pembelian sebelumnya); antrean di Buku Aset → tempatkan → "belum teregister" → isi register / cocok otomatis saat impor; penggantian menandai aset lama "siap dihapus"; penghapusan dengan SK; rehab memperbarui gedung sasaran | 1 | D |
| **F — Koreksi salah input** ✅ 29 Okt | Batalkan penempatan; betulkan/kosongkan register; peringatan "kemungkinan salah ketik" di pratinjau impor; betulkan SK; batalkan penghapusan (Admin) — §20 | 1 | E |
| **G — Nomor diganti provinsi & catatan kembar** ✅ 29 Okt | Pasangkan "aset yang sama, nomornya berubah" di pratinjau impor; gabungkan dengan kembarannya di kartu aset — §23 | — | F |

**Catatan Tahap C (27 Okt).** Laporan rusak = "Catat kondisi" pada satu/beberapa register (kartu aset atau centang di Buku Aset) — pintu yang sama dengan opname, satu tanggal + satu foto per catatan. Kalibrasi templat menemukan satu beda yang tidak terlihat dari KIB: lembar **KIBEInv** mengelompokkan Kode Barang + Register di bawah "Nomor" (KIB E tidak), kini ditiru. "Tidak Ada" di rekap sensus selalu 0 — PRIMA belum mencatat aset yang tidak ditemukan (§18).

**Catatan Tahap D (27 Okt).** Rencana yang sudah Dalam Proses / diterima saat migrasi otomatis bertanda **Didanai** (jelas sudah dibeli); sisanya "Belum ditandai". Pendanaan rencana yang sudah diproses tidak bisa dicabut. Rencana tahun lalu yang tidak didanai disalin dengan **kode yang sama** (identitas lintas-tahun), referensinya ikut beserta tanggal cek lama, dan aset sasaran yang sudah dihapus tidak ikut. "Pembelian sebelumnya" menampilkan rencana lama yang terealisasi (harga satuan riil + referensi waktu itu + bukti) dan register Buku Aset per tahun perolehan dengan merk dari KIB & kondisi sekarang; **yang benar-benar dibeli** (merk/penyedia saat penerimaan) baru tercatat sejak Tahap E. Pagar "penerimaan hanya untuk rencana didanai" juga Tahap E.

**Catatan Tahap E (27 Okt).** Angka realisasi tidak lagi diketik: Diterima sebagian/penuh dan nilainya dihitung dari penerimaan, dan status pesanan (Dalam Proses / Tidak Terealisasi) hanya untuk rencana **didanai**. Realisasi yang sudah ada sebelum tahap ini dipindah jadi satu penerimaan bertanda *pindahan* — tidak masuk antrean (barangnya sudah di KIB provinsi) dan tidak tampil sebagai "yang dibeli". Koreksi penerimaan rencana yang sudah diterima penuh tetap khusus Admin, seperti koreksi realisasi sebelumnya. Cocok otomatis saat impor KIB memasangkan register baru dengan barang belum teregister yang golongan, tahun perolehan, dan harganya sama — kelihatan di pratinjau sebelum disimpan; yang tak punya pasangan tetap jadi register baru.

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

## 20. Koreksi salah input di Buku Aset (Tahap F, dikerjakan 29 Okt)

Tahap E membangun jalur maju (Tempatkan → Isi register → Hapus dengan SK) tanpa jalan mundur. Isian PRIMA (nama sehari-hari, barang, ruangan, kondisi) sudah bisa dibetulkan, tapi tiga salah input belum:

| Salah input | Yang terjadi sekarang |
|---|---|
| **Salah Tempatkan** (golongan keliru, penerimaan yang dipilih keliru) | Golongan tidak bisa diubah; register itu tak pernah cocok otomatis saat impor (pencocoknya golongan + tahun + harga); penerimaannya tidak bisa dihapus lagi karena sudah jadi register. |
| **Salah ketik Isi register** | Tombol "Isi register" hilang begitu kode terisi. Impor KIB berikutnya tidak menemukan register yang benar di PRIMA → menjadikannya **aset baru**: satu barang, dua catatan. Yang salah ketik cuma dilaporkan "tidak ada di berkas". |
| **Hapus dengan SK keliru** (aset salah, atau nomor SK salah ketik) | Tidak ada jalan kembali; impor KIB juga sengaja tidak menghidupkan aset yang dihapus. |

Tombol yang tersisa, **Hapus dengan SK**, bukan jalan keluar untuk salah input: catatannya akan mengaku dihapus dengan SK yang tidak pernah ada, dan unitnya **tidak kembali ke antrean** — antrean menghitung register DIHAPUS juga. Hitungan itu BENAR untuk penghapusan sah (kursi roda 2027 yang dihapus 2032 tidak boleh muncul lagi minta ditempatkan), jadi yang perlu ditambah adalah jalan lain, bukan mengubah hitungannya.

**Ketiganya bisa dibetulkan.** Yang tidak boleh berubah hanya satu: aset yang sudah ada di buku resmi provinsi keluar hanya lewat SK (§7.6, §10 butir 3). Garis pemisahnya asal catatan:

| Asal catatan | Dibetulkan lewat |
|---|---|
| Lahir dari berkas KIB (`penerimaan_id` kosong) | Sistem provinsi → impor ulang. Kode, register, dan kolom KIB tidak disunting di PRIMA — seperti sekarang. |
| Lahir di PRIMA lewat Tempatkan (`penerimaan_id` terisi) | Di PRIMA: register bisa dibetulkan atau dikosongkan; selama belum teregister, penempatannya bisa dibatalkan. |
| Sudah ditandai dihapus dengan SK | Nomor/tanggal/berkas SK bisa dibetulkan; membatalkan penghapusannya khusus Admin. |

### 20.1 Batalkan penempatan

Tombol **Batalkan penempatan** di kartu aset, dan di Buku Aset lewat centang (bisa sebagian unit, mis. 1 dari 3). Syaratnya diperiksa server:

1. lahir dari Tempatkan (`penerimaan_id` terisi);
2. **belum teregister** — kode, register, dan kunci impor kosong. Begitu nomor provinsi ada, ia sudah di buku resmi → hanya lewat SK;
3. status AKTIF;
4. bukan aset sasaran rencana mana pun (FK `RESTRICT` jadi jaring terakhir, pesannya disusun lebih dulu) dan bukan gedung sebuah ruangan (`gedung_aset_id`, soft-FK).

Akibatnya: baris aset dibuang beserta riwayatnya, **unitnya kembali ke antrean**, dan kalau penerimaannya sendiri yang salah, penerimaan itu bisa dihapus lagi di Pengadaan. Alasan wajib diisi. Jejak: audit `BBA_ASET_BATAL_TEMPATKAN` (rencana, penerimaan, golongan, nama, jumlah unit, alasan).

**Dibuang, bukan diberi status BATAL.** (a) Register itu tidak pernah ada di buku resmi — aturan "tidak pernah dihapus fisik" menjaga sejarah aset, dan ini bukan aset. (b) Status ketiga harus diingat di setiap kueri yang menghitung `bba_aset`: antrean, saringan Dihapus, impor ("tidak ada di berkas", "dihapus di PRIMA"), Excel, ringkasan dimiliki. Satu yang lupa = L69. Dibuang = semuanya benar dengan sendirinya. Pengecualiannya sudah ditulis di §10 butir 4.

Kunci: penerimaan `FOR UPDATE` dulu (urutan sama dengan Tempatkan), lalu register `FOR UPDATE` + angka kunci per register — satu basi, seluruhnya 409 (L77). Izin: EDIT Aset, sama dengan Tempatkan; yang menjaga adalah syarat "belum teregister", bukan perannya.

### 20.2 Betulkan register

1. **Betulkan register** di kartu aset untuk aset lahir di PRIMA yang sudah teregister: modal Isi register yang sama, terisi nilai sekarang, ditambah pilihan **Kosongkan** — kembali ke belum teregister, untuk saat nomor yang benar belum dipegang atau ternyata register itu milik unit lain. Riwayat `REGISTER` sebelum → sesudah (jenisnya sudah ada).
2. **Pagar server `isiRegister`: hanya aset lahir di PRIMA.** Sekaligus menutup temuan sampingan: aset KIB F dari berkas yang memang tanpa kode hari ini menampilkan tombol "Isi register". Mengisinya mengganti kunci impor (nama + letak + tanggal mulai) dengan `kode|register`, sehingga impor KIB F berikutnya tidak menemukannya dan membuat baris kembar. Ikut dibetulkan: aset seperti itu juga terhitung "belum teregister" (saringan, hitungan, label kartu, kolom Register daftar) — kini "belum teregister" = lahir dari penerimaan **dan** tanpa kode (`belumTeregister`, satu aturan untuk SQL dan layar). Betulkan dengan kode tanpa ruas tahun mengembalikan tahun perolehan ke tahun diterima, bukan tahun dari register salah ketik.
3. **Peringatan di pratinjau impor**: register baru di berkas yang golongan, tahun, dan harganya sama dengan aset lahir-PRIMA yang registernya tidak ada di berkas → "Kemungkinan salah ketik: PRIMA 000123 ↔ berkas 000132 — betulkan register di kartu aset dulu, lalu impor ulang." Hanya peringatan; Simpan tetap bisa. **Dibandingkan dengan SEMUA register baru di berkas, termasuk yang akan mengisi barang belum teregister** — ketahuan saat diuji: kalau masih ada unit sejenis yang belum teregister, nomor dari berkas dipasangkan ke unit itu, dan versi pertama peringatan ini diam. Nomor itu bisa saja milik unit yang salah ketik; dua-duanya kini tampil di pratinjau beserta ruangannya.
   **Kenapa tidak dipasangkan otomatis** seperti barang belum teregister: berkas ekspor provinsi bisa SEBAGIAN (berkas kalibrasi KIB C Bangsal Jiwa = satu lokasi), jadi register yang tidak ada di berkas belum tentu salah. Memasangkan otomatis bisa menimpa register yang benar dengan nomor unit lain. Barang belum teregister tidak punya nomor untuk ditimpa.
4. **Kecil, disarankan**: daftar "mengisi belum teregister" di pratinjau ikut menyebut ruangan PRIMA. Cocok otomatis yang sudah ada memasangkan menurut golongan + tahun + harga saja; dua unit sejenis di ruangan berbeda bisa tertukar kalau berkasnya satu lokasi. Dengan ruangan terlihat, tertukarnya ketahuan sebelum Simpan — dan kalau terlanjur, Kosongkan (butir 1) membereskannya.

Izin: EDIT Aset, sama dengan Isi register.

**Belum ditangani**: kembar yang SUDAH terjadi (impor disimpan tanpa membaca peringatannya) — belum ada tombol menggabungkan dua catatan, jadi dibereskan langsung di database. Selama tahap ini terpasang sebelum Tahap E dipakai di kantor, kasus itu tidak ada. **Ditemukan sesudahnya (29 Okt):** kembar juga lahir tanpa salah input sama sekali — saat provinsi sendiri mengganti nomor aset yang asalnya dari berkas, dan peringatan di atas sengaja diam untuk aset seperti itu. Keduanya ditangani §23.

### 20.3 Betulkan SK & batalkan penghapusan

Dua kesalahan yang berbeda, dua jalan:

- **Nomor, tanggal, atau berkas SK salah ketik** (asetnya memang dihapus) → **Betulkan SK** di kartu aset yang dihapus. Izin EDIT Aset. Tanggal ≤ hari ini, berkas lewat pagar context BBA, riwayat `UBAH` sebelum → sesudah, audit `BBA_ASET_HAPUS` berketerangan "koreksi SK".
- **Aset yang salah ditandai dihapus** → **Batalkan penghapusan**, khusus Admin (`bolehBatalkanFinal`, pola koreksi mundur penerimaan). Alasan wajib. Status kembali AKTIF, kolom SK dikosongkan, `siap_dihapus` **dihitung ulang** dari rencana penggantian yang diterima penuh (bukan dikembalikan dari ingatan — `hapusAset` sudah menolkannya), riwayat jenis baru `BATAL_HAPUS` (sebelum: SK; sesudah: AKTIF; catatan: alasan), audit `BBA_ASET_BATAL_HAPUS`. Impor KIB tetap tidak menghidupkan aset dihapus — satu pintu saja.

Kenapa yang kedua khusus Admin: menandai dihapus mencatat tindakan resmi; membatalkannya menyatakan SK itu tidak berlaku untuk aset ini — keputusan yang patut ditinjau orang kedua, bukan salah ketik. Betulkan SK cukup RT karena asetnya tetap dihapus.

### 20.4 Data & teknis

- Migrasi `migration-bba-koreksi.sql`: `bba_aset_riwayat.jenis` ditambah `BATAL_HAPUS` (MODIFY ENUM, `schema-mysql.sql` ikut). Tanpa kolom baru. **Wajib dijalankan di server kantor sebelum kodenya dipasang.**
- Route: `POST /aset/batal-tempatkan`; `PATCH /aset/register` diperluas (`{ kosongkan: true }` + pagar asal); `/aset/hapus` — POST hapus (sudah ada), PATCH betulkan SK; `POST /aset/batal-hapus` (bukan DELETE: perlu angka kunci + alasan di badan permintaan) — guard Admin di route DAN di `batalHapus`.
- Aturan murni: `lib/bba/koreksi.ts` (`alasanTakBisaBatalTempatkan`, `alasanTakBisaUbahRegister`) dan `lib/bba/aset.ts` (`lahirDiPrima`, `belumTeregister`, `curigaSalahKetik` — di sana karena memakai pencocok impor yang sama), dipakai server DAN tombol layar (L82).
- Audit baru `BBA_ASET_BATAL_TEMPATKAN`, `BBA_ASET_BATAL_HAPUS` digolongkan di `retensi-audit.ts` (perubahan data, 5 tahun).
- Regresi `scripts/test-bba-koreksi.mts`: fungsi murni + bagian MySQL kotak pasir 2079 (data `UJIF`, bersih otomatis) + uji mutasi; dijalankan dengan `--env-file=.env.local`.

### 20.5 Keputusan terbuka

| # | Pertanyaan | Bawaan |
|---|---|---|
| 1 | Batalkan penempatan membuang baris (bukan status BATAL)? | Ya (§20.1) |
| 2 | Batalkan penempatan boleh oleh RT (EDIT Aset)? | Ya — syarat belum teregister yang menjaga |
| 3 | Betulkan SK oleh RT, batalkan penghapusan khusus Admin? | Ya |
| 4 | Dugaan salah ketik di impor hanya peringatan, tidak menahan Simpan? | Ya |
| 5 | Ruangan PRIMA ikut tampil di daftar cocok otomatis pratinjau? | Ya |

## 21. Panduan alur kerja: menu, contoh, dan hubungannya

Bagian ini menjelaskan cara memakai menu yang sudah tersedia. Contoh nama barang, ruangan, dan angka di bawah hanya ilustrasi; sesuaikan dengan data dan dokumen rumah sakit. PRIMA adalah buku kerja, sedangkan sistem aset provinsi tetap menjadi buku resmi untuk KIB, nomor register, dan SK.

### Peta hubungan singkat

```text
Master (siapkan kamus barang, ruangan/gedung, dan format cetak)
   ├──► Buku Aset: impor KIB, rawat kondisi/lokasi, dan lihat barang yang diterima
   ├──► Rencana: susun kebutuhan, hubungkan ke barang/aset, lalu tetapkan anggaran
   │       └──► Pengadaan: proses hanya rencana yang ditandai DIDANAI
   │               └──► Penerimaan: catat barang yang benar-benar datang
   │                       └──► Buku Aset: tempatkan unit; isi register dari provinsi
   └──► Cetak & Excel: keluarkan laporan dari data aset/rencana yang sudah dicatat
```

**Contoh satu siklus:** Buku Aset sudah berisi 10 kursi roda dan hasil pemeriksaan menunjukkan 2 rusak berat. Perencanaan membuat rencana penggantian 2 unit, lalu menandainya DIDANAI. Petugas Pengadaan memproses pesanan dan mencatat penerimaan 2 unit. Unit baru muncul di antrean Buku Aset untuk ditempatkan di ruangan; setelah dicatat di sistem provinsi, register diisi di PRIMA atau dicocokkan saat impor KIB berikutnya. Bila unit lama memang harus keluar dari buku resmi, Umum Aset mencatat penghapusan dengan SK secara terpisah. Data yang sama kemudian dapat dilihat pada ekspor KIB, KIR, atau Buku Inventaris.

### 21.1 Buku Aset — `/buku-besar-aset/aset`

**Untuk apa:** daftar catatan aset per register KIB, bukan daftar rencana belanja. Satu kelompok di layar bisa mewakili banyak register yang sejenis, setahun perolehan, dan seruangan; buka kelompok untuk memilih unit tertentu atau membuka kartu asetnya.

**Alur awal — memasukkan buku provinsi:**
1. Umum Aset memilih **Impor KIB**, lalu memilih berkas Excel ekspor provinsi `.xlsx` yang memuat lembar KIBA–KIBF.
2. Periksa pratinjau: jumlah per golongan, aset baru, yang cocok, yang diperbarui, yang sama, dan yang tidak ada di berkas. Jika berkasnya ekspor sebagian, catatan yang tidak ada di berkas **tidak otomatis dihapus**. Bila muncul daftar **Mungkin aset yang sama, nomornya berubah** (provinsi mengganti nomor, atau register isian PRIMA salah ketik), pilih register berkas yang menjadi pasangannya — catatan PRIMA mendapat nomor baru dan ruangan, kondisi, serta riwayatnya tetap. Yang dibiarkan "bukan" akan masuk sebagai aset baru.
3. Pilih **Simpan impor** setelah hasilnya masuk akal. Impor ulang mencocokkan kode barang + register; nama sehari-hari, ruangan, dan kondisi yang sudah diperiksa di PRIMA tidak ditimpa oleh impor.
4. Buka kelompok atau kartu register untuk melengkapi nama sehari-hari dan tautan ke jenis **Barang** di Master. Kolom KIB diperbarui melalui impor, bukan disunting langsung di kartu.

**Contoh:** impor KIB C menghasilkan Gedung Bangsal I–VIII. Keterangan berkas menyebut nama gedung, sehingga petugas memastikan nama sehari-harinya terbaca benar. Setelah itu petugas dapat menghubungkan ruangan Bangsal III ke salah satu gedung dari kartu KIB C di Master → Ruangan.

**Merawat aset yang sudah masuk:**
- Saring berdasarkan golongan, tahun perolehan, kondisi, ruangan, gedung, barang, atau tanda seperti **Belum teregister**, **Siap diusulkan dihapus**, dan **Dihapus**. Pencarian bisa memakai nama, kode, register, atau keterangan.
- **Opname** tanpa pilihan register berarti memilih ruangan atau gedung; layar memuat aset di sana. Beri kondisi Baik (B), Rusak ringan (RR), atau Rusak berat (RB) pada unit yang diperiksa, tanggal pemeriksaan, dan bila perlu catatan/foto. Hanya unit yang diberi kondisi yang disimpan. **Catat kondisi** pada register terpilih adalah jalur yang sama untuk laporan kerusakan di luar jadwal opname. Tanah tidak memiliki kondisi.
- Centang beberapa register untuk **Pindah ruangan**, **Catat kondisi**, atau **Tautkan barang** sekaligus. Contoh: pilih dua kursi roda lalu pindahkan dari Bangsal III ke IGD; catatan pindahnya masuk riwayat.
- Buka kartu aset untuk melihat kolom KIB, tambahan PRIMA, kondisi dan pemeriksanya, hubungan tanah–gedung, rencana terkait, serta riwayat. Di sana juga tersedia aksi per aset: isi/betulkan register, hapus dengan SK, betulkan SK, atau koreksi lain sesuai status dan izin.
- Barang yang sama terlanjur tercatat dua kali (impor disimpan tanpa memasangkan nomornya): buka kartu catatan yang sudah berisi ruangan/kondisi, pilih **Gabungkan dengan kembarannya…**, pilih nomor kembarannya, isi alasan. Catatan itu mengambil nomornya; kembaran yang isinya murni salinan berkas dibuang.
- Register hasil Tempatkan yang belum teregister dan salah dibuat bisa **Batalkan penempatan**; unit kembali ke antrean **Barang diterima, belum dicatat** di Buku Aset. Ini bukan penghapusan aset resmi. Aset yang sudah memiliki register provinsi hanya dikeluarkan lewat **Hapus dengan SK**; pembatalan penghapusan khusus Admin.

**Contoh kondisi:** pilih gedung Bangsal III untuk opname, catat RR pada pemeriksaan tanggal 12 Agustus dengan catatan “atap bocor”. Informasi itu terlihat pada kartu aset dan membantu Perencanaan menentukan sasaran rehab. Jika pemeriksaan terakhir lebih lama dari jarak yang diatur di Master → Pengaturan, Buku Aset menandai aset perlu dicek ulang.

**Alur barang baru:** penerimaan non-rehab yang dicatat di Pengadaan muncul di **Barang diterima, belum dicatat**. Umum Aset memilih unit, menempatkannya di ruangan, dan mencatat kondisinya. Unit menjadi aset PRIMA berstatus belum teregister. Setelah kode dan register diterbitkan di sistem provinsi, isi di kartu aset atau impor KIB yang memuat register baru; pratinjau akan memperlihatkan pencocokan sebelum disimpan.

### 21.2 Rencana — `/buku-besar-aset`

**Untuk apa:** tempat Perencanaan mengubah kebutuhan menjadi rencana per tahun. Menu ini bukan daftar seluruh aset; informasi jumlah, kondisi, dan lokasi aset dibaca dari Buku Aset. Daftar bisa dilihat **Per Item** atau diringkas **Per Barang**.

**Alur dari Usulan Kebutuhan:**
1. Pilih tahun register yang dituju dan **Tarik dari Usulan Kebutuhan**.
2. Periksa pratinjau usulan berputusan final yang Disetujui maupun Ditolak. Item yang sudah pernah ditarik dilewati; tarik tidak menggantikan pemeriksaan dan penyusunan rencana.
3. Untuk item yang perlu direncanakan, lengkapi data item: uraian, jenis rencana, alasan, volume/harga, sumber anggaran, serta aset sasaran bila mengganti, memperbaiki, atau merehab aset tertentu. Untuk rencana manual gunakan **Tambah Item**.
4. Pilih **Barang** dari Master agar riwayat pembelian dan ringkasan aset sejenis dapat dibaca pada tampilan Per Barang. Tautan ini bukan pengganti uraian/spesifikasi item.
5. Isi sampai tiga referensi harga dan bukti dukung pada item. Gunakan **Lengkapi referensi** atau saringan **Referensi belum lengkap** / **Bukti belum lengkap** untuk menemukan pekerjaan yang masih kurang.
6. Setelah keputusan anggaran tersedia, centang rencana lalu pilih **Tandai didanai**, **Tidak didanai**, atau **Belum ditandai**. Hanya DIDANAI yang masuk daftar Pengadaan. Rencana yang sudah diproses tidak bebas diubah mundur seperti draf.

**Contoh:** untuk 2 kursi roda yang rusak berat, buat jenis **Penggantian**, isi alasan dan pilih dua register lama sebagai aset sasaran. Tautkan rencana ke Barang “Kursi Roda”, isi referensi harga, lalu tandai DIDANAI setelah masuk anggaran. Pengadaan sekarang dapat menemukan item itu. Untuk ventilator yang belum dimiliki, pilih **Pengadaan baru**; untuk atap Bangsal III yang rusak ringan, pilih **Rehab** dan tautkan gedung sasarannya.

**Per Barang** mengelompokkan rencana lewat kamus Master Barang agar riwayat beli lintas tahun terbaca bersama. Jika item lama belum tertaut atau dua nama barang ternyata sama, gunakan **Tautkan** atau Master → Barang → **Gabungkan** terlebih dahulu. **Saran tahun lalu** membantu menyalin rencana yang tidak didanai sebagai titik awal; periksa dan sesuaikan kembali sebelum menetapkan anggaran tahun baru.

### 21.3 Pengadaan — `/buku-besar-aset/pengadaan`

**Untuk apa:** daftar rencana yang ditandai DIDANAI untuk tahun yang dipilih. Rencana yang belum didanai memang tidak muncul sebagai pekerjaan Pengadaan.

**Alur satu pesanan:**
1. Pilih tahun, cari kode/uraian/barang, lalu saring status **Belum diproses**, **Dalam proses**, **Diterima sebagian**, **Diterima penuh**, atau **Tidak terealisasi**.
2. Buka spesifikasi/referensi/bukti untuk memeriksa apa yang direncanakan. Pilih **Proses & penerimaan** untuk menetapkan status pesanan; saat menjadi Dalam Proses, catat tanggal pesan/kontrak dan referensi harga menjadi riwayat yang dibekukan.
3. Saat barang datang, isi tanggal, jumlah yang datang, harga satuan riil, serta pilihan “yang dibeli”: referensi yang benar-benar dipakai atau **Beli di tempat lain**. Isi merk/tipe, penyedia, tautan, dan catatan bila relevan. Catat setiap tahap penerimaan secara terpisah.
4. Unggah BAST/foto pada **Bukti dukung** item. Volume dan nilai diterima dihitung dari catatan penerimaan, bukan diketik sebagai angka realisasi terpisah.
5. Untuk pengadaan barang, penerimaan yang belum ditempatkan terlihat pada antrean Buku Aset. Untuk rencana **Rehab**, penerimaan tidak membuat register baru: petugas memperbarui kondisi gedung sasaran melalui alur rehab.

**Contoh:** rencana 2 kursi roda bernilai anggaran Rp 8.000.000. Pesanan dicatat Dalam Proses; pada 14 Mei diterima 1 unit seharga riil Rp 3.900.000 dan BAST diunggah. Status menjadi Diterima sebagian, realisasi satu unit dihitung dari penerimaan, dan unit yang sudah datang itu langsung muncul di antrean Buku Aset untuk ditempatkan — tidak menunggu diterima penuh. Unit kedua dicatat saat datang dan menyusul ke antrean. Nomor register-nya baru ada setelah unit dicatat di sistem provinsi. Jika rencana penggantian mengaitkan kursi roda lama, aset lama baru ditandai siap diusulkan dihapus saat penerimaan penggantinya penuh; penghapusan resminya tetap perlu SK di Buku Aset.

### 21.4 Master — `/buku-besar-aset/master`

Master adalah data penunjang yang dipakai menu lain. Siapkan dan rapikan sebelum mengandalkannya untuk penyaringan, ringkasan, atau cetakan.

| Tab | Dipakai untuk | Contoh dan kaitannya |
|---|---|---|
| **Kategori** | Pilihan kategori pada formulir item rencana. | Tambahkan kategori seperti “Alat Kesehatan” agar pilihan kategori rencana seragam. Kategori ini berbeda dari golongan KIB A–F. |
| **Barang** | Kamus jenis barang yang menghubungkan rencana lintas tahun dan register aset. | Buat “Kursi Roda”, lalu tautkan item rencana dan kartu register kursi roda ke nama yang sama. Tampilan Per Barang dan riwayat pembelian dapat menggabungkannya. Jika “Kursi Roda” dan “Kursi Roda IGD” ternyata duplikat, gabungkan ke satu barang tujuan; item terkait ikut dipindah. Barang yang masih dipakai tidak dihapus langsung. |
| **Ruangan** | Daftar tempat aset berada; hubungkan ruangan ke gedung KIB C, luas, dan penanggung jawab. | Buat “IGD”, pilih gedung yang menaunginya dan isi PJ. Buku Aset memakai ruangan untuk penempatan, filter, dan opname; KIR memakai gedung/luas/PJ untuk isi lembar ruangan. Ruangan yang masih dipakai aset harus dirapikan atau asetnya dipindahkan sebelum dapat dihapus. |
| **Pengaturan** | Kop dan penanda tangan ekspor provinsi serta jarak pemeriksaan ulang kondisi. | Isi kode lokasi, bidang, satuan kerja, kota, nama/jabatan/NIP penanda tangan, dan Pembantu Pengurus Barang KIR. Jarak 12 bulan berarti kondisi perlu dicek ulang setelah setahun; ubah misalnya menjadi 6 bulan bila kebijakan opname semesteran. Pengaturan ini memengaruhi Excel/cetakan dan tanda “perlu dicek ulang” di Buku Aset. |

### 21.5 Cetak & Excel — `/buku-besar-aset/cetak`

**Untuk apa:** keluaran baca-saja dari data yang sudah ada; mengunduh Excel tidak mengimpor atau mengubah data. Ekspor format provinsi memakai kop/tanda tangan dari Master → Pengaturan dan hanya memasukkan aset aktif, bukan yang sudah dihapus.

| Keluaran | Kapan dipakai | Contoh |
|---|---|---|
| **KIB A–F** atau **KIB A–F sekaligus** | Laporan per golongan atau seluruh KIB. | Unduh KIB C untuk daftar gedung/bangunan; pilih gabungan untuk satu berkas enam lembar. |
| **KIR** | Daftar inventaris per ruangan. | Pilih IGD untuk satu lembar. Ruangan kosong juga dapat dipilih untuk mengunduh lembar kosong yang akan diisi. |
| **Hasil sensus barang** | Rekap kondisi yang diperiksa di PRIMA pada tahun sensus yang dimasukkan. | Masukkan 2026 untuk keluaran KIBAInv–KIBFInv dan rekap sensus 2026. Data impor yang belum pernah diperiksa bukan hasil pemeriksaan tahun itu. |
| **Rekapitulasi Barang Milik Daerah** | Jumlah dan nilai menurut akun/kode objek. | Unduh rekap seluruh aset aktif sampai bulan ini. |
| **Buku Inventaris BMD** | Satu daftar lintas golongan untuk format provinsi. | Gunakan untuk melihat inventaris lintas golongan dalam satu lembar/daftar. |
| **Buku Aset lengkap** | Format kerja PRIMA dengan kolom tambahan untuk pengolahan sendiri. | Saring di Excel berdasarkan nama sehari-hari, ruangan, gedung, kondisi, pemeriksa, barang, atau rencana terkait. |
| **Daftar rencana per tahun** | Ringkasan rencana dan kondisi aset yang dimiliki untuk satu tahun rencana. | Masukkan tahun 2027 untuk meninjau jenis rencana, volume/nilai, serta kondisi barang terkait. |

### 21.6 Siapa melakukan apa dan titik serah-menunya

- **Umum Aset (RUMAH TANGGA):** menjaga Buku Aset dan Master; mengimpor KIB, mengisi ruangan/kondisi, mengopname, menempatkan penerimaan, dan mencatat SK. Dapat membaca Rencana dan Pengadaan sesuai izin.
- **Perencanaan (PROGRAM):** membaca Buku Aset, mengelola Rencana, menarik usulan final, menautkan barang/aset sasaran, melengkapi referensi, lalu memutuskan tanda anggaran. Tidak mengubah catatan KIB.
- **Petugas Pengadaan:** setelah Admin memberi izin EDIT bagian Pengadaan pada akun yang ditunjuk, memproses dan mencatat penerimaan. Rencana dan Buku Aset tetap baca-saja baginya, kecuali bagian lain juga diberikan.
- **Admin:** dapat mengatur akses. Pembatalan penghapusan aset adalah aksi khusus Admin; hal itu tidak mengubah hak akses normal bagian lain.

**Titik serah yang perlu diingat:** (1) keputusan DIDANAI di Rencana membuka pekerjaan di Pengadaan; (2) penerimaan barang non-rehab membuka antrean di Buku Aset; (3) penempatan dan register menghubungkan barang yang dibeli kembali ke inventaris; (4) perubahan kondisi/lokasi/aset dan rencana menjadi sumber keluaran Cetak & Excel. Jadi bila angka atau laporan belum sesuai, periksa catatan sumber di menu pemiliknya—laporan tidak memperbaiki data secara otomatis.

## 22. Konsep usulan: koreksi satu aset tanpa impor ulang

Bagian ini **usulan pengembangan, bukan kemampuan yang sudah tersedia**. Tujuannya agar petugas tidak perlu menyiapkan dan mengimpor ulang satu berkas KIB hanya untuk membetulkan satu register, tanpa membuat PRIMA seolah-olah menjadi sumber resmi data provinsi.

> **Catatan 29 Okt:** nomor atau identitas yang **diganti provinsi** ditangani §23 — impor tetap sumbernya, dan berkas ekspor sebagian (satu golongan) sudah cukup. Menyunting kode/register langsung di kartu justru melahirkan kembar: impor berikutnya yang masih membawa nomor lama tidak menemukan pasangannya. Bagian ini tetap usulan untuk kolom keterangan dan belum dijadwalkan; saran: kode, register, golongan, tahun, dan harga tidak ikut (§23.4).

### 22.1 Prinsip dan batas data

Bedakan dua kelompok data pada kartu aset:

| Kelompok | Contoh | Cara kerja yang disarankan |
|---|---|---|
| **Data operasional PRIMA** | Nama sehari-hari, Barang, lokasi/ruangan, kondisi hasil pemeriksaan, catatan dan foto | Tetap dapat diperbarui langsung sesuai izin. Perubahan kondisi dan lokasi mengikuti riwayat yang sudah ada; impor KIB tidak boleh menimpanya. |
| **Data KIB dari provinsi** | Golongan, kode barang, register, nama resmi, rincian KIB, harga, asal-usul dan keterangan dari berkas sumber | Impor tetap menjadi cara utama sinkronisasi banyak data. Koreksi satu register boleh dilakukan dari kartu melalui aksi khusus, dengan alasan, validasi, riwayat sebelum/sesudah, dan penanda bahwa nilainya pernah dikoreksi di PRIMA. |

**Batas tanggung jawab:** koreksi langsung mengubah catatan kerja PRIMA, tetapi tidak mengubah sistem aset provinsi. Selama belum dicocokkan dengan data sumber yang berlaku, PRIMA harus menandainya sebagai **koreksi lokal belum diselaraskan**; jangan menyebut nilainya sudah resmi hanya karena sudah disimpan di kartu.

### 22.2 Alur koreksi langsung yang diusulkan

1. Petugas membuka kartu aset yang benar dan memilih **Koreksi data KIB**—berbeda dari mengubah nama sehari-hari, lokasi, atau kondisi PRIMA.
2. Layar menampilkan nilai saat ini dan sumber terakhirnya. Petugas mengubah hanya kolom yang keliru, mengisi alasan wajib (misalnya “salah ketik saat pencatatan register”), lalu meninjau ringkasan perubahan.
3. Server memastikan pengguna memiliki izin EDIT Aset, aset masih aktif, format/nilai sah, dan identitas register baru tidak bentrok dengan aset lain. Kode barang dan register diperlakukan sebagai identitas: koreksinya memerlukan konfirmasi khusus dan pemeriksaan keunikan, bukan perubahan bebas.
4. Simpan satu aset secara atomik dengan pemeriksaan `version`; jika kartu sudah berubah sejak dibuka, minta petugas memuat ulang agar perubahan orang lain tidak tertimpa. Catat pengguna, waktu, alasan, serta nilai sebelum/sesudah dalam riwayat.
5. Kartu menampilkan penanda **koreksi lokal belum diselaraskan** sampai data itu cocok dengan impor yang diperiksa atau petugas secara eksplisit menyatakan koreksi sudah dikonfirmasi pada sumber provinsi. Penanda tidak boleh hilang hanya karena halaman dimuat ulang.

### 22.3 Perilaku impor berikutnya

Impor tidak seharusnya selalu menang ataupun selalu kalah dari edit kartu. Pada pratinjau, bandingkan berkas dengan nilai PRIMA per aset dan kolom:

- **Sama:** tidak ada konflik; pertahankan nilai dan riwayat yang ada.
- **Berbeda, tanpa koreksi lokal tertunda:** tawarkan nilai dari berkas sebagai pembaruan impor biasa.
- **Berbeda, ada koreksi lokal tertunda:** jangan menimpa diam-diam. Tampilkan nilai saat ini, nilai dalam berkas, kolom yang berbeda, serta alasan dan pelaku koreksi. Petugas memilih **Gunakan nilai berkas**, **Pertahankan koreksi PRIMA**, atau **Lewati aset ini**; pilihan dan hasilnya masuk riwayat.
- **Identitas tidak cocok atau bentrok:** tahan pencocokan otomatis aset tersebut dan minta petugas memastikan register yang benar. Jangan membuat aset baru atau menggabungkan dua aset hanya berdasarkan kemiripan nama.

Jika nilai berkas dipilih, impor menyelaraskan kolom terkait dan menutup penanda koreksi lokal untuk kolom tersebut. Jika koreksi PRIMA dipertahankan, penandanya tetap aktif dan laporan harus tetap memperingatkan bahwa data berbeda dari berkas terakhir. Keputusan dibuat per kolom yang konflik agar perubahan yang tidak terkait tidak ikut tertahan.

### 22.4 Contoh pemakaian

**Salah ketik satu register:** kartu menunjukkan register `000123`, sedangkan dokumen koreksi yang sudah diverifikasi menyebut `000132`. Petugas membuka **Koreksi data KIB**, memasukkan register yang benar dan alasan, lalu menyimpan. PRIMA mencatat perubahan dan mencegah register duplikat. Tidak perlu mengimpor ulang seluruh KIB. Bila impor berikutnya masih membawa `000123`, pratinjau menunjukkan konflik; petugas dapat mempertahankan koreksi sambil menunggu berkas sumber diperbarui.

**Pembaruan banyak aset:** provinsi menerbitkan ekspor KIB baru dengan koreksi pada puluhan aset. Gunakan impor sebagai jalur massal; pratinjau menguraikan perubahan dan hanya meminta keputusan untuk aset/kolom yang berbenturan dengan koreksi lokal. Jadi edit kartu bukan pengganti impor, dan impor bukan syarat untuk setiap koreksi satuan.

**Kondisi rusak atau pindah ruangan:** perubahan kondisi hasil opname dan lokasi operasional tetap dilakukan lewat aksi kondisi/pindah yang sudah ada, bukan lewat **Koreksi data KIB**. Keduanya memiliki konteks, tanggal, pelaku, dan riwayatnya sendiri.

### 22.5 Hak akses, audit, dan keluaran

- Gunakan izin EDIT Aset yang sudah berlaku pada modul; seluruh validasi wajib di API, bukan hanya menyembunyikan tombol. Aksi pembatalan penghapusan khusus Admin tetap terpisah.
- Riwayat koreksi harus ditulis dalam transaksi yang sama dengan perubahan aset. Pertahankan angka `version` agar dua petugas tidak saling menimpa.
- Keluaran KIB yang memuat koreksi lokal belum diselaraskan perlu memberi peringatan yang terlihat sebelum diunduh. Jangan menghapus atau menyamarkan penanda hanya karena berkas ekspor berhasil dibuat.
- Untuk implementasi kelak, tentukan apakah status koreksi dan alasan disimpan per kolom atau per aset. Jika memerlukan kolom/tabel baru, perbarui `docs/schema-mysql.sql` dan sertakan migrasi MySQL; jangan menyimpan seluruh keputusan konflik hanya di state layar.

**Redaksi panduan yang disarankan setelah fitur tersedia:** “Impor KIB digunakan untuk menyelaraskan banyak data dari sistem provinsi. Koreksi satu register dapat dilakukan dari kartu aset dengan alasan dan riwayat; jika impor berikutnya berbeda, periksa konflik sebelum memilih data yang dipakai.” Sebelum fitur tersebut diterapkan, panduan operasional harus tetap menyatakan dengan jelas bahwa koreksi data KIB resmi dilakukan melalui impor.

## 23. Nomor diganti provinsi & catatan kembar (Tahap G, dikerjakan 29 Okt)

**Masalahnya.** Impor mencocokkan aset lewat `kunci_impor` (kode barang + register; KIB F: nama + letak + tanggal mulai). Kalau provinsi membetulkan register, kode barang, atau letak/tanggal mulai KIB F sebuah aset yang **asalnya dari berkas**, impor ulang hari ini:

- melahirkan aset **baru** bernomor baru — tanpa ruangan, kondisi hasil cek, nama sehari-hari yang sudah dibetulkan, barang, maupun kaitan rencana;
- membiarkan catatan lama tetap AKTIF dengan semua isian PRIMA itu, hanya disebut di "tercatat di PRIMA tapi tidak ada di berkas" — keterangannya "mungkin sudah dihapus atau ekspor sebagian", bukan "mungkin nomornya berubah".

Dugaan salah ketik Tahap F diam di kasus ini karena sengaja dibatasi ke register isian PRIMA. Itu kekeliruan rancangan §20: kembar dianggap hanya lahir dari peringatan yang diabaikan. Tidak ada data yang hilang, tapi satu barang jadi dua catatan dan belum ada cara membereskannya dari layar.

**Prinsip §11 tetap: nomor resmi milik provinsi.** PRIMA tidak menyunting nomor. Yang ditambahkan hanya cara menyatakan "nomor baru di berkas ini milik catatan lama itu" — saat impor (mencegah) dan sesudah terlanjur (membereskan).

**Satu aturan keselamatan untuk keduanya:** identitas selalu dipindahkan **ke** catatan yang memegang isian PRIMA, dan yang dilewati atau dibuang hanya catatan yang seluruh isinya salinan berkas. Akibatnya pilihan yang keliru bisa dipulihkan — impor berikutnya melahirkan lagi nomor yang tertinggal, lalu dipasangkan ulang — dan tidak ada isian PRIMA yang ikut hilang.

### 23.1 Mencegah — pasangkan di pratinjau impor

Calon pasangan: aset AKTIF yang tidak ada di berkas (golongan yang ada di berkas) ↔ register di berkas yang **belum ada** di PRIMA, golongan sama, dan:

| Asal catatan lama | Syarat calon | Kenapa |
|---|---|---|
| Dari berkas KIB | tahun perolehan + harga + **nama resmi** sama (besar-kecil huruf & spasi diabaikan — `kunciNamaBarang`) | Nama resminya juga dari provinsi, jadi syarat ini membuang barang beda jenis yang kebetulan setahun dan seharga. Kalau provinsi sekaligus mengganti nama resmi, calonnya tidak muncul — dibereskan lewat §23.2. |
| Lahir di PRIMA, sudah teregister (dugaan salah ketik Tahap F) | tahun + harga (aturan Tahap F) | Nama resminya diketik petugas saat Tempatkan, bukan dari provinsi — kalau dijadikan syarat, pasangan yang benar tersaring. |
| Lahir di PRIMA, belum teregister | — | Sudah dikerjakan cocok otomatis (§7.5). |

**Layar.** Blok "Kemungkinan salah ketik" Tahap F diganti **"Mungkin aset yang sama, nomornya berubah"**, daftar lengkap (bukan contoh 20). Per catatan lama: nama, nomor PRIMA, ruangan, tahun, harga, dan pilihan register berkas — bawaannya **"bukan — biarkan"**. Satu register berkas hanya bisa dipilih untuk satu catatan. Tombol **Pasangkan semua yang pasti** mengisi yang calonnya tepat satu dan calon itu bukan calon catatan lain (ganti nomor provinsi biasanya borongan satu lokasi). Calon yang tadinya akan mengisi barang belum teregister diberi keterangan "kalau dipasangkan di sini, [barang X] tetap belum teregister" (pelajaran D9 Tahap F).

**Simpan.** Layar mengirim berkas yang sama + daftar pasangan `{aset_id, kunci}` — bukan baris. Server membaca ulang berkas di bawah kunci impor, menghitung calonnya sendiri, dan menerima pasangan hanya bila ada di daftar itu; satu saja tidak cocok (isi buku berubah sejak pratinjau) → seluruh impor ditolak 409 "pratinjau sudah basi, periksa ulang". Urutan: cocok lewat kunci → **pasangan** → cocok otomatis belum teregister → sisanya aset baru.

Catatan yang dipasangkan mendapat kode, register, kunci impor, dan kolom KIB dari berkas (aturan `bandingAset`: kondisi hasil cek tetap menang). Nama sehari-hari, barang, ruangan, kaitan rencana & gedung, `penerimaan_id`, dan riwayatnya tetap. Riwayat `REGISTER` sebelum → sesudah: "nomor berubah di provinsi — dipasangkan saat Impor KIB *berkas*". Nomor itu tidak jadi aset baru.

Tetap pilihan manusia, bukan otomatis — alasannya sama dengan §20.2: ekspor bisa sebagian, jadi register yang tidak ada di berkas belum tentu ganti nomor. Simpan tanpa memasangkan tetap boleh (§20.5 #4 tidak berubah: tidak menahan Simpan).

### 23.2 Membereskan — gabungkan dengan kembarannya (kartu aset)

Untuk kembar yang sudah terlanjur: impor disimpan tanpa memasangkan, atau terjadi sebelum tahap ini. Tombol **Gabungkan dengan kembarannya…** di kartu aset AKTIF — dibuka dari catatan yang memegang isian PRIMA ("catatan ini"). Modal:

1. **Saran**: aset AKTIF lain yang golongan, tahun, harga, dan nama resminya sama — urut paling baru masuk dulu, dengan nomor, tanggal masuk PRIMA, dan berkas impor asalnya. Kembaran hampir selalu lahir belakangan, tapi saudara sejenis yang masuk bersama catatan ini juga bisa muncul — karena itu yang dipilih **nomornya**, sesuai surat/berkas koreksi provinsi.
2. **Cari nomor register** (golongan yang sama), untuk kembaran yang tidak masuk saran karena nama resmi atau harganya ikut dibetulkan provinsi. Nama resmi berbeda → peringatan di modal.
3. Ringkasan: nomor catatan ini sebelum → sesudah; kembarannya **dibuang**. Alasan wajib (≥ 5 huruf).

Syarat — diperiksa server (`alasanTakBisaGabung`) dan dipakai tombol juga (L82):

- keduanya AKTIF, golongan sama, bukan catatan yang sama;
- kembaran **lahir dari berkas** (`penerimaan_id` kosong — membuang yang lahir dari penerimaan mengembalikan unitnya ke antrean) dan **bersih**: riwayatnya hanya `IMPOR`, bukan aset sasaran rencana, bukan gedung sebuah ruangan. Kembaran yang sudah diisi di PRIMA (dipindah, dicek, ditautkan barang, dibetulkan namanya) ditolak dengan menyebut isiannya — menggabungkan dua catatan berisi berarti memilih isian mana yang menang, itu keputusan lain (§23.4);
- catatan ini boleh dari berkas atau dari Tempatkan, teregister maupun belum — yang terakhir sekaligus menutup kasus cocok otomatis gagal karena harga riil berbeda dari harga provinsi.

**Akibat, satu transaksi:** kedua baris dikunci `FOR UPDATE` urut id + angka kunci keduanya (L77) → rujukan kembaran dibaca SESUDAH dikunci → kembaran dihapus (riwayat impornya ikut; kunci impornya bebas untuk indeks UNIK) → catatan ini mendapat kode, register, kunci impor, kode objek, tahun, nama resmi, harga, asal-usul, keterangan, dan kolom KIB kembaran; kondisinya hanya bila belum pernah dicek. `penerimaan_id` tetap, jadi antrean tidak berubah. Riwayat `REGISTER` sebelum → sesudah + catatan "digabung dengan catatan kembar #… (Impor KIB …) — *alasan*". Audit `BBA_ASET_GABUNG`.

**Izin: EDIT Aset** (keputusan pemilik). Yang menjaga adalah syarat "kembaran bersih", bukan perannya: yang dibuang tidak memuat isian PRIMA apa pun.

### 23.3 Data & teknis

- **Tanpa migrasi.** Riwayat `REGISTER` sudah ada; jenis audit baru `BBA_ASET_GABUNG` (kolom audit berupa teks) digolongkan di `retensi-audit.ts` (perubahan data, 5 tahun).
- Aturan murni di `lib/bba/aset.ts`: `sejenisCalon` (SATU aturan untuk pratinjau impor dan saran kembaran), `calonGantiNomor` (menggantikan `curigaSalahKetik`; `RencanaImpor.curiga` → `calon`), `calonPasti`, `ubahGantiNomor` (dipakai pasangan impor DAN gabung), `selisihRiwayat`; `rencanakanImpor(lama, baca, pasangan)` melaporkan pasangan di luar daftar calon di `pasanganDitolak`, data layer membatalkan seluruh impor (`ImporBasiError`, 409 `PRATINJAU_BASI` — layar memuat ulang pratinjaunya). `alasanTakBisaGabung` di `lib/bba/koreksi.ts`.
- Route: `POST /aset/impor?step=simpan` menerima `pasangan` (Zod: ≤ 20.000, aset & kunci tidak kembar); `GET /aset/gabung?id=` (saran) dan `&register=` (cari) — izin LIHAT; `POST /aset/gabung` — izin EDIT Aset.
- Pratinjau memulangkan daftar calon **lengkap** (≤ 1.000 catatan × ≤ 50 pilihan, ditandai bila terpotong), bukan contoh 20; tiap pilihan menyebut barang belum teregister yang tadinya akan diisinya.
- Impor dan gabung saling menunggu lewat kunci baris (`asetLamaUntuk … FOR UPDATE`). Pasangan yang catatannya baru saja digabung orang lain ditolak sebagai pratinjau basi.
- Uji `scripts/test-bba-ganti-nomor.mts` (30): fungsi murni + MySQL kotak pasir 2078 (data `UJIG`, bersih otomatis) — ganti nomor aset asal berkas dengan & tanpa pasangan, KIB F letak dibetulkan, pasangan basi 409, gabung (isian PRIMA & rujukan tetap; kembaran tidak bersih — termasuk jejak yang hanya ada di riwayat — / jadi sasaran rencana / lahir dari penerimaan ditolak; angka kunci basi; unit Tempatkan berharga riil lain) + 41 uji mutasi tertangkap. Dicoba di peramban (kotak pasir `UJIG`): pratinjau impor menawarkan Kursi roda IGD 000123 ↔ 000132 sementara tensimeter setahun-seharga tidak, "Pasangkan semua yang pasti" → Simpan → nomor pindah dengan ruangan & kondisi tetap; kartu kembaran 000200 ↔ 000201 digabung; 375 px & tema terang. `test-bba-koreksi` (A4, A5, D9, D10) ikut disesuaikan: dugaan kini juga untuk aset asal berkas — perubahan yang disengaja.

### 23.4 Sengaja tidak dikerjakan

- **Golongan berubah** (reklasifikasi, mis. konstruksi KIB F selesai jadi gedung KIB C) — bukan ganti nomor, kolom KIB-nya berbeda. Catatan lama tetap muncul "tidak ada di berkas"; butuh jalur sendiri bila kasusnya terjadi.
- Menggabungkan dua catatan yang **sama-sama** sudah diisi di PRIMA (memilih isian per kolom).
- Menyunting kode/register langsung di kartu untuk aset dari berkas (§22) — nomor tetap dari provinsi.

### 23.5 Keputusan

| # | Pertanyaan | Bawaan |
|---|---|---|
| 1 | Izin pasangkan (impor) & gabungkan | EDIT Aset — **diputuskan pemilik 29 Okt** |
| 2 | Calon untuk aset asal berkas wajib nama resmi sama? | Ya — **diputuskan pemilik 29 Okt** |
| 3 | Tombol Gabungkan tampil di semua kartu aset aktif, bukan hanya bila ada saran? | Ya — kasus yang paling butuh (nama/harga ikut dibetulkan provinsi) justru tidak punya saran |
| 4 | Ada tombol "Pasangkan semua yang pasti"? | Ya — ganti nomor provinsi biasanya borongan satu lokasi |
