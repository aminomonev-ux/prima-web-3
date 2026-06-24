// lib/rima/bba-provider.ts — Provider Q&A data-aware Rima untuk modul Buku Besar
// Aset (BBA). READ-ONLY. Pola sama dgn usulan-provider (G20/G24/G25/G10).
//
// OWNERSHIP: BBA TIDAK punya kepemilikan per-baris — `listAset()` di
// app/api/buku-besar-aset/route.ts tak menerima userId; guard `isAsetRole`
// (G31 paritas) sudah cukup: semua user ber-akses melihat semua baris. Jadi
// provider ini sengaja TANPA ownership-where (mencerminkan route aslinya). ⚠️
// Bila suatu saat BBA menambah ownership per-baris, fungsi ini WAJIB ikut.

import { sql, sqlInt } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { z } from 'zod';

export const isBbaRimaRole = isAsetRole;

const BBA_LABELS: Record<string, string> = {
  DIRENCANAKAN: 'Direncanakan', REALISASI_PENUH: 'Realisasi Penuh',
  REALISASI_SEBAGIAN: 'Realisasi Sebagian', TIDAK_TEREALISASI: 'Tidak Terealisasi',
};

// G24 — slot allowlist. canonical_id dibatasi ketat (prefix BBA-, ≤20 sesuai kolom).
export const BbaSlotSchema = z.object({
  intent:       z.enum(['rekap', 'lookup', 'top', 'tren', 'inbox', 'rincian']),
  tahun:        z.string().regex(/^\d{4}$/).optional(),
  canonical_id: z.string().trim().min(1).max(20).optional(),
  topn:         z.coerce.number().int().min(1).max(10).optional(),
});
export type BbaSlot = z.infer<typeof BbaSlotSchema>;

const ROW_CAP = 50; // L39 — array cap
const BBA_INBOX_STATUS = 'DIRENCANAKAN'; // belum direalisasi = menunggu realisasi

/** #4 — aset menunggu realisasi (DIRENCANAKAN). BBA tanpa ownership per-baris (cermin route). */
export async function bbaInboxCount(
  _role: string, _userId: number, tahun?: string,
): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  const tahunFrag = tahun ? sql`AND tahun_anggaran = ${tahun}` : sql``;
  const rows = await sql`
    SELECT COUNT(*) AS c, COALESCE(SUM(nilai_rencana),0) AS nilai
      FROM buku_besar_aset
     WHERE status = ${BBA_INBOX_STATUS} ${tahunFrag}`;
  const r = (rows as Record<string, unknown>[])[0] ?? {};
  return { label: BBA_LABELS[BBA_INBOX_STATUS], aksi: 'menunggu realisasi', count: Number(r.c ?? 0), total_nilai: Number(r.nilai ?? 0) };
}

export async function runBbaQuery(
  _role: string, _userId: number, slot: BbaSlot,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: true }> {
  const tahunFrag = slot.tahun ? sql`AND tahun_anggaran = ${slot.tahun}` : sql``;

  if (slot.intent === 'lookup') {
    if (!slot.canonical_id) return { ok: true, data: { kind: 'lookup', found: false, canonical_id: '' } };
    // G25 — SELECT kolom allowlist saja (tak pernah *). Tanpa uraian/PII.
    const rows = await sql`
      SELECT canonical_id, status, nilai_rencana, nilai_realisasi, tahun_anggaran
        FROM buku_besar_aset
       WHERE canonical_id = ${slot.canonical_id} ${tahunFrag}
       ORDER BY tahun_anggaran DESC
       LIMIT 1`;
    const r = rows[0] as Record<string, unknown> | undefined;
    if (!r) return { ok: true, data: { kind: 'lookup', found: false, canonical_id: slot.canonical_id } };
    const st = String(r.status ?? '');
    return {
      ok: true,
      data: {
        kind: 'lookup', found: true,
        canonical_id: String(r.canonical_id ?? slot.canonical_id),
        status: st, label: BBA_LABELS[st] ?? st,
        nilai_rencana: Number(r.nilai_rencana ?? 0),
        nilai_realisasi: Number(r.nilai_realisasi ?? 0),
        tahun: String(r.tahun_anggaran ?? ''),
      },
    };
  }

  if (slot.intent === 'top') {
    // #3 — top-N aset rencana terbesar.
    const n = Math.min(slot.topn ?? 5, 10);
    const rows = await sql`
      SELECT canonical_id, status, nilai_rencana, nilai_realisasi, tahun_anggaran
        FROM buku_besar_aset
       WHERE 1=1 ${tahunFrag}
       ORDER BY nilai_rencana DESC
       LIMIT ${sqlInt(n)}`;
    const items = (rows as Record<string, unknown>[]).map(r => {
      const s = String(r.status ?? '');
      return {
        canonical_id: String(r.canonical_id ?? ''), status: s, label: BBA_LABELS[s] ?? s,
        nilai_rencana: Number(r.nilai_rencana ?? 0), nilai_realisasi: Number(r.nilai_realisasi ?? 0),
      };
    });
    return { ok: true, data: { kind: 'top', tahun: slot.tahun ?? null, items } };
  }

  if (slot.intent === 'tren') {
    // #3 — tren antar-tahun (count + rencana + realisasi).
    const rows = await sql`
      SELECT tahun_anggaran AS th, COUNT(*) AS c,
             COALESCE(SUM(nilai_rencana),0) AS rencana, COALESCE(SUM(nilai_realisasi),0) AS realisasi
        FROM buku_besar_aset
       GROUP BY tahun_anggaran
       ORDER BY tahun_anggaran DESC
       LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({
      tahun: String(r.th ?? ''), count: Number(r.c ?? 0),
      nilai: Number(r.rencana ?? 0), realisasi: Number(r.realisasi ?? 0),
    }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  if (slot.intent === 'inbox') {
    const ic = await bbaInboxCount(_role, _userId, slot.tahun);
    return { ok: true, data: { kind: 'inbox', status: BBA_INBOX_STATUS, label: ic.label, aksi: ic.aksi, count: ic.count, total_nilai: ic.total_nilai, tahun: slot.tahun ?? null } };
  }

  if (slot.intent === 'rincian') {
    // #B3 — rekap per DIMENSI sumber anggaran (BLUD/APBD/DAK/LAINNYA). BBA tanpa
    // ownership per-baris (cermin route, lihat header) → tak ada own-where.
    const rows = await sql`
      SELECT sumber_anggaran AS s, COUNT(*) AS c,
             COALESCE(SUM(nilai_rencana),0) AS rencana,
             COALESCE(SUM(nilai_realisasi),0) AS realisasi
        FROM buku_besar_aset
       WHERE 1=1 ${tahunFrag}
       GROUP BY sumber_anggaran
       ORDER BY rencana DESC
       LIMIT ${sqlInt(ROW_CAP)}`;
    const list = (rows as Record<string, unknown>[]).map(r => ({
      sumber: String(r.s ?? ''), count: Number(r.c ?? 0),
      rencana: Number(r.rencana ?? 0), realisasi: Number(r.realisasi ?? 0),
    }));
    const total = list.reduce((a, b) => a + b.count, 0);
    const totalRencana = list.reduce((a, b) => a + b.rencana, 0);
    const totalRealisasi = list.reduce((a, b) => a + b.realisasi, 0);
    return { ok: true, data: { kind: 'rincian', tahun: slot.tahun ?? null, total, totalRencana, totalRealisasi, rows: list } };
  }

  // rekap — count + nilai per status (rencana vs realisasi)
  const rows = await sql`
    SELECT status AS s, COUNT(*) AS c,
           COALESCE(SUM(nilai_rencana),0) AS rencana,
           COALESCE(SUM(nilai_realisasi),0) AS realisasi
      FROM buku_besar_aset
     WHERE 1=1 ${tahunFrag}
     GROUP BY status
     ORDER BY c DESC
     LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: BBA_LABELS[s] ?? s, count: Number(r.c ?? 0), rencana: Number(r.rencana ?? 0), realisasi: Number(r.realisasi ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  const totalRencana = list.reduce((a, b) => a + b.rencana, 0);
  const totalRealisasi = list.reduce((a, b) => a + b.realisasi, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, total, totalRencana, totalRealisasi, rows: list } };
}

/** Dispatch terpola: parse slot (G24) → kembalikan runner ber-closure (slot terikat). */
export function bbaDispatch(bag: Record<string, string | undefined>) {
  const parsed = BbaSlotSchema.safeParse({
    intent: bag.intent, tahun: bag.tahun || undefined, canonical_id: bag.no || undefined,
    topn: bag.topn || undefined,
  });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (role: string, userId: number) => runBbaQuery(role, userId, parsed.data) };
}
