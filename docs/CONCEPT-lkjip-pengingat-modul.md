# LKJIP — pengingat otomatis "data modul berubah"

2026-11-03. Nol migrasi, nol endpoint. Lanjutan `CONCEPT-lkjip-tabel-tertaut.md` (Periksa Data Modul).

## 1. Masalah

Tabel & angka tertaut baru ketahuan basi kalau orangnya menekan **Periksa Data Modul** atau
**Finalisasi**. Tabel yang sengaja disetel **Murni** malah tidak pernah ketahuan: sejak foto realisasi
Murni dibekukan (`CONCEPT-kinerja-tutup-per-versi.md`), angkanya tidak berubah, jadi pemeriksa berkata
"sama" — tidak ada yang memberi tahu bahwa Perubahan sudah ada.

## 2. Perilaku (seperti tabel Google Docs yang bersumber dari Sheets)

- Dokumen DRAFT yang dibuka memeriksa sendiri 1,5 detik sesudah tampil, di latar belakang
  (`periksaSemua`, satu tarikan per resep sumber), lalu sekali lagi saat tab kembali dibuka bila
  pemeriksaan terakhir sudah ≥ 15 menit. Dokumen FINAL tidak diperiksa (tidak bisa diperbarui).
- Lencana di kepala blok:
  - kuning **"Data modul berubah: tekan Perbarui"** (narasi: "…Perbarui angka"), rinciannya di tooltip;
  - biru **"Ada versi lebih baru"** — tabel yang sengaja memakai Murni sementara sumbernya sudah punya
    Perubahan; angkanya tidak disentuh.
- Dock: **Periksa Data Modul (n)** = jumlah blok yang berubah. Panel Periksa ikut menampilkan kabar versi.
- **Hanya membaca.** Memperbarui tetap tombol di bloknya: editor tabel memegang isinya di state lokal,
  pemeriksa yang ikut menulis akan ditimpa balik.
- Lencana menempel pada **jejak isi blok** saat diperiksa (`sidikTertaut`) — sesudah Perbarui (atau
  suntingan apa pun) bloknya tersimpan ulang dan lencananya gugur sendiri.
- Pemeriksaan yang **gagal** (paling sering: tanpa akses modul sumber) **diam** — galat tiap membuka
  dokumen hanya melatih orang mengabaikannya. Panel Periksa manual tetap menyebutnya.

## 3. Kabar versi (`HasilTarik.info`)

Kolom opsional yang **tidak ikut dibandingkan Perbarui**. Diisi sumber Rekap E-Anggaran bila pilihannya
Murni dan sumber dana itu sudah punya versi lebih baru (`muatBahanRekap` → `versiLebihBaru`, dibaca dari
`ssk/versi-list` yang memang sudah dimuat untuk menentukan versi Murni) — kalimatnya
`kalimatVersiLebihBaru` (`lib/kinerja/versi.ts`). Sumber lain (Laporan per Sumber Dana) selalu memakai
versi berlaku, jadi tidak pernah membawa kabar ini.

Regresi: `npx tsx scripts/test-lkjip-pengingat-modul.mts` (22), 12 uji mutasi tertangkap.
