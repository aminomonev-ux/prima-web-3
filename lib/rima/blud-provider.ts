// lib/rima/blud-provider.ts — Provider Q&A data-aware Rima untuk modul BLUD (DPA).
// READ-ONLY. Pola sama dgn bba-provider (G20/G24/G25/G10).
//
// OWNERSHIP: BLUD modul admin (SUPER_ADMIN/ADMIN + app_access 'blud'). DPA dibaca
// per-versi (versi_tanggal), TANPA filter per-user → guard isBludRole (G31) cukup,
// tanpa ownership-where. BLUD tanpa status alur → tak ada inbox (count 0).

import { sql, sqlInt } from '@/lib/data/db';
import { isBludRole } from '@/lib/blud/schemas';
import { z } from 'zod';

export const isBludRimaRole = isBludRole;

export const BludSlotSchema = z.object({ intent: z.enum(['rekap']) });
export type BludSlot = z.infer<typeof BludSlotSchema>;

const ROW_CAP = 10;

/** BLUD tanpa state "menunggu aksi" → tak menyumbang ke Tugasku. */
export async function bludInboxCount(): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  return { label: null, aksi: '', count: 0, total_nilai: 0 };
}

export async function runBludQuery(
  _role: string, _userId: number, _slot: BludSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  // rekap — daftar versi DPA + jumlah baris per versi (tanpa nominal/PII baris).
  const rows = await sql`
    SELECT versi_tanggal AS s, COUNT(*) AS c
      FROM dpa_blud
     GROUP BY versi_tanggal
     ORDER BY versi_tanggal DESC
     LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const v = r.s instanceof Date ? r.s.toISOString().slice(0, 10) : String(r.s ?? '');
    return { status: v, label: v, count: Number(r.c ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  return { ok: true, data: { kind: 'rekap', tahun: null, total, rows: list } };
}

export function bludDispatch(bag: Record<string, string | undefined>) {
  const parsed = BludSlotSchema.safeParse({ intent: bag.intent });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (r: string, u: number) => runBludQuery(r, u, parsed.data) };
}
