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
  rot?: boolean;       // teks tegak (dibaca dari bawah ke atas) — kepala kolom sempit
  i?: boolean;         // miring
  u?: boolean;         // garis bawah
  fc?: string;         // warna huruf (hex 6 digit tanpa '#')
}

/** Format sel tanpa isi & gabungan — kuas format, salin format. Field format BARU wajib didaftar di sini. */
const KUNCI_FORMAT = ['al', 'va', 'b', 'i', 'u', 'fs', 'bd', 'nf', 'dec', 'bg', 'fc', 'rot'] as const;

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
    if (o.rot === true) cell.rot = true;
    if (o.i === true) cell.i = true;
    if (o.u === true) cell.u = true;
    if (typeof o.fc === 'string' && /^[0-9a-fA-F]{6}$/.test(o.fc)) cell.fc = o.fc.toUpperCase();
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

/** Format sel saja (tanpa isi, gabungan, dan tanda tertutup). */
export function formatSel(src: TabelCell | undefined): Partial<TabelCell> {
  const out: Partial<TabelCell> = {};
  if (!src) return out;
  for (const k of KUNCI_FORMAT) {
    const v = src[k];
    if (v === undefined || v === null || v === false || v === '') continue;
    (out as Record<string, unknown>)[k] = k === 'bd' ? { ...(v as TabelBorder) } : v;
  }
  return out;
}

// ── Copy / paste antar sel (nilai + format, tanpa merge) ──────────────────────
export function extractRange(rows: TabelCell[][], r1: number, c1: number, r2: number, c2: number): TabelCell[][] {
  const out: TabelCell[][] = [];
  for (let r = r1; r <= r2; r++) {
    const row: TabelCell[] = [];
    for (let c = c1; c <= c2; c++) {
      const src = rows[r]?.[c];
      row.push({ v: src?.v ?? '', ...formatSel(src) });
    }
    out.push(row);
  }
  return out;
}

/**
 * Blok untuk papan klip internal — seperti `extractRange` tetapi gabungan IKUT (dipangkas ke tepi
 * blok), sama dengan Excel. Sel tertutup gabungan yang asalnya di luar blok jadi sel biasa kosong.
 */
export function ambilBlok(rows: TabelCell[][], k: Kotak): TabelCell[][] {
  const out = extractRange(rows, k.r1, k.c1, k.r2, k.c2);
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      const cell = rows[r]?.[c];
      if (!cell || cell.h) continue;
      const cs = Math.min(cell.cs ?? 1, k.c2 - c + 1), rs = Math.min(cell.rs ?? 1, k.r2 - r + 1);
      if (cs > 1) out[r - k.r1][c - k.c1].cs = cs;
      if (rs > 1) out[r - k.r1][c - k.c1].rs = rs;
    }
  }
  return sanitizeRows(out, k.c2 - k.c1 + 1);
}

/**
 * Gabungan yang menyentuh kotak `k` dilepas (isi sel asalnya tetap). Tempelan dulu jatuh ke sel yang
 * masih tertutup gabungan dari LUAR kotak — isinya tersimpan tapi tak pernah tampil.
 */
export function lepasGabunganDi(rows: TabelCell[][], k: Kotak, ncol: number): TabelCell[][] {
  let kena = false;
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  next.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.h || ((cell.cs ?? 1) <= 1 && (cell.rs ?? 1) <= 1)) return;
    const r2 = r + (cell.rs ?? 1) - 1, c2 = c + (cell.cs ?? 1) - 1;
    if (r2 < k.r1 || r > k.r2 || c2 < k.c1 || c > k.c2) return;
    delete cell.cs; delete cell.rs; kena = true;
  }));
  return kena ? sanitizeRows(next, ncol) : rows;
}

export function pasteRange(rows: TabelCell[][], r1: number, c1: number, clip: TabelCell[][], ncol: number): TabelCell[][] {
  const lebar = Math.max(0, ...clip.map(r => r.length));
  const next = lepasGabunganDi(rows, { r1, c1, r2: r1 + clip.length - 1, c2: Math.min(ncol - 1, c1 + lebar - 1) }, ncol).map(r => r.map(c => ({ ...c })));
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

/**
 * TSV ala Excel: sel berisi tab/baris baru (Alt+Enter) atau berawalan kutip dibungkus "…" dan kutipnya
 * digandakan — dulu baris barunya diganti spasi, jadi isi sel bertingkat rusak saat disalin.
 */
export function rangeToTSV(grid: TabelCell[][]): string {
  const kutip = (s: string) => (/[\t\n\r]/.test(s) || s.startsWith('"') ? `"${s.replace(/"/g, '""')}"` : s);
  return grid.map(row => row.map(c => kutip(c.v ?? '')).join('\t')).join('\n');
}

/** Parse teks clipboard (TSV dari Excel/Google Sheets) → grid sel (nilai saja). Sel "…" Excel dibaca utuh. */
export function parseTSV(text: string): TabelCell[][] {
  const s = String(text).replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i <= s.length) {
    let isi: string | null = null;
    if (s[i] === '"') {
      // Terkutip hanya bila kutip penutupnya diikuti tab/baris baru/akhir teks — selain itu teks biasa.
      let j = i + 1, t = '';
      for (; j < s.length; j++) {
        if (s[j] !== '"') { t += s[j]; continue; }
        if (s[j + 1] === '"') { t += '"'; j++; continue; }
        break;
      }
      if (j < s.length && (j + 1 === s.length || s[j + 1] === '\t' || s[j + 1] === '\n')) { isi = t; i = j + 1; }
    }
    if (isi === null) {
      let j = i;
      while (j < s.length && s[j] !== '\t' && s[j] !== '\n') j++;
      isi = s.slice(i, j); i = j;
    }
    row.push(isi);
    if (i >= s.length) { rows.push(row); break; }
    if (s[i] === '\n') { rows.push(row); row = []; }
    i++;
  }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows.map(r => r.map(v => ({ v } as TabelCell)));
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
    // Rujukan absolut gaya Excel ($B$3, B$3, $B3) dikenali lalu `$`-nya dibuang: nilainya sama dengan B3.
    // `$` hanya bermakna saat rumus disalin-geser (belum ada di sini); sisip/hapus baris tetap menggesernya,
    // sama dengan Excel. Dulu `$` dilewati tokenizer sehingga $B$3 terpecah jadi "B" + "3" → #ERR.
    const mentah = expr.match(/\$?[A-Za-z]+\$?\d+|[A-Za-z]+|\d+\.?\d*|\.\d+|>=|<=|<>|!=|==|[-+*/^(),:%<>=]/g) ?? [];
    // `$` yang bukan bagian rujukan utuh ($$B2, $5) = salah ketik → galat, bukan dilewati diam-diam.
    const jumlahDolar = (s: string) => s.split('$').length - 1;
    if (jumlahDolar(expr) !== jumlahDolar(mentah.join(''))) return NaN;
    const toks = mentah.map(t => t.replace(/\$/g, ''));
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
/** Halaman melintang, margin sama: 16.839 − 1.701 − 1.418 dxa ≈ 24,2 cm. */
export const LEBAR_TULIS_MELINTANG_DXA = 13720;
export const lebarTulisDxa = (melintang: boolean): number => (melintang ? LEBAR_TULIS_MELINTANG_DXA : LEBAR_TULIS_DXA);
export const lebarKertasPx = (melintang: boolean): number => Math.floor(lebarTulisDxa(melintang) / DXA_PER_PX);
export const pxKeCm = (px: number): number => (px * DXA_PER_PX) / 567;

/**
 * Lebar kolom Word (dxa). Tabel yang lebih lebar dari bidang tulis disusutkan sebanding (T3):
 * 5 kolom bawaan = 10.500 dxa sudah masuk margin, 8 kolom = 16.800 dxa (± 29,6 cm) keluar kertas.
 * `rentang` (posisi "Selebar kertas"): direntangkan sebanding sampai tepat selebar bidang tulis.
 */
export function lebarKolomWord(colWidths: unknown, ncol: number, lebarTulis = LEBAR_TULIS_DXA, rentang = false): number[] {
  const pxW = Array.isArray(colWidths) && colWidths.length === ncol ? colWidths : null;
  const mentah = pxW ? pxW.map(w => Math.max(360, Math.round(Number(w) * DXA_PER_PX))) : Array.from({ length: ncol }, () => Math.floor(9000 / ncol));
  const total = mentah.reduce((a, b) => a + b, 0);
  if (rentang && ncol > 0) {
    const hasil = mentah.map(w => Math.floor((w * lebarTulis) / total));
    hasil[ncol - 1] += lebarTulis - hasil.reduce((a, b) => a + b, 0);
    return hasil;
  }
  if (total <= lebarTulis) return mentah;
  return mentah.map(w => Math.max(300, Math.floor((w * lebarTulis) / total)));
}

/** Lebar kolom editor yang dipaskan ke lebar kertas, sebanding (tombol "Paskan ke lebar kertas"). */
export function paskanKeKertas(colWidths: number[], lebarPx = LEBAR_KERTAS_PX): number[] {
  const total = colWidths.reduce((a, b) => a + b, 0);
  if (total <= lebarPx) return colWidths;
  return colWidths.map(w => Math.max(30, Math.floor((w * lebarPx) / total)));
}

/** "Ratakan lebar kolom" (Distribute Columns Word): kolom c1..c2 sama lebar, jumlahnya tetap. */
export function ratakanLebar(colWidths: number[], c1: number, c2: number): number[] {
  const n = c2 - c1 + 1;
  if (n < 2) return colWidths;
  const total = colWidths.slice(c1, c2 + 1).reduce((a, b) => a + b, 0);
  const dasar = Math.floor(total / n), sisa = total - dasar * n;
  return colWidths.map((w, i) => (i < c1 || i > c2 ? w : dasar + (i - c1 < sisa ? 1 : 0)));
}

// ── Pengaturan cetak per tabel (Tahap W, konsep §12.2–12.3) ─────────────────
export type PosisiTabel = 'tengah' | 'kiri' | 'penuh';
export interface GayaTabel { selang?: boolean; jumlah?: boolean; mendatar?: boolean }
export interface AturTabel { melintang: boolean; posisi: PosisiTabel; gaya: GayaTabel; sumber: string; utuh: boolean; kolomNomor: number | null }
export const ATUR_BAWAAN: AturTabel = { melintang: false, posisi: 'tengah', gaya: {}, sumber: '', utuh: false, kolomNomor: null };

/** Dari payload apa pun — simpanan lama tanpa kolom ini = bawaan. Kolom No. tidak berlaku di tabel tertaut (punya Nomor urut sendiri). */
export function bacaAtur(p: unknown): AturTabel {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const g = (o.gaya && typeof o.gaya === 'object' ? o.gaya : {}) as Record<string, unknown>;
  const ncol = Array.isArray(o.kolom) ? o.kolom.length : 0;
  const kn = o.kolomNomor;
  const gaya: GayaTabel = {};
  if (g.selang === true) gaya.selang = true;
  if (g.jumlah === true) gaya.jumlah = true;
  if (g.mendatar === true) gaya.mendatar = true;
  return {
    melintang: o.melintang === true,
    posisi: o.posisi === 'kiri' || o.posisi === 'penuh' ? o.posisi : 'tengah',
    gaya,
    sumber: typeof o.sumber === 'string' ? o.sumber : '',
    utuh: o.utuh === true,
    kolomNomor: !o.tautan && typeof kn === 'number' && Number.isInteger(kn) && kn >= 0 && kn < ncol ? kn : null,
  };
}

/** Baris di bawah tabel. "Sumber:" yang diketik sendiri tidak digandakan. */
export function teksSumber(sumber: string): string {
  const isi = sumber.trim().replace(/^sumber\s*:\s*/i, '');
  return isi ? `Sumber: ${isi}` : '';
}

export const WARNA_SELANG = 'F2F2F2';
export const GARIS_JUMLAH = 12;
/**
 * Sumbangan gaya tabel untuk baris `r` — dihitung saat menggambar, TIDAK ditulis ke sel (keputusan #8),
 * jadi bertahan sesudah Perbarui dan berlaku juga di badan tabel tertaut yang terkunci.
 */
export function gayaSel(gaya: GayaTabel, nrow: number, headerRows: number, r: number): Partial<TabelCell> {
  const out: Partial<TabelCell> = {};
  const badan = r >= headerRows;
  const jumlah = !!gaya.jumlah && badan && r === nrow - 1;
  if (gaya.selang && badan && !jumlah && (r - headerRows) % 2 === 1) out.bg = WARNA_SELANG;
  if (jumlah) { out.b = true; out.bd = { t: GARIS_JUMLAH }; }
  if (gaya.mendatar) out.bd = { ...(out.bd ?? {}), l: 0, r: 0 };
  return out;
}

/** Perkiraan lebar teks Arial (pt) — huruf besar & angka lebih lebar; tebal ± 8% lebih lebar. */
export function perkiraLebarTeks(teks: string, pt: number, tebal: boolean): number {
  let em = 0;
  for (const ch of teks) em += /[ .,:;!|iIlj'()]/.test(ch) ? 0.28 : /[MW]/.test(ch) ? 0.92 : /[A-Z]/.test(ch) ? 0.68 : /[0-9]/.test(ch) ? 0.56 : 0.53;
  return em * pt * (tebal ? 1.08 : 1);
}

/**
 * Tinggi minimum (dxa) tiap baris yang memuat teks tegak; 0 = tidak perlu. Word TIDAK meninggikan
 * baris bertinggi otomatis untuk teks tegak — ia membungkusnya ("TW" / "I"), terbukti di Word
 * 2026-10-19. Sel tegak yang menutup beberapa baris membagi kebutuhannya ke baris-baris itu.
 */
export function tinggiBarisTegak(rows: TabelCell[][], headerRows: number, ptBawaan: number): number[] {
  const tinggi = rows.map(() => 0);
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.h || !cell.rot) return;
    const teks = teksSelWord(rows, r, c);
    if (!teks) return;
    const pt = perkiraLebarTeks(teks, cell.fs ?? ptBawaan, r < headerRows || !!cell.b) + 6;
    const rs = Math.max(1, Math.min(cell.rs ?? 1, rows.length - r));
    const perBaris = Math.ceil((pt * 20) / rs / 20) * 20;
    for (let i = r; i < r + rs; i++) tinggi[i] = Math.max(tinggi[i], perBaris);
  }));
  return tinggi;
}

/** Sel yang digambar: format sel sendiri menang atas gaya tabel (per sisi garis). */
export function selBergaya(cell: TabelCell, gaya: Partial<TabelCell>): TabelCell {
  if (!gaya.bg && !gaya.b && !gaya.bd) return cell;
  const hasil: TabelCell = { ...cell };
  if (gaya.bg && !cell.bg) hasil.bg = gaya.bg;
  if (gaya.b) hasil.b = true;
  if (gaya.bd) hasil.bd = { ...gaya.bd, ...(cell.bd ?? {}) };
  return hasil;
}

/**
 * Kolom No. otomatis (§12.3): badan diberi 1, 2, 3… dari atas. Dilewati: sel yang tertutup gabungan
 * (lanjutan butir dua baris, atau bagian gabungan mendatar), sel yang ia sendiri gabungan mendatar
 * (judul kelompok), dan baris JUMLAH bila gaya itu dipakai. Larik yang sama dipulangkan bila tak ada yang berubah.
 */
export function nomorUlang(rows: TabelCell[][], headerRows: number, kolom: number | null, lewatiAkhir = false): TabelCell[][] {
  if (kolom === null) return rows;
  let n = 0, berubah = false;
  const hasil = rows.map((row, r) => {
    const cell = row[kolom];
    if (r < headerRows || !cell || cell.h || (cell.cs ?? 1) > 1 || (lewatiAkhir && r === rows.length - 1)) return row;
    const v = String(++n);
    if (cell.v === v) return row;
    berubah = true;
    return row.map((c, i) => (i === kolom ? { ...c, v } : c));
  });
  return berubah ? hasil : rows;
}

/**
 * Indeks baris baru dari "+ Baris" / Tab di sel terakhir. Dengan gaya baris JUMLAH, baris baru masuk
 * DI ATAS baris jumlah — kalau di bawahnya, baris kosong itulah yang jadi "jumlah" dan JUMLAH ikut bernomor.
 */
export function posisiBarisBaru(nrow: number, headerRows: number, jumlah: boolean): number {
  return jumlah && nrow - 1 >= headerRows ? nrow - 1 : nrow;
}

/**
 * "+ Baris" / Tab di sel terakhir — SATU aturan untuk keduanya. Baris yang masuk di atas JUMLAH ikut
 * terhitung: rentang di baris JUMLAH yang berakhir tepat di baris data terakhir dipanjangkan ke baris
 * baru (cara tabel Excel). Tanpa ini `=SUM(C3:C7)` tetap C3:C7 dan totalnya diam-diam kurang.
 */
export function sisipBarisBaru(rows: TabelCell[][], headerRows: number, ncol: number, jumlah: boolean): { rows: TabelCell[][]; di: number } {
  const di = posisiBarisBaru(rows.length, headerRows, jumlah);
  const hasil = sisipBarisSel(rows, di, 1, ncol);
  if (di === rows.length) return { rows: hasil, di };
  const j = hasil.length - 1;
  hasil[j] = hasil[j].map(cell => (cell.v.trimStart().startsWith('=') ? { ...cell, v: panjangkanRentang(cell.v, di - 1, di) } : cell));
  return { rows: hasil, di };
}

/** Rentang rumus yang baris akhirnya `dari` (0-based) dipanjangkan sampai `ke`; rujukan tunggal tidak disentuh. */
function panjangkanRentang(v: string, dari: number, ke: number): string {
  return v.replace(REF_RUMUS, (m: string, d1: string, h1: string, d2: string, a1: string, d3: string | undefined, h2: string | undefined, d4: string | undefined, a2: string | undefined, off: number, src: string) => {
    if (off > 0 && /[A-Za-z0-9_#]/.test(src[off - 1])) return m;
    if (h2 === undefined || a2 === undefined || Number(a2) - 1 !== dari || Number(a1) - 1 > dari) return m;
    return `${d1}${h1}${d2}${a1}:${d3 ?? ''}${h2}${d4 ?? ''}${ke + 1}`;
  });
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Angka murni gaya Indonesia: "1.250.000", "7,5", "-12". Kode berawalan nol ("0101") dan deretan
// digit > 15 (NIP) sengaja tidak — Excel akan membuang nol depannya / memotong digitnya.
const ANGKA_MURNI_ID = /^-?(?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d{0,14}|0)(?:,\d+)?$/;

/** Kode format Excel (sintaks baku) untuk `mso-number-format`, sudah di-escape untuk CSS. */
function formatExcel(nf: TabelNumFmt | undefined, dec: number, ribuan: boolean): string | null {
  const d = Math.max(0, Math.min(6, dec));
  const dasar = (nf === 'pct' ? '0' : ribuan || nf ? '#,##0' : '0') + (d > 0 ? '.' + '0'.repeat(d) : '');
  if (!nf && !ribuan && d === 0) return null;
  const esc = dasar.replace(/[#,.]/g, ch => '\\' + ch);
  if (nf === 'rp') return `\\0022Rp\\0022\\\\ ${esc}`;
  if (nf === 'pct') return `${esc}%`;
  return esc;
}

/**
 * Nilai angka sel untuk Excel (`x:num`) — lepas dari setelan bahasa Excel. Dibuktikan di Excel
 * 2026-10-19: dengan pemisah gaya Inggris, "1.250.000" & "79,01" yang ditempel masuk sebagai TEKS
 * (SUM diam-diam tak menghitungnya); dengan `x:num` keduanya angka. Persen = pecahan (12,5% → 0.125).
 */
export function angkaUntukExcel(rows: TabelCell[][], r: number, c: number): { nilai: number; format: string | null } | null {
  const cell = rows[r]?.[c];
  if (!cell || cell.h) return null;
  const v = (cell.v ?? '').trim();
  if (!v) return null;
  if (v.startsWith('=')) {
    const n = evalFormula(v.slice(1), rows, r, c, new Set());
    if (!Number.isFinite(n)) return null;
    const nilai = bulatkanDesimal(n, 10);
    // Tanpa format sel, layar menulis SEMUA desimalnya (`formatUmum`) — Excel harus sama, kalau tidak
    // "57.755.803.079,01" tampil "57.755.803.079" (terlihat di Excel 2026-10-19).
    const s = String(nilai), titik = s.indexOf('.');
    const dec = cell.nf ? (cell.dec ?? 0) : titik < 0 || /e/i.test(s) ? 0 : s.length - titik - 1;
    return { nilai, format: formatExcel(cell.nf, dec, Math.abs(n) >= 1000) };
  }
  if (cell.nf) {
    const n = angkaMentah(cell);
    return Number.isFinite(n) ? { nilai: n, format: formatExcel(cell.nf, cell.dec ?? 0, true) } : null;
  }
  // Ketikan polos "Rp 2.000" / "85,5%" juga angka — tanpa format sel, tapi bentuknya jelas.
  const rp = /^Rp\s?/i.test(v), pct = v.endsWith('%');
  const inti = v.replace(/^Rp\s?/i, '').replace(/%$/, '').trim();
  if (!ANGKA_MURNI_ID.test(inti) || (rp && pct)) return null;
  const desimal = inti.includes(',') ? inti.length - inti.indexOf(',') - 1 : 0;
  const n = angkaTeksId(inti);
  if (pct) return { nilai: bulatkanDesimal(n / 100, 10), format: formatExcel('pct', desimal, false) };
  return { nilai: n, format: formatExcel(rp ? 'rp' : undefined, desimal, inti.includes('.')) };
}

/** Format Teks Excel: sel yang BUKAN angka masuk persis seperti tampil — tanpa ini "0101" jadi 101. */
const FORMAT_TEKS_EXCEL = '\\@';

/**
 * Sel yang disalin = sel seperti dicetak Word (`buildTabelXml`): kepala tebal, rata tengah, berlatar
 * warna kepala dokumen bila tak berlatar sendiri; badan ikut perataan kolomnya. `cell` sudah bergaya
 * tabel (`selBergaya`) — garis JUMLAH & berselang ikut dari situ.
 */
export function selSalinan(cell: TabelCell, kepala: boolean, alignKolom: TabelAlign | undefined, warnaKepala: string): TabelCell {
  return {
    ...cell,
    b: cell.b || kepala,
    al: cell.al ?? (kepala ? 'center' : alignKolom),
    va: cell.va ?? (kepala ? 'middle' : undefined),
    bg: cell.bg ?? (kepala && warnaKepala ? warnaKepala : undefined),
  };
}

/** Garis sel dgn aturan `buildTabelXml`: tanpa ketentuan = tipis 0,5 pt, ≤ 0 = tanpa garis, n = n/8 pt (`w:sz`). */
const garisCss = (w: number | undefined) => (w === undefined ? '.5pt solid windowtext' : w <= 0 ? 'none' : `${w / 8}pt solid windowtext`);

/**
 * Blok terpilih sebagai tabel HTML untuk papan klip (§12.4): Word & Excel menempelnya lengkap dengan
 * gabungan, tebal, latar, dan perataan — TSV saja kehilangan semuanya. Gabungan yang terpotong batas
 * blok dipangkas ke blok; teksnya hanya ikut bila sel asalnya di dalam blok. Dibungkus
 * `<html xmlns:x>` karena Excel hanya membaca `x:num` bila namespace-nya dinyatakan di `<html>` —
 * di `<table>` tidak cukup (diuji); Chrome membungkusnya lagi dan Excel tetap membacanya.
 */
export function blokKeHtml(rows: TabelCell[][], k: Kotak, teks: (r: number, c: number) => string, sel: (r: number, c: number) => TabelCell = (r, c) => rows[r][c]): string {
  const ditulis = new Set<string>();
  // Lebar kolom sengaja tidak dikirim: diukur 2026-10-19, Word menyesuaikan lebar dgn isinya dan
  // Excel mempertahankan lebar kolom tujuannya — <col width>, gaya mso-width-source, dan lebar <td>
  // diabaikan semuanya. Petunjuknya ditampilkan editor sesudah Salin (`perluPetunjukLebar`).
  // Baris bertulisan tegak: tinggi <tr> dihormati Word tapi DIABAIKAN Excel (diuji, juga dgn
  // mso-height-source); Excel baru meninggikan barisnya sendiri bila sel tegaknya `nowrap` (lihat bawah).
  let adaTegak = false;
  for (let r = k.r1; r <= k.r2 && !adaTegak; r++) for (let c = k.c1; c <= k.c2; c++) if (rows[r]?.[c]?.rot && !rows[r][c].h) { adaTegak = true; break; }
  const tinggi = adaTegak ? tinggiBarisTegak(rows.map((row, r) => row.map((cell, c) => (cell.h ? cell : sel(r, c)))), 0, 12) : [];
  let html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse">';
  for (let r = k.r1; r <= k.r2; r++) {
    html += tinggi[r] ? `<tr style="height:${tinggi[r] / 20}pt">` : '<tr>';
    for (let c = k.c1; c <= k.c2; c++) {
      if (ditulis.has(`${r}:${c}`)) continue;
      const a = asalSel(rows, r, c);
      const r2 = Math.min(a.r + a.rs - 1, k.r2), c2 = Math.min(a.c + a.cs - 1, k.c2);
      for (let rr = r; rr <= r2; rr++) for (let cc = c; cc <= c2; cc++) ditulis.add(`${rr}:${cc}`);
      const cell = sel(a.r, a.c);
      const asal = a.r === r && a.c === c;
      const angka = asal ? angkaUntukExcel(rows, r, c) : null;
      const isi = asal ? teks(r, c) : '';
      const formatSel = angka ? angka.format : isi.trim() ? FORMAT_TEKS_EXCEL : null;
      const bd = cell.bd;
      const gaya = [
        cell.b ? 'font-weight:bold' : '',
        cell.i ? 'font-style:italic' : '',
        cell.u ? 'text-decoration:underline' : '',
        cell.fc ? `color:#${cell.fc}` : '',
        cell.fs ? `font-size:${cell.fs}pt` : '',
        cell.bg ? `background:#${cell.bg}` : '',
        cell.al ? `text-align:${cell.al}` : '',
        cell.va ? `vertical-align:${cell.va}` : '',
        bd ? `border-top:${garisCss(bd.t)};border-right:${garisCss(bd.r)};border-bottom:${garisCss(bd.b)};border-left:${garisCss(bd.l)}` : `border:${garisCss(undefined)}`,
        // Teks tegak: `mso-rotate:90` diputar Word DAN Excel (diuji 2026-10-19); `layout-flow:vertical`
        // justru membuat Excel menumpuk hurufnya ke bawah. Tanpa `nowrap` Excel membungkus "TW I" di
        // baris pendek jadi tiga potong; dengan `nowrap` ia meninggikan barisnya sendiri.
        cell.rot ? 'mso-rotate:90;white-space:nowrap' : '',
        formatSel ? `mso-number-format:'${formatSel}'` : '',
      ].filter(Boolean).join(';');
      const span = (c2 > c ? ` colspan="${c2 - c + 1}"` : '') + (r2 > r ? ` rowspan="${r2 - r + 1}"` : '');
      const xnum = angka ? ` x:num="${angka.nilai}"` : '';
      // Baris baru di dalam sel (Alt+Enter): `mso-data-placement:same-cell` membuat Excel tetap satu sel.
      html += `<td${span}${xnum}${gaya ? ` style="${gaya}"` : ''}>${escHtml(isi).replace(/\n/g, '<br style="mso-data-placement:same-cell">')}</td>`;
    }
    html += '</tr>';
  }
  return `${html}</table></body></html>`;
}

/** Panjang teks angka yang terbukti muat di kolom Excel bawaan (lebar 8,11): "1.250.000". */
const MUAT_KOLOM_EXCEL = 9;
/**
 * Adakah ANGKA di blok yang akan tampil "####" di kolom Excel selebar bawaan? Teks tidak dihitung —
 * Excel membiarkan teks meluber ke sel sebelah, angka tidak (diukur 2026-10-19: "Rp 74.154.779.000" → ####).
 */
export function perluPetunjukLebar(rows: TabelCell[][], k: Kotak, teks: (r: number, c: number) => string): boolean {
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      if (rows[r]?.[c]?.h) continue;
      if (teks(r, c).length > MUAT_KOLOM_EXCEL && angkaUntukExcel(rows, r, c)) return true;
    }
  }
  return false;
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

/**
 * Bentuk tabel di editor — larik paralel (`kolom`/`align`/`colWidths`) ikut tiap sisip/hapus kolom.
 * `peran` (peran → indeks kolom, IKI CUSTOM — CONCEPT-iki-custom §11) ikut bergeser seperti kolom No.
 */
export interface BentukTabel { rows: TabelCell[][]; kolom: string[]; align: TabelAlign[]; colWidths: number[]; headerRows: number; kolomNomor?: number | null; peran?: Record<string, number> }

/** Peran kolom sesudah kolom disisip/dihapus: yang kolomnya terhapus lepas, yang di kanannya bergeser. */
export function geserPeran(peran: Record<string, number>, g: Geser & { sumbu: 'kolom' }): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const [k, c] of Object.entries(peran)) {
    const baru = geserIndeks(c, g);
    if (baru !== null) hasil[k] = baru;
  }
  return hasil;
}

/**
 * Menandai kolom `kolom` dengan `kunci` (null = melepas). Satu peran satu kolom, satu kolom satu peran;
 * `lepas` = peran yang ditiadakan peran ini (TW mendatar ⇄ menurun).
 */
export function aturPeranKolom(peran: Record<string, number>, kunci: string, kolom: number | null, lepas: readonly string[] = []): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const [k, c] of Object.entries(peran)) {
    if (k === kunci || (kolom !== null && (c === kolom || lepas.includes(k)))) continue;
    hasil[k] = c;
  }
  if (kolom !== null) hasil[kunci] = kolom;
  return hasil;
}

/**
 * Baris kepala berisi nomor kolom saja (1, 2, 3 … seperti kepala IKI STANDAR): tiap selnya asal di baris
 * itu sendiri dan semuanya angka. Sub-judul "1 2 3 4" di bawah "Triwulan" bukan penomoran — sebagian
 * selnya tertutup gabungan dari baris di atasnya.
 */
function barisPenomoran(rows: TabelCell[][], r: number): boolean {
  const row = rows[r] ?? [];
  const nomor = row.filter(cell => !cell.h).map(cell => cell.v.trim());
  return row.length > 1 && row.every((_, c) => asalSel(rows, r, c).r === r) && nomor.every((v, i) => v === String(i + 1));
}

/** Judul kolom dari SEMUA baris kepala yang menutupnya ("Target Triwulan" + "II") — bahan menebak peran. */
export function judulBertingkat(rows: TabelCell[][], headerRows: number, c: number): string {
  const bagian: string[] = [];
  for (let r = 0; r < Math.min(headerRows, rows.length); r++) {
    if (barisPenomoran(rows, r)) continue;
    const a = asalSel(rows, r, c);
    if (a.r !== r) continue;
    const t = (rows[a.r]?.[a.c]?.v ?? '').trim();
    if (t && bagian[bagian.length - 1] !== t) bagian.push(t);
  }
  return bagian.join(' ');
}

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
    // Kolom No. ikut bergeser seperti align/colWidths (§12.3).
    ...(t.kolomNomor != null && t.kolomNomor >= di ? { kolomNomor: t.kolomNomor + n } : {}),
    ...(t.peran ? { peran: geserPeran(t.peran, { sumbu: 'kolom', sisip: di, n }) } : {}),
  };
}

export function hapusKolom(t: BentukTabel, dari: number, sampai: number): BentukTabel {
  const tetap = <T>(arr: T[]) => arr.filter((_, c) => c < dari || c > sampai);
  const kn = t.kolomNomor;
  return {
    ...t,
    rows: hapusKolomSel(t.rows, dari, sampai, t.kolom.length),
    kolom: tetap(t.kolom), align: tetap(t.align), colWidths: tetap(t.colWidths),
    ...(kn == null || kn < dari ? {} : { kolomNomor: kn > sampai ? kn - (sampai - dari + 1) : null }),
    ...(t.peran ? { peran: geserPeran(t.peran, { sumbu: 'kolom', hapus: [dari, sampai] }) } : {}),
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

/**
 * Kepala bertingkat untuk templat (Tahap B): kolom dalam satu kelompok mendapat judul kelompok di
 * baris 1 (digabung mendatar) dan judulnya sendiri di baris 2; kolom lain digabung setinggi 2 baris.
 */
export function kepalaBertingkat(judul: string[], kelompok: { judul: string; dari: number; sampai: number }[] = []): { kepala: TabelCell[][]; letak: (number | null)[] } {
  const n = judul.length;
  const sah = kelompok.filter(g => g.dari >= 0 && g.sampai < n && g.sampai > g.dari);
  if (!sah.length) return { kepala: [judul.map(v => ({ v }))], letak: judul.map(() => 0) };
  const diKelompok = (c: number) => sah.find(g => c >= g.dari && c <= g.sampai);
  const atas: TabelCell[] = judul.map((j, c) => {
    const g = diKelompok(c);
    if (!g) return { v: j, rs: 2 };
    return c === g.dari ? { v: g.judul, cs: g.sampai - g.dari + 1 } : { v: '' };
  });
  const bawah: TabelCell[] = judul.map((j, c) => ({ v: diKelompok(c) ? j : '' }));
  return { kepala: sanitizeRows([atas, bawah], n), letak: judul.map((_, c) => (diKelompok(c) ? 1 : 0)) };
}

// ═══ Tahap B — ala Excel tambahan (konsep §5.6–5.11) ══════════════════════════

/**
 * Rumus yang disalin / diisi-seret `dr` baris & `dc` kolom (§5.7): rujukan tanpa `$` ikut bergeser,
 * yang ber-`$` tetap — cara Excel. Rujukan yang jatuh sebelum A1 → `#REF!`.
 */
export function geserRumusRelatif(v: string, dr: number, dc: number): string {
  if (!v.trimStart().startsWith('=') || (!dr && !dc)) return v;
  return v.replace(REF_RUMUS, (m: string, d1: string, h1: string, d2: string, a1: string, d3: string | undefined, h2: string | undefined, d4: string | undefined, a2: string | undefined, off: number, src: string) => {
    if (off > 0 && /[A-Za-z0-9_#]/.test(src[off - 1])) return m;
    const satu = (dc$: string, h: string, dr$: string, a: string): string | null => {
      const c = indeksHuruf(h) + (dc$ ? 0 : dc), r = Number(a) - 1 + (dr$ ? 0 : dr);
      return c < 0 || r < 0 ? null : `${dc$}${colLabel(c)}${dr$}${r + 1}`;
    };
    const a = satu(d1, h1, d2, a1);
    if (h2 === undefined || a2 === undefined) return a ?? RUJUKAN_HILANG;
    const b = satu(d3 ?? '', h2, d4 ?? '', a2);
    return a && b ? `${a}:${b}` : RUJUKAN_HILANG;
  });
}

const BULAN_PANJANG = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const BULAN_PENDEK = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const ROMAWI_TW = ['I', 'II', 'III', 'IV'];
const POLA_TW = /^(TW|Triwulan)(\s*)(IV|III|II|I|[1-4])$/i;

/** Huruf besar/kecil keluaran mengikuti contohnya: "JAN" → "FEB", "Jan" → "Feb", "jan" → "feb". */
function ikutHuruf(contoh: string, kata: string): string {
  if (contoh === contoh.toUpperCase() && /[A-Z]/.test(contoh)) return kata.toUpperCase();
  if (contoh[0] === contoh[0]?.toUpperCase()) return kata[0].toUpperCase() + kata.slice(1);
  return kata;
}

/** Langkah deret: 1 contoh = +1; ≥ 2 contoh = selisih rata (harus bulat untuk deret berindeks). */
function langkahDeret(idx: number[], bulat: boolean): number | null {
  if (idx.length < 2) return 1;
  const l = (idx[idx.length - 1] - idx[0]) / (idx.length - 1);
  if (bulat && !Number.isInteger(l)) return null;
  for (let i = 1; i < idx.length; i++) if (Math.abs(idx[i] - idx[i - 1] - l) > 1e-9) return null;
  return l;
}

/**
 * Deret isi-seret dari isi sel contoh (§5.7) → fungsi "nilai ke-k sesudah contoh terakhir", atau
 * null = bukan deret (disalin berulang apa adanya). Angka butuh ≥ 2 contoh (satu angka disalin, cara Excel).
 */
export function deretIsi(contoh: TabelCell[]): ((k: number) => string) | null {
  const teks = contoh.map(c => (c.v ?? '').trim());
  if (!teks.length || teks.some(t => !t || t.startsWith('='))) return null;
  // Angka: "1.250.000" tetap bergaya ribuan; "2026" tetap tanpa titik (tahun, kode).
  if (contoh.length >= 2 && contoh.every(c => (c.nf && ANGKA_MESIN.test(c.v.trim())) || ANGKA_MURNI_ID.test(c.v.trim()))) {
    const n = contoh.map(c => (c.nf && ANGKA_MESIN.test(c.v.trim()) ? Number(c.v) : angkaTeksId(c.v.trim())));
    const l = langkahDeret(n, false);
    if (l === null) return null;
    const mesin = !!contoh[contoh.length - 1].nf;
    const ribuan = teks.some(t => /\d\.\d{3}/.test(t));
    return k => {
      const x = bulatkanDesimal(n[n.length - 1] + l * k, 10);
      if (mesin) return String(x);
      return ribuan ? formatUmum(x) : String(x).replace('.', ',');
    };
  }
  for (const daftar of [BULAN_PANJANG, BULAN_PENDEK]) {
    const idx = teks.map(t => daftar.indexOf(t.toLowerCase()));
    if (idx.every(i => i >= 0)) {
      const l = langkahDeret(idx, true);
      if (l === null) return null;
      const akhir = teks[teks.length - 1];
      return k => ikutHuruf(akhir, daftar[(((idx[idx.length - 1] + l * k) % 12) + 12) % 12]);
    }
  }
  const tw = teks.map(t => POLA_TW.exec(t));
  if (tw.every(Boolean)) {
    const idx = tw.map(m => (/^\d$/.test(m![3]) ? Number(m![3]) - 1 : ROMAWI_TW.indexOf(m![3].toUpperCase())));
    const l = langkahDeret(idx, true);
    if (l === null) return null;
    const m = tw[tw.length - 1]!;
    const arab = /^\d$/.test(m[3]);
    return k => {
      const i = (((idx[idx.length - 1] + l * k) % 4) + 4) % 4;
      return `${m[1]}${m[2]}${arab ? String(i + 1) : ROMAWI_TW[i]}`;
    };
  }
  // Teks berakhiran angka: "Sasaran 1" → "Sasaran 2"; nol depan dipertahankan ("Lampiran 01" → "02").
  const ekor = teks.map(t => /^(.*\D)(\d{1,9})$/.exec(t));
  if (ekor.every(Boolean) && ekor.every(m => m![1] === ekor[0]![1])) {
    const idx = ekor.map(m => Number(m![2]));
    const l = langkahDeret(idx, true);
    if (l === null) return null;
    const akhir = ekor[ekor.length - 1]!;
    const lebar = akhir[2].startsWith('0') ? akhir[2].length : 0;
    return k => `${akhir[1]}${String(Math.max(0, idx[idx.length - 1] + l * k)).padStart(lebar, '0')}`;
  }
  return null;
}

export type HasilBlok = { rows: TabelCell[][] } | { galat: string };

/**
 * Isi-seret (fill handle, §5.7): blok `sumber` diperpanjang sampai `sampai` — ke bawah atau ke kanan.
 * Tiap kolom (ke bawah) / baris (ke kanan) diperiksa sendiri: deret → dilanjutkan, selain itu disalin
 * berulang. Rumus disalin dengan rujukan relatif (`geserRumusRelatif`). Format ikut contohnya.
 */
export function isiSeret(rows: TabelCell[][], sumber: Kotak, sampai: Kotak, boleh: (r: number, c: number) => boolean = () => true): HasilBlok {
  const bawah = sampai.r2 > sumber.r2, kanan = !bawah && sampai.c2 > sumber.c2;
  if (!bawah && !kanan) return { rows };
  const area: Kotak = { r1: sumber.r1, c1: sumber.c1, r2: bawah ? sampai.r2 : sumber.r2, c2: kanan ? sampai.c2 : sumber.c2 };
  for (let r = area.r1; r <= area.r2; r++) {
    for (let c = area.c1; c <= area.c2; c++) {
      const cell = rows[r]?.[c];
      if (!cell) return { galat: 'Isi-seret melewati batas tabel.' };
      if (cell.h || (cell.cs ?? 1) > 1 || (cell.rs ?? 1) > 1) return { galat: 'Isi-seret tidak bisa melewati sel gabungan — pisah dulu gabungannya.' };
    }
  }
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  const lajur = bawah ? [sumber.c1, sumber.c2] : [sumber.r1, sumber.r2];
  const panjang = bawah ? sumber.r2 - sumber.r1 + 1 : sumber.c2 - sumber.c1 + 1;
  for (let j = lajur[0]; j <= lajur[1]; j++) {
    const pos = (i: number) => (bawah ? { r: sumber.r1 + i, c: j } : { r: j, c: sumber.c1 + i });
    const contoh = Array.from({ length: panjang }, (_, i) => { const p = pos(i); return rows[p.r][p.c]; });
    const deret = deretIsi(contoh);
    const akhir = bawah ? area.r2 - sumber.r1 : area.c2 - sumber.c1;
    for (let i = panjang; i <= akhir; i++) {
      const p = pos(i);
      if (!boleh(p.r, p.c)) continue;
      const asal = contoh[i % panjang];
      const v = deret ? deret(i - panjang + 1) : geserRumusRelatif(asal.v, bawah ? i - (i % panjang) : 0, bawah ? 0 : i - (i % panjang));
      next[p.r][p.c] = { v, ...formatSel(asal) };
    }
  }
  return { rows: next };
}

/**
 * Angka sel SEPERTI TAMPIL (persen ×100), atau null bila sel bukan angka — bilah status, AutoSum,
 * urutkan. Beda dgn `angkaSel` yang memulangkan 0 untuk teks: di sini teks tidak boleh ikut dihitung.
 */
export function nilaiAngkaSel(rows: TabelCell[][], r: number, c: number): number | null {
  const cell = rows[r]?.[c];
  if (!cell || cell.h) return null;
  const v = (cell.v ?? '').trim();
  if (!v) return null;
  if (v.startsWith('=')) {
    if (v.includes(RUJUKAN_HILANG)) return null;
    const n = evalFormula(v.slice(1), rows, r, c, new Set());
    return Number.isFinite(n) ? (cell.nf === 'pct' ? n * 100 : n) : null;
  }
  if (cell.nf && ANGKA_MESIN.test(v)) return cell.nf === 'pct' ? Number(v) * 100 : Number(v);
  const inti = v.replace(/^Rp\s?/i, '').replace(/%$/, '').trim();
  return ANGKA_MURNI_ID.test(inti) ? angkaTeksId(inti) : null;
}

/** Bilah status (§5.9): Jumlah & Rata-rata dari sel ANGKA, Banyak = sel berisi (COUNTA Excel). */
export function ringkasBlok(rows: TabelCell[][], k: Kotak): { jumlah: number; rataRata: number | null; banyak: number; banyakAngka: number } {
  let jumlah = 0, banyak = 0, banyakAngka = 0;
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      const cell = rows[r]?.[c];
      if (!cell || cell.h || !(cell.v ?? '').trim()) continue;
      banyak++;
      const n = nilaiAngkaSel(rows, r, c);
      if (n !== null) { jumlah += n; banyakAngka++; }
    }
  }
  return { jumlah: bulatkanDesimal(jumlah, 10), rataRata: banyakAngka ? bulatkanDesimal(jumlah / banyakAngka, 10) : null, banyak, banyakAngka };
}

/**
 * Σ AutoSum (§5.9). Sel KOSONG di blok diberi `=SUM(...)` deret angka bersambung tepat di atasnya
 * (berhenti di kepala, sel teks, atau sel kosong) — atau di kirinya bila di atasnya tak ada angka.
 * Blok yang seluruhnya angka: jumlahnya ditaruh di sel kosong sesudahnya — di bawah tiap kolom,
 * atau di kanan bila blok itu satu baris.
 */
export function autoJumlah(rows: TabelCell[][], k: Kotak, headerRows: number, boleh: (r: number, c: number) => boolean = () => true): { rows: TabelCell[][]; sel: { r: number; c: number }[] } {
  const angka = (r: number, c: number) => r >= headerRows && nilaiAngkaSel(rows, r, c) !== null;
  const kosong = (r: number, c: number) => { const cell = rows[r]?.[c]; return !!cell && !cell.h && !(cell.v ?? '').trim() && boleh(r, c); };
  const tulis: { r: number; c: number; v: string }[] = [];
  const rumus = (a: { r: number; c: number }, b: { r: number; c: number }) => `=SUM(${colLabel(a.c)}${a.r + 1}:${colLabel(b.c)}${b.r + 1})`;
  const deretAtas = (r: number, c: number) => { let a = r - 1; while (a - 1 >= 0 && angka(a - 1, c)) a--; return angka(r - 1, c) ? a : -1; };
  const deretKiri = (r: number, c: number) => { let a = c - 1; while (a - 1 >= 0 && angka(r, a - 1)) a--; return c - 1 >= 0 && angka(r, c - 1) ? a : -1; };
  let adaKosong = false;
  for (let r = k.r1; r <= k.r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      if (!kosong(r, c)) continue;
      adaKosong = true;
      const a = deretAtas(r, c);
      if (a >= 0) { tulis.push({ r, c, v: rumus({ r: a, c }, { r: r - 1, c }) }); continue; }
      const b = deretKiri(r, c);
      if (b >= 0) tulis.push({ r, c, v: rumus({ r, c: b }, { r, c: c - 1 }) });
    }
  }
  if (!adaKosong) {
    const adaAngka = (ra: number, ca: number, rb: number, cb: number) => {
      for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) if (angka(r, c)) return true;
      return false;
    };
    if (k.r1 === k.r2 && k.c2 > k.c1) {
      if (kosong(k.r1, k.c2 + 1) && adaAngka(k.r1, k.c1, k.r1, k.c2)) tulis.push({ r: k.r1, c: k.c2 + 1, v: rumus({ r: k.r1, c: k.c1 }, { r: k.r1, c: k.c2 }) });
    } else {
      for (let c = k.c1; c <= k.c2; c++) {
        if (kosong(k.r2 + 1, c) && adaAngka(k.r1, c, k.r2, c)) tulis.push({ r: k.r2 + 1, c, v: rumus({ r: k.r1, c }, { r: k.r2, c }) });
      }
    }
  }
  if (!tulis.length) return { rows, sel: [] };
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  for (const t of tulis) next[t.r][t.c].v = t.v;
  return { rows: next, sel: tulis.map(({ r, c }) => ({ r, c })) };
}

/** Kuas format (§5.8): format pola diulang menutup blok; isi & gabungan sel tujuan tetap. */
export function tempelFormat(rows: TabelCell[][], k: Kotak, pola: TabelCell[][], boleh: (r: number, c: number) => boolean = () => true): TabelCell[][] {
  const pr = pola.length, pc = Math.max(0, ...pola.map(r => r.length));
  if (!pr || !pc) return rows;
  return rows.map((row, r) => row.map((cell, c) => {
    if (r < k.r1 || r > k.r2 || c < k.c1 || c > k.c2 || cell.h || !boleh(r, c)) return cell;
    const p = pola[(r - k.r1) % pr]?.[(c - k.c1) % pc];
    return { ...tanpaFormat(cell), ...formatSel(p) };
  }));
}

/**
 * "Nilai saja" sebuah sel (§5.6 tempel nilai): rumus → hasilnya, angka berformat → angkanya, gaya
 * Indonesia tanpa format (seperti Excel "Paste Values" ke sel umum). Rumus galat → kosong.
 */
export function nilaiSaja(rows: TabelCell[][], r: number, c: number): string {
  const cell = rows[r]?.[c];
  if (!cell || cell.h) return '';
  const v = (cell.v ?? '').trim();
  if (v.startsWith('=')) {
    if (v.includes(RUJUKAN_HILANG)) return '';
    const n = evalFormula(v.slice(1), rows, r, c, new Set());
    return Number.isFinite(n) ? formatUmum(n) : '';
  }
  if (cell.nf && ANGKA_MESIN.test(v)) return formatUmum(Number(v));
  return cell.v;
}

/**
 * Tempel nilai (Ctrl+Shift+V): teks ditulis ke sel tujuan dan FORMAT TUJUAN dipertahankan — angka
 * di sel berformat disimpan sebagai angka mesin (`nilaiKetikan`). Sel tertutup gabungan dilewati.
 */
export function tempelNilai(rows: TabelCell[][], r1: number, c1: number, nilai: string[][], ncol: number, boleh: (r: number, c: number, teks: string) => boolean = () => true): TabelCell[][] {
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  while (next.length < r1 + nilai.length) next.push(Array.from({ length: ncol }, () => ({ v: '' } as TabelCell)));
  nilai.forEach((baris, i) => baris.forEach((teks, j) => {
    const r = r1 + i, c = c1 + j;
    const cell = next[r]?.[c];
    if (!cell || cell.h || !boleh(r, c, teks)) return;
    next[r][c] = { ...cell, v: nilaiKetikan(cell, teks) };
  }));
  return sanitizeRows(next, ncol);
}

// ═══ Tahap C — tempel dari Excel/Word lengkap, urutkan, cari & ganti (konsep §5.6, §8) ═══════

const ENTITAS: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function urai(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITAS[e.toLowerCase()] ?? m;
  });
}

function bacaCss(teks: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const bagian of teks.split(';')) {
    const i = bagian.indexOf(':');
    if (i > 0) out[bagian.slice(0, i).trim().toLowerCase()] = bagian.slice(i + 1).trim().replace(/\s*!important$/i, '');
  }
  return out;
}

const WARNA_NAMA: Record<string, string> = { red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00', white: 'FFFFFF', black: '000000', gray: '808080', grey: '808080', orange: 'FFA500' };
function hexWarna(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(t); if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/.exec(t); if (m) return m[1].split('').map(x => x + x).join('').toUpperCase();
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(t);
  if (m) return [m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return WARNA_NAMA[t] ?? null;
}

/**
 * Angka sel tempelan yang punya nilai MESIN (`x:num` Excel, `data-sheets-value` Google Sheets) ditulis
 * gaya Indonesia: Excel bersetelan Inggris menempel "1,250,000" yang dulu terbaca 1,25. Desimalnya
 * mengikuti yang tampil; teks berangka polos ("2026", kode) dibiarkan tanpa titik ribuan.
 */
export function angkaDariTempelan(n: number, tampil: string): string {
  const t = tampil.trim();
  if (/^-?\d+$/.test(t) && Number(t) === n) return t;
  const pct = /%\s*$/.test(t), rp = /rp/i.test(t);
  const nilai = pct ? n * 100 : n;
  const bulat = Math.abs(nilai - Math.round(nilai)) < 1e-9;
  // Desimal = yang TAMPIL ("13%" untuk 0,125 berformat 0%) — tempelan memuat apa yang dilihat orangnya.
  const m = /[.,](\d+)\D*$/.exec(t);
  const dec = bulat ? 0 : Math.min(6, m ? m[1].length : 0);
  const badan = formatNumber(nilai, undefined, dec);
  return rp ? `Rp ${badan}` : pct ? `${badan}%` : badan;
}

/**
 * Angka bergaya Inggris ("1,250,000", "57,755,803,079.01", "12.5%") → gaya Indonesia. Dipakai hanya
 * bila Excel MENYATAKAN pemisah desimalnya titik — Excel 365 tidak lagi menulis `x:num`, jadi teks
 * tampilnya satu-satunya bahan (diukur 2026-10-20), dan "1,250,000" dulu terbaca 1,25.
 */
export function angkaInggrisKeId(teks: string): string {
  const m = /^(Rp\s?)?(-?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%?)$/.exec(teks.trim());
  if (!m) return teks;
  return `${m[1] ?? ''}${m[2]}${m[3].replace(/,/g, '.')}${m[4] ? `,${m[4].slice(1)}` : ''}${m[5]}`;
}

/**
 * Tabel HTML papan klip → sel LENGKAP dengan gabungan & format (Tahap C) — Excel (gaya lewat kelas
 * `.xlNN` di <style>), Word (<b>/<i>/<u> & paragraf), Google Sheets (gaya sebaris), dan salinan PRIMA
 * sendiri. Ukuran huruf sengaja tidak dibawa: tabel mengikuti huruf dokumen. null = bukan tabel.
 */
export function htmlKeSel(html: string, batasKolom = BATAS_KOLOM_TABEL): TabelCell[][] | null {
  const s = String(html ?? '');
  const awal = s.search(/<table\b/i);
  if (awal < 0) return null;
  const kelas = new Map<string, Record<string, string>>();
  let dasarTd: Record<string, string> = {};
  for (const gaya of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const isi = gaya[1].replace(/<!--|-->/g, '');
    for (const m of isi.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const css = bacaCss(m[2]);
      for (const pemilih of m[1].split(',').map(x => x.trim())) {
        const k = /^(?:td)?\.([A-Za-z0-9_-]+)$/.exec(pemilih);
        if (k) kelas.set(k[1], { ...(kelas.get(k[1]) ?? {}), ...css });
        else if (/^td$/i.test(pemilih)) dasarTd = { ...dasarTd, ...css };
      }
    }
  }
  // Excel menulis pemisah tampilannya di <style>: `mso-displayed-decimal-separator:"\."` = setelan Inggris.
  const desimalTitik = /mso-displayed-decimal-separator\s*:\s*"\\?\."/i.test(s);
  const akhir = s.search(/<\/table>/i);
  const badan = s.slice(awal, akhir > awal ? akhir : undefined);
  const atribut = (a: string, nama: string) => {
    const m = new RegExp(`(?:^|\\s)${nama}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(a);
    return m ? (m[1] ?? m[2] ?? m[3] ?? '') : undefined;
  };
  type Mentah = { cell: TabelCell; cs: number; rs: number };
  const baris: Mentah[][] = [];
  for (const potong of badan.split(/<tr\b/i).slice(1)) {
    const tr = potong.split(/<\/tr>/i)[0];
    const sel: Mentah[] = [];
    for (const t of tr.split(/<t[dh]\b/i).slice(1)) {
      const tutup = t.indexOf('>');
      const attr = t.slice(0, tutup);
      const dalam = t.slice(tutup + 1).split(/<\/t[dh]>/i)[0];
      const css = { ...dasarTd, ...(kelas.get(atribut(attr, 'class') ?? '') ?? {}), ...bacaCss(atribut(attr, 'style') ?? '') };
      const cssKhusus = { ...(kelas.get(atribut(attr, 'class') ?? '') ?? {}), ...bacaCss(atribut(attr, 'style') ?? '') };
      const teks = urai(dalam.replace(/<!--[\s\S]*?-->/g, '').replace(/[\r\n\t ]+/g, ' ')
        .replace(/<br\b[^>]*>/gi, '\n').replace(/<\/p>\s*/gi, '\n').replace(/<[^>]+>/g, ''))
        .split('\n').map(x => x.replace(/\u00a0/g, ' ').trim()).join('\n').replace(/^\n+|\n+$/g, '');
      // Tanda format pembungkus SELURUH isi (Word): <b>teks</b> → tebal.
      const bungkus = (tag: string) => {
        if (!new RegExp(`<(${tag})\\b`, 'i').test(dalam)) return false;
        const sisa = dalam.replace(new RegExp(`<(${tag})\\b[^>]*>[\\s\\S]*?</\\1>`, 'gi'), '').replace(/<[^>]+>/g, '');
        return !urai(sisa).replace(/\u00a0/g, ' ').trim();
      };
      const cell: TabelCell = { v: teks };
      const fw = (css['font-weight'] ?? '').toLowerCase();
      if (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600 || bungkus('b|strong')) cell.b = true;
      if ((css['font-style'] ?? '').toLowerCase() === 'italic' || bungkus('i|em')) cell.i = true;
      if (/underline/i.test(css['text-decoration'] ?? '') || bungkus('u')) cell.u = true;
      const al = (cssKhusus['text-align'] ?? atribut(attr, 'align') ?? '').toLowerCase();
      if (al === 'center' || al === 'right' || al === 'justify') cell.al = al;
      // Hanya "tengah" yang dibawa: rata bawah adalah bawaan Excel & Google Sheets (tertulis di tiap sel),
      // sedangkan bawaan tabel dokumen rata atas — membawanya membuat seluruh tempelan turun ke dasar sel.
      const va = (cssKhusus['vertical-align'] ?? atribut(attr, 'valign') ?? '').toLowerCase();
      if (va === 'middle' || va === 'center') cell.va = 'middle';
      const bg = hexWarna(css['background'] ?? css['background-color'] ?? atribut(attr, 'bgcolor'));
      if (bg && bg !== 'FFFFFF') cell.bg = bg;
      const fc = hexWarna(css['color']);
      if (fc && fc !== '000000') cell.fc = fc;
      if (css['mso-rotate'] === '90') cell.rot = true;
      const xnum = atribut(attr, 'x:num');
      const sheets = /"3"\s*:\s*(-?[\d.eE+-]+)/.exec(urai(atribut(attr, 'data-sheets-value') ?? ''));
      const n = xnum !== undefined && xnum !== '' ? Number(xnum) : sheets ? Number(sheets[1]) : NaN;
      if (Number.isFinite(n) && teks) cell.v = angkaDariTempelan(n, teks);
      else if (desimalTitik && teks) cell.v = angkaInggrisKeId(teks);
      const cs = Math.max(1, Math.min(batasKolom, Number(atribut(attr, 'colspan')) || 1));
      const rs = Math.max(1, Math.min(BATAS_BARIS_TABEL, Number(atribut(attr, 'rowspan')) || 1));
      sel.push({ cell, cs, rs });
    }
    baris.push(sel);
  }
  // Tata letak tabel HTML: sel melompati kolom yang masih tertutup rowspan baris di atasnya.
  const grid: (TabelCell | undefined)[][] = [];
  baris.forEach((sel, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const m of sel) {
      while (grid[r][c]) c++;
      for (let rr = r; rr < r + m.rs; rr++) {
        grid[rr] ??= [];
        for (let cc = c; cc < c + m.cs; cc++) grid[rr][cc] = rr === r && cc === c ? { ...m.cell, ...(m.cs > 1 ? { cs: m.cs } : {}), ...(m.rs > 1 ? { rs: m.rs } : {}) } : { v: '', h: true };
      }
      c += m.cs;
    }
  });
  const nrow = Math.min(baris.length, BATAS_BARIS_TABEL);
  const ncol = Math.max(0, ...grid.slice(0, nrow).map(r => r?.length ?? 0));
  if (!nrow || !ncol) return null;
  const hasil = Array.from({ length: nrow }, (_, r) => Array.from({ length: ncol }, (_, c) => grid[r]?.[c] ?? { v: '' }));
  return sanitizeRows(hasil, ncol);
}

/** Kunci urut sel: angka < teks < kosong (kosong selalu di bawah, juga saat Z→A — cara Excel). */
function kunciUrut(rows: TabelCell[][], r: number, c: number): { jenis: 0 | 1 | 2; n: number; t: string } {
  const a = asalSel(rows, r, c);
  const n = nilaiAngkaSel(rows, a.r, a.c);
  if (n !== null) return { jenis: 0, n, t: '' };
  const t = displayValue(rows, a.r, a.c).trim();
  return t ? { jenis: 1, n: 0, t } : { jenis: 2, n: 0, t: '' };
}

/**
 * Urutkan blok (Tahap C): baris badan di dalam blok diurut menurut `kolom`; hanya kolom blok yang
 * berpindah (cara Excel). Kepala tidak ikut, baris JUMLAH (`lewatiAkhir`) tidak ikut. Gabungan
 * antarbaris di blok ditolak — memindahkan setengah gabungan merusaknya. Rumus yang berpindah ikut
 * bergeser seperti disalin (`geserRumusRelatif`).
 */
export function urutkanBlok(rows: TabelCell[][], k: Kotak, kolom: number, turun: boolean, headerRows: number, lewatiAkhir = false): HasilBlok {
  const r1 = Math.max(k.r1, headerRows);
  const r2 = lewatiAkhir && k.r2 === rows.length - 1 ? k.r2 - 1 : k.r2;
  if (r2 <= r1) return { galat: 'Pilih minimal dua baris badan tabel untuk diurutkan.' };
  if (kolom < k.c1 || kolom > k.c2) return { galat: 'Kolom kunci harus di dalam blok.' };
  for (let r = r1; r <= r2; r++) {
    for (let c = k.c1; c <= k.c2; c++) {
      const a = asalSel(rows, r, c);
      if (a.r !== r || a.rs > 1 || a.c < k.c1 || a.c + a.cs - 1 > k.c2) return { galat: 'Blok berisi sel gabungan yang memotong baris atau tepi blok — pisah dulu gabungannya.' };
    }
  }
  const urut = Array.from({ length: r2 - r1 + 1 }, (_, i) => r1 + i).map(r => ({ r, kunci: kunciUrut(rows, r, kolom) }));
  urut.sort((x, y) => {
    if (x.kunci.jenis !== y.kunci.jenis) return x.kunci.jenis - y.kunci.jenis;
    if (x.kunci.jenis === 2) return x.r - y.r;
    const beda = x.kunci.jenis === 0 ? x.kunci.n - y.kunci.n : x.kunci.t.localeCompare(y.kunci.t, 'id', { numeric: true, sensitivity: 'base' });
    return (turun ? -beda : beda) || x.r - y.r;
  });
  const next = rows.map(row => row.map(cell => ({ ...cell })));
  urut.forEach(({ r: dari }, i) => {
    const ke = r1 + i;
    for (let c = k.c1; c <= k.c2; c++) {
      const cell = rows[dari][c];
      next[ke][c] = { ...cell, v: geserRumusRelatif(cell.v, ke - dari, 0) };
    }
  });
  return { rows: sanitizeRows(next, rows[0]?.length ?? 0) };
}

const polaCari = (kata: string, hurufBesar: boolean) => new RegExp(kata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), hurufBesar ? 'g' : 'gi');

/** Cari di tabel (Tahap C): isi sel (termasuk rumus) ATAU teks tampilnya ("1.250.000" di sel Rupiah bermesin 1250000). */
export function cariSel(rows: TabelCell[][], kata: string, hurufBesar = false): { r: number; c: number }[] {
  if (!kata) return [];
  const pola = polaCari(kata, hurufBesar);
  const out: { r: number; c: number }[] = [];
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.h) return;
    pola.lastIndex = 0;
    if (pola.test(cell.v)) { out.push({ r, c }); return; }
    pola.lastIndex = 0;
    if (pola.test(displayValue(rows, r, c))) out.push({ r, c });
  }));
  return out;
}

/** Ganti di isi sel. Kecocokan yang hanya ada di teks TAMPIL (angka berformat) tidak bisa diganti di sini. */
export function gantiDiSel(v: string, kata: string, dengan: string, hurufBesar = false): { v: string; n: number } {
  if (!kata) return { v, n: 0 };
  let n = 0;
  const baru = v.replace(polaCari(kata, hurufBesar), () => { n++; return dengan; });
  return { v: baru, n };
}

/** Ganti semua: `ditahan` = sel cocok yang tidak boleh disunting (badan tertaut, kolom No.) atau hanya cocok di tampilannya. */
export function gantiSemua(rows: TabelCell[][], kata: string, dengan: string, boleh: (r: number, c: number) => boolean = () => true, hurufBesar = false): { rows: TabelCell[][]; n: number; sel: number; ditahan: number } {
  let n = 0, sel = 0, ditahan = 0;
  const cocok = new Set(cariSel(rows, kata, hurufBesar).map(p => `${p.r}:${p.c}`));
  const next = rows.map((row, r) => row.map((cell, c) => {
    if (!cocok.has(`${r}:${c}`)) return cell;
    const g = gantiDiSel(cell.v, kata, dengan, hurufBesar);
    if (!g.n || !boleh(r, c)) { ditahan++; return cell; }
    n += g.n; sel++;
    return { ...cell, v: nilaiKetikan(cell, g.v) };
  }));
  return { rows: n ? next : rows, n, sel, ditahan };
}
