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
//  • Nama, indikator, dan induk yang hanya berbeda penanda matriks (bintang, "(1)")
//    mengikuti ejaan TERSIMPAN — aturannya di ./induk-impor.ts.

import type { PoolConnection } from 'mysql2/promise';
import { queryMany, sql, withTransaction } from '@/lib/data/db';
import { assertPeriodeTerbuka, catatGantiNama } from '@/lib/data/rencana-aksi';
import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';
import { kunciPersis, selaraskanImpor, type BarisTersimpan } from './induk-impor';
import { rencanaGantiNamaImpor, type BarisBerindikator, type GantiNama } from './ganti-nama';

export interface CommitRow {
  level: RaLevel;
  /** Kode nomenklatur dari file. Jangkar identitas yang tidak ikut berubah saat
   *  nama diperbaiki — hierarki Renaksi disambung teks nama, bukan id. */
  kode: string | null;
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
  /** Baris yang nama/indikator/induknya disesuaikan ke ejaan tersimpan. */
  disesuaikan: number;
  perLevel: Partial<Record<RaLevel, number>>;
  /** Ganti nama / pindah induk yang dicatat untuk modul penyalin (renaksi_ganti_nama). */
  gantiNama: GantiNama[];
}

/**
 * Kolom hierarki baris impor dalam konvensi tabel: `program` menampung nama entitas sendiri untuk
 * tujuan/sasaran/program, dan nama Program induk untuk kegiatan/sub-kegiatan (konvensi DataEntryForm).
 * Satu aturan untuk penulis DAN pencatat ganti nama.
 */
function hierarkiBaris(row: CommitRow): BarisBerindikator {
  const atas = row.level === 'tujuan' || row.level === 'sasaran' || row.level === 'program';
  return {
    level: row.level,
    program: atas ? row.nama : (row.induk_program ?? ''),
    kegiatan: row.level === 'kegiatan' ? row.nama : row.level === 'sub-kegiatan' ? (row.induk_kegiatan ?? null) : null,
    sub_kegiatan: row.level === 'sub-kegiatan' ? row.nama : null,
    tujuan: row.level === 'sasaran' ? row.induk_tujuan : null,
    sasaran: row.level === 'program' ? row.induk_sasaran : null,
    indikator: row.indikator,
  };
}

/** Baris import → tuple kolom DB sesuai konvensi Data Entry per level. */
function toDbTuple(row: CommitRow, tahun: number, userId: number): unknown[] {
  const isSasaran = row.level === 'sasaran';
  const isProgram = row.level === 'program';
  const isKegiatan = row.level === 'kegiatan';
  const isSub = row.level === 'sub-kegiatan';

  const { program, kegiatan, sub_kegiatan: subKegiatan } = hierarkiBaris(row);

  const bulanJson = row.bulan && row.bulan.length === 12
    ? JSON.stringify({ v: 2, m: row.bulan })
    : null;

  return [
    tahun, row.level, row.kode,
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
  'tahun', 'level', 'kode', 'program', 'kegiatan', 'sub_kegiatan', 'tujuan', 'sasaran',
  'outcome_program', 'outcome_kegiatan', 'outcome_sub_kegiatan',
  'indikator', 'jenis', 'satuan', 'target_tahunan',
  'q1_target', 'q2_target', 'q3_target', 'q4_target',
  'anggaran_nominal', 'bulan_target', 'created_by', 'updated_by',
];

// Baris yang induknya berganti lewat berkas (pindah program/kegiatan/sasaran/tujuan): tautan
// indikator induknya menunjuk indikator milik induk LAMA → dilepas (NULL), aturan yang sama
// dengan Data Entry (`indukBarisBerubah` di lib/data/rencana-aksi.ts). WAJIB jadi penugasan
// PERTAMA: MySQL menilai SET ON DUPLICATE KEY dari kiri ke kanan, jadi sesudah `program =
// VALUES(program)` kolom `program` sudah bernilai baru dan perbandingannya selalu sama.
const LEPAS_TAUTAN_BASI = "`induk_indikator_id` = IF("
  + "(`level` = 'sasaran' AND NOT (TRIM(`tujuan`) <=> TRIM(VALUES(`tujuan`))))"
  + " OR (`level` = 'program' AND NOT (TRIM(`sasaran`) <=> TRIM(VALUES(`sasaran`))))"
  + " OR (`level` = 'kegiatan' AND NOT (TRIM(`program`) <=> TRIM(VALUES(`program`))))"
  + " OR (`level` = 'sub-kegiatan' AND (NOT (TRIM(`kegiatan`) <=> TRIM(VALUES(`kegiatan`)))"
  + " OR NOT (TRIM(`program`) <=> TRIM(VALUES(`program`)))))"
  + ", NULL, `induk_indikator_id`)";

// Kolom realisasi sengaja absen: impor tidak boleh menghapus capaian.
const UPDATE_SET = LEPAS_TAUTAN_BASI + ', ' + [
  'program', 'kegiatan', 'sub_kegiatan', 'tujuan', 'sasaran',
  'outcome_program', 'outcome_kegiatan', 'outcome_sub_kegiatan',
  'jenis', 'satuan', 'target_tahunan',
  'q1_target', 'q2_target', 'q3_target', 'q4_target',
  'anggaran_nominal', 'bulan_target', 'updated_by',
].map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ')
  // `kode` pakai COALESCE, bukan VALUES() polos: file tanpa kolom kode mengirim NULL,
  // dan itu tidak boleh MENGHAPUS kode yang sudah tersimpan dari impor sebelumnya.
  // Alasan yang sama dengan kolom realisasi yang sengaja absen dari daftar ini.
  + ', `kode` = COALESCE(VALUES(`kode`), `kode`)'
  + ', `version` = `version` + 1';

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
  const tersimpan = await queryMany<BarisTersimpan & BarisBerindikator>(
    sql`SELECT level, program, kegiatan, sub_kegiatan, tujuan, sasaran, indikator FROM rencana_aksi WHERE tahun = ${tahun}`,
  );
  const { layak, ditahan, disesuaikan } = selaraskanImpor(rows, tersimpan, tahun, mode === 'ganti');

  if (layak.length === 0) {
    return { disimpan: 0, ditambah: 0, diperbarui: 0, dilewati: 0, ditahan, disesuaikan: 0, perLevel: {}, gantiNama: [] };
  }

  const levelsDiFile = [...new Set(layak.map(r => r.level))];

  // Kunci unik (tahun, level, indikator) — hitung mana yang sudah ada supaya
  // laporan "ditambah vs diperbarui" akurat.
  const existingKeys = new Set(tersimpan.map(e => `${e.level}|${kunciPersis(e.indikator)}`));

  let ditambah = 0;
  let diperbarui = 0;
  let dilewati = 0;
  const perLevel: Partial<Record<RaLevel, number>> = {};
  const akanTulis: CommitRow[] = [];
  for (const r of layak) {
    const sudahAda = existingKeys.has(`${r.level}|${kunciPersis(r.indikator)}`);
    if (mode === 'tambah' && sudahAda) { dilewati++; continue; }
    if (mode === 'upsert' && sudahAda) diperbarui++; else ditambah++;
    perLevel[r.level] = (perLevel[r.level] ?? 0) + 1;
    akanTulis.push(r);
  }

  // T2: mode 'ganti' MENGHAPUS baris, dan baris yang terhapus membawa serta
  // realisasinya. Itu menembus Kunci Periode lebih telak daripada mengubah nilai.
  // Diperiksa SEBELUM transaksi dibuka — menolak lebih awal lebih murah daripada
  // membuka transaksi lalu memutarnya kembali. Mode 'tambah'/'upsert' sengaja
  // tidak diperiksa: keduanya memang tidak menyentuh kolom realisasi.
  if (mode === 'ganti') await assertPeriodeTerbuka(tahun);

  // Mode 'tambah' tidak pernah menulis baris yang sudah ada, jadi tidak ada yang berganti nama.
  const gantiNama = mode === 'tambah' ? []
    : rencanaGantiNamaImpor(tersimpan, akanTulis.map(hierarkiBaris), mode === 'ganti');

  await withTransaction(async ({ tx, conn }) => {
    if (mode === 'ganti') {
      for (const lv of levelsDiFile) {
        // Tautan indikator induk menunjuk ID baris. Menghapus satu tingkat meninggalkan id
        // yang tidak ada lagi (soft-FK diam saja), dan layar lalu menawarkan pilihan hantu —
        // jadi tautannya dilepas dulu, di transaksi yang sama dengan penghapusannya.
        // Subquery dibungkus tabel turunan: MySQL menolak UPDATE yang membaca tabelnya sendiri.
        await tx`
          UPDATE rencana_aksi SET induk_indikator_id = NULL
          WHERE tahun = ${tahun}
            AND induk_indikator_id IN (
              SELECT id FROM (
                SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND level = ${lv}
              ) AS akan_dihapus
            )
        `;
        await tx`DELETE FROM rencana_aksi WHERE tahun = ${tahun} AND level = ${lv}`;
      }
    }
    const tuples = akanTulis.map(r => toDbTuple(r, tahun, userId));
    await bulkWrite(conn, tuples, mode !== 'tambah');
    // Transaksi yang sama: impor yang batal tidak boleh meninggalkan catatan.
    for (const g of gantiNama) await catatGantiNama(tx, tahun, g, userId);
  });

  if (mode === 'ganti') { ditambah = akanTulis.length; diperbarui = 0; }

  return { disimpan: akanTulis.length, ditambah, diperbarui, dilewati, ditahan, disesuaikan, perLevel, gantiNama };
}
