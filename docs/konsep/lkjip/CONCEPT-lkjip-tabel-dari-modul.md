# LKJIP — salin tabel dari modul, tempel tertaut, ubah bentuknya

2026-11-03. Nol migrasi, nol endpoint. Lanjutan `CONCEPT-lkjip-tabel-tertaut.md` (tabel tertaut) dan
`CONCEPT-lkjip-pengingat-modul.md` (pengingat "data modul berubah").

## 1. Masalah

Tabel tertaut hanya bisa dibuat lewat **Hubungkan ke Modul** → memilih sumber, setelan, kolom satu per
satu. Padahal tabelnya sudah ada di layar modul (Cetak E-Anggaran, Cetak Renaksi, Laporan). Yang
diminta pemilik: seperti Google Docs — salin tabelnya, tempel "sebagai sumber", hasilnya tabel yang
sama dan tetap tersambung, lalu kolom & barisnya bisa dikurangi atau ditambah sendiri.

## 2. Salin di layar modul

Tombol **Salin ke LKJIP** (`components/lkjip/SalinKeLkjip.tsx`) di empat tabel:

| Layar | Sumber LKJIP | Pembangun resep |
|---|---|---|
| E-Anggaran Cetak → Rekap | `kinerja-rekap` | `salinanKinerjaRekap` |
| E-Anggaran Cetak → Detail (satu bulan) | `kinerja-detail` (baru, §5) | `salinanKinerjaDetail` |
| E-Anggaran Laporan → Detail Trend | `kinerja-laporan` | `salinanKinerjaLaporan` |
| Renaksi Cetak | `renaksi-cetak` | `salinanRenaksiCetak` |

Papan klip menerima tabel HTML layar itu apa adanya **plus** resepnya di atribut `data-prima-salinan`
(base64 JSON `SalinanModul`: sumber, setelan, kunci kolom, judul kolom, kelompok kepala, judul tabel).
Ditulis lewat event `copy` + `execCommand('copy')`, bukan Clipboard API — server kantor memakai http,
dan `navigator.clipboard` hanya hidup di https. Cetak Detail "Semua Bulan" tombolnya mati beserta
sebabnya: satu tabel LKJIP memuat satu bulan.

## 3. Tempel di LKJIP

Dua pintu, satu tujuan (modal tautan yang sudah ada, `TautanModal`):

- **Ctrl+V di tabel yang belum tertaut** → dialog "Tempel tertaut / Tempel biasa". Tertaut membuka modal;
  biasa = tempelan HTML seperti dari Excel (angkanya mati). Di tabel yang sudah tertaut ditolak dengan
  penjelasan.
- **Tempel dari Modul** (bilah tambah blok) → kotak tangkap Ctrl+V → blok TABEL baru → modal langsung
  terbuka.

Resep di papan klip **tidak dipercaya**: `bacaSalinan` memeriksa bentuknya ketat, dan angkanya
**ditarik ulang** dari modul dengan akses orang yang menempel — tanpa akses modul, ditolak seperti
Hubungkan biasa. Modal berhenti di form (L78): yang menulis tetap **Masukkan ke Tabel**; Batal tidak
mengubah apa pun.

**Pemilih kolom.** Tabel modul bisa lebih lebar dari batas tabel LKJIP (12 kolom). Modal menampilkan
semua kolom modul dengan centang; 12 pertama tercentang, sisanya mati sampai salah satu dilepas.

## 4. Ubah bentuk tabel tertaut (klik kanan)

| Aksi | Perilaku |
|---|---|
| **Sisip baris tangan di bawah** | Baris yang diketik sendiri, ditambatkan ke baris sumber di atasnya (`barisTangan[]`, kunci `tangan:<id>`). Bertahan saat Perbarui; jangkarnya hilang dari sumber → pindah ke akhir tabel dan disebut di dialog Perbarui. Sel Nomor & rumus tidak bisa diketik. |
| **Sembunyikan baris** (baris sumber) | Masuk daftar `sembunyi` — tampilkan lagi lewat Atur Bentuk. |
| **Hapus baris tangan** | Dibuang dari resep; isinya ditanyakan dulu. |
| **Hapus 1 kolom** | Langsung dari tabel. Ditolak (dengan alasan) bila kolom itu dirujuk rumus kolom lain atau tinggal satu kolom; kolom isian tangan yang berisi ditanyakan dulu. |

Ketiganya langsung tersimpan (`pasangDanSimpan`, seperti Perbarui). Aturannya MURNI di
`lib/lkjip/tautan.ts` (`sisipBarisTangan`, `buangBarisTertaut`, `hapusKolomTertaut`) dan hasil aksi
lokal **wajib sama** dengan menyusun ulang dari sumber (`bangunBadan`) — kalau tidak, pengingat
otomatis melapor "berubah" untuk tabel yang tidak berubah.

**Ditemukan saat dicoba di peramban**, dan karena alasan yang sama:
- sel baris tangan dulu tanpa format, jadi ketikan 250000000 tampil mentah di samping 1.800.000.000 →
  `pasangFormatTangan` memakai format sel sumber pertama kolom itu, di aksi lokal DAN bangun ulang
  (`selSama` membandingkan `nf/dec`);
- kolom rumus di baris tangan baru dihitung saat Perbarui → `hitungRumusTangan` menghitungnya di baris
  yang tampil (= yang disimpan), memakai `hitungRumusBaris` yang sama.

**Audit 2026-11-04**, ikut dibereskan:
- **Batal** di modal "Tempel dari Modul" (atau penarikan gagal karena tanpa akses) dulu meninggalkan blok
  tabel kosong yang ikut bernomor "Tabel n" di Word dan menggeser nomor tabel sesudahnya → `onSalinanBatal`
  membuang blok itu, hanya bila masih kosong (`tabelBelumDiisi`). Masukkan tidak memicunya.
- Batas baris tangan satu angka (`BATAS_BARIS_TANGAN` = 200) untuk skema, fungsi sisip, dan menu — dulu
  layar mengizinkan sampai batas tabel (500) lalu server menolak sisipan ke-201 sesudah barisnya tampil.
- Kolom rumus membaca isian tangan bergaya Indonesia ("1.250.000", "Rp 5.000") lewat `angkaKetikanId` —
  dulu `Number()` → "—". Sel BERFORMAT tetap dibaca angka mesin: rumus atas kolom persen yang sudah ada
  tidak bergeser.

Skema: `barisTangan` terdaftar di `TautanSchema` (Zod membuang kunci tak dikenal) + `superRefine`: isi
sejajar kolom, dan himpunan kunci `tangan:` di `kunciBaris` = id `barisTangan`.

## 5. Sumber baru: E-Anggaran Cetak Detail per sumber (`kinerja-detail`)

Satu sumber dana, satu bulan, versi `berlaku` | `murni` | `TIPE:SEQ` (`lib/lkjip/sumber/kinerja-detail.ts`).
Datanya GET realisasi yang sama dgn layar Cetak (versi final membaca foto realisasi). **Akumulasi
dihitung dari setahun penuh lalu baru disaring bulannya** — menyaring dulu membuat kolom Akum hanya
memuat bulan itu. JUMLAH = `hitungJumlahBulan` (rekening yatim tidak ikut, disebut di catatan seperti di
layar). Kunci baris `cid:<ssk_canonical_id>`. Versi bukan-terbaru membawa kabar "versi lebih baru"
(`HasilTarik.info`, §3 konsep pengingat).

## 6. Batas

- **Renaksi Cetak belum dicoba di peramban** — kotak pasir Renaksi tidak berisi data; jalurnya diuji
  lewat suite saja.
- Ctrl+V sungguhan tidak bisa dipicu alat uji (papan klip sistem tak terjangkau); di peramban event
  `paste` dipicu skrip dengan HTML hasil tombol Salin yang direkam dari event `copy`-nya.
- Persen bertitik ("100.00%") di layar Cetak E-Anggaran yang dulu ikut terbawa Tempel **biasa** sudah
  dibereskan di `ced5010`/`5bd5ce9` (`tulisPersen`); Tempel **tertaut** memang tidak pernah kena.

Regresi: `npx tsx scripts/test-lkjip-tabel-dari-modul.mts` (66), 43 uji mutasi tertangkap (satu mutan
setara dibuang: urutan format ↔ rumus baris tangan tidak berpengaruh).
