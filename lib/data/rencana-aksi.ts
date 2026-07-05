// ═══ PRIMA — Rencana Aksi Data Layer ═══════════════════════════════════════
// CRUD untuk tabel `rencana_aksi`. Single-table flat (lihat migration 032).
// Optimistic locking via kolom `version` (migration 034): cegah lost-update concurrent edit.

import { sql, queryMany, queryOne } from '@/lib/data/db';
import type { RaLevel, UpsertRencanaAksiInput } from './rencana-aksi-schemas';

export class RaVersionConflictError extends Error {
  constructor() {
    super('Data sudah diubah pengguna lain. Memuat versi terbaru.');
    this.name = 'RaVersionConflictError';
  }
}

// R5: kuartal baris ber-data bulanan = turunan — edit langsung akan ditimpa
// saat simpan bulanan berikutnya, jadi ditolak.
export class RaMonthlyManagedError extends Error {
  constructor() {
    super('Indikator ini memakai data bulanan — angka kuartal dihitung otomatis. Ubah lewat target/realisasi bulanan.');
    this.name = 'RaMonthlyManagedError';
  }
}

// Kunci Periode: realisasi bulan terkunci tidak boleh berubah.
export class RaPeriodLockedError extends Error {
  constructor(bulan: number) {
    super(`Periode terkunci sampai bulan ke-${bulan} — realisasi periode terkunci tidak bisa diubah. Minta Admin membuka kunci bila perlu koreksi.`);
    this.name = 'RaPeriodLockedError';
  }
}

export class RaTahunTujuanBerisiError extends Error {
  constructor(tahun: number) {
    super(`Tahun ${tahun} sudah berisi data Rencana Aksi — duplikasi hanya ke tahun kosong.`);
    this.name = 'RaTahunTujuanBerisiError';
  }
}

/** R3: null = belum diisi, 0 = nol nyata (penting utk jenis Progres Negatif). */
export type MonthVal = number | null;

export interface RaRow {
  id: number;
  tahun: number;
  level: RaLevel;
  sasaran: string | null;
  tujuan: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  satuan: string;
  target_rpjmd: number;
  target_tahunan: number;
  q1_target: number;  q1_realisasi: number;
  q2_target: number;  q2_realisasi: number;
  q3_target: number;  q3_realisasi: number;
  q4_target: number;  q4_realisasi: number;
  anggaran_nominal: number | null;
  bulan_target: MonthVal[] | null;
  bulan_realisasi: MonthVal[] | null;
  version: number;
}

type RaJenis = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';

/**
 * Derive q1-q4 dari 12 target bulanan per `jenis` (Opsi A).
 *   Akumulatif            → TWn = SUM 3 bulan triwulan itu
 *   Progres Pos/Neg/Ulang → TWn = bulan TERAKHIR terisi (>0) dalam triwulan itu (snapshot)
 * Sync dengan client helper di app/(dashboard)/rencana-aksi/_lib/types.ts.
 */
function deriveQuartersFromMonthly(months: MonthVal[], jenis: RaJenis): [number, number, number, number] {
  const seg = (start: number): number => {
    const part = months.slice(start, start + 3);
    if (jenis === 'Akumulatif') return part.reduce((a: number, b) => a + (b ?? 0), 0);
    // R3: "terisi" = non-null — 0 nyata ikut terekam (capaian terbaik Progres Negatif)
    for (let i = part.length - 1; i >= 0; i--) { const v = part[i]; if (v != null) return v; }
    return 0;
  };
  return [seg(0), seg(3), seg(6), seg(9)];
}

// R3: format simpan v2 `{v:2,m:[...]}` — null = belum diisi, 0 = nol nyata.
// Array polos = data legacy (konvensi lama 0 = belum diisi) → 0 dinormalisasi null.
function parseMonths(v: unknown): MonthVal[] | null {
  if (v == null) return null;
  let raw: unknown = v;
  if (typeof v === 'string') { try { raw = JSON.parse(v); } catch { return null; } }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { v?: unknown }).v === 2) {
    const m = (raw as { m?: unknown }).m;
    if (!Array.isArray(m) || m.length !== 12) return null;
    return m.map((x) => (x == null ? null : Number(x) || 0));
  }
  if (Array.isArray(raw) && raw.length === 12) {
    return raw.map((n) => { const x = Number(n) || 0; return x > 0 ? x : null; });
  }
  return null;
}

const monthsToJson = (m: MonthVal[]): string => JSON.stringify({ v: 2, m });

// R6: kolom DECIMAL (migration 043) — mysql2 kembalikan string → normalisasi Number.
function normNumerics(r: RaRow): void {
  r.target_rpjmd = Number(r.target_rpjmd); r.target_tahunan = Number(r.target_tahunan);
  r.q1_target = Number(r.q1_target); r.q1_realisasi = Number(r.q1_realisasi);
  r.q2_target = Number(r.q2_target); r.q2_realisasi = Number(r.q2_realisasi);
  r.q3_target = Number(r.q3_target); r.q3_realisasi = Number(r.q3_realisasi);
  r.q4_target = Number(r.q4_target); r.q4_realisasi = Number(r.q4_realisasi);
  r.anggaran_nominal = r.anggaran_nominal == null ? null : Number(r.anggaran_nominal);
}

export async function listRencanaAksi(tahun: number, level: RaLevel): Promise<RaRow[]> {
  const rows = await queryMany<RaRow>(sql`
    SELECT id, tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator,
           jenis, satuan, target_rpjmd, target_tahunan,
           q1_target, q1_realisasi, q2_target, q2_realisasi,
           q3_target, q3_realisasi, q4_target, q4_realisasi, anggaran_nominal,
           bulan_target, bulan_realisasi, version
    FROM rencana_aksi
    WHERE tahun = ${tahun} AND level = ${level}
    ORDER BY program, kegiatan, sub_kegiatan, indikator
  `);
  for (const r of rows) {
    r.bulan_target = parseMonths(r.bulan_target);
    r.bulan_realisasi = parseMonths(r.bulan_realisasi);
    normNumerics(r);
  }
  return rows;
}

export async function getRencanaAksiById(id: number): Promise<RaRow | null> {
  const row = await queryOne<RaRow>(sql`
    SELECT id, tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator,
           jenis, satuan, target_rpjmd, target_tahunan,
           q1_target, q1_realisasi, q2_target, q2_realisasi,
           q3_target, q3_realisasi, q4_target, q4_realisasi, anggaran_nominal,
           bulan_target, bulan_realisasi, version
    FROM rencana_aksi WHERE id = ${id}
  `);
  if (row) {
    row.bulan_target = parseMonths(row.bulan_target);
    row.bulan_realisasi = parseMonths(row.bulan_realisasi);
    normNumerics(row);
  }
  return row;
}

/**
 * Upsert by (tahun, level, indikator). Realisasi tidak di-update (preserve).
 * Kalau `id` diberikan dan exists → update by id (allow rename indikator).
 */
export async function upsertRencanaAksi(
  data: UpsertRencanaAksiInput,
  userId: number,
): Promise<number> {
  // Opsi A: untuk sub-kegiatan dengan bulanan terisi, q1-q4 target di-derive
  // server-side (otoritatif) dari `bulan_target` per jenis. Level lain / tanpa
  // bulanan → pakai q target dari form apa adanya. Tahunan/RPJMD tetap manual.
  const hasMonthly = data.level === 'sub-kegiatan'
    && Array.isArray(data.bulan_target) && data.bulan_target.length === 12;
  const bulanTargetJson = hasMonthly ? monthsToJson(data.bulan_target as MonthVal[]) : null;
  const [dq1, dq2, dq3, dq4] = hasMonthly
    ? deriveQuartersFromMonthly(data.bulan_target as MonthVal[], data.jenis)
    : [data.q1_target, data.q2_target, data.q3_target, data.q4_target];

  if (data.id) {
    // L51: CAS via version (bila klien kirim expected_version) + selalu bump version
    // supaya editor kuartal/target yang pegang versi lama ikut terdeteksi konflik.
    const hasCas = typeof data.expected_version === 'number';
    const res = await sql`
      UPDATE rencana_aksi SET
        sasaran              = ${data.sasaran ?? null},
        tujuan               = ${data.tujuan ?? null},
        outcome_program      = ${data.outcome_program ?? null},
        outcome_kegiatan     = ${data.outcome_kegiatan ?? null},
        outcome_sub_kegiatan = ${data.outcome_sub_kegiatan ?? null},
        program              = ${data.program},
        kegiatan             = ${data.kegiatan ?? null},
        sub_kegiatan         = ${data.sub_kegiatan ?? null},
        indikator            = ${data.indikator},
        jenis                = ${data.jenis},
        satuan               = ${data.satuan},
        target_rpjmd         = ${data.target_rpjmd},
        target_tahunan       = ${data.target_tahunan},
        q1_target            = ${dq1},
        q2_target            = ${dq2},
        q3_target            = ${dq3},
        q4_target            = ${dq4},
        anggaran_nominal     = ${data.level === 'sub-kegiatan' ? (data.anggaran_nominal ?? null) : null},
        bulan_target         = ${bulanTargetJson},
        version              = version + 1,
        updated_by           = ${userId}
      WHERE id = ${data.id}
        AND (${hasCas ? 0 : 1} = 1 OR version = ${data.expected_version ?? 0})
    `;
    assertUpdated(res);
    return data.id;
  }

  const existing = await queryOne<{ id: number }>(sql`
    SELECT id FROM rencana_aksi
    WHERE tahun = ${data.tahun} AND level = ${data.level} AND indikator = ${data.indikator}
    LIMIT 1
  `);

  if (existing) {
    await sql`
      UPDATE rencana_aksi SET
        sasaran              = ${data.sasaran ?? null},
        tujuan               = ${data.tujuan ?? null},
        outcome_program      = ${data.outcome_program ?? null},
        outcome_kegiatan     = ${data.outcome_kegiatan ?? null},
        outcome_sub_kegiatan = ${data.outcome_sub_kegiatan ?? null},
        program              = ${data.program},
        kegiatan             = ${data.kegiatan ?? null},
        sub_kegiatan         = ${data.sub_kegiatan ?? null},
        jenis                = ${data.jenis},
        satuan               = ${data.satuan},
        target_rpjmd         = ${data.target_rpjmd},
        target_tahunan       = ${data.target_tahunan},
        q1_target            = ${dq1},
        q2_target            = ${dq2},
        q3_target            = ${dq3},
        q4_target            = ${dq4},
        anggaran_nominal     = ${data.level === 'sub-kegiatan' ? (data.anggaran_nominal ?? null) : null},
        bulan_target         = ${bulanTargetJson},
        version              = version + 1,
        updated_by           = ${userId}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  // Race SELECT-lalu-INSERT ditutup uk_tahun_level_ind: submit kembar jatuh ke
  // ODKU (update, bukan ER_DUP_ENTRY 500). LAST_INSERT_ID(id) → insertId = id existing.
  const res = await sql`
    INSERT INTO rencana_aksi
      (tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
       program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
       target_rpjmd, target_tahunan,
       q1_target, q2_target, q3_target, q4_target, anggaran_nominal, bulan_target,
       created_by, updated_by)
    VALUES (
      ${data.tahun}, ${data.level}, ${data.sasaran ?? null}, ${data.tujuan ?? null},
      ${data.outcome_program ?? null}, ${data.outcome_kegiatan ?? null}, ${data.outcome_sub_kegiatan ?? null},
      ${data.program}, ${data.kegiatan ?? null}, ${data.sub_kegiatan ?? null},
      ${data.indikator}, ${data.jenis}, ${data.satuan},
      ${data.target_rpjmd}, ${data.target_tahunan},
      ${dq1}, ${dq2}, ${dq3}, ${dq4},
      ${data.level === 'sub-kegiatan' ? (data.anggaran_nominal ?? null) : null}, ${bulanTargetJson},
      ${userId}, ${userId}
    ) AS new
    ON DUPLICATE KEY UPDATE
      id                   = LAST_INSERT_ID(rencana_aksi.id),
      sasaran              = new.sasaran,
      tujuan               = new.tujuan,
      outcome_program      = new.outcome_program,
      outcome_kegiatan     = new.outcome_kegiatan,
      outcome_sub_kegiatan = new.outcome_sub_kegiatan,
      program              = new.program,
      kegiatan             = new.kegiatan,
      sub_kegiatan         = new.sub_kegiatan,
      jenis                = new.jenis,
      satuan               = new.satuan,
      target_rpjmd         = new.target_rpjmd,
      target_tahunan       = new.target_tahunan,
      q1_target            = new.q1_target,
      q2_target            = new.q2_target,
      q3_target            = new.q3_target,
      q4_target            = new.q4_target,
      anggaran_nominal     = new.anggaran_nominal,
      bulan_target         = new.bulan_target,
      version              = rencana_aksi.version + 1,
      updated_by           = new.updated_by
  ` as unknown as Array<{ insertId: number }>;
  return res[0]?.insertId ?? 0;
}

export async function deleteRencanaAksi(id: number): Promise<void> {
  await sql`DELETE FROM rencana_aksi WHERE id = ${id}`;
}

type SqlResult = { affectedRows?: number };

function assertUpdated(res: unknown): void {
  const r = res as SqlResult;
  if (typeof r.affectedRows === 'number' && r.affectedRows === 0) {
    throw new RaVersionConflictError();
  }
}

export async function updateQuarter(
  id: number, quarter: 1 | 2 | 3 | 4,
  target: number, realisasi: number, userId: number, expectedVersion: number,
): Promise<void> {
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  // R5: baris ber-data bulanan → kuartal turunan, edit langsung ditolak
  if (row.bulan_target || row.bulan_realisasi) throw new RaMonthlyManagedError();
  // Kunci Periode: kuartal yang seluruh bulannya ≤ batas kunci tidak bisa diubah
  const lock = await getRaLock(row.tahun);
  if (lock > 0 && quarter * 3 <= lock) throw new RaPeriodLockedError(lock);
  // Static dispatch per kolom — 4 ENUM, tidak ada SQL injection risk.
  let res: unknown;
  if (quarter === 1) {
    res = await sql`UPDATE rencana_aksi SET q1_target=${target}, q1_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else if (quarter === 2) {
    res = await sql`UPDATE rencana_aksi SET q2_target=${target}, q2_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else if (quarter === 3) {
    res = await sql`UPDATE rencana_aksi SET q3_target=${target}, q3_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else {
    res = await sql`UPDATE rencana_aksi SET q4_target=${target}, q4_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  }
  assertUpdated(res);
}

/**
 * Opsi A (menu Realisasi, sub-kegiatan): simpan 12 realisasi bulanan →
 * derive q1-q4 realisasi per jenis. Optimistic lock via version.
 */
export async function updateBulanRealisasi(
  id: number, months: MonthVal[], userId: number, expectedVersion: number,
): Promise<void> {
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  // Kunci Periode: nilai bulan ≤ batas kunci tidak boleh berubah
  const lock = await getRaLock(row.tahun);
  if (lock > 0) {
    const existing = row.bulan_realisasi ?? Array(12).fill(null);
    for (let i = 0; i < lock; i++) {
      if ((months[i] ?? null) !== (existing[i] ?? null)) throw new RaPeriodLockedError(lock);
    }
  }
  const [r1, r2, r3, r4] = deriveQuartersFromMonthly(months, row.jenis);
  const res = await sql`
    UPDATE rencana_aksi
    SET q1_realisasi=${r1}, q2_realisasi=${r2}, q3_realisasi=${r3}, q4_realisasi=${r4},
        bulan_realisasi=${monthsToJson(months)}, version=version+1, updated_by=${userId}
    WHERE id=${id} AND version=${expectedVersion}
  `;
  assertUpdated(res);
}

export async function updateTargets(
  id: number, targetRpjmd: number, targetTahunan: number, userId: number, expectedVersion: number,
): Promise<void> {
  const res = await sql`
    UPDATE rencana_aksi
    SET target_rpjmd=${targetRpjmd}, target_tahunan=${targetTahunan}, version=version+1, updated_by=${userId}
    WHERE id=${id} AND version=${expectedVersion}
  `;
  assertUpdated(res);
}

export async function updateJenis(
  id: number, jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan', userId: number, expectedVersion: number,
): Promise<void> {
  // R1: rumus derive beda per jenis (Akumulatif=SUM, lainnya=snapshot) —
  // kuartal turunan bulanan WAJIB dihitung ulang dengan rumus jenis baru,
  // kalau tidak q1-q4 tetap hasil rumus lama sampai simpan bulanan berikutnya
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  const [t1, t2, t3, t4] = row.bulan_target
    ? deriveQuartersFromMonthly(row.bulan_target, jenis)
    : [row.q1_target, row.q2_target, row.q3_target, row.q4_target];
  const [r1, r2, r3, r4] = row.bulan_realisasi
    ? deriveQuartersFromMonthly(row.bulan_realisasi, jenis)
    : [row.q1_realisasi, row.q2_realisasi, row.q3_realisasi, row.q4_realisasi];
  const res = await sql`
    UPDATE rencana_aksi
    SET jenis=${jenis},
        q1_target=${t1}, q2_target=${t2}, q3_target=${t3}, q4_target=${t4},
        q1_realisasi=${r1}, q2_realisasi=${r2}, q3_realisasi=${r3}, q4_realisasi=${r4},
        version=version+1, updated_by=${userId}
    WHERE id=${id} AND version=${expectedVersion}
  `;
  assertUpdated(res);
}

/**
 * Reset realisasi 1 indikator → q1-q4 realisasi = 0. Target tetap.
 * Sengaja tidak pakai version check — aksi destruktif manual user yang sadar konsekuensi (sudah ada confirm 4-digit di UI).
 */
export async function resetRealisasi(id: number, userId: number): Promise<void> {
  const row = await queryOne<{ tahun: number }>(sql`SELECT tahun FROM rencana_aksi WHERE id = ${id}`);
  if (row) {
    const lock = await getRaLock(Number(row.tahun));
    if (lock > 0) throw new RaPeriodLockedError(lock);
  }
  // R2: data bulanan ikut dibersihkan — kalau tidak, simpan bulanan berikutnya
  // mengisi ulang kuartal dari data stale (reset seperti tidak pernah terjadi)
  await sql`
    UPDATE rencana_aksi
    SET q1_realisasi=0, q2_realisasi=0, q3_realisasi=0, q4_realisasi=0,
        bulan_realisasi=NULL,
        version=version+1, updated_by=${userId}
    WHERE id=${id}
  `;
}

// ─── Kunci Periode (system_settings kv: ra_lock_{tahun} = 0..12) ────────────

export async function getRaLock(tahun: number): Promise<number> {
  const r = await queryOne<{ val: string | null }>(
    sql`SELECT val FROM system_settings WHERE \`key\` = ${`ra_lock_${tahun}`}`,
  );
  const n = Number(r?.val ?? 0);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 0;
}

export async function setRaLock(tahun: number, bulan: number): Promise<void> {
  await sql`
    INSERT INTO system_settings (\`key\`, val) VALUES (${`ra_lock_${tahun}`}, ${String(bulan)})
    ON DUPLICATE KEY UPDATE val = ${String(bulan)}
  `;
}

// ─── Duplikasi struktur + target ke tahun baru (realisasi kosong) ────────────

export async function duplicateYear(
  fromTahun: number, toTahun: number, userId: number,
): Promise<{ inserted: number }> {
  const existing = await queryOne<{ c: number }>(
    sql`SELECT COUNT(*) AS c FROM rencana_aksi WHERE tahun = ${toTahun}`,
  );
  if (Number(existing?.c ?? 0) > 0) throw new RaTahunTujuanBerisiError(toTahun);
  // Single INSERT..SELECT = atomic; realisasi (q*_realisasi/bulan_realisasi)
  // memakai DEFAULT (0/NULL) — hanya struktur + target yang tersalin.
  const res = await sql`
    INSERT INTO rencana_aksi
      (tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
       program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
       target_rpjmd, target_tahunan, q1_target, q2_target, q3_target, q4_target,
       anggaran_nominal, bulan_target, created_by, updated_by)
    SELECT ${toTahun}, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
       program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
       target_rpjmd, target_tahunan, q1_target, q2_target, q3_target, q4_target,
       anggaran_nominal, bulan_target, ${userId}, ${userId}
    FROM rencana_aksi
    WHERE tahun = ${fromTahun}
  ` as unknown as Array<{ affectedRows?: number }>;
  return { inserted: res[0]?.affectedRows ?? 0 };
}

