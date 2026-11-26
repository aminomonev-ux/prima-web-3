# Pejabat Penanda Tangan BLUD — siapa membaca, siapa mengubah

> Status: **DIEKSEKUSI** 2026-11-26 (konsep final 2026-11-25).
> Terkait: `CONCEPT-blud-format-unduhan.md` §10 (tanda tangan unduhan ikut Pengaturan),
> `CONCEPT-blud-realisasi.md` §3.1 keputusan #29 (asal tabel `blud_pejabat`).

## 1. Masalahnya

Sejak 2026-11-25 tanda tangan di unduhan Excel/PDF menu Cetak (DPA, DPA Perubahan, Pergeseran,
Rekap PJ) diambil dari **Pengaturan → Pejabat Penanda Tangan SPJ**: nama, NIP, pangkat, bunyi
jabatan. Ada tiga hal yang belum beres.

1. **Akun yang boleh mencetak belum tentu boleh membaca isinya.** `GET /api/blud/pejabat`
   dijaga `bolehLihat(…, 'pengaturan')` DAN sakelar **Realisasi** (`realisasiMati`). Akun yang
   hanya diberi akses Cetak, atau saat sub-modul Realisasi sedang ditutup, mendapat tanda tangan
   bergaris kosong — tanpa pesan apa pun.
2. **Tidak ada yang memberi tahu sebelum mencetak.** Kalau pejabat tahun itu belum diisi, orang
   baru tahu sesudah berkasnya dibuka.
3. **Daftar peran yang boleh mengubah terlalu longgar.** Menu Pengaturan `EDIT` dimiliki
   SUPER_ADMIN, ADMIN, PROGRAM, KEUANGAN, dan PERBENDAHARAAN (`lib/blud/peran.ts`). Akibatnya
   **Bendahara boleh mengubah siapa yang tercatat sebagai PPK** — pejabat yang memeriksa dan
   menyetujui pengeluaran bendahara itu sendiri. Itu bertabrakan dengan pemisahan tugas.

## 2. Keputusan

| # | Keputusan | Alasan |
|---|---|---|
| K1 | Data **Direktur** bisa DIBACA siapa pun yang boleh membuka Cetak, DPA, atau Pergeseran | Nama, NIP, pangkat Direktur tercetak di semua dokumen resmi — tidak ada yang bocor |
| K2 | Bendahara & PPK tetap di balik akses menu Pengaturan | Hanya dipakai lembar SPJ (menu Realisasi/Buku Kas), bukan unduhan Cetak |
| K3 | Sakelar yang menahan pembacaan Direktur = sakelar **BLUD**, bukan sakelar Realisasi | DPA/Pergeseran tidak ada hubungannya dengan Realisasi |
| K4 | Yang boleh MENGUBAH pejabat: **SUPER_ADMIN, ADMIN, KEUANGAN** | Kepala bidang keuangan yang menetapkan penanda tangan; pemisahan tugas bendahara ↔ PPK |
| K5 | PROGRAM & PERBENDAHARAAN: Pengaturan jadi **LIHAT** (hanya-baca) | Masih bisa melihat isinya, tidak bisa mengubah |
| K6 | **Tidak** dipecah per isian (nama saja / semua) | Nama, NIP, pangkat, jabatan satu orang selalu diubah bersamaan; kontrol halus membingungkan |
| K7 | Pengecualian per akun lewat **Admin Panel → Pusat Akses** (`blud.pengaturan`), tanpa fitur baru | Matriks per menu sudah ada; "akun A boleh, akun lain tidak" diatur di sana |
| K8 | Tempat mengatur tetap **Pengaturan BLUD**, sumber asli **Master Pejabat PK** ("Ambil dari PK") | Data per tahun anggaran milik keuangan; Admin Panel untuk akun & akses — tiga tempat untuk satu orang cepat atau lambat berbeda isi |

## 3. Perubahan

### 3.1 Membaca Direktur untuk mencetak (K1–K3)

- `GET /api/blud/pejabat?untuk=cetak&tahun=` — memulangkan **baris DIREKTUR saja** (nama, nip,
  pangkat, jabatan_teks). Pagar: sesi + sakelar BLUD (`bludMati`) +
  `bolehLihatSalahSatu(['cetak', 'dpa', 'pergeseran', 'pengaturan'])`. Tanpa audit (bacaan
  ringan, sama dgn daftar master lain); dibatasi `bludRateLimit`.
- Mode lama (tanpa `untuk`) tidak berubah: tetap seluruh pejabat, pagar menu Pengaturan +
  sakelar Realisasi — dipakai panel Pengaturan & lembar SPJ.
- Layar Cetak (`ambilDirektur`) memakai mode `untuk=cetak`.
- Gate G (`check:killswitch`) wajib tetap lulus — pembacaan baru ikut penjaga sakelar.

### 3.2 Baris info di halaman Cetak (masalah 2)

Di bawah tombol PDF/Excel, untuk view yang mencetak tanda tangan (DPA, DPA Perubahan,
Pergeseran, Rekap PJ):

- terisi → "Tanda tangan: **dr. Ikhwan Hamzah** (DIREKTUR) — dari Pengaturan 2026";
- kosong → peringatan kuning "Pejabat penanda tangan 2026 belum diisi — dokumen tercetak dengan
  baris tanda tangan kosong. Minta pengelola Pengaturan mengisinya.";
- gagal dibaca (tanpa akses / sakelar) → kalimat itu juga, dengan sebabnya.

Dimuat sekali per tahun terpilih; unduhan memakai data yang SAMA dgn yang ditampilkan (tidak
mengambil ulang saat tombol ditekan — yang tercetak harus yang sudah dilihat).

### 3.3 Pengaturan untuk akun hanya-baca (K5)

Panel sudah hanya-baca bila `bolehUbah` palsu (isian `disabled`, spanduk "Lihat saja"). Ditambah
satu kalimat di kepala kartu: "Diubah oleh: Super Admin, Admin, Kepala Bidang Keuangan — atau akun
yang diberi hak ubah di Pusat Akses." Daftar perannya diturunkan dari tabel peran yang sama
(`peran.ts`), tidak ditulis tangan.

### 3.4 Tabel peran (K4–K5)

`lib/blud/peran.ts`: hapus `'pengaturan': 'EDIT'` dari PROGRAM dan PERBENDAHARAAN (bawaan
keduanya `LIHAT`). SUPER_ADMIN/ADMIN (`bawaan: 'EDIT'`) dan KEUANGAN tetap.

**Ini perubahan perilaku** untuk akun PROGRAM & PERBENDAHARAAN yang selama ini mengisi pejabat.
Kalau kantor ingin satu akun tertentu tetap boleh, berikan hak ubah `blud.pengaturan` di Pusat
Akses untuk akun itu. Hapus versi & cadangan JSON tidak berubah (tetap SUPER_ADMIN/ADMIN).

## 4. Yang tidak berubah

- Tabel `blud_pejabat`, isiannya, dan tombol "Ambil dari PK" — nol migrasi.
- Lembar SPJ (Buku Kas/Realisasi) tetap membaca seluruh pejabat lewat jalurnya sendiri.
- Unduhan untuk tahun yang pejabatnya kosong tetap tercetak dgn baris bergaris (diisi tangan).

## 5. Uji

- `scripts/test-blud-peran.mjs`: baris `pengaturan` disesuaikan (PROGRAM & PERBENDAHARAAN → LIHAT).
- Uji baru: mode `untuk=cetak` hanya memulangkan DIREKTUR; akun Cetak-saja (tanpa Pengaturan)
  mendapat Direktur; sakelar Realisasi mati tidak menahannya, sakelar BLUD mati menahannya;
  Bendahara/PPK tidak ikut terkirim.
- Layar: baris info terisi / kosong; akun PROGRAM melihat Pengaturan hanya-baca dgn kalimat
  "Diubah oleh"; unduhan memakai Direktur yang ditampilkan.
- Gate G, tsc, ESLint, uji unduhan yang ada.

## 6. Perlu disampaikan ke kantor sebelum dipasang

Akun ber-peran **PROGRAM** dan **PERBENDAHARAAN** tidak lagi bisa mengubah pejabat penanda
tangan. Kalau ada yang memang ditugasi mengisinya, berikan hak ubah per akun lewat
Admin Panel → Pusat Akses → BLUD · Pengaturan.

## 7. Hasil eksekusi (2026-11-26)

- `lib/blud/peran.ts`: Pengaturan PROGRAM & PERBENDAHARAAN → LIHAT; `peranPengubah` + `LABEL_PERAN_BLUD`.
- `GET /api/blud/pejabat?untuk=cetak` → `getDirekturCetak` (`lib/blud/pejabat-data.ts`), pagar sakelar BLUD + menu pencetak.
- `lib/blud/ttd-cetak.ts` (murni): baca jawaban, kalimat info, view bertanda tangan. Layar Cetak memuat sekali per
  tahun; unduhan memakai Direktur yang ditampilkan dan menunggu bila masih dimuat.
- Panel Pengaturan: kalimat "Diubah oleh: …" dari tabel peran.
- Uji: `npx tsx --env-file=.env.local scripts/test-blud-pejabat-cetak.mts` (33, bagian E MySQL kotak pasir 2099),
  6 uji mutasi tertangkap; `test-blud-peran.mjs` & `test-blud-format-unduhan.mts` G5 disesuaikan.
- Dicoba di layar (akun dummy, data 2026 hanya dibaca): baris info terisi 2026 / peringatan 2040; akun PROGRAM melihat
  Pengaturan nonaktif + "Diubah oleh", Simpan ditolak 403, mode cetak hanya mengirim 4 isian Direktur, PDF unduhan
  memuat nama Direktur yang ditampilkan.
