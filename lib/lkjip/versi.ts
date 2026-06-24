// ═══ PRIMA — LKJIP — Versi/Riwayat (snapshot + pulihkan) ══════════
// Hybrid: snapshot struktur (bab+blok+style) di DB utk PULIHKAN/edit-ulang;
// docx arsip ke Drive di-handle route (best-effort). List = metadata only.
import { sql, queryOne, queryMany, withTransaction, bulkInsert, sqlInt } from '@/lib/data/db';
import { getDokumen, LkjipNotFoundError, LkjipFinalError, LkjipVersionConflictError } from './data';
import type { StyleConfig } from './schemas';

const RETENTION = 20; // simpan N versi terakhir per dokumen (prune otomatis)

interface SnapBlock { tipe: 'NARASI' | 'TABEL' | 'GAMBAR'; urutan: number; payload: unknown }
interface SnapSection { old_id: number; parent_old_id: number | null; depth: number; urutan: number; judul: string; locked: number; blocks: SnapBlock[] }
interface Snapshot { judul: string; style_config: StyleConfig; sections: SnapSection[] }

export interface VersiMeta {
  id: number; versi_no: number; label: string | null;
  drive_file_id: string | null; drive_name: string | null;
  created_at: string; created_by_name: string | null;
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return {}; } }

/** Bangun snapshot dari state dokumen terkini. */
async function buildSnapshot(dokumenId: number, judul: string, style: StyleConfig): Promise<Snapshot> {
  const sections = await queryMany<{ id: number; parent_id: number | null; depth: number; urutan: number; judul: string; locked: number }>(sql`
    SELECT id, parent_id, depth, urutan, judul, locked FROM lkjip_section WHERE dokumen_id = ${dokumenId}
  `);
  const ids = sections.map(s => Number(s.id));
  let blocks: { section_id: number; tipe: SnapBlock['tipe']; urutan: number; payload: unknown }[] = [];
  if (ids.length > 0) {
    blocks = await queryMany(sql`SELECT section_id, tipe, urutan, payload FROM lkjip_block WHERE section_id IN (${ids})`);
  }
  const bySec = new Map<number, SnapBlock[]>();
  for (const b of blocks) {
    const arr = bySec.get(Number(b.section_id)) ?? [];
    arr.push({ tipe: b.tipe, urutan: Number(b.urutan ?? 0), payload: typeof b.payload === 'string' ? safeJson(b.payload) : b.payload });
    bySec.set(Number(b.section_id), arr);
  }
  return {
    judul, style_config: style,
    sections: sections.map(s => ({
      old_id: Number(s.id),
      parent_old_id: s.parent_id == null ? null : Number(s.parent_id),
      depth: Number(s.depth ?? 0), urutan: Number(s.urutan ?? 0),
      judul: String(s.judul ?? ''), locked: Number(s.locked ?? 0),
      blocks: (bySec.get(Number(s.id)) ?? []).sort((a, b) => a.urutan - b.urutan),
    })),
  };
}

/** Simpan versi (snapshot ke DB). Return id + versi_no. Prune retention. */
export async function saveVersi(dokumenId: number, label: string | undefined, userId: number): Promise<{ id: number; versi_no: number }> {
  const doc = await getDokumen(dokumenId);
  if (!doc) throw new LkjipNotFoundError();
  const snap = await buildSnapshot(dokumenId, doc.judul, doc.style_config);
  return withTransaction(async ({ tx }) => {
    const mx = await tx`SELECT COALESCE(MAX(versi_no), 0) + 1 AS n FROM lkjip_versi WHERE dokumen_id = ${dokumenId}` as Array<{ n: number }>;
    const versi_no = Number(mx[0]?.n ?? 1);
    const res = await tx`
      INSERT INTO lkjip_versi (dokumen_id, versi_no, label, snapshot, created_by)
      VALUES (${dokumenId}, ${versi_no}, ${label?.trim() || null}, ${JSON.stringify(snap)}, ${userId})
    ` as unknown as Array<{ insertId: number }>;
    const id = Number(res[0]?.insertId ?? 0);
    // Prune: sisakan RETENTION versi terbaru (by versi_no)
    await tx`
      DELETE FROM lkjip_versi WHERE dokumen_id = ${dokumenId} AND id NOT IN (
        SELECT id FROM (
          SELECT id FROM lkjip_versi WHERE dokumen_id = ${dokumenId} ORDER BY versi_no DESC LIMIT ${sqlInt(RETENTION)}
        ) keep
      )
    `;
    return { id, versi_no };
  });
}

export async function setVersiDrive(versiId: number, fileId: string, name: string): Promise<void> {
  await sql`UPDATE lkjip_versi SET drive_file_id = ${fileId}, drive_name = ${name} WHERE id = ${versiId}`;
}

export async function listVersi(dokumenId: number): Promise<VersiMeta[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT v.id, v.versi_no, v.label, v.drive_file_id, v.drive_name, v.created_at, u.username AS created_by_name
    FROM lkjip_versi v LEFT JOIN users u ON u.id = v.created_by
    WHERE v.dokumen_id = ${dokumenId}
    ORDER BY v.versi_no DESC LIMIT 100
  `);
  return rows.map(r => ({
    id: Number(r.id), versi_no: Number(r.versi_no), label: (r.label as string | null) ?? null,
    drive_file_id: (r.drive_file_id as string | null) ?? null, drive_name: (r.drive_name as string | null) ?? null,
    created_at: String(r.created_at ?? ''), created_by_name: (r.created_by_name as string | null) ?? null,
  }));
}

/** Pulihkan dokumen ke snapshot versi (rebuild bab+blok). CAS pada dokumen version.
 *  @param dokumenId dokumen dari URL — versi WAJIB milik dokumen ini (cegah cross-doc). */
export async function restoreVersi(versiId: number, dokumenId: number, expectedVersion: number, userId: number): Promise<void> {
  const row = await queryOne<{ dokumen_id: number; snapshot: unknown }>(sql`
    SELECT dokumen_id, snapshot FROM lkjip_versi WHERE id = ${versiId} LIMIT 1
  `);
  if (!row || Number(row.dokumen_id) !== dokumenId) throw new LkjipNotFoundError('Versi tidak ditemukan.');
  const doc = await getDokumen(dokumenId);
  if (!doc) throw new LkjipNotFoundError();
  if (doc.status === 'FINAL') throw new LkjipFinalError();
  const snap = (typeof row.snapshot === 'string' ? safeJson(row.snapshot) : row.snapshot) as Snapshot;
  const secs = [...(snap.sections ?? [])].sort((a, b) => (a.depth - b.depth) || (a.urutan - b.urutan));

  await withTransaction(async ({ tx, conn }) => {
    const upd = await tx`
      UPDATE lkjip_dokumen SET
        judul        = ${snap.judul ?? doc.judul},
        style_config = ${JSON.stringify(snap.style_config ?? doc.style_config)},
        version      = version + 1,
        updated_by   = ${userId}
      WHERE id = ${dokumenId} AND version = ${expectedVersion}
    ` as unknown as Array<{ affectedRows?: number }>;
    if ((upd[0]?.affectedRows ?? 0) !== 1) throw new LkjipVersionConflictError();

    await tx`DELETE FROM lkjip_section WHERE dokumen_id = ${dokumenId}`; // blok ikut CASCADE

    const idMap = new Map<number, number>();
    for (const s of secs) {
      const parentNew = s.parent_old_id == null ? null : (idMap.get(s.parent_old_id) ?? null);
      const res = await tx`
        INSERT INTO lkjip_section (dokumen_id, parent_id, depth, urutan, judul, locked)
        VALUES (${dokumenId}, ${parentNew}, ${s.depth}, ${s.urutan}, ${s.judul}, ${s.locked})
      ` as unknown as Array<{ insertId: number }>;
      idMap.set(s.old_id, Number(res[0]?.insertId ?? 0));
    }
    const blockRows: unknown[][] = [];
    for (const s of secs) {
      const sid = idMap.get(s.old_id);
      if (!sid) continue;
      for (const b of s.blocks ?? []) blockRows.push([sid, b.urutan, b.tipe, JSON.stringify(b.payload)]);
    }
    if (blockRows.length > 0) await bulkInsert('lkjip_block', ['section_id', 'urutan', 'tipe', 'payload'], blockRows, conn);
  });
}
