// ═══ PRIMA — PK Data Layer (Perjanjian Kinerja) ═════════════════════════════
// Query wrappers untuk modul PK. Pattern: queryOne/queryMany (L23) + escapeLike
// (L17/L25) + ownership filter (L2 SEC-C4) + parameterized SQL.
//
// Reference: docs/session/PK_REFACTOR_CONCEPT.md §3 + §9

import { sql, queryMany, queryOne } from '@/lib/data/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PkLevel = 'program' | 'kegiatan' | 'subkegiatan';

export type PkUnitKerja = {
  id:                    number;
  nama_unit:             string;
  level:                 PkLevel;
  atasan_default:        string | null;
  selectable_as_pertama: boolean;
  urutan:                number;
  active:                boolean;
};

export type PkPejabat = {
  id:         number;
  unit_kerja: string;
  nama:       string;
  jabatan:    string;
  pangkat:    string | null;
  nip:        string | null;
  tahun:      string;
  is_active:  boolean;
};

// ─── Unit Kerja ─────────────────────────────────────────────────────────────

/**
 * List semua unit kerja aktif untuk dropdown.
 * @param asPertama — filter hanya yang `selectable_as_pertama=TRUE` (exclude Direktur)
 */
export async function getPkUnitKerjaList(asPertama: boolean = false): Promise<PkUnitKerja[]> {
  return await queryMany<PkUnitKerja>(asPertama
    ? sql`
        SELECT id, nama_unit, level, atasan_default, selectable_as_pertama, urutan, active
        FROM pk_unit_kerja
        WHERE active = TRUE AND selectable_as_pertama = TRUE
        ORDER BY urutan, nama_unit
      `
    : sql`
        SELECT id, nama_unit, level, atasan_default, selectable_as_pertama, urutan, active
        FROM pk_unit_kerja
        WHERE active = TRUE
        ORDER BY urutan, nama_unit
      `,
  );
}

/**
 * List SEMUA unit kerja (termasuk inactive) untuk admin Master Unit view.
 * Plus optional BLUD PJ mapping per unit.
 */
export async function getAllPkUnitKerjaWithMapping(): Promise<{
  units:   PkUnitKerja[];
  mapping: Array<{ unit_pk: string; blud_pj_label: string }>;
}> {
  const units = await queryMany<PkUnitKerja>(sql`
    SELECT id, nama_unit, level, atasan_default, selectable_as_pertama, urutan, active
    FROM pk_unit_kerja
    ORDER BY urutan, nama_unit
  `);
  const mapping = await queryMany<{ unit_pk: string; blud_pj_label: string }>(sql`
    SELECT unit_pk, blud_pj_label FROM pk_unit_kerja_blud_pj
  `);
  return { units, mapping };
}

/**
 * Get atasan default untuk auto-suggest Pihak Kedua dari Pihak Pertama (Q3).
 * Return nama_unit atasan, atau null kalau top (Direktur).
 */
export async function getAtasanDefault(namaUnit: string): Promise<string | null> {
  const row = await queryOne<{ atasan_default: string | null }>(
    sql`SELECT atasan_default FROM pk_unit_kerja WHERE nama_unit = ${namaUnit} LIMIT 1`,
  );
  return row?.atasan_default ?? null;
}

// ─── Pejabat ────────────────────────────────────────────────────────────────

/**
 * Get pejabat aktif untuk unit_kerja + tahun tertentu. Untuk auto-fill form PK.
 */
export async function getPejabatByUnit(
  unitKerja: string,
  tahun: string,
): Promise<PkPejabat | null> {
  return await queryOne<PkPejabat>(sql`
    SELECT id, unit_kerja, nama, jabatan, pangkat, nip, tahun, is_active
    FROM pk_pejabat
    WHERE unit_kerja = ${unitKerja}
      AND tahun = ${tahun}
      AND is_active = TRUE
    LIMIT 1
  `);
}

// ─── BLUD Lookup (untuk auto-fill nominal Anggaran BLUD — Q1) ───────────────

/**
 * Aggregate nominal BLUD per unit kerja PK.
 *
 * Strategy:
 *  - Sub-keg level: exact match `nama_unit = penanggung_jawab.label` (via JOIN validate)
 *  - Keg/program level: aggregate via `pk_unit_kerja_blud_pj` mapping
 *  - Filter out baris agregat (`label = 'TOTAL BELANJA BLUD'`) via JOIN penanggung_jawab
 *  - Versi: pakai MAX(versi_dpa) (Sprint 0 caveat — OK untuk MVP)
 */
export async function getBludNominalByUnit(unitKerja: string): Promise<{
  nominal: number;
  versi_dpa: string | null;
  matched_labels: string[];
}> {
  // PK-PERF-1: lookup level + latest versi parallel (2 RTT → 1 RTT)
  const [unit, versi] = await Promise.all([
    queryOne<{ level: PkLevel }>(
      sql`SELECT level FROM pk_unit_kerja WHERE nama_unit = ${unitKerja} LIMIT 1`,
    ),
    queryOne<{ versi: string | null }>(
      sql`SELECT MAX(versi_dpa) AS versi FROM rekap_pk`,
    ),
  ]);
  if (!unit) return { nominal: 0, versi_dpa: null, matched_labels: [] };
  const versiDpa = versi?.versi ?? null;
  if (!versiDpa) return { nominal: 0, versi_dpa: null, matched_labels: [] };

  if (unit.level === 'subkegiatan') {
    // Direct exact match — guard via JOIN penanggung_jawab (filter agregat baris).
    const rows = await queryMany<{ label: string; total: number }>(sql`
      SELECT rp.label AS label, COALESCE(SUM(rp.nominal), 0) AS total
      FROM rekap_pk rp
      INNER JOIN penanggung_jawab pj ON pj.label = rp.label
      WHERE rp.versi_dpa = ${versiDpa}
        AND rp.label = ${unitKerja}
      GROUP BY rp.label
    `);
    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    return {
      nominal: total,
      versi_dpa: versiDpa,
      matched_labels: rows.map(r => r.label),
    };
  }

  // Kegiatan/Program level — aggregate via mapping
  const rows = await queryMany<{ label: string; total: number }>(sql`
    SELECT rp.label AS label, COALESCE(SUM(rp.nominal), 0) AS total
    FROM rekap_pk rp
    INNER JOIN pk_unit_kerja_blud_pj m ON m.blud_pj_label = rp.label
    INNER JOIN penanggung_jawab pj      ON pj.label = rp.label
    WHERE rp.versi_dpa = ${versiDpa}
      AND m.unit_pk = ${unitKerja}
    GROUP BY rp.label
  `);
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return {
    nominal: total,
    versi_dpa: versiDpa,
    matched_labels: rows.map(r => r.label),
  };
}
