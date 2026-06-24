// lib/rima/rencana-aksi-provider.ts — Provider Q&A data-aware Rima untuk modul
// Rencana Aksi. READ-ONLY. Pola sama dgn bba-provider.
//
// OWNERSHIP: modul admin (SUPER_ADMIN/ADMIN + app_access 'rencana_aksi').
// rencana_aksi dibaca per tahun+level, TANPA filter per-user → guard
// isRencanaAksiRole (G31) cukup. Tanpa status alur → tak ada inbox (count 0).

import { sql, sqlInt } from '@/lib/data/db';
import { isRencanaAksiRole } from '@/lib/data/rencana-aksi-schemas';
import { z } from 'zod';

export const isRencanaAksiRimaRole = (role: string, appAccess: string[] | null | undefined) =>
  isRencanaAksiRole(role, appAccess ?? null);

export const RencanaAksiSlotSchema = z.object({
  intent: z.enum(['rekap', 'top', 'tren']),
  tahun:  z.string().regex(/^\d{4}$/).optional(),
  topn:   z.coerce.number().int().min(1).max(10).optional(),
});
export type RencanaAksiSlot = z.infer<typeof RencanaAksiSlotSchema>;

const ROW_CAP = 20;

export async function rencanaAksiInboxCount(): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  return { label: null, aksi: '', count: 0, total_nilai: 0 };
}

export async function runRencanaAksiQuery(
  _role: string, _userId: number, slot: RencanaAksiSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  const tahunFrag = slot.tahun ? sql`AND tahun = ${slot.tahun}` : sql``;

  if (slot.intent === 'top') {
    // #5 — top-N indikator dengan anggaran terbesar.
    const n = Math.min(slot.topn ?? 5, 10);
    const rows = await sql`
      SELECT indikator, anggaran_nominal, tahun
        FROM rencana_aksi
       WHERE 1=1 ${tahunFrag}
       ORDER BY anggaran_nominal DESC
       LIMIT ${sqlInt(n)}`;
    const items = (rows as Record<string, unknown>[]).map(r => ({
      label: String(r.indikator ?? '(tanpa indikator)').slice(0, 80),
      total_nilai: Number(r.anggaran_nominal ?? 0),
    }));
    return { ok: true, data: { kind: 'top', tahun: slot.tahun ?? null, items } };
  }

  if (slot.intent === 'tren') {
    // #5 — tren antar-tahun (jumlah indikator + total anggaran).
    const rows = await sql`
      SELECT tahun AS th, COUNT(*) AS c, COALESCE(SUM(anggaran_nominal),0) AS nilai
        FROM rencana_aksi
       GROUP BY tahun ORDER BY tahun DESC LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({ tahun: String(r.th ?? ''), count: Number(r.c ?? 0), nilai: Number(r.nilai ?? 0) }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  // rekap — jumlah indikator per jenis + total anggaran (tanpa PII baris).
  const rows = await sql`
    SELECT jenis AS s, COUNT(*) AS c, COALESCE(SUM(anggaran_nominal),0) AS nilai
      FROM rencana_aksi
     WHERE 1=1 ${tahunFrag}
     GROUP BY jenis ORDER BY c DESC LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: s || '(tanpa jenis)', count: Number(r.c ?? 0), nilai: Number(r.nilai ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  const totalNilai = list.reduce((a, b) => a + b.nilai, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, total, totalNilai, rows: list } };
}

export function rencanaAksiDispatch(bag: Record<string, string | undefined>) {
  const parsed = RencanaAksiSlotSchema.safeParse({ intent: bag.intent, tahun: bag.tahun || undefined, topn: bag.topn || undefined });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (r: string, u: number) => runRencanaAksiQuery(r, u, parsed.data) };
}
