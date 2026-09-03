# CONCEPT — Unduhan dibuat sama bentuknya dengan layar (E-Anggaran)

> Status: **SELESAI** (2026-09-03), dengan sheet `Data` (§3 dipilih pemilik
> aplikasi). Lanjutan `docs/CONCEPT-kinerja-unduh-gabungan.md`.
>
> Regresi: bagian **Q** di `scripts/test-kinerja-rekap.mts` — suite jadi **135
> pemeriksaan, 59 uji mutasi**; 12 mutasi bagian Q semuanya tertangkap di
> percobaan pertama.
>
> **Diverifikasi dari berkas yang benar-benar diunduh** (ZIP dibongkar langsung di
> peramban lewat `DecompressionStream`, jadi berkasnya tidak perlu keluar):
>
> | Yang diperiksa | Hasil |
> |---|---|
> | Nama sheet | `Rekap` · `GAJI` · `Data GAJI` |
> | Sheet GAJI | 12 kop · 12 judul bulan (JANUARI…) · 12 baris JUMLAH · 12 blok tanda tangan |
> | Merge sheet GAJI | 48 = 12 bulan × 4 baris kop |
> | Pemisah halaman | **11** = 12 bulan − 1 (tidak dipasang di bulan pertama) |
> | Merge sheet Rekap | `A1:M1` … `A5:M5` — selebar 13 kolom |
> | Sheet Data | 0 merge, tanpa kop/JUMLAH/tanda tangan, langsung header 16 kolom |
> | PDF bundel | 13 halaman; kop halaman 1 (rekap) kini **rata tengah** seperti halaman detail |
>
> Data uji dibersihkan sesudahnya.
> Nol tabel, nol kolom, **nol migrasi**, nol endpoint. Hanya penyusunan berkas.
>
> Diminta: *"download excel dan pdf itu sama persis dengan tampilan preview"* —
> lalu dipertegas: **bukan warnanya, tapi bentuk tabelnya**; dan *"yang di tab
> rekap PDF-nya belum sama kan?"*

---

## 1. Tiga beda yang nyata (sudah diperiksa di kode, bukan dugaan)

| # | Di mana | Sekarang | Di layar |
|---|---|---|---|
| **1** | **PDF Rekap** — kop | ditulis di `x = 14`, **rata kiri di pojok** | rata **tengah** |
| **2** | **Excel Rekap** — kop | 5 baris di kolom A saja, tidak digabung, meluber ke kanan | rata tengah selebar tabel |
| **3** | **Excel Detail** — struktur | **satu tabel rata**, 12 bulan ditumpuk, kolom `Bulan` jadi pembeda | **terpisah per bulan**: kop + tabel + JUMLAH + tanda tangan |

Nomor 1 paling ganjil akibatnya: di dalam **satu** berkas bundel, halaman 1
kopnya menempel di kiri sementara halaman 2 dan seterusnya di tengah. Berkasnya
tidak konsisten dengan dirinya sendiri. Itu sisa dari PDF rekap yang dibuat lebih
dulu, sebelum ada keputusan pilihan B.

Nomor 3 bukan soal rapi-tidaknya — **struktur tabelnya memang bukan struktur yang
sama**. Sheet Excel detail hari ini tidak punya kop, tidak punya baris JUMLAH, dan
tidak punya blok tanda tangan sama sekali.

## 2. Yang dikerjakan

**PDF Rekap** — kop dipindah ke `align: 'center'`, memakai penulis kop yang sama
dengan halaman detail. Satu fungsi untuk dua tempat; dua salinan kop pasti
berbeda lagi begitu salah satunya disunting.

**Excel Rekap** — kop di-*merge* selebar 13 kolom + rata tengah; baris grand total
dan program ditebalkan seperti di layar. `BarisRekap.tebal` sudah membawa
informasinya, tinggal dipakai.

**Excel Detail** — dipecah per bulan, satu blok per bulan dalam **satu sheet**:

```
[kop 4 baris, merge + center]
[header tabel]
[baris data bulan itu]
[JUMLAH — tebal]
[2 baris kosong]
[blok tanda tangan]
──────── pemisah halaman ────────
[bulan berikutnya…]
```

**Satu sheet per sumber, bukan satu sheet per bulan.** 8 sumber × 12 bulan = 96
sheet itu tidak bisa dipakai siapa pun. Pemisah halaman (`addPageBreak`) membuat
hasil cetaknya tetap satu bulan per halaman — sama dengan Print dari layar.

Baris JUMLAH memakai `hitungJumlahBulan` yang sudah ada. Kop dan susunan tanda
tangan diangkat jadi fungsi bersama supaya PDF dan Excel tidak punya dua versi.

## 3. Satu keputusan yang perlu Anda ambil — sheet "Data"

Begitu sheet detail dipecah per bulan, ia **berhenti jadi tabel**: *sort*,
*filter*, dan *pivot* tidak bisa dipakai lagi, karena ada kop dan baris JUMLAH
menyelip di tengah-tengah.

Kalau Excel-nya kadang masih dipakai untuk mengolah angka, usul saya tambahkan
**satu sheet `Data`** berisi tabel rata persis seperti sekarang — di samping
sheet-sheet yang sudah dirapikan.

| | Tanpa sheet Data | Dengan sheet Data |
|---|---|---|
| Untuk dicetak / dikirim | ✅ | ✅ |
| Untuk disortir / difilter | ❌ | ✅ |
| Biaya | — | satu sheet tambahan, susunannya sudah ada (`realisasiAoa`) |

**Saya menyarankan dengan sheet Data.** Biayanya hampir nol karena penyusunnya
sudah ada, dan ia menyelamatkan satu kemampuan yang hilang tanpa mengorbankan
apa pun.

## 4. Yang sengaja TIDAK dikerjakan

- **Warna.** Anda sudah bilang bukan itu yang dimaksud. Tidak disentuh.
- **Angka dijadikan teks** supaya titik ribuannya persis seperti layar. Angka
  yang disimpan sebagai teks **tidak bisa dijumlah** di Excel; yang benar adalah
  tetap angka dengan format ribuan — terlihat sama, tetap bisa dihitung.
- **Gradien, sudut membulat, bayangan.** Tidak ada padanannya di Excel/PDF dan
  tidak ada yang membutuhkannya.

## 5. Uji regresi

Ditambahkan ke bagian **P** `scripts/test-kinerja-rekap.mts`:

| | Menguji |
|---|---|
| Q1 | kop rekap & kop detail memakai penulis yang SAMA (bukan dua salinan) |
| Q2 | kop PDF rekap rata tengah — tidak ada lagi `doc.text(..., 14, …)` untuk kop |
| Q3 | Excel rekap me-*merge* kop selebar jumlah kolom, bukan angka mati |
| Q4 | baris `tebal` di rekap ikut ditebalkan di Excel |
| Q5 | sheet detail memuat satu blok per bulan berdata — jumlah kop = jumlah bulan |
| Q6 | tiap blok punya baris JUMLAH, dan angkanya dari `hitungJumlahBulan` |
| Q7 | ada pemisah halaman antar bulan, jumlahnya = jumlah bulan − 1 |
| Q8 | sheet `Data` (kalau dipilih) tetap tabel rata tanpa kop/JUMLAH |

Q5 dan Q7 wajib diuji dengan sumber yang bulannya **tidak lengkap** — kalau pohon
ujinya selalu 12 bulan, "jumlah kop = 12" lulus tanpa menguji apa pun.

## 6. Perkiraan

| Bagian | Kerja |
|---|---|
| PDF Rekap kop | kecil |
| Excel Rekap merge + tebal | kecil |
| Excel Detail per bulan | sedang — bahannya sudah ada |

Nol migrasi. Yang berubah cuma bentuk berkas yang diunduh; angkanya tidak
bergeser sedikit pun.
