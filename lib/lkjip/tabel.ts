// ═══ PRIMA — LKJIP — Model sel tabel (pure, client+server safe) ═══════════════
// Fitur Excel-like: merge (colSpan/rowSpan), align H (kiri/tengah/kanan/justify),
// vertical-align, bold, ukuran font per sel, border kustom per sisi, format angka,
// rumus (=SUM/AVERAGE/MIN/MAX/COUNT/ABS/ROUND + aritmetika + ref A1/range A1:B3),
// dan copy/paste antar sel. Backward-compatible: sel lama string → { v }.
// Dipakai editor (client), docgen (server), schemas (zod transform).

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

function parseNumber(v: string): number {
  if (typeof v !== 'string') return Number(v) || 0;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function cellNumber(rows: TabelCell[][], r: number, c: number, seen: Set<string>): number {
  const cell = rows[r]?.[c];
  if (!cell) return 0;
  const v = cell.v ?? '';
  if (typeof v === 'string' && v.trim().startsWith('=')) return evalFormula(v.trim().slice(1), rows, r, c, seen);
  return parseNumber(v);
}

const FUNCS = new Set(['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT', 'ABS', 'ROUND', 'IF', 'AND', 'OR', 'NOT']);

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
  const fixed = value.toFixed(d);
  const neg = fixed.startsWith('-');
  const [intPart, frac] = (neg ? fixed.slice(1) : fixed).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let body = frac ? `${grouped},${frac}` : grouped;
  if (neg) body = '-' + body;
  if (nf === 'rp') return `Rp ${body}`;
  if (nf === 'pct') return `${body}%`;
  return body;
}

/** Nilai tampil sel: hitung rumus + terapkan format angka. */
export function displayValue(rows: TabelCell[][], r: number, c: number): string {
  const cell = rows[r]?.[c];
  if (!cell) return '';
  const v = cell.v ?? '';
  const isFormula = typeof v === 'string' && v.trim().startsWith('=');
  if (isFormula) {
    const n = evalFormula(v.trim().slice(1), rows, r, c, new Set());
    if (!Number.isFinite(n)) return '#ERR';
    return cell.nf ? formatNumber(n, cell.nf, cell.dec) : String(n);
  }
  if (cell.nf && v.trim() !== '') {
    const n = parseNumber(v);
    if (Number.isFinite(n)) return formatNumber(n, cell.nf, cell.dec);
  }
  return v;
}
