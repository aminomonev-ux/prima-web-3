// lib/data/kinerja-import-rko.ts — pembaca berkas Excel RKO (tab SSK) E-Anggaran.
// Server-only (exceljs). PURE terhadap I/O: terima Buffer, balikkan baris +
// peringatan; TIDAK menulis DB (pola kinerja-import-rekening.ts).
//
// Dua bentuk berkas diterima, dan keduanya nyata:
//   sistem luar : No | Uraian | Pagu Awal | Januari - Target Fisik | Januari - Persentase | … | Total | Persentase Total
//   ekspor app  : No | Uraian SSK | Uraian | Pagu (Rp) | Target Jan | % Jan | … | Total (Rp) | Total %
//
// Kolom persentase & total SENGAJA tidak dibaca — turunan dari pagu + nilai
// bulanan, dan aplikasi menghitungnya sendiri. Bonusnya beda satuan (berkas luar
// menulis pecahan 0,0562; aplikasi menulis 5,62) jadi tidak relevan sama sekali.

import ExcelJS from 'exceljs';
import { sanitizeImportText } from './kinerja-import';
import type { BarisRko } from '@/lib/kinerja/gabung-rko';
import type { SskMonths, SumberSSK } from '@/app/(dashboard)/kinerja/_types';

export interface ParseRkoResult {
  rows:        BarisRko[];
  warnings:    string[];
  /** Sumber yang tertulis di nama sheet ("RKO BLUD") — null kalau tak terbaca. */
  sumberSheet: SumberSSK | null;
  source:      string;
  /** Label kolom sumber untuk panel transparansi di modal. */
  mapping:     { uraian: string; pagu: string; bulan: string[] };
}

const MAX_SHEETS    = 60;
const MAX_GRID_ROWS = 6000;
const MAX_GRID_COLS = 40;
const MAX_ROWS      = 5000;
const MAXLEN_URAIAN = 500;   // kinerja_ssk.uraian VARCHAR(500)

const SUMBER_VALID: SumberSSK[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN'];

const KUNCI_BULAN: { key: keyof SskMonths; pola: RegExp }[] = [
  { key: 'jan', pola: /\bjan(uari)?\b/ },
  { key: 'feb', pola: /\bfeb(ruari)?\b/ },
  { key: 'mar', pola: /\bmar(et)?\b/ },
  { key: 'apr', pola: /\bapr(il)?\b/ },
  { key: 'mei', pola: /\bmei\b/ },
  { key: 'jun', pola: /\bjun(i)?\b/ },
  { key: 'jul', pola: /\bjul(i)?\b/ },
  { key: 'agu', pola: /\bagu(stus)?\b|\bags\b|\bagt\b/ },
  { key: 'sep', pola: /\bsep(tember)?\b/ },
  { key: 'okt', pola: /\bokt(ober)?\b/ },
  { key: 'nov', pola: /\bnov(ember)?\b/ },
  { key: 'des', pola: /\bdes(ember)?\b/ },
];

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

/** Angka rupiah: terima 1234567, "1.234.567", "1,234,567.89", "(1.234)" = negatif. */
export function angkaRko(v: unknown): number {
  const u = unwrap(v);
  if (u == null) return 0;
  if (typeof u === 'number') return isFinite(u) ? u : 0;
  let s = String(u).trim();
  if (!s) return 0;
  const negatif = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[^\d,.]/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!isFinite(n)) return 0;
  return negatif ? -Math.abs(n) : n;
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[*:./\\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function colLabel(c: number): string {
  return 'Kolom ' + (c < 26 ? String.fromCharCode(65 + c) : `#${c + 1}`);
}

type Peta = { uraian: number; pagu: number; bulan: Partial<Record<keyof SskMonths, number>> };

/**
 * Peta kolom dari satu baris judul.
 *
 * Urutan pemeriksaan MENGIKAT: judul bulan di berkas luar berbunyi
 * "Januari - Target Fisik" DAN "Januari - Persentase" — dua-duanya menyebut
 * bulannya. Yang diambil hanya kolom nilai; kolom persentase harus dibuang
 * lebih dulu, kalau tidak Januari bisa terisi 0,0562 alih-alih 2,3 miliar.
 * Kolom "Uraian SSK" juga wajib disingkirkan sebelum mencari "Uraian", sebab
 * keduanya cocok pada kata yang sama dan berkas ekspor aplikasi memuat dua-duanya.
 */
function petaKolom(baris: string[]): Peta | null {
  let uraian = -1, pagu = -1;
  const bulan: Partial<Record<keyof SskMonths, number>> = {};

  for (let c = 0; c < baris.length; c++) {
    const h = normHeader(baris[c] ?? '');
    if (!h || h.length > 60) continue;

    if (/persen|persentase|\s%|^%|\bpct\b/.test(h)) continue;   // kolom turunan — dilewati
    if (/\btotal\b/.test(h)) continue;                          // kolom turunan — dilewati

    const b = KUNCI_BULAN.find(x => x.pola.test(h));
    if (b) { if (bulan[b.key] === undefined) bulan[b.key] = c; continue; }

    if (/\bpagu\b/.test(h)) { if (pagu < 0) pagu = c; continue; }
    if (/\bssk\b/.test(h)) continue;                            // "Uraian SSK" — bukan kolom nama baris
    if (/\buraian\b|\brekening\b|\bbelanja\b/.test(h)) { if (uraian < 0) uraian = c; continue; }
  }

  // Tanpa nama baris tidak ada yang bisa dicocokkan; tanpa satu pun bulan berkas
  // itu bukan RKO. Pagu boleh tidak ada — beberapa berkas hanya membawa jadwal.
  if (uraian < 0 || Object.keys(bulan).length === 0) return null;
  return { uraian, pagu, bulan };
}

function cariHeader(grid: string[][]): { row: number; peta: Peta } | null {
  const batas = Math.min(20, grid.length);
  for (let r = 0; r < batas; r++) {
    const peta = petaKolom(grid[r] ?? []);
    if (peta) return { row: r, peta };
  }
  return null;
}

function sheetGrid(ws: ExcelJS.Worksheet): { teks: string[][]; mentah: unknown[][] } {
  const teks: string[][] = [];
  const mentah: unknown[][] = [];
  const maxC = Math.min(ws.columnCount || 0, MAX_GRID_COLS);
  const maxR = Math.min(ws.rowCount || 0, MAX_GRID_ROWS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const t: string[] = [];
    const m: unknown[] = [];
    for (let c = 1; c <= maxC; c++) { t.push(cellStr(row.getCell(c).value)); m.push(row.getCell(c).value); }
    teks.push(t); mentah.push(m);
  }
  return { teks, mentah };
}

/** "RKO BLUD" / "RKO_BLUD_2026-09-02" → 'BLUD'. Garis bawah dijadikan spasi dulu. */
export function sumberRkoDariNama(teks: string): SumberSSK | null {
  const t = teks.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  return SUMBER_VALID.find(s => new RegExp(`\\b${s}\\b`).test(t)) ?? null;
}

function bacaSheet(
  teks: string[][], mentah: unknown[][], source: string, sumberSheet: SumberSSK | null,
): ParseRkoResult {
  const warnings: string[] = [];
  const header = cariHeader(teks);
  const kosong: ParseRkoResult = { rows: [], warnings, sumberSheet, source, mapping: { uraian: '-', pagu: '-', bulan: [] } };
  if (!header) return kosong;

  const { peta } = header;
  const mapping = {
    uraian: colLabel(peta.uraian),
    pagu:   peta.pagu >= 0 ? colLabel(peta.pagu) : '(tidak ada)',
    bulan:  KUNCI_BULAN.map(b => peta.bulan[b.key] !== undefined ? colLabel(peta.bulan[b.key]!) : '-'),
  };

  const bulanHilang = KUNCI_BULAN.filter(b => peta.bulan[b.key] === undefined).map(b => b.key.toUpperCase());
  if (bulanHilang.length > 0) {
    warnings.push(`Kolom bulan tidak ditemukan: ${bulanHilang.join(', ')} — bulan itu diisi 0.`);
  }
  if (peta.pagu < 0) warnings.push('Kolom Pagu tidak ditemukan — pagu diisi 0, persentase ikut 0.');

  const rows: BarisRko[] = [];
  let terpotong = false;
  for (let r = header.row + 1; r < teks.length; r++) {
    const uraian = sanitizeImportText(teks[r][peta.uraian] ?? '').slice(0, MAXLEN_URAIAN);
    if (!uraian) continue;
    if (petaKolom(teks[r])) continue;                 // echo baris judul (berkas multi-halaman)
    if (rows.length >= MAX_ROWS) { terpotong = true; break; }

    const months = KUNCI_BULAN.reduce((acc, b) => {
      const c = peta.bulan[b.key];
      acc[b.key] = c === undefined ? 0 : angkaRko(mentah[r][c]);
      return acc;
    }, {} as SskMonths);
    const pagu = peta.pagu >= 0 ? angkaRko(mentah[r][peta.pagu]) : 0;

    rows.push({ uraian, pagu, months });
  }
  if (terpotong) warnings.push(`Berkas berisi lebih dari ${MAX_ROWS} baris — hanya ${MAX_ROWS} pertama yang diambil.`);

  return { rows, warnings, sumberSheet, source, mapping };
}

export async function parseRkoImport(buf: Buffer): Promise<ParseRkoResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS) {
    throw new Error(`Berkas punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  }

  let terbaik: ParseRkoResult | null = null;
  for (const ws of wb.worksheets) {
    const { teks, mentah } = sheetGrid(ws);
    const hasil = bacaSheet(teks, mentah, `Sheet "${sanitizeImportText(ws.name)}"`, sumberRkoDariNama(ws.name));
    if (!terbaik || hasil.rows.length > terbaik.rows.length) terbaik = hasil;
  }
  if (!terbaik || terbaik.rows.length === 0) {
    throw new Error('Tidak ada baris RKO terdeteksi. Pastikan ada kolom Uraian, Pagu, dan kolom target per bulan (Januari…Desember).');
  }
  return terbaik;
}
