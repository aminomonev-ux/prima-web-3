// lib/blud/pagu.ts — Pagu efektif per baris anggaran + serapan realisasi.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.1
//
// Pagu TIDAK PERNAH disalin ke tabel realisasi. Menyalinnya berarti basi begitu
// ada pergeseran baru — persis penyakit berkas Excel yang digantikan modul ini.
//
//   Pagu efektif (tahun T, baris X)
//     = baris X pada Pergeseran versi TERBARU tahun T   (kolom `pergeseran`)
//     → kalau tahun T belum punya Pergeseran, dari DPA versi TERBARU (kolom `jumlah`)
//
// Kolom `pergeseran` = pagu SESUDAH digeser (bukan nilai deltanya — itu
// `bertambah_berkurang`). Lihat recalcPergeseranJumlah di recalc.ts.
import { sql } from '@/lib/data/db'
import type { TipeBaris } from '@/types'

export interface BarisPagu {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  tipe_baris: TipeBaris
  parent_key: string | null
  urutan: number
  pagu: number
  is_leaf: boolean
}

export interface PaguSumber {
  sumber: 'PERGESERAN' | 'DPA' | 'KOSONG'
  versi: string | null
}

interface BarisMentah {
  anggaran_key: unknown
  kode_rekening: unknown
  uraian: unknown
  tipe_baris: unknown
  row_id: unknown
  parent_id: unknown
  urutan: unknown
  pagu: unknown
}

function susun(rows: BarisMentah[]): BarisPagu[] {
  const keyByRowId = new Map<string, string>()
  const punyaAnak = new Set<string>()
  for (const r of rows) {
    const rowId = String(r.row_id ?? '')
    const key = String(r.anggaran_key ?? '')
    if (rowId && key) keyByRowId.set(rowId, key)
    const parent = r.parent_id != null ? String(r.parent_id) : ''
    if (parent) punyaAnak.add(parent)
  }
  const hasil: BarisPagu[] = []
  for (const r of rows) {
    const key = String(r.anggaran_key ?? '')
    if (!key) continue // baris tanpa jangkar tidak bisa jadi sasaran realisasi
    const rowId = String(r.row_id ?? '')
    const parentRowId = r.parent_id != null ? String(r.parent_id) : ''
    hasil.push({
      anggaran_key: key,
      kode_rekening: String(r.kode_rekening ?? ''),
      uraian: String(r.uraian ?? ''),
      tipe_baris: String(r.tipe_baris) as TipeBaris,
      parent_key: parentRowId ? (keyByRowId.get(parentRowId) ?? null) : null,
      urutan: Number(r.urutan ?? 0),
      pagu: Number(r.pagu ?? 0),
      is_leaf: !punyaAnak.has(rowId),
    })
  }
  return hasil
}

/** Dari mana pagu tahun ini diambil — dipakai UI untuk memberi tahu pengguna. */
export async function getPaguSumber(tahun: number): Promise<PaguSumber> {
  const pgs = await sql`
    SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}
  ` as { v?: unknown }[]
  if (pgs[0]?.v) return { sumber: 'PERGESERAN', versi: String(pgs[0].v).slice(0, 10) }

  const dpa = await sql`
    SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}
  ` as { v?: unknown }[]
  if (dpa[0]?.v) return { sumber: 'DPA', versi: String(dpa[0].v).slice(0, 10) }

  return { sumber: 'KOSONG', versi: null }
}

/**
 * Pohon baris anggaran + pagu efektif tahun tsb, urut tampilan.
 * Array kosong = tahun itu belum punya DPA (§4.8) — pemanggil wajib menolak
 * input realisasi, bukan menampilkan layar kosong tanpa keterangan.
 */
export async function getPaguEfektif(tahun: number): Promise<BarisPagu[]> {
  const { sumber } = await getPaguSumber(tahun)
  if (sumber === 'KOSONG') return []

  const rows = sumber === 'PERGESERAN'
    ? await sql`
        SELECT anggaran_key, kode_rekening, uraian, tipe_baris, row_id, parent_id, urutan,
               pergeseran AS pagu
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun}
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun})
        ORDER BY urutan ASC
      `
    : await sql`
        SELECT anggaran_key, kode_rekening, uraian, tipe_baris, row_id, parent_id, urutan,
               jumlah AS pagu
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun}
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ${tahun})
        ORDER BY urutan ASC
      `

  return susun(rows as BarisMentah[])
}

export async function getPaguMap(tahun: number): Promise<Map<string, BarisPagu>> {
  const rows = await getPaguEfektif(tahun)
  return new Map(rows.map((r) => [r.anggaran_key, r]))
}

/** Serapan per baris anggaran — SUM alokasi, tidak pernah disimpan sebagai kolom. */
export async function getTerserap(
  tahun: number,
  sampaiBulan?: number,
): Promise<Map<string, number>> {
  const rows = sampaiBulan == null
    ? await sql`
        SELECT a.anggaran_key AS k, SUM(a.nilai) AS n
        FROM blud_realisasi_alokasi a
        WHERE a.tahun_anggaran = ${tahun}
        GROUP BY a.anggaran_key
      `
    : await sql`
        SELECT a.anggaran_key AS k, SUM(a.nilai) AS n
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun} AND t.bulan <= ${sampaiBulan}
        GROUP BY a.anggaran_key
      `
  const map = new Map<string, number>()
  for (const r of rows as { k: unknown; n: unknown }[]) {
    map.set(String(r.k), Number(r.n ?? 0))
  }
  return map
}
