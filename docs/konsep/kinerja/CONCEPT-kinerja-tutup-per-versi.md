# Tutup Bulan per versi RKO + foto realisasi versi final (E-Anggaran)

2026-11-03. Menggantikan aturan "tutupan menempel pada (tahun, sumber, bulan), bukan versi" di
`CONCEPT-kinerja-simpan-realisasi.md` §5. Mig `migration-kinerja-tutup-per-versi.sql` — **wajib
dijalankan di server kantor sebelum kodenya dipasang, sekali**.

## 1. Masalah

Realisasi satu set per sumber; versi RKO (MURNI / PERUBAHAN-n) hanya memilih pagu & target
pembandingnya. Karena tutupan menempel pada angka itu, menutup Januari di Perubahan ikut menutup
Januari Murni, dan sebaliknya. Dan Murni yang sudah digantikan Perubahan tetap bergeser angkanya
setiap realisasi disunting — laporan Murni tidak pernah benar-benar final.

## 2. Keputusan pemilik

- Klik **Buat Perubahan** (misal Oktober): MURNI tertutup Januari–Desember, angkanya dibekukan;
  PERUBAHAN-1 mulai dengan **semua bulan terbuka** (Jan–Sep bisa dikoreksi lalu ditutup lagi).
- Foto Murni **permanen** — hilang hanya kalau datanya dihapus (Reset).
- Murni yang sudah terkunci sebelum fitur ini: foto dibuat sekali saat pemasangan dari simpanan
  realisasi terakhir sebelum Perubahan dibuat; kalau sudah terpangkas, dari realisasi saat itu.
- Tutupan yang sudah ada dipindah ke **versi terbaru** tiap sumber (tampilan sama seperti sebelumnya).

## 3. Aturan

- `kinerja_bulan_tutup` + `versi_tipe`, `versi_seq` (PK ikut). Tutup/Buka hanya di versi **terbaru**
  (`alasanTolakVersi`, di bawah gembok realisasi) — Zod mewajibkan versi di body.
- **Versi final = terkunci (`locked_at`)**: 12 bulannya tertutup diturunkan dari kuncinya
  (`bulanFinal`), bukan 12 baris tutupan; angkanya dari `kinerja_realisasi_foto(_baris)`.
- **Buat Perubahan**: `kunciVersiSsk` → gembok realisasi (perintah pertama, L84) → salin & kunci
  versi asal → `potretRealisasi` (INSERT … SELECT realisasi berjalan, urut `bulan, id`; versi yang
  sudah berfoto tidak dipotret ulang) → angka kunci realisasi naik (tab Realisasi terbuka memuat ulang).
  RKO kosong (OBAT tanpa murni) tidak mengunci apa pun, jadi tidak dipotret.
- **GET realisasi (versi eksplisit)**: versi final → baris foto + 12 bulan tertutup + `final`
  (asal & jam foto); lainnya → realisasi berjalan + tutupan versi itu. Cetak, Rekap "Murni", dan tabel
  LKJIP memuat lewat GET yang sama.
- **Simpan Realisasi** dijaga tutupan versi terbaru (`versiTerbaruSsk`, aturan `pickVersiAktif`).
  **Peringatan RKO** (`TARGET_BULAN_TERTUTUP`) memakai tutupan versi yang disimpan.
- **Reset**: gembok versi → gembok realisasi; tutupan versi terbaru yang menahan (versi final tidak);
  RKO versi terbaru yang punya bulan tertutup ditolak; versi yang dihapus membawa tutupannya, foto
  versi yang dihapus / dibuka kuncinya dibuang (baris foto lewat FK CASCADE), tutupan lama versi yang
  kembali berjalan berlaku lagi.
- Layar Realisasi versi final: spanduk (`kalimatVersiFinal`, menyebut asal foto), tanpa tombol
  Tutup/Buka, Riwayat Simpan mati. Dialog Buat Perubahan menyebut realisasi ikut ditutup.

## 4. Batas

- Koreksi realisasi bulan lampau sesudah Perubahan hanya mengubah laporan Perubahan; laporan Murni
  tetap seperti saat Perubahan dibuat — itu arti final.
- Migrasi membandingkan `locked_at` (NOW() MySQL) dengan `disimpan_pada` (WIB): sejajar karena zona
  waktu sesi MySQL server kantor WIB.
- Laporan/KPI/Beranda tetap realisasi berjalan dibanding versi berlaku (tidak berubah).

Regresi: `npx tsx --env-file=.env.local scripts/test-kinerja-tutup-per-versi.mts` (51; bagian C MySQL
kotak pasir 2095, termasuk menjalankan langkah data migrasi), 24 uji mutasi tertangkap.
