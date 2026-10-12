# Konsep — Simpan Realisasi & RKO E-Anggaran: tidak membuang ketikan, berjejak, bisa ditutup per bulan

Status: disetujui pemilik aplikasi 2026-10-12 ("eksekusi"). Tahap 1–3 SELESAI 2026-10-12; Tahap 4 ditunda.

Hasil: uji `scripts/test-kinerja-simpan-realisasi.mts` (108) + `-db.mjs` (38, MySQL, 2099), 36 uji
mutasi tertangkap, diverifikasi ujung-ke-ujung di peramban pada kotak pasir 2099 (§8).

## 1. Masalah

Layar Realisasi menampilkan SATU bulan, tetapi Simpan mengirim 12 bulan sumber itu dan
server menghapus seluruh `(tahun, sumber)` lalu menulis ulang (`saveRealisasiBatch`).
RKO (SSK) sama: satu baris per rekening, 12 bulan di kolom `months`, hapus-tulis ulang
per `(tahun, sumber, versi)` — untuk RKO itu memang wajar, RKO rencana setahun.

Angkanya aman (satu transaksi, pagar L87, gembok versi, Riwayat Simpan). Yang cacat:

1. **Ketikan bisa hilang.** (a) Gembok per tahun+sumber: simpanan orang lain di bulan
   LAIN membuat simpanan kita 409 dan layar langsung dimuat ulang — ketikan terbuang.
   (b) Tanpa bentrok pun: ganti sumber, ganti versi, ganti tahun, buka tab lain, atau
   "Buat Perubahan" di RKO memuat ulang data dan menimpa layar. Pengingat sebelum keluar
   hanya menjaga Master Rekening.
2. **Jejak hilang.** Sesudah hapus-tulis ulang, `updated_by`/`updated_at` ke-12 bulan
   berisi orang & jam simpanan terakhir; audit cuma "180 baris"; toast "Tersimpan 180
   baris" mengesankan 180 baris diubah.
3. **Bulan yang sudah dilaporkan tidak terkunci.** Januari yang sudah dikirim ke pusat
   bisa berubah tanpa tanda.
4. **(ditemukan saat membaca)** Versi acuan layar Realisasi ditentukan sumber RKO
   (`activeSumber`), bukan sumber Realisasi. Membuka Realisasi BLUD saat GAJI sudah
   PERUBAHAN-1 sedangkan BLUD masih MURNI → BLUD dimuat dengan versi yang tidak ia
   punya (semua baris yatim, Init berkata "SSK kosong").
5. **(ditemukan saat membaca)** "Buat Perubahan" menyalin dari DATABASE, bukan layar.
   Suntingan RKO yang belum disimpan tidak ikut tersalin, lalu terbuang saat layar
   pindah ke versi baru, dan versi lama sudah terkunci.

## 2. Prinsip yang dipertahankan

- **Kiriman tetap setahun.** Simpan per bulan DITOLAK: Init, Pulihkan Riwayat, pagar
  penurunan drastis, dan foto riwayat berpijak pada data setahun (L69). Semua manfaatnya
  didapat dengan server **membandingkan** data lama dgn kiriman.
- **Satu tombol yang menulis** (Simpan). Tidak ada simpan otomatis (L78).
- **Aturan dijaga server**; layar menjelaskan (L82).
- **Satu pembanding** `lib/kinerja/banding-realisasi.ts` — murni, tanpa impor DB, dipakai
  server DAN layar. Kunci baris = bulan + `ssk_canonical_id` (cadangan
  keterangan+uraian_ssk, sama dgn Init). Baris kembar dicocokkan menurut urutan
  kemunculannya.

## 3. Tahap 1 — Server tahu apa yang berubah (tanpa migrasi)

Di `saveRealisasiBatch`, di bawah gembok, SEBELUM DELETE: baca baris lama → bandingkan.

- Ringkasan per bulan: baris berubah / baru / hilang + selisih rupiah keuangan.
- **Audit & toast** menyebutnya ("September: 14 baris berubah (+Rp 1.250.000.000)").
- **Jejak per baris**: baris yang tidak berubah ditulis ulang dgn `updated_by`/
  `updated_at` LAMANYA; hanya yang berubah dapat orang & jam simpanan ini.
- **Tidak ada yang berubah → tidak menulis apa pun**: tanpa DELETE, angka gembok tidak
  naik, tanpa foto riwayat (50 slot tidak habis oleh klik iseng), tanpa audit.
- Gembok `kinerja_realisasi:{tahun}:{sumber}` kini SELALU diambil (INSERT IGNORE + FOR
  UPDATE), bukan hanya saat `expected_version` dikirim — Tahap 3 bergantung padanya.

"Berubah" = angka (`real_fisik`, `real_keuangan`, dibulatkan sen) ATAU label/penunjuk
yang ikut tersimpan (keterangan, program, kegiatan, subkegiatan, uraian_ssk,
ssk_versi_*). Yang turunan (pagu, persen, akumulasi) tidak disimpan, jadi tidak dihitung.

## 4. Tahap 2 — Layar tahu apa yang belum tersimpan (tanpa migrasi)

- `dasar` = isi terakhir dari server (dimuat / sesudah Simpan). "Belum tersimpan"
  **dihitung** dari layar vs `dasar`, bukan bendera yang dinyalakan tiap jalur (L79b) —
  ketik, Init, Impor, Samakan, Pulihkan otomatis terdeteksi.
- **Tampilan**: titik di pil bulan yang masih menyimpan ketikan + kalimat di samping
  Simpan ("Belum tersimpan: Agustus 1 baris · September 14 baris").
- **Pengingat** di semua pintu yang membuang isi layar: ganti sumber, ganti versi, ganti
  tahun, pindah menu/tab, Menu/Profil/Keluar, muat ulang/tutup tab. Satu penjaga di shell
  (`guardPending`) untuk Master + Realisasi + RKO; menjawab "lanjut" membuang isiannya.
- **Bentrok 409 tidak membuang ketikan** (Realisasi):
  1. muat data terbaru tanpa memasangnya;
  2. "ketikan saya" = layar vs `dasar`; "simpanan orang lain" = terbaru vs `dasar`;
  3. ketikan saya dipasang di atas data terbaru; sel yang diubah kedua pihak dengan angka
     berbeda didaftar → dialog "Pakai angka saya" / "Pakai angka tersimpan";
  4. angka kunci diambil dari muatan terbaru (L77), `dasar` = data terbaru;
  5. dialog menyebut siapa & jam berapa (dari `blud_locks.updated_by/updated_at`).
  Tidak menyimpan otomatis.
- **RKO**: belum-tersimpan yang sama (tanpa gabung bentrok — Tahap 4), dan **Buat
  Perubahan ditahan** selama ada suntingan RKO belum tersimpan ("Simpan dulu").
- **Versi acuan Realisasi mengikuti sumber Realisasi** (masalah 4): versi terbaru dipilih
  per sumber yang sedang dibuka di tab itu; pemuatan diberi nomor giliran supaya jawaban
  yang datang terlambat tidak menimpa yang terbaru.

## 5. Tahap 3 — Tutup Bulan (migrasi `migration-kinerja-bulan-tutup.sql`)

Keputusan pemilik: **per sumber**; **menutup DAN membuka boleh siapa saja yang boleh
menyimpan realisasi** ("biar mudah"); target RKO bulan tertutup yang berubah cukup
**diperingatkan**.

- Tabel `kinerja_bulan_tutup (tahun, sumber, bulan, ditutup_oleh, ditutup_pada)`, PRIMARY
  KEY `(tahun, sumber, bulan)` — menutup dua kali ditolak DB (L69-a). Ada baris =
  tertutup; membuka = hapus barisnya. Jejaknya di audit (`KINERJA_TUTUP_BULAN` /
  `KINERJA_BUKA_BULAN`, golongan perubahan data 5 tahun).
- **Berurutan**: bulan n hanya bisa ditutup kalau n−1 tertutup; yang bisa dibuka hanya
  bulan tertutup TERAKHIR. Sebabnya akumulasi: membuka Juli saat Agustus tertutup
  menggeser angka "s/d Agustus" yang sudah dilaporkan.
- **Menempel pada (tahun, sumber, bulan), bukan versi** — realisasinya memang tidak
  berversi. Buat Perubahan tidak dihalangi dan tidak membuka tutupan.
- **Pagar server** di `saveRealisasiBatch`, di bawah gembok yang sama: angka bulan
  tertutup yang berbeda dari DB → 409 `BULAN_TERTUTUP` + daftar rekening·bulan, tidak
  bisa ditembus `force`. Baris BARU bernilai 0 (hasil Init) diterima — tidak mengubah
  angka apa pun, dan tanpanya Init menawarkan baris yang sama tiap kali.
- **Tutup/Buka memakai gembok yang sama dengan Simpan** → tidak bisa terselip di tengah
  sebuah Simpan.
- **Semua jalur lain (L69)**: Impor melewati bulan tertutup & menyebutnya; Samakan Target
  mati di bulan tertutup; Pulihkan Riwayat hanya memulihkan bulan terbuka; Reset (scope
  realisasi) ditolak selama ada bulan tertutup; gabung-bentrok menyebut ketikan di bulan
  yang baru ditutup sebagai "tidak bisa dipasang".
- **Layar**: gembok di pil bulan, tabel bulan tertutup hanya-baca, spanduk "ditutup oleh
  X, tanggal …", tombol Tutup/Buka. Endpoint `POST /api/kinerja/realisasi/tutup-bulan`
  (sakelar `kinerjaMati`, Zod, rate limit). Daftar bulan tertutup ikut balasan GET
  realisasi (satu jawaban, L88).
- **RKO**: Simpan RKO yang mengubah target bulan tertutup atau pagu → 409
  `TARGET_BULAN_TERTUTUP` + daftar → dialog → kirim ulang dgn `setuju_bulan_tertutup`.
  Peringatan, bukan blokir (koreksi RKO sah). Pembandingnya isi tersimpan versi itu.
- Batas sengaja: yang dikunci hanya angka **realisasi**; target & pagu tetap ikut versi.

## 6. Tahap 4 (ditunda) — gabung bentrok untuk RKO

## 7. Uji

Fungsi murni diuji perilakunya + uji mutasi berkutipan utuh (L82c). Tahap 1 & 3 diuji di
MySQL sungguhan tahun kotak pasir 2099 (data 2026 hanya dibaca), termasuk balapan Tutup ×
Simpan. Tahap 2 di peramban dgn dua tab.

## 8. Ditemukan saat dijalankan

- `fetchJson` membuang isi balasan galat selain `message`/`status`/`code`. Akibat yang SUDAH
  ADA sebelum pekerjaan ini: dialog "Baris … akan berkurang banyak" E-Anggaran selalu berbunyi
  "tersimpan 0 baris, akan ditulis 0 baris". Kini sisa isinya ikut diteruskan (aditif).
- Kalau satu-satunya ketikan adalah sel yang bentrok, dialog bentrok tidak menyebut hasilnya
  belum tersimpan → toast sesudah pilihan.
- Pemilih tahun E-Anggaran hanya sampai 2040; uji layar 2099 menyisipkan opsinya lewat skrip
  halaman (tanpa mengubah kode).
- TIDAK dicoba lewat layar: Impor Excel di bulan tertutup (panel peramban tidak bisa
  mengunggah berkas) — dijaga uji statis G24 + mutasi.
