// lib/renaksi/import-data.ts — Commit hasil preview import ke tabel rencana_aksi.
// Satu transaksi (L4/CQ-01) + single round-trip per level (PERF-C1).
//
// Aturan penting:
//  • Mode 'upsert' memakai INSERT … ON DUPLICATE KEY UPDATE pada kunci unik
//    (tahun, level, indikator) — kolom REALISASI (q*_realisasi, bulan_realisasi)
//    sengaja TIDAK ikut di-update supaya impor ulang di tahun berjalan tidak
//    menghapus capaian yang sudah diinput.
//  • Mode 'ganti' hanya menghapus level yang ADA di file — impor parsial tidak
//    boleh menyentuh level lain.
//  • Induk wajib ada (di file yang sama atau di DB tahun itu); baris tanpa induk
//    ditahan dan dilaporkan, tidak disimpan diam-diam.

import type { PoolConnection } from 'mysql2/promise';
import { queryMany, sql, withTransaction } from '@/lib/data/db';
import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';

export interface CommitRow {
  level: RaLevel;
  nama: string;
  induk_tujuan: string | null;
  induk_sasaran: string | null;
  induk_program: string | null;
  induk_kegiatan: string | null;
  outcome: string | null;
  indikator: string;
  satuan: string;
  jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  target_tahunan: number;
  q: [number, number, number, number];
  bulan: (number | null)[] | null;
  anggaran: number | null;
}

export type ImportMode = 'tambah' | 'upsert' | 'ganti';

export interface CommitResult {
  disimpan: number;
  ditambah: number;
  diperbarui: number;
  dilewati: number;
  ditahan: Array<{ indikator: string; level: RaLevel; alasan: string }>;
  perLevel: Partial<Record<RaLevel, number>>;
}

/** Induk yang wajib ada per level (null = tidak punya induk). */
const PARENT_OF: Record<RaLevel, { level: RaLevel; field: keyof CommitRow } | null> = {
  'tujuan': null,
  'sasaran': { level: 'tujuan', field: 'induk_tujuan' },
  'program': { level: 'sasaran', field: 'induk_sasaran' },
  'kegiatan': { level: 'program', field: 'induk_program' },
  'sub-kegiatan': { level: 'kegiatan', field: 'induk_kegiatan' },
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Nama entitas per level yang sudah ada di DB untuk tahun tsb. */
async function existingNames(tahun: number): Promise<Map<RaLevel, Set<string>>> {
  const rows = await queryMany<{ level: RaLevel; program: string; kegiatan: string | null; sub_kegiatan: string | null }>(
    sql`SELECT level, program, kegiatan, sub_kegiatan FROM rencana_aksi WHERE tahun = ${tahun}`,
  );
  const out = new Map<RaLevel, Set<string>>();
  const add = (lv: RaLevel, v: string | null) => {
    if (!v) return;
    const s = out.get(lv) ?? new Set<string>();
    s.add(norm(v));
    out.set(lv, s);
  };
  for (const r of rows) {
    if (r.level === 'tujuan' || r.level === 'sasaran' || r.level === 'program') add(r.level, r.program);
    if (r.level === 'kegiatan') add('kegiatan', r.kegiatan);
    if (r.level === 'sub-kegiatan') { add('program', r.program); add('kegiatan', r.kegiatan); }
  }
  return out;
}

/** Baris import → tuple kolom DB sesuai konvensi Data Entry per level. */
function toDbTuple(row: CommitRow, tahun: number, userId: number): unknown[] {
  const isTujuan = row.level === 'tujuan';
  const isSasaran = row.level === 'sasaran';
  const isProgram = row.level === 'program';
  const isKegiatan = row.level === 'kegiatan';
  const isSub = row.level === 'sub-kegiatan';

  // Kolom `program` menampung nama entitas sendiri untuk tujuan/sasaran/program,
  // dan nama Program induk untuk kegiatan/sub-kegiatan (konvensi DataEntryForm).
  const program = isTujuan || isSasaran || isProgram ? row.nama : (row.induk_program ?? '');
  const kegiatan = isKegiatan ? row.nama : isSub ? (row.induk_kegiatan ?? null) : null;
  const subKegiatan = isSub ? row.nama : null;

  const bulanJson = row.bulan && row.bulan.length === 12
    ? JSON.stringify({ v: 2, m: row.bulan })
    : null;

  return [
    tahun, row.level,
    program, kegiatan, subKegiatan,
    isSasaran ? row.induk_tujuan : null,
    isProgram ? row.induk_sasaran : null,
    isProgram ? row.outcome : null,
    isKegiatan ? row.outcome : null,
    isSub ? row.outcome : null,
    row.indikator, row.jenis, row.satuan,
    row.target_tahunan,
    row.q[0], row.q[1], row.q[2], row.q[3],
    isSub ? row.anggaran : null,
    bulanJson,
    userId, userId,
  ];
}

const COLUMNS = [
  'tahun', 'level', 'program', 'kegiatan', 'sub_kegiatan', 'tujuan', 'sasaran',
  'outcome_program', 'outcome_kegiatan', 'outcome_sub_kegiatan',
  'indikator', 'jenis', 'satuan', 'target_tahunan',
  'q1_target', 'q2_target', 'q3_target', 'q4_target',
  'anggaran_nominal', 'bulan_target', 'created_by', 'updated_by',
];

// Kolom realisasi sengaja absen: impor tidak boleh menghapus capaian.
const UPDATE_SET = [
  'program', 'kegiatan', 'sub_kegiatan', 'tujuan', 'sasaran',
  'outcome_program', 'outcome_kegiatan', 'outcome_sub_kegiatan',
  'jenis', 'satuan', 'target_tahunan',
  'q1_target', 'q2_target', 'q3_target', 'q4_target',
  'anggaran_nominal', 'bulan_target', 'updated_by',
].map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ') + ', `version` = `version` + 1';

async function bulkWrite(conn: PoolConnection, rows: unknown[][], upsert: boolean): Promise<void> {
  if (rows.length === 0) return;
  const colList = COLUMNS.map(c => `\`${c}\``).join(', ');
  const q = `INSERT ${upsert ? '' : 'IGNORE '}INTO \`rencana_aksi\` (${colList}) VALUES ?`
    + (upsert ? ` ON DUPLICATE KEY UPDATE ${UPDATE_SET}` : '');
  await conn.query(q, [rows]);
}

export async function commitImportRenaksi(
  tahun: number, mode: ImportMode, rows: CommitRow[], userId: number,
): Promise<CommitResult> {
  const ditahan: CommitResult['ditahan'] = [];

  // Nama entitas yang tersedia = dari file ini + yang sudah ada di DB tahun itu
  const dbNames = await existingNames(tahun);
  const tersedia = new Map<RaLevel, Set<string>>();
  for (const [lv, set] of dbNames) tersedia.set(lv, new Set(set));
  for (const r of rows) {
    const s = tersedia.get(r.level) ?? new Set<string>();
    s.add(norm(r.nama));
    tersedia.set(r.level, s);
  }

  const layak: CommitRow[] = [];
  for (const r of rows) {
    const parent = PARENT_OF[r.level];
    if (parent) {
      const nama = r[parent.field] as string | null;
      if (!nama || !nama.trim()) {
        ditahan.push({ indikator: r.indikator, level: r.level, alasan: `Induk ${parent.level} belum ditentukan.` });
        continue;
      }
      if (!tersedia.get(parent.level)?.has(norm(nama))) {
        ditahan.push({
          indikator: r.indikator, level: r.level,
          alasan: `${parent.level} "${nama.slice(0, 60)}" belum ada di tahun ${tahun} — buat dulu atau pilih induk lain.`,
        });
        continue;
      }
    }
    // Sub-kegiatan butuh rantai lengkap sampai Program
    if (r.level === 'sub-kegiatan' && !r.induk_program?.trim()) {
      ditahan.push({ indikator: r.indikator, level: r.level, alasan: 'Program induk belum ditentukan.' });
      continue;
    }
    layak.push(r);
  }

  if (layak.length === 0) {
    return { disimpan: 0, ditambah: 0, diperbarui: 0, dilewati: 0, ditahan, perLevel: {} };
  }

  const levelsDiFile = [...new Set(layak.map(r => r.level))];

  // Kunci unik (tahun, level, indikator) — hitung mana yang sudah ada supaya
  // laporan "ditambah vs diperbarui" akurat.
  const existingKeys = new Set<string>();
  const existRows = await queryMany<{ level: RaLevel; indikator: string }>(
    sql`SELECT level, indikator FROM rencana_aksi WHERE tahun = ${tahun}`,
  );
  for (const e of existRows) existingKeys.add(`${e.level}|${norm(e.indikator)}`);

  let ditambah = 0;
  let diperbarui = 0;
  let dilewati = 0;
  const perLevel: Partial<Record<RaLevel, number>> = {};
  const akanTulis: CommitRow[] = [];
  for (const r of layak) {
    const sudahAda = existingKeys.has(`${r.level}|${norm(r.indikator)}`);
    if (mode === 'tambah' && sudahAda) { dilewati++; continue; }
    if (mode === 'upsert' && sudahAda) diperbarui++; else ditambah++;
    perLevel[r.level] = (perLevel[r.level] ?? 0) + 1;
    akanTulis.push(r);
  }

  await withTransaction(async ({ tx, conn }) => {
    if (mode === 'ganti') {
      for (const lv of levelsDiFile) {
        await tx`DELETE FROM rencana_aksi WHERE tahun = ${tahun} AND level = ${lv}`;
      }
    }
    const tuples = akanTulis.map(r => toDbTuple(r, tahun, userId));
    await bulkWrite(conn, tuples, mode !== 'tambah');
  });

  if (mode === 'ganti') { ditambah = akanTulis.length; diperbarui = 0; }

  return { disimpan: akanTulis.length, ditambah, diperbarui, dilewati, ditahan, perLevel };
}
