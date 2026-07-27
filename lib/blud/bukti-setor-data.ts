// lib/blud/bukti-setor-data.ts — Data layer Bukti Setor ke Bank (lembar `setor BPD`).
// Konsep: docs/CONCEPT-blud-bukti-setor.md (keputusan #36)
//
// Berbeda dari lembar BLUD lain, ini dokumen yang DIRAKIT — sebagian barisnya boleh
// diketik lepas. Yang membuatnya tetap aman: baris ber-penunjuk dibaca HIDUP dari
// sumbernya (uraian & nilai tidak pernah disalin), dan baris ketikan dihitung lalu
// dinyatakan terang-terangan. Ketikan lepas jadi sisa yang terlihat, bukan lubang.
//
// `Total` dan `Cash` TIDAK disimpan — dihitung saat dibaca, meniru rumus di berkas
// asli (`=SUM(D8:D18)` dan `=D19-D20`).
import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import { LABEL_POTONGAN, type JenisPotongan } from './alokasi-rule'
import { BludPeriodeTertutupError } from './realisasi-schemas'
import {
  BludBuktiSetorConflictError, BludBuktiSetorTidakAdaError,
  type AsalBaris, type SimpanBuktiSetorInput,
} from './bukti-setor-schemas'

export interface BarisBuktiSetor {
  urutan: number
  asal: AsalBaris
  tx_id: number | null
  potongan_id: number | null
  uraian: string
  nilai: number
  /** Penanda kecil di layar & cetak — no. kuitansi transaksi asalnya. */
  no_kwt: number | null
  /** Penunjuknya ada tapi sumbernya sudah terhapus. */
  hilang: boolean
}

export interface BuktiSetor {
  id: number
  tahun_anggaran: number
  bulan: number
  tanggal: string
  no_bukti: string | null
  ambil_tx_id: number | null
  ambil_uraian: string | null
  ambil_uang: number
  version: number
  baris: BarisBuktiSetor[]
  /** Dihitung saat dibaca — TIDAK disimpan (§2.7). */
  total: number
  cash: number
  n_terhubung: number
  n_ketik: number
  nilai_ketik: number
  peringatan: string[]
}

const toDate = (v: unknown): string => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v ?? '').slice(0, 10)
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

/** Nilai satu transaksi di mata slip: arus keluarnya, atau masuknya kalau murni menerima. */
function nilaiTx(r: Record<string, unknown>): number {
  const keluar = Number(r.kas_keluar ?? 0) + Number(r.bank_keluar ?? 0)
  return keluar > 0 ? keluar : Number(r.kas_masuk ?? 0) + Number(r.bank_masuk ?? 0)
}

function bentukBaris(r: Record<string, unknown>): BarisBuktiSetor {
  const asal = String(r.asal) as AsalBaris
  const urutan = Number(r.urutan ?? 0)

  if (asal === 'KETIK') {
    return {
      urutan, asal, tx_id: null, potongan_id: null,
      uraian: String(r.uraian ?? ''), nilai: Number(r.nilai ?? 0),
      no_kwt: null, hilang: false,
    }
  }

  if (asal === 'POTONGAN') {
    const ada = r.pot_nilai != null
    const jenis = r.pot_jenis ? LABEL_POTONGAN[String(r.pot_jenis) as JenisPotongan] : ''
    const ket = r.pot_ket ? ` ${String(r.pot_ket)}` : ''
    return {
      urutan, asal,
      tx_id: null,
      potongan_id: r.potongan_id != null ? Number(r.potongan_id) : null,
      uraian: ada ? `Setor ${jenis}${ket}` : '(potongan terhapus)',
      nilai: ada ? Number(r.pot_nilai) : 0,
      no_kwt: r.pot_kwt != null ? Number(r.pot_kwt) : null,
      hilang: !ada,
    }
  }

  const ada = r.tx_uraian != null
  return {
    urutan, asal,
    tx_id: r.tx_id != null ? Number(r.tx_id) : null,
    potongan_id: null,
    uraian: ada ? String(r.tx_uraian) : '(transaksi terhapus)',
    nilai: ada ? nilaiTx(r) : 0,
    no_kwt: r.no_kwt != null ? Number(r.no_kwt) : null,
    hilang: !ada,
  }
}

function rakit(
  h: Record<string, unknown>,
  baris: BarisBuktiSetor[],
  txDipakaiLain: Set<number>,
): BuktiSetor {
  const ambilTxId = h.ambil_tx_id != null ? Number(h.ambil_tx_id) : null
  const ambilUang = ambilTxId != null && h.ambil_uraian != null
    ? nilaiTx({ kas_keluar: h.ambil_kas_keluar, bank_keluar: h.ambil_bank_keluar, kas_masuk: 0, bank_masuk: 0 })
    : Number(h.ambil_manual ?? 0)

  const total = baris.reduce((s, b) => s + b.nilai, 0)
  const ketik = baris.filter((b) => b.asal === 'KETIK')
  const hilang = baris.filter((b) => b.hilang)

  const peringatan: string[] = []
  if (hilang.length) {
    peringatan.push(`${hilang.length} baris menunjuk data yang sudah dihapus — nilainya dihitung 0.`)
  }
  if (ambilTxId != null && h.ambil_uraian == null) {
    peringatan.push('Transaksi tarikan yang ditunjuk sudah dihapus dari Buku Kas.')
  }
  if (ambilUang > 0 && total - ambilUang > 0.005) {
    peringatan.push(`Pemakaian melebihi tarikan sebesar Rp ${rp(total - ambilUang)} — periksa lagi daftarnya.`)
  }
  const dobel = baris.filter((b) => b.tx_id != null && txDipakaiLain.has(b.tx_id))
  if (dobel.length) {
    peringatan.push(`${dobel.length} transaksi juga dipakai di bukti setor lain pada bulan ini.`)
  }

  return {
    id: Number(h.id),
    tahun_anggaran: Number(h.tahun_anggaran),
    bulan: Number(h.bulan),
    tanggal: toDate(h.tanggal),
    no_bukti: h.no_bukti != null && String(h.no_bukti).trim() !== '' ? String(h.no_bukti) : null,
    ambil_tx_id: ambilTxId,
    ambil_uraian: h.ambil_uraian != null ? String(h.ambil_uraian) : null,
    ambil_uang: ambilUang,
    version: Number(h.version ?? 0),
    baris,
    total,
    cash: ambilUang - total,
    n_terhubung: baris.length - ketik.length,
    n_ketik: ketik.length,
    nilai_ketik: ketik.reduce((s, b) => s + b.nilai, 0),
    peringatan,
  }
}

/**
 * Transaksi yang muncul di lebih dari satu bukti setor pada bulan yang sama. Tidak
 * diblokir saat menyimpan — pembayaran dicicil itu sah — tapi wajib terlihat.
 */
async function txDipakaiLebihDariSatu(tahun: number, bulan: number): Promise<Set<number>> {
  const rows = await sql`
    SELECT b.tx_id
    FROM blud_bukti_setor_baris b
    JOIN blud_bukti_setor s ON s.id = b.bukti_id
    WHERE s.tahun_anggaran = ${tahun} AND s.bulan = ${bulan} AND b.tx_id IS NOT NULL
    GROUP BY b.tx_id HAVING COUNT(DISTINCT b.bukti_id) > 1
  ` as { tx_id?: unknown }[]
  return new Set(rows.map((r) => Number(r.tx_id)))
}

export async function listBuktiSetor(tahun: number, bulan: number): Promise<BuktiSetor[]> {
  const headers = await sql`
    SELECT s.id, s.tahun_anggaran, s.bulan, s.tanggal, s.no_bukti, s.ambil_tx_id, s.ambil_manual, s.version,
           a.uraian AS ambil_uraian, a.kas_keluar AS ambil_kas_keluar, a.bank_keluar AS ambil_bank_keluar
    FROM blud_bukti_setor s
    LEFT JOIN blud_realisasi_tx a ON a.id = s.ambil_tx_id
    WHERE s.tahun_anggaran = ${tahun} AND s.bulan = ${bulan}
    ORDER BY s.tanggal ASC, s.id ASC
  ` as Record<string, unknown>[]
  if (!headers.length) return []

  const barisRows = await sql`
    SELECT b.bukti_id, b.urutan, b.asal, b.tx_id, b.potongan_id, b.uraian, b.nilai,
           t.uraian AS tx_uraian, t.no_kwt, t.kas_masuk, t.kas_keluar, t.bank_masuk, t.bank_keluar,
           p.jenis AS pot_jenis, p.keterangan AS pot_ket, p.nilai AS pot_nilai, pt.no_kwt AS pot_kwt
    FROM blud_bukti_setor_baris b
    JOIN blud_bukti_setor s ON s.id = b.bukti_id
    LEFT JOIN blud_realisasi_tx t ON t.id = b.tx_id
    LEFT JOIN blud_realisasi_potongan p ON p.id = b.potongan_id
    LEFT JOIN blud_realisasi_tx pt ON pt.id = p.tx_id
    WHERE s.tahun_anggaran = ${tahun} AND s.bulan = ${bulan}
    ORDER BY b.bukti_id ASC, b.urutan ASC, b.id ASC
  ` as Record<string, unknown>[]

  const perBukti = new Map<number, BarisBuktiSetor[]>()
  for (const r of barisRows) {
    const id = Number(r.bukti_id)
    if (!perBukti.has(id)) perBukti.set(id, [])
    perBukti.get(id)!.push(bentukBaris(r))
  }

  const dipakaiLain = await txDipakaiLebihDariSatu(tahun, bulan)
  return headers.map((h) => rakit(h, perBukti.get(Number(h.id)) ?? [], dipakaiLain))
}

export async function getBuktiSetor(id: number): Promise<BuktiSetor | null> {
  const headers = await sql`
    SELECT s.id, s.tahun_anggaran, s.bulan, s.tanggal, s.no_bukti, s.ambil_tx_id, s.ambil_manual, s.version,
           a.uraian AS ambil_uraian, a.kas_keluar AS ambil_kas_keluar, a.bank_keluar AS ambil_bank_keluar
    FROM blud_bukti_setor s
    LEFT JOIN blud_realisasi_tx a ON a.id = s.ambil_tx_id
    WHERE s.id = ${id}
  ` as Record<string, unknown>[]
  if (!headers.length) return null

  const barisRows = await sql`
    SELECT b.bukti_id, b.urutan, b.asal, b.tx_id, b.potongan_id, b.uraian, b.nilai,
           t.uraian AS tx_uraian, t.no_kwt, t.kas_masuk, t.kas_keluar, t.bank_masuk, t.bank_keluar,
           p.jenis AS pot_jenis, p.keterangan AS pot_ket, p.nilai AS pot_nilai, pt.no_kwt AS pot_kwt
    FROM blud_bukti_setor_baris b
    LEFT JOIN blud_realisasi_tx t ON t.id = b.tx_id
    LEFT JOIN blud_realisasi_potongan p ON p.id = b.potongan_id
    LEFT JOIN blud_realisasi_tx pt ON pt.id = p.tx_id
    WHERE b.bukti_id = ${id}
    ORDER BY b.urutan ASC, b.id ASC
  ` as Record<string, unknown>[]

  const h = headers[0]
  const dipakaiLain = await txDipakaiLebihDariSatu(Number(h.tahun_anggaran), Number(h.bulan))
  return rakit(h, barisRows.map(bentukBaris), dipakaiLain)
}

const BARIS_COLUMNS = ['bukti_id', 'urutan', 'asal', 'tx_id', 'potongan_id', 'uraian', 'nilai'] as const

async function pastikanPeriodeBuka(tx: TxSql, tahun: number, bulan: number): Promise<void> {
  // T2: dikunci, bukan sekadar dibaca — periode bisa ditutup di sela pemeriksaan
  // dan penulisan, dan slip baru menyelinap ke bulan yang sudah ditandatangani.
  const per = await tx`
    SELECT status FROM blud_periode
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
  ` as { status?: unknown }[]
  if (per[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)
}

export async function simpanBuktiSetor(
  input: SimpanBuktiSetorInput,
  userId: number,
): Promise<{ id: number; version: number }> {
  return withTransaction(async ({ tx, conn }) => {
    await pastikanPeriodeBuka(tx, input.tahun_anggaran, input.bulan)

    let id = input.id ?? 0
    let version = 0

    if (id) {
      // L48: baca baris sendiri dengan FOR UPDATE — CAS harus melihat angka segar.
      const cur = await tx`
        SELECT version, tahun_anggaran, bulan FROM blud_bukti_setor WHERE id = ${id} FOR UPDATE
      ` as Record<string, unknown>[]
      if (!cur.length) throw new BludBuktiSetorTidakAdaError(id)
      version = Number(cur[0].version ?? 0)
      if (input.expected_version != null && version !== input.expected_version) {
        throw new BludBuktiSetorConflictError(id, input.expected_version, version)
      }
      // Bulan asalnya ikut dikunci supaya memindahkan slip ke bulan lain tidak
      // melewati pagar periode bulan yang ditinggalkan.
      const bulanLama = Number(cur[0].bulan)
      if (bulanLama !== input.bulan || Number(cur[0].tahun_anggaran) !== input.tahun_anggaran) {
        await pastikanPeriodeBuka(tx, Number(cur[0].tahun_anggaran), bulanLama)
      }

      await tx`
        UPDATE blud_bukti_setor SET
          tahun_anggaran = ${input.tahun_anggaran}, bulan = ${input.bulan}, tanggal = ${input.tanggal},
          no_bukti = ${input.no_bukti?.trim() || null},
          ambil_tx_id = ${input.ambil_tx_id ?? null}, ambil_manual = ${input.ambil_manual ?? null},
          version = version + 1, created_by = COALESCE(created_by, ${userId})
        WHERE id = ${id}
      `
      await tx`DELETE FROM blud_bukti_setor_baris WHERE bukti_id = ${id}`
      version += 1
    } else {
      const res = await tx`
        INSERT INTO blud_bukti_setor
          (tahun_anggaran, bulan, tanggal, no_bukti, ambil_tx_id, ambil_manual, version, created_by)
        VALUES
          (${input.tahun_anggaran}, ${input.bulan}, ${input.tanggal}, ${input.no_bukti?.trim() || null},
           ${input.ambil_tx_id ?? null}, ${input.ambil_manual ?? null}, 0, ${userId})
      ` as unknown as Array<{ insertId: number }>
      id = Number(res[0]?.insertId ?? 0)
    }

    if (input.baris.length) {
      await bulkInsert(
        'blud_bukti_setor_baris',
        BARIS_COLUMNS,
        input.baris.map((b, i) => [
          id, i,
          b.asal,
          b.asal === 'BKU' ? b.tx_id ?? null : null,
          b.asal === 'POTONGAN' ? b.potongan_id ?? null : null,
          b.asal === 'KETIK' ? b.uraian?.trim() ?? null : null,
          b.asal === 'KETIK' ? b.nilai ?? 0 : null,
        ]),
        conn,
      )
    }
    return { id, version }
  })
}

export async function hapusBuktiSetor(id: number): Promise<{ deleted: number }> {
  return withTransaction(async ({ tx }) => {
    const cur = await tx`
      SELECT tahun_anggaran, bulan FROM blud_bukti_setor WHERE id = ${id} FOR UPDATE
    ` as Record<string, unknown>[]
    if (!cur.length) return { deleted: 0 }
    await pastikanPeriodeBuka(tx, Number(cur[0].tahun_anggaran), Number(cur[0].bulan))

    // Baris ikut terhapus lewat FK ON DELETE CASCADE.
    const res = await tx`DELETE FROM blud_bukti_setor WHERE id = ${id}` as unknown as Array<{ affectedRows: number }>
    return { deleted: Number(res[0]?.affectedRows ?? 0) }
  })
}
