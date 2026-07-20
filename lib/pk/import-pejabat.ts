// lib/pk/import-pejabat.ts — Import Master Pejabat dari Excel (.xlsx) / CSV / Word (.docx).
// Server-only. PURE terhadap I/O (pola kinerja-import): terima Buffer + daftar unit
// kanonik pk_unit_kerja, balikkan baris + mapping + warnings; TIDAK menulis DB.
// Smart detect 3 lapis: auto-cari baris header → kamus alias kolom → fallback
// deteksi berbasis isi. Unit kerja teks bebas dipetakan fuzzy ke unit kanonik
// (sinonim struktural: Kepala Bagian=Kabag, Kepala Bidang=Kabid, dst).

import ExcelJS from 'exceljs';
import PizZip from 'pizzip';

export type ImportFormat = 'xlsx' | 'csv' | 'docx';
export type UnitMatchStatus = 'auto' | 'suggest' | 'unmatched';

export interface UnitMatch {
  canonical: string | null;
  score: number;
  status: UnitMatchStatus;
}

export interface ImportPejabatRow {
  unit_file: string;
  nama: string;
  jabatan: string;
  pangkat: string | null;
  nip: string | null;
  unitMatch: UnitMatch;
  warnings: string[];
}

export interface ImportPejabatResult {
  rows: ImportPejabatRow[];
  /** field → label kolom sumber, mis. { nama: 'Kolom B' } — transparansi preview */
  mapping: Partial<Record<PejabatField, string>>;
  warnings: string[];
  source: string;
}

type PejabatField = 'unit_kerja' | 'nama' | 'jabatan' | 'pangkat' | 'nip';
type Grid = string[][];

// L67: anti zip/decompression-bomb — xlsx & docx = kontainer zip.
const MAX_SHEETS = 20;
const MAX_GRID_ROWS = 400;
const MAX_GRID_COLS = 20;
const MAX_DOCX_XML = 10_000_000;
// PejabatBodySchema cap 100 rows — import ikut cap yang sama.
const MAX_IMPORT_ROWS = 100;

const FIELDS: PejabatField[] = ['unit_kerja', 'nama', 'jabatan', 'pangkat', 'nip'];
const HEADER_ALIASES: Record<PejabatField, RegExp> = {
  unit_kerja: /\bunit(\s*kerja)?\b|\bsatuan kerja\b/,
  nama:       /\bnama\b/,
  jabatan:    /\bjabatan\b/,
  pangkat:    /\bpangkat\b|\bgol(ongan)?\b/,
  nip:        /\bnip\b/,
};
const FIELD_MAXLEN: Record<PejabatField, number> = {
  unit_kerja: 255, nama: 255, jabatan: 255, pangkat: 100, nip: 50,
};

// Sama dengan sanitizeImportText kinerja-import (anti kontrol/zero-width/bidi,
// CVE-2021-42574) — cap panjang mengikuti kolom schema, bukan 300 flat.
function sanitizeText(s: string, maxLen: number): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x2028 || c === 0x2029 || c === 0xFEFF) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

// ─── Unit matcher ───────────────────────────────────────────────────────────

// Normalisasi teks unit → token set. Sinonim gelar struktural dua arah
// (file formal panjang ↔ kanonik pendek pk_unit_kerja). Urutan replace penting:
// "kepala sub bagian" sebelum "kepala bagian".
function unitTokens(s: string): Set<string> {
  let t = ' ' + s.toLowerCase() + ' ';
  t = t
    .replace(/\bkepala\s+sub\s*bagian\b/g, ' kasubbag ')
    .replace(/\bka\.?\s*sub\s*bag\b/g, ' kasubbag ')
    .replace(/\bkasubag\b/g, ' kasubbag ')
    .replace(/\bkepala\s+bagian\b/g, ' kabag ')
    .replace(/\bka\.?\s*bag\b/g, ' kabag ')
    .replace(/\bkepala\s+bidang\b/g, ' kabid ')
    .replace(/\bka\.?\s*bid\b/g, ' kabid ')
    .replace(/\bkepala\s+seksi\b/g, ' kasi ')
    .replace(/\bkasie\b/g, ' kasi ')
    .replace(/\bwakil\s+direktur\b/g, ' wadir ')
    .replace(/\bplt\.?\b/g, ' plt ')
    .replace(/\btata\s+usaha\b/g, ' tu ')
    .replace(/\bhubungan\s+masyarakat\b/g, ' humas ');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return new Set(t.split(' ').filter(w => w && w !== 'dan'));
}

function diceScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return (2 * inter) / (a.size + b.size);
}

export function matchUnit(raw: string, canonicals: { name: string; tokens: Set<string> }[]): UnitMatch {
  const t = unitTokens(raw);
  let best: string | null = null;
  let bestScore = 0;
  for (const c of canonicals) {
    const s = diceScore(t, c.tokens);
    if (s > bestScore) { bestScore = s; best = c.name; }
  }
  if (bestScore >= 0.85) return { canonical: best, score: bestScore, status: 'auto' };
  if (bestScore >= 0.60) return { canonical: best, score: bestScore, status: 'suggest' };
  return { canonical: null, score: bestScore, status: 'unmatched' };
}

// ─── Deteksi kolom ──────────────────────────────────────────────────────────

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[*:./\\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

type ColMap = Partial<Record<PejabatField, number>>;

function detectHeaderRow(grid: Grid): { row: number; cols: ColMap } | null {
  const scanEnd = Math.min(20, grid.length);
  for (let r = 0; r < scanEnd; r++) {
    const cols: ColMap = {};
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const h = normHeader(grid[r][c] ?? '');
      if (!h || h.length > 40) continue;
      for (const f of FIELDS) {
        if (cols[f] === undefined && HEADER_ALIASES[f].test(h)) { cols[f] = c; break; }
      }
    }
    // Min 2 field dikenali + salah satunya nama/nip → bukan baris judul dokumen.
    if (Object.keys(cols).length >= 2 && (cols.nama !== undefined || cols.nip !== undefined)) {
      return { row: r, cols };
    }
  }
  return null;
}

const RE_NIP     = /^\d[\d\s.]{14,24}$/;
const RE_PANGKAT = /(pembina|penata|pengatur|juru)|\b(iv|iii|ii|i)\s*\/\s*[a-e]\b/i;
const RE_STRUKT  = /\b(kepala|direktur|wadir|wakil direktur|kasubbag|kasubag|kabag|kabid|kasi|kasie|ketua)\b/i;
const RE_GELAR   = /,\s*(s\.|m\.|a\.?md|dr|ns|skm|se\b|sh\b|st\b|mm\b)|^(dr|drg|drs|ir|rr)[.\s]/i;

// Fallback kalau header tidak ketemu: tebak kolom dari pola isi.
function detectByContent(grid: Grid): ColMap | null {
  const nCols = Math.max(0, ...grid.map(r => r.length));
  if (nCols === 0) return null;
  const stat = Array.from({ length: nCols }, () => ({ fill: 0, nip: 0, pangkat: 0, strukt: 0, gelar: 0 }));
  for (const row of grid.slice(0, 60)) {
    for (let c = 0; c < nCols; c++) {
      const v = (row[c] ?? '').trim();
      if (!v) continue;
      const s = stat[c];
      s.fill++;
      if (RE_NIP.test(v)) s.nip++;
      else if (RE_PANGKAT.test(v)) s.pangkat++;
      else if (RE_STRUKT.test(v)) s.strukt++;
      if (RE_GELAR.test(v)) s.gelar++;
    }
  }
  const majority = (k: 'nip' | 'pangkat' | 'strukt') => (c: number) =>
    stat[c].fill >= 3 && stat[c][k] / stat[c].fill >= 0.5;
  const all = Array.from({ length: nCols }, (_, c) => c);
  const cols: ColMap = {};
  const nipCol = all.find(majority('nip'));
  if (nipCol !== undefined) cols.nip = nipCol;
  const pangkatCol = all.find(c => c !== nipCol && majority('pangkat')(c));
  if (pangkatCol !== undefined) cols.pangkat = pangkatCol;
  const struktCols = all.filter(c => c !== nipCol && c !== pangkatCol && majority('strukt')(c));
  if (struktCols.length > 0) {
    cols.unit_kerja = struktCols[0];
    cols.jabatan = struktCols[1] ?? struktCols[0];
  }
  const taken = new Set(Object.values(cols));
  const namaCol = all
    .filter(c => !taken.has(c) && stat[c].fill >= 3)
    .sort((a, b) => (stat[b].gelar - stat[a].gelar) || (stat[b].fill - stat[a].fill))[0];
  if (namaCol !== undefined && (stat[namaCol].gelar > 0 || cols.unit_kerja !== undefined)) cols.nama = namaCol;
  if (cols.nama === undefined || (cols.unit_kerja === undefined && cols.jabatan === undefined)) return null;
  return cols;
}

// ─── Grid → baris pejabat ───────────────────────────────────────────────────

function colLabel(c: number): string {
  return 'Kolom ' + (c < 26 ? String.fromCharCode(65 + c) : `#${c + 1}`);
}

function gridToPejabat(
  grid: Grid,
  canonicals: { name: string; tokens: Set<string> }[],
  source: string,
): ImportPejabatResult {
  const warnings: string[] = [];
  const header = detectHeaderRow(grid);
  let cols: ColMap;
  let dataStart: number;
  if (header) {
    cols = header.cols;
    dataStart = header.row + 1;
  } else {
    const guessed = detectByContent(grid);
    if (!guessed) return { rows: [], mapping: {}, warnings: [], source };
    cols = guessed;
    dataStart = 0;
    warnings.push('Baris header tidak ditemukan — kolom dideteksi dari pola isi. Periksa hasil mapping.');
  }

  const mapping: Partial<Record<PejabatField, string>> = {};
  for (const f of FIELDS) if (cols[f] !== undefined) mapping[f] = colLabel(cols[f]!);

  const get = (row: string[], f: PejabatField): string => {
    const c = cols[f];
    if (c === undefined) return '';
    return sanitizeText(row[c] ?? '', FIELD_MAXLEN[f]);
  };

  const rows: ImportPejabatRow[] = [];
  let truncated = false;
  for (let r = dataStart; r < grid.length; r++) {
    const unitRaw = get(grid[r], 'unit_kerja');
    const nama    = get(grid[r], 'nama');
    const jab     = get(grid[r], 'jabatan');
    const pangkat = get(grid[r], 'pangkat');
    const nip     = get(grid[r], 'nip');
    if (!unitRaw && !nama && !jab) continue;
    // Echo header berulang (file gabungan multi-halaman) di-skip.
    if (HEADER_ALIASES.nama.test(normHeader(nama)) && HEADER_ALIASES.jabatan.test(normHeader(jab))) continue;
    if (rows.length >= MAX_IMPORT_ROWS) { truncated = true; break; }

    const unitFile = unitRaw || jab;
    const rowWarnings: string[] = [];
    if (!nama) rowWarnings.push('Nama kosong — wajib diisi sebelum simpan');
    if (nip && nip.replace(/\D/g, '').length !== 18) rowWarnings.push('NIP bukan 18 digit');

    rows.push({
      unit_file: unitFile,
      nama,
      jabatan: jab || unitRaw,
      pangkat: pangkat || null,
      nip: nip || null,
      unitMatch: matchUnit(unitFile, canonicals),
      warnings: rowWarnings,
    });
  }
  if (truncated) warnings.push(`File berisi lebih dari ${MAX_IMPORT_ROWS} baris — hanya ${MAX_IMPORT_ROWS} pertama yang diambil.`);

  const seen = new Map<string, number>();
  for (const row of rows) {
    const c = row.unitMatch.canonical;
    if (!c) continue;
    seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  for (const [unit, n] of seen) {
    if (n > 1) warnings.push(`${n} baris terpetakan ke unit yang sama: "${unit}" — pilih salah satu (UNIQUE per unit per tahun).`);
  }
  return { rows, mapping, warnings, source };
}

// ─── Pembaca per format ─────────────────────────────────────────────────────

function unwrapCell(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrapCell(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}
function cellStr(v: unknown): string {
  const u = unwrapCell(v);
  if (u == null) return '';
  if (u instanceof Date) return u.toISOString().slice(0, 10);
  return String(u).replace(/\s+/g, ' ').trim();
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

async function xlsxGrids(buf: Buffer): Promise<{ grid: Grid; source: string }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS)
    throw new Error(`File punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  return wb.worksheets.map(ws => ({ grid: sheetGrid(ws), source: `Sheet "${ws.name}"` }));
}

function csvGrid(text: string): Grid {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).slice(0, MAX_GRID_ROWS);
  const sample = lines.filter(l => l.trim()).slice(0, 5).join('\n');
  const delim = [';', ',', '\t']
    .map(d => ({ d, n: (sample.match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) ?? []).length }))
    .sort((a, b) => b.n - a.n)[0].d;
  return lines.map(line => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
      if (out.length >= MAX_GRID_COLS) break;
    }
    out.push(cur);
    return out;
  });
}

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function docxGrid(buf: Buffer): Grid {
  let zip: PizZip;
  try { zip = new PizZip(buf); }
  catch { throw new Error('File Word tidak valid (bukan .docx).'); }
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('File Word tidak valid (word/document.xml tidak ada).');
  const xml = f.asText();
  if (xml.length > MAX_DOCX_XML) throw new Error('Isi dokumen Word terlalu besar.');
  const grid: Grid = [];
  for (const tbl of xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? []) {
    for (const tr of tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []) {
      const cells = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
      const row = cells.slice(0, MAX_GRID_COLS).map(tc =>
        decodeXml((tc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map(t => t.replace(/<[^>]+>/g, '')).join(' '))
          .replace(/\s+/g, ' ').trim(),
      );
      grid.push(row);
      if (grid.length >= MAX_GRID_ROWS) return grid;
    }
  }
  if (grid.length === 0) throw new Error('Tidak ditemukan tabel di dokumen Word. Data pejabat harus berbentuk tabel.');
  return grid;
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function parsePejabatImport(
  buf: Buffer,
  format: ImportFormat,
  unitNames: string[],
): Promise<ImportPejabatResult> {
  const canonicals = unitNames.map(name => ({ name, tokens: unitTokens(name) }));

  if (format === 'xlsx') {
    const grids = await xlsxGrids(buf);
    let best: ImportPejabatResult | null = null;
    for (const { grid, source } of grids) {
      const parsed = gridToPejabat(grid, canonicals, source);
      if (!best || parsed.rows.length > best.rows.length) best = parsed;
    }
    if (!best || best.rows.length === 0)
      throw new Error('Tidak ada data pejabat terdeteksi di file Excel. Pastikan ada kolom Nama/Jabatan/NIP.');
    return best;
  }

  if (format === 'csv') {
    const parsed = gridToPejabat(csvGrid(buf.toString('utf8')), canonicals, 'CSV');
    if (parsed.rows.length === 0)
      throw new Error('Tidak ada data pejabat terdeteksi di file CSV.');
    return parsed;
  }

  const parsed = gridToPejabat(docxGrid(buf), canonicals, 'Tabel Word');
  if (parsed.rows.length === 0)
    throw new Error('Tidak ada data pejabat terdeteksi di tabel Word.');
  return parsed;
}
