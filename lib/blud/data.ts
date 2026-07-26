// lib/blud/data.ts — Data access layer BLUD (DPA + Pergeseran), MySQL
// Tahap 11 fixes:
// - B-BUG-3 (CRITICAL): saveDpa/savePergeseran DELETE+INSERT pakai withTransaction.
// - B-PERF-1 (CRITICAL): ganti for-loop INSERT (700 round-trip) → bulkInsert single VALUES.
// - B-CQ-1 (MED): toDateStr off-by-one — Date dari mysql2 (pool TZ +07:00) saat
//   server UTC → .toISOString().slice() shift -1 hari. Fix: add +07:00 offset.
// Tahun Anggaran (CONCEPT-blud-tahun-anggaran, Opsi B): identitas versi jadi
//   (tahun_anggaran, versi_tanggal). tahun WAJIB masuk dedupe DELETE + lock key,
//   kalau tidak 2 tahun disimpan tanggal sama saling menimpa (§1).

import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import { assertBludVersion, bumpBludVersion, dropBludVersion, getBludVersion, bludVersiKey } from './lock'
import { ensureAnggaranKey } from './anggaran-key'
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

/**
 * Pagar jangkar (CONCEPT-blud-realisasi §2.3). Baris yang SAMA — terbukti dari
 * `row_id` yang sudah pernah berjangkar — tidak boleh datang tanpa jangkarnya.
 * Kalau dibiarkan, `ensureAnggaranKey` mencetak kunci baru dan seluruh realisasi
 * yang menempel di baris itu jadi yatim tanpa satu pun pesan galat.
 *
 * Ini pernah terjadi sungguhan: klien DPA & Pergeseran menyusun ulang baris
 * dengan daftar kolom tetap dan `anggaran_key` tidak masuk daftar. Zod
 * `.passthrough()` tidak menolong — yang membuang kliennya, bukan servernya.
 */
export class BludJangkarHilangError extends Error {
  constructor(public table: string, public yatim: number, public berjangkar: number) {
    super(
      `Simpan dibatalkan: ${yatim} dari ${berjangkar} baris berjangkar dikirim tanpa anggaran_key. ` +
      `Baris itu sudah punya realisasi yang menempel — menyimpannya sekarang akan memutus tautannya. ` +
      `Muat ulang halaman lalu ulangi; kalau tetap muncul, ada jalur simpan yang membuang anggaran_key.`,
    )
    this.name = 'BludJangkarHilangError'
  }
}

/**
 * Dijalankan DI DALAM transaksi simpan, sebelum DELETE. Pembandingnya versi
 * TERBARU tahun itu — bukan versi yang sedang ditimpa — supaya versi baru yang
 * lahir tanpa jangkar pun ketahuan.
 */
async function periksaJangkar(
  tx: TxSql,
  table: 'dpa_blud' | 'pergeseran_dpa',
  tahun: number,
  rows: { row_id: string; anggaran_key?: string | null }[],
): Promise<void> {
  const lama = table === 'dpa_blud'
    ? await tx`
        SELECT row_id FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ${tahun})
      `
    : await tx`
        SELECT row_id FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun})
      `
  const berjangkar = new Set(
    (lama as { row_id?: unknown }[]).map(r => String(r.row_id ?? '')).filter(Boolean),
  )
  if (!berjangkar.size) return
  // Baris yang benar-benar baru punya row_id baru pula, jadi tidak pernah cocok
  // di sini — impor besar atau susun ulang dari nol tidak akan ikut tertahan.
  const yatim = rows.filter(
    r => berjangkar.has(r.row_id) && !String(r.anggaran_key ?? '').trim(),
  ).length
  if (yatim > 0) throw new BludJangkarHilangError(table, yatim, berjangkar.size)
}

// Pool config `timezone: '+07:00'` → mysql2 interpret DATE column sebagai
// midnight di +07:00. Di server UTC (Vercel), `Date.toISOString()` shift
// back ke UTC → bisa kembalikan tanggal sebelumnya. Tambah 7h offset supaya
// ISO string mewakili midnight UTC dari DATE asli.
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export function toDateStr(v: unknown): string {
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
    row_id: String(r.row_id ?? ''),
    anggaran_key: r.anggaran_key != null ? String(r.anggaran_key) : null,
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
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
    row_id: String(r.row_id ?? ''),
    anggaran_key: r.anggaran_key != null ? String(r.anggaran_key) : null,
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
    urutan: Number(r.urutan ?? 0),
  }
}

// ─── TAHUN ANGGARAN ──────────────────────────────────────────────────────────

/** Daftar tahun anggaran yang punya data (DPA ∪ Pergeseran), terbaru dulu. */
export async function getTahunList(): Promise<number[]> {
  const rows = await sql`
    SELECT tahun_anggaran FROM dpa_blud
    UNION
    SELECT tahun_anggaran FROM pergeseran_dpa
    ORDER BY tahun_anggaran DESC
  ` as Record<string, unknown>[]
  return rows.map(r => Number(r.tahun_anggaran)).filter(n => n > 0)
}

/** Versi DPA terbaru lintas-tahun beserta tahunnya — dipakai pembaca overview
 *  (dashboard cross-modul) yang tidak punya konteks tahun terpilih. */
export async function getDpaLatest(): Promise<{ tahun: number; versi: string } | null> {
  const rows = await sql`
    SELECT tahun_anggaran, versi_tanggal FROM dpa_blud
    ORDER BY versi_tanggal DESC, tahun_anggaran DESC LIMIT 1
  ` as Record<string, unknown>[]
  if (!rows.length) return null
  return { tahun: Number(rows[0].tahun_anggaran), versi: toDateStr(rows[0].versi_tanggal) }
}

// ─── DPA ─────────────────────────────────────────────────────────────────────

export async function getDpaHistory(tahun: number): Promise<DpaHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris FROM dpa_blud WHERE tahun_anggaran = ${tahun} GROUP BY versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getDpaLatestDate(tahun: number): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM dpa_blud WHERE tahun_anggaran = ${tahun}`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getDpaByDate(tahun: number, versiTanggal: string): Promise<DpaBaris[]> {
  const rows = await sql`SELECT * FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normDpa)
}

/** L51: get current version utk client baseline (kirim balik saat save). */
export async function getDpaVersion(tahun: number, versiTanggal: string): Promise<number> {
  return getBludVersion('dpa_blud', bludVersiKey(tahun, versiTanggal))
}

const DPA_COLUMNS = [
  'tahun_anggaran', 'versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan', 'harga', 'jumlah',
  'penanggung_jawab', 'keterangan', 'tipe_baris', 'row_id', 'anggaran_key', 'parent_id', 'urutan',
  'origin', 'usulan_item_id', 'usulan_no',
]

export async function saveDpa(
  tahun: number,
  versiTanggal: string,
  rows: DpaBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length
  const lockKey = bludVersiKey(tahun, versiTanggal)

  if (!incoming) {
    // Edge case: user kirim kosong + force=true → hapus saja versi itu
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'dpa_blud', lockKey, expectedVersion)
        await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'dpa_blud', lockKey, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1 }
    }
    return { existing, replaced: 0, newVersion: expectedVersion }
  }

  const values = rows.map(r => [
    tahun, versiTanggal, r.kode_rekening, r.uraian, r.vol ?? null, r.satuan ?? null,
    r.harga ?? null, r.jumlah, r.penanggung_jawab ?? null, r.keterangan ?? null,
    r.tipe_baris, r.row_id, ensureAnggaranKey(r.anggaran_key), r.parent_id ?? null, r.urutan,
    r.origin ?? 'MANUAL', r.usulan_item_id ?? null, r.usulan_no ?? null,
  ])
  let existing = 0
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'dpa_blud', lockKey, expectedVersion)
    // B-NEW-3 threshold dihitung DI DALAM tx (audit DPA 2026-06-11 B-3) — angka
    // segar setelah row lock, throw → rollback otomatis
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('dpa_blud', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    // Sengaja TIDAK bisa ditembus `force`: kehilangan jangkar tidak pernah
    // disengaja, dan akibatnya (realisasi yatim) tidak terlihat di layar mana pun.
    await periksaJangkar(tx, 'dpa_blud', tahun, rows)
    await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
    await bulkInsert('dpa_blud', DPA_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'dpa_blud', lockKey, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}

/**
 * Hapus seluruh versi DPA + cascade ke rekap_pk yang refer ke versi tsb.
 * Atomic via withTransaction. Returns jumlah baris yang ke-hapus per tabel.
 * Throw kalau versi tidak ditemukan supaya caller bisa return 404.
 */
export async function deleteDpaVersi(tahun: number, versiTanggal: string): Promise<{
  dpa_rows: number;
  rekap_pk_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi DPA ${tahun}/${versiTanggal} tidak ditemukan`)
  }

  const lockKey = bludVersiKey(tahun, versiTanggal)
  let dpaCount = 0
  let rekapCount = 0
  await withTransaction(async ({ tx }) => {
    // 1. Hapus rekap_pk dulu (FK ref ke versi_dpa — soft, table standalone)
    // L53: tx wrapper return Array<{affectedRows}>, BUKAN object. Cast object
    // langsung → diam-diam selalu 0 (audit log + response palsu "0 baris dihapus").
    const rekapRes = await tx`DELETE FROM rekap_pk WHERE tahun_anggaran = ${tahun} AND versi_dpa = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    rekapCount = Number(rekapRes[0]?.affectedRows ?? 0)
    // 2. Hapus baris dpa_blud
    const dpaRes = await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    dpaCount = Number(dpaRes[0]?.affectedRows ?? 0)
    // 3. Drop lock row (cleanup, cegah orphan)
    await dropBludVersion(tx, 'dpa_blud', lockKey)
    await dropBludVersion(tx, 'rekap_pk', lockKey)
  })
  return { dpa_rows: dpaCount, rekap_pk_rows: rekapCount }
}

// ─── PERGESERAN ───────────────────────────────────────────────────────────────

export async function getPergeseranLatestDate(tahun: number): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getPergeseranHistory(tahun: number): Promise<PergeseranHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} GROUP BY versi_tanggal, dpa_versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), dpa_versi_tanggal: toDateStr(r.dpa_versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getPergeseranByDate(tahun: number, versiTanggal: string): Promise<PergeseranBaris[]> {
  const rows = await sql`SELECT * FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normPergeseran)
}

/** L51: get current version utk client baseline pergeseran. */
export async function getPergeseranVersion(tahun: number, versiTanggal: string): Promise<number> {
  return getBludVersion('pergeseran_dpa', bludVersiKey(tahun, versiTanggal))
}

const PERGESERAN_COLUMNS = [
  'tahun_anggaran', 'versi_tanggal', 'dpa_versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan',
  'harga', 'jumlah', 'vol_p', 'harga_p', 'pergeseran', 'bertambah_berkurang',
  'tipe_baris', 'row_id', 'anggaran_key', 'parent_id', 'urutan',
]

export async function savePergeseran(
  tahun: number,
  versiTanggal: string,
  dpaVersiTanggal: string,
  rows: PergeseranBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length
  const lockKey = bludVersiKey(tahun, versiTanggal)

  if (!incoming) {
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'pergeseran_dpa', lockKey, expectedVersion)
        await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'pergeseran_dpa', lockKey, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1 }
    }
    return { existing, replaced: 0, newVersion: expectedVersion }
  }

  const values = rows.map(r => [
    tahun, versiTanggal, dpaVersiTanggal, r.kode_rekening, r.uraian, r.vol ?? null,
    r.satuan ?? null, r.harga ?? null, r.jumlah, r.vol_p ?? null, r.harga_p ?? null,
    r.pergeseran, r.bertambah_berkurang, r.tipe_baris, r.row_id,
    ensureAnggaranKey(r.anggaran_key), r.parent_id ?? null,
    r.urutan,
  ])
  let existing = 0
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'pergeseran_dpa', lockKey, expectedVersion)
    // B-NEW-3 threshold di dalam tx (audit DPA 2026-06-11 B-3)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('pergeseran_dpa', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await periksaJangkar(tx, 'pergeseran_dpa', tahun, rows)
    await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
    await bulkInsert('pergeseran_dpa', PERGESERAN_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'pergeseran_dpa', lockKey, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}

/**
 * Hapus seluruh versi Pergeseran. Standalone (tidak ada FK turunan).
 * Returns jumlah baris terhapus. Throw kalau versi tidak ada.
 */
export async function deletePergeseranVersi(tahun: number, versiTanggal: string): Promise<{
  pergeseran_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi Pergeseran ${tahun}/${versiTanggal} tidak ditemukan`)
  }
  const lockKey = bludVersiKey(tahun, versiTanggal)
  let count = 0
  await withTransaction(async ({ tx }) => {
    // L53: tx wrapper return Array<{affectedRows}>, akses lewat [0].
    const res = await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    count = Number(res[0]?.affectedRows ?? 0)
    await dropBludVersion(tx, 'pergeseran_dpa', lockKey)
  })
  return { pergeseran_rows: count }
}
