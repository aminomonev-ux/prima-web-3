// lib/blud/data.ts — Data access layer BLUD (DPA + Pergeseran), MySQL
// Tahap 11 fixes:
// - B-BUG-3 (CRITICAL): saveDpa/savePergeseran DELETE+INSERT pakai withTransaction.
// - B-PERF-1 (CRITICAL): ganti for-loop INSERT (700 round-trip) → bulkInsert single VALUES.
// - B-CQ-1 (MED): toDateStr off-by-one — Date dari mysql2 (pool TZ +07:00) saat
//   server UTC → .toISOString().slice() shift -1 hari. Fix: add +07:00 offset.

import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import { assertBludVersion, bumpBludVersion, dropBludVersion, getBludVersion } from './lock'
import type {
  DpaBaris, DpaBarisInput,
  PergeseranBaris, PergeseranBarisInput,
  DpaHistoryItem, PergeseranHistoryItem,
} from '@/types'

// Audit BLUD v1.2 (B-NEW-3): safety threshold supaya drop >50% trigger konfirmasi.
const SAFE_DROP_THRESHOLD = 0.5

export class BludReplaceSafetyError extends Error {
  constructor(public table: string, public existing: number, public incoming: number, public dropPct: number) {
    super(
      `Safety guard: hanya ${incoming} baris baru vs ${existing} existing di ${table} ` +
      `(drop ${dropPct.toFixed(1)}%). Pakai force=true kalau memang sengaja.`,
    )
    this.name = 'BludReplaceSafetyError'
  }
}

// Pool config `timezone: '+07:00'` → mysql2 interpret DATE column sebagai
// midnight di +07:00. Di server UTC (Vercel), `Date.toISOString()` shift
// back ke UTC → bisa kembalikan tanggal sebelumnya. Tambah 7h offset supaya
// ISO string mewakili midnight UTC dari DATE asli.
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

function toDateStr(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) {
    return new Date(v.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
  }
  return String(v).slice(0, 10)
}

function normDpa(r: Record<string, unknown>): DpaBaris {
  return {
    id: Number(r.id), versi_tanggal: toDateStr(r.versi_tanggal),
    is_latest: Number(r.is_latest), kode_rekening: String(r.kode_rekening ?? ''),
    uraian: String(r.uraian ?? ''), vol: r.vol != null ? Number(r.vol) : null,
    satuan: r.satuan != null ? String(r.satuan) : null,
    harga: r.harga != null ? Number(r.harga) : null,
    jumlah: Number(r.jumlah ?? 0),
    penanggung_jawab: r.penanggung_jawab != null ? String(r.penanggung_jawab) : null,
    keterangan: r.keterangan != null ? String(r.keterangan) : null,
    tipe_baris: String(r.tipe_baris) as DpaBaris['tipe_baris'],
    row_id: String(r.row_id ?? ''), parent_id: r.parent_id != null ? String(r.parent_id) : null,
    urutan: Number(r.urutan ?? 0),
    origin: (r.origin === 'USULAN' ? 'USULAN' : 'MANUAL'),
    usulan_item_id: r.usulan_item_id != null ? Number(r.usulan_item_id) : null,
    usulan_no: r.usulan_no != null ? String(r.usulan_no) : null,
  }
}

function normPergeseran(r: Record<string, unknown>): PergeseranBaris {
  return {
    id: Number(r.id), versi_tanggal: toDateStr(r.versi_tanggal),
    dpa_versi_tanggal: toDateStr(r.dpa_versi_tanggal), is_latest: Number(r.is_latest),
    kode_rekening: String(r.kode_rekening ?? ''), uraian: String(r.uraian ?? ''),
    vol: r.vol != null ? Number(r.vol) : null, satuan: r.satuan != null ? String(r.satuan) : null,
    harga: r.harga != null ? Number(r.harga) : null, jumlah: Number(r.jumlah ?? 0),
    vol_p: r.vol_p != null ? Number(r.vol_p) : null,
    harga_p: r.harga_p != null ? Number(r.harga_p) : null,
    pergeseran: Number(r.pergeseran ?? 0), bertambah_berkurang: Number(r.bertambah_berkurang ?? 0),
    tipe_baris: String(r.tipe_baris) as PergeseranBaris['tipe_baris'],
    row_id: String(r.row_id ?? ''), parent_id: r.parent_id != null ? String(r.parent_id) : null,
    urutan: Number(r.urutan ?? 0),
  }
}

// ─── DPA ─────────────────────────────────────────────────────────────────────

export async function getDpaHistory(): Promise<DpaHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris FROM dpa_blud GROUP BY versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getDpaLatestDate(): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM dpa_blud`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getDpaByDate(versiTanggal: string): Promise<DpaBaris[]> {
  const rows = await sql`SELECT * FROM dpa_blud WHERE versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normDpa)
}

/** L51: get current version utk client baseline (kirim balik saat save). */
export async function getDpaVersion(versiTanggal: string): Promise<number> {
  return getBludVersion('dpa_blud', versiTanggal)
}

const DPA_COLUMNS = [
  'versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan', 'harga', 'jumlah',
  'penanggung_jawab', 'keterangan', 'tipe_baris', 'row_id', 'parent_id', 'urutan',
  'origin', 'usulan_item_id', 'usulan_no',
]

export async function saveDpa(
  versiTanggal: string,
  rows: DpaBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length

  if (!incoming) {
    // Edge case: user kirim kosong + force=true → hapus saja versi itu
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'dpa_blud', versiTanggal, expectedVersion)
        await tx`DELETE FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'dpa_blud', versiTanggal, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1 }
    }
    return { existing, replaced: 0, newVersion: expectedVersion }
  }

  const values = rows.map(r => [
    versiTanggal, r.kode_rekening, r.uraian, r.vol ?? null, r.satuan ?? null,
    r.harga ?? null, r.jumlah, r.penanggung_jawab ?? null, r.keterangan ?? null,
    r.tipe_baris, r.row_id, r.parent_id ?? null, r.urutan,
    r.origin ?? 'MANUAL', r.usulan_item_id ?? null, r.usulan_no ?? null,
  ])
  let existing = 0
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'dpa_blud', versiTanggal, expectedVersion)
    // B-NEW-3 threshold dihitung DI DALAM tx (audit DPA 2026-06-11 B-3) — angka
    // segar setelah row lock, throw → rollback otomatis
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('dpa_blud', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await tx`DELETE FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}`
    await bulkInsert('dpa_blud', DPA_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'dpa_blud', versiTanggal, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}

/**
 * Hapus seluruh versi DPA + cascade ke rekap_pk yang refer ke versi tsb.
 * Atomic via withTransaction. Returns jumlah baris yang ke-hapus per tabel.
 * Throw kalau versi tidak ditemukan supaya caller bisa return 404.
 */
export async function deleteDpaVersi(versiTanggal: string): Promise<{
  dpa_rows: number;
  rekap_pk_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi DPA ${versiTanggal} tidak ditemukan`)
  }

  let dpaCount = 0
  let rekapCount = 0
  await withTransaction(async ({ tx }) => {
    // 1. Hapus rekap_pk dulu (FK ref ke versi_dpa — soft, table standalone)
    const rekapRes = await tx`DELETE FROM rekap_pk WHERE versi_dpa = ${versiTanggal}`
    rekapCount = Number((rekapRes as { affectedRows?: number }).affectedRows ?? 0)
    // 2. Hapus baris dpa_blud
    const dpaRes = await tx`DELETE FROM dpa_blud WHERE versi_tanggal = ${versiTanggal}`
    dpaCount = Number((dpaRes as { affectedRows?: number }).affectedRows ?? 0)
    // 3. Drop lock row (cleanup, cegah orphan)
    await dropBludVersion(tx, 'dpa_blud', versiTanggal)
    await dropBludVersion(tx, 'rekap_pk', versiTanggal)
  })
  return { dpa_rows: dpaCount, rekap_pk_rows: rekapCount }
}

// ─── PERGESERAN ───────────────────────────────────────────────────────────────

export async function getPergeseranLatestDate(): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM pergeseran_dpa`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getPergeseranHistory(): Promise<PergeseranHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris FROM pergeseran_dpa GROUP BY versi_tanggal, dpa_versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), dpa_versi_tanggal: toDateStr(r.dpa_versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getPergeseranByDate(versiTanggal: string): Promise<PergeseranBaris[]> {
  const rows = await sql`SELECT * FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normPergeseran)
}

/** L51: get current version utk client baseline pergeseran. */
export async function getPergeseranVersion(versiTanggal: string): Promise<number> {
  return getBludVersion('pergeseran_dpa', versiTanggal)
}

const PERGESERAN_COLUMNS = [
  'versi_tanggal', 'dpa_versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan',
  'harga', 'jumlah', 'vol_p', 'harga_p', 'pergeseran', 'bertambah_berkurang',
  'tipe_baris', 'row_id', 'parent_id', 'urutan',
]

export async function savePergeseran(
  versiTanggal: string,
  dpaVersiTanggal: string,
  rows: PergeseranBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length

  if (!incoming) {
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'pergeseran_dpa', versiTanggal, expectedVersion)
        await tx`DELETE FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'pergeseran_dpa', versiTanggal, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1 }
    }
    return { existing, replaced: 0, newVersion: expectedVersion }
  }

  const values = rows.map(r => [
    versiTanggal, dpaVersiTanggal, r.kode_rekening, r.uraian, r.vol ?? null,
    r.satuan ?? null, r.harga ?? null, r.jumlah, r.vol_p ?? null, r.harga_p ?? null,
    r.pergeseran, r.bertambah_berkurang, r.tipe_baris, r.row_id, r.parent_id ?? null,
    r.urutan,
  ])
  let existing = 0
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'pergeseran_dpa', versiTanggal, expectedVersion)
    // B-NEW-3 threshold di dalam tx (audit DPA 2026-06-11 B-3)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('pergeseran_dpa', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await tx`DELETE FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}`
    await bulkInsert('pergeseran_dpa', PERGESERAN_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'pergeseran_dpa', versiTanggal, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}

/**
 * Hapus seluruh versi Pergeseran. Standalone (tidak ada FK turunan).
 * Returns jumlah baris terhapus. Throw kalau versi tidak ada.
 */
export async function deletePergeseranVersi(versiTanggal: string): Promise<{
  pergeseran_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi Pergeseran ${versiTanggal} tidak ditemukan`)
  }
  let count = 0
  await withTransaction(async ({ tx }) => {
    const res = await tx`DELETE FROM pergeseran_dpa WHERE versi_tanggal = ${versiTanggal}`
    count = Number((res as { affectedRows?: number }).affectedRows ?? 0)
    await dropBludVersion(tx, 'pergeseran_dpa', versiTanggal)
  })
  return { pergeseran_rows: count }
}
