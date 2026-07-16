// ═══ PRIMA — IKI Data Layer ══════════════════════════════════════════════════
// CRUD dokumen IKI + save nested (withTransaction + bulkInsert, CQ-01) +
// optimistic lock dokumen-level (L48 CAS) + guard DRAFT.
// Konsep: docs/CONCEPT-iki.md

import { sql, queryOne, queryMany, execWrite, withTransaction, bulkInsert } from '@/lib/data/db';
import type { SaveDokumenInput } from '@/lib/data/iki-schemas';

export class IkiVersionConflictError extends Error {
  constructor() { super('Dokumen sudah diubah pengguna lain. Muat ulang halaman.'); }
}
export class IkiFinalError extends Error {
  constructor() { super('Dokumen berstatus FINAL dan tidak bisa diubah.'); }
}
export class IkiNotFoundError extends Error {
  constructor() { super('Dokumen IKI tidak ditemukan.'); }
}

export type IkiDokumenRow = {
  id: number;
  tahun: string;
  varian: 'STANDAR' | 'DIREKTUR';
  opd: string;
  nama: string;
  nip: string;
  jabatan: string;
  pangkat: string | null;
  ikhtisar: string | null;
  nama_atasan: string | null;
  nip_atasan: string | null;
  jabatan_atasan: string | null;
  pangkat_atasan: string | null;
  kota_ttd: string;
  tanggal_ttd: string | null;
  atasan_dokumen_id: number | null;
  status: 'DRAFT' | 'FINAL';
  version: number;
};

export type IkiTriwulanRow = {
  triwulan: 1 | 2 | 3 | 4;
  target_tw: string;
  uraian: string | null;
  target_aksi: string;
};

export type IkiRhkRow = {
  id: number;
  no_urut: number;
  rhk_intervensi: string | null;
  rhk: string;
  aspek_a: string;
  aspek_b: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  aspek_c: 'Utama' | 'Penunjang';
  indikator: string;
  target_tahunan: string;
  formulasi: string | null;
  ekspektasi: string | null;
  renaksi_id: number | null;
  atasan_rhk_id: number | null;
  urutan: number;
  triwulan: IkiTriwulanRow[];
};

export type IkiDokumenDetail = IkiDokumenRow & {
  rhk: IkiRhkRow[];
  // Dokumen atasan diubah setelah save terakhir dokumen ini (peringatan lunak, DRAFT saja)
  atasan_stale: boolean;
};

export type IkiVersiMeta = {
  id: number;
  versi_ke: number;
  pemicu: 'FINALIZE' | 'UNFINALIZE';
  created_by_nama: string | null;
  created_at: string;
};

export async function listDokumen(tahun?: string) {
  const rows = tahun
    ? await sql`
        SELECT d.id, d.tahun, d.varian, d.nama, d.nip, d.jabatan, d.status, d.version,
               d.updated_at, COUNT(r.id) AS jumlah_rhk
        FROM iki_dokumen d
        LEFT JOIN iki_rhk r ON r.dokumen_id = d.id
        WHERE d.tahun = ${tahun}
        GROUP BY d.id
        ORDER BY d.tahun DESC, d.varian = 'DIREKTUR' DESC, d.jabatan ASC`
    : await sql`
        SELECT d.id, d.tahun, d.varian, d.nama, d.nip, d.jabatan, d.status, d.version,
               d.updated_at, COUNT(r.id) AS jumlah_rhk
        FROM iki_dokumen d
        LEFT JOIN iki_rhk r ON r.dokumen_id = d.id
        GROUP BY d.id
        ORDER BY d.tahun DESC, d.varian = 'DIREKTUR' DESC, d.jabatan ASC`;
  return rows;
}

export async function createDokumen(input: {
  tahun: string; varian: 'STANDAR' | 'DIREKTUR';
  nama: string; nip: string; jabatan: string;
}, userId: number): Promise<number> {
  const dup = await queryOne<{ id: number }>(
    sql`SELECT id FROM iki_dokumen WHERE nip = ${input.nip} AND tahun = ${input.tahun} LIMIT 1`,
  );
  if (dup) throw new Error(`Dokumen IKI untuk NIP ${input.nip} tahun ${input.tahun} sudah ada.`);
  try {
    const res = await execWrite(sql`
      INSERT INTO iki_dokumen (tahun, varian, nama, nip, jabatan, created_by, updated_by)
      VALUES (${input.tahun}, ${input.varian}, ${input.nama}, ${input.nip}, ${input.jabatan}, ${userId}, ${userId})
    `);
    return res.insertId;
  } catch (err) {
    // Race SELECT→INSERT: UNIQUE uk_iki_nip_tahun penjaga terakhir → pesan ramah, bukan 500
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw new Error(`Dokumen IKI untuk NIP ${input.nip} tahun ${input.tahun} sudah ada.`);
    }
    throw err;
  }
}

export async function getDokumen(id: number): Promise<IkiDokumenDetail | null> {
  const doc = await queryOne<IkiDokumenRow>(
    sql`SELECT id, tahun, varian, opd, nama, nip, jabatan, pangkat, ikhtisar,
               nama_atasan, nip_atasan, jabatan_atasan, pangkat_atasan, kota_ttd,
               DATE_FORMAT(tanggal_ttd, '%Y-%m-%d') AS tanggal_ttd,
               atasan_dokumen_id, status, version
        FROM iki_dokumen WHERE id = ${id} LIMIT 1`,
  );
  if (!doc) return null;
  const rhkRows = await queryMany<Omit<IkiRhkRow, 'triwulan'>>(
    sql`SELECT id, no_urut, rhk_intervensi, rhk, aspek_a, aspek_b, aspek_c, indikator,
               target_tahunan, formulasi, ekspektasi, renaksi_id, atasan_rhk_id, urutan
        FROM iki_rhk WHERE dokumen_id = ${id}
        ORDER BY no_urut ASC, urutan ASC`,
  );
  const twRows = rhkRows.length
    ? await queryMany<IkiTriwulanRow & { rhk_id: number }>(
        sql`SELECT t.rhk_id, t.triwulan, t.target_tw, t.uraian, t.target_aksi
            FROM iki_rhk_triwulan t
            JOIN iki_rhk r ON r.id = t.rhk_id
            WHERE r.dokumen_id = ${id}
            ORDER BY t.triwulan ASC`,
      )
    : [];
  const twByRhk = new Map<number, IkiTriwulanRow[]>();
  for (const t of twRows) {
    const list = twByRhk.get(t.rhk_id) ?? [];
    list.push({ triwulan: t.triwulan, target_tw: t.target_tw, uraian: t.uraian, target_aksi: t.target_aksi });
    twByRhk.set(t.rhk_id, list);
  }
  // Banding di SQL (bukan JS) supaya bebas urusan timezone parsing
  let atasanStale = false;
  if (doc.atasan_dokumen_id && doc.status === 'DRAFT') {
    const stale = await queryOne<{ stale: number }>(
      sql`SELECT (a.updated_at > d.updated_at) AS stale
          FROM iki_dokumen d JOIN iki_dokumen a ON a.id = d.atasan_dokumen_id
          WHERE d.id = ${id} LIMIT 1`,
    );
    atasanStale = Number(stale?.stale ?? 0) === 1;
  }
  return {
    ...doc,
    rhk: rhkRows.map((r) => ({ ...r, triwulan: twByRhk.get(r.id) ?? [] })),
    atasan_stale: atasanStale,
  };
}

/**
 * Duplikasi dokumen ke tahun lain: header + seluruh RHK & triwulan disalin,
 * status/version/tanggal_ttd di-reset. renaksi_id & atasan_rhk_id di-NULL-kan
 * (id milik tahun lama, pasti basi). atasan_dokumen_id di-resolve best-effort
 * via NIP dokumen atasan lama di tahun target.
 */
export async function duplicateDokumen(id: number, tahunTarget: string, userId: number): Promise<number> {
  const src = await getDokumen(id);
  if (!src) throw new IkiNotFoundError();
  if (src.tahun === tahunTarget) throw new Error('Tahun tujuan sama dengan tahun sumber.');
  const dup = await queryOne<{ id: number }>(
    sql`SELECT id FROM iki_dokumen WHERE nip = ${src.nip} AND tahun = ${tahunTarget} LIMIT 1`,
  );
  if (dup) throw new Error(`Dokumen IKI untuk NIP ${src.nip} tahun ${tahunTarget} sudah ada.`);

  let atasanTarget: number | null = null;
  if (src.atasan_dokumen_id) {
    const found = await queryOne<{ id: number }>(
      sql`SELECT b.id FROM iki_dokumen a
          JOIN iki_dokumen b ON b.nip = a.nip AND b.tahun = ${tahunTarget}
          WHERE a.id = ${src.atasan_dokumen_id} LIMIT 1`,
    );
    atasanTarget = found?.id ?? null;
  }

  let newId = 0;
  try {
    await withTransaction(async ({ tx, conn }) => {
      const ins = await tx`
        INSERT INTO iki_dokumen (tahun, varian, opd, nama, nip, jabatan, pangkat, ikhtisar,
          nama_atasan, nip_atasan, jabatan_atasan, pangkat_atasan, kota_ttd,
          atasan_dokumen_id, created_by, updated_by)
        VALUES (${tahunTarget}, ${src.varian}, ${src.opd}, ${src.nama}, ${src.nip}, ${src.jabatan},
          ${src.pangkat}, ${src.ikhtisar}, ${src.nama_atasan}, ${src.nip_atasan},
          ${src.jabatan_atasan}, ${src.pangkat_atasan}, ${src.kota_ttd},
          ${atasanTarget}, ${userId}, ${userId})
      ` as unknown as Array<{ insertId: number }>;
      newId = Number(ins[0]?.insertId ?? 0);
      if (!newId) throw new Error('Gagal membuat dokumen duplikat.');

      if (src.rhk.length > 0) {
        const rhkRows = src.rhk.map((r, i) => [
          newId, r.no_urut, r.rhk_intervensi, r.rhk, r.aspek_a, r.aspek_b, r.aspek_c,
          r.indikator, r.target_tahunan, r.formulasi, r.ekspektasi, null, null, i,
        ]);
        await bulkInsert('iki_rhk', [
          'dokumen_id', 'no_urut', 'rhk_intervensi', 'rhk', 'aspek_a', 'aspek_b', 'aspek_c',
          'indikator', 'target_tahunan', 'formulasi', 'ekspektasi', 'renaksi_id', 'atasan_rhk_id', 'urutan',
        ], rhkRows, conn);
        const inserted = await tx`
          SELECT id, urutan FROM iki_rhk WHERE dokumen_id = ${newId} ORDER BY urutan ASC
        ` as unknown as { id: number; urutan: number }[];
        const idByUrutan = new Map(inserted.map(r => [r.urutan, r.id]));
        const twRows: unknown[][] = [];
        src.rhk.forEach((r, i) => {
          const rhkId = idByUrutan.get(i);
          if (!rhkId) throw new Error('Gagal memetakan baris RHK duplikat.');
          for (const t of r.triwulan) {
            twRows.push([rhkId, t.triwulan, t.target_tw, t.uraian, t.target_aksi]);
          }
        });
        if (twRows.length) {
          await bulkInsert('iki_rhk_triwulan',
            ['rhk_id', 'triwulan', 'target_tw', 'uraian', 'target_aksi'], twRows, conn);
        }
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw new Error(`Dokumen IKI untuk NIP ${src.nip} tahun ${tahunTarget} sudah ada.`);
    }
    throw err;
  }
  return newId;
}

/**
 * Save nested replace-all: update header (CAS version) + DELETE seluruh RHK
 * lama + bulkInsert RHK & triwulan baru — all-or-nothing (CQ-01/V5).
 * Mapping rhk_id triwulan: SELECT ulang id by urutan (bukan asumsi insertId
 * berurutan — innodb_autoinc_lock_mode=2 bisa interleaved).
 */
export async function saveDokumen(id: number, input: SaveDokumenInput, userId: number): Promise<number> {
  const current = await queryOne<{ status: string; version: number }>(
    sql`SELECT status, version FROM iki_dokumen WHERE id = ${id} LIMIT 1`,
  );
  if (!current) throw new IkiNotFoundError();
  if (current.status === 'FINAL') throw new IkiFinalError();
  if (current.version !== input.expected_version) throw new IkiVersionConflictError();

  // L68: soft-FK existence checks di luar transaksi (read-only)
  if (input.atasan_dokumen_id) {
    const atasan = await queryOne<{ id: number }>(
      sql`SELECT id FROM iki_dokumen WHERE id = ${input.atasan_dokumen_id} LIMIT 1`,
    );
    if (!atasan) throw new Error('Dokumen atasan tidak ditemukan.');
    if (input.atasan_dokumen_id === id) throw new Error('Dokumen tidak bisa menjadi atasan dirinya sendiri.');
  }
  const renaksiIds = [...new Set(input.rhk.map(r => r.renaksi_id).filter((v): v is number => !!v))];
  if (renaksiIds.length) {
    const found = await queryMany<{ id: number }>(
      sql`SELECT id FROM rencana_aksi WHERE id IN (${renaksiIds})`,
    );
    if (found.length !== renaksiIds.length) throw new Error('Sebagian referensi Rencana Aksi tidak ditemukan.');
  }
  // L68: atasan_rhk_id hanya jejak; id RHK atasan berubah tiap save replace-all
  // dokumen atasan, jadi referensi basi di-NULL-kan (bukan reject) agar save tidak macet
  const atasanRhkIds = [...new Set(input.rhk.map(r => r.atasan_rhk_id).filter((v): v is number => !!v))];
  const validAtasanRhk = new Set<number>();
  if (atasanRhkIds.length) {
    const found = await queryMany<{ id: number }>(
      sql`SELECT id FROM iki_rhk WHERE id IN (${atasanRhkIds})`,
    );
    for (const f of found) validAtasanRhk.add(f.id);
  }

  const newVersion = input.expected_version + 1;
  await withTransaction(async ({ tx, conn }) => {
    const upd = await tx`
      UPDATE iki_dokumen SET
        varian = ${input.varian},
        opd = ${input.opd},
        nama = ${input.nama},
        nip = ${input.nip},
        jabatan = ${input.jabatan},
        pangkat = ${input.pangkat ?? null},
        ikhtisar = ${input.ikhtisar ?? null},
        nama_atasan = ${input.varian === 'DIREKTUR' ? null : (input.nama_atasan ?? null)},
        nip_atasan = ${input.varian === 'DIREKTUR' ? null : (input.nip_atasan ?? null)},
        jabatan_atasan = ${input.varian === 'DIREKTUR' ? null : (input.jabatan_atasan ?? null)},
        pangkat_atasan = ${input.varian === 'DIREKTUR' ? null : (input.pangkat_atasan ?? null)},
        kota_ttd = ${input.kota_ttd},
        tanggal_ttd = ${input.tanggal_ttd ?? null},
        atasan_dokumen_id = ${input.varian === 'DIREKTUR' ? null : (input.atasan_dokumen_id ?? null)},
        version = ${newVersion},
        updated_by = ${userId}
      WHERE id = ${id} AND version = ${input.expected_version} AND status = 'DRAFT'
    ` as unknown as Array<{ affectedRows: number }>;
    // L53: tx wrapper return Array<{affectedRows}>, akses lewat [0]
    if (Number(upd[0]?.affectedRows ?? 0) === 0) throw new IkiVersionConflictError();

    await tx`DELETE FROM iki_rhk WHERE dokumen_id = ${id}`;

    if (input.rhk.length > 0) {
      const rhkRows = input.rhk.map((r, i) => [
        id, r.no_urut,
        input.varian === 'DIREKTUR' ? null : (r.rhk_intervensi ?? null),
        r.rhk, r.aspek_a, r.aspek_b, r.aspek_c, r.indikator, r.target_tahunan,
        r.formulasi ?? null,
        input.varian === 'DIREKTUR' ? null : (r.ekspektasi ?? null),
        r.renaksi_id ?? null,
        r.atasan_rhk_id && validAtasanRhk.has(r.atasan_rhk_id) ? r.atasan_rhk_id : null, i,
      ]);
      await bulkInsert('iki_rhk', [
        'dokumen_id', 'no_urut', 'rhk_intervensi', 'rhk', 'aspek_a', 'aspek_b', 'aspek_c',
        'indikator', 'target_tahunan', 'formulasi', 'ekspektasi', 'renaksi_id', 'atasan_rhk_id', 'urutan',
      ], rhkRows, conn);

      const inserted = await tx`
        SELECT id, urutan FROM iki_rhk WHERE dokumen_id = ${id} ORDER BY urutan ASC
      ` as unknown as { id: number; urutan: number }[];
      const idByUrutan = new Map(inserted.map(r => [r.urutan, r.id]));

      const twRows: unknown[][] = [];
      input.rhk.forEach((r, i) => {
        const rhkId = idByUrutan.get(i);
        if (!rhkId) throw new Error('Gagal memetakan baris RHK tersimpan.');
        for (const t of r.triwulan) {
          twRows.push([rhkId, t.triwulan, t.target_tw, t.uraian ?? null, t.target_aksi]);
        }
      });
      if (twRows.length) {
        await bulkInsert('iki_rhk_triwulan',
          ['rhk_id', 'triwulan', 'target_tw', 'uraian', 'target_aksi'], twRows, conn);
      }
    }
  });
  return newVersion;
}

export async function deleteDokumen(id: number): Promise<void> {
  // Anti-TOCTOU: guard FINAL di klausa DELETE (pola sama dgn finalizeDokumen)
  const res = await execWrite(sql`DELETE FROM iki_dokumen WHERE id = ${id} AND status <> 'FINAL'`);
  if (res.affectedRows === 0) {
    const exists = await queryOne<{ id: number }>(sql`SELECT id FROM iki_dokumen WHERE id = ${id} LIMIT 1`);
    if (!exists) throw new IkiNotFoundError();
    throw new IkiFinalError();
  }
}

export async function finalizeDokumen(id: number, expectedVersion: number, userId: number): Promise<void> {
  const res = await execWrite(sql`
    UPDATE iki_dokumen
    SET status = 'FINAL', version = ${expectedVersion + 1}, updated_by = ${userId}
    WHERE id = ${id} AND version = ${expectedVersion} AND status = 'DRAFT'
  `);
  if (res.affectedRows === 0) {
    const exists = await queryOne<{ id: number }>(sql`SELECT id FROM iki_dokumen WHERE id = ${id} LIMIT 1`);
    if (!exists) throw new IkiNotFoundError();
    throw new IkiVersionConflictError();
  }
}

/** SUPER_ADMIN only (dicek di route): buka kembali dokumen FINAL → DRAFT. */
export async function unfinalizeDokumen(id: number, userId: number): Promise<void> {
  const res = await execWrite(sql`
    UPDATE iki_dokumen
    SET status = 'DRAFT', version = version + 1, updated_by = ${userId}
    WHERE id = ${id} AND status = 'FINAL'
  `);
  if (res.affectedRows === 0) throw new IkiNotFoundError();
}

// ─── Riwayat versi (snapshot JSON, pola ringkas lkjip_versi) ─────────────────

const VERSI_RETENTION = 20;

/**
 * Snapshot isi dokumen ke iki_versi. Dipanggil setelah FINALIZE/UNFINALIZE
 * sukses (terserialisasi oleh CAS di caller). Best-effort: gagal snapshot
 * tidak boleh menggagalkan aksi utamanya — caller membungkus try/catch.
 */
export async function snapshotVersi(
  dokumenId: number,
  pemicu: 'FINALIZE' | 'UNFINALIZE',
  userId: number,
): Promise<void> {
  const detail = await getDokumen(dokumenId);
  if (!detail) return;
  const next = await queryOne<{ n: number }>(
    sql`SELECT COALESCE(MAX(versi_ke), 0) + 1 AS n FROM iki_versi WHERE dokumen_id = ${dokumenId}`,
  );
  await execWrite(sql`
    INSERT INTO iki_versi (dokumen_id, versi_ke, pemicu, snapshot, created_by)
    VALUES (${dokumenId}, ${next?.n ?? 1}, ${pemicu}, ${JSON.stringify(detail)}, ${userId})
  `);
  await execWrite(sql`
    DELETE FROM iki_versi WHERE dokumen_id = ${dokumenId} AND id NOT IN (
      SELECT id FROM (
        SELECT id FROM iki_versi WHERE dokumen_id = ${dokumenId}
        ORDER BY versi_ke DESC LIMIT ${VERSI_RETENTION}
      ) keep
    )
  `);
}

/** List riwayat metadata-only (anti-lemot — snapshot JSON tidak ikut). */
export async function listVersi(dokumenId: number): Promise<IkiVersiMeta[]> {
  return queryMany<IkiVersiMeta>(
    sql`SELECT v.id, v.versi_ke, v.pemicu, u.username AS created_by_nama, v.created_at
        FROM iki_versi v
        LEFT JOIN users u ON u.id = v.created_by
        WHERE v.dokumen_id = ${dokumenId}
        ORDER BY v.versi_ke DESC`,
  );
}

/**
 * Pulihkan isi dokumen dari snapshot — hanya DRAFT, replace-all lewat jalur
 * saveDokumen yang sudah ber-CAS (data ikut tervalidasi guard yang sama).
 */
export async function restoreVersi(dokumenId: number, versiId: number, userId: number): Promise<number> {
  const row = await queryOne<{ snapshot: string | object }>(
    sql`SELECT snapshot FROM iki_versi WHERE id = ${versiId} AND dokumen_id = ${dokumenId} LIMIT 1`,
  );
  if (!row) throw new Error('Versi tidak ditemukan.');
  const cur = await queryOne<{ version: number }>(
    sql`SELECT version FROM iki_dokumen WHERE id = ${dokumenId} LIMIT 1`,
  );
  if (!cur) throw new IkiNotFoundError();
  // mysql2 kolom JSON bisa datang sudah ter-parse
  const snap = (typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot) as IkiDokumenDetail;
  const input: SaveDokumenInput = {
    expected_version: cur.version,
    varian: snap.varian,
    opd: snap.opd,
    nama: snap.nama,
    nip: snap.nip,
    jabatan: snap.jabatan,
    pangkat: snap.pangkat,
    ikhtisar: snap.ikhtisar,
    nama_atasan: snap.nama_atasan,
    nip_atasan: snap.nip_atasan,
    jabatan_atasan: snap.jabatan_atasan,
    pangkat_atasan: snap.pangkat_atasan,
    kota_ttd: snap.kota_ttd,
    tanggal_ttd: snap.tanggal_ttd,
    atasan_dokumen_id: snap.atasan_dokumen_id,
    rhk: snap.rhk.map((r) => ({
      no_urut: r.no_urut,
      rhk_intervensi: r.rhk_intervensi,
      rhk: r.rhk,
      aspek_a: r.aspek_a,
      aspek_b: r.aspek_b,
      aspek_c: r.aspek_c,
      indikator: r.indikator,
      target_tahunan: r.target_tahunan,
      formulasi: r.formulasi,
      ekspektasi: r.ekspektasi,
      renaksi_id: r.renaksi_id,
      atasan_rhk_id: r.atasan_rhk_id,
      urutan: r.urutan,
      triwulan: r.triwulan.map((t) => ({
        triwulan: t.triwulan,
        target_tw: t.target_tw,
        uraian: t.uraian,
        target_aksi: t.target_aksi,
      })),
    })),
  };
  return saveDokumen(dokumenId, input, userId);
}
