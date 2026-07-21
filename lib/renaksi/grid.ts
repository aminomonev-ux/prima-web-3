// lib/renaksi/grid.ts — Pembaca file → Grid seragam untuk parser Rencana Aksi.
// 3 format: .xlsx (exceljs), .csv (RFC4180 + deteksi delimiter), .pdf digital
// (pdfjs: teks + koordinat → rekonstruksi baris/kolom). Server-only, PURE:
// terima Buffer, balikkan grid — tidak menyentuh DB.
//
// `grid`  = nilai dengan warisan merge (dipakai membaca data)
// `raw`   = hanya sel master merge (dipakai membaca hierarki header — teks induk
//           merge tidak boleh "menular" jadi label anak)

import ExcelJS from 'exceljs';

export type Grid = string[][];
export interface GridResult {
  grid: Grid;
  raw: Grid;
  /** numFmt persen per sel (r,c) — "37%" tersimpan 0.37 di xlsx */
  percent: Set<string>;
  source: string;
  kind: 'xlsx' | 'csv' | 'pdf';
}

// L67 anti zip-bomb / dokumen raksasa
export const MAX_SHEETS = 12;
export const MAX_ROWS = 2000;
export const MAX_COLS = 60;
const MAX_PDF_PAGES = 40;

/** Buang karakter kontrol + bidi-override (CVE-2021-42574), rapikan spasi. */
export function sanitize(s: string, maxLen: number): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200B && c <= 0x200F)
      || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069)
      || c === 0x2028 || c === 0x2029 || c === 0xFEFF) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map(t => t.text).join('');
    }
    if ('text' in o) return o.text;
  }
  return v;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = unwrap(cell.value);
  if (v == null) return '';
  // Angka dibiarkan format kanonik (titik desimal) — grid ini representasi
  // internal, bukan tampilan. Melokalkannya ke koma membuat nilai hasil rumus
  // (7.936508) salah dibaca sebagai pemisah ribuan saat dikonversi balik.
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

// ─── XLSX ───────────────────────────────────────────────────────────────────

function sheetToGrid(ws: ExcelJS.Worksheet): Omit<GridResult, 'source' | 'kind'> {
  const grid: Grid = [];
  const raw: Grid = [];
  const percent = new Set<string>();
  const maxR = Math.min(ws.rowCount || 0, MAX_ROWS);
  const maxC = Math.min(ws.columnCount || 0, MAX_COLS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const arr: string[] = [];
    const arrRaw: string[] = [];
    for (let c = 1; c <= maxC; c++) {
      const cell = row.getCell(c);
      arr.push(cellText(cell));
      arrRaw.push(!cell.isMerged || cell.master === cell ? cellText(cell) : '');
      if (/%/.test(cell.numFmt ?? '')) percent.add(`${r - 1}:${c - 1}`);
    }
    grid.push(arr);
    raw.push(arrRaw);
  }
  return { grid, raw, percent };
}

/** Skor "sheet ini tabel Renaksi": makin banyak kata kunci header makin tinggi. */
function sheetScore(grid: Grid): number {
  const head = grid.slice(0, 30).flat().join(' | ').toLowerCase();
  let s = 0;
  for (const k of ['indikator', 'sub kegiatan', 'sub-kegiatan', 'kegiatan', 'program', 'sasaran', 'tujuan', 'satuan', 'target']) {
    if (head.includes(k)) s++;
  }
  return s;
}

async function readXlsx(buf: Buffer): Promise<GridResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets = wb.worksheets ?? [];
  if (sheets.length === 0) throw new Error('File Excel tidak punya sheet.');
  if (sheets.length > MAX_SHEETS) throw new Error(`File punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);

  let best: { ws: ExcelJS.Worksheet; g: Omit<GridResult, 'source' | 'kind'>; score: number } | null = null;
  for (const ws of sheets) {
    const g = sheetToGrid(ws);
    const score = sheetScore(g.grid);
    if (!best || score > best.score) best = { ws, g, score };
  }
  if (!best || best.score < 3) {
    throw new Error('Tidak ditemukan tabel Rencana Aksi di file ini (butuh kolom Indikator + minimal Program/Kegiatan).');
  }
  return { ...best.g, source: `Sheet "${best.ws.name}"`, kind: 'xlsx' };
}

// ─── CSV ────────────────────────────────────────────────────────────────────

function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [',', ';', '\t'].map(d => ({ d, n: (head.match(new RegExp(`\\${d}`, 'g')) ?? []).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

function parseCsv(text: string, delim: string): Grid {
  const grid: Grid = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(cur); cur = ''; continue; }
    if (ch === '\n') {
      row.push(cur); cur = '';
      grid.push(row.slice(0, MAX_COLS));
      row = [];
      if (grid.length >= MAX_ROWS) break;
      continue;
    }
    if (ch === '\r') continue;
    cur += ch;
  }
  if (cur || row.length) { row.push(cur); grid.push(row.slice(0, MAX_COLS)); }
  return grid.map(r => r.map(v => v.replace(/\s+/g, ' ').trim()));
}

function readCsv(buf: Buffer): GridResult {
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const grid = parseCsv(text, detectDelimiter(text));
  if (grid.length === 0) throw new Error('File CSV kosong.');
  return { grid, raw: grid, percent: new Set(), source: 'CSV', kind: 'csv' };
}

// ─── PDF digital (bukan hasil scan) ─────────────────────────────────────────

interface PdfItem { text: string; x: number; y: number; w: number }

async function pdfItems(buf: Buffer): Promise<{ items: PdfItem[][]; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out: PdfItem[][] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number }[]) {
      const text = (it.str ?? '').replace(/\s+/g, ' ');
      if (!text.trim()) continue;
      const tr = it.transform ?? [];
      items.push({ text, x: tr[4] ?? 0, y: tr[5] ?? 0, w: it.width ?? 0 });
    }
    out.push(items);
  }
  await task.destroy();
  return { items: out, pages };
}

/**
 * Rekonstruksi tabel: kelompokkan item per baris (toleransi y), tentukan batas
 * kolom dari klaster koordinat x seluruh halaman, lalu tempatkan tiap item ke
 * kolom terdekat. Hasilnya kasar dibanding sel Excel — pemanggil menandai baris
 * PDF sebagai "perlu dicek" lebih agresif.
 */
function itemsToGrid(pages: PdfItem[][]): Grid {
  const allItems = pages.flat();
  if (allItems.length === 0) return [];

  // Batas kolom = posisi x yang SERING dipakai sebagai awal teks. Memakai jarak
  // antar-x saja (klaster serakah) menyatukan dua kolom sempit yang berdekatan;
  // histogram frekuensi memisahkannya karena tiap kolom nyata punya puluhan item
  // yang mulai di x yang sama, sedangkan teks membungkus tidak menambah x baru.
  const freq = new Map<number, number>();
  for (const it of allItems) {
    const x = Math.round(it.x);
    freq.set(x, (freq.get(x) ?? 0) + 1);
  }
  const kandidat = [...freq.entries()].sort((a, b) => a[0] - b[0]);

  const klaster: Array<{ x: number; n: number }> = [];
  const MERGE = 3;
  for (const [x, n] of kandidat) {
    const last = klaster[klaster.length - 1];
    if (last && x - last.x <= MERGE) { last.n += n; continue; }
    klaster.push({ x, n });
  }

  const ambang = Math.max(2, Math.round(allItems.length * 0.008));
  let cols = klaster.filter(k => k.n >= ambang).map(k => k.x).slice(0, MAX_COLS);
  if (cols.length < 2) cols = klaster.map(k => k.x).slice(0, MAX_COLS);

  const colOf = (x: number) => {
    let best = 0;
    let bestD = Infinity;
    cols.forEach((b, i) => { const d = Math.abs(x - b); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };

  const grid: Grid = [];
  for (const items of pages) {
    const lines = new Map<number, PdfItem[]>();
    for (const it of items) {
      const key = Math.round(it.y / 4) * 4;
      const arr = lines.get(key);
      if (arr) arr.push(it); else lines.set(key, [it]);
    }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const row: string[] = new Array(cols.length).fill('');
      for (const it of (lines.get(y) ?? []).sort((a, b) => a.x - b.x)) {
        const c = colOf(it.x);
        row[c] = row[c] ? `${row[c]} ${it.text}`.trim() : it.text.trim();
      }
      if (row.some(v => v)) grid.push(row);
      if (grid.length >= MAX_ROWS) return grid;
    }
  }
  return grid;
}

async function readPdf(buf: Buffer): Promise<GridResult> {
  const { items, pages } = await pdfItems(buf);
  const totalChars = items.flat().reduce((s, i) => s + i.text.length, 0);
  // PDF hasil scan = halaman gambar, nyaris tanpa teks. Ditolak (bukan OCR):
  // salah baca angka target/anggaran tidak terlihat sebagai error.
  if (totalChars < pages * 200) {
    throw new Error('PDF ini sepertinya hasil scan/gambar — teksnya tidak bisa dibaca. Konversi dulu ke Excel, lalu impor ulang.');
  }
  const grid = itemsToGrid(items);
  if (grid.length === 0) throw new Error('Tidak ada teks tabel yang terbaca dari PDF.');
  return { grid, raw: grid, percent: new Set(), source: `PDF ${pages} halaman`, kind: 'pdf' };
}

// ─── Entry ──────────────────────────────────────────────────────────────────

export async function readGrid(buf: Buffer, filename: string): Promise<GridResult> {
  const name = filename.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(buf);
  if (name.endsWith('.csv')) return readCsv(buf);
  if (name.endsWith('.pdf')) return readPdf(buf);
  throw new Error('Format file harus .xlsx, .csv, atau .pdf.');
}
