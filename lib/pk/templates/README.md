# PK Template Setup

Template Word `.docx` untuk generator dokumen Perjanjian Kinerja. **Wajib diisi** sebelum
endpoint `/api/perjanjian-kinerja/dokumen/[id]/finalize` bisa dipakai.

## File yang dibutuhkan (2)

| File | Untuk |
|---|---|
| `pk-rsjd-amino-murni.docx` | `jenis_pk = 'MURNI'` |
| `pk-rsjd-amino-perubahan.docx` | `jenis_pk = 'PERUBAHAN'` |

## Setup (admin / dev)

1. Copy file `.docx` asli RSJD (`PK RSJD Dr.AMINO.docx` dan `PK PERUBAHAN RSJD Dr.AMINO.docx`) ke folder ini, rename sesuai tabel di atas
2. Buka di Microsoft Word — edit teks placeholder ke syntax `docxtemplater` (lihat tabel di bawah)
3. Save & close — pastikan format `.docx` (bukan `.doc` lama)
4. Test render via endpoint finalize

## Placeholder syntax docxtemplater

### Scalar placeholder

| Di template Word, ganti teks ini | Jadi |
|---|---|
| `[NAMA BAWAHAN]` | `{nama_pertama}` |
| `[JABATAN BAWAHAN]` | `{jabatan_pertama}` |
| `[NIP BAWAHAN]` | `{nip_pertama}` |
| `[PANGKAT BAWAHAN]` | `{pangkat_pertama}` |
| `[UNIT BAWAHAN]` | `{unit_pertama}` |
| `[NAMA ATASAN]` | `{nama_kedua}` |
| `[JABATAN ATASAN]` | `{jabatan_kedua}` |
| `[NIP ATASAN]` | `{nip_kedua}` |
| `[PANGKAT ATASAN]` | `{pangkat_kedua}` |
| `[UNIT ATASAN]` | `{unit_kedua}` |
| `[TAHUN]` | `{tahun}` |
| `[TANGGAL]` | `{tanggal_dokumen}` (format ID: `23 Mei 2026`) |
| `[JENIS PK]` | `{jenis_pk}` (`MURNI` atau `PERUBAHAN`) |
| `[TOTAL ANGGARAN]` | `{total_anggaran_fmt}` (format `Rp 1.234.567`) |

### Lampiran Sasaran (tabel loop)

Tabel sasaran kinerja — wrap baris loop dengan `{#lampiran_sasaran}` ... `{/lampiran_sasaran}`:

```
| No | Sasaran     | Indikator     | Target     |
|----|-------------|---------------|------------|
| {#lampiran_sasaran}{no} | {uraian} | {indikator} | {target} {/lampiran_sasaran} |
```

Di MS Word: select 1 row tabel yang ingin di-loop, edit jadi `{#lampiran_sasaran}` di kolom pertama dan `{/lampiran_sasaran}` di kolom terakhir. Field di dalam: `{no}`, `{uraian}`, `{indikator}`, `{target}` (plus `{program}`, `{kegiatan}`, `{subkegiatan}` kalau perlu).

### Lampiran Anggaran (tabel loop)

```
| No | Program/Kegiatan/Sub | Sumber | Nominal |
|----|----------------------|--------|---------|
| {#lampiran_anggaran}{no} | {uraian} | {keterangan_sumber} | {nominal_fmt} {/lampiran_anggaran} |
```

Field: `{no}`, `{uraian}`, `{keterangan_sumber}`, `{nominal_fmt}` (sudah pre-format `Rp 1.234.567` atau `-` kalau 0).

## Verify setelah edit

1. Apply migration 029 (sudah)
2. Bikin dummy dokumen PK via POST /api/perjanjian-kinerja/dokumen
3. POST /api/perjanjian-kinerja/dokumen/{id}/finalize
4. GET /api/perjanjian-kinerja/dokumen/{id}/download → buka file Word, cek render OK

## Troubleshooting

- **Error "Template not found"** → file `.docx` belum di-copy ke folder ini
- **Error render syntax** → placeholder pakai kurung kurawal salah, atau loop tidak ter-closed (`{#x}` tanpa `{/x}`)
- **Render kosong field** → nama placeholder typo (case-sensitive) atau field di data null

## Reference

- docxtemplater docs: https://docxtemplater.com/docs/get-started-node/
- PRIMA: `docs/session/PK_REFACTOR_CONCEPT.md` §8
