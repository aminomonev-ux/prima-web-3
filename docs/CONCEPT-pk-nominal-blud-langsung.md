# Konsep: nominal BLUD di Form PK dihitung langsung dari DPA / Pergeseran

Status: dikerjakan 12 Nov 2026 atas keputusan pemilik ("eksekusi", tombol Simpan Rekap PK dihapus).

## 1. Masalah

Tombol pensil di panel **Anggaran** Form PK mengisi nominal BLUD dari tabel `rekap_pk` — foto
Rekap Penanggung Jawab yang hanya lahir kalau seseorang menekan **Simpan Rekap PK** di BLUD →
Cetak → DPA · Penanggung Jawab.

- Foto bisa **basi**. Kasus nyata: DPA terbaru 13-10-2026 (Perubahan ke-1) dan Pergeseran
  10-11-2026, tetapi foto terakhir 29-08-2026, jadi PK mengisi angka Agustus.
- **Pergeseran tidak pernah bisa dipakai**: tombolnya hanya ada di menu DPA, dan `rekap_pk` hanya
  mengenal `versi_dpa`.
- **Rp 0 tanpa sebab**: unit Program/Kegiatan dijumlah dari label PJ di `pk_unit_kerja_blud_pj`.
  Unit tanpa peta, atau peta yang ejaannya beda dengan label PJ di DPA (seed "Kasi Penunjang
  **Medis**" vs label "Kasi Penunjang **Medik**"), selalu Rp 0 tanpa pesan.

## 2. Keputusan

1. **Hitung langsung, tanpa foto.** Pensil membuka dialog `AmbilNominalBlud`: pilih Pergeseran
   (pagu pasca-geser) atau DPA, versi mana (lencana MURNI / PERUBAHAN KE-n / penutupan, sama dengan
   daftar Cetak). Pilihan awal = versi yang sedang jadi pagu (`sumberPaguTahun`, bertanda BERLAKU).
2. **Satu aturan dengan Cetak Rekap PJ.** `lib/blud/rekap-pj.ts` (`kelompokPerPj`,
   `barisRekapPergeseran`, `nominalUntukUnit`) dipakai `renderPjView` DAN server PK. Subtotal per
   PJ tetap **mentah** seperti Cetak — PJ dobel dalam satu rantai ikut dua kali, dan dialog
   menyebut barisnya supaya dibetulkan di datanya (keputusan pemilik: angka PK harus sama dengan
   yang diperiksa di Cetak).
3. **Tidak ada Rp 0 diam-diam.** Dialog menyebut: unit belum dipetakan (`BELUM_DIPETAKAN`), label
   peta yang tidak ada di versi itu (`ada: false`), dan uang yang belum ber-PJ (DAUN tanpa PJ di
   seluruh rantainya — bukan `audit.belumEntry`, yang ikut memuat akar dan menggandakan uang, L85).
4. **Berhenti di form** (L78): dialog hanya mengisi isian nominal + petunjuk sumber
   ("Pergeseran 10-11-2026 · Perubahan ke-1"). Yang menulis tetap Simpan dokumen PK.
5. **Server tidak menebak versi.** `sumber` & `versi` wajib di `BludNominalQuerySchema`; "terbaru
   diam-diam" = foto basi lewat pintu lain.
6. **Simpan Rekap PK dihapus** (route `POST /api/blud/rekap-pk`, `lib/blud/rekap-pk-data.ts`,
   `RekapPKBodySchema`). Tabel `rekap_pk` dibiarkan (riwayat), tidak ditulis/dibaca lagi.

## 3. Akses

Tetap pagar lama route `blud-nominal`: hak Form/Riwayat PK, sengaja tanpa izin menu BLUD
(`docs/CONCEPT-pk-peran.md` §6). Yang dipulangkan hanya total per label PJ, daftar versi, dan
uraian baris yang dobel — bukan baris anggaran.

## 4. Uji

`npx tsx --env-file=.env.local scripts/test-pk-nominal-blud.mts` (36; bagian D MySQL kotak pasir
2077), 10 uji mutasi tertangkap — satu sempat LOLOS (BERLAKU dicocokkan tanggal saja): data uji
tidak punya DPA & Pergeseran bertanggal sama, kini ada. `scripts/test-pagu-per-tahun.mts` bagian G
disesuaikan (tahun tetap wajib).

Dicoba di peramban (kotak pasir 2045): pilihan awal Pergeseran BERLAKU, ganti ke DPA 31-01 →
angka berubah, Pakai → nominal + "BLUD: Rp … (DPA 31-01-2045)"; keterangan APBD → "Tambahkan";
label peta salah eja tampil "tidak ada di versi ini"; tema terang; Esc. Cetak Pergeseran ·
Penanggung Jawab tahun yang sama memberi subtotal identik, tanpa tombol Simpan Rekap PK.
