# Konsep — Form PK: lampiran menyebut asal sasaran & indikator (tampil saja, tidak ikut tersimpan)

Status: **KONSEP** (2026-11-12). Belum ada kode. Menunggu jawaban §6.

## 1. Permintaan

Saat memilih sasaran dan indikator di panel LAMPIRAN Form PK, pengguna ingin tahu **milik siapa**
sasaran/indikator itu — program, kegiatan, atau sub kegiatan mana di Rencana Aksi, dan siapa yang
memakainya. Keterangan ini **hanya tampil di layar**: tidak ikut ditambahkan ke baris lampiran,
tidak tersimpan di dokumen, tidak tercetak di Word.

## 2. Keadaan sekarang (dibaca dari kode)

- Level lampiran sudah otomatis dari unit Pihak Pertama (`unitLevel` dari `pk_unit_kerja.level`).
- Pilihan sasaran berasal dari **Master Sasaran PK** (`pk_sasaran`), bukan langsung dari Renaksi.
- Kolom `pk_sasaran.program/kegiatan/subkegiatan` berisi **teks SASARAN** (outcome Renaksi; nama
  entitas hanya bila outcome kosong — `bagianProgram` di `lib/pk/selaras-renaksi.ts`). Jadi yang
  sekarang tampil sebagai "Parent:" dan di kartu lampiran ("A → B") adalah sasaran induknya,
  **bukan** nama program/kegiatan. Nama program, kode nomenklatur, dan indikator induknya tidak
  pernah ada di Master Sasaran.
- Baris lampiran menyimpan `program/kegiatan/subkegiatan` (teks sasaran induk) — kolom ini dipakai
  `tabel-word.ts` untuk menyusun dokumen, jadi tidak boleh diubah artinya.

## 3. Yang diusulkan

Satu kotak **"Asal di Rencana Aksi"** di bawah pemilih sasaran (dan per indikator), terisi saat
sasaran dipilih:

```
Asal di Rencana Aksi 2026
  Program   : 1.02.02  PROGRAM PEMENUHAN UPAYA KESEHATAN …
  Kegiatan  : 1.02.02.2.01  Penyediaan Fasilitas Pelayanan …      (untuk level kegiatan/sub)
  Indikator : IND DUA → menjabarkan indikator program "Persentase …"   (bila sudah bertautan)
Dipakai juga di: PK Wadir Pelayanan 2026 (FINAL), PK Kabid Keperawatan 2026 (DRAFT)
```

- **Sumber "asal"**: baris `rencana_aksi` tahun dokumen yang outcome/namanya + indikatornya cocok
  dengan pilihan (aturan pencocokan yang SAMA dengan `sasaranAdaDiRenaksi`, supaya layar ini dan
  spanduk "Rencana Aksi berubah" tidak berbeda pendapat). Indikator induk dibaca lewat
  `induk_indikator_id` yang baru ada (kosong = tidak ditampilkan, bukan ditebak).
- **"Dipakai juga di"**: dokumen PK lain tahun itu yang lampirannya memuat sasaran + indikator yang
  sama (`sidikLampiran`), dengan nama unit Pihak Pertama dan statusnya. Ini yang menjawab "punya
  siapa" — Renaksi sendiri tidak menyimpan penanggung jawab.
- **Tidak tersimpan**: kotak ini membaca saja; `handleAdd` tidak berubah, `LampiranRow`, tabel
  `pk_dokumen_lampiran`, dan Word tidak disentuh. Nol migrasi.
- **Tidak cocok** (sasaran diketik manual di Master Sasaran): kotak menulis "Tidak ditemukan di
  Rencana Aksi 2026" — itu informasi juga, bukan galat.

## 4. Cara mengambil data

Satu endpoint baca baru `GET /api/perjanjian-kinerja/asal-sasaran?tahun=` (pagar = hak membuka
Form PK, sakelar PK dulu — L72), dipanggil sekali saat panel lampiran dibuka, memulangkan:
baris Renaksi tahun itu (level, kode, nama entitas, outcome, indikator, id, induk_indikator_id) dan
ringkasan lampiran PK lain (unit, status, sasaran, indikator). Pencocokan dikerjakan fungsi MURNI di
`lib/pk/` (bisa diuji tanpa DB). Alternatif tanpa endpoint baru — memakai `banding-renaksi` yang
sudah ada — tidak cukup: route itu dijaga hak MENGUBAH Master Sasaran, sedangkan pengisi Form PK
belum tentu punya hak itu.

## 5. Yang sengaja tidak dikerjakan

- Tidak mengisi otomatis apa pun ke baris lampiran (permintaan: tampil saja).
- Tidak menampilkan di Riwayat/Word.
- Tidak mengubah arti kolom `program/kegiatan` lampiran (dipakai pembuat Word).

## 6. Pertanyaan untuk Anda

1. "Punya siapa" maksudnya yang mana: **(a)** program/kegiatan/sub di Rencana Aksi (nama + kode),
   **(b)** pejabat/unit lain yang sudah memakai sasaran ini di PK-nya, atau **(c)** keduanya?
   Usulan saya **(c)**.
2. "Dipakai juga di" — hitung dokumen **DRAFT** juga, atau hanya **FINAL**? Usulan: keduanya,
   dengan label status.
3. Kotak asal tampil **sebelum** ditambahkan saja (di form atas), atau juga di **kartu lampiran**
   yang sudah ditambahkan (tetap tidak tersimpan, dihitung ulang tiap buka)? Usulan: keduanya.
