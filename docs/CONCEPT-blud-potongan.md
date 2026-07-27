# CONCEPT — Potongan Pihak Ketiga & Pengembalian Belanja (BLUD)

> Pelengkap `CONCEPT-blud-realisasi.md`. Menjawab dua hal yang belum punya tempat
> di model transaksi: **pajak yang dipotong dari pembayaran vendor** dan **uang
> belanja yang kembali ke kas**.

---

## 1. Asal persoalan

Saat aturan "uang keluar wajib punya rekening" (`sifatAlokasi`) dipasang, muncul
pertanyaan: bagaimana nasib baris `setor ppn` / `setor pph 22` yang berserak di
BKU? Itu uang keluar tanpa kode rekening — akan ditolak.

Penelusuran ke berkas asli `docs/06. BKU Juni 2026.xlsx` menjawabnya. Potongan
selalu ditulis **berpasangan, di hari yang sama, di kolom yang sama**:

```
r147  kwt 98  Obat-obatan PT AAM   5.1.02...0037   bank keluar 4.020.481
r148          ppn                       (tanpa kode)  bank masuk    398.426
r149          setor ppn                 (tanpa kode)  bank keluar   398.426
r150          pph 22                    (tanpa kode)  bank masuk     54.331
r151          setor pph 22              (tanpa kode)  bank keluar    54.331
```

Saldo di baris 149 dan 151 kembali ke angka yang sama persis. Nomor kuitansinya
satu (98). Kode rekening hanya di baris induk.

Dikonfirmasi ke bendahara: *"terpotong di pembayaran vendor trus langsung
disetorkan"* · *"yg atas sendiri yg masuk belanja"* · *"gak pengaruh ppn ma pph
nyaa"* · *"dicatat itu buat rekapan pajak biar tau mana yg dipungut ppn dan
dipotong pph 22/23/4(2)"*.

**Kesimpulan**: empat baris itu bukan empat kejadian uang. Ia **atribut** dari
satu belanja. Belanja dicatat **bruto** dan sudah membebani pagu sepenuhnya.

Di lembar `Realisasi BP` memang ada rekening bernama pajak
(`5.1.02.99.99.9999.02.01.0067` Belanja pembayaran pajak, bea, perizinan), tapi
itu **pajak yang dibayar rumah sakit sebagai belanjanya sendiri** — pajak
kendaraan, pajak gedung. Nilai `setor ppn`/`setor pph` tidak muncul di sana sama
sekali.

---

## 2. Keputusan #34 — potongan disimpan sebagai rincian, bukan transaksi

| Yang dipertimbangkan | Kenapa ditolak / dipilih |
|---|---|
| Jenis transaksi tersendiri (mis. `SETOR_PFK`) | **Ditolak.** Bendahara harus mengetik lima baris dan menjaga sendiri agar pasangannya seimbang, dan pagar `sifatAlokasi` harus dibuka sedikit untuk mengizinkan uang keluar tanpa rekening — pintu itu bisa disalahgunakan persis seperti lubang yang baru ditutup |
| **Rincian pada transaksi belanja** | **Dipilih.** Tidak ada baris keluar tanpa rekening, jadi **nol pengecualian** pada pagar. Pasangan mustahil pincang. Ketikan berkurang lima kali lipat |

### Cakupannya lebih luas dari pajak
Lembar `setor BPD` menunjukkan yang dipotong dari satu pembayaran bruto bukan
cuma pajak: ada koperasi, Baznas, BPJS Ketenagakerjaan. Perilakunya identik, jadi
ditampung tabel yang sama dan dibedakan lewat `jenis`.

| Kelompok | Nilai `jenis` |
|---|---|
| Pajak → mengisi lembar `rekap potongan` bagian pajak | `PPN` `PPH_21` `PPH_22` `PPH_23` `PPH_4_2` `PPH_FINAL` |
| Non-pajak | `KOPERASI` `BAZNAS` `BPJS_TK` `LAINNYA` |

### Pagar
1. Hanya menempel pada transaksi bersifat `WAJIB` (belanja sungguhan yang
   dibebankan) — `bolehBerpotongan()`.
2. Jumlah potongan ≤ nilai pembayaran. Kalau lebih, ia berubah jadi arus keluar
   terselubung yang tidak membebani anggaran mana pun.
3. Dipasang di Zod **dan** `periksaPotongan()` di data layer.

### Yang dibangkitkan saat cetak
- `BKU` & `SPI`: sepasang baris memo per potongan (masuk lalu keluar), lewat
  kolom yang sama dengan pembayaran induknya (bank kalau `bank_keluar > 0`, kalau
  tidak kas), tanpa nomor kuitansi dan tanpa kode rekening. Ikut dijumlah di baris
  JUMLAH supaya kolomnya benar-benar bisa ditambahkan sendiri.
- `rekap potongan` (lembar baru, tidak ada di berkas asli): dikelompokkan per
  jenis + subtotal, ditutup **JUMLAH PAJAK** / **JUMLAH POTONGAN LAIN** /
  **JUMLAH SELURUHNYA**. Di berkas asli rekap ini disusun manual dari baris yang
  berserak di BKU, jadi bisa melenceng tanpa ketahuan.
- `register`, `pengantar`, `SPJ`, `Realisasi BP`: **tidak tersentuh** — potongan
  tidak punya baris anggaran.

---

## 3. Keputusan #35 — pengembalian belanja lewat alokasi negatif

Uang belanja yang kembali ke kas (kelebihan bayar, sisa panjar, barang batal)
sebelumnya tidak punya cara pencatatan yang benar. Melekatkannya ke baris
anggaran justru **menambah** serapan, karena alokasi dijumlahkan positif.

**Keputusan**: jenis transaksi `PENGEMBALIAN`, alokasinya bernilai **negatif**.

| Hal | Aturan |
|---|---|
| Arus kas | Hanya masuk. Kolom keluar wajib kosong |
| Alokasi | Wajib ada, seluruhnya negatif, jumlahnya = −(kas masuk + bank masuk) |
| Di layar | Diketik **positif**; tanda diberikan saat kirim (`TransaksiModal`) |
| Pagar | `SERAPAN_NEGATIF` — `terserap + nilai` tidak boleh < 0, diperiksa di dalam `kunciDanPeriksaPagu` yang sudah memegang kunci pagu |
| Nomor kuitansi | Tidak diberi — hanya `BELANJA` yang dapat |

Karena tandanya ikut ke kolom `nilai`, seluruh turunan **otomatis benar** tanpa
cabang khusus: `SUM(nilai)` di `pagu.ts`, `hitungBelanja()` untuk `pengantar` &
`SPJ`, dan saldo berjalan di register.

### Kenapa `DECIMAL` tidak perlu diubah
Kolomnya sudah bertanda. Yang berubah cuma **artinya** — dan itu ditulis sebagai
komentar kolom di skema supaya `SUM(nilai)` tidak pernah lagi dibaca sebagai
"selalu bertambah".

---

## 4. Batas — yang sengaja TIDAK dikerjakan

| Hal | Alasan |
|---|---|
| Bentuk lembar `setor BPD` mengikuti slip asli | Slip aslinya mencampur dua hal: daftar transfer keluar **dan** rekonsiliasi sisa tunai dari satu penarikan. Keputusan bentuk tersendiri, dibahas terpisah dengan bendahara |
| Pengembalian pada bulan yang sudah ditutup | Tetap tidak bisa. Jalan satu-satunya membuka periode (SUPER_ADMIN, beralasan) — konsisten dengan seluruh modul |
| Potongan pada transaksi non-belanja | Sengaja ditolak; lihat pagar #1 |

---

## 5. Berkas yang terlibat

| Berkas | Peran |
|---|---|
| `lib/blud/alokasi-rule.ts` | `sifatAlokasi` · `nilaiAlokasiSeharusnya` · `alasanAlokasiDilarang` · `bolehBerpotongan` · `JENIS_POTONGAN` · `LABEL_POTONGAN` — modul daun, dipakai server **dan** klien |
| `lib/blud/realisasi-schemas.ts` | Zod + `PotonganSchema` + error domain |
| `lib/blud/realisasi-data.ts` | `periksaKeseimbangan` · `periksaPotongan` · `tulisPotongan` · pagar serapan negatif |
| `components/blud/TransaksiModal.tsx` | Dock potongan · mode pengembalian |
| `lib/blud/export/spj-excel.ts` | Baris memo di BKU/SPI · lembar `rekap potongan` |
| `docs/migrations/migration-blud-potongan-pengembalian.sql` | Tabel + ENUM |
| `scripts/test-blud-alokasi.mjs` | Regresi 2 lapis: predikat + skema asli |
