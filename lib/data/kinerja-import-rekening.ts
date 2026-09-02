// lib/data/kinerja-import-rekening.ts — pembaca berkas Excel tabel Rekening
// E-Anggaran. Server-only (exceljs). PURE terhadap I/O: terima Buffer, balikkan
// baris + peringatan; TIDAK menulis DB (pola kinerja-import.ts).
//
// Bentuk yang dibidik = hasil Unduh Excel tab Rekening itu sendiri:
//   No | Program | Kegiatan | Sub Kegiatan | Uraian SSK | Rekening Belanja | Sumber Anggaran
// Berkas dari sistem lain menulis kolom terakhir cukup "Sumber" — dua-duanya
// diterima, sebab yang membedakan cuma satu kata dan menolaknya tidak menjaga apa pun.

import ExcelJS from 'exceljs';
import { sanitizeImportText } from './kinerja-import';
import type { BarisRekening } from '@/lib/kinerja/gabung-rekening';
import type { SumberSSK } from '@/app/(dashboard)/kinerja/_types';

export interface ParseRekeningResult {
  rows:     BarisRekening[];
  warnings: string[];
  /** Sumber yang tertulis di nama sheet ("REKENING BLUD") — null kalau tak terbaca. */
  sumberSheet: SumberSSK | null;
  source:   string;
  /** field → label kolom sumber, untuk panel "Pemetaan kolom" di modal. */
  mapping:  Partial<Record<Kolom, string>>;
}

type Kolom = 'program' | 'kegiatan' | 'subkegiatan' | 'uraian_ssk' | 'uraian' | 'sumber_anggaran';
type Grid = string[][];

// L67/L-3: xlsx = kontainer zip — batasi sheet & grid supaya berkas jahat tidak
// meledakkan memori sebelum satu baris pun dibaca.
const MAX_SHEETS    = 60;
const MAX_GRID_ROWS = 6000;
const MAX_GRID_COLS = 30;
// RekeningBodySchema membatasi 5000 baris per batch — impor ikut batas yang sama,
// kalau tidak pratinjaunya menjanjikan sesuatu yang ditolak saat Simpan.
const MAX_ROWS = 5000;

const MAXLEN: Record<Kolom, number> = {
  program: 255, kegiatan: 255, subkegiatan: 255, uraian_ssk: 255, uraian: 255, sumber_anggaran: 255,
};

const SUMBER_VALID: SumberSSK[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN'];

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}

function cellStr(v: unknown): string {
  const u = unwrap(v);
  if (u == null) return '';
  if (u instanceof Date) return u.toISOString().slice(0, 10);
  return String(u).replace(/\s+/g, ' ').trim();
}

function ambil(row: string[], cols: Partial<Record<Kolom, number>>, k: Kolom): string {
  const c = cols[k];
  if (c === undefined) return '';
  return sanitizeImportText(row[c] ?? '').slice(0, MAXLEN[k]);
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[*:./\\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Satu sel judul → kolom mana. URUTANNYA MENGIKAT, bukan selera:
 * "Sub Kegiatan" juga mengandung kata "kegiatan", dan "Uraian SSK" juga
 * mengandung "uraian". Yang lebih khusus wajib diperiksa lebih dulu, kalau
 * tidak kolom Sub Kegiatan terbaca sebagai Kegiatan dan seluruh baris melenceng.
 */
function kolomDariJudul(h: string): Kolom | null {
  if (!h || h.length > 40) return null;
  if (/\bsub\s*keg/.test(h))                    return 'subkegiatan';
  if (/\bssk\b/.test(h))                        return 'uraian_ssk';
  if (/\brekening\b|\bbelanja\b/.test(h))       return 'uraian';
  if (/\bprogram\b/.test(h))                    return 'program';
  if (/\bkegiatan\b/.test(h))                   return 'kegiatan';
  if (/\bsumber\b/.test(h))                     return 'sumber_anggaran';
  return null;
}

function colLabel(c: number): string {
  return 'Kolom ' + (c < 26 ? String.fromCharCode(65 + c) : `#${c + 1}`);
}

/** Baris yang isinya judul kolom, bukan data: minimal 3 sel mengenai kolom berbeda. */
function barisJudul(row: string[]): boolean {
  const kena = new Set<Kolom>();
  for (const sel of row) {
    const k = kolomDariJudul(normHeader(sel ?? ''));
    if (k) kena.add(k);
  }
  return kena.size >= 3;
}

function cariHeader(grid: Grid): { row: number; cols: Partial<Record<Kolom, number>> } | null {
  const batas = Math.min(20, grid.length);
  for (let r = 0; r < batas; r++) {
    const cols: Partial<Record<Kolom, number>> = {};
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const k = kolomDariJudul(normHeader(grid[r][c] ?? ''));
      if (k && cols[k] === undefined) cols[k] = c;
    }
    // Kolom Rekening Belanja itu isi barisnya; tanpa dia tidak ada yang bisa diimpor.
    // Syarat kedua (satu kolom hierarki) menolak baris judul dokumen yang kebetulan
    // memuat kata "belanja".
    const punyaHierarki = ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk']
      .some(k => cols[k as Kolom] !== undefined);
    if (cols.uraian !== undefined && punyaHierarki) return { row: r, cols };
  }
  return null;
}

function sheetGrid(ws: ExcelJS.Worksheet): Grid {
  const grid: Grid = [];
  const maxC = Math.min(ws.columnCount || 0, MAX_GRID_COLS);
  const maxR = Math.min(ws.rowCount || 0, MAX_GRID_ROWS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const arr: string[] = [];
    for (let c = 1; c <= maxC; c++) arr.push(cellStr(row.getCell(c).value));
    grid.push(arr);
  }
  return grid;
}

/**
 * "REKENING BLUD" / "REKENING_BLUD_2026-09-02" → 'BLUD'. Dipakai untuk
 * memperingatkan berkas yang dibuka di tab yang salah. Garis bawah & tanda baca
 * dijadikan spasi lebih dulu: `_` termasuk karakter kata, jadi `\bPROMKES\b`
 * tidak pernah cocok di dalam "REKENING_PROMKES_2026".
 */
export function sumberDariNama(teks: string): SumberSSK | null {
  const t = teks.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  return SUMBER_VALID.find(s => new RegExp(`\\b${s}\\b`).test(t)) ?? null;
}

function gridKeBaris(grid: Grid, source: string, sumberSheet: SumberSSK | null): ParseRekeningResult {
  const warnings: string[] = [];
  const header = cariHeader(grid);
  if (!header) return { rows: [], warnings, sumberSheet, source, mapping: {} };

  const { cols } = header;
  const mapping: Partial<Record<Kolom, string>> = {};
  for (const k of Object.keys(cols) as Kolom[]) mapping[k] = colLabel(cols[k]!);

  const rows: BarisRekening[] = [];
  let terpotong = false;
  for (let r = header.row + 1; r < grid.length; r++) {
    const uraian = ambil(grid[r], cols, 'uraian');
    const ssk    = ambil(grid[r], cols, 'uraian_ssk');
    const prog   = ambil(grid[r], cols, 'program');
    if (!uraian && !ssk && !prog) continue;                       // baris kosong / pemisah
    if (!uraian) { warnings.push(`Baris ${r + 1} dilewati — kolom Rekening Belanja kosong.`); continue; }
    // Echo header berulang (berkas gabungan multi-halaman). Diperiksa dari SELURUH
    // baris, bukan dari sel Rekening Belanja saja: hampir setiap rekening memang
    // berbunyi "Belanja ..." dan akan mencocoki alias kolom itu — memeriksanya
    // sendirian membuang semua baris dan berkasnya terbaca kosong.
    if (barisJudul(grid[r])) continue;
    if (rows.length >= MAX_ROWS) { terpotong = true; break; }

    rows.push({
      program:         prog || null,
      kegiatan:        ambil(grid[r], cols, 'kegiatan') || null,
      subkegiatan:     ambil(grid[r], cols, 'subkegiatan') || null,
      uraian_ssk:      ssk || null,
      uraian,
      sumber_anggaran: ambil(grid[r], cols, 'sumber_anggaran') || null,
    });
  }
  if (terpotong) warnings.push(`Berkas berisi lebih dari ${MAX_ROWS} baris — hanya ${MAX_ROWS} pertama yang diambil.`);

  const hilang = (['program', 'kegiatan', 'subkegiatan', 'uraian_ssk', 'sumber_anggaran'] as Kolom[])
    .filter(k => cols[k] === undefined);
  if (hilang.length > 0) {
    warnings.push(`Kolom tidak ditemukan di berkas: ${hilang.join(', ')} — baris tetap masuk, isian itu dikosongkan.`);
  }
  return { rows, warnings, sumberSheet, source, mapping };
}

export async function parseRekeningImport(buf: Buffer): Promise<ParseRekeningResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS) {
    throw new Error(`Berkas punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  }

  // Sheet dengan baris terbanyak yang menang — berkas nyata sering membawa sheet
  // catatan/kosong di sampingnya.
  let terbaik: ParseRekeningResult | null = null;
  for (const ws of wb.worksheets) {
    const hasil = gridKeBaris(sheetGrid(ws), `Sheet "${sanitizeImportText(ws.name)}"`, sumberDariNama(ws.name));
    if (!terbaik || hasil.rows.length > terbaik.rows.length) terbaik = hasil;
  }
  if (!terbaik || terbaik.rows.length === 0) {
    throw new Error('Tidak ada baris rekening terdeteksi. Pastikan ada kolom "Rekening Belanja" beserta kolom Program/Kegiatan/Sub Kegiatan/Uraian SSK.');
  }
  return terbaik;
}
