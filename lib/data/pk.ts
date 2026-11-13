// ═══ PRIMA — PK Data Layer (Perjanjian Kinerja) ═════════════════════════════
// Query wrappers untuk modul PK. Pattern: queryOne/queryMany (L23) + escapeLike
// (L17/L25) + ownership filter (L2 SEC-C4) + parameterized SQL.
//
// Reference: docs/session/PK_REFACTOR_CONCEPT.md §3 + §9

import { sql, queryMany, queryOne, withTransaction, bulkInsert } from '@/lib/data/db';
import type { PoolConnection } from 'mysql2/promise';
import { rapikanIndikatorAtauNull, rapikanNamaAtauNull, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { PESAN_VERSI_PK, type DokumenCreateBody, type DokumenUpdateBody } from './pk-schemas';

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

// Nominal BLUD untuk lampiran anggaran: lib/data/pk-blud-nominal.ts (dihitung langsung dari DPA/Pergeseran).

// ─── Isi dokumen: lampiran + anggaran ───────────────────────────────────────

/**
 * Satu-satunya penulis baris lampiran & anggaran — dipakai pembuatan (POST) DAN penggantian
 * isi (PATCH). Dua daftar kolom yang ditulis terpisah pasti menyimpang: kolom yang ditambah
 * di satu pintu hilang diam-diam lewat pintu sebelahnya (L69).
 *
 * Nama disimpan tanpa penanda matriks Renaksi (bintang di ujung, awalan "(1)" indikator):
 * isi dokumen = teks resmi yang tercetak, dan modul lain (tabel LKJIP tertaut) membacanya dari sini.
 */
export async function tulisIsiDokumen(
  conn: PoolConnection,
  id: number,
  d: Pick<DokumenCreateBody, 'lampiran' | 'anggaran'>,
): Promise<void> {
  if (d.lampiran.length > 0) {
    await bulkInsert(
      'pk_dokumen_lampiran',
      ['dokumen_id','unit_kerja','level','program','kegiatan','subkegiatan','uraian','indikator','target','satuan','urutan'],
      d.lampiran.map((l, i) => [
        id, l.unit_kerja, l.level,
        rapikanNamaAtauNull(l.program), rapikanNamaAtauNull(l.kegiatan), rapikanNamaAtauNull(l.subkegiatan),
        rapikanNamaEntitas(l.uraian), rapikanIndikatorAtauNull(l.indikator), l.target ?? null, l.satuan || null,
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
        rapikanNamaAtauNull(a.program), rapikanNamaAtauNull(a.kegiatan), rapikanNamaAtauNull(a.subkegiatan),
        rapikanNamaEntitas(a.uraian), a.keterangan_sumber, a.nominal ?? 0,
        a.urutan ?? i,
        a.auto_filled_from_blud ?? false,
      ]),
      conn,
    );
  }
}

// ─── Simpan & kunci dokumen (I4, audit 2026-09-29) ──────────────────────────
// Kunci versi (L48): dulu PATCH menulis ulang header + seluruh lampiran/anggaran tanpa
// bertanya apakah dokumennya sudah diubah orang lain sejak dibuka — yang terakhir menang.

export class PkVersiKonflikError extends Error {
  constructor() { super(PESAN_VERSI_PK); this.name = 'PkVersiKonflikError'; }
}

// ─── Salin dokumen FINAL jadi DRAFT baru ──────────────────────────────────────
// Dokumen FINAL memang tidak bisa disunting (itu artinya dikunci). Yang dibutuhkan
// untuk memperbaiki isinya adalah salinan yang bisa disunting, tanpa menyentuh arsip:
// dokumen lama tetap FINAL utuh beserta berkas Word-nya.

export class PkDokumenTidakAdaError extends Error {
  constructor() { super('Dokumen PK tidak ditemukan'); this.name = 'PkDokumenTidakAdaError'; }
}

export class PkHanyaFinalDisalinError extends Error {
  constructor() { super('Hanya dokumen FINAL yang bisa disalin jadi DRAFT — dokumen DRAFT memang sudah bisa disunting.'); this.name = 'PkHanyaFinalDisalinError'; }
}

/**
 * Salin satu dokumen FINAL (header + lampiran + anggaran) jadi DRAFT baru milik `userId`.
 *
 * `INSERT … SELECT` di dalam transaksi: daftar kolom yang disalin hanya ada di satu tempat,
 * dan tidak ada jendela antara baca dan tulis. Sumber tidak pernah ditulis.
 * `status`/`version`/`created_by`/berkas Word sengaja tidak ikut — salinan lahir sebagai
 * DRAFT versi 0 tanpa Word (dibuat ulang saat difinalisasi).
 */
export async function salinJadiDraft(id: number, userId: number): Promise<number> {
  return await withTransaction(async ({ tx }) => {
    const baris = await tx`
      SELECT status FROM pk_dokumen WHERE id = ${id} FOR UPDATE
    ` as Array<{ status: 'DRAFT' | 'FINAL' }>;
    if (!baris.length) throw new PkDokumenTidakAdaError();
    if (baris[0].status !== 'FINAL') throw new PkHanyaFinalDisalinError();

    const ins = await tx`
      INSERT INTO pk_dokumen (
        tahun, tanggal_dokumen, jenis_pk,
        unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
        unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua,
        status, version, created_by
      )
      SELECT
        tahun, tanggal_dokumen, jenis_pk,
        unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
        unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua,
        'DRAFT', 0, ${userId}
      FROM pk_dokumen WHERE id = ${id}
    ` as unknown as Array<{ insertId?: number }>;
    const baru = Number(ins[0]?.insertId);
    if (!baru) throw new Error('Gagal menyalin dokumen PK — insertId kosong');

    await tx`
      INSERT INTO pk_dokumen_lampiran
        (dokumen_id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, indikator, target, satuan, urutan)
      SELECT ${baru}, unit_kerja, level, program, kegiatan, subkegiatan, uraian, indikator, target, satuan, urutan
      FROM pk_dokumen_lampiran WHERE dokumen_id = ${id}
    `;
    await tx`
      INSERT INTO pk_dokumen_anggaran
        (dokumen_id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, keterangan_sumber, nominal, urutan, auto_filled_from_blud)
      SELECT ${baru}, unit_kerja, level, program, kegiatan, subkegiatan, uraian, keterangan_sumber, nominal, urutan, auto_filled_from_blud
      FROM pk_dokumen_anggaran WHERE dokumen_id = ${id}
    `;

    return baru;
  });
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

    await tulisIsiDokumen(conn, id, d);
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
