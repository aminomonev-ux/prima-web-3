# Konsep: modul yang mengambil dari Rencana Aksi tahu saat sumbernya berubah

Status: keputusan pemilik di §9 (12 Nov 2026). Dikerjakan A → B → C, tiap tahap diuji lalu di-commit.

- **Tahap A selesai** (12 Nov): `renaksi_ganti_nama` + `catatGantiNama` / `listGantiNama` di `lib/data/rencana-aksi.ts`. Uji: `node scripts/test-renaksi-audit.mjs` bagian "Catatan ganti nama".
- **Tahap B selesai** (12 Nov): `kinerja_master.asal` (mig `migration-kinerja-master-asal.sql`); aturan MURNI `lib/kinerja/asal-renaksi.ts` (`dariRenaksi`, `tandaRantai`, `namaBertanda`, `jalurAdaDiRenaksi` = cermin isi awal migrasi); Init menulis RENAKSI; lencana `components/renaksi/LencanaRenaksi.tsx` di tab Master (nama entri) dan Rekening (kolom Program/Kegiatan/Sub + pilihan berantai " · Renaksi"). Ganti nama lewat Edit Master mempertahankan tanda. Entri yang **digabung** mewariskan tandanya sejak Tahap G. Uji: `npx tsx --env-file=.env.local scripts/test-kinerja-asal-renaksi.mts` (31; bagian C MySQL 2094), 6 uji mutasi tertangkap.
- **Tahap C selesai** (12 Nov): pembanding MURNI `lib/kinerja/banding-renaksi.ts` (`bandingRenaksi`: rantai ganti nama dirangkai per tingkat dengan kunci induk AKHIR; jalur Master diproyeksikan sesudah ganti nama, jadi turunan program yang berganti nama tidak disebut sendiri dan tujuan ganti nama tidak terbaca "baru"; induk yang hilang mewakili keturunannya; `kunciJalur` + `lengkapiIndukPilihan` dipakai bersama Init). Route baca `GET /api/kinerja/master/banding-renaksi`, route tanda `POST /api/kinerja/master/asal` (audit `KINERJA_MASTER_SELARAS_RENAKSI`), Init menerima `pilih`. Layar: `components/kinerja/PerbaruiRenaksi.tsx` — spanduk di tab Master & Rekening (dibuka lewat `guardPending`), angka di sidebar, dialog bercentang yang menulis lewat Edit Master (dry dulu, gabung bila tujuan sudah ada), Init berpilihan, dan route asal. Dicoba di peramban pada kotak pasir 2045: ganti nama program lewat API Renaksi → catatan → spanduk "1 berganti nama, 1 baru, 1 tidak ada lagi" + angka 3 → Terapkan → Master, turunan, Rekening berganti nama; spanduk & angka hilang sendiri; tema terang, 375 px, Esc. Uji: `npx tsx --env-file=.env.local scripts/test-kinerja-banding-renaksi.mts` (43; bagian C MySQL 2094 ujung-ke-ujung), 13 uji mutasi: 12 tertangkap, 1 setara (pemeriksaan ganda yang lalu dibuang).
- **Susulan C1** (12 Nov, permintaan pemilik): Simpan di Master memeriksa entri ketikan terhadap Renaksi (`ketikanAdaDiRenaksi`, pencocokan sama dengan pembanding — bintang & huruf besar diabaikan, induk harus cocok, salah ketik tidak ditebak). Bila cocok: dialog "Pakai dari Rencana Aksi" (nama ejaan Renaksi + tanda) / "Tetap manual" / Batal. Server memeriksa ulang jalurnya sebelum menerima `asal: RENAKSI` (400 `BUKAN_DARI_RENAKSI`). Edit nama, Import Master, Lengkapi Master tidak ditanya. Simpan borongan kini melaporkan baris yang gagal (dulu `fetch` tanpa memeriksa balasan selalu berbunyi berhasil). Spanduk ikut disegarkan tiap Master berubah.
- **Tahap D selesai** (12 Nov): `pk_program.asal` & `pk_sasaran.asal` (mig `migration-pk-asal.sql`, isi awal menebak; cermin murni `jalurAdaDiRenaksi` / `sasaranAdaDiRenaksi`). Aturan MURNI `lib/pk/selaras-renaksi.ts`: Master Program memakai `bandingRenaksi` yang sama dengan E-Anggaran (catatan ganti nama + jalur); Master Sasaran dibandingkan ISINYA terhadap baris yang dihasilkan Import Renaksi (`susunSasaranRenaksi`, kini satu penyusun untuk route impor DAN pembanding) — berpasangan bertahap: isi sama → nama + indikator terdalam → nama sama tinggal satu; satuan "Persen" = "%". Kedua master disimpan replace-all dari layar, jadi pembanding dihitung dari ISI LAYAR dan "Terapkan ke layar" berhenti di form (L78); yang menulis tetap Simpan. Import Renaksi menandai baris RENAKSI. Bahan dibaca `GET /api/perjanjian-kinerja/banding-renaksi` (hak MENGUBAH menu). Dokumen PK tidak disentuh (keputusan §9 butir 3). Tampilan bersama `components/renaksi/` (`SpandukSelaras`, `DialogSelaras`, `LencanaRenaksi` — warna lewat CSS `[data-theme]`, temuan uji layar: PK tidak merender ulang baris saat tema diganti). Dicoba di peramban (2045): Program "PROGRAM LAMA → PROGRAM UJI PK" membawa kegiatan & sub, sub baru ditambah, Simpan → spanduk hilang; Sasaran target 10 → 12 + baris baru; temuan "Persen" ≠ "%" dibetulkan. Uji: `npx tsx --env-file=.env.local scripts/test-pk-selaras-renaksi.mts` (33; bagian D mengadu isi awal migrasi dengan aturan murni di MySQL 2094), 12 uji mutasi tertangkap.
- **Tahap E selesai** (12 Nov): kartu RHK IKI ber-`renaksi_id` berlencana "Renaksi" (editor saja; PDF/Excel tidak). Dokumen **DRAFT** non-CUSTOM membandingkan tiap kartu dengan baris Renaksi ber-id sama (`app/(dashboard)/iki/_lib/banding-renaksi.ts`, MURNI): RHK, indikator, cara hitung, target tahunan & TW — uraian & target aksi milik pegawai tidak dinilai. Pasangan lewat id, jadi tidak ada tebakan. Spanduk + dialog: samakan (bawaan), lepas tautan untuk kartu yang barisnya dihapus atau yang sengaja dibuat berbeda (pengingat berhenti); berhenti di form, Simpan tetap tombol halaman. Bacaan lewat `/api/iki/import-renaksi?pantau=1` (tanpa audit per buka, batas laju sendiri). Dokumen FINAL diam (keputusan §9 butir 3). Batas: varian CUSTOM belum (tabel tanpa tautan per baris). Dicoba di peramban (2045): target 12 → 16 + TW, SUB DUA dihapus di Renaksi → lepas tautan → Simpan → tersimpan, uraian utuh; FINAL tanpa spanduk. Uji: `npx tsx scripts/test-iki-banding-renaksi.mts` (17), 7 uji mutasi tertangkap.
- **Tahap H selesai** (12 Nov, permintaan pemilik; mig `migration-renaksi-pindah-induk.sql` WAJIB): memindah kegiatan ke program lain / sub ke kegiatan atau program lain dulu terbaca "1 tidak ada lagi + 1 baru" — dan di Renaksi SENDIRI entitasnya terbelah: hanya baris indikator yang diedit yang pindah, saudara & turunannya tertinggal (cermin cacat T16 untuk ganti nama). Kini (1) `rencanaGantiNama` mengenali pindah induk (`indukBaru`/`indukProgramBaru`, hanya kegiatan & sub — sasaran sebuah program tidak disalin modul lain; isian induk kosong bukan pindah), `jalarkanGantiNama` ikut memindah baris saudara & turunan, dan `renaksi_ganti_nama.induk_baru`/`induk_program_baru` mencatatnya (NULL = induk tetap; catatan lama tetap terbaca). (2) Pembanding `bandingRenaksi`: peta catatan menyimpan LOKASI akhir (induk + nama), bukan nama saja, sehingga rantai "pindah lalu ganti nama" dan sebaliknya tersambung; entri yang dipindah SENDIRI (bukan ikut induknya) jadi item `gantiNama` ber-`program_ke`/`kegiatan_ke` (`itemPindah`), induk tujuan ditulis dengan ejaan MASTER (Edit Master mencocokkan induk persis). Spanduk menyebut "n pindah induk" terpisah. (3) E-Anggaran: dialog menerapkan lewat Edit Master yang menjalar (`badanUbahMaster`), SESUDAH entri baru dibuat — induk tujuan bisa baru di Renaksi (`indukTujuanDiBaru`, item tidak dimatikan, diperiksa ulang "dry" saat diterapkan). PK: `terapkanSelarasProgram` memindah baris kegiatan/sub di layar (berhenti di form). (4) Keterangan Tahap F: "Induk lama masih dipakai …"; kartu IKI tidak terhitung untuk pindah saja (kartu membandingkan nama & isi), untuk ganti nama + pindah dicari di induk baru. Batas: pindah lewat **Import Renaksi** tidak dicatat (hanya Data Entry); program pindah sasaran tidak dicatat. Dicoba di peramban (2045): pindah kegiatan di Data Entry → 3 baris (2 indikator + sub) pindah, keterangan "Induk lama …"; tab Master E-Anggaran → spanduk "1 pindah induk" → dialog "pindah dari PROGRAM ASAL ke PROGRAM TUJUAN, 1 entri di bawahnya ikut pindah" → Terapkan → kegiatan & sub pindah, spanduk hilang. Uji: `npx tsx --env-file=.env.local scripts/test-renaksi-pindah-induk.mts` (39; bagian D MySQL kotak pasir 2076), 18 uji mutasi tertangkap — satu sempat LOLOS (penjaga induk kosong saat nama ikut berganti: tanpa itu penjalaran mengosongkan program semua baris), kini A6b.
- **Tahap G selesai** (12 Nov, permintaan pemilik): entri yang digabung (Edit Master gabung, Rapikan Bintang) dulu membawa pergi tandanya — penerima MANUAL tetap MANUAL walau isinya milik Renaksi. Kini `pasangDanBuangKembar` mencatat `lebur` (dari → ke), dan `tandaWarisan` (`lib/kinerja/asal-renaksi.ts`, MURNI) menjadikan penerima RENAKSI bila salah satu yang melebur RENAKSI DAN jalur akhirnya ada di Renaksi (pagar L68 yang sama dengan tanda dari form). Ditulis `wariskanTanda` di transaksi yang sama, sesudah `tulisMaster`; Renaksi hanya dibaca bila memang ada entri RENAKSI yang dibuang. RENAKSI tidak pernah diturunkan. **PK juga**: Master Program menggabung baris kembar (Simpan & Rapikan Nama, "yang pertama dipakai") lewat `buangProgramKembar` — kini baris yang dipertahankan mewarisi RENAKSI dari kembarannya (kembar = kunci sama = jalur sama); baris tab lama tanpa kolom asal tidak dikarang tandanya. Master Sasaran tidak menggabung. Uji: `test-kinerja-asal-renaksi.mts` A14–A18 + C11–C13 (39), `test-pk-selaras-renaksi.mts` C6–C8 (36); 9 uji mutasi: 8 tertangkap, 1 setara (syarat "penerima belum RENAKSI" — menulis ulang RENAKSI tidak mengubah apa pun) dibuang dari kode.
- **Tahap F selesai** (12 Nov): sesudah Simpan yang mengganti nama program/kegiatan/sub di Data Entry Renaksi, balasan `POST /api/rencana-aksi` membawa `dipakai` dan layar menampilkan keterangan "Nama lama masih dipakai di E-Anggaran (Master: n), PK (Master Program: n), IKI (kartu RHK di n dokumen DRAFT: n)". Hanya membaca, SESUDAH transaksi ter-commit (`upsertRencanaAksi(…, hasil)` mengisi jejak ganti nama di luar transaksi); gagal membaca tidak menggagalkan simpanan. Yang dihitung (`lib/data/renaksi-pemakai.ts`): entri ber-asal RENAKSI dengan nama lama (bintang & huruf besar diabaikan, kegiatan/sub dibatasi induknya) dan kartu IKI DRAFT bertaut ke baris itu yang RHK-nya diambil dari nama. Modul lain tetap memperbarui lewat spanduknya sendiri. Kalimat MURNI `lib/renaksi/pemakai.ts`. Dicoba di peramban (2045): ganti nama program lewat form → toast "E-Anggaran (Master: 1), PK (Master Program: 1)". Uji: `npx tsx --env-file=.env.local scripts/test-renaksi-pemakai.mts` (11; bagian C MySQL 2094), 4 uji mutasi tertangkap.

Permintaan pemilik:

1. Isian yang diambil dari Renaksi diberi **tanda** di layar kerja (Master / Rekening E-Anggaran). Tanda itu **tidak** ikut ke Cetak.
2. Ada **pemberitahuan** ketika Renaksi berubah, dan dari situ bisa **memperbarui**.
3. Berlaku di semua modul yang terhubung. Dikerjakan bertahap, **dimulai dari E-Anggaran**.

---

## 1. Keadaan sekarang

| Modul | Cara mengambil dari Renaksi | Tahu saat Renaksi berubah | Tanda asal |
|---|---|---|---|
| E-Anggaran → Master (Init Renaksi) | disalin sekali | tidak | tidak ada |
| PK → Master Sasaran, Master Program | disalin sekali | tidak | tidak ada |
| IKI (Ambil / Isi dari Renaksi) | disalin sekali | tidak; yang ada hanya spanduk "atasan berubah" | jejak `iki_rhk.renaksi_id` tersimpan, tidak ditampilkan |
| LKJIP (tabel & angka tertaut) | salinan + resep | **ya**: lencana + Perbarui | ya |
| Dashboard | membaca langsung | selalu terbaru | tidak perlu |

Tiga hal yang menentukan rancangan:

- **Init Renaksi hanya menambah.** `initMasterFromRenaksi` (`lib/data/kinerja.ts`) membaca program, kegiatan, sub kegiatan Renaksi tahun itu, membuang bintang, lalu menyisipkan yang belum ada di Master. Ia tidak mengubah dan tidak menghapus entri yang sudah ada.
- **`kinerja_master` tidak mencatat asal.** Tidak ada kolom yang membedakan entri hasil Init dari entri ketikan tangan.
- **Entitas Renaksi tidak punya id.** Hierarkinya disambung teks nama, dan satu program bisa terdiri dari beberapa baris indikator. Jadi "program ini berganti nama" tidak bisa dibaca dari sebuah id.

Soal ganti tahun: semua modul bekerja per tahun dan menarik Renaksi tahun yang sama. Tahun baru tidak ikut dengan sendirinya; tetap harus ditarik di tiap modul.

---

## 2. Prinsip

1. **Salinan tetap salinan.** Tidak ada sinkron otomatis. Angka dan nama di dokumen yang sudah dicetak tidak boleh berubah tanpa ada orang yang menekan tombol.
2. **Perubahan dihitung, bukan ditandai "sudah dibaca".** Pemberitahuan muncul selama salinan memang berbeda dari sumbernya, dan hilang sendiri begitu sudah sama. Tidak ada status yang bisa basi (pola pengingat LKJIP).
3. **Tanda hanya di layar kerja.** Cetak, PDF, Excel, Word tidak memuatnya (pola penanda matriks Renaksi).
4. **Memperbarui lewat jalur tulis yang sudah ada.** Di E-Anggaran: ganti nama lewat `ubahMasterMenjalar`, entri baru lewat Init Renaksi. Tidak ada pintu tulis kedua, jadi pagar yang sudah ada berlaku sendiri (L78).
5. **Menghapus tidak pernah otomatis.** Entitas yang hilang dari Renaksi hanya diberitahukan.

---

## 3. Bagaimana perubahan Renaksi dikenali

| Perubahan | Cara dikenali | Pasti atau tebakan |
|---|---|---|
| Ganti nama entitas | **dicatat saat terjadi** (§4) | pasti |
| Entitas baru | ada di Renaksi, belum ada di modul | pasti |
| Entitas dihapus | bertanda "dari Renaksi" di modul, tidak ada lagi di Renaksi, dan bukan hasil ganti nama | pasti |
| Pindah induk (kegiatan pindah program) | terbaca sebagai satu hilang + satu baru | **tidak dikenali sebagai pindah** (batas, §8) |
| Isi indikator, target, satuan | dibandingkan dengan baris asal | pasti; baru dipakai PK & IKI |

Pembanding nama selalu memakai aturan yang sama dengan Init Renaksi: penanda matriks dibuang (`buangBintang` / `rapikanNamaEntitas`), huruf besar-kecil diabaikan, dan identitasnya **jalur** `[program, kegiatan, sub kegiatan]`, bukan nama saja (kegiatan senama di program lain adalah entitas lain).

---

## 4. Fondasi di Renaksi: catatan ganti nama

Ganti nama entitas Renaksi sekarang hanya lewat satu pintu: `upsertRencanaAksi` → `rencanaGantiNama` → `jalarkanGantiNama` (commit `9000e04`). Di transaksi yang sama ditulis satu baris catatan.

Tabel baru `renaksi_ganti_nama`:

| Kolom | Isi |
|---|---|
| `tahun`, `level` | tahun dan tingkat entitas |
| `dari`, `ke` | nama lama dan baru, apa adanya |
| `induk`, `induk_program` | induk lama, untuk membedakan entitas senama |
| `dicatat_pada`, `oleh` | waktu (jam server MySQL) dan pengguna |

Aturan:

- Catatan **tidak punya status** "sudah diterapkan". Modul memakainya hanya sebagai petunjuk pasangan: sebuah catatan berlaku bagi modul bila modul masih memegang nama `dari` dan Renaksi sekarang memuat `ke`. Kalau modul sudah diperbarui, catatan itu diam dengan sendirinya.
- Rantai `A → B → C` dirangkai pembaca menjadi `A → C`. `A → B → A` saling meniadakan.
- Jalur lain tidak menulis catatan, dan memang tidak perlu: Impor kini mengikuti ejaan tersimpan (konsep bersihkan-nama §13) sehingga tidak mengganti nama; mode `ganti`, hapus baris, dan salin tahun menghasilkan "baru" / "hilang".
- Retensi: catatan tahun yang sudah lewat tidak dibaca lagi; tidak ada pemangkasan di tahap ini (jumlahnya puluhan per tahun).

---

## 5. E-Anggaran

### 5.1 Tanda asal

- Kolom baru `kinerja_master.asal` ENUM(`MANUAL`, `RENAKSI`), bawaan `MANUAL`. Hanya bermakna untuk tipe program, kegiatan, sub kegiatan.
- **Init Renaksi** menulis `RENAKSI` pada entri yang disisipkannya.
- **Data lama**: migrasi menandai `RENAKSI` entri yang jalurnya (sesudah penanda dibuang) ada di Renaksi tahun yang sama. Yang tidak cocok tetap `MANUAL`. Ini satu-satunya bagian yang menebak, dan tebakannya aman: salah tanda hanya menambah atau mengurangi lencana, tidak mengubah angka.
- Entri `MANUAL` yang jalurnya kemudian muncul di Renaksi: ditawarkan "tandai dari Renaksi" di dialog Perbarui, tidak ditandai diam-diam.
- Menyunting nama entri `RENAKSI` dengan tangan di Master **tetap boleh**. Tandanya tetap; perbedaannya dengan Renaksi akan tampil sebagai "hilang dari Renaksi" (§5.3), dan orangnya bisa memilih melepas tanda.

### 5.2 Tampilan

| Tempat | Tampil |
|---|---|
| Tab **Master** | lencana kecil "Renaksi" di baris program / kegiatan / sub kegiatan |
| Tab **Rekening** | tanda yang sama di pilihan berantai dan di baris, **diturunkan** dari Master (nama + rantai cocok dengan entri ber-asal Renaksi); tidak disimpan di `kinerja_rekening` |
| RKO, Realisasi | tidak ada tanda (keputusan §9 butir 4) |
| Cetak Rekap / Detail, Laporan, Excel, PDF, Salin ke LKJIP | **tidak ada tanda** |

Lencana memakai token warna yang sudah ada dan tooltip standar ("Diambil dari Rencana Aksi 2026").

### 5.3 Pembanding

Fungsi MURNI baru `lib/kinerja/banding-renaksi.ts`:

- Masukan: entri Master tahun itu, entitas Renaksi tahun itu, catatan ganti nama tahun itu.
- Keluaran, empat daftar:

| Daftar | Isi | Tindakan yang ditawarkan |
|---|---|---|
| **Berganti nama** | entri ber-asal Renaksi yang namanya `dari`, dan Renaksi kini memuat `ke` | Perbarui nama (menjalar) |
| **Baru di Renaksi** | jalur Renaksi yang belum ada di Master | Tambahkan |
| **Tidak ada lagi di Renaksi** | entri ber-asal Renaksi yang jalurnya hilang dan bukan hasil ganti nama | Jadikan manual (lepas tanda) atau biarkan |
| **Sudah ada, belum bertanda** | entri manual yang jalurnya ada di Renaksi | Tandai dari Renaksi |

- Keturunan entri yang berganti nama **tidak** ikut tampil sebagai baris tersendiri: mengganti nama program otomatis membawa kegiatan dan sub kegiatannya (itu memang kerja `ubahMasterMenjalar`).

Dibaca lewat satu route baru `GET /api/kinerja/master/banding-renaksi?tahun=` (hanya membaca; pagar = akses E-Anggaran + sakelar modul, sama dengan Init Renaksi yang sudah membaca Renaksi dengan hak E-Anggaran).

### 5.4 Pemberitahuan

- Tab Master dan tab Rekening memanggil pembanding saat dibuka dan saat tab peramban kembali aktif sesudah 15 menit (pola pengingat LKJIP). Gagal memuat = diam.
- Bila ada isinya: spanduk amber di atas tabel, "Rencana Aksi 2026 berubah: 2 berganti nama, 1 baru, 1 tidak ada lagi", dengan tombol **Lihat & perbarui**. Angka kecil yang sama di butir menu Master pada sidebar.
- Daftar "sudah ada, belum bertanda" **tidak** memunculkan spanduk sendirian (bukan perubahan); ia hanya ikut tampil di dialog.
- Tahun yang Master-nya masih kosong sementara Renaksi berisi memakai spanduk yang sama: semuanya terbaca "baru".

### 5.5 Memperbarui

Dialog **Perbarui dari Rencana Aksi**: empat bagian sesuai §5.3, tiap baris bercentang, sebelum → sesudah.

- **Berganti nama**: untuk tiap baris dipanggil `ubahMasterMenjalar` mode `dry` dulu, dan jumlah baris yang ikut berubah per tempat ditampilkan (Rekening, RKO per versi termasuk yang terkunci, Realisasi), dengan kalimat yang sama seperti Edit Master. Nama tujuan sudah dihuni → alur **gabung** yang sudah ada, dinyatakan per baris. Diterapkan satu per satu; yang gagal disebut, yang berhasil tetap.
- **Baru**: memakai `initMasterFromRenaksi`, yang diperluas menerima daftar jalur terpilih (tanpa daftar = semua, perilaku sekarang).
- **Jadikan manual** dan **Tandai dari Renaksi**: satu tulisan kecil pada kolom `asal` lewat route Master yang sudah ada (izin = hak mengubah Master).
- Nama yang ditulis ke Master = nama Renaksi **tanpa penanda**, seperti Init.
- Sesudah selesai, pembanding dimuat ulang; spanduk hilang kalau sudah sama.

Yang tetap berlaku dari rancangan lama: ganti nama hanya label (versi RKO terkunci dan bulan tertutup ikut), angka kunci RKO dan Realisasi dinaikkan sehingga tab lain yang terbuka menerima 409, dan foto Riwayat Simpan membawa nama lama.

### 5.6 Audit

`KINERJA_MASTER_SELARAS_RENAKSI`: tahun, jumlah per jenis tindakan. Ganti nama per entri tetap tercatat oleh audit `ubahMasterMenjalar` yang sudah ada.

---

## 6. Modul lain (ringkas, dirinci saat gilirannya)

**PK**

- Kolom `asal` di `pk_sasaran` dan `pk_program`; Tarik dari Renaksi menandainya.
- Master Program: pembanding nama seperti E-Anggaran.
- Master Sasaran: tambah pembanding **isi** (indikator, target, satuan) terhadap Renaksi.
- Hanya **Master** yang diperbarui. Dokumen PK tidak disentuh; dokumen FINAL diam (§9 butir 3).

**IKI**

- `renaksi_id` sudah ada. Lencana "Renaksi" di kartu RHK (editor saja).
- Spanduk di dokumen **DRAFT** bila RHK, indikator, cara hitung, atau target berbeda dari Renaksi; perbarui per kartu, berhenti di form (yang menulis tetap tombol Simpan).
- Varian CUSTOM: lewat peran kolom, sama dengan Ambil dari Renaksi.

**Renaksi sendiri (pelengkap)**

- Sesudah ganti nama tersimpan, toast menyebut modul yang memakai nama itu ("dipakai E-Anggaran dan PK; perbarui dari layar Master masing-masing"). Hanya keterangan.

---

## 7. Tahapan pengerjaan

Tiap tahap berdiri sendiri, punya ujinya sendiri, dan di-commit terpisah.

| Tahap | Isi | Migrasi | Terlihat pemakai |
|---|---|---|---|
| **A. Catatan ganti nama** | tabel `renaksi_ganti_nama`; ditulis di transaksi `upsertRencanaAksi` | 1 tabel | tidak ada |
| **B. Tanda asal E-Anggaran** | kolom `asal`; Init menandai; penandaan data lama; lencana di Master dan Rekening; dipastikan tidak ikut Cetak | 1 kolom + isi awal | lencana |
| **C. Pemberitahuan & Perbarui E-Anggaran** | pembanding murni; route baca; spanduk; dialog; Init menerima pilihan | tidak ada | spanduk + dialog |
| **D. PK** | tanda asal + pembanding Master Program dan Master Sasaran | 2 kolom | lencana, spanduk, dialog |
| **E. IKI** | lencana RHK + spanduk dokumen DRAFT + perbarui per kartu | tidak ada | lencana, spanduk |
| **F. Keterangan di Renaksi** | toast "nama ini dipakai modul …" | tidak ada | toast |

Urutan A → B → C wajib. A lebih dulu karena catatan ganti nama baru terkumpul **sejak tabelnya ada**: ganti nama yang terjadi sebelum Tahap A tidak punya catatan dan akan terbaca "hilang + baru". Makin cepat A terpasang, makin sedikit yang seperti itu.

Migrasi A dan B bisa satu berkas bila dikerjakan berurutan; keduanya **wajib dijalankan di server kantor sebelum kodenya dipasang**.

Bukti per tahap:

- **A**: uji DB kotak pasir: ganti nama menulis tepat satu catatan di transaksi yang sama; simpan tanpa ganti nama tidak menulis; transaksi gagal tidak meninggalkan catatan.
- **B**: uji murni penandaan + uji bahwa keluaran Cetak, Excel, PDF tidak memuat tanda; dilihat di peramban (tema gelap, terang, 375 px).
- **C**: uji murni pembanding (rantai ganti nama, senama di induk lain, penanda, gabung) + uji DB ujung-ke-ujung di tahun kotak pasir (ganti nama di Renaksi → spanduk → Perbarui → Rekening, RKO, Realisasi ikut) + uji mutasi.
- Tahun 2026 hanya dibaca selama pengujian.

---

## 8. Batas dan risiko

- **Pindah induk tidak dikenali sebagai pindah.** Kegiatan yang dipindah ke program lain di Renaksi terbaca "hilang" + "baru". Mengenalinya butuh jangkar yang tidak berubah; `rencana_aksi.kode` (nomenklatur) bisa dipakai, tetapi Master belum menyimpan kode. Ditunda.
- **Ganti nama sebelum Tahap A** tidak tercatat (lihat §7).
- **Penandaan data lama menebak** lewat kecocokan jalur (§5.1). Risikonya hanya lencana.
- **Panjang nama**: `kinerja_master.nama` 255 huruf. Panjang kolom nama di `rencana_aksi` belum saya periksa; kalau lebih panjang, nama yang terpotong tidak akan pernah cocok. Diperiksa di Tahap B; nama terlalu panjang disebut di dialog, tidak dipotong diam-diam.
- **Dua orang memperbarui bersamaan**: `ubahMasterMenjalar` sudah memegang gembok Master sebagai perintah pertama; yang kedua akan mendapati entrinya sudah berganti dan barisnya gugur dari daftar.
- **Beban**: pembanding membaca tiga daftar kecil per pembukaan tab; tidak ada polling berkala.

---

## 9. Keputusan yang diminta dari pemilik

| # | Pertanyaan | Saran | Keputusan (12 Nov) |
|---|---|---|---|
| 1 | Entitas yang dihapus di Renaksi | cukup diberitahukan + pilihan "jadikan manual"; tidak pernah dihapus dari E-Anggaran | sesuai saran |
| 2 | Entri yang diketik tangan **di Master E-Anggaran** (bukan lewat Init Renaksi) yang namanya ternyata ada di Renaksi | ditawarkan "tandai dari Renaksi" di dialog, tidak otomatis | saran dipakai; pemilik meminta penjelasan |
| 3 | Dokumen PK / IKI yang sudah FINAL | diam; tidak diberitahu, tidak bisa diperbarui | diam; pemakai membuat dokumen baru atau membuka kunci dokumen lama lalu menyuntingnya |
| 4 | Tanda di RKO dan Realisasi | tidak perlu; cukup Master dan Rekening | sesuai saran |
| 5 | Mulai dari tahap mana | A + B + C berurutan (E-Anggaran lengkap), lalu berhenti untuk dicoba sebelum PK dan IKI | sesuai saran; tiap tahap diuji langsung lalu di-commit & push |
