// ═══ PRIMA — Cetak Gabungan: Filter bersama (layar + export) ════════════════
// Satu sumber kebenaran untuk filter Cetak Renaksi & Kinerja, dipakai oleh
// CetakPanel (render) DAN exports.ts (PDF/Excel) supaya hasil cetak = layar.

import type { RaRow, RaLevel, HierarchyRow } from './types';
import { buildHierarchyRows, outcomeOf, realisasiAkhirTahun, anggaranRollup } from './types';

export type ColMode = 'both' | 'target' | 'realisasi';

export interface CetakFilter {
  mode: 'hirarki' | 'flat';        // pohon penuh vs daftar per-level
  levels: Record<RaLevel, boolean>; // level mana yang tampil sbg baris
  colMode: ColMode;                 // kolom Target / Realisasi / keduanya
  showAnggaran: boolean;
  showOutcome: boolean;
  showTw: boolean;                  // detail triwulan TW1-4
  fTujuan: string;                  // fokus nilai spesifik (opsional)
  fSasaran: string;
  fProgram: string;
}

export const ALL_LEVELS: RaLevel[] = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'];

export const DEFAULT_CETAK_FILTER: CetakFilter = {
  mode: 'hirarki',
  levels: { tujuan: true, sasaran: true, program: true, kegiatan: true, 'sub-kegiatan': true },
  colMode: 'both',
  showAnggaran: true,
  showOutcome: true,
  showTw: true,
  fTujuan: '',
  fSasaran: '',
  fProgram: '',
};

/**
 * Fokus nilai spesifik: pertahankan subtree dari node terdalam yang dipilih
 * (program > sasaran > tujuan) + leluhurnya (utk konteks pohon). Tidak ada
 * pilihan → kembalikan semua.
 */
export function applyFocus(allRows: RaRow[], f: CetakFilter): RaRow[] {
  const { fTujuan, fSasaran, fProgram } = f;
  if (fProgram) {
    const progRows = allRows.filter(r => r.level === 'program' && r.program === fProgram);
    const sasNames = new Set(progRows.map(r => r.sasaran).filter((s): s is string => !!s));
    const tujNames = new Set(
      allRows.filter(r => r.level === 'sasaran' && sasNames.has(r.program))
        .map(r => r.tujuan).filter((t): t is string => !!t),
    );
    return allRows.filter(r =>
      (r.level === 'program' && r.program === fProgram) ||
      ((r.level === 'kegiatan' || r.level === 'sub-kegiatan') && r.program === fProgram) ||
      (r.level === 'sasaran' && sasNames.has(r.program)) ||
      (r.level === 'tujuan' && tujNames.has(r.program)),
    );
  }
  if (fSasaran) {
    const sasRows = allRows.filter(r => r.level === 'sasaran' && r.program === fSasaran);
    const progNames = new Set(allRows.filter(r => r.level === 'program' && r.sasaran === fSasaran).map(r => r.program));
    const tujNames = new Set(sasRows.map(r => r.tujuan).filter((t): t is string => !!t));
    return allRows.filter(r =>
      (r.level === 'sasaran' && r.program === fSasaran) ||
      (r.level === 'program' && r.sasaran === fSasaran) ||
      ((r.level === 'kegiatan' || r.level === 'sub-kegiatan') && progNames.has(r.program)) ||
      (r.level === 'tujuan' && tujNames.has(r.program)),
    );
  }
  if (fTujuan) {
    const sasNames = new Set(allRows.filter(r => r.level === 'sasaran' && r.tujuan === fTujuan).map(r => r.program));
    const progNames = new Set(
      allRows.filter(r => r.level === 'program' && r.sasaran != null && sasNames.has(r.sasaran)).map(r => r.program),
    );
    return allRows.filter(r =>
      (r.level === 'tujuan' && r.program === fTujuan) ||
      (r.level === 'sasaran' && sasNames.has(r.program)) ||
      (r.level === 'program' && r.sasaran != null && sasNames.has(r.sasaran)) ||
      ((r.level === 'kegiatan' || r.level === 'sub-kegiatan') && progNames.has(r.program)),
    );
  }
  return allRows;
}

const LEVEL_ORDER: Record<RaLevel, number> = { tujuan: 0, sasaran: 1, program: 2, kegiatan: 3, 'sub-kegiatan': 4 };

function flatRow(no: number, r: RaRow): HierarchyRow {
  return {
    no,
    tujuan: r.level === 'tujuan' ? r.program : '',
    sasaran: r.level === 'sasaran' ? r.program : '',
    program: r.level === 'program' ? r.program : '',
    kegiatan: r.level === 'kegiatan' ? (r.kegiatan ?? '') : '',
    sub_kegiatan: r.level === 'sub-kegiatan' ? (r.sub_kegiatan ?? '') : '',
    source: r,
  };
}

/** Baris akhir utk render & export, sesuai mode + level + fokus. */
export function buildCetakRows(allRows: RaRow[], f: CetakFilter): HierarchyRow[] {
  const focused = applyFocus(allRows, f);
  if (f.mode === 'flat') {
    const rows = focused
      .filter(r => f.levels[r.level])
      .sort((a, b) =>
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        a.program.localeCompare(b.program) ||
        (a.kegiatan ?? '').localeCompare(b.kegiatan ?? '') ||
        (a.sub_kegiatan ?? '').localeCompare(b.sub_kegiatan ?? '') ||
        a.indikator.localeCompare(b.indikator));
    return rows.map((r, i) => flatRow(i + 1, r));
  }
  let hier = buildHierarchyRows(focused);
  if (!ALL_LEVELS.every(l => f.levels[l])) {
    hier = hier.filter(h => f.levels[h.source.level]).map((h, i) => ({ ...h, no: i + 1 }));
  }
  return hier;
}

/** Base rows utk roll-up anggaran (subtree fokus penuh, tak terpotong level filter). */
export function cetakRollupBase(allRows: RaRow[], f: CetakFilter): RaRow[] {
  return applyFocus(allRows, f);
}

// ─── Kolom spec (dipakai export PDF/Excel; layar render JSX terpisah) ────────

export interface CetakColumn {
  key: string;
  header: string;
  align: 'left' | 'right' | 'center';
  money?: boolean;
  value: (h: HierarchyRow, rollup: RaRow[]) => string | number | null;
}

// Header bergrup: lead (rowSpan 2) · grup TW (colSpan = jumlah sub T/R) · tail.
// `flat` = urutan kolom lengkap utk isi baris (body) & lebar kolom.
export interface CetakHeader {
  lead: CetakColumn[];
  twQuarters: { q: number; sub: CetakColumn[] }[];
  tail: CetakColumn[];
  flat: CetakColumn[];
}

export function cetakHeader(f: CetakFilter): CetakHeader {
  const showT = f.colMode !== 'realisasi';
  const showR = f.colMode !== 'target';
  const showReal = f.colMode !== 'target';

  const lead: CetakColumn[] = [
    { key: 'no', header: 'No', align: 'right', value: h => h.no },
    { key: 'tujuan', header: 'Tujuan', align: 'left', value: h => h.tujuan },
    { key: 'sasaran', header: 'Sasaran', align: 'left', value: h => h.sasaran },
    { key: 'program', header: 'Program', align: 'left', value: h => h.program },
    { key: 'kegiatan', header: 'Kegiatan', align: 'left', value: h => h.kegiatan },
    { key: 'sub_kegiatan', header: 'Sub Kegiatan', align: 'left', value: h => h.sub_kegiatan },
  ];
  if (f.showOutcome) {
    lead.push({ key: 'outcome', header: 'Sasaran (Outcome)', align: 'left', value: h => outcomeOf(h.source) });
  }
  lead.push(
    { key: 'indikator', header: 'Indikator', align: 'left', value: h => h.source.indikator + (h.isOrphan ? ' (orphan)' : '') },
    { key: 'jenis', header: 'Jenis', align: 'center', value: h => h.source.jenis },
    { key: 'satuan', header: 'Satuan', align: 'center', value: h => h.source.satuan },
    { key: 'rpjmd', header: 'RPJMD', align: 'right', value: h => h.source.target_rpjmd },
    { key: 'tahunan', header: 'Tahunan', align: 'right', value: h => h.source.target_tahunan },
  );

  const twQuarters: { q: number; sub: CetakColumn[] }[] = [];
  if (f.showTw) {
    for (const q of [1, 2, 3, 4] as const) {
      const sub: CetakColumn[] = [];
      if (showT) sub.push({ key: `tw${q}t`, header: 'T', align: 'right', value: h => h.source[`q${q}_target`] });
      if (showR) sub.push({ key: `tw${q}r`, header: 'R', align: 'right', value: h => h.source[`q${q}_realisasi`] });
      twQuarters.push({ q, sub });
    }
  }

  const tail: CetakColumn[] = [];
  if (showReal) tail.push({ key: 'akhir', header: 'Real Akhir', align: 'right', value: h => realisasiAkhirTahun(h.source) });
  if (f.showAnggaran) {
    tail.push({ key: 'anggaran', header: 'Anggaran (Rp)', align: 'right', money: true,
      value: (h, rollup) => anggaranRollup(h.source.level, h.source, rollup) });
  }

  const flat = [...lead, ...twQuarters.flatMap(t => t.sub), ...tail];
  return { lead, twQuarters, tail, flat };
}

export function cetakColumns(f: CetakFilter): CetakColumn[] {
  return cetakHeader(f).flat;
}
