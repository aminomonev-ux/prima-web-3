# Konsep — Perjanjian Kinerja disamakan dengan PDF PK Perubahan 2026

Status: **dikerjakan 11 Nov 2026**. Yang dikerjakan, yang berbeda dari rencana, dan yang sengaja tidak dikerjakan ada di §12.

Rujukan:

- 19 PDF di `E:\KANTOR\KANTOR\PK DIR\PK PERUBAHAN 2026\`, dibaca teks dan posisinya lewat pdfjs. Hanya dibaca, tidak disalin ke repo.
- Templat `lib/pk/templates/*.docx` versi kerja 11 Nov 07:21. Sudah disunting pemilik dan **belum di-commit**: kop baru, kedua section tegak.
- Data `pk_pejabat`, `pk_sasaran`, `rencana_aksi` di basis data pengembangan (hanya dibaca).

Revisi pertama konsep ini (10–11 Nov) keliru di beberapa titik. Yang diganti, beserta buktinya, ada di §11.

---

## 1. Keputusan pemilik

| Hal | Keputusan |
|---|---|
| Judul kolom 2 | `Sasaran Program` / `Sasaran Kegiatan` / `Sasaran Sub Kegiatan`, mengikuti level. PDF memakai "Sasaran Strategis" dan "Sasaran", sengaja **tidak** diikuti |
| Judul kolom 3 | `Indikator Kinerja`, tanpa level |
| Arsiran | **Tidak ada** di kedua tabel. PDF memang tanpa latar berwarna, hanya garis |
| Templat | `lib/pk/templates` sudah benar: kop, kalimat halaman 1, kedua section tegak A4. Hanya dua suntingan kecil di halaman 2 (§6) |
| Ukuran huruf | Isi kedua tabel **12 pt** (sekarang 13 pt). Judul dan kalimat lain tetap mengikuti templat |
| Penomoran kolom | `(1) (2) (3) (4) (5)`. `(4)` dua kali di 17 PDF adalah salah ketik; kedua PDF Wakil Direktur menulis `(5)` |
| Satuan | Kolom sendiri |
| Jabatan & Plt. | **Tetap bentuk PRIMA** (11 Nov): PDF-nya yang keliru. Baris "Unit Kerja : …" juga tetap. §5 dan §6 tidak dikerjakan |
| Templat | Tidak disunting sama sekali |

---

## 2. Tabel 1 — sasaran

Lebar bidang tulis section 2 = 11.907 − (706 + 850) = **10.351 dxa**. Lebar 14.000 dxa yang dipakai sekarang meluber keluar kertas tegak. Lebar kolom diambil dari posisi teks PDF lalu disesuaikan ke 10.350:

| Kolom | Judul | Lebar (dxa) | Rata isi |
|---|---|---|---|
| 1 | NO | 700 | tengah |
| 2 | Sasaran {Level} | 3.700 | kiri |
| 3 | Indikator Kinerja | 3.050 | kiri |
| 4 | Satuan | 1.500 | tengah |
| 5 | Target | 1.400 | tengah |

Susunan baris (tebal/biasa dibaca dari nama font di PDF):

1. **Judul kolom**: tebal, rata tengah, bergaris, tanpa arsiran. Diulang di halaman berikut (`w:tblHeader`). Di PDF Wadir Umum dan Keuangan, tabel sasaran (6 sasaran) sudah berakhir di dasar halaman 2. Dengan huruf 12 pt, tabel sepanjang itu bisa terpotong ke halaman 3.
2. **Penomoran** `(1)`…`(5)`: tebal, rata tengah. Ikut diulang bersama judul.
3. **Baris level**: satu sel selebar 5 kolom, tebal, rata kiri. Isinya `Program` / `Kegiatan` / `Sub Kegiatan`, seragam untuk semua jabatan. PDF menulis "SASARAN PROGRAM" untuk Wadir; diseragamkan supaya sejalan dengan judul kolom 2.
4. **Baris data**: huruf biasa. **Satu nomor per sasaran.** Indikator berturut-turut dengan sasaran yang sama berbagi sel NO dan sel sasaran (`w:vMerge`), sedangkan indikator, satuan, dan target tetap per baris. Contoh di PDF Wadir Pelayanan: sasaran 1 punya 3 indikator di bawah satu nomor.

Isi kosong ditulis kosong, bukan `-`. Garis semua sel tipis dan hitam seperti sekarang. PDF menggambarnya abu-abu (#808080), tetapi itu hasil mesin pembuat PDF, bukan isi dokumen.

Target ditulis angka saja (`5`, `100`, `86,72`) memakai `tulisDesimal`: koma desimal, tanpa satuan, tanpa `%`. PDF Wadir Umum menulis "86.72" dengan titik. Itu ketikan tangan dan tidak diikuti.

---

## 3. Tabel 2 — anggaran

| Kolom | Judul | Lebar (dxa) | Rata isi |
|---|---|---|---|
| 1 | NO | 700 | tengah |
| 2 | {Level}: `Program` / `Kegiatan` / `Sub Kegiatan` | 5.250 | kiri |
| 3 | Anggaran (Rp) | 2.500 | kanan |
| 4 | Keterangan | 1.900 | tengah |

- Tanpa garis dan tanpa arsiran, seperti sekarang. Di PDF Wadir Umum, baris anggaran yang jatuh ke halaman 3 tidak punya satu garis pun.
- Judul tebal. Isi huruf biasa, 12 pt.
- Nominal ditulis **tanpa "Rp"**, karena judul kolomnya sudah "(Rp)": `3.000.000.000`, `55.500.000`, `0`. Sekarang `fmtRp` menulis "Rp 3.000.000.000" dan `-` untuk 0.
- `fmtNum` (`lib/shared/utils.ts`) **tidak bisa dipakai**: ia memulangkan teks kosong untuk 0. Pakai `Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })`.

---

## 4. Satuan disimpan sebagai kolom sendiri

`pk_sasaran.target_*` sekarang berisi satuan yang menempel. Data pengembangan: `"10%"`, `"765 Orang"`, `"4 Dokumen"`, `"1 Paket"`. Memisahkannya dari teks setiap kali mencetak tidak bisa diandalkan, jadi satuan disimpan sebagai kolom sendiri. Sumbernya sudah dibaca route impor (`rencana_aksi.satuan`), hanya dibuang setelah dipakai `fmtTarget`.

### Migrasi `docs/migrations/migration-pk-satuan.sql`

Aditif dan aman diulang, dengan cek `INFORMATION_SCHEMA` (gaya `migration-pk-sasaran-lebar.sql`). Kolom baru ikut ditulis ke `docs/schema-mysql.sql`.

```sql
ALTER TABLE pk_sasaran
  ADD COLUMN satuan_program     VARCHAR(50) NULL AFTER target_program,
  ADD COLUMN satuan_kegiatan    VARCHAR(50) NULL AFTER target_kegiatan,
  ADD COLUMN satuan_subkegiatan VARCHAR(50) NULL AFTER target_subkegiatan;

ALTER TABLE pk_dokumen_lampiran
  ADD COLUMN satuan VARCHAR(50) NULL AFTER target;
```

### Memisahkan data lama

Dilakukan sekali di migrasi, disertai laporan. Pisahkan **sesudah angka di depan**, bukan di spasi terakhir:

| Teks lama | Target | Satuan |
|---|---|---|
| `765 Orang` | 765 | Orang |
| `3 Laporan Bulanan` | 3 | Laporan Bulanan |
| `100%` | 100 | % |
| `86,72 %` | 86,72 | % |
| `Baik` (tidak diawali angka) | tidak diubah | tidak diubah, disebut di laporan |

Pola: `^\s*([0-9][0-9.,]*)\s*(.*)$`. `Persen` dinormalkan jadi `%`. Satuan yang lebih panjang dari 50 karakter tidak dipotong diam-diam: barisnya tidak diubah dan disebut di laporan.

Ke depan, `app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts` mengisi `target_*` dengan angka saja (helper baru `angkaTarget` di `lib/shared/target-renaksi.ts`) dan `satuan_*` dari `r.satuan`. `fmtTarget` tetap ada untuk IKI, yang memang menampilkan "37%" dalam satu kolom.

---

## 5. Jabatan dan Plt. — DIPUTUSKAN: tetap bentuk PRIMA, bagian ini tidak dikerjakan

Bentuk jabatan dibuat oleh kode (`fmtJabatan` dan `fmtJabatanTtd` di `lib/pk/docgen.ts`), bukan oleh templat. Templat hanya menyediakan tempatnya: `Jabatan: {jabatan_pertama}` dan `{jabatan_pertama_ttd}`.

Contoh PK Wakil Direktur Pelayanan. Di master tertulis `Plt. WAKIL DIREKTUR PELAYANAN` dan `DIREKTUR`:

| Tempat | PRIMA sekarang | PDF |
|---|---|---|
| Halaman 1, Nama pihak pertama | dr. RETNO WURYAN | **Plt.** dr. RETNO WURYAN |
| Halaman 1, Jabatan pihak pertama | Plt. Wakil Direktur Pelayanan RSJD Dr. Amino Gondohutomo | WAKIL DIREKTUR PELAYANAN |
| Halaman 1, Jabatan pihak kedua | Direktur RSJD Dr. Amino Gondohutomo | DIREKTUR RSJD DR. AMINO GONDOHUTOMO |
| Tanda tangan, jabatan | Plt. WAKIL DIREKTUR PELAYANAN | WAKIL DIREKTUR PELAYANAN |
| Tanda tangan, nama | dr. RETNO WURYAN | Plt. dr. RETNO WURYAN |
| Halaman 2, baris kedua | Unit Kerja : Plt. Wakil Direktur Pelayanan RSJD Dr. Amino Gondohutomo | WAKIL DIREKTUR PELAYANAN |

Usulan bila diikuti:

- Satu fungsi murni `pecahJabatan(jabatan) → { jabatan, plt }` dipakai semua tempat.
- **Jabatan** ditulis huruf besar, tanpa "Plt.", tanpa akhiran RS. Pengecualian: `DIREKTUR` → `DIREKTUR RSJD DR. AMINO GONDOHUTOMO`.
- **"Plt."/"Plh."** pindah ke depan nama, di halaman 1 dan di kedua tanda tangan. Placeholder nama baru `{nama_pertama_plt}`/`{nama_kedua_plt}` hanya kalau templat perlu dua bentuk. Bila semua tempat nama memakai bentuk ber-Plt., cukup ganti isi `{nama_pertama}`/`{nama_kedua}` tanpa menyentuh templat.
- Plt. mengikuti **jabatan di master**, bukan orangnya. PDF Kabid Penunjang memberi "Plt." pada dr. Retno sebagai Kabid Pelayanan Medis, padahal di jabatan itu ia definitif. Itu salah salin di PDF dan tidak ditiru.

---

## 6. Halaman 2: judul dan baris unit — tidak dikerjakan (templat tetap)

Dua suntingan kecil di templat. Bisa dikerjakan saat eksekusi lewat XML, atau oleh pemilik di Word.

1. Judul halaman 2 diberi kata **TAHUN**:
   - Murni: `PERJANJIAN KINERJA {tahun}` → `PERJANJIAN KINERJA TAHUN {tahun}`
   - Perubahan: `PERJANJIAN KINERJA PERUBAHAN {tahun}` → `PERJANJIAN KINERJA PERUBAHAN TAHUN {tahun}`
2. `Unit Kerja : {jabatan_pertama}` → `{unit_judul}`, tebal, rata tengah, huruf besar. PDF tidak memakai "Unit Kerja :".

`{unit_judul}` diturunkan dari jabatan master. Bentuk yang benar-benar ada di `pk_pejabat`: `KEPALA BAGIAN …`, `KEPALA BIDANG …`, `KASUBBAG …`, `KASIE …`, `WAKIL DIREKTUR …`, `DIREKTUR`, `Plt. …`. Aturannya satu fungsi murni:

| Jabatan (sesudah "Plt."/"Plh." dibuang) | `{unit_judul}` | Bukti di PDF |
|---|---|---|
| `KEPALA BAGIAN X` · `KABAG X` | `BAGIAN X` | BAGIAN UMUM |
| `KEPALA BIDANG X` · `KABID X` | `BIDANG X` | BIDANG KEPERAWATAN |
| `KEPALA SUB BAGIAN X` · `KASUBBAG X` · `KASUBAG X` | `SUB BAGIAN X` (dua kata) | SUB BAGIAN AKUNTANSI |
| `KEPALA SEKSI X` · `KASIE X` · `KASI X` | `SEKSI X` | SEKSI PENUNJANG MEDIS |
| lainnya (`WAKIL DIREKTUR …`, `DIREKTUR`) | jabatan itu sendiri | WAKIL DIREKTUR PELAYANAN |

Pencocokan tidak membedakan huruf besar/kecil. Jabatan yang tidak cocok satu pun tetap tercetak sebagai jabatan, tidak dikarang.

---

## 7. Titik yang disentuh

| Berkas | Perubahan |
|---|---|
| `lib/pk/docgen.ts` `buildLampiranTableXml` | §2: 5 kolom 10.350 dxa, judul + penomoran + baris level (diulang tiap halaman), satu nomor per sasaran + `vMerge`, 12 pt, tanpa arsiran, isi kosong kosong |
| `lib/pk/docgen.ts` `buildAnggaranTableXml` | §3: 4 kolom, NO, `Anggaran (Rp)`, nominal tanpa "Rp", 0 tetap 0, 12 pt |
| `lib/pk/docgen.ts` render | `{unit_judul}`; bila §5 disetujui: `pecahJabatan` untuk jabatan & nama. Komentar lama "section landscape" dibuang |
| `lib/pk/docgen.ts` `loadPkDokumenForGenerate` | `satuan` ikut di-SELECT dari `pk_dokumen_lampiran` |
| `lib/data/pk.ts` `gantiIsiDokumen` | kolom `bulkInsert` lampiran tambah `'satuan'` |
| `lib/data/pk-schemas.ts` | `lampiran.satuan` + `satuan_*` di skema Sasaran (`trim().max(50).nullable()`) |
| `app/(dashboard)/perjanjian-kinerja/form/_types.ts`, `_utils/pk-types.ts` | tipe `satuan` |
| `…/form/_components/LampiranAnggaranSplit.tsx` | isian Satuan ikut pilihan Master Sasaran, bisa diketik bila master kosong |
| `…/sasaran/sasaran-client.tsx` + route GET/POST sasaran | kolom Satuan per level. Tanpa SELECT & INSERT di route, nilainya hilang saat disimpan |
| `app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts` | §4: target angka, satuan terpisah |
| `lib/shared/target-renaksi.ts` | `angkaTarget` |
| `lib/pk/templates/*.docx` | §6 saja |
| `docs/migrations/migration-pk-satuan.sql` + `docs/schema-mysql.sql` | §4 |

Dokumen **FINAL** tidak berubah: `generated_file` tersimpan, dan regenerasi hanya terjadi saat finalisasi berikutnya.

---

## 8. Hubungan dengan konsep Renaksi

PDF tidak memuat bintang (`***`) maupun nomor `(1)`. Nama sasaran dan indikator PK ditarik dari Renaksi, dan di data Renaksi 2026 **seluruh 47** indikator berakhiran bintang. Tanpa `docs/CONCEPT-renaksi-bersihkan-nama.md` (minimal pintu 4–5: PK menarik dari Renaksi + Rapikan data PK lama), tabel PK tetap menampilkan bintang walaupun susunannya sudah sama dengan PDF.

---

## 9. Uji

1. `npx tsc --noEmit` dan `npx eslint --max-warnings 0` pada berkas yang disentuh.
2. `scripts/test-pk-sesuai-pdf.mts`, tanpa Word: susun dokumen dari templat sungguhan ke buffer, lalu periksa `word/document.xml`:
   - Tabel 1: 5 `gridCol` berjumlah ≤ 10.351, judul + penomoran `(1)`…`(5)` + baris level ber-`w:tblHeader`/`gridSpan=5`.
   - Satu sasaran dengan 3 indikator → satu nomor dan `vMerge`; sasaran berikutnya bernomor 2.
   - Tidak ada `w:shd` di dokumen.
   - Ukuran isi tabel `w:sz="24"`.
   - Tabel 2: 4 kolom, judul `Anggaran (Rp)`, nominal `3.000.000.000` tanpa "Rp", 0 tertulis `0`.
   - Halaman 2 memuat `TAHUN` dan `{unit_judul}` sesuai tabel §6 untuk setiap bentuk jabatan di `pk_pejabat`.
   - Kedua section `pgSz` 11.907 × 16.839.
   - Tidak ada `{…}` tersisa.
   - Bila §5 disetujui: tabel contoh §5 persis.
3. Pemisahan satuan §4 sebagai fungsi murni, dengan semua contoh tabelnya.
4. Migrasi di basis data kotak pasir: kolom terisi, laporan menyebut baris yang tidak bisa dipisah.
5. Layar: simpan dokumen DRAFT, buka lagi, satuan masih ada.
6. Dibuka di Microsoft Word sungguhan (COM, proses terpisah dengan batas waktu): tabel muat di kertas, judul diulang di halaman 3 untuk dokumen dengan sasaran banyak.
7. Uji mutasi pada aturan §2, §3, §6, dan §4.

---

## 10. Batas yang disadari

- Word tidak bisa persis piksel dengan PDF. Yang disamakan: struktur, teks judul, tebal/biasa, lebar relatif, garis, urutan blok.
- Huruf 12 pt lebih besar dari PDF (≈11 pt). Teks panjang turun baris lebih sering, isinya tetap sama.
- Salah ketik PDF tidak ditiru: `(4)(4)`, "SUB BAGIAN TATAUSAHA HUKUM…", "WAKIL DIREKTUR UMUM" (terpotong) di judul halaman 2 Wadir Umum, "86.72", Plt. pada pihak kedua Kabid Penunjang, NIP Direktur tanpa "NIP." di halaman 3 Wadir Umum.
- Margin section 2 kedua templat berbeda. Murni: atas 1.138, kiri 850, kanan 706, bawah 1.411. Perubahan: atas 1.411, kiri 706, kanan 850, bawah 1.138. Kemungkinan akibat memutar halaman di Word. Lebar bidang tulisnya sama (10.351), jadi tabel tetap muat. Diseragamkan atau tidak, itu keputusan pemilik templat.
- Templat versi kerja **belum di-commit**. Templat ikut commit pekerjaan ini supaya kode dan templat yang saling bergantung masuk bersamaan.

---

## 11. Yang diganti dari revisi pertama

| Revisi pertama | Kenyataan (dicek 11 Nov) |
|---|---|
| "Kegiatan" di depan "1 Terlaksananya…" = judul kolom yang terbaca berdampingan | Baris tersendiri di bawah penomoran, tebal, ada di 19 PDF |
| Lebar tabel 14.000 dxa "sudah benar" | Halaman tegak hanya 10.351 dxa |
| Kepala tabel 1 diarsir `D9D9D9` | PDF tanpa latar berwarna; pemilik memilih tanpa arsiran |
| Aturan judul unit dari awalan `Kabag`/`Kabid`/`Kasubbag`, sisanya `Unit Kerja : …`, dan `SUBBAGIAN` | Master menulis `KEPALA BAGIAN`, `KASIE`, `Plt. …`; PDF menulis `SUB BAGIAN`, `SEKSI`, dan jabatan Wadir apa adanya |
| Satuan data lama dipisah di spasi terakhir | Membelah "3 Laporan Bulanan" salah; dipisah sesudah angka di depan |
| Templat "sudah portrait" | Benar hanya untuk versi kerja yang belum di-commit; versi commit halaman 2 masih mendatar |
| Tidak dibahas | Satu nomor per sasaran + `vMerge`, nominal tanpa "Rp", judul diulang tiap halaman, jabatan & Plt. (§5), ketergantungan pada konsep Renaksi (§8) |

---

## 12. Pelaksanaan (11 Nov 2026)

**Dikerjakan**

- `lib/pk/tabel-word.ts` (baru, murni): dua tabel halaman 2. `docgen.ts` dipisah jadi `rakitPkDocx` (tanpa basis data) + `generatePkDocument`.
- Satuan kolom sendiri: `migration-pk-satuan.sql`, skema Zod, route Master Sasaran, route dokumen, form, layar Master Sasaran.
- Tarik dari Renaksi (sasaran dan program) membuang bintang dan nomor `(n)`, target angka saja, satuan terpisah. Aturannya di `lib/shared/nama-resmi.ts`; `buangBintang` E-Anggaran memakai aturan yang sama.
- Tombol **Rapikan Nama** di Master Sasaran dan Master Program untuk data lama. Berhenti di form: yang menulis tetap tombol Simpan.
- Isi dokumen ditulis satu fungsi (`tulisIsiDokumen`) untuk POST dan PATCH, dan menyimpan nama tanpa penanda. Pembuat Word membersihkannya lagi saat mencetak, jadi dokumen DRAFT lama ikut bersih tanpa disimpan ulang.

**Berbeda dari rencana**

- Kolom NO 700 dxa, bukan 500. Di Word, "NO" dan "(1)" patah jadi dua baris pada 500 dxa.
- Sel tabel diberi jarak paragraf rapat (2 pt atas-bawah, spasi tunggal). Bawaan templat 10 pt sesudah paragraf membuat baris tinggi.
- Pemisahan data lama hanya menyentuh Master Sasaran dan lampiran dokumen **DRAFT**. Dokumen FINAL tidak diubah; tabel LKJIP yang tertaut ke PK tetap menampilkan "765 Orang" lewat `gabungTargetSatuan`.
- Target lama yang satuannya masih menempel dipisah juga saat dicetak (`targetDanSatuan`), dengan aturan yang sama.

**Temuan yang ikut dibereskan**

- Sasaran berindikator banyak hanya bisa masuk dokumen dengan indikator pertamanya. Sekarang satu pilihan membawa semua indikator (`lib/pk/pilihan-sasaran.ts`), disisipkan berurutan supaya tercetak di bawah satu nomor.
- Lampiran dokumen 255 huruf, Master Sasaran 500: sasaran 300 huruf (ada di data 2026) bisa dipilih lalu ditolak saat disimpan. Kolom dan Zod disamakan ke 500.
- Master Program berisi sub kegiatan kembar gagal 500 tanpa pesan. Sekarang digabung dan jumlahnya disebut; yang lolos dijawab 409.
- Karakter kendali di teks (tempelan dari PDF atau Excel) membuat berkas Word tidak bisa dibuka. Sekarang dibuang.

**Tidak dikerjakan**

- §5 dan §6 (keputusan pemilik).
- Konsep Renaksi selain pintu PK: impor Renaksi, Data Entry, IKI, Rapikan data Renaksi. Masih menunggu jawaban §10 konsep itu dan pekerjaan T16.

**Bukti**

- `npx tsx --env-file=.env.local scripts/test-pk-sesuai-pdf.mts`: 175 pemeriksaan. Uji mutasi 24, 23 tertangkap; yang lolos (satuan tidak ditulis ke dokumen) ditutup dengan pemeriksaan H1.
- Aturan pisah versi SQL dijalankan di tabel sementara dan dibandingkan dengan versi TypeScript pada 17 contoh.
- Dibuka di Microsoft Word: kedua tabel 517,5 pt di bidang tulis 517,5 pt; kepala terulang di halaman 3 pada dokumen 14 sasaran; tiga indikator di bawah satu nomor.
- Layar (akun dummy, tanpa menyimpan): Master Sasaran 2026 menampilkan kolom Satuan dan "Rapikan Nama (117)"; form dokumen menambahkan 4 indikator untuk satu sasaran program.
- Belum diuji: Simpan dan Finalisasi dokumen lewat layar, tema terang, lebar ponsel.

**Yang terlihat dan dibiarkan**

- Blok tanda tangan halaman 2 pindah ke halaman 3 walau halaman 2 masih longgar. Itu sifat templat, bukan tabelnya.
- Tabel tanda tangan templat sedikit lebih lebar dari bidang tulis (480 pt di 467,9 pt; 531,4 pt di 517,5 pt).
