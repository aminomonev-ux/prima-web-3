// ═══ PRIMA — LKJIP — Model sel tabel (pure, client+server safe) ═══════════════
// Fitur Excel-like: merge (colSpan/rowSpan), align H (kiri/tengah/kanan/justify),
// vertical-align, bold, ukuran font per sel, border kustom per sisi, format angka,
// rumus (=SUM/AVERAGE/MIN/MAX/COUNT/ABS/ROUND + aritmetika + ref A1/range A1:B3),
// dan copy/paste antar sel. Backward-compatible: sel lama string → { v }.
// Dipakai editor (client), docgen (server), schemas (zod transform).

import { bulatkanDesimal } from '@/lib/shared/desimal';

export type TabelAlign = 'left' | 'center' | 'right' | 'justify';
export type TabelVAlign = 'top' | 'middle' | 'bottom';
export type TabelNumFmt = 'num' | 'rp' | 'pct';
export interface TabelBorder { t?: number; r?: number; b?: number; l?: number } // OOXML sz (1/8 pt); 0 = tanpa garis

export interface TabelCell {
  v: string;           // teks ATAU rumus diawali '='
  cs?: number;         // colSpan (>1)
  rs?: number;         // rowSpan (>1)
  h?: boolean;         // hidden — tertutup oleh merge sel lain
  al?: TabelAlign;
  va?: TabelVAlign;
  b?: boolean;         // bold
  fs?: number;         // ukuran font (pt)
  bd?: TabelBorder;    // border per sisi
  nf?: TabelNumFmt;    // format angka
  dec?: number;        // jumlah desimal untuk nf
  bg?: string;         // warna latar sel (hex 6 digit tanpa '#')
}

export function normalizeCell(c: unknown): TabelCell {
  if (typeof c === 'string') return { v: c };
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    const cell: TabelCell = { v: typeof o.v === 'string' ? o.v : String(o.v ?? '') };
    if (typeof o.cs === 'number' && o.cs > 1) cell.cs = Math.floor(o.cs);
    if (typeof o.rs === 'number' && o.rs > 1) cell.rs = Math.floor(o.rs);
    if (o.h === true) cell.h = true;
    if (o.al === 'left' || o.al === 'center' || o.al === 'right' || o.al === 'justify') cell.al = o.al;
    if (o.va === 'top' || o.va === 'middle' || o.va === 'bottom') cell.va = o.va;
    if (o.b === true) cell.b = true;
    if (typeof o.fs === 'number' && o.fs > 0) cell.fs = Math.floor(o.fs);
    if (o.bd && typeof o.bd === 'object') {
      const bd = o.bd as Record<string, unknown>;
      const out: TabelBorder = {};
      (['t', 'r', 'b', 'l'] as const).forEach(k => { if (typeof bd[k] === 'number') out[k] = Math.max(0, Math.floor(bd[k] as number)); });
      if (Object.keys(out).length) cell.bd = out;
    }
    if (o.nf === 'num' || o.nf === 'rp' || o.nf === 'pct') cell.nf = o.nf;
    if (typeof o.dec === 'number' && o.dec >= 0) cell.dec = Math.min(6, Math.floor(o.dec));
    if (typeof o.bg === 'string' && /^[0-9a-fA-F]{6}$/.test(o.bg)) cell.bg = o.bg.toUpperCase();
    return cell;
  }
  return { v: '' };
}

export function normalizeRows(rows: unknown): TabelCell[][] {
  return Array.isArray(rows) ? rows.map(r => (Array.isArray(r) ? r.map(normalizeCell) : [])) : [];
}

export function sanitizeRows(rows: TabelCell[][], ncol: number): TabelCell[][] {
  const next = rows.map(r => {
    const row = r.slice(0, ncol).map(c => ({ ...c }));
    while (row.length < ncol) row.push({ v: '' });
    return row;
  });
  const nrow = next.length;
  for (let r = 0; r < nrow; r++) {
    for (let c = 0; c < ncol; c++) {
      const cell = next[r][c];
      delete cell.h;
      let cs = cell.cs ?? 1, rs = cell.rs ?? 1;
      cs = Math.max(1, Math.min(cs, ncol - c));
      rs = Math.max(1, Math.min(rs, nrow - r));
      if (cs > 1) cell.cs = cs; else delete cell.cs;
      if (rs > 1) cell.rs = rs; else delete cell.rs;
    }
  }
  for (let r = 0; r < nrow; r++) {
    for (let c = 0; c < ncol; c++) {
      const cell = next[r][c];
      if (cell.h) continue;
      const cs = cell.cs ?? 1, rs = cell.rs ?? 1;
      if (cs <= 1 && rs <= 1) continue;
      for (let rr = r; rr < r + rs; rr++) {
        for (let cc = c; cc < c + cs; cc++) {
          if (rr === r && cc === c) continue;
          const cov = next[rr][cc];
          cov.h = true;
          delete cov.cs;
          delete cov.rs;
        }
      }
    }
  }
  return next;
}

export function mergeCells(rows: TabelCell[][], r1: number, c1: number, r2: number, c2: number, ncol: number): TabelCell[][] {
  const rr1 = Math.min(r1, r2), rr2 = Math.max(r1, r2);
  const cc1 = Math.min(c1, c2), cc2 = Math.max(c1, c2);
  const next = rows.map(r => r.map(c => ({ ...c })));
  for (let r = rr1; r <= rr2; r++) {
    for (let c = cc1; c <= cc2; c++) {
      if (!next[r]?.[c]) continue;
      delete next[r][c].cs;
      delete next[r][c].rs;
      delete next[r][c].h;
    }
  }
  next[rr1][cc1].cs = cc2 - cc1 + 1;
  next[rr1][cc1].rs = rr2 - rr1 + 1;
  return sanitizeRows(next, ncol);
}

export function unmergeAt(rows: TabelCell[][], r: number, c: number, ncol: number): TabelCell[][] {
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  if (next[r]?.[c]) { delete next[r][c].cs; delete next[r][c].rs; }
  return sanitizeRows(next, ncol);
}

export type CellMeta = { kind: 'origin' | 'vcont' | 'skip' | 'normal'; cs: number; rs: number };

export function buildTableMeta(rows: TabelCell[][], ncol: number): CellMeta[][] {
  const nrow = rows.length;
  const meta: CellMeta[][] = Array.from({ length: nrow }, () =>
    Array.from({ length: ncol }, () => ({ kind: 'normal' as const, cs: 1, rs: 1 })),
  );
  for (let r = 0; r < nrow; r++) {
    for (let c = 0; c < ncol; c++) {
      const cell = rows[r]?.[c];
      if (!cell || cell.h) continue;
      const cs = Math.min(cell.cs ?? 1, ncol - c);
      const rs = Math.min(cell.rs ?? 1, nrow - r);
      if (cs <= 1 && rs <= 1) continue;
      meta[r][c] = { kind: 'origin', cs, rs };
      for (let rr = r; rr < r + rs; rr++) {
        for (let cc = c; cc < c + cs; cc++) {
          if (rr === r && cc === c) continue;
          meta[rr][cc] = cc === c && rr > r ? { kind: 'vcont', cs, rs: 1 } : { kind: 'skip', cs: 1, rs: 1 };
        }
      }
    }
  }
  return meta;
}

// ── Copy / paste antar sel (nilai + format, tanpa merge) ──────────────────────
export function extractRange(rows: TabelCell[][], r1: number, c1: number, r2: number, c2: number): TabelCell[][] {
  const out: TabelCell[][] = [];
  for (let r = r1; r <= r2; r++) {
    const row: TabelCell[] = [];
    for (let c = c1; c <= c2; c++) {
      const src = rows[r]?.[c];
      const cell: TabelCell = { v: src?.v ?? '' };
      if (src) {
        if (src.al) cell.al = src.al;
        if (src.va) cell.va = src.va;
        if (src.b) cell.b = src.b;
        if (src.fs) cell.fs = src.fs;
        if (src.bd) cell.bd = { ...src.bd };
        if (src.nf) cell.nf = src.nf;
        if (src.dec != null) cell.dec = src.dec;
        if (src.bg) cell.bg = src.bg;
      }
      row.push(cell);
    }
    out.push(row);
  }
  return out;
}

export function pasteRange(rows: TabelCell[][], r1: number, c1: number, clip: TabelCell[][], ncol: number): TabelCell[][] {
  const next = rows.map(r => r.map(c => ({ ...c })));
  const need = r1 + clip.length;
  while (next.length < need) next.push(Array.from({ length: ncol }, () => ({ v: '' } as TabelCell)));
  for (let i = 0; i < clip.length; i++) {
    for (let j = 0; j < clip[i].length; j++) {
      const r = r1 + i, c = c1 + j;
      if (c >= ncol) continue;
      next[r][c] = { ...clip[i][j] };
    }
  }
  return sanitizeRows(next, ncol);
}

export function rangeToTSV(grid: TabelCell[][]): string {
  return grid.map(row => row.map(c => (c.v ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n');
}

/** Parse teks clipboard (TSV dari Excel/Google Sheets) → grid sel (nilai saja). */
export function parseTSV(text: string): TabelCell[][] {
  const body = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!body) return [];
  return body.split('\n').map(line => line.split('\t').map(v => ({ v } as TabelCell)));
}

// ── Rumus + format angka ──────────────────────────────────────────────────────
export function colLabel(i: number): string {
  let s = '', n = Math.floor(i);
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  const letters = m[1].toUpperCase();
  for (let i = 0; i < letters.length; i++) c = c * 26 + (letters.charCodeAt(i) - 64);
  const r = parseInt(m[2], 10) - 1;
  return r < 0 || c - 1 < 0 ? null : { r, c: c - 1 };
}

const ANGKA_MESIN = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;

/**
 * Angka mentah sel non-rumus. Sel berformat (`nf`) menyimpan angka MESIN ("0.125", hasil tarikan
 * modul); sel polos berisi ketikan gaya Indonesia ("1.250.000", "7,5"). T1: rumus dulu membuang
 * semua selain `0-9 . -`, jadi "1.250.000" terbaca 1,25 dan "7,5" terbaca 75 — tanpa galat.
 */
function angkaMentah(cell: TabelCell): number {
  const v = (cell.v ?? '').trim();
  if (!v) return 0;
  if (cell.nf && ANGKA_MESIN.test(v)) return Number(v);
  return angkaTeksId(v);
}

function cellNumber(rows: TabelCell[][], r: number, c: number, seen: Set<string>): number {
  const cell = rows[r]?.[c];
  if (!cell) return 0;
  const v = cell.v ?? '';
  if (typeof v === 'string' && v.trim().startsWith('=')) return evalFormula(v.trim().slice(1), rows, r, c, seen);
  return angkaMentah(cell);
}

// Diekspor: rumus kolom tabel tertaut (tautan.ts) memeriksa nama fungsi terhadap daftar yang sama.
export const FUNCS = new Set(['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT', 'ABS', 'ROUND', 'IF', 'AND', 'OR', 'NOT']);

function evalFormula(expr: string, rows: TabelCell[][], r: number, c: number, seen: Set<string>): number {
  const key = `${r}:${c}`;
  if (seen.has(key)) return NaN;
  const next = new Set(seen); next.add(key);
  try {
    const toks = expr.match(/[A-Za-z]+\d+|[A-Za-z]+|\d+\.?\d*|\.\d+|>=|<=|<>|!=|==|[-+*/^(),:%<>=]/g) ?? [];
    let pos = 0;
    const peek = () => toks[pos];
    const eat = () => toks[pos++];

    const rangeVals = (a: string, b: string): number[] => {
      const ra = parseRef(a), rb = parseRef(b);
      if (!ra || !rb) return [];
      const r1 = Math.min(ra.r, rb.r), r2 = Math.max(ra.r, rb.r), c1 = Math.min(ra.c, rb.c), c2 = Math.max(ra.c, rb.c);
      const out: number[] = [];
      for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) out.push(cellNumber(rows, rr, cc, next));
      return out;
    };
    const fnArgs = (): number[] => {
      const vals: number[] = [];
      if (eat() !== '(') throw new Error('(');
      if (peek() !== ')') {
        do {
          const t = peek() ?? '';
          if (/^[A-Za-z]+\d+$/.test(t) && toks[pos + 1] === ':') { const a = eat(); eat(); vals.push(...rangeVals(a, eat())); }
          else vals.push(comparison());
        } while (peek() === ',' && eat());
      }
      if (eat() !== ')') throw new Error(')');
      return vals;
    };
    const callFn = (name: string): number => {
      const a = fnArgs(); const N = name.toUpperCase();
      if (N === 'SUM') return a.reduce((x, y) => x + y, 0);
      if (N === 'AVERAGE' || N === 'AVG') return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      if (N === 'MIN') return a.length ? Math.min(...a) : 0;
      if (N === 'MAX') return a.length ? Math.max(...a) : 0;
      if (N === 'COUNT') return a.filter(v => Number.isFinite(v)).length;
      if (N === 'ABS') return Math.abs(a[0] ?? 0);
      if (N === 'ROUND') { const f = Math.pow(10, Math.floor(a[1] ?? 0)); return Math.round((a[0] ?? 0) * f) / f; }
      if (N === 'IF') return (a[0] ?? 0) !== 0 ? (a[1] ?? 0) : (a[2] ?? 0);
      if (N === 'AND') return a.length > 0 && a.every(v => v !== 0) ? 1 : 0;
      if (N === 'OR') return a.some(v => v !== 0) ? 1 : 0;
      if (N === 'NOT') return (a[0] ?? 0) === 0 ? 1 : 0;
      return NaN;
    };
    const primary = (): number => {
      const t = peek();
      if (t === '(') { eat(); const v = comparison(); if (eat() !== ')') throw new Error(')'); return v; }
      if (t === '-') { eat(); return -primary(); }
      if (t === '+') { eat(); return primary(); }
      if (t && /^\d+\.?\d*$|^\.\d+$/.test(t)) { eat(); return parseFloat(t); }
      if (t && /^[A-Za-z]+\d+$/.test(t)) {
        const a = eat();
        if (peek() === ':') { eat(); return rangeVals(a, eat()).reduce((x, y) => x + y, 0); }
        const ref = parseRef(a); return ref ? cellNumber(rows, ref.r, ref.c, next) : NaN;
      }
      if (t && /^[A-Za-z]+$/.test(t) && FUNCS.has(t.toUpperCase())) { eat(); return callFn(t); }
      throw new Error('tok');
    };
    const postfix = (): number => { let v = primary(); while (peek() === '%') { eat(); v /= 100; } return v; };
    const power = (): number => { let v = postfix(); while (peek() === '^') { eat(); v = Math.pow(v, postfix()); } return v; };
    const term = (): number => {
      let v = power();
      while (peek() === '*' || peek() === '/') { const op = eat(); const r2 = power(); v = op === '*' ? v * r2 : (r2 === 0 ? NaN : v / r2); }
      return v;
    };
    function expression(): number {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = eat(); const r2 = term(); v = op === '+' ? v + r2 : v - r2; }
      return v;
    }
    function comparison(): number {
      const v = expression();
      const t = peek();
      if (t === '>' || t === '<' || t === '>=' || t === '<=' || t === '=' || t === '==' || t === '<>' || t === '!=') {
        eat(); const r2 = expression();
        const res = t === '>' ? v > r2 : t === '<' ? v < r2 : t === '>=' ? v >= r2 : t === '<=' ? v <= r2
          : (t === '=' || t === '==') ? v === r2 : v !== r2;
        return res ? 1 : 0;
      }
      return v;
    }
    const val = comparison();
    if (pos !== toks.length) return NaN;
    return val;
  } catch { return NaN; }
}

export function formatNumber(n: number, nf?: TabelNumFmt, dec?: number): string {
  if (!Number.isFinite(n)) return '#ERR';
  const value = nf === 'pct' ? n * 100 : n;   // persen: persis Excel (0,5 → 50%)
  const d = Math.max(0, Math.min(6, dec ?? 0));
  // `toFixed` langsung tergelincir IEEE-754: 2,675 tersimpan 2,67499… → "2.67". Dibulatkan dulu.
  const fixed = bulatkanDesimal(value, d).toFixed(d);
  const neg = fixed.startsWith('-');
  const [intPart, frac] = (neg ? fixed.slice(1) : fixed).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let body = frac ? `${grouped},${frac}` : grouped;
  if (neg) body = '-' + body;
  if (nf === 'rp') return `Rp ${body}`;
  if (nf === 'pct') return `${body}%`;
  return body;
}

/** Teks angka gaya Indonesia ("1.250.000", "7,5", "Rp 2.000", "85,5%") → angka. */
function angkaTeksId(v: string): number {
  let t = v.replace(/rp|%|\s/gi, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Angka sel sebagaimana TAMPIL (persen 0,85 berformat % → 85) — bahan grafik dari blok tabel.
 * Dulu grafik mem-parse teks tampilan dengan `parseFloat`: "74.154.779.000" terbaca 74,154 dan
 * "7,5" terbaca 75. Sel berformat menyimpan angka mentah, jadi yang mentah itu yang dibaca.
 */
export function angkaSel(rows: TabelCell[][], r: number, c: number): number {
  const cell = rows[r]?.[c];
  if (!cell) return 0;
  const v = (cell.v ?? '').trim();
  const n = v.startsWith('=') ? evalFormula(v.slice(1), rows, r, c, new Set()) : angkaMentah(cell);
  if (!Number.isFinite(n)) return 0;
  return cell.nf === 'pct' ? n * 100 : n;
}

/** Hasil rumus sel sebagai ANGKA (NaN kalau gagal) — pemakai yang butuh angka tidak boleh mem-parse teks tampil. */
export function nilaiRumus(rows: TabelCell[][], r: number, c: number): number {
  const v = (rows[r]?.[c]?.v ?? '').trim();
  return v.startsWith('=') ? evalFormula(v.slice(1), rows, r, c, new Set()) : NaN;
}

/** T2: hasil rumus tanpa format ditulis gaya Indonesia ("1.250.000,5"), bukan `String(n)`. */
export function formatUmum(n: number): string {
  if (!Number.isFinite(n)) return '#ERR';
  const s = String(bulatkanDesimal(n, 10));   // 0,1 + 0,2 = 0,30000000000000004 → 0,3
  if (/e/i.test(s)) return s.replace('.', ',');
  const neg = s.startsWith('-');
  const [bulat, pecahan] = (neg ? s.slice(1) : s).split('.');
  const kelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + (pecahan ? `${kelompok},${pecahan}` : kelompok);
}

/** Rujukan ke baris/kolom yang sudah dihapus (E6) — ditulis di rumusnya, seperti Excel. */
export const RUJUKAN_HILANG = '#REF!';
/** Teks tampil sel rumus yang gagal. Editor mewarnainya merah; Word mencetak "—" (E7). */
export const selGalat = (teks: string): boolean => teks === '#ERR' || teks === RUJUKAN_HILANG;

/** Nilai tampil sel: hitung rumus + terapkan format angka. */
export function displayValue(rows: TabelCell[][], r: number, c: number): string {
  const cell = rows[r]?.[c];
  if (!cell) return '';
  const v = cell.v ?? '';
  const isFormula = typeof v === 'string' && v.trim().startsWith('=');
  if (isFormula) {
    if (v.includes(RUJUKAN_HILANG)) return RUJUKAN_HILANG;
    const n = evalFormula(v.trim().slice(1), rows, r, c, new Set());
    if (!Number.isFinite(n)) return '#ERR';
    return cell.nf ? formatNumber(n, cell.nf, cell.dec) : formatUmum(n);
  }
  if (cell.nf && v.trim() !== '') {
    const n = angkaMentah(cell);
    if (Number.isFinite(n)) return formatNumber(n, cell.nf, cell.dec);
  }
  return v;
}

/** Teks sel yang masuk Word: sama dengan layar, kecuali sel galat → "—" (E7). */
export function teksSelWord(rows: TabelCell[][], r: number, c: number): string {
  const t = displayValue(rows, r, c);
  return selGalat(t) ? '—' : t;
}

/** Alamat sel rumus yang galat ("C4") — disebut di editor & sebelum Finalisasi. */
export function daftarSelGalat(rows: TabelCell[][]): string[] {
  const out: string[] = [];
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell.h && cell.v.trimStart().startsWith('=') && selGalat(displayValue(rows, r, c))) out.push(colLabel(c) + (r + 1));
  }));
  return out;
}

/**
 * Ketikan di sel berformat angka disimpan sebagai angka MESIN: "1.250.000" di sel Rupiah dulu
 * tersimpan apa adanya lalu tampil "Rp 1". Teks tanpa angka ("—") dan rumus dibiarkan.
 */
export function nilaiKetikan(cell: TabelCell, teks: string): string {
  const t = teks.trim();
  if (!cell.nf || !t || t.startsWith('=') || !/\d/.test(t)) return teks;
  // "1.250" yang DIKETIK orang = seribu dua ratus lima puluh, bukan 1,25.
  if (ANGKA_MESIN.test(t) && !/^-?\d{1,3}(\.\d{3})+$/.test(t)) return teks;
  return String(angkaTeksId(t));
}

// ═══ Ala Excel — docs/CONCEPT-lkjip-tabel-excel.md ═══════════════════════════
// SATU aturan untuk editor tabel dan kisi kepala di modal (E5): memilih blok, melangkah,
// sisip/hapus baris & kolom (gabungan dan rumus ikut menyesuaikan), sel milik kolom, gabung kepala.

export const BATAS_KOLOM_TABEL = 12;
export const BATAS_BARIS_TABEL = 500;
export const BATAS_BARIS_KEPALA = 3;
export const LEBAR_KOLOM_BAWAAN = 140;
/** 1 px editor = 15 dxa di Word. */
export const DXA_PER_PX = 15;
/** Bidang tulis A4 di antara margin docgen (`PGSZ`/`PGMAR`): 11.907 − 1.418 − 1.701 dxa ≈ 15,5 cm. */
export const LEBAR_TULIS_DXA = 8788;
export const LEBAR_KERTAS_PX = Math.floor(LEBAR_TULIS_DXA / DXA_PER_PX);
export const pxKeCm = (px: number): number => (px * DXA_PER_PX) / 567;

/**
 * Lebar kolom Word (dxa). Tabel yang lebih lebar dari bidang tulis disusutkan sebanding (T3):
 * 5 kolom bawaan = 10.500 dxa sudah masuk margin, 8 kolom = 16.800 dxa (± 29,6 cm) keluar kertas.
 */
export function lebarKolomWord(colWidths: unknown, ncol: number): number[] {
  const pxW = Array.isArray(colWidths) && colWidths.length === ncol ? colWidths : null;
  const mentah = pxW ? pxW.map(w => Math.max(360, Math.round(Number(w) * DXA_PER_PX))) : Array.from({ length: ncol }, () => Math.floor(9000 / ncol));
  const total = mentah.reduce((a, b) => a + b, 0);
  if (total <= LEBAR_TULIS_DXA) return mentah;
  return mentah.map(w => Math.max(300, Math.floor((w * LEBAR_TULIS_DXA) / total)));
}

/** Lebar kolom editor yang dipaskan ke lebar kertas, sebanding (tombol "Paskan ke lebar kertas"). */
export function paskanKeKertas(colWidths: number[]): number[] {
  const total = colWidths.reduce((a, b) => a + b, 0);
  if (total <= LEBAR_KERTAS_PX) return colWidths;
  return colWidths.map(w => Math.max(30, Math.floor((w * LEBAR_KERTAS_PX) / total)));
}

export interface Kotak { r1: number; c1: number; r2: number; c2: number }
export const kotakDari = (ar: number, ac: number, fr: number, fc: number): Kotak =>
  ({ r1: Math.min(ar, fr), c1: Math.min(ac, fc), r2: Math.max(ar, fr), c2: Math.max(ac, fc) });

/** Sel asal gabungan yang menutup (r, c); sel biasa = dirinya sendiri. */
export function asalSel(rows: TabelCell[][], r: number, c: number): { r: number; c: number; rs: number; cs: number } {
  const cell = rows[r]?.[c];
  if (cell && !cell.h) return { r, c, rs: cell.rs ?? 1, cs: cell.cs ?? 1 };
  for (let rr = r; rr >= 0; rr--) {
    for (let cc = c; cc >= 0; cc--) {
      const o = rows[rr]?.[cc];
      if (o && !o.h && rr + (o.rs ?? 1) > r && cc + (o.cs ?? 1) > c) return { r: rr, c: cc, rs: o.rs ?? 1, cs: o.cs ?? 1 };
    }
  }
  return { r, c, rs: 1, cs: 1 };
}

/** Blok yang menyentuh sebagian gabungan diluaskan sampai menutupnya — Gabung/Hapus tak boleh memotong gabungan. */
export function luaskanPilihan(rows: TabelCell[][], k: Kotak): Kotak {
  let { r1, c1, r2, c2 } = k;
  for (let ulang = true; ulang;) {
    ulang = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const a = asalSel(rows, r, c);
        const ar2 = a.r + a.rs - 1, ac2 = a.c + a.cs - 1;
        if (a.r < r1 || a.c < c1 || ar2 > r2 || ac2 > c2) {
          r1 = Math.min(r1, a.r); c1 = Math.min(c1, a.c); r2 = Math.max(r2, ar2); c2 = Math.max(c2, ac2);
          ulang = true;
        }
      }
    }
  }
  return { r1, c1, r2, c2 };
}

/** Satu langkah panah: sel tersembunyi gabungan dilompati, tepi tabel = diam di tempat. */
export function langkahSel(rows: TabelCell[][], ncol: number, r: number, c: number, dr: number, dc: number): { r: number; c: number } {
  const a = asalSel(rows, r, c);
  let nr = r, nc = c;
  if (dr > 0) nr = a.r + a.rs; else if (dr < 0) nr = a.r - 1;
  if (dc > 0) nc = a.c + a.cs; else if (dc < 0) nc = a.c - 1;
  if (nr < 0 || nr >= rows.length || nc < 0 || nc >= ncol) return { r, c };
  const t = asalSel(rows, nr, nc);
  return { r: t.r, c: t.c };
}

/** Ctrl+panah (cara Excel): menyusuri sel berisi sampai ujungnya, atau melompat ke sel berisi berikutnya/tepi. */
export function lompatSel(rows: TabelCell[][], ncol: number, r: number, c: number, dr: number, dc: number): { r: number; c: number } {
  const isi = (p: { r: number; c: number }) => { const a = asalSel(rows, p.r, p.c); return (rows[a.r]?.[a.c]?.v ?? '').trim() !== ''; };
  const sama = (p: { r: number; c: number }, q: { r: number; c: number }) => p.r === q.r && p.c === q.c;
  let kini = { r, c };
  let maju = langkahSel(rows, ncol, kini.r, kini.c, dr, dc);
  if (sama(maju, kini)) return kini;
  const susuri = isi(kini) && isi(maju);
  for (let i = 0; i < rows.length * ncol; i++) {
    if (!susuri && isi(maju)) return maju;
    kini = maju;
    maju = langkahSel(rows, ncol, kini.r, kini.c, dr, dc);
    if (sama(maju, kini) || (susuri && !isi(maju))) return kini;
  }
  return kini;
}

/** §4.2: sel milik kolom = sel teratas di kepala yang lebarnya tepat satu kolom (boleh setinggi beberapa baris). */
export function selMilikKolom(rows: TabelCell[][], headerRows: number, c: number): number | null {
  for (let r = 0; r < Math.min(headerRows, rows.length); r++) {
    const cell = rows[r]?.[c];
    if (cell && !cell.h && (cell.cs ?? 1) === 1) return r;
  }
  return null;
}

/**
 * E2: nama kolom diisi mesin dari judul di sel milik kolomnya. Grafik memilih seri lewat nama
 * kolom, jadi isinya harus judul yang sebenarnya; kolom tanpa sel milik mempertahankan nama lamanya.
 */
export function namaKolomDariKepala(rows: TabelCell[][], headerRows: number, kolom: string[], letak?: (number | null)[]): string[] {
  return kolom.map((lama, c) => {
    const r = letak ? letak[c] ?? null : selMilikKolom(rows, headerRows, c);
    const t = r == null ? '' : (rows[r]?.[c]?.v ?? '').trim();
    return (t || lama.trim() || `Kolom ${c + 1}`).slice(0, 255);
  });
}

/**
 * E1: kepala tabel selalu berupa sel. Tabel lama ber-`headerRows` 0 (nama kolom = kepala yang
 * tercetak) diberi 1 baris kepala berisi nama kolom — keluaran Word-nya sama persis.
 */
export function pastikanKepalaSel<T extends { kolom: string[]; rows: TabelCell[][]; headerRows?: number }>(p: T): T {
  if ((p.headerRows ?? 0) > 0 || p.rows.length >= BATAS_BARIS_TABEL) return p;
  return { ...p, headerRows: 1, rows: [p.kolom.map(k => ({ v: k }) as TabelCell), ...p.rows] };
}

// ── Rumus ikut bergeser (E6) ───────────────────────────────────────────────────
export type Geser =
  | { sumbu: 'baris' | 'kolom'; sisip: number; n: number }
  | { sumbu: 'baris' | 'kolom'; hapus: [number, number] };

const REF_RUMUS = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?/g;

function indeksHuruf(h: string): number {
  let c = 0;
  for (const ch of h.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}
function geserIndeks(i: number, g: Geser): number | null {
  if ('sisip' in g) return i >= g.sisip ? i + g.n : i;
  const [a, b] = g.hapus;
  return i < a ? i : i > b ? i - (b - a + 1) : null;
}
function geserRentang(a: number, b: number, g: Geser): [number, number] | null {
  if ('sisip' in g) return g.sisip <= a ? [a + g.n, b + g.n] : g.sisip <= b ? [a, b + g.n] : [a, b];
  const [x, y] = g.hapus, k = y - x + 1;
  const na = a < x ? a : a > y ? a - k : x;
  const nb = b < x ? b : b > y ? b - k : x - 1;
  return na > nb ? null : [na, nb];
}

/** Rujukan rumus sesudah baris/kolom disisip atau dihapus. Rujukan ke yang dihapus → `#REF!`. */
export function geserRujukanRumus(v: string, g: Geser): string {
  if (!v.trimStart().startsWith('=')) return v;
  return v.replace(REF_RUMUS, (m: string, d1: string, h1: string, d2: string, a1: string, d3: string | undefined, h2: string | undefined, d4: string | undefined, a2: string | undefined, off: number, src: string) => {
    if (off > 0 && /[A-Za-z0-9_#]/.test(src[off - 1])) return m;
    let c1 = indeksHuruf(h1), r1 = Number(a1) - 1;
    const tulis = (d: string, c: number, dd: string, r: number) => `${d}${colLabel(c)}${dd}${r + 1}`;
    if (h2 === undefined || a2 === undefined) {
      const r = g.sumbu === 'baris' ? geserIndeks(r1, g) : r1;
      const c = g.sumbu === 'kolom' ? geserIndeks(c1, g) : c1;
      return r === null || c === null ? RUJUKAN_HILANG : tulis(d1, c, d2, r);
    }
    let c2 = indeksHuruf(h2), r2 = Number(a2) - 1;
    if (g.sumbu === 'baris') {
      const rr = geserRentang(Math.min(r1, r2), Math.max(r1, r2), g);
      if (!rr) return RUJUKAN_HILANG;
      [r1, r2] = rr;
    } else {
      const cc = geserRentang(Math.min(c1, c2), Math.max(c1, c2), g);
      if (!cc) return RUJUKAN_HILANG;
      [c1, c2] = cc;
    }
    return `${tulis(d1, c1, d2, r1)}:${tulis(d3 ?? '', c2, d4 ?? '', r2)}`;
  });
}

function geserRumusSemua(rows: TabelCell[][], g: Geser): TabelCell[][] {
  return rows.map(row => row.map(cell => (cell.v.trimStart().startsWith('=') ? { ...cell, v: geserRujukanRumus(cell.v, g) } : { ...cell })));
}

// ── Sisip / hapus baris & kolom (gabungan menyesuaikan, §5.4) ─────────────────
const selKosong = (): TabelCell => ({ v: '' });

/** `n` baris kosong disisip SEBELUM indeks `di`. Gabungan yang dilintasi titik sisip memanjang. */
export function sisipBarisSel(rows: TabelCell[][], di: number, n: number, ncol: number): TabelCell[][] {
  const salin = geserRumusSemua(rows, { sumbu: 'baris', sisip: di, n });
  for (let r = 0; r < Math.min(di, salin.length); r++) {
    for (const cell of salin[r]) if (!cell.h && r + (cell.rs ?? 1) > di) cell.rs = (cell.rs ?? 1) + n;
  }
  const baru = Array.from({ length: n }, () => Array.from({ length: ncol }, selKosong));
  return sanitizeRows([...salin.slice(0, di), ...baru, ...salin.slice(di)], ncol);
}

/**
 * Baris `dari..sampai` dihapus. Gabungan yang terpotong memendek; kalau baris ASAL gabungan ikut
 * terhapus, isinya pindah ke baris pertama yang tersisa (Excel membuangnya).
 */
export function hapusBarisSel(rows: TabelCell[][], dari: number, sampai: number, ncol: number): TabelCell[][] {
  const salin = geserRumusSemua(rows, { sumbu: 'baris', hapus: [dari, sampai] });
  for (let r = 0; r < salin.length; r++) {
    for (let c = 0; c < ncol; c++) {
      const cell = salin[r][c];
      const rs = cell?.rs ?? 1;
      if (!cell || cell.h || rs <= 1) continue;
      const akhir = r + rs - 1;
      if (r < dari) cell.rs = rs - Math.max(0, Math.min(akhir, sampai) - dari + 1);
      else if (r <= sampai && akhir > sampai) salin[sampai + 1][c] = { ...cell, rs: akhir - sampai };
    }
  }
  return sanitizeRows(salin.filter((_, r) => r < dari || r > sampai), ncol);
}

function sisipKolomSel(rows: TabelCell[][], di: number, n: number, ncol: number): TabelCell[][] {
  const salin = geserRumusSemua(rows, { sumbu: 'kolom', sisip: di, n }).map(row => {
    for (let c = 0; c < Math.min(di, row.length); c++) {
      const cell = row[c];
      if (!cell.h && c + (cell.cs ?? 1) > di) cell.cs = (cell.cs ?? 1) + n;
    }
    return [...row.slice(0, di), ...Array.from({ length: n }, selKosong), ...row.slice(di)];
  });
  return sanitizeRows(salin, ncol + n);
}

function hapusKolomSel(rows: TabelCell[][], dari: number, sampai: number, ncol: number): TabelCell[][] {
  const salin = geserRumusSemua(rows, { sumbu: 'kolom', hapus: [dari, sampai] }).map(row => {
    for (let c = 0; c < ncol; c++) {
      const cell = row[c];
      const cs = cell?.cs ?? 1;
      if (!cell || cell.h || cs <= 1) continue;
      const akhir = c + cs - 1;
      if (c < dari) cell.cs = cs - Math.max(0, Math.min(akhir, sampai) - dari + 1);
      else if (c <= sampai && akhir > sampai) row[sampai + 1] = { ...cell, cs: akhir - sampai };
    }
    return row.filter((_, c) => c < dari || c > sampai);
  });
  return sanitizeRows(salin, ncol - (sampai - dari + 1));
}

/** Bentuk tabel di editor — larik paralel (`kolom`/`align`/`colWidths`) ikut tiap sisip/hapus kolom. */
export interface BentukTabel { rows: TabelCell[][]; kolom: string[]; align: TabelAlign[]; colWidths: number[]; headerRows: number }

/** `keKepala`: baris baru ikut kepala (disisip di bawah baris kepala terakhir yang dipilih). */
export function sisipBaris(t: BentukTabel, di: number, n: number, keKepala = false): BentukTabel {
  const hr = t.headerRows;
  return { ...t, rows: sisipBarisSel(t.rows, di, n, t.kolom.length), headerRows: di < hr || (keKepala && di <= hr) ? hr + n : hr };
}

export function hapusBaris(t: BentukTabel, dari: number, sampai: number): BentukTabel {
  const hr = t.headerRows;
  return { ...t, rows: hapusBarisSel(t.rows, dari, sampai, t.kolom.length), headerRows: hr - Math.max(0, Math.min(sampai, hr - 1) - dari + 1) };
}

export function sisipKolom(t: BentukTabel, di: number, n: number): BentukTabel {
  const isi = <T>(arr: T[], baru: (i: number) => T) => [...arr.slice(0, di), ...Array.from({ length: n }, (_, i) => baru(i)), ...arr.slice(di)];
  return {
    ...t,
    rows: sisipKolomSel(t.rows, di, n, t.kolom.length),
    kolom: isi(t.kolom, i => `Kolom ${di + i + 1}`),
    align: isi(t.align.slice(0, t.kolom.length), (): TabelAlign => 'left'),
    colWidths: isi(t.colWidths.slice(0, t.kolom.length), () => LEBAR_KOLOM_BAWAAN),
  };
}

export function hapusKolom(t: BentukTabel, dari: number, sampai: number): BentukTabel {
  const tetap = <T>(arr: T[]) => arr.filter((_, c) => c < dari || c > sampai);
  return {
    ...t,
    rows: hapusKolomSel(t.rows, dari, sampai, t.kolom.length),
    kolom: tetap(t.kolom), align: tetap(t.align), colWidths: tetap(t.colWidths),
  };
}

/**
 * Tukar dua kolom (urutan kolom di modal). Gabungan yang menutup KEDUANYA tetap; gabungan yang
 * hanya menyentuh salah satunya dipisah — kalau tidak, gabungannya ikut tertukar setengah.
 */
export function tukarKolomSel(rows: TabelCell[][], i: number, j: number, ncol: number): TabelCell[][] {
  const salin = rows.map(row => row.map(cell => ({ ...cell })));
  for (const row of salin) {
    for (let c = 0; c < ncol; c++) {
      const cell = row[c];
      const cs = cell.cs ?? 1;
      if (cell.h || cs <= 1) continue;
      const kenaI = i >= c && i < c + cs, kenaJ = j >= c && j < c + cs;
      if (kenaI !== kenaJ) { delete cell.cs; delete cell.rs; }
    }
  }
  const rapi = sanitizeRows(salin, ncol);
  for (let r = 0; r < rapi.length; r++) {
    const a = asalSel(rapi, r, i), b = asalSel(rapi, r, j);
    if (a.r === b.r && a.c === b.c && (a.cs > 1)) continue;
    [rapi[r][i], rapi[r][j]] = [rapi[r][j], rapi[r][i]];
  }
  return sanitizeRows(rapi, ncol);
}

/** Delete/Backspace: isi blok dikosongkan, formatnya tetap (cara Excel). */
export function kosongkanBlok(rows: TabelCell[][], k: Kotak, boleh: (r: number, c: number) => boolean = () => true): TabelCell[][] {
  return rows.map((row, r) => row.map((cell, c) =>
    r >= k.r1 && r <= k.r2 && c >= k.c1 && c <= k.c2 && !cell.h && cell.v !== '' && boleh(r, c) ? { ...cell, v: '' } : cell));
}

/** "Hapus format": sel kembali polos, isi & gabungannya tetap. */
export function tanpaFormat(cell: TabelCell): TabelCell {
  const polos: TabelCell = { v: cell.v };
  if (cell.cs) polos.cs = cell.cs;
  if (cell.rs) polos.rs = cell.rs;
  if (cell.h) polos.h = true;
  return polos;
}

/** Teks yang ikut hilang kalau baris `dari..sampai` dibuang — ditanyakan dulu (E3). */
export function teksDiBaris(rows: TabelCell[][], dari: number, sampai: number): string[] {
  const out: string[] = [];
  for (let r = dari; r <= sampai; r++) for (const cell of rows[r] ?? []) if (!cell.h && cell.v.trim()) out.push(cell.v.trim());
  return out;
}

/**
 * E3: jumlah baris kepala diubah dengan MENYISIP/membuang baris tepat di atas badan — tidak lagi
 * "meminjam" baris data jadi kepala. Satu aturan untuk tabel biasa & tertaut (kunci baris badan tetap sejajar).
 */
export function ubahJumlahKepala(t: BentukTabel, n: number): BentukTabel {
  const hr = Math.max(0, Math.min(t.headerRows, t.rows.length));
  if (n > hr) return sisipBaris({ ...t, headerRows: hr }, hr, n - hr, true);
  if (n < hr) return hapusBaris({ ...t, headerRows: hr }, n, hr - 1);
  return t;
}

// ── Kisi kepala di modal (§4) — `kepala` = baris kepala saja ──────────────────
/** Letak judul tiap kolom saat modal dibuka: sel milik yang teksnya = nama kolom (E2 menjaga keduanya sama). */
export function letakAwal(kepala: TabelCell[][], namaKolom: string[]): (number | null)[] {
  return namaKolom.map((nama, c) => {
    const sah: number[] = [];
    kepala.forEach((row, r) => { const cell = row[c]; if (cell && !cell.h && (cell.cs ?? 1) === 1) sah.push(r); });
    return sah.find(r => nama.trim() !== '' && kepala[r][c].v.trim() === nama.trim()) ?? sah[0] ?? null;
  });
}

/**
 * §4.4: penunjuk judul LENGKET — hanya dihitung ulang kalau selnya tertutup gabungan, melebar,
 * atau barisnya hilang. Kalau dihitung ulang tiap saat, memisah A1:B1 membuat judul A melompat
 * ke A1 yang berisi "Uraian".
 */
export function rapikanLetak(kepala: TabelCell[][], letak: (number | null)[]): (number | null)[] {
  return letak.map((r, c) => {
    const cell = r == null ? undefined : kepala[r]?.[c];
    return cell && !cell.h && (cell.cs ?? 1) === 1 ? r : selMilikKolom(kepala, kepala.length, c);
  });
}

export interface RencanaGabung {
  kotak: Kotak;
  /** Kolom yang judulnya tertelan gabungan dan punya sel kosong di bawahnya. */
  turun: number[];
  /** Kolom yang judulnya tertelan tapi tak punya tempat turun. */
  tanpaTempat: number[];
  /** Teks lain yang hilang — seperti Excel, yang tersisa hanya kiri-atas. */
  terbuang: string[];
}

export function rencanaGabungKepala(kepala: TabelCell[][], letak: (number | null)[], pilihan: Kotak): RencanaGabung {
  const k = luaskanPilihan(kepala, pilihan);
  const melebar = k.c2 > k.c1;
  const turun: number[] = [], tanpaTempat: number[] = [];
  const judul = new Set<string>();
  for (let c = k.c1; c <= k.c2; c++) {
    const r = letak[c];
    if (r == null || r < k.r1 || r > k.r2) continue;
    judul.add(`${r}:${c}`);
    if (!melebar) {
      // Gabung tegak satu kolom: sel asal tetap selebar satu kolom, judul cukup naik ke sel asal.
      if (r > k.r1 && kepala[k.r1][c].v.trim()) tanpaTempat.push(c);
      continue;
    }
    const bawah = kepala[k.r2 + 1]?.[c];
    if (bawah && !bawah.h && (bawah.cs ?? 1) === 1 && !bawah.v.trim()) turun.push(c); else tanpaTempat.push(c);
  }
  const terbuang: string[] = [];
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      const cell = kepala[r][c];
      if (cell.h || (r === k.r1 && c === k.c1) || !cell.v.trim() || judul.has(`${r}:${c}`)) continue;
      terbuang.push(cell.v.trim());
    }
  }
  return { kotak: k, turun, tanpaTempat, terbuang };
}

/**
 * §4.3: gabung di kisi kepala. Judul kolom yang tertelan TURUN ke sel kosong di bawahnya; `tambahBaris`
 * menyisip satu baris kepala tepat di bawah gabungan supaya judul yang tak punya tempat ikut turun.
 */
export function gabungKepala(kepala: TabelCell[][], letak: (number | null)[], rencana: RencanaGabung, tambahBaris: boolean): { kepala: TabelCell[][]; letak: (number | null)[] } {
  const ncol = kepala[0]?.length ?? 0;
  const k = rencana.kotak;
  const melebar = k.c2 > k.c1;
  let kp = kepala.map(row => row.map(cell => ({ ...cell })));
  let lt = [...letak];
  let turun = rencana.turun;
  if (tambahBaris && melebar && rencana.tanpaTempat.length && kp.length < BATAS_BARIS_KEPALA) {
    kp = sisipBarisSel(kp, k.r2 + 1, 1, ncol);
    lt = lt.map(r => (r != null && r > k.r2 ? r + 1 : r));
    turun = [...turun, ...rencana.tanpaTempat];
  }
  for (const c of turun) {
    const r = lt[c];
    if (r == null) continue;
    kp[k.r2 + 1][c] = { ...kp[k.r2 + 1][c], v: kp[r][c].v };
    kp[r][c] = { ...kp[r][c], v: '' };
    lt[c] = k.r2 + 1;
  }
  if (!melebar) {
    const r = lt[k.c1];
    if (r != null && r > k.r1 && r <= k.r2 && !kp[k.r1][k.c1].v.trim()) {
      kp[k.r1][k.c1] = { ...kp[k.r1][k.c1], v: kp[r][k.c1].v };
      lt[k.c1] = k.r1;
    }
  }
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) if (r !== k.r1 || c !== k.c1) kp[r][c] = { ...kp[r][c], v: '' };
  }
  kp = mergeCells(kp, k.r1, k.c1, k.r2, k.c2, ncol);
  return { kepala: kp, letak: rapikanLetak(kp, lt) };
}

/** §4.5 Rapikan ↓: tiap judul kolom digabung ke bawah melewati sel kosong. Sel berisi tak pernah tertelan. */
export function rapikanKepala(kepala: TabelCell[][], letak: (number | null)[]): TabelCell[][] {
  let kp = kepala;
  const hr = kepala.length;
  letak.forEach((r, c) => {
    if (r == null) return;
    const asal = kp[r]?.[c];
    if (!asal || asal.h || (asal.cs ?? 1) !== 1) return;
    const awalAkhir = r + (asal.rs ?? 1) - 1;
    let akhir = awalAkhir;
    while (akhir + 1 < hr) {
      const b = kp[akhir + 1][c];
      if (b.h || (b.cs ?? 1) !== 1 || (b.rs ?? 1) !== 1 || b.v.trim()) break;
      akhir++;
    }
    if (akhir > awalAkhir) kp = mergeCells(kp, r, c, akhir, c, kp[0].length);
  });
  return kp;
}

/** Kolom lain yang ikut menutup kolom `c` di baris kepala terbawah — keterangan isian judul yang dimatikan. */
export function kolomSegabung(kepala: TabelCell[][], c: number): number[] {
  const a = asalSel(kepala, Math.max(0, kepala.length - 1), c);
  return Array.from({ length: a.cs }, (_, i) => a.c + i).filter(x => x !== c);
}
