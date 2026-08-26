// lib/blud/riwayat-simpan.ts — riwayat tiap klik Simpan DPA/Pergeseran.
//
// Simpan itu hapus-lalu-tulis-ulang untuk (tahun_anggaran, versi_tanggal) yang
// sama, jadi simpanan jam 16:40 menghapus hasil jam 09:15 tanpa sisa. Berkas ini
// menyimpan snapshotnya supaya keduanya tetap ada.
//
// Baris di sini SENGAJA tidak dirujuk siapa pun — ia catatan, bukan entitas.
// Pergeseran, Rekap PJ, dan BBA tetap menunjuk `versi_tanggal`. Begitu snapshot
// bisa dirujuk, semua alasan di CONCEPT §2 kembali berlaku.
//
// Konsep: docs/CONCEPT-blud-riwayat-simpan.md

import { sql, sqlInt } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import { waktuSekarangWIB, toDateStr } from './tanggal'

export type JenisRiwayat = 'DPA' | 'PERGESERAN'

/**
 * Berapa snapshot yang disimpan per (jenis, tahun).
 *
 * LKJIP/IKI pakai 20, tapi DPA disimpan jauh lebih sering — 20 bisa habis dalam
 * satu sore sibuk dan menelan riwayat sebulan. Angka ini knob, bukan prinsip.
 */
export const RIWAYAT_RETENSI = 50

/** Baris daftar — TANPA `isi`, supaya membuka dropdown tidak menyeret puluhan MB. */
export interface RiwayatSimpanItem {
  id:                 number
  jenis:              JenisRiwayat
  tahun_anggaran:     number
  versi_tanggal:      string
  disimpan_pada:      string   // 'YYYY-MM-DD HH:MM:SS' WIB
  versi_ke:           number
  jumlah_baris:       number
  total_nilai:        number
  dpa_versi_tanggal:  string | null
  disimpan_oleh_nama: string | null
}

export interface RiwayatSimpanIsi extends RiwayatSimpanItem {
  isi: unknown[]
}

interface CatatArgs {
  jenis:            JenisRiwayat
  tahun:            number
  versiTanggal:     string
  versiKe:          number
  baris:            unknown[]
  totalNilai:       number
  dpaVersiTanggal?: string | null
  userId:           number
}

/**
 * Catat satu snapshot + pangkas yang lewat retensi.
 *
 * WAJIB dipanggil DENGAN `tx`, dari dalam `withTransaction` milik Simpan, tepat
 * sesudah `bumpBludVersion` — `versiKe` adalah angka kunci SESUDAH bump, dan
 * simpanan yang ditolak (409, pagar pagu, ambang drop) harus ikut rollback
 * supaya tidak meninggalkan snapshot untuk simpanan yang tidak pernah terjadi.
 *
 * Sengaja BUKAN best-effort seperti arsip Drive-nya LKJIP: ini INSERT lokal,
 * bukan panggilan jaringan. Kalau ia gagal, ada yang salah sungguhan dan Simpan
 * memang layak ikut batal.
 */
export async function catatRiwayatSimpan(tx: TxSql, a: CatatArgs): Promise<void> {
  await tx`
    INSERT INTO blud_riwayat_simpan
      (jenis, tahun_anggaran, versi_tanggal, disimpan_pada, versi_ke,
       jumlah_baris, total_nilai, dpa_versi_tanggal, isi, disimpan_oleh)
    VALUES
      (${a.jenis}, ${a.tahun}, ${a.versiTanggal}, ${waktuSekarangWIB()}, ${a.versiKe},
       ${a.baris.length}, ${a.totalNilai}, ${a.dpaVersiTanggal ?? null},
       ${JSON.stringify(a.baris)}, ${a.userId})
  `
  // MySQL menolak subquery ke tabel yang sedang di-DELETE — derived table `t`
  // memaksanya membuat hasil antara lebih dulu, dan itu justru yang dibutuhkan.
  await tx`
    DELETE FROM blud_riwayat_simpan
     WHERE jenis = ${a.jenis} AND tahun_anggaran = ${a.tahun}
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM blud_riwayat_simpan
            WHERE jenis = ${a.jenis} AND tahun_anggaran = ${a.tahun}
            ORDER BY id DESC LIMIT ${sqlInt(RIWAYAT_RETENSI)}
         ) t
       )
  `
}

function normItem(r: Record<string, unknown>): RiwayatSimpanItem {
  return {
    id:                 Number(r.id),
    jenis:              String(r.jenis) as JenisRiwayat,
    tahun_anggaran:     Number(r.tahun_anggaran),
    versi_tanggal:      toDateStr(r.versi_tanggal),
    disimpan_pada:      normWaktu(r.disimpan_pada),
    versi_ke:           Number(r.versi_ke),
    jumlah_baris:       Number(r.jumlah_baris),
    total_nilai:        Number(r.total_nilai ?? 0),
    dpa_versi_tanggal:  r.dpa_versi_tanggal ? toDateStr(r.dpa_versi_tanggal) : null,
    disimpan_oleh_nama: r.oleh ? String(r.oleh) : null,
  }
}

/**
 * DATETIME dari mysql2 (pool `timezone: '+07:00'`) datang sebagai Date. Diformat
 * balik lewat offset yang sama supaya jam yang keluar sama persis dengan jam yang
 * masuk — `toISOString()` polos akan menggesernya 7 jam ke belakang.
 */
function normWaktu(v: unknown): string {
  if (v instanceof Date) return waktuSekarangWIB(v.getTime())
  return String(v ?? '').slice(0, 19).replace('T', ' ')
}

/** Daftar snapshot satu tahun (semua versi) — terbaru dulu. Tanpa `isi`. */
export async function getRiwayatSimpan(
  jenis: JenisRiwayat, tahun: number,
): Promise<RiwayatSimpanItem[]> {
  const rows = await sql`
    SELECT r.id, r.jenis, r.tahun_anggaran, r.versi_tanggal, r.disimpan_pada,
           r.versi_ke, r.jumlah_baris, r.total_nilai, r.dpa_versi_tanggal,
           COALESCE(u.nama_lengkap, u.username) AS oleh
      FROM blud_riwayat_simpan r
      LEFT JOIN users u ON u.id = r.disimpan_oleh
     WHERE r.jenis = ${jenis} AND r.tahun_anggaran = ${tahun}
     ORDER BY r.versi_tanggal DESC, r.disimpan_pada DESC, r.id DESC
  ` as Record<string, unknown>[]
  return rows.map(normItem)
}

/** Satu snapshot beserta isinya — untuk dimuat ke form. */
export async function getRiwayatSimpanIsi(id: number): Promise<RiwayatSimpanIsi | null> {
  const rows = await sql`
    SELECT r.id, r.jenis, r.tahun_anggaran, r.versi_tanggal, r.disimpan_pada,
           r.versi_ke, r.jumlah_baris, r.total_nilai, r.dpa_versi_tanggal,
           COALESCE(u.nama_lengkap, u.username) AS oleh, r.isi
      FROM blud_riwayat_simpan r
      LEFT JOIN users u ON u.id = r.disimpan_oleh
     WHERE r.id = ${id}
  ` as Record<string, unknown>[]
  const r = rows[0]
  if (!r) return null
  // Kolom JSON dipulangkan mysql2 sudah ter-parse; string hanya muncul kalau
  // driver/versi berbeda. Dua-duanya diterima supaya tidak pecah diam-diam.
  const isi = typeof r.isi === 'string' ? JSON.parse(r.isi) : r.isi
  return { ...normItem(r), isi: Array.isArray(isi) ? isi : [] }
}
