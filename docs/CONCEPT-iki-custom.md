# CONCEPT — IKI varian CUSTOM (tabel bebas ala LKJIP)

> Status: **keputusan diambil 2026-10-21, dieksekusi** (Tahap 0–3). Keputusan → §9.
> Terkait: `docs/CONCEPT-iki.md` (varian STANDAR/DIREKTUR), `docs/CONCEPT-lkjip-tabel-excel.md` (mesin tabel yang dipakai ulang).

## 1. Masalah

Bentuk tabel IKI tertanam di kode: STANDAR 11 kolom, DIREKTUR 8 kolom (`lib/iki/layout.ts`), isinya di kolom DB tetap (`iki_rhk.rhk`, `aspek_a/b/c`, `indikator`, … `iki_rhk_triwulan.target_tw/uraian/target_aksi`). Format dari BPSDMD bisa berubah (mis. tambah kolom ke-12), dan sekarang menyesuaikannya berarti mengubah kode, skema, PDF, Excel, editor, dan pembaca impor sekaligus.

Yang diminta: varian **ketiga** yang tabelnya dirancang sendiri di web — kolom, baris, gabungan sel — seperti tabel LKJIP, lalu dipakai untuk dokumen. **STANDAR & DIREKTUR tidak disentuh.**

## 2. Bentuk dokumen CUSTOM

| Bagian | Asal isi | Bisa diubah bentuknya? |
|---|---|---|
| Judul (`docTitle`, + " PERUBAHAN") | bawaan | tidak |
| I. Data Pribadi (OPD, Nama, NIP, Jabatan, Ikhtisar) | kolom `iki_dokumen` | tidak (keputusan #1) |
| **II. Tabel** | **tabel bebas** | **ya — seluruhnya** |
| Blok tanda tangan (`buildTtd`) | kolom `iki_dokumen` | tidak (keputusan #1) |

Sebab Data Pribadi & tanda tangan tetap bawaan: isinya sudah ada di `iki_dokumen` (autofill dari Master Pejabat PK), dan kalau ikut jadi sel bebas, nama/NIP/pangkat harus diketik ulang di tiap dokumen — sumber salah ketik yang baru saja kejadian (pangkat kosong di server kantor, 2026-10-20).

## 3. Mesin tabel — dipakai ulang, bukan ditulis ulang

LKJIP sudah punya seluruh perilakunya: gabung/pisah sel, kepala bertingkat, sisip/hapus baris & kolom (gabungan & rumus ikut bergeser), tempel dari Excel/Word lengkap dengan gabungan, isi-seret, Ctrl+B/I/U, rata, lebar kolom, teks tegak, urutkan, cari & ganti. Aturannya fungsi MURNI di `lib/lkjip/tabel.ts`; pilihan sel di `usePilihanSel.ts`.

**Yang perlu dikerjakan (bagian yang tidak kelihatan):** `TabelEditor.tsx` (1.250 baris) hidup di `app/(dashboard)/lkjip/[id]/` dan menerima `block: BlockNode` milik LKJIP, serta membawa fitur khas LKJIP: tautan modul (`lib/lkjip/tautan.ts`), nomor Tabel/Gambar, `warnaKepala` dokumen, judul & sumber tabel.
- Pindah ke komponen bersama (mis. `components/tabel/TabelEditor.tsx`) dengan masukan netral `{ payload, readOnly, onSave }`.
- Fitur khas LKJIP jadi **opsional lewat prop**; IKI memakainya tanpa tautan/nomor objek.
- `lib/lkjip/tabel.ts` tetap di tempatnya (atau dipindah ke `lib/shared/tabel.ts` dengan re-export, pola `toDateStr`), supaya tak satu pun pemanggil LKJIP berubah.
- Syarat selesai: **seluruh suite LKJIP tetap hijau** sesudah pemindahan (`test-lkjip-tabel-excel`, `-word`, `-bc`, `-tertaut`, `-angka-modul`, `-versi-tertaut`, `bab-wajib`) — pemindahan tanpa perubahan perilaku dikerjakan sebagai tahap tersendiri, sebelum IKI menyentuhnya.

## 4. Templat — supaya tidak menggambar 20 kali

Satu tahun ± 20 dokumen dengan bentuk tabel yang sama. Merancang gabungan sel 20 kali = 20 peluang beda.

- **Simpan sebagai templat** dari dokumen CUSTOM mana pun: menyimpan BENTUK (kepala, lebar kolom, rata, gabungan kepala, pola baris contoh) — bukan isinya.
- **Buat dari templat** di modal Buat IKI (varian CUSTOM → pilih templat).
- Dokumen **menyalin** templat saat dibuat. Mengubah/menghapus templat sesudahnya **tidak** mengubah dokumen yang sudah ada — dokumen FINAL yang sudah ditandatangani tidak boleh bergeser diam-diam (pelajaran yang sama dengan snapshot LKJIP & Rekap PJ BLUD).
- Hak mengelola templat: **semua pemegang akses IKI** (keputusan #2) — buat, ganti nama, hapus; tiap aksi tercatat di audit. Menghapus/mengubah templat tidak menyentuh dokumen yang sudah dibuat darinya.

## 5. Data model (draf — final saat eksekusi)

```sql
-- migration-iki-custom.sql
ALTER TABLE iki_dokumen
  MODIFY varian ENUM('STANDAR','DIREKTUR','CUSTOM') NOT NULL DEFAULT 'STANDAR',
  ADD COLUMN tabel_custom JSON NULL COMMENT 'Varian CUSTOM: payload tabel (bentuk = TabelPayload LKJIP tanpa tautan)',
  ADD COLUMN templat_id INT NULL COMMENT 'Soft-FK iki_templat — jejak asal saja, isi sudah disalin';

CREATE TABLE iki_templat (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nama        VARCHAR(150) NOT NULL,
  payload     JSON NOT NULL,
  created_by  INT NULL, updated_by INT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iki_templat_nama (nama)
);
```

- Dokumen CUSTOM **tidak memakai** `iki_rhk`/`iki_rhk_triwulan` — `jumlah_rhk` di daftar diganti jumlah baris badan tabel.
- Zod: `tabel_custom` divalidasi skema sel LKJIP yang SAMA (`CellSchema` — termasuk `i`/`u`/`fc`/`rot`), dengan batas ukuran (baris/kolom/panjang teks) supaya JSON tidak tak terbatas. Kunci tak dikenal dibuang Zod → kunci baru WAJIB didaftarkan (pelajaran `tautan`/`nomorPerBab`).
- `superRefine`: varian CUSTOM wajib punya `tabel_custom`; STANDAR/DIREKTUR wajib tidak.
- Migrasi **wajib dijalankan di server kantor sebelum kodenya dipasang**.

## 6. Unduhan

- **PDF** (jspdf-autotable — mendukung `rowSpan`/`colSpan`) & **Excel** (exceljs `mergeCells`) membaca kisi yang sama lewat SATU penyusun rangka, cermin peran `buildIkiGrid` untuk STANDAR/DIREKTUR.
- Lebar kolom disusutkan sebanding ke lebar bidang tulis kertas mendatar — **A4 (± 281 mm) atau F4 (± 314 mm), dipilih per dokumen** (keputusan #3) — pola `lebarKolomWord` LKJIP.
- Format sel (tebal, miring, rata, teks tegak, warna kepala) ikut ke keduanya; sel kepala diulang di tiap halaman PDF.
- Unduh Zip, Riwayat Versi (`iki_versi.snapshot` ikut membawa `tabel_custom`), dan Duplikat ke tahun lain ikut menangani varian ini.

## 7. Yang sengaja TIDAK berlaku di CUSTOM (tahap 1–2)

Fitur ini butuh tahu kolom mana berisi RHK/target, dan tabel bebas tidak menyatakannya:
- Impor dari Rencana Aksi · Impor RHK atasan (kaskade per RHK) · Impor Excel BPSDMD (`lib/iki/import-excel.ts` dikalibrasi ke 11/8 kolom) · peringatan target TW vs tahunan (`lib/iki/validate.ts`).
- Tombol-tombol itu **disembunyikan** di dokumen CUSTOM, bukan dimatikan tanpa sebab.
- Tautan dokumen atasan (`atasan_dokumen_id`) **tetap** — itu milik header dokumen, bukan tabel.

Tahap 3 (opsional): **peran kolom** — tandai kolom sebagai RHK / Indikator / Target Tahunan / Target TW I–IV, lalu impor & validasi mengisi kolom bertanda.

## 8. Tahapan

| Tahap | Isi | Catatan | Status |
|---|---|---|---|
| 0 | Pindahkan editor tabel LKJIP ke komponen bersama, tanpa perubahan perilaku | suite LKJIP hijau = syarat lulus | **selesai 2026-10-21** |
| 1 | Varian CUSTOM: buat, sunting tabel, simpan (CAS `version`), PDF, Excel, Zip, versi, duplikat | migrasi `migration-iki-custom.sql` | **selesai 2026-10-21** |
| 2 | Templat: simpan dari dokumen, pakai saat Buat IKI, kelola (ganti nama/hapus) | | **selesai 2026-10-21** |
| 3 | Peran kolom → impor Renaksi/atasan & validasi untuk CUSTOM | opsional — rancangan §11 | **selesai 2026-10-21** |

## 9. Keputusan (pemilik, 2026-10-21)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Data Pribadi & tanda tangan | **Tetap bawaan** — yang dirancang bebas hanya tabel bagian II |
| 2 | Pengelola templat | **Semua pemegang akses IKI** (buat, ganti nama, hapus) — jejaknya di audit `IKI_*` |
| 3 | Kertas | **A4 atau F4 mendatar, dipilih per dokumen** (ikut tersimpan di templat) |
| 4 | Batas kolom | **24** (LKJIP tetap 12) |

### 9.1 Batas kolom — temuan saat eksekusi

Mesin tabel LKJIP membatasi **12 kolom** di empat tempat: `BATAS_KOLOM_TABEL` (editor: sisip, tempel, "+ Kolom"), `TabelPayloadSchema` (`kolom`/`align`/`colWidths`/baris `.max(12)`), `CellSchema.cs` `.max(12)`, dan `htmlKeSel` (colspan tempelan dijepit 12). Sebabnya halaman Word A4 tegak. IKI tidak boleh ikut batas itu, LKJIP tidak boleh ikut longgar:
- editor menerima `batasKolom` (bawaan `BATAS_KOLOM_TABEL`), `htmlKeSel(html, batasKolom)` idem;
- skema sel jadi pabrik `buatCellSchema(batasKolom)` — LKJIP memanggilnya dengan 12, IKI dengan 24.

Lebar per kolom di kertas (huruf PDF 7 pt): A4 mendatar 281 mm, F4 mendatar 314 mm (margin 8 mm). 20 kolom ≈ 14 mm/kolom di A4, ≈ 15,7 mm di F4 — cukup untuk angka/target; kolom teks panjang (RHK) perlu dilebarkan dan yang lain menyempit. Lebar kolom editor disusutkan sebanding ke lebar kertas saat dicetak (pola `lebarKolomWord`).

### 9.2 Tanda tangan CUSTOM

Satu aturan: **Nama Atasan terisi → dua blok** (Mengetahui atasan + pegawai, seperti STANDAR); **kosong → satu blok** pegawai di kanan. Tidak ada pilihan terpisah yang bisa berbeda pendapat dengan isiannya.

### 9.3 Varian CUSTOM tidak bisa ditukar

STANDAR ⇄ DIREKTUR tetap bisa ditukar di editor (isinya sama-sama RHK). CUSTOM ⇄ lainnya **ditolak di server** (`IkiVarianTerkunciError`): simpan itu hapus-lalu-tulis-ulang, jadi menukar ke CUSTOM membuang seluruh RHK dan sebaliknya membuang tabelnya — tanpa satu pertanyaan pun. Pintu lain yang sama: Impor Excel "timpa isi dokumen yang sudah ada" ke dokumen CUSTOM ikut ditolak pagar yang sama (L69).

### 9.4 Satu tombol Simpan

Di LKJIP editor tabel punya tombol "Simpan Tabel" sendiri (satu blok = satu simpanan). Di IKI tabel adalah bagian dokumen yang disimpan bersama Data Pribadi & tanda tangan oleh tombol **Simpan** halaman (CAS `version`) — editor melaporkan perubahan lewat `onUbah`, tanpa tombol simpan kedua (L78: satu sasaran, satu penulis).

## 10. Hasil eksekusi (2026-10-21)

**Tahap 0 — editor bersama.** `TabelEditor.tsx`, `usePilihanSel.ts`, `RowMenu.tsx` pindah ke `components/tabel/`; CSS tabel (174 aturan, urutan dipertahankan) ke `components/tabel/tabel-css.ts` dan disisipkan ke ED_CSS LKJIP di tempat aturan tabel pertama dulu berada. Props netral: `payload`, `batasKolom`, `kertas`, `onSave` (tombol "Simpan Tabel") / `onUbah` (tiap perubahan, isi saat dibuka jadi patokan), `lkjip` (judul, sumber, cetak Word, tautan — modal tautannya dioper editor LKJIP, komponen bersama tidak menjangkau berkas layar LKJIP). Bukti tanpa perubahan perilaku: potret gaya terhitung 147 elemen × 41 properti di tema gelap & terang identik sebelum/sesudah (2 selisih = keadaan `:focus`), suite LKJIP hijau (jalur berkas di ujinya disesuaikan).

**Cacat lama ikut dibereskan (terlihat di layar, bukan dari kode):**
- Tabel editor ber-`width: 'auto'` DIPERAS ke lebar wadahnya bila kolomnya lebih lebar — LKJIP 5 × 140 px tampil 107–122 px, IKI 20 kolom 17 px. Lebar yang diatur (dan dicetak Word) tidak sama dengan yang tampil, garis batas kertas meleset dari kolomnya. Kini lebar tabel = jumlah lebar kolom, wadahnya bergulir mendatar.
- Editor IKI tidak punya tata letak ponsel: kisi Data Pribadi 3 kolom memaksa halaman ± 572 px di layar 375 px (semua varian). Media query ≤ 760 px.

**Tahap 1–2.** `lib/iki/custom.ts` (MURNI): `TabelCustom`, `bacaTabelCustom`, `tabelCustomAwal`, `bentukTemplat`, `susunKisiCetak` (SATU penyusun kisi untuk PDF & Excel — rumus dihitung, galat "—", kolom No., gaya tabel lewat `gayaSel`/`selBergaya` yang sama dengan editor, kepala abu IKI), `lebarKolomMm`. Kertas F4 = Folio 8,5 × 13 in (Excel `paperSize` 14; tipe exceljs tidak mengenal nilai itu, Excel mengenalnya). Teks tegak di PDF digambar sendiri di `didDrawCell` (autoTable tidak memutar teks); **garis bawah huruf tidak tampil di PDF** (jsPDF tidak mendukung) — Excel membawanya. Data: `listDokumen` menghitung baris badan untuk CUSTOM; `createDokumen` menyalin templat (bukan merujuk); `saveDokumen` menolak tukar varian (`IkiVarianTerkunciError` → 409 `VARIAN_TERKUNCI`); duplikat & pulihkan versi membawa tabel. Templat: `/api/iki/templat` (GET/POST/PATCH/DELETE, `guard()` modul IKI, audit `IKI_CREATE/UPDATE/DELETE`). Layar: modal Buat IKI (varian ketiga + pilih/ganti nama/hapus templat), editor (Kertas, Simpan sebagai templat, tabel di bagian II), lencana CUSTOM & "N baris" di daftar, Impor Excel tidak menawarkan "timpa" dokumen CUSTOM.

**Uji.** `npx tsx scripts/test-iki-custom.mts` (89; bagian H MySQL kotak pasir 2094–2095, auto-bersih), **46 uji mutasi tertangkap** — 2 sempat LOLOS, keduanya kelemahan tes: tabel 24 kolom D1 dibangun lewat `bacaTabelCustom` yang ikut terpangkas batas mutan (A3 pun membandingkan dengan konstanta yang diuji), dan H6 `rows[3][3]` meledak alih-alih mencatat FAIL. Di peramban (tahun 2096, dibersihkan): buat CUSTOM lewat modal, 4 → 20 → berhenti 24 kolom, rumus & No. otomatis, F4 menggeser garis kertas, Simpan & muat ulang, Paskan ke lebar kertas, Simpan sebagai templat → Buat dari templat (ganti nama di modal), PDF F4 (dibuka di penampil) & Excel (disadap, tidak terunduh), 409 tukar varian lewat permintaan langsung, tema terang, 375 px. **Belum dicoba:** Unduh Zip berisi dokumen CUSTOM lewat layar (aturannya teruji: `alasanTakBisaCetak`), membuka berkas Excel CUSTOM di Microsoft Excel sungguhan.

## 11. Tahap 3 — peran kolom (keputusan pemilik 2026-10-21)

**Masalah.** Tabel CUSTOM tidak menyatakan kolom mana berisi RHK atau target, jadi tiga fitur STANDAR mati di sana: Ambil dari Rencana Aksi, Ambil dari IKI Atasan, dan peringatan target TW vs tahunan. Ada satu lubang lagi: kaskade **dari** atasan CUSTOM juga mati — `import-atasan` membaca `iki_rhk`, padahal dokumen CUSTOM tidak punya baris di sana. Bawahan dari atasan CUSTOM (STANDAR maupun CUSTOM) melihat "belum punya baris RHK".

**Keputusan:**

| # | Pertanyaan | Keputusan |
|---|---|---|
| 5 | Letak target triwulan | **Dua-duanya** — mendatar (TW I–IV empat kolom, satu indikator = satu baris) atau menurun ala BPSDMD (satu kolom Target TW, empat baris per indikator); mana yang berlaku ditentukan kolom yang ditandai |
| 6 | Baris ber-RHK atasan sama saat impor | **Digabung** — sel "RHK yang diintervensi" dan No. digabung untuk baris berurutan yang RHK atasannya sama (satu nomor per RHK atasan, seperti STANDAR) |

### 11.1 Peran

| Peran | Isi dari Renaksi | Isi dari atasan |
|---|---|---|
| RHK yang diintervensi | sasaran induk / induk | RHK atasan |
| Rencana Hasil Kerja | outcome (cadangan: nama) | — |
| Indikator | indikator | — |
| Cara hitung (aspek b) | jenis | aspek b atasan |
| Target tahunan | target tahunan | — |
| TW I · TW II · TW III · TW IV (mendatar) | target TW | — |
| Kolom TW · Target TW (menurun) | I–IV · target TW | I–IV |

- Satu peran = satu kolom, satu kolom = satu peran. TW mendatar dan TW menurun saling meniadakan: menandai yang satu melepas yang lain, jadi tidak ada keadaan "dua-duanya" yang harus ditebak artinya.
- Disimpan sebagai `TabelCustom.peran` (peran → indeks kolom), **ikut bergeser** saat kolom disisip/dihapus lewat `BentukTabel` — jalur yang sama dengan kolom No. otomatis. Kolom yang dihapus melepas perannya. Mesin tabel LKJIP tidak berubah perilaku: kunci itu hanya ada bila pemakainya mengirimnya.
- Templat membawa peran (templat = bentuk). Tabel awal tanpa templat langsung bertanda RHK/Indikator/Target tahunan.
- Penanda di layar: panel **Peran kolom** di bawah tabel (satu pilihan per peran, pola "No. otomatis") + label kecil di huruf kolom. Tombol **Tebak dari judul** membaca judul kepala bertingkat ("Target Triwulan" + "II" → TW II).

### 11.2 Impor ke tabel

- Tombol **Ambil dari Renaksi / Atasan** di bagian II CUSTOM membuka modal yang SAMA dengan STANDAR. Hasilnya mengubah ISI layar lewat editor tabel (bisa diurungkan Ctrl+Z); yang menyimpan tetap tombol Simpan halaman (L78).
- **Pola baris = blok badan pertama** (baris pertama + rentang gabungan tegaknya): format & gabungan disalin, teks tidak. Menurun butuh blok 4 baris; bila polanya bukan 4 baris, kolom yang di pola menutup seluruh blok digabung 4 baris, sisanya tidak. Tanpa pola sama sekali (badan kosong), menurun menggabung semua kolom kecuali Kolom TW & Target TW — Rencana Aksi per triwulan perlu dipisah sendiri sekali, lalu Simpan sebagai templat.
- **Baris kosong di ujung badan dipakai dulu** (tabel baru berisi 3 baris kosong), sisanya disisip di atas baris JUMLAH bila gaya itu dipakai — rentang `=SUM(…)` di baris JUMLAH ikut memanjang (aturan `sisipBarisBaru`).
- Keputusan #6: baris berurutan dengan RHK yang diintervensi sama digabung di kolom peran itu **dan** kolom No. otomatis — penomoran per RHK atasan, seperti STANDAR. Hanya di antara baris hasil impor yang sama.
- Isian yang tidak punya kolom bertanda (mis. Renaksi membawa Target TW tapi tidak ada kolom TW) **disebut** di pemberitahuan, bukan dibuang diam-diam.
- Jejak sumber (`renaksi_id`, `atasan_rhk_id`) tidak disimpan per baris — tabel tidak punya identitas baris. Spanduk "atasan berubah" tetap jalan (milik kepala dokumen).

### 11.3 Atasan CUSTOM sebagai sumber kaskade

`import-atasan` membaca tabel atasan CUSTOM lewat peran: satu baris per RHK (RHK berurutan yang sama — sel tergabung — dihitung sekali), `atasan_rhk_id` kosong (tabel tak punya id baris; kolom itu memang boleh NULL). Atasan CUSTOM tanpa kolom RHK bertanda dijawab dengan kalimat yang menyebut sebabnya.

### 11.4 Pemeriksaan target

Satu fungsi pembaca baris (`itemDariTabel`) dipakai pemeriksaan DAN kaskade: mendatar = tiap baris badan; menurun = blok menurut gabungan kolom jangkar (Target tahunan → Indikator → RHK), TW dibaca dari Kolom TW (I/II/III/IV, 1–4, "TW I") atau urutan barisnya. Aturannya `validateRhkTargets` yang sama dengan STANDAR, lunak, ikut dialog Finalisasi. Cara hitung dibaca dari teks sel ("akumulatif", "progres positif", …); tanpa kolom Cara hitung, pemeriksaan tidak menebak dan layar menyebutnya.

**Tidak termasuk:** Impor Excel BPSDMD ke dokumen CUSTOM (pembacanya dikalibrasi ke 11/8 kolom).

### 11.5 Hasil eksekusi (2026-10-21)

- **Aturan** di `lib/iki/peran.ts` (MURNI): `DAFTAR_PERAN`/`bacaPeran`/`tebakPeran`, `isiDariImpor` (impor), `itemDariTabel` (SATU pembaca untuk `validasiTabelCustom` DAN `rhkAtasanDariTabel`). `TabelCustom.peran` terdaftar di `TabelCustomSchema` (`z.partialRecord`) dan dibaca `bacaTabelCustom`.
- **Mesin tabel bersama**: `BentukTabel.peran` digeser `sisipKolom`/`hapusKolom` lewat `geserPeran` (kunci itu hanya muncul bila pemakainya mengirimnya — keluaran LKJIP identik); `aturPeranKolom` + `judulBertingkat` di `lib/lkjip/tabel.ts`. `TabelEditor` dapat prop `peranKolom` (panel + label di huruf kolom; peran ikut payload, riwayat urungkan, dan laporan `onUbah`) dan pegangan `ref` → `ubahBentuk(fn)`: pengubah dari luar masuk lewat riwayat urungkan, ditolak saat hanya-baca/tertaut.
- **Layar IKI**: tombol "Ambil dari Renaksi / Atasan" di bagian II CUSTOM (mati + alasannya bila belum ada kolom isian bertanda), modal yang SAMA dengan STANDAR, peringatan target CUSTOM (layar + Finalisasi), petunjuk bila Cara hitung belum ditandai, "Tinjau Import Atasan" di spanduk atasan-berubah kini juga untuk CUSTOM.
- **Kaskade**: `getRhkAtasan` (`lib/data/iki.ts`) satu jalur untuk semua varian; route `import-atasan` memakainya dan mengirim `catatan`. Pilihan baris di modal tidak lagi berkunci id (atasan CUSTOM tak punya id baris).
- **Templat** dari tabel menurun membawa blok pertamanya (4 baris, gabungan utuh, tanpa teks) — impor berikutnya meniru polanya. Templat mendatar tetap kepala + satu baris pola.

**Uji.** `npx tsx scripts/test-iki-peran.mts` (73; bagian H MySQL kotak pasir 2090, auto-bersih), **25 uji mutasi tertangkap** (0 lolos). Suite lama hijau: IKI custom 89, beranda 74, roundtrip 22; LKJIP excel 97, word 92, bc 131, tertaut 160, angka 62, bab-wajib 57; tooltip 26; keluar 16. Tiga pemeriksaan lama yang mencocokkan teks sumber disesuaikan (`rows, atur, peran });`; regex `<TabelEditor` di suite CUSTOM kini `<TabelEditor\s` karena `useRef<TabelEditorHandle>` juga cocok). Gerbang tsc, ESLint, E, F, G, H, I, J lulus.

**Di peramban** (kotak pasir 2089, dibersihkan): tabel awal langsung bertanda, membuka dokumen tidak menyalakan "belum tersimpan"; impor Renaksi ke 3 baris kosong (2 terisi, sisanya dibuang) + pemberitahuan kolom yang tidak ada; Urungkan/Ulangi; tambah 6 kolom + judul → Tebak dari judul menandai keenamnya tepat; impor lagi → dua program sesasaran digabung di No. & RHK atasan; TW IV diubah → peringatan "Baris 3 — …"; Simpan → muat ulang utuh; kaskade dari atasan CUSTOM menurun (2 RHK); impor ke tabel menurun (blok 4 baris berlabel I–IV mengikuti pola); tema terang; 375 px tanpa geser mendatar; konsol bersih. **Belum dicoba di layar:** bawahan STANDAR mengambil dari atasan CUSTOM (jalurnya sama dan teruji di MySQL, H2/H4).

## 12. Bentuk awal "Seperti STANDAR / DIREKTUR" (2026-10-21)

**Arahan pemilik:** hasil akhir CUSTOM harus sama dengan form 11 kolom (STANDAR) dan 8 kolom (DIREKTUR) — saat diisi sudah bisa mengambil dari atasan, Renaksi, dsb. — dengan kebebasan menambah kolom.

- **Buat IKI → Custom → "Bentuk tabel awal"**: *Seperti STANDAR (11 kolom)* (pilihan awal), *Seperti DIREKTUR (8 kolom)*, *Tabel kosong (4 kolom)*, atau templat tersimpan (templat menang bila keduanya terkirim). Server: `CreateDokumenSchema.bentuk_awal` → `tabelSeperti()` di `lib/iki/custom.ts`.
- `tabelSeperti` = kepala 3 baris **persis** `buildIkiGrid` (teks, gabungan, baris penomoran 1–11 / 1–8), lebar kolom sebanding `pdfWidths`, satu blok pola 4 baris berlabel I–IV, kolom No. otomatis, dan peran kolom sudah bertanda. Kepala `buildIkiGrid` berubah → bentuk ini WAJIB ikut (uji I1 menangkapnya).
- **Peran baru**: *Aspek (a/b/c)* — diisi `a. Kuantitatif / b. {cara hitung} / c. Utama` (bawaan `emptyRhk`, tulisan `aspekText`); *Rencana Aksi (uraian)* & *Target Aksi* — per baris TW, tidak pernah digabung (menutup lubang §11.2: badan kosong dulu ikut menggabung Rencana Aksi). Tanpa kolom Cara hitung, cara hitung dibaca dari baris "b." kolom Aspek (DIREKTUR), untuk pemeriksaan target maupun kaskade.
- **Kesamaan isi**: satu kelompok RHK atasan → No. & RHK atasan digabung, dan RHK yang teksnya sama semua ikut digabung (`mergeRhk` STANDAR). Target Aksi sengaja dibiarkan kosong (STANDAR menulis "0" karena kolom DB-nya wajib berisi).
- **Ditemukan saat diuji, ikut dibereskan**: (a) blok badan pertama yang berupa kelompok tergabung 8 baris dulu terbaca sebagai pola setinggi 8 → butir impor berikutnya kehilangan gabungan 4 baris di kolom per-RHK; patokan kini "menutup setinggi satu butir". (b) Templat dari tabel menurun membawa satu butir (4 baris), bukan seluruh kelompok; tabel mendatar kembali ke satu baris pola. (c) Baris penomoran kepala ("1 2 3 …", wajib berurutan, tidak tertutup gabungan dari atas) tidak ikut jadi judul tebakan. (d) Label I–IV di Kolom TW bukan isi: blok berlabel tetap "kosong" untuk impor dan belum boleh dicetak. (e) Pemberitahuan impor DIREKTUR dulu menyebut "Cara hitung tak punya kolom" padahal tercatat di Aspek.

**Uji.** `test-iki-peran.mts` bagian I: kepala & isi cetak CUSTOM dibandingkan SEL PER SEL dengan `buildIkiGrid` (teks, gabungan, rata) untuk STANDAR & DIREKTUR, lalu berkas **Excel** dokumen CUSTOM "Seperti STANDAR" dibandingkan dengan Excel dokumen STANDAR berisi sama — identik isi & gabungannya. Di peramban (kotak pasir 2089, dibersihkan): Buat IKI Custom "Seperti STANDAR" → Ambil dari Renaksi (kelompok sesasaran digabung 8 baris, aspek & cara hitung terisi) → Simpan; dokumen **STANDAR** bawahan ditautkan ke atasan CUSTOM itu → Ambil dari IKI Atasan → 2 grup RHK → Simpan diterima (`atasan_rhk_id` kosong); "Seperti DIREKTUR" → Ambil dari Renaksi. ### 12.1 PDF dibandingkan (2026-10-21)

PDF dihasilkan pengekspor sungguhan untuk dokumen bawaan dan CUSTOM "Seperti …" berisi sama, lalu dibandingkan lewat pdfjs (posisi & ukuran tiap teks) dan piksel (dirender @napi-rs/canvas). Tiga beda ditemukan:
- **Kepala tabel CUSTOM 7 pt, STANDAR 7,5 pt** (`headStyles.fontSize`) → seluruh badan & tanda tangan bergeser 1,73 pt. Kini kepala CUSTOM 7,5 pt (`FONT_KEPALA_PDF`) — berlaku untuk SEMUA tabel CUSTOM, bukan cuma bentuk "Seperti …".
- **Tanda tangan "Seperti DIREKTUR" beda**: varian DIREKTUR memakai satu blok "Mengetahui, tanggal / jabatan / OPD", CUSTOM memakai aturan §9.2. Kini `TabelCustom.ttd` ('BIASA' | 'DIREKTUR', terdaftar di skema, ikut templat): `tabelSeperti('DIREKTUR')` bertanda DIREKTUR → `buildTtd` memakai blok DIREKTUR (PDF & Excel), editor menyembunyikan isian atasan; bisa diganti lewat pilihan "Tanda tangan" di bagian II. `ubahTabel` WAJIB mempertahankan `ttd` (payload editor tabel tidak membawanya — sama seperti `kertas`).
- **Batas kolom bergeser ≤ 0,6 pt (± 0,2 mm)** pada STANDAR: lebar editor disimpan dalam px bulat, `pdfWidths` dalam mm. Sengaja DIBIARKAN — menyamakannya persis butuh px = mm × 3 (tabel editor menyempit ke 843 px dari 1.062), sedangkan beda 0,2 mm tak terlihat (terbukti di gambar beda).

Hasil sesudah perbaikan: DIREKTUR 90/90 teks identik (±0,3 pt); STANDAR 107/107 teks sama baris & ukuran, beda mendatar ≤ 0,6 pt. Excel SELURUH lembar (judul, Data Pribadi, tabel, tanda tangan — isi, gabungan, huruf, rata, abu, kertas) identik untuk kedua bentuk. **Lebar kolom Excel tidak sama**: STANDAR punya dua set lebar (`pdfWidths` untuk PDF, `xlsxWidths` untuk Excel), CUSTOM satu (dari editor, dipakai keduanya) — kolom Excel CUSTOM ± ¾ selebar STANDAR di layar; cetaknya tetap selebar kertas (fitToWidth). Diuji I10 (Excel), I12 (PDF), I13 (tanda tangan) di `test-iki-peran.mts`.
