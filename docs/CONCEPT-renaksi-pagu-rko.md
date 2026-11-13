# Konsep — Pagu sub kegiatan Renaksi sebagai batas pagu RKO E-Anggaran

Status: **KONSEP, DITUNDA** (2026-11-13). Belum ada kode. Pertanyaan §5 disimpan untuk dibahas nanti (keputusan pemilik).

---

## 1. Keadaan sekarang (hasil cek)

**Di Renaksi**
- Pagu disimpan di kolom `rencana_aksi.anggaran_nominal`, hanya untuk baris **sub kegiatan**. Data Entry
  menampilkan isiannya di tiap baris sub kegiatan.
- Pagu kegiatan, program, sasaran, dan tujuan **tidak disimpan**. Semuanya dijumlah saat ditampilkan oleh
  `anggaranRollup` (`app/(dashboard)/rencana-aksi/_lib/types.ts`). Hasilnya muncul di kolom Anggaran Cetak
  (layar, PDF, Excel, dan tabel LKJIP tertaut) serta di Realisasi.
- Penjumlahan ke atas memakai **nama** entitas (program + kegiatan), **bukan tautan indikator induk**. Itu
  memang benar: pagu milik entitas (sub kegiatan), bukan milik indikator. Jadi mengisi atau mengubah tautan
  indikator tidak mengubah angka pagu kegiatan/program.
- **Celah:** satu sub kegiatan dengan dua indikator tersimpan sebagai dua baris. Kalau pagu diisi di kedua
  baris, penjumlahan ke atas menghitungnya **dua kali** (dijumlah per baris, bukan per entitas). Di data dev
  belum ada kasusnya karena pagu 2026 belum diisi sama sekali (0 dari 18 baris). Server kantor perlu dicek
  dengan kueri di §6.

**Di E-Anggaran (RKO)**
- Pagu RKO tersimpan per rekening (`kinerja_ssk.pagu`), per **sumber dana** (GAJI, BLUD, HARLEP, …), per
  **versi** (Murni / Perubahan ke-n). Tiap baris membawa nama program, kegiatan, dan sub kegiatan.
- Nama-nama itu berasal dari Master E-Anggaran, yang sebagian bertanda "dari Rencana Aksi". Penyamaan nama
  ke Renaksi sudah tersedia: `kunciNamaRenaksi` / `jalurAdaDiRenaksi` (`lib/kinerja/asal-renaksi.ts`)
  membuang bintang penanda dan mengabaikan huruf besar-kecil. Contoh di data dev: "Penyediaan Gaji dan
  Tunjangan ASN **".
- **Belum ada hubungan apa pun** antara pagu RKO dan pagu Renaksi.

## 2. Usulan aturan

> Untuk satu sub kegiatan: **Σ pagu RKO semua sumber dana (versi terbaru tiap sumber, tanpa baris yang
> dinol-kan) ≤ pagu sub kegiatan di Renaksi tahun yang sama.**

- Sub kegiatan dicocokkan lewat jalur program → kegiatan → sub kegiatan, memakai aturan nama yang sudah ada
  (`kunciNamaRenaksi`). Jangan menulis pembanding nama kedua.
- Pagu Renaksi **kosong** = tanpa batas. Data lama dan sub kegiatan yang belum diisi pagunya tidak terganggu.
- Sub kegiatan RKO yang **tidak ada** di Renaksi tidak diperiksa, tetapi disebut di layar ("di luar
  Rencana Aksi").
- Hanya versi RKO **terbaru** tiap sumber yang dihitung. Versi yang sudah terkunci (Murni sesudah ada
  Perubahan) tidak dihitung dan tidak diperiksa ulang.

## 3. Usulan tahapan

**Tahap A — pagu milik sub kegiatan, bukan milik baris** (menutup celah dobel)
- Menyimpan pagu di satu baris sub kegiatan ikut mengisi semua baris indikator sub kegiatan yang sama
  (pola penjalar ganti nama), dalam transaksi yang sama dan di bawah kunci tahun Renaksi.
- `anggaranRollup` mengambil **satu nilai per sub kegiatan**, bukan menjumlah semua barisnya.
- Data lama yang barisnya berisi angka berbeda disebut di layar (spanduk) dan tidak dibetulkan otomatis,
  karena mesin tidak bisa tahu angka mana yang benar.
- Impor Renaksi ikut aturan yang sama (L69).

**Tahap B — hanya menampilkan, tanpa memblokir**
- Satu endpoint baca: `GET /api/kinerja/pagu-renaksi?tahun=`, berisi per sub kegiatan: pagu Renaksi, pagu
  RKO per sumber (versi terbaru), sisa.
- **Layar RKO:** pita per sub kegiatan, misalnya "Pagu Renaksi Rp X · RKO semua sumber Rp Y · sisa Rp Z".
  Angka sumber yang sedang dibuka dihitung dari **isi layar** (suntingan belum tersimpan ikut), sumber lain
  dari server. Sub kegiatan yang melampaui diberi warna merah sebelum Simpan.
- **Data Entry Renaksi** (baris sub kegiatan): "Terpakai di RKO: Rp Y (GAJI …, BLUD …)".

**Tahap C — penegakan di server**
- `saveSskBatch` menolak dengan 409 `PAGU_RENAKSI_TERLAMPAUI` dan menyebut sub kegiatan beserta
  kelebihannya.
- Pemeriksaan wajib di **semua** jalur yang menggeser pagu antar sub kegiatan (L69):
  - Simpan RKO, termasuk hasil Import RKO,
  - suntingan Rekening yang menjalar ke RKO,
  - Edit Master yang memindah induk sub kegiatan.
- Buat Perubahan tidak perlu diperiksa, karena ia menyalin isi tanpa menambah pagu.
- **Kunci:** aturannya lintas sumber dana, jadi kunci per sumber tidak cukup (L69-c). Usulannya, Simpan
  RKO membaca baris sub kegiatan Renaksi dengan `FOR SHARE` sesudah kunci versinya. Simpan pagu di Renaksi
  memegang baris itu (`FOR UPDATE`) lalu membaca jumlah RKO. Siapa pun yang datang kedua menunggu, lalu
  menilai angka terbaru. Urutan kuncinya satu arah, jadi tidak ada siklus buntu. Ini dibuktikan dengan uji
  balapan pola `test-renaksi-balapan.mts`.

**Tahap D — arah sebaliknya**
- Menurunkan pagu sub kegiatan di Renaksi sampai di bawah Σ RKO diperlakukan sama seperti Tahap C
  (ditolak atau diperingatkan, lihat Pertanyaan 4).

Semua tahap **tanpa migrasi**: kolomnya sudah ada, dan yang ditambah hanya aturan, endpoint baca, dan
tampilan.

## 4. Yang sengaja tidak

- Pagu BLUD di modul BLUD (DPA/Pergeseran) **tidak** ikut dihubungkan. Itu dokumen dan jalur pagu lain,
  dan hubungan tiga arah sebaiknya dibicarakan terpisah.
- Pagu Renaksi tidak diisi otomatis dari RKO. Arahnya satu: Renaksi = batas, RKO = rincian.

## 5. Pertanyaan

1. Pagu sub kegiatan di Renaksi itu **total semua sumber dana** (GAJI + BLUD + HARLEP + …), atau hanya
   sumber tertentu? Jawabannya menentukan sumber RKO mana yang ikut dijumlah. (Usulan: semua.)
2. Saat RKO melampaui: **ditolak keras**, atau **ditolak tapi bisa diteruskan dengan alasan** (tercatat di
   audit, pola BLUD "pagu di bawah realisasi")? (Usulan: bisa diteruskan dengan alasan. Pagu Renaksi kadang
   terlambat diperbarui saat ada perubahan anggaran, dan tolak keras akan menghentikan kerja RKO.)
3. Yang diperiksa hanya versi RKO **terbaru** tiap sumber? (Usulan: ya.)
4. Di Renaksi, menurunkan pagu sampai di bawah Σ RKO: ditolak atau cukup diperingatkan? (Usulan: sama
   dengan jawaban no. 2.)
5. Tahap A (pagu menjalar ke semua baris indikator sub kegiatan yang sama): setuju? (Usulan: ya, karena
   tanpa ini penjumlahan ke atas bisa dobel.)

## 6. Kueri cek untuk server kantor (hanya membaca)

Sub kegiatan yang pagunya terisi di lebih dari satu baris, yaitu yang akan dobel saat dijumlah:

```sql
SELECT tahun, program, kegiatan, sub_kegiatan, COUNT(*) AS baris, GROUP_CONCAT(anggaran_nominal) AS pagu
FROM rencana_aksi
WHERE level = 'sub-kegiatan' AND anggaran_nominal > 0
GROUP BY tahun, program, kegiatan, sub_kegiatan
HAVING COUNT(*) > 1;
```
