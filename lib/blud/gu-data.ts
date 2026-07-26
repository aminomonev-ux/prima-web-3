// lib/blud/gu-data.ts — periode Ganti Uang Persediaan (GU) per bulan.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.2, keputusan #31.
//
// Berkas Juni 2026 asli punya satu lembar `GU 1-26 Juni 2026` — tanggal 1 s/d 26,
// bukan sebulan penuh. Bulan lain bisa punya dua atau tiga pengajuan tergantung
// seberapa cepat uang persediaan terpakai.
//
// Rentangnya TIDAK bisa diterka dari transaksi: tidak ada penanda "GU ke-2
// mulai di sini" di data mana pun. Jadi dicatat, dan hanya rentangnya — angka
// realisasinya tetap dihitung saat lembar dibuat.
import { sql, withTransaction, bulkInsert } from '@/lib/data/db'

export interface GuPeriode {
  urutan: number
  tgl_awal: string
  tgl_akhir: string
  no_surat: string | null
}

const toDate = (v: unknown): string => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v ?? '').slice(0, 10)
}

export async function listGuPeriode(tahun: number, bulan: number): Promise<GuPeriode[]> {
  const rows = await sql`
    SELECT urutan, tgl_awal, tgl_akhir, no_surat
    FROM blud_gu_periode
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
    ORDER BY urutan ASC
  ` as Record<string, unknown>[]
  return rows.map((r) => ({
    urutan: Number(r.urutan),
    tgl_awal: toDate(r.tgl_awal),
    tgl_akhir: toDate(r.tgl_akhir),
    no_surat: r.no_surat != null && String(r.no_surat).trim() !== '' ? String(r.no_surat) : null,
  }))
}

export interface SimpanGuInput {
  tgl_awal: string
  tgl_akhir: string
  no_surat?: string | null
}

/**
 * Replace-all per bulan. `urutan` diberikan di sini berdasarkan tanggal mulai,
 * bukan diterima dari klien: nomor GU harus mengikuti urutan waktu, dan
 * membiarkan klien menentukannya membuka peluang "GU 2" mendahului "GU 1".
 */
export async function simpanGuPeriode(
  tahun: number, bulan: number, daftar: SimpanGuInput[], userId: number,
): Promise<GuPeriode[]> {
  const urut = [...daftar].sort((a, b) => a.tgl_awal.localeCompare(b.tgl_awal))
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM blud_gu_periode WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}`
    if (!urut.length) return
    await bulkInsert(
      'blud_gu_periode',
      ['tahun_anggaran', 'bulan', 'urutan', 'tgl_awal', 'tgl_akhir', 'no_surat', 'updated_by'],
      urut.map((p, i) => [tahun, bulan, i + 1, p.tgl_awal, p.tgl_akhir, p.no_surat?.trim() || null, userId]),
      conn,
    )
  })
  return listGuPeriode(tahun, bulan)
}
