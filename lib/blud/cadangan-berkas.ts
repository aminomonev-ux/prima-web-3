// lib/blud/cadangan-berkas.ts — bentuk berkas cadangan JSON BLUD.
// Konsep: docs/CONCEPT-blud-cadangan-json.md
//
// SENGAJA bebas dependensi server: tidak mengimpor mysql2, googleapis, maupun
// `db.ts`. Berkas ini dipakai DUA arah — jalur unggah di server (Tahap 1) dan
// tombol "Muat dari berkas" di komponen `'use client'` (Tahap 3). Menaruhnya di
// `cadangan-json.ts` yang menyentuh DB akan merobohkan seluruh rute dashboard,
// pelajaran yang sama dengan `riwayat-konstanta.ts`.

import { z } from 'zod'
import { BLUD_SIMPAN_MAKS_BARIS } from './import-dpa-shared'

/**
 * Nomor bentuk berkas. Dinaikkan HANYA kalau susunannya berubah sampai berkas
 * lama tidak bisa dibaca lagi — pembacanya menolak nomor yang tidak dikenal,
 * jadi menaikkannya sembarangan membuat cadangan lama jadi sampah.
 */
export const CADANGAN_FORMAT = 1

export type JenisCadangan = 'DPA' | 'PERGESERAN'

/**
 * Isi satu berkas. Kepalanya SENGAJA lebih lengkap daripada kolom `isi` di
 * database, yang cuma menyimpan lariknya. Tanpa kepala, berkas yang sudah
 * berpindah tangan tidak bisa menjawab "ini punya tahun berapa, versi mana" —
 * dan justru pertanyaan itu yang menjaga baris 2026 tidak masuk ke 2027.
 */
export interface BerkasCadangan {
  format:            number
  jenis:             JenisCadangan
  tahun_anggaran:    number
  versi_tanggal:     string
  versi_ke:          number
  disimpan_pada:     string
  jumlah_baris:      number
  total_nilai:       number
  dpa_versi_tanggal: string | null
  disimpan_oleh:     string | null
  rows:              Record<string, unknown>[]
}

/**
 * Baris divalidasi seadanya, dan itu disengaja. Bentuk penuhnya sudah dijaga Zod
 * di jalur Simpan yang akan menuliskannya; di sini yang dibutuhkan cuma cukup
 * supaya tabel di layar tidak meledak — `row_id` menyangga hierarki dan seluruh
 * penanganan baris. Sisanya dilewatkan apa adanya supaya kolom baru di kemudian
 * hari tidak membuat cadangan lama ditolak.
 */
const BarisSchema = z.object({ row_id: z.string().min(1).max(64) }).passthrough()

const TanggalSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const BerkasCadanganSchema = z.object({
  format:            z.number().int(),
  jenis:             z.enum(['DPA', 'PERGESERAN']),
  tahun_anggaran:    z.number().int().min(2000).max(2200),
  versi_tanggal:     TanggalSchema,
  versi_ke:          z.number().int().min(0),
  disimpan_pada:     z.string().min(1).max(32),
  jumlah_baris:      z.number().int().min(0),
  total_nilai:       z.number(),
  dpa_versi_tanggal: TanggalSchema.nullable(),
  disimpan_oleh:     z.string().max(191).nullable(),
  rows:              z.array(BarisSchema).min(1).max(BLUD_SIMPAN_MAKS_BARIS),
})

/**
 * Nama berkas membawa identitas lengkap. Bukan kerapian: setahun kemudian folder
 * Drive berisi ratusan berkas, dan yang membedakannya cuma nama — kalau tanggal
 * versi atau simpan ke-berapa tidak ikut, tidak ada cara tahu berkas mana milik
 * apa tanpa membuka satu per satu.
 *
 * Hanya huruf kecil, angka, dan tanda hubung. Titik dua pada jam dibuang: ia sah
 * di Drive tapi tidak di Windows, dan berkas ini memang untuk diunduh.
 */
export function namaBerkasCadangan(a: {
  jenis: JenisCadangan; tahun_anggaran: number; versi_tanggal: string
  versi_ke: number; disimpan_pada: string
}): string {
  const stempel = a.disimpan_pada.replace(/[^0-9]/g, '').slice(0, 14)
  return `blud-${a.jenis.toLowerCase()}-${a.tahun_anggaran}-${a.versi_tanggal}`
    + `-ke${a.versi_ke}-${stempel}.json`
}

export type HasilBaca =
  | { ok: true;  data: BerkasCadangan }
  | { ok: false; error: string }

/**
 * Pembaca berkas dari LUAR — teks apa pun, termasuk berkas yang salah, rusak,
 * atau memang bukan cadangan. Karena itu ia memulangkan pesan, bukan melempar:
 * pemanggilnya layar, dan orang di depannya butuh tahu kenapa ditolak.
 *
 * `harus` mengunci sasaran: berkas tahun lain DITOLAK, bukan diterima lalu
 * dibiarkan Simpan yang menolak. Baris membawa `anggaran_key` — jangkar realisasi
 * yang terikat tahunnya — jadi memuat cadangan 2026 ke layar 2027 berarti
 * memasang jangkar tahun lain, dan itu tidak selalu tertangkap di jalur simpan.
 */
export function bacaBerkasCadangan(
  teks: string,
  harus: { jenis: JenisCadangan; tahun: number },
): HasilBaca {
  let mentah: unknown
  try {
    mentah = JSON.parse(teks)
  } catch {
    return { ok: false, error: 'Berkasnya bukan JSON yang sah — mungkin salah pilih berkas.' }
  }

  const parsed = BerkasCadanganSchema.safeParse(mentah)
  if (!parsed.success) {
    return { ok: false, error: 'Isi berkasnya tidak dikenali sebagai cadangan BLUD.' }
  }
  const d = parsed.data

  if (d.format !== CADANGAN_FORMAT) {
    return {
      ok: false,
      error: `Berkas ini bentuk versi ${d.format}, sedangkan aplikasi mengenal versi `
        + `${CADANGAN_FORMAT}. Pakai cadangan yang lebih baru.`,
    }
  }
  if (d.jenis !== harus.jenis) {
    const nama = { DPA: 'DPA', PERGESERAN: 'Pergeseran' }
    return {
      ok: false,
      error: `Ini cadangan ${nama[d.jenis]}, sedangkan Anda sedang di layar ${nama[harus.jenis]}.`,
    }
  }
  if (d.tahun_anggaran !== harus.tahun) {
    return {
      ok: false,
      error: `Cadangan ini milik tahun anggaran ${d.tahun_anggaran}, sedangkan layar ini `
        + `tahun ${harus.tahun}. Ganti tahunnya dulu, atau pilih berkas yang sesuai.`,
    }
  }

  return { ok: true, data: { ...d, rows: d.rows as Record<string, unknown>[] } }
}
