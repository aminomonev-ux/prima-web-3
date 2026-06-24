// lib/rima/kinerja-provider.ts — Provider Q&A data-aware Rima untuk modul Kinerja
// (E-Anggaran / E-Controlling). READ-ONLY. Pola sama dgn bba-provider.
//
// OWNERSHIP: modul admin (SUPER_ADMIN/ADMIN + app_access 'new_econtrolling').
// kinerja_master dibaca per tahun+tipe, TANPA filter per-user → guard isKinerjaRole
// (G31) cukup. Tanpa status alur → tak ada inbox (count 0).

import { sql, sqlInt } from '@/lib/data/db';
import { isKinerjaRole } from '@/lib/data/kinerja-schemas';
import { z } from 'zod';

export const isKinerjaRimaRole = isKinerjaRole;

const TIPE_LABELS: Record<string, string> = { program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Sub Kegiatan' };

export const KinerjaSlotSchema = z.object({
  intent: z.enum(['rekap', 'tren']),
  tahun:  z.string().regex(/^\d{4}$/).optional(),
});
export type KinerjaSlot = z.infer<typeof KinerjaSlotSchema>;

const ROW_CAP = 10;

export async function kinerjaInboxCount(): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  return { label: null, aksi: '', count: 0, total_nilai: 0 };
}

export async function runKinerjaQuery(
  _role: string, _userId: number, slot: KinerjaSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  const tahunFrag = slot.tahun ? sql`AND tahun = ${slot.tahun}` : sql``;

  if (slot.intent === 'tren') {
    // #5 — tren antar-tahun jumlah subkegiatan (unit struktur paling granular).
    const rows = await sql`
      SELECT tahun AS th, COUNT(*) AS c
        FROM kinerja_master
       WHERE tipe = 'subkegiatan'
       GROUP BY tahun ORDER BY tahun DESC LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({ tahun: String(r.th ?? ''), count: Number(r.c ?? 0), nilai: 0 }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  // rekap — jumlah baris struktur per tipe. kinerja_master juga menampung tipe lain
  // (uraian_ssk/sumber_anggaran) → batasi ke 3 tipe struktur saja (G10, hindari
  // istilah internal bocor ke jawaban).
  const rows = await sql`
    SELECT tipe AS s, COUNT(*) AS c
      FROM kinerja_master
     WHERE tipe IN ('program','kegiatan','subkegiatan') ${tahunFrag}
     GROUP BY tipe ORDER BY c DESC LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: TIPE_LABELS[s] ?? s, count: Number(r.c ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, total, rows: list } };
}

export function kinerjaDispatch(bag: Record<string, string | undefined>) {
  const parsed = KinerjaSlotSchema.safeParse({ intent: bag.intent, tahun: bag.tahun || undefined });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (r: string, u: number) => runKinerjaQuery(r, u, parsed.data) };
}
