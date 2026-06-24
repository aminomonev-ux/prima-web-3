// lib/rima/pk-provider.ts — Provider Q&A data-aware Rima untuk modul Perjanjian
// Kinerja (PK). READ-ONLY. Pola sama dgn usulan-provider (G20/G24/G25/G10).
//
// OWNERSHIP: cermin persis app/api/perjanjian-kinerja/dokumen GET (L2 SEC-C4):
// admin (ADMIN_ROLES) → semua dokumen; selain itu → hanya yang dibuat sendiri
// (created_by = userId). ⚠️ Bila ownership di route itu berubah, fungsi ini WAJIB
// ikut (G31 paritas).

import { sql, sqlInt } from '@/lib/data/db';
import { isPkRole } from '@/lib/data/pk-schemas';
import { ADMIN_ROLES } from '@/lib/constants';
import { z } from 'zod';

export const isPkRimaRole = isPkRole;

const PK_LABELS: Record<string, string> = { DRAFT: 'Draft', FINAL: 'Final' };

// G24 — slot allowlist. Tak ada created_by/scope dari klien (anti L60). PK tanpa
// nominal moneter di pk_dokumen → tak ada intent `top` (ranking tak bermakna).
export const PkSlotSchema = z.object({
  intent:   z.enum(['rekap', 'tren', 'inbox']),
  tahun:    z.string().regex(/^\d{4}$/).optional(),
  jenis_pk: z.enum(['MURNI', 'PERUBAHAN']).optional(),
});
export type PkSlot = z.infer<typeof PkSlotSchema>;

const ROW_CAP = 10;
const PK_INBOX_STATUS = 'DRAFT'; // belum difinalisasi = menunggu finalisasi

/** ownership cermin route dokumen GET: admin→semua, lainnya→created_by sendiri. */
function pkOwnFrag(role: string, userId: number) {
  return (ADMIN_ROLES as readonly string[]).includes(role) ? sql`` : sql`AND created_by = ${userId}`;
}

/** #4 — PK menunggu finalisasi (DRAFT), terikat ownership. PK tanpa nominal → total 0. */
export async function pkInboxCount(
  role: string, userId: number, tahun?: string,
): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  const tahunFrag = tahun ? sql`AND tahun = ${tahun}` : sql``;
  const rows = await sql`
    SELECT COUNT(*) AS c FROM pk_dokumen
     WHERE status = ${PK_INBOX_STATUS} ${pkOwnFrag(role, userId)} ${tahunFrag}`;
  const r = (rows as Record<string, unknown>[])[0] ?? {};
  return { label: PK_LABELS[PK_INBOX_STATUS], aksi: 'menunggu finalisasi', count: Number(r.c ?? 0), total_nilai: 0 };
}

export async function runPkQuery(
  role: string, userId: number, slot: PkSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  const ownFrag = pkOwnFrag(role, userId);
  const tahunFrag = slot.tahun ? sql`AND tahun = ${slot.tahun}` : sql``;
  const jenisFrag = slot.jenis_pk ? sql`AND jenis_pk = ${slot.jenis_pk}` : sql``;

  if (slot.intent === 'tren') {
    // #3 — tren antar-tahun (jumlah dokumen per tahun), terikat ownership.
    const rows = await sql`
      SELECT tahun AS th, COUNT(*) AS c
        FROM pk_dokumen
       WHERE 1=1 ${ownFrag} ${jenisFrag}
       GROUP BY tahun
       ORDER BY tahun DESC
       LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({ tahun: String(r.th ?? ''), count: Number(r.c ?? 0), nilai: 0 }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  if (slot.intent === 'inbox') {
    const ic = await pkInboxCount(role, userId, slot.tahun);
    return { ok: true, data: { kind: 'inbox', status: PK_INBOX_STATUS, label: ic.label, aksi: ic.aksi, count: ic.count, total_nilai: ic.total_nilai, tahun: slot.tahun ?? null } };
  }

  // G25 — hanya status + count keluar (tak ada nama pejabat/PII).
  const rows = await sql`
    SELECT status AS s, COUNT(*) AS c
      FROM pk_dokumen
     WHERE 1=1 ${ownFrag} ${tahunFrag} ${jenisFrag}
     GROUP BY status
     ORDER BY c DESC
     LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: PK_LABELS[s] ?? s, count: Number(r.c ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, jenis_pk: slot.jenis_pk ?? null, total, rows: list } };
}

/** Dispatch terpola: parse slot (G24) → runner ber-closure (slot terikat). */
export function pkDispatch(bag: Record<string, string | undefined>) {
  const parsed = PkSlotSchema.safeParse({
    intent: bag.intent, tahun: bag.tahun || undefined, jenis_pk: bag.jenis || undefined,
  });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (r: string, u: number) => runPkQuery(r, u, parsed.data) };
}
