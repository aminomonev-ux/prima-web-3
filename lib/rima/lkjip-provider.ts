// lib/rima/lkjip-provider.ts — Provider Q&A data-aware Rima untuk modul LKJIP
// (Laporan Kinerja). READ-ONLY. Pola sama dgn pk/bba-provider (G20/G24/G25/G10).
//
// OWNERSHIP: LKJIP modul admin (SUPER_ADMIN/ADMIN + app_access 'lkjip'). listDokumen
// di lib/lkjip/data.ts TIDAK memfilter per-user (hanya tahun/status/q) → guard
// isLkjipRole (G31 paritas) sudah cukup, TANPA ownership-where. ⚠️ Bila LKJIP
// menambah kepemilikan per-baris, fungsi ini WAJIB ikut.

import { sql, sqlInt } from '@/lib/data/db';
import { isLkjipRole } from '@/lib/lkjip/schemas';
import { z } from 'zod';

export const isLkjipRimaRole = isLkjipRole;

const LKJIP_LABELS: Record<string, string> = { DRAFT: 'Draft', FINAL: 'Final' };
const LKJIP_INBOX_STATUS = 'DRAFT'; // belum difinalisasi = menunggu finalisasi

// G24 — slot allowlist. canonical_id dibatasi (prefix LKJIP-, ≤24).
export const LkjipSlotSchema = z.object({
  intent:       z.enum(['rekap', 'lookup', 'tren', 'inbox']),
  tahun:        z.string().regex(/^\d{4}$/).optional(),
  canonical_id: z.string().trim().min(1).max(24).optional(),
});
export type LkjipSlot = z.infer<typeof LkjipSlotSchema>;

const ROW_CAP = 20;

/** #4 — dokumen LKJIP menunggu finalisasi (DRAFT). Modul admin → tanpa ownership. */
export async function lkjipInboxCount(
  _role: string, _userId: number, tahun?: string,
): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  const tahunFrag = tahun ? sql`AND tahun = ${tahun}` : sql``;
  const rows = await sql`
    SELECT COUNT(*) AS c FROM lkjip_dokumen
     WHERE status = ${LKJIP_INBOX_STATUS} ${tahunFrag}`;
  const r = (rows as Record<string, unknown>[])[0] ?? {};
  return { label: LKJIP_LABELS[LKJIP_INBOX_STATUS], aksi: 'menunggu finalisasi', count: Number(r.c ?? 0), total_nilai: 0 };
}

export async function runLkjipQuery(
  role: string, userId: number, slot: LkjipSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  const tahunFrag = slot.tahun ? sql`AND tahun = ${slot.tahun}` : sql``;

  if (slot.intent === 'lookup') {
    if (!slot.canonical_id) return { ok: true, data: { kind: 'lookup', found: false, canonical_id: '' } };
    // G25 — kolom allowlist (tanpa style_config/PII).
    const rows = await sql`
      SELECT canonical_id, judul, status, tahun
        FROM lkjip_dokumen
       WHERE canonical_id = ${slot.canonical_id} ${tahunFrag}
       ORDER BY tahun DESC LIMIT 1`;
    const r = rows[0] as Record<string, unknown> | undefined;
    if (!r) return { ok: true, data: { kind: 'lookup', found: false, canonical_id: slot.canonical_id } };
    const st = String(r.status ?? '');
    return {
      ok: true,
      data: {
        kind: 'lookup', found: true, canonical_id: String(r.canonical_id ?? slot.canonical_id),
        status: st, label: LKJIP_LABELS[st] ?? st, judul: String(r.judul ?? ''), tahun: String(r.tahun ?? ''),
      },
    };
  }

  if (slot.intent === 'tren') {
    const rows = await sql`
      SELECT tahun AS th, COUNT(*) AS c
        FROM lkjip_dokumen
       GROUP BY tahun ORDER BY tahun DESC LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({ tahun: String(r.th ?? ''), count: Number(r.c ?? 0), nilai: 0 }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  if (slot.intent === 'inbox') {
    const ic = await lkjipInboxCount(role, userId, slot.tahun);
    return { ok: true, data: { kind: 'inbox', status: LKJIP_INBOX_STATUS, label: ic.label, aksi: ic.aksi, count: ic.count, total_nilai: ic.total_nilai, tahun: slot.tahun ?? null } };
  }

  // rekap — count per status
  const rows = await sql`
    SELECT status AS s, COUNT(*) AS c
      FROM lkjip_dokumen
     WHERE 1=1 ${tahunFrag}
     GROUP BY status ORDER BY c DESC LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: LKJIP_LABELS[s] ?? s, count: Number(r.c ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, total, rows: list } };
}

/** Dispatch terpola: parse slot (G24) → runner ber-closure (slot terikat). */
export function lkjipDispatch(bag: Record<string, string | undefined>) {
  const parsed = LkjipSlotSchema.safeParse({
    intent: bag.intent, tahun: bag.tahun || undefined, canonical_id: bag.no || undefined,
  });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (r: string, u: number) => runLkjipQuery(r, u, parsed.data) };
}
