# CONCEPT — IKI varian CUSTOM (tabel bebas ala LKJIP)

> Status: **konsep, belum dieksekusi** (2026-10-20). Keputusan bertanda **[USULAN]** menunggu jawaban pemilik.
> Terkait: `docs/CONCEPT-iki.md` (varian STANDAR/DIREKTUR), `docs/CONCEPT-lkjip-tabel-excel.md` (mesin tabel yang dipakai ulang).

## 1. Masalah

Bentuk tabel IKI tertanam di kode: STANDAR 11 kolom, DIREKTUR 8 kolom (`lib/iki/layout.ts`), isinya di kolom DB tetap (`iki_rhk.rhk`, `aspek_a/b/c`, `indikator`, … `iki_rhk_triwulan.target_tw/uraian/target_aksi`). Format dari BPSDMD bisa berubah (mis. tambah kolom ke-12), dan sekarang menyesuaikannya berarti mengubah kode, skema, PDF, Excel, editor, dan pembaca impor sekaligus.

Yang diminta: varian **ketiga** yang tabelnya dirancang sendiri di web — kolom, baris, gabungan sel — seperti tabel LKJIP, lalu dipakai untuk dokumen. **STANDAR & DIREKTUR tidak disentuh.**

## 2. Bentuk dokumen CUSTOM

| Bagian | Asal isi | Bisa diubah bentuknya? |
|---|---|---|
| Judul (`docTitle`, + " PERUBAHAN") | bawaan | tidak |
| I. Data Pribadi (OPD, Nama, NIP, Jabatan, Ikhtisar) | kolom `iki_dokumen` | tidak **[USULAN]** |
| **II. Tabel** | **tabel bebas** | **ya — seluruhnya** |
| Blok tanda tangan (`buildTtd`) | kolom `iki_dokumen` | tidak **[USULAN]** |

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
- Hak mengelola templat: **SA/Admin** **[USULAN]** — templat dipakai semua orang, mengubahnya mengubah titik awal semua dokumen baru. Memakai templat: semua pemegang akses IKI.

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
- Lebar kolom disusutkan ke lebar bidang tulis A4 mendatar (± 281 mm) — pola `lebarKolomWord` LKJIP. Kertas F4/Legal **[USULAN: belum, cukup A4]**.
- Format sel (tebal, miring, rata, teks tegak, warna kepala) ikut ke keduanya; sel kepala diulang di tiap halaman PDF.
- Unduh Zip, Riwayat Versi (`iki_versi.snapshot` ikut membawa `tabel_custom`), dan Duplikat ke tahun lain ikut menangani varian ini.

## 7. Yang sengaja TIDAK berlaku di CUSTOM (tahap 1–2)

Fitur ini butuh tahu kolom mana berisi RHK/target, dan tabel bebas tidak menyatakannya:
- Impor dari Rencana Aksi · Impor RHK atasan (kaskade per RHK) · Impor Excel BPSDMD (`lib/iki/import-excel.ts` dikalibrasi ke 11/8 kolom) · peringatan target TW vs tahunan (`lib/iki/validate.ts`).
- Tombol-tombol itu **disembunyikan** di dokumen CUSTOM, bukan dimatikan tanpa sebab.
- Tautan dokumen atasan (`atasan_dokumen_id`) **tetap** — itu milik header dokumen, bukan tabel.

Tahap 3 (opsional): **peran kolom** — tandai kolom sebagai RHK / Indikator / Target Tahunan / Target TW I–IV, lalu impor & validasi mengisi kolom bertanda.

## 8. Tahapan

| Tahap | Isi | Catatan |
|---|---|---|
| 0 | Pindahkan editor tabel LKJIP ke komponen bersama, tanpa perubahan perilaku | suite LKJIP hijau = syarat lulus |
| 1 | Varian CUSTOM: buat, sunting tabel, simpan (CAS `version`), PDF, Excel, Zip, versi, duplikat | migrasi `migration-iki-custom.sql` |
| 2 | Templat: simpan dari dokumen, pakai saat Buat IKI, kelola (ganti nama/hapus) | |
| 3 | Peran kolom → impor Renaksi/atasan & validasi untuk CUSTOM | opsional |

## 9. Keputusan yang ditunggu

1. Data Pribadi & tanda tangan tetap bawaan? **[USULAN: ya]**
2. Pengelola templat: SA/Admin saja, atau semua pemegang akses IKI? **[USULAN: SA/Admin]**
3. Kertas: A4 mendatar saja, atau perlu F4/Legal? **[USULAN: A4 dulu]**
