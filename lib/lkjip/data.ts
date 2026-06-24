// ═══ PRIMA — LKJIP — Data Layer ═══════════════════════════════════
// CRUD dokumen/section/block. Optimistic lock dokumen-level via `version` (L48 CAS).
// canonical_id derive dari AUTO_INCREMENT id (anti-race, bukan MAX+1).
// Nomor section TIDAK disimpan — dihitung di buildNumberedTree (numbering.ts).
// Dokumen FINAL = immutable: semua mutasi struktur/isi ditolak (state-machine).
import { sql, queryMany, queryOne, withTransaction, bulkInsert, escapeLike, sqlInt } from '@/lib/data/db';
import {
  buildNumberedTree, MAX_DEPTH,
  type SectionFlat, type SectionNode, type BlockNode,
} from './numbering';
import { parseBlockPayload, DEFAULT_STYLE, StyleConfigSchema, type StyleConfig, type BlockTipe, type DokumenQuery, type SectionCreate, type SectionMove } from './schemas';

export class LkjipVersionConflictError extends Error {
  constructor() { super('Dokumen sudah diubah pengguna lain. Memuat versi terbaru.'); this.name = 'LkjipVersionConflictError'; }
}
export class LkjipNotFoundError extends Error {
  constructor(msg = 'Data tidak ditemukan.') { super(msg); this.name = 'LkjipNotFoundError'; }
}
export class LkjipFinalError extends Error {
  constructor() { super('Dokumen sudah final (terkunci) — tidak bisa diubah.'); this.name = 'LkjipFinalError'; }
}
export class LkjipStructureError extends Error {
  constructor(msg: string) { super(msg); this.name = 'LkjipStructureError'; }
}

export interface LkjipDokumen {
  id: number;
  canonical_id: string;
  tahun: number;
  judul: string;
  jenis: 'LKJIP';
  status: 'DRAFT' | 'FINAL';
  style_config: StyleConfig;
  version: number;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LkjipDetail extends LkjipDokumen {
  tree: SectionNode[];
}

// ── Skeleton default (seed) — 4 BAB wajib (locked). Konsep §2.5. ──
// LAMPIRAN ditambah manual oleh admin (hindari "BAB V" salah-romawi).
const SEED_SKELETON: { judul: string; children: string[] }[] = [
  { judul: 'PENDAHULUAN', children: [
    'Latar Belakang', 'Isu-isu Strategis', 'Dukungan SDM, Sarana-Prasarana dan Anggaran',
    'Sistematika Penulisan', 'Tindak Lanjut atas Laporan Hasil Evaluasi SAKIP', 'Langkah Perbaikan Internal OPD',
  ] },
  { judul: 'PERENCANAAN KINERJA', children: [
    'Tujuan, Sasaran, dan Indikator Kinerja OPD', 'Strategi dan Arah Kebijakan',
    'Struktur Program dan Kegiatan', 'Perjanjian Kinerja', 'Instrumen Pendukung Capaian Kinerja',
  ] },
  { judul: 'AKUNTABILITAS KINERJA', children: [
    'Capaian Kinerja Organisasi', 'Realisasi Anggaran', 'Kinerja Pendapatan', 'Inovasi', 'Penghargaan',
  ] },
  { judul: 'PENUTUP', children: ['Kesimpulan', 'Rekomendasi'] },
];

function parseStyleConfig(raw: unknown): StyleConfig {
  const obj = typeof raw === 'string' ? safeJson(raw) : raw;
  const parsed = StyleConfigSchema.safeParse(obj ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_STYLE };
}

function mapDokumen(r: Record<string, unknown>): LkjipDokumen {
  return {
    id: Number(r.id),
    canonical_id: String(r.canonical_id ?? ''),
    tahun: Number(r.tahun),
    judul: String(r.judul ?? ''),
    jenis: 'LKJIP',
    status: (r.status ?? 'DRAFT') as 'DRAFT' | 'FINAL',
    style_config: parseStyleConfig(r.style_config),
    version: Number(r.version ?? 0),
    finalized_at: r.finalized_at ? String(r.finalized_at) : null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

const DOC_COLS = sql`id, canonical_id, tahun, judul, jenis, status, style_config, version, finalized_at, created_at, updated_at`;

// ── Dokumen list / get ───────────────────────────────────────────
export interface DokumenListResult { rows: LkjipDokumen[]; total: number; page: number; limit: number }

export async function listDokumen(f: DokumenQuery): Promise<DokumenListResult> {
  let where = sql`WHERE 1=1`;
  if (f.tahun)  where = sql`${where} AND tahun = ${f.tahun}`;
  if (f.status) where = sql`${where} AND status = ${f.status}`;
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    where = sql`${where} AND (judul LIKE ${term} OR canonical_id LIKE ${term})`;
  }
  const offset = (f.page - 1) * f.limit;
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${DOC_COLS} FROM lkjip_dokumen ${where}
    ORDER BY tahun DESC, id DESC
    LIMIT ${sqlInt(f.limit)} OFFSET ${sqlInt(offset)}
  `);
  const totalRow = await queryOne<{ total: number }>(sql`SELECT COUNT(*) AS total FROM lkjip_dokumen ${where}`);
  return { rows: rows.map(mapDokumen), total: Number(totalRow?.total ?? 0), page: f.page, limit: f.limit };
}

export async function getDokumen(id: number): Promise<LkjipDokumen | null> {
  const r = await queryOne<Record<string, unknown>>(sql`SELECT ${DOC_COLS} FROM lkjip_dokumen WHERE id = ${id} LIMIT 1`);
  return r ? mapDokumen(r) : null;
}

export async function getDokumenDetail(id: number): Promise<LkjipDetail | null> {
  const doc = await getDokumen(id);
  if (!doc) return null;

  const sections = await queryMany<SectionFlat>(sql`
    SELECT id, parent_id, depth, urutan, judul, locked
    FROM lkjip_section WHERE dokumen_id = ${id}
  `);
  const sectionIds = sections.map(s => s.id);
  let blocks: (BlockNode & { section_id: number })[] = [];
  if (sectionIds.length > 0) {
    blocks = await queryMany<BlockNode & { section_id: number }>(sql`
      SELECT id, section_id, tipe, payload, urutan
      FROM lkjip_block WHERE section_id IN (${sectionIds})
    `);
  }
  const blocksBySection = new Map<number, BlockNode[]>();
  for (const b of blocks) {
    const arr = blocksBySection.get(b.section_id) ?? [];
    // mysql2 JSON column → sudah object; kalau string, parse defensif
    const payload = typeof b.payload === 'string' ? safeJson(b.payload) : b.payload;
    arr.push({ id: Number(b.id), tipe: b.tipe, payload, urutan: Number(b.urutan ?? 0) });
    blocksBySection.set(b.section_id, arr);
  }
  const normSections: SectionFlat[] = sections.map(s => ({
    id: Number(s.id),
    parent_id: s.parent_id == null ? null : Number(s.parent_id),
    depth: Number(s.depth ?? 0),
    urutan: Number(s.urutan ?? 0),
    judul: String(s.judul ?? ''),
    locked: Number(s.locked ?? 0),
  }));
  return { ...doc, tree: buildNumberedTree(normSections, blocksBySection) };
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return {}; }
}

// ── Dokumen create (seed skeleton) ───────────────────────────────
export async function createDokumen(tahun: number, judul: string | undefined, userId: number, template: 'standar' | 'kosong' = 'standar'): Promise<{ id: number; canonical_id: string }> {
  const finalJudul = judul && judul.trim() ? judul.trim() : `Laporan Kinerja Instansi Pemerintah Tahun ${tahun}`;
  return withTransaction(async ({ tx, conn }) => {
    const res = await tx`
      INSERT INTO lkjip_dokumen (canonical_id, tahun, judul, jenis, status, created_by, updated_by)
      VALUES ('', ${tahun}, ${finalJudul}, 'LKJIP', 'DRAFT', ${userId}, ${userId})
    ` as unknown as Array<{ insertId: number }>;
    const id = Number(res[0]?.insertId ?? 0);
    const canonical_id = `LKJIP-${String(id).padStart(6, '0')}`;
    await tx`UPDATE lkjip_dokumen SET canonical_id = ${canonical_id} WHERE id = ${id}`;

    // Seed skeleton standar (BAB I–V) — hanya bila template 'standar'.
    // 'kosong' → dokumen tanpa bab, user susun sendiri. locked=0 (default tak terkunci).
    if (template === 'standar') {
      for (let bi = 0; bi < SEED_SKELETON.length; bi++) {
        const bab = SEED_SKELETON[bi];
        const babRes = await tx`
          INSERT INTO lkjip_section (dokumen_id, parent_id, depth, urutan, judul, locked)
          VALUES (${id}, NULL, 0, ${bi}, ${bab.judul}, 0)
        ` as unknown as Array<{ insertId: number }>;
        const babId = Number(babRes[0]?.insertId ?? 0);
        if (bab.children.length > 0) {
          await bulkInsert(
            'lkjip_section',
            ['dokumen_id', 'parent_id', 'depth', 'urutan', 'judul', 'locked'],
            bab.children.map((c, ci) => [id, babId, 1, ci, c, 0]),
            conn,
          );
        }
      }
    }
    return { id, canonical_id };
  });
}

function assertCas(res: unknown): void {
  const affected = (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0;
  if (affected !== 1) throw new LkjipVersionConflictError();
}

export async function updateDokumenHeader(
  id: number, expectedVersion: number,
  patch: { judul?: string; style_config?: StyleConfig },
  userId: number,
): Promise<void> {
  const doc = await getDokumen(id);
  if (!doc) throw new LkjipNotFoundError();
  if (doc.status === 'FINAL') throw new LkjipFinalError();
  const styleJson = patch.style_config ? JSON.stringify(patch.style_config) : null;
  const res = await sql`
    UPDATE lkjip_dokumen SET
      judul        = COALESCE(${patch.judul ?? null}, judul),
      style_config = COALESCE(${styleJson}, style_config),
      version      = version + 1,
      updated_by   = ${userId}
    WHERE id = ${id} AND version = ${expectedVersion}
  `;
  assertCas(res);
}

export async function finalizeDokumen(id: number, expectedVersion: number, userId: number): Promise<void> {
  const doc = await getDokumen(id);
  if (!doc) throw new LkjipNotFoundError();
  if (doc.status === 'FINAL') throw new LkjipFinalError();
  const res = await sql`
    UPDATE lkjip_dokumen SET
      status       = 'FINAL',
      finalized_at = NOW(),
      version      = version + 1,
      updated_by   = ${userId}
    WHERE id = ${id} AND version = ${expectedVersion} AND status = 'DRAFT'
  `;
  assertCas(res);
}

export async function deleteDokumen(id: number): Promise<boolean> {
  // sections (CASCADE) + blocks (CASCADE via section FK) ikut terhapus.
  const res = await sql`DELETE FROM lkjip_dokumen WHERE id = ${id}` as unknown as Array<{ affectedRows?: number }>;
  return (res[0]?.affectedRows ?? 0) > 0;
}

// ── Guard DRAFT ──────────────────────────────────────────────────
async function getDokIdBySection(sectionId: number): Promise<{ dokumen_id: number; status: string; locked: number } | null> {
  return queryOne<{ dokumen_id: number; status: string; locked: number }>(sql`
    SELECT s.dokumen_id, d.status, s.locked
    FROM lkjip_section s JOIN lkjip_dokumen d ON d.id = s.dokumen_id
    WHERE s.id = ${sectionId} LIMIT 1
  `);
}

async function assertDraftByDoc(dokumenId: number): Promise<void> {
  const doc = await getDokumen(dokumenId);
  if (!doc) throw new LkjipNotFoundError();
  if (doc.status === 'FINAL') throw new LkjipFinalError();
}

// ── Section ops ──────────────────────────────────────────────────
export async function addSection(input: SectionCreate): Promise<{ id: number }> {
  await assertDraftByDoc(input.dokumen_id);
  let depth = 0;
  if (input.parent_id != null) {
    const parent = await queryOne<{ depth: number; dokumen_id: number }>(sql`
      SELECT depth, dokumen_id FROM lkjip_section WHERE id = ${input.parent_id} LIMIT 1
    `);
    if (!parent || Number(parent.dokumen_id) !== input.dokumen_id) throw new LkjipNotFoundError('Induk section tidak valid.');
    depth = Number(parent.depth) + 1;
    if (depth > MAX_DEPTH) throw new LkjipStructureError(`Kedalaman maksimal ${MAX_DEPTH + 1} tingkat.`);
  }
  const maxRow = await queryOne<{ m: number }>(sql`
    SELECT COALESCE(MAX(urutan), -1) AS m FROM lkjip_section
    WHERE dokumen_id = ${input.dokumen_id} AND ${input.parent_id == null ? sql`parent_id IS NULL` : sql`parent_id = ${input.parent_id}`}
  `);
  const urutan = Number(maxRow?.m ?? -1) + 1;
  const res = await sql`
    INSERT INTO lkjip_section (dokumen_id, parent_id, depth, urutan, judul, locked)
    VALUES (${input.dokumen_id}, ${input.parent_id ?? null}, ${depth}, ${urutan}, ${input.judul}, 0)
  ` as unknown as Array<{ insertId: number }>;
  return { id: Number(res[0]?.insertId ?? 0) };
}

export async function renameSection(id: number, judul: string): Promise<void> {
  const info = await getDokIdBySection(id);
  if (!info) throw new LkjipNotFoundError();
  if (info.status === 'FINAL') throw new LkjipFinalError();
  await sql`UPDATE lkjip_section SET judul = ${judul} WHERE id = ${id}`;
}

export async function deleteSection(id: number): Promise<void> {
  const info = await getDokIdBySection(id);
  if (!info) throw new LkjipNotFoundError();
  if (info.status === 'FINAL') throw new LkjipFinalError();

  const all = await queryMany<{ id: number; parent_id: number | null }>(sql`
    SELECT id, parent_id FROM lkjip_section WHERE dokumen_id = ${info.dokumen_id}
  `);
  const subtree = collectSubtree(id, all);
  await withTransaction(async ({ tx }) => {
    // blocks ikut CASCADE via FK section_id saat section dihapus.
    await tx`DELETE FROM lkjip_section WHERE id IN (${subtree})`;
  });
}

function collectSubtree(rootId: number, all: { id: number; parent_id: number | null }[]): number[] {
  const childrenOf = new Map<number | null, number[]>();
  for (const s of all) {
    const key = s.parent_id == null ? null : Number(s.parent_id);
    const arr = childrenOf.get(key) ?? [];
    arr.push(Number(s.id));
    childrenOf.set(key, arr);
  }
  const out: number[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const c of childrenOf.get(cur) ?? []) stack.push(c);
  }
  return out;
}

export async function moveSection(input: SectionMove): Promise<void> {
  const node = await queryOne<{ dokumen_id: number; depth: number; locked: number }>(sql`
    SELECT dokumen_id, depth, locked FROM lkjip_section WHERE id = ${input.id} LIMIT 1
  `);
  if (!node) throw new LkjipNotFoundError();
  await assertDraftByDoc(Number(node.dokumen_id));

  const all = await queryMany<{ id: number; parent_id: number | null; depth: number; urutan: number }>(sql`
    SELECT id, parent_id, depth, urutan FROM lkjip_section WHERE dokumen_id = ${node.dokumen_id}
  `);
  const norm = all.map(s => ({ id: Number(s.id), parent_id: s.parent_id == null ? null : Number(s.parent_id), depth: Number(s.depth), urutan: Number(s.urutan) }));
  const subtreeIds = new Set(collectSubtree(input.id, norm));

  // Validasi parent baru
  let newDepth = 0;
  if (input.new_parent_id != null) {
    if (subtreeIds.has(input.new_parent_id)) throw new LkjipStructureError('Tidak bisa memindah node ke dalam keturunannya sendiri.');
    const np = norm.find(s => s.id === input.new_parent_id);
    if (!np) throw new LkjipNotFoundError('Induk tujuan tidak valid.');
    newDepth = np.depth + 1;
  }
  // Cek tinggi subtree agar tidak melebihi MAX_DEPTH
  const oldDepth = Number(node.depth);
  let subtreeHeight = 0;
  for (const sid of subtreeIds) {
    const s = norm.find(n => n.id === sid)!;
    subtreeHeight = Math.max(subtreeHeight, s.depth - oldDepth);
  }
  if (newDepth + subtreeHeight > MAX_DEPTH) throw new LkjipStructureError(`Kedalaman maksimal ${MAX_DEPTH + 1} tingkat.`);

  const delta = newDepth - oldDepth;

  // Reindex saudara baru: ambil saudara di parent tujuan (exclude node), sisipkan di new_index.
  const newSiblings = norm
    .filter(s => (s.parent_id ?? null) === (input.new_parent_id ?? null) && s.id !== input.id)
    .sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id))
    .map(s => s.id);
  const idx = Math.min(Math.max(0, input.new_index), newSiblings.length);
  newSiblings.splice(idx, 0, input.id);

  await withTransaction(async ({ tx }) => {
    await tx`UPDATE lkjip_section SET parent_id = ${input.new_parent_id ?? null}, depth = ${newDepth} WHERE id = ${input.id}`;
    if (delta !== 0) {
      for (const sid of subtreeIds) {
        if (sid === input.id) continue;
        const s = norm.find(n => n.id === sid)!;
        await tx`UPDATE lkjip_section SET depth = ${s.depth + delta} WHERE id = ${sid}`;
      }
    }
    for (let i = 0; i < newSiblings.length; i++) {
      await tx`UPDATE lkjip_section SET urutan = ${i} WHERE id = ${newSiblings[i]}`;
    }
  });
}

// ── Block ops ────────────────────────────────────────────────────
export async function addBlock(sectionId: number, tipe: BlockTipe, rawPayload: unknown): Promise<{ id: number }> {
  const info = await getDokIdBySection(sectionId);
  if (!info) throw new LkjipNotFoundError('Section tidak ditemukan.');
  if (info.status === 'FINAL') throw new LkjipFinalError();
  const payload = parseBlockPayload(tipe, rawPayload);
  const maxRow = await queryOne<{ m: number }>(sql`SELECT COALESCE(MAX(urutan), -1) AS m FROM lkjip_block WHERE section_id = ${sectionId}`);
  const urutan = Number(maxRow?.m ?? -1) + 1;
  const res = await sql`
    INSERT INTO lkjip_block (section_id, urutan, tipe, payload)
    VALUES (${sectionId}, ${urutan}, ${tipe}, ${JSON.stringify(payload)})
  ` as unknown as Array<{ insertId: number }>;
  return { id: Number(res[0]?.insertId ?? 0) };
}

export async function updateBlock(id: number, rawPayload: unknown): Promise<void> {
  const row = await queryOne<{ tipe: BlockTipe; section_id: number; status: string }>(sql`
    SELECT b.tipe, b.section_id, d.status
    FROM lkjip_block b
    JOIN lkjip_section s ON s.id = b.section_id
    JOIN lkjip_dokumen d ON d.id = s.dokumen_id
    WHERE b.id = ${id} LIMIT 1
  `);
  if (!row) throw new LkjipNotFoundError('Blok tidak ditemukan.');
  if (row.status === 'FINAL') throw new LkjipFinalError();
  const payload = parseBlockPayload(row.tipe, rawPayload);
  await sql`UPDATE lkjip_block SET payload = ${JSON.stringify(payload)} WHERE id = ${id}`;
}

export async function reorderBlocks(sectionId: number, order: number[]): Promise<void> {
  const info = await getDokIdBySection(sectionId);
  if (!info) throw new LkjipNotFoundError('Section tidak ditemukan.');
  if (info.status === 'FINAL') throw new LkjipFinalError();
  await withTransaction(async ({ tx }) => {
    for (let i = 0; i < order.length; i++) {
      await tx`UPDATE lkjip_block SET urutan = ${i} WHERE id = ${order[i]} AND section_id = ${sectionId}`;
    }
  });
}

export async function deleteBlock(id: number): Promise<void> {
  const row = await queryOne<{ status: string }>(sql`
    SELECT d.status FROM lkjip_block b
    JOIN lkjip_section s ON s.id = b.section_id
    JOIN lkjip_dokumen d ON d.id = s.dokumen_id
    WHERE b.id = ${id} LIMIT 1
  `);
  if (!row) throw new LkjipNotFoundError('Blok tidak ditemukan.');
  if (row.status === 'FINAL') throw new LkjipFinalError();
  await sql`DELETE FROM lkjip_block WHERE id = ${id}`;
}
