# Konsep — Salin Dokumen PK FINAL jadi DRAFT baru

## Masalah

Dokumen Perjanjian Kinerja yang sudah difinalisasi terkunci: `PATCH` menolak dengan 409 dan
layar Form mematikan tombol Simpan (`isFinal`). Penguncian itu benar — FINAL berarti dokumen
sudah ditandatangani dan berkas Word-nya sudah dibuat dari isi yang persis sama.

Yang salah adalah jalan keluarnya. Pesan 409 dulu menyuruh "hubungi SUPER_ADMIN untuk unlock",
padahal **tidak ada endpoint unlock sama sekali**. Praktiknya orang menghapus dokumen FINAL
lalu mengetik ulang seluruh isinya — atau menyerah.

## Keputusan

Jangan buka kunci dokumen FINAL. Sediakan **salinan**:

> "Salin jadi DRAFT baru": semua isi dokumen FINAL disalin ke dokumen baru yang bisa disunting.
> Dokumen lama tetap utuh sebagai arsip.

Alasan:

- Arsip FINAL tidak boleh berubah — kalau isinya disunting di tempat, berkas Word yang sudah
  diunduh orang tidak lagi cocok dengan dokumen yang tersimpan.
- Menyunting salinan tidak butuh mekanisme izin baru. Yang menyunting hanyalah dokumen DRAFT
  biasa, dan seluruh pagar DRAFT (versi, finalisasi, audit) tetap berlaku apa adanya.
- Kalau salinan disalahkan, arsip lama masih ada untuk dibandingkan.

## Rancangan

**Data (`lib/data/pk.ts` → `salinJadiDraft(id, userId)`)**

Satu transaksi, tiga `INSERT … SELECT`:

| Tabel | Yang disalin | Yang TIDAK disalin |
|---|---|---|
| `pk_dokumen` | tahun, tanggal, jenis, seluruh kolom pihak pertama & kedua | `status` → `'DRAFT'`, `version` → `0`, `created_by` → penyunting, `generated_*` → NULL |
| `pk_dokumen_lampiran` | semua kolom isi + `urutan` | — |
| `pk_dokumen_anggaran` | semua kolom isi + `urutan` + `auto_filled_from_blud` | — |

`INSERT … SELECT` (bukan baca-ke-aplikasi-lalu-tulis) dipilih supaya daftar kolom yang disalin
tinggal di satu tempat dan tidak ada jendela antara baca dan tulis.

Baris sumber dibaca `FOR UPDATE` dan diperiksa statusnya: hanya `FINAL` yang bisa disalin
(`PkHanyaFinalDisalinError`); id yang tidak ada → `PkDokumenTidakAdaError`. Dokumen sumber tidak
pernah ditulis — tidak ada satu pun `UPDATE`/`DELETE` terhadapnya.

**Endpoint (`POST /api/perjanjian-kinerja/dokumen/[id]/salin-draft`)**

Urutan penjaga sama dengan endpoint tulis PK lainnya: sesi → sakelar modul (`pkMati`) → izin
tulis menu **Form** (`bolehEditMenu`, karena salinan lahir sebagai dokumen Form) → rate limit
`pk-salin-draft:<user>` 10/menit → kepemilikan (non-admin hanya dokumennya sendiri) → salin →
audit `PK_DOKUMEN_SALIN_DRAFT`.

Pembagian tugasnya sengaja tidak diulang: rute hanya membaca `created_by` (untuk kepemilikan),
sedangkan syarat **FINAL** diperiksa di `lib/data/pk.ts` di dalam transaksi — satu tempat, dan
tidak ada dua pemeriksaan status yang bisa berbeda jawaban.

**Layar**

- `perjanjian-kinerja/riwayat`: tombol ikon **Salin** (amber) hanya pada baris `FINAL`, dengan
  dialog konfirmasi yang menyebut dokumen lama tetap arsip. Sesudah berhasil, pengguna langsung
  dibawa ke Form dokumen DRAFT baru.
- `perjanjian-kinerja/form`: saat dokumen yang dibuka berstatus FINAL, tombol
  **"Salin jadi DRAFT"** muncul di samping "Unduh Word".

Kalimat konfirmasi dan panggilan endpoint-nya tinggal di satu berkas,
`_utils/salin-draft.ts`, dipakai kedua layar — dua salinan kalimat yang sama cepat atau lambat
berbeda bunyi, dan pengguna melihat keduanya di modul yang sama.

## Batas

- Jenis PK salinan sama dengan aslinya (MURNI tetap MURNI, PERUBAHAN tetap PERUBAHAN). Kalau
  perlu jadi PERUBAHAN, ubah jenisnya di Form salinan — itu isian biasa.
- Tanggal dokumen salinan = tanggal dokumen asli; ubah di Form bila perlu.
- Salinan tidak membawa berkas Word. Word dibuat ulang saat salinan difinalisasi.
- Menyalin dokumen DRAFT ditolak (409 `BUKAN_FINAL`): dokumen DRAFT memang sudah bisa disunting.

## Uji

`npx tsx --env-file=.env.local scripts/test-pk-salin-draft.mts` — 11 pemeriksaan sumber +
17 pemeriksaan DB (tahun 2099, awalan unit `UJI SALIN`, dibersihkan lagi): salinan DRAFT versi 0
tanpa berkas, header/lampiran/anggaran tersalin persis, dokumen FINAL sumber tidak bergerak,
salinan bisa disimpan, dan penolakan untuk DRAFT / id tak dikenal.
