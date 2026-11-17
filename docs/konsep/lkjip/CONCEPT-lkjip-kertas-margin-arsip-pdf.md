# Konsep — Kertas F4, margin per dokumen, dan arsip PDF LKJIP

Status: **K1–K8 disetujui sesuai usulan (2026-11-17)**; K8 = seluruh pengguna yang punya akses LKJIP. **Bagian B selesai (2026-11-17)**, catatan di §B.4; bagian A dikerjakan sesudahnya. Lanjutan `docs/CONCEPT-lkjip-pratinjau-dan-word.md`. Di sana kertas F4 dan margin masuk §7 "Sengaja tidak", dan arsip PDF masuk keputusan D10 "nanti". Pemilik meminta keduanya dikerjakan (2026-11-17). Catatan kaki (Tahap 5 konsep itu) dibatalkan.

Ada dua bagian yang saling lepas dan bisa dipasang sendiri:

| Bagian | Isi | Migrasi |
|---|---|---|
| A | Ukuran kertas (A4/F4) + margin per dokumen | tidak — `style_config` sudah JSON |
| B | PDF ikut diarsipkan ke Drive saat Simpan Versi (dan Finalisasi, K7) + unduh arsip untuk semua pemegang akses | ya — 2 kolom di `lkjip_versi` |

---

## A. Kertas dan margin per dokumen

### A.1 Kenapa tidak cukup mengganti dua angka

Sekarang geometri halaman adalah konstanta:
- `KERTAS` dan `MARGIN` di `lib/lkjip/halaman.ts`;
- `LEBAR_TULIS_DXA = 8788` (± 15,5 cm) dan `LEBAR_TULIS_MELINTANG_DXA = 13720` di `lib/lkjip/tabel.ts`.

Lebar bidang tulis itu dipakai di **10 berkas**, dan semuanya harus sepakat:

| Pemakai | Untuk apa |
|---|---|
| `docgen.ts` | `w:pgSz`/`w:pgMar` tiap section, tab footer (nomor di kanan/tengah), lebar tabel Word, lebar kolom gambar berdampingan |
| `halaman.ts` | batas indent paragraf (penanda penggaris tidak boleh lewat tepi) |
| `PenggarisNarasi.tsx` | garis cm & posisi penanda |
| `TiptapNarasi.tsx` | lebar kotak narasi (`PX_TULIS`) dan satuan indent di layar (`--lk-dxa`) |
| `TabelEditor` | garis batas kertas & tombol "Paskan ke lebar kertas" — sudah menerima prop `kertas` (dipakai IKI) |
| `ukuran-gambar.ts` | lebar & tinggi gambar paling besar, lebar kolom gambar berdampingan |
| `GambarBerukuran.tsx` | pratinjau gambar & isian lebar (cm) |
| `schemas.ts` | batas Zod `lebarEmu`/`tinggiEmu` gambar |

Kalau salah satu memakai angka lama, yang terlihat di editor berbeda dari yang tercetak, tanpa ada yang sadar. Kejadian seperti ini sudah pernah tercatat di penggaris (konsep penggaris-narasi).

### A.2 Rancangan

**Satu fungsi geometri, MURNI:** `geometri(cfg)` di `halaman.ts`. Isinya dihitung dari `style_config`:
- `kertas {lebar, tinggi}`;
- `margin {atas, kanan, bawah, kiri}` dalam dxa;
- `lebarTulis`, `lebarTulisMelintang`, `tinggiTulis`, `tinggiTulisMelintang`;
- XML `pgSz` / `pgSzMelintang` / `pgMar`.

Semua pemakai di A.1 menerima hasil fungsi ini, bukan konstanta. Konstanta lama tetap ada sebagai **nilai bawaan** (A4 + margin sekarang) untuk pemanggil yang memang tidak tahu dokumennya, misalnya IKI. Nilai bawaan itu sama dengan `geometri(DEFAULT_STYLE)`, dan uji yang menjaganya.

**Kunci baru `style_config`** (WAJIB di `StyleConfigSchema`; tanpa kunci = perilaku sekarang):

| Kunci | Nilai | Bawaan |
|---|---|---|
| `kertas` | `'A4'` \| `'F4'` | `'A4'` |
| `marginCm` | `{ atas, kanan, bawah, kiri }`, cm, 2 desimal | `{2,5 · 2,5 · 2,5 · 3}` |

- Dokumen lama tanpa kunci ini keluar **byte-sama** di Word, dibuktikan seperti di Tahap 2: Word dari kode lama dan baru dibandingkan.
- Margin disimpan dalam cm, karena itu yang diketik orang. Diubah ke dxa lewat `indentTwips` yang sudah ada: 2,5 cm = 1.418 dxa dan 3 cm = 1.701 dxa, persis angka `MARGIN` sekarang.
- **Batas:** tiap sisi 1–5 cm (K3), dan lebar bidang tulis minimal 10 cm. Kalau tidak, penggaris dan tabel jadi tidak masuk akal. Pemeriksaan ada di Zod (server) dan di form (layar), dengan satu aturan.
- Jarak header/footer dari tepi kertas tetap 1,25 cm.

**Pengaturan Dokumen (⚙):**
- pilihan **Ukuran kertas** (A4 / F4);
- empat isian **Margin (cm)** plus tombol "Kembalikan bawaan";
- baris keterangan: "Bidang tulis: 15,5 × 24,7 cm" (tegak) dan lebarnya saat melintang.

**Halaman melintang** (tabel melintang): kertas yang sama diputar. Margin mengikuti aturan Word: angka atas/kanan/bawah/kiri tetap milik sisi yang sama dari sudut pembaca, sama dengan sekarang.

### A.3 Isi lama yang jadi lebih lebar dari bidang tulis

Contohnya margin diperlebar, atau kertas F4 dikembalikan ke A4. Pada kasus ini **data tidak ditulis ulang**; yang menyesuaikan adalah gambarannya:
- **Tabel:** sudah disusutkan sebanding ke lebar tulis (`lebarKolomWord`), tinggal diberi lebar tulis dokumen. Garis batas di editor ikut pindah.
- **Gambar:** ukuran tersimpan dijepit ke lebar & tinggi tulis saat digambar (`jepitUkuran`). Editor menulis ukuran yang benar-benar dipakai ("Di Word: …").
- **Indent paragraf:** dijepit saat digambar. Penggaris menampilkan posisi yang dijepit.
- **Batas Zod gambar:** `lebarEmu` mengikuti bidang tulis TERLEBAR yang mungkin (F4, margin 1 cm), bukan dokumen. Jadi ganti kertas tidak membuat simpanan lama ditolak.

Sesudah Simpan Pengaturan, layar menyebut bila ada yang terdampak, misalnya "3 gambar dan 1 tabel akan dikecilkan supaya muat". Pengaturan tetap tersimpan; ini kabar, bukan penolakan.

### A.4 Impor Word

`sectPr` badan berkas (`w:pgSz`, `w:pgMar`) dibaca. Section terakhir dipakai, karena itu yang berlaku untuk isi.
- Ukuran yang cocok dengan A4 atau F4 (toleransi 2 mm) → `kertas`.
- Ukuran lain (Letter, Legal) → A4, plus peringatan di pratinjau impor.
- Margin dibaca apa adanya bila masuk batas (§A.2). Di luar batas → bawaan, plus peringatan.
- Section melintang tidak dipakai sebagai patokan, karena itu halaman tabel.

### A.5 Uji

1. **Bawaan identik:** Word dari kode lama vs baru, byte-sama untuk beberapa setelan, termasuk tabel melintang dan gambar berdampingan.
2. **F4:** `pgSz` benar, lebar tulis, tab footer (nomor di kanan menempel di tepi baru), lebar tabel "selebar kertas", lebar kolom gambar.
3. **Margin:** `pgMar` benar; penggaris dan batas indent mengikuti; Zod menolak sisi di luar 1–5 cm dan bidang tulis di bawah 10 cm.
4. **PDF LibreOffice:** ukuran halaman PDF = F4, dan teks/gambar tidak melewati margin. Diukur lewat koordinat teks pdfjs, seperti uji header-footer.
5. **Microsoft Word (COM):** `PageSetup.PageWidth/Height/margins` sama dengan isian.
6. **Impor Word:** berkas A4, F4, Letter, dan margin aneh.
7. **Peramban:** ganti F4 + margin → penggaris, garis batas tabel, dan "Di Word" gambar berubah; ponsel 375 px.
8. Uji mutasi.

---

## B. Arsip PDF ke Drive

### B.1 Keadaan sekarang

- **Simpan Versi** memotret dokumen ke `lkjip_versi`. Bila Drive sudah diatur, Word ikut diunggah (`unggahKeTujuan('lkjip_arsip')`) dan id-nya ditulis di `drive_file_id`.
- **Finalisasi** hanya mengunci dokumen. Tidak ada foto versi dan tidak ada arsip.
- **Temuan (bug lama):** tombol "Unduh arsip Drive" di Riwayat lewat `/api/upload/download`. Route itu hanya mengenali berkas di `uploaded_files`, sedangkan arsip versi tidak dicatat di sana. Akibatnya **pemegang akses LKJIP yang bukan admin selalu ditolak** ("Akses ditolak"). Admin lolos karena admin melewati pemeriksaan pemilik. Arahnya aman (menolak, bukan membocorkan), tapi tombolnya tidak berguna bagi penyusun LKJIP biasa.

### B.2 Rancangan

- **Satu Word, dua arsip:**
  1. Simpan Versi membuat Word sekali.
  2. Word itu diunggah seperti sekarang.
  3. Buffer yang sama diubah ke PDF lewat `ubahKePdf`, jalur yang sama dengan Pratinjau, lalu diunggah ke tujuan `lkjip_arsip`.
  4. PDF tidak dibuat dari tarikan data kedua: Word dan PDF di arsip harus berisi hal yang sama persis.
- **Kolom baru** `lkjip_versi.pdf_file_id` VARCHAR(64) NULL + `pdf_name` VARCHAR(255) NULL. Migrasinya `docs/migrations/migration-lkjip-versi-pdf.sql` + `docs/schema-mysql.sql`, dan WAJIB dijalankan di server kantor sebelum kodenya dipasang.
- **PDF gagal tidak menggagalkan Simpan Versi:**
  - LibreOffice tidak ada, antrean penuh, atau batas waktu → Word tetap diarsipkan.
  - Toast menyebut sebabnya, misalnya "+ arsip Word · PDF dilewati: LibreOffice sedang dipakai, coba Simpan Versi lagi".
  - Riwayat menandai versi yang tanpa PDF.
- **Huruf hilang di server** (`hurufTerpasang`): PDF tetap diarsipkan, dan Riwayat menyebut huruf penggantinya.
- **Unduh arsip:** route baru `GET /api/lkjip/[id]/versi/[versiId]/arsip?jenis=word|pdf`.
  - Penjaganya sama dengan modul LKJIP (`guard`).
  - Baris versi dicari lewat `dokumen_id` + `versiId`, jadi id berkas tidak pernah diterima dari klien.
  - Berkas dialirkan dari Drive dan diaudit `FILE_DOWNLOAD`.
  - Route ini **menggantikan** tombol lama, sekaligus memperbaiki temuan B.1.
- **Riwayat Versi:** dua tombol, "Word" dan "PDF". PDF dibuka di tab baru, sama seperti Pratinjau. Penanda "☁ Drive" menyebut apa saja yang ada.
- **Audit:** `LKJIP_DRIVE_ARCHIVE` kini menyebut Word dan PDF (atau sebab PDF dilewati).
- **Retensi:** 20 versi terakhir, sama seperti sekarang. Berkas Drive versi yang terpangkas tetap di Drive, juga sama seperti sekarang.

### B.3 Uji

- **Unit:** nama berkas, PDF gagal → Word tetap, route arsip menolak versi milik dokumen lain dan menolak `jenis` asing.
- **MySQL (kotak pasir 2099):** kolom baru terisi, versi lama tanpa PDF tetap tampil.
- **Ujung-ke-ujung di dev:** Simpan Versi → dua berkas di Drive tujuan `lkjip_arsip`. Lalu unduh keduanya **sebagai akun dummy non-admin ber-akses LKJIP**; ini membuktikan B.1 sudah diperbaiki. Berkas uji di Drive dihapus sesudahnya.
- Uji mutasi.

### B.4 Catatan pelaksanaan (2026-11-17)

- **Bug B.1 terbukti di dev:** akun dummy dijadikan non-admin (MDSI + akses `lkjip`). Route lama menolak arsip Word & PDF (403), route baru memberi 200.
  - Uji pertama sempat memberi 200 palsu. Penyebabnya cache peramban: route lama mengirim `Cache-Control: private, max-age=60`, dan URL yang sama baru saja diambil sebagai admin. Uji ulang dengan `cache: 'no-store'`.
- **Kalimat & bentuk hasil** di `lib/lkjip/arsip-teks.ts` (aman-klien): `ringkasArsip` dipakai toast DAN audit `LKJIP_DRIVE_ARCHIVE`. Pekerjaan server di `lib/lkjip/arsip-versi.ts` (`arsipkanVersi`, `arsipkanDanCatat`, `alasanPdf`). Fungsi itu tidak ditaruh di berkas route karena Next.js menolak ekspor selain handler.
- **Waktu:** Simpan Versi ± 12 dtk pada panggilan pertama di dev (termasuk kompilasi route), Finalisasi ± 8 dtk.
- **Finalisasi:** versi "Final" dibuat SESUDAH dokumen terkunci. Bila foto/arsip gagal, Finalisasi tetap berlaku dan toast menyebutnya.
- **Bersih-bersih uji:** berkas Drive uji dihapus, `drive_arsip.dihapus_pada` diisi, baris versi dan dokumen uji 2099 dihapus, dan peran dummy dikembalikan.
- **Regresi:** `npx tsx --env-file=.env.local scripts/test-lkjip-arsip-pdf.mts` (26; bagian C MySQL dokumen kotak pasir 2040), 12 uji mutasi tertangkap.

---

## 5. Keputusan pemilik

| No | Pertanyaan | Usulan |
|---|---|---|
| K1 | Ukuran F4: 21,5 × 33 cm (yang biasa diketik di Word di kantor) atau 8,5 × 13 inci "Folio" (21,59 × 33,02 cm, yang dipakai Excel IKI)? Selisihnya < 1 mm | 21,5 × 33 cm |
| K2 | Margin: empat isian bebas, atau beberapa pilihan jadi? | Isian bebas + "Kembalikan bawaan" |
| K3 | Batas margin tiap sisi | 1–5 cm, bidang tulis minimal 10 cm |
| K4 | Header/footer ikut setelan margin, atau jaraknya tetap 1,25 cm dari tepi? | Tetap 1,25 cm |
| K5 | Impor Word membawa ukuran kertas & margin berkas? | Ya (§A.4) |
| K6 | Pembuatan PDF menambah ± 4–8 detik pada Simpan Versi: ditunggu (hasilnya langsung disebut), atau dikerjakan di latar (Simpan Versi tetap cepat, status PDF tampil di Riwayat sesudahnya)? | Ditunggu — Simpan Versi jarang, dan hasil yang langsung disebut lebih jujur |
| K7 | Finalisasi otomatis membuat versi "Final" berisi foto + arsip Word & PDF? | Ya — dokumen FINAL tidak berubah lagi, jadi arsipnya paling berharga |
| K8 | Tombol unduh arsip di Riwayat: semua pemegang akses LKJIP, atau admin saja seperti yang (tidak sengaja) berlaku sekarang? | Semua pemegang akses — modul kolaboratif (AUTHZ-02), dan unduhan Word/PDF dokumen yang sama sudah terbuka bagi mereka |

## 6. Urutan

1. **B dulu.** Bagian ini lebih kecil, memperbaiki bug yang sudah ada, dan memakai jalur PDF yang sudah teruji.
2. **Lalu A.** A menyentuh paling banyak berkas. Uji "bawaan identik" ditulis dulu, sebelum satu konstanta pun diganti.
