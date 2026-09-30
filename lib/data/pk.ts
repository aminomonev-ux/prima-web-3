// ═══ PRIMA — PK Data Layer (Perjanjian Kinerja) ═════════════════════════════
// Query wrappers untuk modul PK. Pattern: queryOne/queryMany (L23) + escapeLike
// (L17/L25) + ownership filter (L2 SEC-C4) + parameterized SQL.
//
// Reference: docs/session/PK_REFACTOR_CONCEPT.md §3 + §9

import { sql, queryMany, queryOne, withTransaction, bulkInsert } from '@/lib/data/db';
import { PESAN_VERSI_PK, type DokumenUpdateBody } from './pk-schemas';

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
 *  - Versi: rekap terbaru TAHUN DOKUMEN PK (B6, audit 2026-09-29). Dulu `MAX(versi_dpa)`
 *    tahun apa pun — PK 2026 yang disusun sesudah rekap 2027 ada terisi angka 2027.
 *    Versinya dipulangkan sebagai teks `YYYY-MM-DD` supaya layar bisa menyebutnya.
 */
export async function getBludNominalByUnit(unitKerja: string, tahun: number): Promise<{
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
      sql`SELECT DATE_FORMAT(MAX(versi_dpa), '%Y-%m-%d') AS versi FROM rekap_pk WHERE tahun_anggaran = ${tahun}`,
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
      WHERE rp.tahun_anggaran = ${tahun}
        AND rp.versi_dpa = ${versiDpa}
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
    WHERE rp.tahun_anggaran = ${tahun}
      AND rp.versi_dpa = ${versiDpa}
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

// ─── Simpan & kunci dokumen (I4, audit 2026-09-29) ──────────────────────────
// Kunci versi (L48): dulu PATCH menulis ulang header + seluruh lampiran/anggaran tanpa
// bertanya apakah dokumennya sudah diubah orang lain sejak dibuka — yang terakhir menang.

export class PkVersiKonflikError extends Error {
  constructor() { super(PESAN_VERSI_PK); this.name = 'PkVersiKonflikError'; }
}

/**
 * Ganti isi dokumen DRAFT (header + seluruh lampiran/anggaran). Kuncinya ditegakkan oleh
 * UPDATE header, SEBELUM baris lama dihapus — konflik membatalkan seluruh transaksi.
 * Memulangkan angka kunci yang baru.
 */
export async function gantiIsiDokumen(id: number, d: DokumenUpdateBody): Promise<number> {
  await withTransaction(async ({ tx, conn }) => {
    const upd = await tx`
      UPDATE pk_dokumen SET
        tahun = ${d.tahun}, tanggal_dokumen = ${d.tanggal_dokumen}, jenis_pk = ${d.jenis_pk},
        unit_pertama = ${d.unit_pertama}, nama_pertama = ${d.nama_pertama}, jabatan_pertama = ${d.jabatan_pertama},
        pangkat_pertama = ${d.pangkat_pertama ?? null}, nip_pertama = ${d.nip_pertama ?? null},
        unit_kedua = ${d.unit_kedua}, nama_kedua = ${d.nama_kedua}, jabatan_kedua = ${d.jabatan_kedua},
        pangkat_kedua = ${d.pangkat_kedua ?? null}, nip_kedua = ${d.nip_kedua ?? null},
        version = version + 1
      WHERE id = ${id} AND version = ${d.expected_version} AND status = 'DRAFT'
    ` as unknown as Array<{ affectedRows?: number }>;
    if ((upd[0]?.affectedRows ?? 0) !== 1) throw new PkVersiKonflikError();
    await tx`DELETE FROM pk_dokumen_lampiran WHERE dokumen_id = ${id}`;
    await tx`DELETE FROM pk_dokumen_anggaran WHERE dokumen_id = ${id}`;

    if (d.lampiran.length > 0) {
      await bulkInsert(
        'pk_dokumen_lampiran',
        ['dokumen_id','unit_kerja','level','program','kegiatan','subkegiatan','uraian','indikator','target','urutan'],
        d.lampiran.map((l, i) => [
          id, l.unit_kerja, l.level,
          l.program ?? null, l.kegiatan ?? null, l.subkegiatan ?? null,
          l.uraian, l.indikator ?? null, l.target ?? null,
          l.urutan ?? i,
        ]),
        conn,
      );
    }
    if (d.anggaran.length > 0) {
      await bulkInsert(
        'pk_dokumen_anggaran',
        ['dokumen_id','unit_kerja','level','program','kegiatan','subkegiatan','uraian','keterangan_sumber','nominal','urutan','auto_filled_from_blud'],
        d.anggaran.map((a, i) => [
          id, a.unit_kerja, a.level,
          a.program ?? null, a.kegiatan ?? null, a.subkegiatan ?? null,
          a.uraian, a.keterangan_sumber, a.nominal ?? 0,
          a.urutan ?? i,
          a.auto_filled_from_blud ?? false,
        ]),
        conn,
      );
    }
  });
  return d.expected_version + 1;
}

/**
 * Kunci dokumen jadi FINAL bersama berkas Word-nya. Word dibuat dari isi DB sebelum
 * fungsi ini dipanggil — kalau ada simpanan lain di selanya (atau layar memegang versi
 * lama), angka kuncinya tidak cocok dan dokumen tidak dikunci dengan berkas yang berbeda isi.
 */
export async function kunciDokumenFinal(id: number, expectedVersion: number, berkas: { buffer: Buffer; filename: string }): Promise<void> {
  const res = await sql`
    UPDATE pk_dokumen SET
      status              = 'FINAL',
      generated_file      = ${berkas.buffer},
      generated_filesize  = ${berkas.buffer.length},
      generated_filename  = ${berkas.filename},
      generated_at        = NOW(),
      version             = version + 1
    WHERE id = ${id} AND version = ${expectedVersion} AND status = 'DRAFT'
  ` as unknown as Array<{ affectedRows?: number }>;
  if ((res[0]?.affectedRows ?? 0) !== 1) throw new PkVersiKonflikError();
}
