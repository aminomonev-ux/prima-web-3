// lib/blud/cadangan-json.ts — unggah foto per-simpan BLUD ke Google Drive.
// Konsep: docs/CONCEPT-blud-cadangan-json.md §4 Tahap 1
//
// Dipanggil DUA pemicu — cron dan tombol di layar Pengaturan — dan itu sebabnya
// seluruh logikanya di sini, bukan di salah satu route. Dua salinan aturan yang
// sama adalah cara L78 lahir.
//
// Yang diunggah bukan hasil ekspor baru, melainkan snapshot yang SUDAH tersimpan
// di `blud_riwayat_simpan`. Menempelkan unggahan ke tombol Simpan berarti satu
// panggilan ke Google yang lambat menahan kunci setahun (`BLUD_VERSI_ENTITY`,
// L84) dan semua orang lain ikut antre.

import { sql, sqlInt } from '@/lib/data/db'
import { uploadBufferToDrive } from '@/lib/services/drive'
import { toDateStr, waktuSekarangWIB } from './tanggal'
import {
  CADANGAN_FORMAT, namaBerkasCadangan,
  type BerkasCadangan, type JenisCadangan,
} from './cadangan-berkas'

/**
 * Berapa berkas per satu kali jalan. Bukan angka keramat — penjaganya waktu:
 * satu foto DPA 558 baris ±300 KB, dan tombol di layar menunggu unggahan selesai.
 * Sisa yang belum terangkut dilaporkan supaya orangnya tahu harus menekan lagi,
 * bukan mengira sudah beres.
 */
export const CADANGAN_BATAS_DEFAULT = 20

export interface StatusCadangan {
  /** Folder Drive-nya sudah dikonfigurasi atau belum. */
  aktif:    boolean
  sudah:    number
  belum:    number
  /** Waktu simpan foto terakhir yang berhasil naik — bukan waktu unggahnya. */
  terakhir: string | null
}

export interface HasilCadangan extends StatusCadangan {
  diunggah: number
  gagal:    number
  /** Kosong kalau semuanya lancar; diisi alasan pertama supaya bisa ditampilkan. */
  pesan:    string | null
}

function folderId(): string {
  return process.env.GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON?.trim() ?? ''
}

/**
 * DATETIME dari mysql2 (pool `timezone: '+07:00'`) datang sebagai Date. Diformat
 * balik lewat offset yang sama — `toISOString()` polos menggesernya 7 jam.
 * Sama persis dengan `normWaktu` di `riwayat-simpan.ts`.
 */
function normWaktu(v: unknown): string {
  if (v instanceof Date) return waktuSekarangWIB(v.getTime())
  return String(v ?? '').slice(0, 19).replace('T', ' ')
}

export async function statusCadanganJson(): Promise<StatusCadangan> {
  const rows = await sql`
    SELECT COUNT(*)                                        AS total,
           SUM(CASE WHEN drive_file_id IS NULL THEN 1 ELSE 0 END) AS belum,
           MAX(CASE WHEN drive_file_id IS NOT NULL THEN disimpan_pada END) AS terakhir
      FROM blud_riwayat_simpan
  ` as Record<string, unknown>[]
  const r = rows[0] ?? {}
  const total = Number(r.total ?? 0)
  const belum = Number(r.belum ?? 0)
  return {
    aktif:    !!folderId(),
    sudah:    total - belum,
    belum,
    terakhir: r.terakhir ? normWaktu(r.terakhir) : null,
  }
}

interface BarisMentah extends Record<string, unknown> { id: unknown }

/** Foto yang belum pernah naik — TERTUA dulu, supaya tunggakan terkuras urut. */
async function ambilBelumTercadang(batas: number): Promise<BarisMentah[]> {
  return await sql`
    SELECT r.id, r.jenis, r.tahun_anggaran, r.versi_tanggal, r.disimpan_pada,
           r.versi_ke, r.jumlah_baris, r.total_nilai, r.dpa_versi_tanggal, r.isi,
           COALESCE(u.nama_lengkap, u.username) AS oleh
      FROM blud_riwayat_simpan r
      LEFT JOIN users u ON u.id = r.disimpan_oleh
     WHERE r.drive_file_id IS NULL
     ORDER BY r.id ASC
     LIMIT ${sqlInt(batas)}
  ` as BarisMentah[]
}

/** Susun isi berkas dari satu baris database. */
function berkasDari(r: BarisMentah): BerkasCadangan {
  // Kolom JSON dipulangkan mysql2 sudah ter-parse; string hanya muncul kalau
  // driver/versinya berbeda. Dua-duanya diterima supaya tidak pecah diam-diam.
  const isi = typeof r.isi === 'string' ? JSON.parse(r.isi as string) : r.isi
  return {
    format:            CADANGAN_FORMAT,
    jenis:             String(r.jenis) as JenisCadangan,
    tahun_anggaran:    Number(r.tahun_anggaran),
    versi_tanggal:     toDateStr(r.versi_tanggal),
    versi_ke:          Number(r.versi_ke),
    disimpan_pada:     normWaktu(r.disimpan_pada),
    jumlah_baris:      Number(r.jumlah_baris ?? 0),
    total_nilai:       Number(r.total_nilai ?? 0),
    dpa_versi_tanggal: r.dpa_versi_tanggal ? toDateStr(r.dpa_versi_tanggal) : null,
    disimpan_oleh:     r.oleh ? String(r.oleh) : null,
    rows:              Array.isArray(isi) ? isi : [],
  }
}

/**
 * Unggah tunggakan foto ke Drive.
 *
 * Kegagalan per berkas DICATAT, tidak dilempar: satu unggahan yang gagal — kuota
 * habis, token kedaluwarsa, jaringan putus — tidak boleh membatalkan sisanya, dan
 * yang gagal tetap `drive_file_id IS NULL` sehingga terangkut putaran berikutnya.
 *
 * Penandanya ditulis SESUDAH unggahan berhasil. Terbalik urutannya berarti
 * kegagalan menghasilkan foto yang mengaku sudah dicadangkan padahal tidak ada
 * apa-apa di Drive — bentuk kerusakan yang paling sulit disadari.
 */
export async function cadangkanJsonBlud(
  opts: { batas?: number } = {},
): Promise<HasilCadangan> {
  const folder = folderId()
  if (!folder) {
    const status = await statusCadanganJson()
    return {
      ...status, diunggah: 0, gagal: 0,
      pesan: 'Folder Drive untuk cadangan JSON belum dikonfigurasi (GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON).',
    }
  }

  const batas = Math.max(1, Math.min(200, opts.batas ?? CADANGAN_BATAS_DEFAULT))
  const antre = await ambilBelumTercadang(batas)

  let diunggah = 0
  let gagal = 0
  let pesan: string | null = null

  for (const r of antre) {
    const id = Number(r.id)
    try {
      const berkas = berkasDari(r)
      const { fileId } = await uploadBufferToDrive({
        buffer:   Buffer.from(JSON.stringify(berkas), 'utf8'),
        name:     namaBerkasCadangan(berkas),
        mimeType: 'application/json',
        folderId: folder,
      })
      if (!fileId) throw new Error('Drive tidak mengembalikan id berkas.')
      await sql`UPDATE blud_riwayat_simpan SET drive_file_id = ${fileId} WHERE id = ${id}`
      diunggah++
    } catch (e) {
      gagal++
      if (!pesan) pesan = e instanceof Error ? e.message : String(e)
      console.error(`[blud/cadangan-json] gagal mengunggah riwayat #${id}:`, e)
    }
  }

  const status = await statusCadanganJson()
  return { ...status, diunggah, gagal, pesan }
}
