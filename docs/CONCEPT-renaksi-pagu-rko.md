# Konsep — Pagu sub kegiatan Renaksi sebagai batas pagu RKO E-Anggaran

Status: **KONSEP, putaran 2** (2026-11-14). Belum ada kode. Empat jawaban pemilik sudah masuk (§5); yang
tersisa keputusan di §6. Putaran 1 (2026-11-13) mengira pagu milik sub kegiatan dan mengusulkan
"Tahap A" untuk menutup penjumlahan dobel — **itu dibatalkan**, lihat §2.

---

## 1. Keadaan sekarang (hasil cek)

**Di Renaksi**
- Pagu disimpan di `rencana_aksi.anggaran_nominal` (BIGINT), hanya di baris **sub kegiatan**. Satu sub
  kegiatan dengan dua indikator = dua baris, masing-masing dengan pagunya sendiri.
- Pagu kegiatan, program, sasaran, dan tujuan **tidak disimpan**; dijumlah dari baris sub kegiatan oleh
  `anggaranRollup` (`app/(dashboard)/rencana-aksi/_lib/types.ts`) — Cetak (layar, PDF, Excel, tabel LKJIP
  tertaut) dan Realisasi. Penjumlahannya per **baris**, lewat nama program + kegiatan.
- **Tidak ada sumber dana** dan **tidak ada pagu Perubahan** di Renaksi. Satu angka per baris.
- Data dev: pagu 2026 belum diisi sama sekali (0 dari 18 baris sub kegiatan).

**Di E-Anggaran**
- Pagu RKO per rekening: `kinerja_ssk.pagu`, per **tab sumber** (GAJI, BLUD, HARLEP, PROMKES, SARPRAS,
  OBAT, PEMELIHARAAN, PEMBANGUNAN), per **versi** (Murni / Perubahan ke-n). Tiap baris membawa nama
  program, kegiatan, sub kegiatan.
- **Temuan putaran 2:** "tab sumber" E-Anggaran BUKAN sumber dana. Sumber dana (APBD/BLUD/…) sudah ada,
  tapi di tempat lain: `kinerja_rekening.sumber_anggaran` per rekening, dipilih dari Master E-Anggaran tipe
  `sumber_anggaran` (daftar per tahun, diisi pengguna). Data dev 2026: Master berisi "APBD", 15 rekening
  GAJI semuanya "APBD".
- RKO (`kinerja_ssk`) sendiri **tidak** menyimpan sumber dana. Ia terhubung ke rekeningnya lewat kunci
  Inject `uraian_ssk + uraian` per tab sumber. Baris RKO dari Import RKO yang rekeningnya tidak ada tidak
  punya sumber dana.
- Penyamaan nama ke Renaksi sudah tersedia: `kunciNamaRenaksi` / `jalurAdaDiRenaksi`
  (`lib/kinerja/asal-renaksi.ts`). Jangan menulis pembanding nama kedua.

**Di PK** — daftar sumber dana tetap sendiri (`SUMBER_DANA` di `perjanjian-kinerja/form/_types.ts`:
APBD, BLUD, APBD & BLUD, APBN, HIBAH, LAINNYA), terpisah dari Master E-Anggaran. Tidak disentuh konsep ini.

## 2. Jawaban pemilik (2026-11-14)

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Pagu Renaksi = total semua sumber? | **Tidak.** Renaksi perlu sumber dana di tiap sub kegiatan, dan ikut naik ke atas: satu program bisa punya dua sumber (APBD dan BLUD), seperti di PK. Pemilik minta saran → §3 |
| 2 | RKO melampaui | **Ditolak, bisa diteruskan dengan alasan** (tercatat di audit, pola BLUD "pagu di bawah realisasi") |
| 3 | Versi RKO yang dihitung | **Terbaru tiap tab sumber.** Pemilik bertanya: perlukah pagu Perubahan di Renaksi? → §4 |
| 4 | Pagu Renaksi diturunkan di bawah RKO | Sama dengan no. 2 |
| 5 | Pagu milik sub kegiatan (Tahap A lama) | **Tidak.** Pagu memang milik **indikator**: sub kegiatan A Rp 5 juta dengan dua indikator diisi Rp 2,5 juta + Rp 2,5 juta |

Akibat jawaban no. 5: penjumlahan per baris di `anggaranRollup` **sudah benar**, bukan celah. Pagu sub
kegiatan = Σ pagu baris indikatornya. Tahap A lama (menjalarkan pagu ke semua baris) dibatalkan — ia akan
merusak cara pengisian yang dipakai. Isian ganda (Rp 5 juta di kedua baris) tidak bisa dibedakan mesin dari
pembagian yang sah (Rp 2,5 juta + Rp 2,5 juta juga sama-sama berangka sama), jadi tidak dijaga dengan
tebakan. Penggantinya: baris sub kegiatan di Data Entry menyebut **"Total sub kegiatan Rp 5.000.000
(2 indikator)"**, supaya pengisi melihat jumlahnya sendiri.

## 3. Saran: sumber dana di Renaksi

**a. Rincian per sumber di tiap baris indikator.** Isian pagu baris sub kegiatan menjadi daftar kecil
"sumber dana → nominal" (satu baris cukup untuk yang satu sumber). Tabel baru, misalnya
`rencana_aksi_pagu (rencana_aksi_id, sumber_dana, pagu, pagu_perubahan)`, UNIQUE
`(rencana_aksi_id, sumber_dana)`, FK CASCADE ke `rencana_aksi`. **Butuh migrasi** (putaran 1 menulis
"tanpa migrasi" — tidak berlaku lagi).

**b. Daftar sumber dana = Master "Sumber Anggaran" E-Anggaran tahun itu.** Daftarnya sudah ada, per tahun,
dan rekening RKO sudah memilih dari situ. Memakai daftar yang sama membuat pembandingnya cocok tanpa tabel
padanan; daftar kedua di Renaksi pasti berbeda ejaan ("BLUD" vs "Blud"). Pencocokan memakai aturan nama
yang sudah ada. Konsekuensi: sumber baru ditambah di Master E-Anggaran, bukan di Renaksi.

**c. Naik ke atas per sumber.** `anggaranRollup` menjumlah per sumber: program tampil "APBD Rp X · BLUD Rp
Y" dengan total di sampingnya. Kolom Anggaran Cetak (layar, PDF, Excel, tabel LKJIP) tetap satu kolom
TOTAL; rinciannya baris kecil di bawah angka — bentuk pastinya diputuskan saat eksekusi.

**d. `anggaran_nominal` tetap = total**, ditulis **hanya oleh server** = Σ rincian, di transaksi yang sama.
Alasannya: lebih dari sepuluh pembaca (Cetak, Realisasi, LKJIP, dashboard) membaca kolom itu; mengubah
semuanya sekaligus = L69. Isian klien untuk kolom itu diabaikan begitu rinciannya ada.

**e. Data lama** (pagu tanpa rincian): tampil sebagai **"tanpa sumber"** dan tetap dihitung di total. Tidak
dibagi otomatis — kecuali Master tahun itu hanya punya satu sumber (lihat §6 no. 3).

## 4. Saran: pagu Perubahan di Renaksi

**Perlu.** Tanpa itu, saat anggaran perubahan masuk, angka Murni harus ditimpa: PK Murni, LKJIP, dan
Realisasi kehilangan angka awalnya, dan RKO Murni yang sudah terkunci tiba-tiba "melampaui" pagu baru yang
lebih kecil.

Usulannya meniru Target Pendapatan Perubahan E-Anggaran (`lib/kinerja/pendapatan-perubahan.ts`), yang
sudah dipakai dan dipahami:
- kolom `pagu_perubahan` per rincian, **NULL = belum ada Perubahan**;
- pagu berlaku = Perubahan ?? Murni;
- begitu Perubahan terisi, Murni **dibekukan** (409, seperti `TARGET_MURNI_FINAL`);
- RKO versi terbaru dibandingkan dengan pagu **berlaku**; RKO Murni yang sudah terkunci tidak diperiksa
  ulang (jawaban no. 3);
- Cetak menampilkan pagu berlaku; Murni + Perubahan berdampingan hanya di tampilan yang memintanya.

Yang belum jelas: Perubahan dibuka **per baris** (siapa saja kapan saja mengisi kolom Perubahan) atau
**per tahun** (tombol "Mulai Perubahan" sekali, lalu semua baris punya kolom Perubahan). Lihat §6 no. 2.

## 5. Aturan pembanding (sesudah putaran 2)

Untuk tiap **sub kegiatan × sumber dana**, tahun yang sama:

> Σ pagu RKO (versi terbaru tiap tab sumber, tanpa baris dinol-kan, rekeningnya bersumber dana X)
> ≤ Σ pagu berlaku Renaksi sumber X (semua baris indikator sub kegiatan itu)

- Sumber dana baris RKO diambil dari **rekeningnya** (`kinerja_rekening.sumber_anggaran`, lewat kunci
  Inject). Baris RKO tanpa rekening / rekening tanpa sumber dana masuk kelompok **"sumber belum diisi di
  Rekening"**: tidak dibandingkan per sumber, tapi tetap ikut pembanding **total** sub kegiatan.
- Pagu Renaksi kosong = tanpa batas. Sub kegiatan RKO yang tidak ada di Renaksi disebut ("di luar Rencana
  Aksi"), tidak diperiksa.
- Melampaui → 409 `PAGU_RENAKSI_TERLAMPAUI` menyebut sub kegiatan, sumber, dan kelebihannya; bisa
  diteruskan dengan alasan (audit). Arah sebaliknya (Renaksi diturunkan) sama.

**Tahapan** (lanjutan putaran 1, Tahap A diganti):
- **Tahap A'** — rincian sumber + pagu Perubahan di Renaksi (migrasi, Data Entry, Impor Renaksi ikut —
  L69, `anggaranRollup` per sumber, Cetak).
- **Tahap B** — tampilan saja: endpoint baca `GET /api/kinerja/pagu-renaksi?tahun=`, pita per sub kegiatan
  di layar RKO (sumber yang dibuka dihitung dari isi layar), "Terpakai di RKO" di Data Entry.
- **Tahap C** — penegakan di server di semua jalur yang menggeser pagu RKO (Simpan termasuk Impor,
  suntingan Rekening yang menjalar — sekarang juga **ganti sumber dana rekening**, Edit Master yang memindah
  induk). Kunci: Simpan RKO membaca baris sub kegiatan Renaksi `FOR SHARE` sesudah kunci versinya; simpan
  pagu Renaksi memegang barisnya `FOR UPDATE` lalu membaca Σ RKO. Dibuktikan dengan uji balapan pola
  `test-renaksi-balapan.mts`.
- **Tahap D** — arah sebaliknya di Renaksi.

## 6. Keputusan yang masih ditunggu

1. **Daftar sumber dana Renaksi** diambil dari Master "Sumber Anggaran" E-Anggaran tahun itu (saran §3b),
   atau daftar tetap seperti PK?
2. **Pagu Perubahan** dibuka per baris, atau per tahun lewat satu tombol "Mulai Perubahan"? (Saran: **per
   tahun** — sama seperti Pendapatan, dan Cetak tahu pasti apakah tahun itu sudah berbabak Perubahan.)
3. **Data lama tanpa sumber**: bila Master tahun itu hanya punya **satu** sumber dana, boleh otomatis
   ditandai sumber itu? (Saran: ya, lewat tombol yang ditekan manusia sekali — bukan diam-diam saat
   migrasi.)
4. **Pembanding**: per sumber dana **dan** total (saran §5), atau total saja dulu?

## 7. Yang sengaja tidak

- Pagu BLUD di modul BLUD (DPA/Pergeseran) **tidak** dihubungkan — dokumen dan jalur pagu lain.
- Pagu Renaksi tidak diisi otomatis dari RKO. Arahnya satu: Renaksi = batas, RKO = rincian.
- PK tetap dengan daftar sumber dananya sendiri; menyamakannya dibicarakan terpisah.

## 8. Kueri cek untuk server kantor (hanya membaca)

Sub kegiatan berpagu dan jumlah baris indikatornya (untuk melihat pola pembagian yang dipakai):

```sql
SELECT tahun, program, kegiatan, sub_kegiatan, COUNT(*) AS baris, GROUP_CONCAT(anggaran_nominal) AS pagu
FROM rencana_aksi
WHERE level = 'sub-kegiatan' AND anggaran_nominal > 0
GROUP BY tahun, program, kegiatan, sub_kegiatan
ORDER BY tahun, program, kegiatan, sub_kegiatan;
```

Rekening yang sumber dananya belum diisi (akan masuk "sumber belum diisi di Rekening"):

```sql
SELECT tahun, sumber, COUNT(*) AS rekening,
       SUM(sumber_anggaran IS NULL OR TRIM(sumber_anggaran) = '') AS tanpa_sumber_dana
FROM kinerja_rekening
GROUP BY tahun, sumber
ORDER BY tahun, sumber;
```
