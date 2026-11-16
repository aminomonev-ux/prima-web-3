# Konsep — Lampiran rincian BLUD per penanggung jawab + PDF asli untuk PK FINAL

Status: **DIKERJAKAN** (2026-11-16). Nol migrasi. Butuh **LibreOffice** di server untuk PDF.

## 1. Kebutuhan

Di Riwayat PK, dokumen FINAL bisa diunduh dengan **halaman lampiran di akhir** berisi rincian
anggaran BLUD per penanggung jawab (seperti Cetak → Rekap PJ di BLUD), dan bisa diunduh sebagai
**PDF yang sama dengan Word**.

## 2. Keputusan pemilik

1. Versi sumber lampiran **dipilih saat membuka/mengunduh** (DPA versi X atau Pergeseran versi Y),
   bukan dibekukan saat finalisasi — tanpa tabel baru, dan PK FINAL lama langsung bisa memakainya.
2. Versi yang totalnya **tidak sama** dengan nominal BLUD PK **boleh dipilih**; lampiran memuat
   catatan merah "Jumlah ini lebih/kurang Rp … dari nominal BLUD di Perjanjian Kinerja (Rp …)".
3. Isi **per PJ beserta rinciannya** (nama + subtotal tebal, lalu baris uraian pembentuknya) — hanya
   PJ milik unit pihak pertama (2026-11-16: sebelumnya subtotal saja).
4. PDF lewat **LibreOffice di server** (pilihan A). Preview lama (docx-preview → foto halaman →
   PDF gambar) tidak pernah bisa sama dengan Word: pemenggalan baris & halaman dihitung peramban.

## 3. Aturan

- **Nominal BLUD PK** = jumlah baris anggaran berketerangan tepat "BLUD". Baris gabungan
  ("APBD & BLUD", termasuk baris lama APBD bertanda `auto_filled_from_blud` — `keteranganTercetak`)
  tidak menyimpan bagian BLUD-nya terpisah → kecocokan **tidak diperiksa** dan disebut begitu.
  PK tanpa BLUD sama sekali tidak ditawari lampiran (langsung jalan).
- **Angka per PJ** = `nominalBludUnit` (`lib/data/pk-blud-nominal.ts`) — aturan yang sama dengan
  tombol ✎ Form PK dan Cetak Rekap PJ. Pergeseran = pagu PASCA-geser. Rincian di bawah tiap PJ =
  `items` dari `kelompokPerPj` yang sama, jadi jumlahnya tidak mungkin berbeda dari subtotalnya.
  Label peta yang tidak ada di versi itu ditulis **`-`**, bukan 0 dan bukan kalimat catatan (sebabnya
  sudah terbaca dari stripnya, dan totalnya memang tidak bertambah). Baris dobel PJ disebut.
- **Berkas FINAL di database tidak pernah diubah**: lampiran disisipkan ke SALINAN saat diunduh,
  sebelum `<w:sectPr>` badan (mewarisi tata halaman bagian terakhir), diawali pemisah halaman.
- Kecocokan diperiksa ulang **tiap kali** dibuka — isi versi BLUD bisa berubah (simpan ulang di
  tanggal sama) atau hilang (hapus versi).

## 4. PDF

`lib/services/docx-pdf.ts`: `soffice --headless --convert-to pdf` dengan profil LibreOffice
sendiri di folder temp, **satu konversi pada satu waktu** (antrean), batas 90 detik. Lokasi:
`LIBREOFFICE_PATH` atau lokasi pasang bawaan. Tanpa LibreOffice → 503 `PDF_TIDAK_TERSEDIA`:
tombol Unduh PDF menyebut jalan keluarnya, preview kembali ke cara lama dengan label
"Perkiraan tampilan". Bisa dipakai modul lain (LKJIP) nanti.

Dibandingkan dengan Microsoft Word pada berkas PK tersimpan: jumlah halaman, pemenggalan baris,
logo, dan tabel sama.

## 5. Permukaan

- `GET /api/perjanjian-kinerja/dokumen/[id]/lampiran-blud` → pilihan versi + total unit +
  kecocokan (pagar & kepemilikan = pagar unduh).
- `GET …/download?format=word|pdf&sumber=dpa|pergeseran&versi=YYYY-MM-DD` (sumber & versi
  berpasangan, Zod `UnduhDokumenQuerySchema`); rate limit PDF 10/menit; audit
  `PK_DOKUMEN_DOWNLOAD` menyebut sumber lampiran dan totalnya.
- Riwayat: tombol Preview, Unduh Word, **Unduh PDF** (baru) → dialog `PilihLampiranBlud`
  (pilihan awal = versi terbaru yang cocok, kalau tidak "Tanpa lampiran").
- **Unduh massal** (2026-11-16): centang baris (pola Master Sasaran/Program) → toolbar
  "N dokumen dipilih" → satu dialog versi (`PilihLampiranMassal`) untuk seluruh batch → satu
  ZIP. `GET`/`POST /api/perjanjian-kinerja/dokumen/bulk-download`: GET = versi BLUD setahun,
  POST = ZIP (maks 30 dokumen, PDF maks 10 karena LibreOffice satu per satu). Dokumen wajib
  satu tahun — versi BLUD berlaku per tahun. PK tanpa BLUD tetap ikut tanpa lampiran; versi
  atau unit yang bermasalah menghentikan seluruh batch (422), bukan diam-diam kehilangan
  lampiran. Nama berkas kembar diberi " (2)" supaya tidak ada yang tertimpa di ZIP.
  **PDF dipecah 5 dokumen per permintaan** (`PERMINTAAN_PDF_MASSAL`): 10 konversi dalam satu
  permintaan bisa menembus `proxy_read_timeout` Nginx (504) setelah LibreOffice bekerja, jadi
  layar meminta per potongan lalu menggabungkan ZIP-nya di peramban (PizZip, diimpor saat
  dipakai). Pagar server tetap sama — kepemilikan, lampiran, dan audit per berkas tidak berubah.
  Selama proses berjalan tombolnya berganti jadi **Hentikan** (AbortController): permintaan yang
  sedang jalan dibatalkan dan potongan berikutnya tidak dikirim, tanpa ZIP separuh tersimpan.
  Batas 5 terbukti dari pengukuran mesin ini (2026-11-16): 3,5 detik/dokumen → 5 dokumen ≈ 17,7
  detik, 10 dokumen ≈ 35 detik; Nginx bawaan memutus di 60 detik.

## 6. Pemasangan di server kantor

Pasang LibreOffice sekali:

```
winget install --id TheDocumentFoundation.LibreOffice --source winget
```

Huruf di templat (Arial, Times New Roman, Calibri, Georgia) sudah ada di Windows. Tanpa
LibreOffice semuanya tetap jalan kecuali PDF asli.

## 7. Batas

- Tombol unduh Word di Form PK tetap tanpa lampiran (lampiran hanya dari Riwayat).
- PDF pertama sesudah server menyala lebih lambat (± 10 detik) karena LibreOffice dimulai.

Regresi unduh massal: `npx tsx scripts/test-pk-unduh-massal.mts` (nama unik, ZIP, batas
skema, pagar rute).

Regresi: `npx tsx --env-file=.env.local scripts/test-pk-lampiran-blud.mts` (38; bagian D MySQL
kotak pasir 2073, bagian E LibreOffice sungguhan; `SIMPAN=1` membiarkan data untuk uji layar).
