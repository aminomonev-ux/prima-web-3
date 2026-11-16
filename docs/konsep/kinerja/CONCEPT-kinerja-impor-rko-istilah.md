# CONCEPT — Import RKO membaca berkas berbeda bentuk, istilahnya sama

> Permintaan pemilik aplikasi, 2 Nov 2026: *"perbaikan agar nanti akurat import dapat
> membaca berkas yang mungkin berbeda bentuk tetapi istilahnya sama"* → *"langsung
> eksekusi saja"*. Pemicunya dua berkas "Belanja Pegawai Perubahan TA 2026" yang tidak
> bisa diimpor ke RKO GAJI sama sekali: 18/18 dan 17/17 baris ditahan.
>
> **Tahap 1 dikerjakan 2 Nov 2026. Nol tabel, nol kolom, nol migrasi, nol endpoint baru.**
> Tahap 2 (ingatan pasangan, kode rekening) belum.

---

## 1. Kenapa dua berkas itu gagal

Diperiksa dengan pembaca & pencocok asli, lawan RKO GAJI 2026 (nama sama dengan server):

| Masalah | Berkas tanpa kode | Berkas berkode |
|---|---|---|
| Nama beda: "Gaji Pokok" vs "Belanja Gaji Pokok PNS" — pencocokan hanya nama persis | 18 ditahan | 17 ditahan |
| "Sept 2026" tidak dikenali (pola hanya "Sep"/"September") → September 0 | ya | ya |
| 3 baris kelompok (BELANJA PEGAWAI, …) ikut jadi baris | ya | ya |
| "Kode Rekening" (paling kiri, memuat kata "rekening") terbaca sebagai nama baris | — | ya |
| "DPA Perubahan" tidak dikenali sebagai pagu → pagu 0 | — | ya |

Dan dua pengaman yang kurang: mode bawaan **Timpa** (0 baris cocok = tabel dikosongkan;
baris RKO yang hilang membawa realisasinya jadi yatim), dan tidak ada yang mencegah
berkas "Perubahan" ditimpakan ke versi MURNI.

## 2. Lapis 1 — membaca berkas dari istilah, bukan letak

`lib/data/kinerja-import-rko.ts`.

- **Kamus per peran kolom.** Nama baris: Nama/Uraian (3) > Rekening/Akun (2) > Belanja (1).
  Pagu: Pagu (3) > DPA (2) > Anggaran/Alokasi (1). Kode: Kode/Kd/Korek — dibaca sebagai
  keterangan, tidak pernah nama baris. Bulan: + Sept, Nop, Mrt, Peb.
  **Disingkirkan lebih dulu**: Persen/%, Total, Sisa, Realisasi, Deviasi, Selisih,
  Capaian, lalu Sumber/SSK. Kalau beberapa kolom cocok, istilah terkuat yang menang,
  bukan yang paling kiri ("Sisa Anggaran" di kiri tidak pernah jadi pagu).
- **Judul dua baris** ("Target Bulanan" digabung di atas Jan…Des): tiap baris di 20 baris
  teratas dicoba sendiri DAN digabung dengan baris bawahnya; yang skornya tertinggi
  menang, sama kuat → satu baris (kalau tidak, judul laporan di atasnya ikut menempel
  ke nama kolom di panel pemetaan).
- **Sheet** dipilih dari skor judul, baru jumlah baris.
- **Baris kelompok** (`tandaiKelompok`) = angkanya jumlah baris di bawahnya. Diperiksa
  dari bawah (subkelompok dulu, lalu kelompok di atasnya menjumlah baris yang bukan
  kelompok). Angka sama saja tidak cukup — wajib ada tanda dari berkasnya: pagu berupa
  rumus atau kode lebih pendek dari kode sesudahnya (tanda kuat), atau kapital semua
  (tanda lemah: diabaikan kalau semua baris kapital, dan hanya bila menjumlah ≥ 2 baris).
  Disebut di pratinjau, tidak diam-diam dibuang.
- **Pemetaan bisa dipaksa.** Hasil baca memuat `peta` (sheet, baris judul, kolom) dan
  `kolom` (judul per kolom). Panel "Pemetaan kolom" di modal mengirim balik `peta` yang
  dibetulkan (`PetaRkoSchema`, strict) → dibaca ulang tanpa menebak.

## 3. Lapis 2 — pencocokan bertingkat, selalu ke baris RKO yang sudah ada

`bandingkanRko(sskLama, rekening, berkas, pasangan)` di `lib/kinerja/gabung-rko.ts`.
Setiap baris RKO hanya boleh dipakai SATU baris berkas.

1. **persis** — nama sama (aturan lama).
2. **pilihan** — dipilih pemakai di kolom "Masuk ke"; hanya ke baris yang belum dipakai
   tingkat 1. `null` = "jangan dimasukkan" (melepas saran).
3. Nama persis ada di tab Rekening tapi belum di RKO → **baru** (tidak ditebak ke baris lain).
4. **kata** ("saran") — semua kata nama berkas ada di tepat SATU nama RKO yang belum
   dipakai. Diulang sampai tak ada yang bergerak: "Tunjangan Fungsional" punya dua calon
   sampai "Tunjangan Fungsional Umum" memakai barisnya. Dua baris berkas berebut satu
   calon = tidak ada yang dipasangkan. Kata pembeda (PNS/PPPK) tidak pernah dibuang.

Sisanya "belum berpasangan"; pilihan "Masuk ke" menawarkan baris yang belum dipakai,
urut kemiripan kata (`calonRko`). Karena semua pasangan menunjuk baris yang sudah ada,
`canonical_id` — dan realisasi Jan–Jul yang terikat padanya — tidak pernah putus; nama
yang tersimpan tetap nama RKO.

Hasil pada kedua berkas: **14 dipasangkan lewat kata, 1 dipilih tangan (Tapera PNS →
"Belanja Iuran Simpanan Peserta Tabungan Perumahan Rakyat PNS")**, 3 kelompok
dilewati, total bulan = pagu di semua baris.

## 4. Lapis 3 — pengaman di modal

`components/kinerja/ImportRkoModal.tsx`.

- Mode bawaan **Tambahkan**. Timpa menyebut bahwa realisasi baris yang hilang jadi yatim.
- **Terapkan mati** kalau tidak ada baris siap masuk, dengan kalimat sebabnya.
- Peringatan berkas berbunyi "Perubahan" (nama berkas/sheet) saat versi terbuka MURNI.
- **Skala ribuan** (`dugaSkalaRibuan`): label "ribuan" di nama berkas terbukti tidak bisa
  dipercaya (isinya rupiah penuh), jadi yang dibandingkan angkanya dengan pagu RKO
  terpasang; mayoritas ~seperseribu → tawaran "Kalikan 1.000" — tidak pernah otomatis.
- Jumlah baris yang total bulanannya ≠ pagu disebut.

## 5. Sengaja tidak (Tahap 2)

- **Ingatan pasangan** per sumber ("Tapera PNS" → barisnya) — butuh satu tabel kecil.
- **Kode rekening** di Rekening/RKO sebagai pegangan pencocokan — paling akurat jangka
  panjang, tapi kodenya harus diisi dulu untuk semua data yang ada.
- Kamus singkatan (Tapera = Tabungan Perumahan Rakyat): tiap entri harus dirawat dan bisa
  salah; pilihan tangan sekali + ingatan (Tahap 2) lebih jujur.

## 6. Uji

`npx tsx scripts/test-kinerja-import-rko.mts` — bagian G–N baru (kamus, judul dua
baris, baris kelompok, pencocokan bertingkat, skala ribuan, pemetaan dipaksa, bentuk
kode modal/route, dua berkas asli bila ada di Downloads).
