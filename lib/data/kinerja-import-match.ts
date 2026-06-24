// lib/data/kinerja-import-match.ts — IK-4 helper bersama (server-only).
// Bangun hasil "Import Realisasi belanja" (parse → target → peta → match → grup
// per sumber) dari buffer Excel. Dipakai DUA endpoint supaya logikanya tak drift:
//   • POST /api/kinerja/realisasi/import  (tombol Import di tab Realisasi)
//   • POST /api/rima/lampir               (Lampirkan-di-chat Rima, file dibuang)
// READ-ONLY: tidak menulis DB. Penulisan real_keuangan tetap lewat PUT realisasi
// atas konfirmasi user (Model A′).
import { sql } from '@/lib/data/db';
import { parseBelanjaBuffer } from './kinerja-import';
import { matchBelanja, type SskTarget, type MatchRow } from './kinerja-match';

export interface RealisasiImportData {
  tahun: string;
  months: number[];
  total: number;
  targetCount: number;
  bySumber: Record<string, MatchRow[]>;
  warnings: string[];
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Parse + match buffer belanja untuk satu tahun. leafCount=0 → bukan file belanja. */
export async function buildRealisasiImport(
  buf: Buffer,
  tahun: string,
): Promise<{ leafCount: number; data: RealisasiImportData }> {
  const { rows: leaves, warnings } = await parseBelanjaBuffer(buf);

  // Target = baris Realisasi app (distinct per SSK+sumber) untuk tahun ini.
  const targetRows = (await sql`
    SELECT ssk_canonical_id AS canonical_id, sumber, ANY_VALUE(keterangan) AS keterangan
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND keterangan <> ''
    GROUP BY ssk_canonical_id, sumber`) as { canonical_id: string; sumber: string; keterangan: string }[];
  const targets: SskTarget[] = targetRows.map(t => ({ canonical_id: t.canonical_id, sumber: t.sumber, keterangan: t.keterangan }));
  const ketById = new Map(targets.map(t => [t.canonical_id, t.keterangan]));

  // Peta tersimpan — diterapkan lebih dulu (status 'match' skor 1).
  const mapRows = (await sql`
    SELECT keterangan_excel, ssk_canonical_id, sumber
    FROM kinerja_realisasi_map WHERE tahun = ${tahun}`) as { keterangan_excel: string; ssk_canonical_id: string; sumber: string }[];
  const mapByKet = new Map(mapRows.map(m => [norm(m.keterangan_excel), m]));

  const matched: MatchRow[] = [];
  const toFuzzy: typeof leaves = [];
  for (const lf of leaves) {
    const mp = mapByKet.get(norm(lf.keterangan));
    if (mp) matched.push({ ...lf, ssk_canonical_id: mp.ssk_canonical_id, ssk_keterangan: ketById.get(mp.ssk_canonical_id) ?? null, sumber: mp.sumber, score: 1, status: 'match' });
    else toFuzzy.push(lf);
  }
  matched.push(...matchBelanja(toFuzzy, targets));

  const bySumber: Record<string, MatchRow[]> = {};
  for (const r of matched) (bySumber[r.sumber ?? '_belum'] ??= []).push(r);
  const months = [...new Set(leaves.map(l => l.bulan_ke))].sort((a, b) => a - b);

  return {
    leafCount: leaves.length,
    data: { tahun, months, total: matched.length, targetCount: targets.length, bySumber, warnings },
  };
}
