import { sql, bulkInsert, withTransaction } from './db';

export type SumberSSK = 'GAJI' | 'BLUD' | 'HARLEP' | 'PROMKES' | 'SARPRAS' | 'OBAT' | 'PEMELIHARAAN' | 'PEMBANGUNAN';
export type MasterTipe = 'program' | 'kegiatan' | 'subkegiatan' | 'uraian_ssk' | 'sumber_anggaran';

export const SUMBER_LIST: SumberSSK[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN'];
export const MONTHS_KEYS = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const;
export type MonthKey = typeof MONTHS_KEYS[number];

export type SskMonths = Record<MonthKey, number>;

export interface MasterRow {
  id: number;
  tahun: string;
  tipe: MasterTipe;
  sumber: SumberSSK | null;
  nama: string;
  program_ref: string | null;      // kegiatan, subkegiatan, uraian_ssk
  kegiatan_ref: string | null;     // subkegiatan, uraian_ssk
  subkegiatan_ref: string | null;  // uraian_ssk
  urut: number;
}

export interface RekeningRow {
  id: number;
  tahun: string;
  sumber: SumberSSK;
  uraian: string;
  uraian_ssk: string | null;
  sumber_anggaran: string | null;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
  urut: number;
}

export interface SskRow {
  id: number;
  tahun: string;
  sumber: SumberSSK;
  uraian_ssk: string;
  uraian: string;
  program: string;
  kegiatan: string;
  subkegiatan: string;
  pagu: number;
  months: SskMonths;
  months_pct: SskMonths;
  total: number;
  total_pct: number;
  urut: number;
}

export function emptyMonths(): SskMonths {
  return { jan:0, feb:0, mar:0, apr:0, mei:0, jun:0, jul:0, agu:0, sep:0, okt:0, nov:0, des:0 };
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (!v) return fallback;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(v as string) as T; } catch { return fallback; }
}

// ─── Master ──────────────────────────────────────────────────────────────────

// _sumber param sengaja unused: API signature kompat, dipakai di sibling getMasterByTipe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getMasterRows(tahun: string, tipe: MasterTipe, _sumber?: SumberSSK | null) {
  return await sql`
    SELECT id, tahun, tipe, sumber, nama, program_ref, kegiatan_ref, subkegiatan_ref, urut
    FROM kinerja_master
    WHERE tahun = ${tahun} AND tipe = ${tipe}
    ORDER BY urut, nama
  ` as MasterRow[];
}

export async function createMasterRow(
  tahun: string, tipe: MasterTipe, nama: string, sumber: SumberSSK | null, userId: number,
  programRef?: string | null, kegiatanRef?: string | null, subkegiatanRef?: string | null
) {
  const [mx] = await sql`
    SELECT COALESCE(MAX(urut), 0) + 1 AS next
    FROM kinerja_master WHERE tahun = ${tahun} AND tipe = ${tipe}
  ` as { next: number }[];
  const urut = Number(mx?.next ?? 1);
  const pRef = (['kegiatan','subkegiatan','uraian_ssk'].includes(tipe) && programRef) ? programRef : null;
  const kRef = (['subkegiatan','uraian_ssk'].includes(tipe) && kegiatanRef) ? kegiatanRef : null;
  const sRef = (tipe === 'uraian_ssk' && subkegiatanRef) ? subkegiatanRef : null;
  const [r] = await sql`
    INSERT INTO kinerja_master (tahun, tipe, sumber, nama, program_ref, kegiatan_ref, subkegiatan_ref, urut, created_by)
    VALUES (${tahun}, ${tipe}, ${sumber}, ${nama}, ${pRef}, ${kRef}, ${sRef}, ${urut}, ${userId})
  ` as { insertId: number }[];
  return r?.insertId;
}

export async function updateMasterRow(id: number, nama: string) {
  await sql`UPDATE kinerja_master SET nama = ${nama} WHERE id = ${id}`;
}

export async function deleteMasterRow(id: number) {
  await sql`DELETE FROM kinerja_master WHERE id = ${id}`;
}

// ─── Init Renaksi → Master ──────────────────────────────────────────────────
// Ambil distinct program/kegiatan/sub_kegiatan dari rencana_aksi tahun X,
// dedup vs kinerja_master existing (key: tipe+nama_lower+program_ref+kegiatan_ref),
// insert urut: program → kegiatan → subkegiatan dalam 1 transaksi (parent ref aman).
// Dry-run: tidak insert, hanya return count "akan diinsert" — untuk modal preview.

export interface InitRenaksiResult {
  raTotal: number;
  programInserted: number;
  programSkipped: number;
  kegiatanInserted: number;
  kegiatanSkipped: number;
  subkegiatanInserted: number;
  subkegiatanSkipped: number;
}

export async function initMasterFromRenaksi(
  tahun: string,
  userId: number,
  dry: boolean = false,
): Promise<InitRenaksiResult> {
  const tahunNum = Number(tahun);
  const raRows = await sql`
    SELECT level, program, kegiatan, sub_kegiatan
    FROM rencana_aksi
    WHERE tahun = ${tahunNum} AND level IN ('program','kegiatan','sub-kegiatan')
  ` as { level: string; program: string; kegiatan: string | null; sub_kegiatan: string | null }[];

  const existing = await sql`
    SELECT tipe, nama, program_ref, kegiatan_ref
    FROM kinerja_master
    WHERE tahun = ${tahun} AND tipe IN ('program','kegiatan','subkegiatan')
  ` as { tipe: string; nama: string; program_ref: string | null; kegiatan_ref: string | null }[];

  const keyOf = (tipe: string, nama: string, pRef: string | null, kRef: string | null) =>
    `${tipe}|${nama.trim().toLowerCase()}|${pRef ?? ''}|${kRef ?? ''}`;
  const existSet = new Set(existing.map(e => keyOf(e.tipe, e.nama, e.program_ref, e.kegiatan_ref)));

  const programSet = new Set<string>();
  const kegiatanMap = new Map<string, { nama: string; program_ref: string }>();
  const subkegMap = new Map<string, { nama: string; program_ref: string; kegiatan_ref: string }>();

  for (const r of raRows) {
    const prog = r.program?.trim();
    const keg = r.kegiatan?.trim() ?? '';
    const sub = r.sub_kegiatan?.trim() ?? '';
    if (r.level === 'program' && prog) {
      programSet.add(prog);
    } else if (r.level === 'kegiatan' && prog && keg) {
      const k = `${keg.toLowerCase()}|${prog.toLowerCase()}`;
      if (!kegiatanMap.has(k)) kegiatanMap.set(k, { nama: keg, program_ref: prog });
    } else if (r.level === 'sub-kegiatan' && prog && keg && sub) {
      const k = `${sub.toLowerCase()}|${prog.toLowerCase()}|${keg.toLowerCase()}`;
      if (!subkegMap.has(k)) subkegMap.set(k, { nama: sub, program_ref: prog, kegiatan_ref: keg });
    }
  }

  const programsToInsert = [...programSet].filter(p => !existSet.has(keyOf('program', p, null, null)));
  const kegiatansToInsert = [...kegiatanMap.values()].filter(k => !existSet.has(keyOf('kegiatan', k.nama, k.program_ref, null)));
  const subkegsToInsert = [...subkegMap.values()].filter(s => !existSet.has(keyOf('subkegiatan', s.nama, s.program_ref, s.kegiatan_ref)));

  const result: InitRenaksiResult = {
    raTotal: raRows.length,
    programInserted: programsToInsert.length,
    programSkipped: programSet.size - programsToInsert.length,
    kegiatanInserted: kegiatansToInsert.length,
    kegiatanSkipped: kegiatanMap.size - kegiatansToInsert.length,
    subkegiatanInserted: subkegsToInsert.length,
    subkegiatanSkipped: subkegMap.size - subkegsToInsert.length,
  };

  if (dry) return result;

  const cols = ['tahun','tipe','sumber','nama','program_ref','kegiatan_ref','subkegiatan_ref','urut','created_by'];

  await withTransaction(async ({ tx, conn }) => {
    const [pUrut] = await tx`SELECT COALESCE(MAX(urut),0) AS m FROM kinerja_master WHERE tahun = ${tahun} AND tipe = 'program'` as { m: number }[];
    const [kUrut] = await tx`SELECT COALESCE(MAX(urut),0) AS m FROM kinerja_master WHERE tahun = ${tahun} AND tipe = 'kegiatan'` as { m: number }[];
    const [sUrut] = await tx`SELECT COALESCE(MAX(urut),0) AS m FROM kinerja_master WHERE tahun = ${tahun} AND tipe = 'subkegiatan'` as { m: number }[];
    let pStart = Number(pUrut?.m ?? 0);
    let kStart = Number(kUrut?.m ?? 0);
    let sStart = Number(sUrut?.m ?? 0);

    if (programsToInsert.length > 0) {
      const rows = programsToInsert.map(p => [tahun, 'program', null, p, null, null, null, ++pStart, userId]);
      await bulkInsert('kinerja_master', cols, rows, conn);
    }
    if (kegiatansToInsert.length > 0) {
      const rows = kegiatansToInsert.map(k => [tahun, 'kegiatan', null, k.nama, k.program_ref, null, null, ++kStart, userId]);
      await bulkInsert('kinerja_master', cols, rows, conn);
    }
    if (subkegsToInsert.length > 0) {
      const rows = subkegsToInsert.map(s => [tahun, 'subkegiatan', null, s.nama, s.program_ref, s.kegiatan_ref, null, ++sStart, userId]);
      await bulkInsert('kinerja_master', cols, rows, conn);
    }
  });

  return result;
}

// ─── Rekening ─────────────────────────────────────────────────────────────────

export async function getRekeningRows(tahun: string, sumber: SumberSSK) {
  return await sql`
    SELECT id, tahun, sumber, uraian, uraian_ssk, sumber_anggaran,
           program, kegiatan, subkegiatan, urut
    FROM kinerja_rekening
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    ORDER BY urut
  ` as RekeningRow[];
}

export async function saveRekeningBatch(
  tahun: string,
  sumber: SumberSSK,
  rows: Pick<RekeningRow, 'uraian' | 'uraian_ssk' | 'sumber_anggaran' | 'program' | 'kegiatan' | 'subkegiatan'>[],
  userId: number
) {
  // PERF-C1: DELETE + bulk INSERT dalam transaction (atomicity + 1 round-trip)
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM kinerja_rekening WHERE tahun = ${tahun} AND sumber = ${sumber}`;
    if (rows.length === 0) return;
    const values = rows.map((r, i) => [
      tahun, sumber, r.uraian, r.uraian_ssk ?? null, r.sumber_anggaran ?? null,
      r.program ?? null, r.kegiatan ?? null, r.subkegiatan ?? null, i + 1, userId, userId,
    ]);
    await bulkInsert(
      'kinerja_rekening',
      ['tahun','sumber','uraian','uraian_ssk','sumber_anggaran','program','kegiatan','subkegiatan','urut','created_by','updated_by'],
      values,
      conn,
    );
  });
}

// ─── SSK ──────────────────────────────────────────────────────────────────────

export async function getSskRows(
  tahun: string,
  sumber: SumberSSK,
  versiTipe: 'MURNI' | 'PERUBAHAN' = 'MURNI',
  versiSeq: number = 0,
): Promise<SskRow[]> {
  // Refactor Versi (Checkpoint C): filter by versi_tipe + versi_seq.
  // Default MURNI seq=0 untuk backwards-compat.
  const raw = await sql`
    SELECT id, tahun, sumber, uraian_ssk, uraian,
           COALESCE(program,'') AS program, COALESCE(kegiatan,'') AS kegiatan, COALESCE(subkegiatan,'') AS subkegiatan,
           pagu, months, months_pct, total, total_pct, urut,
           canonical_id, versi_tipe, versi_seq, is_nullified, locked_at
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
      AND versi_tipe = ${versiTipe} AND versi_seq = ${versiSeq}
    ORDER BY urut
  ` as (Omit<SskRow, 'months' | 'months_pct' | 'pagu' | 'total' | 'total_pct'> & {
    months: unknown; months_pct: unknown; pagu: unknown; total: unknown; total_pct: unknown;
    canonical_id?: unknown; versi_tipe?: unknown; versi_seq?: unknown;
    is_nullified?: unknown; locked_at?: unknown;
  })[];

  return raw.map(r => ({
    ...r,
    pagu:         Number(r.pagu ?? 0),
    total:        Number(r.total ?? 0),
    total_pct:    Number(r.total_pct ?? 0),
    months:       parseJson<SskMonths>(r.months, emptyMonths()),
    months_pct:   parseJson<SskMonths>(r.months_pct, emptyMonths()),
    canonical_id: String(r.canonical_id ?? ''),
    versi_tipe:   (r.versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI') as 'MURNI'|'PERUBAHAN',
    versi_seq:    Number(r.versi_seq ?? 0),
    is_nullified: Number(r.is_nullified ?? 0) === 1,
    locked_at:    r.locked_at ? String(r.locked_at) : null,
  } as SskRow));
}

// V3-6: optimistic version lock untuk Kinerja whole-replace (DELETE+INSERT).
// Reuse tabel generik `blud_locks` (entity+key_id+version) — pola L51, tanpa migration baru.
export class KinerjaVersionConflictError extends Error {
  constructor(public expected: number, public actual: number) {
    super('Data Kinerja sudah diubah pengguna lain. Memuat versi terbaru.');
    this.name = 'KinerjaVersionConflictError';
  }
}
export async function getKinerjaVersion(entity: string, keyId: string): Promise<number> {
  const rows = await sql`SELECT version FROM blud_locks WHERE entity = ${entity} AND key_id = ${keyId} LIMIT 1` as { version?: unknown }[];
  return Number(rows[0]?.version ?? 0);
}

export async function saveSskBatch(
  tahun: string,
  sumber: SumberSSK,
  rows: (Omit<SskRow, 'id' | 'tahun' | 'sumber'> & { canonical_id?: string; is_nullified?: boolean })[],
  userId: number,
  versiTipe: 'MURNI' | 'PERUBAHAN' = 'MURNI',
  versiSeq: number = 0,
  expectedVersion?: number,
) {
  // PERF-C1: DELETE + bulk INSERT atomic (1 round-trip).
  // Refactor Versi (Checkpoint C): scope DELETE & INSERT per (versi_tipe, versi_seq) — versi
  // lain TIDAK ke-touch. Generate canonical_id baru kalau row tidak punya.

  // Cek versi locked dulu (defense)
  const lockRows = await sql`
    SELECT MAX(locked_at) AS locked_at FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
      AND versi_tipe = ${versiTipe} AND versi_seq = ${versiSeq}
  ` as { locked_at: unknown }[];
  if (lockRows[0]?.locked_at) {
    throw new Error(`Versi ${versiTipe}-${versiSeq} sudah dikunci, tidak bisa diubah.`);
  }

  const lockEntity = 'kinerja_ssk';
  const lockKey = `${tahun}:${sumber}:${versiTipe}:${versiSeq}`;

  await withTransaction(async ({ tx, conn }) => {
    // V3-6: optimistic lock — assert expected version (FOR UPDATE) sebelum mutate, bump sesudah.
    if (expectedVersion !== undefined) {
      const vrows = await tx`
        SELECT version FROM blud_locks WHERE entity = ${lockEntity} AND key_id = ${lockKey} FOR UPDATE
      ` as { version?: unknown }[];
      const current = Number(vrows[0]?.version ?? 0);
      if (current !== expectedVersion) throw new KinerjaVersionConflictError(expectedVersion, current);
    }

    await tx`
      DELETE FROM kinerja_ssk
      WHERE tahun = ${tahun} AND sumber = ${sumber}
        AND versi_tipe = ${versiTipe} AND versi_seq = ${versiSeq}
    `;
    if (rows.length > 0) {
      // #8: canonical_id anti-tabrakan — timestamp base36 + suffix acak kripto
      // (generator lama Date.now()%100000 bersiklus ~100 detik → dua sesi simpan
      // bisa kembar → realisasi ter-link ke SSK salah). Max 17 char (VARCHAR(20)).
      const values = rows.map((r, i) => {
        const canonical = r.canonical_id && r.canonical_id.length > 0
          ? r.canonical_id
          : `K-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
        return [
          tahun, sumber,
          versiTipe, versiSeq, canonical, /* parent_versi_id */ null, /* is_nullified */ r.is_nullified ? 1 : 0,
          r.uraian_ssk, r.uraian,
          r.program ?? '', r.kegiatan ?? '', r.subkegiatan ?? '',
          r.pagu, JSON.stringify(r.months), JSON.stringify(r.months_pct),
          r.total, r.total_pct, i + 1, userId,
        ];
      });
      await bulkInsert(
        'kinerja_ssk',
        ['tahun','sumber',
         'versi_tipe','versi_seq','canonical_id','parent_versi_id','is_nullified',
         'uraian_ssk','uraian','program','kegiatan','subkegiatan',
         'pagu','months','months_pct','total','total_pct','urut','updated_by'],
        values,
        conn,
      );
    }
    if (expectedVersion !== undefined) {
      await tx`
        INSERT INTO blud_locks (entity, key_id, version, updated_by)
        VALUES (${lockEntity}, ${lockKey}, 1, ${userId})
        ON DUPLICATE KEY UPDATE version = version + 1, updated_by = ${userId}
      `;
    }
  });
}

// ─── Realisasi Nomen ──────────────────────────────────────────────────────────

export interface NomenRow {
  id: number;
  tahun: string;
  sumber: SumberSSK;
  urut: number;
  keterangan: string;
}

export async function getNomenRows(tahun: string, sumber: SumberSSK): Promise<NomenRow[]> {
  return await sql`
    SELECT id, tahun, sumber, urut, keterangan
    FROM kinerja_realisasi_nomen
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    ORDER BY urut
  ` as NomenRow[];
}

export async function saveNomenBatch(
  tahun: string,
  sumber: SumberSSK,
  rows: Pick<NomenRow, 'keterangan'>[],
  userId: number
) {
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM kinerja_realisasi_nomen WHERE tahun = ${tahun} AND sumber = ${sumber}`;
    if (rows.length === 0) return;
    const values = rows.map((r, i) => [tahun, sumber, i + 1, r.keterangan, userId]);
    await bulkInsert(
      'kinerja_realisasi_nomen',
      ['tahun','sumber','urut','keterangan','updated_by'],
      values,
      conn,
    );
  });
}

// ─── Realisasi ────────────────────────────────────────────────────────────────

export interface RealRow {
  id: number;
  tahun: string;
  sumber: SumberSSK;
  bulan: number;
  keterangan: string;
  program: string;
  kegiatan: string;
  subkegiatan: string;
  uraian_ssk: string;
  pagu_awal: number;
  target_fisik: number;
  real_fisik: number;
  pct_fisik: number;
  akum_target_fisik: number;
  akum_real_fisik: number;
  akum_pct_fisik: number;
  real_keuangan: number;
  pct_keuangan: number;
  akum_keuangan: number;
  akum_pct_keuangan: number;
  deviasi_fisik: number;
  deviasi_keuangan: number;
}

/**
 * Checkpoint D: kolom turunan di-DROP, sekarang semua derived (pagu_awal, target_fisik,
 * pct_*, akum_*, deviasi_*) dihitung dari real_fisik + real_keuangan + SSK lookup
 * via recalcAllRealisasiServer. Default versi MURNI seq=0 untuk backwards-compat.
 */
export async function getRealisasiRows(tahun: string, sumber: SumberSSK): Promise<RealRow[]> {
  const hydrated = await getRealisasiHydrated(tahun, sumber, 'MURNI', 0);
  return hydrated.map((r, i) => ({
    id:                i + 1, // identitas runtime — DB id tidak di-expose ke client lewat path lama
    tahun,
    sumber,
    bulan:             r.bulan,
    ssk_canonical_id:  r.ssk_canonical_id,
    ssk_versi_tipe:    r.ssk_versi_tipe,
    ssk_versi_seq:     r.ssk_versi_seq,
    keterangan:        r.keterangan,
    program:           r.program ?? '',
    kegiatan:          r.kegiatan ?? '',
    subkegiatan:       r.subkegiatan ?? '',
    uraian_ssk:        r.uraian_ssk ?? '',
    pagu_awal:         r.pagu_awal,
    target_fisik:      r.target_fisik,
    real_fisik:        r.real_fisik,
    pct_fisik:         r.pct_fisik,
    akum_target_fisik: r.akum_target_fisik,
    akum_real_fisik:   r.akum_real_fisik,
    akum_pct_fisik:    r.akum_pct_fisik,
    real_keuangan:     r.real_keuangan,
    pct_keuangan:      r.pct_keuangan,
    akum_keuangan:     r.akum_keuangan,
    akum_pct_keuangan: r.akum_pct_keuangan,
    deviasi_fisik:     r.deviasi_fisik,
    deviasi_keuangan:  r.deviasi_keuangan,
  }));
}

/**
 * Refactor Versi — Checkpoint A Task #12.
 * Get Realisasi rows + hydrate kolom turunan dari SSK versi aktif.
 *
 * Hanya butuh field input persisten + identitas dari `kinerja_realisasi`,
 * pagu & target_fisik diambil dari `kinerja_ssk` versi (tipe, seq) lalu
 * akum/deviasi dihitung via lib/data/kinerja-calc.ts (formula 1:1 dgn UI lama).
 *
 * Default versi: MURNI seq=0 (kompatibel dgn data pre-refactor).
 */
export async function getRealisasiHydrated(
  tahun: string,
  sumber: SumberSSK,
  versiTipe: 'MURNI' | 'PERUBAHAN' = 'MURNI',
  versiSeq: number = 0,
): Promise<import('./kinerja-calc').RealRowHydrated[]> {
  const { recalcAllRealisasiServer } = await import('./kinerja-calc');
  const [realRaw, sskRaw] = await Promise.all([
    sql`
      SELECT bulan,
             COALESCE(keterangan,'') AS keterangan,
             COALESCE(uraian_ssk,'') AS uraian_ssk,
             COALESCE(program,'') AS program,
             COALESCE(kegiatan,'') AS kegiatan,
             COALESCE(subkegiatan,'') AS subkegiatan,
             COALESCE(ssk_canonical_id,'') AS ssk_canonical_id,
             COALESCE(ssk_versi_tipe,'MURNI') AS ssk_versi_tipe,
             COALESCE(ssk_versi_seq,0) AS ssk_versi_seq,
             real_fisik, real_keuangan
      FROM kinerja_realisasi
      WHERE tahun = ${tahun} AND sumber = ${sumber}
      ORDER BY bulan, id
    ` as unknown as Promise<Record<string, unknown>[]>,
    sql`
      SELECT canonical_id, pagu, months_pct
      FROM kinerja_ssk
      WHERE tahun = ${tahun} AND sumber = ${sumber}
        AND versi_tipe = ${versiTipe} AND versi_seq = ${versiSeq}
        AND is_nullified = FALSE
    ` as unknown as Promise<Record<string, unknown>[]>,
  ]);

  // Build SSK lookup map by canonical_id
  const sskByCanonical = new Map<string, { pagu: number; months_pct: SskMonths | null }>();
  for (const s of sskRaw) {
    const cid = String(s.canonical_id ?? '');
    if (!cid) continue;
    sskByCanonical.set(cid, {
      pagu: Number(s.pagu ?? 0),
      months_pct: parseJson<SskMonths>(s.months_pct, emptyMonths()),
    });
  }

  // Map raw → RealRowRaw shape expected by recalc
  const realRows = realRaw.map(r => ({
    bulan:                 Number(r.bulan ?? 1),
    keterangan:            String(r.keterangan ?? ''),
    uraian_ssk:            String(r.uraian_ssk ?? ''),
    program:               String(r.program ?? ''),
    kegiatan:              String(r.kegiatan ?? ''),
    subkegiatan:           String(r.subkegiatan ?? ''),
    ssk_canonical_id:      String(r.ssk_canonical_id ?? ''),
    ssk_versi_tipe:        (r.ssk_versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI') as 'MURNI'|'PERUBAHAN',
    ssk_versi_seq:         Number(r.ssk_versi_seq ?? 0),
    real_fisik:            Number(r.real_fisik ?? 0),
    real_keuangan:         Number(r.real_keuangan ?? 0),
  }));

  return recalcAllRealisasiServer(realRows, { sskByCanonical });
}

export async function saveRealisasiBatch(
  tahun: string,
  sumber: SumberSSK,
  rows: (Omit<RealRow, 'id' | 'tahun' | 'sumber'> & {
    ssk_canonical_id?: string;
    ssk_versi_tipe?: 'MURNI' | 'PERUBAHAN';
    ssk_versi_seq?: number;
  })[],
  userId: number,
  expectedVersion?: number,
) {
  // PERF-C1: DELETE + bulk INSERT atomic.
  // Refactor Versi (Checkpoint C fix): WAJIB include ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq
  // di INSERT — kalau tidak, save akan wipe linkage ke SSK → semua kolom turunan jadi 0.
  const lockEntity = 'kinerja_realisasi';
  const lockKey = `${tahun}:${sumber}`;
  await withTransaction(async ({ tx, conn }) => {
    // V3-6: optimistic lock (reuse blud_locks, pola L51).
    if (expectedVersion !== undefined) {
      const vrows = await tx`
        SELECT version FROM blud_locks WHERE entity = ${lockEntity} AND key_id = ${lockKey} FOR UPDATE
      ` as { version?: unknown }[];
      const current = Number(vrows[0]?.version ?? 0);
      if (current !== expectedVersion) throw new KinerjaVersionConflictError(expectedVersion, current);
    }
    await tx`DELETE FROM kinerja_realisasi WHERE tahun = ${tahun} AND sumber = ${sumber}`;
    if (expectedVersion !== undefined) {
      await tx`
        INSERT INTO blud_locks (entity, key_id, version, updated_by)
        VALUES (${lockEntity}, ${lockKey}, 1, ${userId})
        ON DUPLICATE KEY UPDATE version = version + 1, updated_by = ${userId}
      `;
    }
    if (rows.length === 0) return;
    // Checkpoint D: kolom turunan sudah di-DROP. INSERT cuma input persisten + identitas.
    const values = rows.map(r => [
      tahun, sumber, r.bulan,
      r.ssk_canonical_id ?? '',
      r.ssk_versi_tipe ?? 'MURNI',
      r.ssk_versi_seq ?? 0,
      r.keterangan,
      r.program ?? '', r.kegiatan ?? '', r.subkegiatan ?? '', r.uraian_ssk ?? '',
      r.real_fisik, r.real_keuangan, userId,
    ]);
    await bulkInsert(
      'kinerja_realisasi',
      ['tahun','sumber','bulan',
       'ssk_canonical_id','ssk_versi_tipe','ssk_versi_seq',
       'keterangan','program','kegiatan','subkegiatan','uraian_ssk',
       'real_fisik','real_keuangan','updated_by'],
      values,
      conn,
    );
  });
}

// ─── Pendapatan CRR ───────────────────────────────────────────────────────────

export interface CrrRow {
  id: number;
  tahun: string;
  bulan_ke: number;
  bulan: string;
  pendapatan: number;
  belanja_blud: number;
  belanja_daerah: number;
  pendapatan_sd: number;
  belanja_blud_sd: number;
  belanja_daerah_sd: number;
  crr_parsial_pct: number;
  crr_total_pct: number;
}

export const BULAN_LABELS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export async function getCrrRows(tahun: string): Promise<CrrRow[]> {
  const raw = await sql`
    SELECT id, tahun, bulan_ke, bulan, pendapatan, belanja_blud, belanja_daerah,
           pendapatan_sd, belanja_blud_sd, belanja_daerah_sd,
           crr_parsial_pct, crr_total_pct
    FROM kinerja_pendapatan_crr
    WHERE tahun = ${tahun}
    ORDER BY bulan_ke
  ` as Record<string, unknown>[];

  return raw.map(r => ({
    id:                Number(r.id ?? 0),
    tahun:             String(r.tahun ?? tahun),
    bulan_ke:          Number(r.bulan_ke ?? 0),
    bulan:             String(r.bulan ?? ''),
    pendapatan:        Number(r.pendapatan ?? 0),
    belanja_blud:      Number(r.belanja_blud ?? 0),
    belanja_daerah:    Number(r.belanja_daerah ?? 0),
    pendapatan_sd:     Number(r.pendapatan_sd ?? 0),
    belanja_blud_sd:   Number(r.belanja_blud_sd ?? 0),
    belanja_daerah_sd: Number(r.belanja_daerah_sd ?? 0),
    crr_parsial_pct:   Number(r.crr_parsial_pct ?? 0),
    crr_total_pct:     Number(r.crr_total_pct ?? 0),
  }));
}

export async function saveCrrBatch(
  tahun: string,
  rows: Omit<CrrRow, 'id' | 'tahun'>[],
  userId: number
) {
  // C-BUG-1 (audit Tahap 12): refactor dari loop INSERT non-atomic ke
  // withTransaction + DELETE + bulkInsert (konsisten dengan saveSskBatch,
  // saveRekeningBatch, saveNomenBatch, saveRealisasiBatch, savePendapatanBatch).
  // Jika crash di tengah loop sebelumnya, sebagian bulan ter-update, sebagian
  // pakai data lama → inkonsisten total YTD. Sekarang all-or-nothing.
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM kinerja_pendapatan_crr WHERE tahun = ${tahun}`;
    if (rows.length === 0) return;
    const values = rows.map(r => [
      tahun, r.bulan_ke, r.bulan, r.pendapatan, r.belanja_blud, r.belanja_daerah,
      r.pendapatan_sd, r.belanja_blud_sd, r.belanja_daerah_sd,
      r.crr_parsial_pct, r.crr_total_pct, userId,
    ]);
    await bulkInsert(
      'kinerja_pendapatan_crr',
      ['tahun', 'bulan_ke', 'bulan', 'pendapatan', 'belanja_blud', 'belanja_daerah',
       'pendapatan_sd', 'belanja_blud_sd', 'belanja_daerah_sd',
       'crr_parsial_pct', 'crr_total_pct', 'updated_by'],
      values,
      conn,
    );
  });
}

// ─── Pendapatan Realisasi ──────────────────────────────────────────────────────

export interface PendRow {
  id: number;
  tahun: string;
  urut: number;
  keterangan: string;
  target: number;
  realisasi: number;
  capaian_pct: number;
}

export async function getPendapatanRows(tahun: string): Promise<PendRow[]> {
  const raw = await sql`
    SELECT id, tahun, urut, keterangan, target, realisasi, capaian_pct
    FROM kinerja_pendapatan_real
    WHERE tahun = ${tahun}
    ORDER BY urut
  ` as Record<string, unknown>[];

  return raw.map(r => ({
    id:          Number(r.id ?? 0),
    tahun:       String(r.tahun ?? tahun),
    urut:        Number(r.urut ?? 0),
    keterangan:  String(r.keterangan ?? ''),
    target:      Number(r.target ?? 0),
    realisasi:   Number(r.realisasi ?? 0),
    capaian_pct: Number(r.capaian_pct ?? 0),
  }));
}

export async function savePendapatanBatch(
  tahun: string,
  rows: Omit<PendRow, 'id' | 'tahun'>[],
  userId: number
) {
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM kinerja_pendapatan_real WHERE tahun = ${tahun}`;
    if (rows.length === 0) return;
    const values = rows.map((r, i) => [tahun, i + 1, r.keterangan, r.target, r.realisasi, r.capaian_pct, userId]);
    await bulkInsert(
      'kinerja_pendapatan_real',
      ['tahun','urut','keterangan','target','realisasi','capaian_pct','updated_by'],
      values,
      conn,
    );
  });
}

// ─── Laporan Konsolidasi ──────────────────────────────────────────────────────

export interface LaporanTrend {
  bulan: number;
  real_keuangan: number;
  pct_keuangan: number;
  akum_keuangan: number;
  akum_pct_keuangan: number;
  real_fisik: number;
  akum_pct_fisik: number;
}

export interface LaporanSumber {
  sumber: SumberSSK;
  total_pagu: number;
  total_target_fisik: number;
  total_real_keuangan: number;
  total_real_fisik: number;
  pct_serapan: number;
  pct_fisik: number;
  bulan_terakhir: number;
  trend: LaporanTrend[];
}

// #1: agregat pagu/target WAJIB discope ke SATU versi aktif per sumber —
// ssk/perubahan meng-copy seluruh baris (versi_tipe/seq lain) ke tabel yang
// sama; tanpa filter, SUM(pagu) terhitung ganda tiap versi PERUBAHAN dibuat.
// Versi aktif = PERUBAHAN seq tertinggi bila ada, selain itu MURNI seq
// tertinggi. Baris is_nullified dikecualikan (konsisten getRealisasiHydrated).
function pickVersiAktif<T extends { versi_tipe?: unknown; versi_seq?: unknown }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    const rp = r.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    const bp = best.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    if (rp > bp || (rp === bp && Number(r.versi_seq ?? 0) > Number(best.versi_seq ?? 0))) best = r;
  }
  return best;
}

export async function getLaporanData(tahun: string, sumber: SumberSSK): Promise<LaporanSumber> {
  // Pagu & target dari SSK — agregat per versi, lalu pilih versi aktif (#1)
  const sskVersiAgg = await sql`
    SELECT
      versi_tipe, versi_seq,
      COALESCE(SUM(pagu), 0)  AS total_pagu,
      COALESCE(SUM(total), 0) AS total_target_fisik
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber} AND is_nullified = FALSE
    GROUP BY versi_tipe, versi_seq
  ` as Record<string, unknown>[];
  const sskAgg = pickVersiAktif(sskVersiAgg);

  // Realisasi keuangan & fisik total semua bulan
  const [realAgg] = await sql`
    SELECT
      COALESCE(SUM(real_keuangan), 0) AS total_real_keuangan,
      COALESCE(SUM(real_fisik), 0)    AS total_real_fisik,
      COALESCE(MAX(bulan), 0)         AS bulan_terakhir
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND sumber = ${sumber}
  ` as Record<string, unknown>[];

  // Checkpoint D: kolom akum_* di-DROP. Akumulasi dihitung di JS dari SUM real_* per bulan.
  const bulanTerakhir = Number(realAgg?.bulan_terakhir ?? 0);

  // Trend bulanan (1–12) — query cuma SUM real_*, akumulasi di JS
  const trendRaw = await sql`
    SELECT
      bulan,
      COALESCE(SUM(real_keuangan), 0) AS real_keuangan,
      COALESCE(SUM(real_fisik), 0)    AS real_fisik
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    GROUP BY bulan
    ORDER BY bulan
  ` as Record<string, unknown>[];

  const total_pagu          = Number(sskAgg?.total_pagu ?? 0);
  let akumKeu = 0, akumFis = 0;
  const trend: LaporanTrend[] = trendRaw.map(r => {
    const real_keuangan = Number(r.real_keuangan ?? 0);
    const real_fisik    = Number(r.real_fisik ?? 0);
    akumKeu += real_keuangan;
    akumFis += real_fisik;
    return {
      bulan:             Number(r.bulan ?? 0),
      real_keuangan,
      pct_keuangan:      total_pagu > 0 ? Math.round((real_keuangan / total_pagu) * 10000) / 100 : 0,
      akum_keuangan:     akumKeu,
      akum_pct_keuangan: total_pagu > 0 ? Math.round((akumKeu / total_pagu) * 10000) / 100 : 0,
      real_fisik,
      akum_pct_fisik:    total_pagu > 0 ? Math.round((akumFis / total_pagu) * 10000) / 100 : 0,
    };
  });

  // pct_fisik = akum_pct_fisik di bulan terakhir (dari trend, sudah dihitung)
  const pct_fisik = trend.length > 0 ? trend[trend.length - 1].akum_pct_fisik : 0;

  const total_real_keuangan = Number(realAgg?.total_real_keuangan ?? 0);
  const pct_serapan         = total_pagu > 0 ? Math.round((total_real_keuangan / total_pagu) * 10000) / 100 : 0;

  return {
    sumber,
    total_pagu,
    total_target_fisik: Number(sskAgg?.total_target_fisik ?? 0),
    total_real_keuangan,
    total_real_fisik:   Number(realAgg?.total_real_fisik ?? 0),
    pct_serapan,
    pct_fisik,
    bulan_terakhir:     bulanTerakhir,
    trend,
  };
}

/**
 * C-PERF-1 (audit Tahap 12): getLaporanSemua N+1 fix.
 *
 * Sebelumnya: Promise.all(SUMBER_LIST.map(s => getLaporanData(tahun, s)))
 *   → 5 sumber × 4 query = 20 round-trip ke DB.
 * Sekarang: 4 aggregate query dengan GROUP BY sumber → 4 round-trip total,
 *   independen jumlah sumber. ~5× lebih cepat untuk endpoint /api/kinerja/laporan
 *   tanpa filter sumber.
 */
export async function getLaporanSemua(tahun: string): Promise<LaporanSumber[]> {
  // Query 1: agregat SSK per sumber+versi → pilih versi aktif per sumber (#1)
  const sskRows = await sql`
    SELECT
      sumber, versi_tipe, versi_seq,
      COALESCE(SUM(pagu), 0)  AS total_pagu,
      COALESCE(SUM(total), 0) AS total_target_fisik
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND is_nullified = FALSE
    GROUP BY sumber, versi_tipe, versi_seq
  ` as Record<string, unknown>[];

  // Query 2: agregat realisasi per sumber (SUM + bulan_terakhir)
  const realRows = await sql`
    SELECT
      sumber,
      COALESCE(SUM(real_keuangan), 0) AS total_real_keuangan,
      COALESCE(SUM(real_fisik), 0)    AS total_real_fisik,
      COALESCE(MAX(bulan), 0)         AS bulan_terakhir
    FROM kinerja_realisasi
    WHERE tahun = ${tahun}
    GROUP BY sumber
  ` as Record<string, unknown>[];

  // Checkpoint D: Query 3 (pctRows) tidak dibutuhkan lagi — pct_fisik / pct_keuangan
  // diturunkan dari trend di JS (akumulasi running total). Hemat 1 round-trip.

  // Query 4 (lama 3): trend bulanan per sumber — cuma SUM real_*, akumulasi di JS
  const trendRows = await sql`
    SELECT
      sumber,
      bulan,
      COALESCE(SUM(real_keuangan), 0) AS real_keuangan,
      COALESCE(SUM(real_fisik), 0)    AS real_fisik
    FROM kinerja_realisasi
    WHERE tahun = ${tahun}
    GROUP BY sumber, bulan
    ORDER BY sumber, bulan
  ` as Record<string, unknown>[];

  // Index hasil per sumber untuk lookup O(1) — pilih versi aktif per sumber (#1)
  const sskVersiBySumber = new Map<string, Record<string, unknown>[]>();
  for (const r of sskRows) {
    const key = String(r.sumber);
    if (!sskVersiBySumber.has(key)) sskVersiBySumber.set(key, []);
    sskVersiBySumber.get(key)!.push(r);
  }
  const sskBySumber = new Map<string, { total_pagu: number; total_target_fisik: number }>();
  for (const [key, list] of sskVersiBySumber) {
    const aktif = pickVersiAktif(list);
    sskBySumber.set(key, {
      total_pagu:         Number(aktif?.total_pagu ?? 0),
      total_target_fisik: Number(aktif?.total_target_fisik ?? 0),
    });
  }
  const realBySumber = new Map<string, { total_real_keuangan: number; total_real_fisik: number; bulan_terakhir: number }>();
  for (const r of realRows) {
    realBySumber.set(String(r.sumber), {
      total_real_keuangan: Number(r.total_real_keuangan ?? 0),
      total_real_fisik:    Number(r.total_real_fisik ?? 0),
      bulan_terakhir:      Number(r.bulan_terakhir ?? 0),
    });
  }
  // Checkpoint D: trendBySumber populate dengan akumulasi running-total di JS.
  // Rows sudah ORDER BY sumber, bulan — reset akumulator setiap ganti sumber.
  const trendBySumber = new Map<string, LaporanTrend[]>();
  let curSumber = '';
  let akumKeu = 0, akumFis = 0;
  for (const r of trendRows) {
    const key = String(r.sumber);
    if (key !== curSumber) { curSumber = key; akumKeu = 0; akumFis = 0; }
    const list = trendBySumber.get(key) ?? [];
    const total_pagu_sumber = sskBySumber.get(key)?.total_pagu ?? 0;
    const real_keuangan = Number(r.real_keuangan ?? 0);
    const real_fisik    = Number(r.real_fisik ?? 0);
    akumKeu += real_keuangan;
    akumFis += real_fisik;
    list.push({
      bulan:             Number(r.bulan ?? 0),
      real_keuangan,
      pct_keuangan:      total_pagu_sumber > 0 ? Math.round((real_keuangan / total_pagu_sumber) * 10000) / 100 : 0,
      akum_keuangan:     akumKeu,
      akum_pct_keuangan: total_pagu_sumber > 0 ? Math.round((akumKeu / total_pagu_sumber) * 10000) / 100 : 0,
      real_fisik,
      akum_pct_fisik:    total_pagu_sumber > 0 ? Math.round((akumFis / total_pagu_sumber) * 10000) / 100 : 0,
    });
    trendBySumber.set(key, list);
  }

  // Assemble per sumber — pastikan urutan sama dengan SUMBER_LIST (deterministic)
  return SUMBER_LIST.map(sumber => {
    const ssk = sskBySumber.get(sumber) ?? { total_pagu: 0, total_target_fisik: 0 };
    const real = realBySumber.get(sumber) ?? { total_real_keuangan: 0, total_real_fisik: 0, bulan_terakhir: 0 };
    const trend = trendBySumber.get(sumber) ?? [];
    const pct_serapan = ssk.total_pagu > 0
      ? Math.round((real.total_real_keuangan / ssk.total_pagu) * 10000) / 100
      : 0;
    // pct_fisik = akum_pct_fisik di bulan terakhir (dari trend, sudah dihitung)
    const pct_fisik = trend.length > 0 ? trend[trend.length - 1].akum_pct_fisik : 0;
    return {
      sumber,
      total_pagu:         ssk.total_pagu,
      total_target_fisik: ssk.total_target_fisik,
      total_real_keuangan: real.total_real_keuangan,
      total_real_fisik:    real.total_real_fisik,
      pct_serapan,
      pct_fisik,
      bulan_terakhir:      real.bulan_terakhir,
      trend,
    };
  });
}

// ─── Dashboard KPI ────────────────────────────────────────────────────────────

export async function getKinerjaKpi(tahun: string) {
  // #1: agregat per sumber+versi → pilih versi aktif per sumber, baru dijumlah.
  // Tanpa ini pagu & jumlah baris terhitung ganda begitu ada versi PERUBAHAN.
  const sskVersiRows = await sql`
    SELECT sumber, versi_tipe, versi_seq,
      COUNT(*) AS total_ssk_rows,
      COALESCE(SUM(pagu), 0) AS pagu
    FROM kinerja_ssk WHERE tahun = ${tahun} AND is_nullified = FALSE
    GROUP BY sumber, versi_tipe, versi_seq
  ` as Record<string, unknown>[];
  const kpiVersiBySumber = new Map<string, Record<string, unknown>[]>();
  for (const r of sskVersiRows) {
    const key = String(r.sumber);
    if (!kpiVersiBySumber.has(key)) kpiVersiBySumber.set(key, []);
    kpiVersiBySumber.get(key)!.push(r);
  }
  const perSumber: { sumber: SumberSSK; pagu: number; rows: number }[] = [];
  for (const [key, list] of kpiVersiBySumber) {
    const aktif = pickVersiAktif(list);
    perSumber.push({
      sumber: key as SumberSSK,
      pagu:   Number(aktif?.pagu ?? 0),
      rows:   Number(aktif?.total_ssk_rows ?? 0),
    });
  }
  const ssk = {
    total_ssk_rows: perSumber.reduce((s, r) => s + r.rows, 0),
    total_pagu:     perSumber.reduce((s, r) => s + r.pagu, 0),
  };

  const [rek] = await sql`
    SELECT COUNT(*) AS total_rekening FROM kinerja_rekening WHERE tahun = ${tahun}
  ` as { total_rekening: unknown }[];

  // Realisasi agregat untuk dashboard
  const [real] = await sql`
    SELECT COALESCE(SUM(real_keuangan), 0) AS total_real_keuangan
    FROM kinerja_realisasi WHERE tahun = ${tahun}
  ` as { total_real_keuangan: unknown }[];

  const total_pagu          = Number(ssk?.total_pagu ?? 0);
  const total_real_keuangan = Number(real?.total_real_keuangan ?? 0);

  return {
    total_pagu,
    total_ssk_rows:      Number(ssk?.total_ssk_rows ?? 0),
    total_rekening:      Number(rek?.total_rekening ?? 0),
    total_real_keuangan,
    pct_serapan: total_pagu > 0 ? Math.round((total_real_keuangan / total_pagu) * 10000) / 100 : 0,
    pagu_per_sumber: Object.fromEntries(
      perSumber.map(r => [r.sumber, Number(r.pagu)])
    ) as Partial<Record<SumberSSK, number>>,
  };
}
