// lib/data/kinerja-import.ts — IK-1: parser Excel "Laporan Pendapatan Bulanan" →
// nilai Realisasi (+Target) per bulan untuk Section 1 Pendapatan E-Anggaran.
// Server-only (exceljs). PURE terhadap I/O: terima Buffer, balikkan baris + warning;
// TIDAK menulis DB. WAJIB baca NILAI HASIL formula (cell.result), bukan rumus.
//
// Dua layout didukung:
//  • RAKOR  — baris = kode rekening, 1 bulan/sheet; ambil baris PAD (4.1) kolom
//             penerimaan bulan itu sebagai realisasi (incremental), Anggaran = target.
//  • SIMPLE — baris = nama bulan (Jan..Des), kolom Target/Realisasi (mis. hasil
//             export app sendiri); ambil langsung per baris bulan.
import ExcelJS from 'exceljs';

export interface ParsedPendMonth {
  bulan_ke:  number;        // 1..12
  label:     string;        // 'Januari'..'Desember'
  realisasi: number;
  target:    number | null; // null = tak terdeteksi → biar user isi
  source:    string;        // jejak asal (sheet + kolom) untuk transparansi preview
}
export interface ParsePendResult {
  months:   ParsedPendMonth[];
  warnings: string[];
}

// L-3: anti zip/XML decompression-bomb — xlsx = kontainer zip, MIME-sniff longgar
// (zip apa pun lolos). Selain cap ukuran (10MB) + grid (30×600), batasi jumlah sheet
// supaya file jahat dengan ribuan worksheet tidak meledakkan memori saat parse.
const MAX_SHEETS = 60;
function assertSheetCap(wb: ExcelJS.Workbook): void {
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS)
    throw new Error(`File punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
}

const MONTHS = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
const MONTH_ABBR: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, mei:5, mey:5, jun:6, jul:7, agu:8, agt:8, ags:8, sep:9, okt:10, oct:10, nov:11, des:12, dec:12 };

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}

export function cellNum(v: unknown): number | null {
  const u = unwrap(v);
  if (u == null) return null;
  if (typeof u === 'number') return isFinite(u) ? u : null;
  let s = String(u).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.includes('-'); // "(1.234)" atau "-1.234" = negatif
  s = s.replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234.567,89
  else s = s.replace(',', '.');
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function cellStr(v: unknown): string {
  const u = unwrap(v);
  return u == null ? '' : String(u).replace(/\s+/g, ' ').trim();
}

// XSS/robustness (defense-in-depth): teks turunan Excel = DATA TAK TEPERCAYA.
// React sudah auto-escape saat render (tanpa innerHTML), TAPI kita juga bersihkan
// di SUMBER sebelum keluar dari parser: buang karakter kontrol + zero-width +
// pemisah baris/paragraf, normalkan spasi, cap panjang. Dipakai untuk fitur
// Lampirkan-di-chat Rima (data nempel di RAM browser) + modal Import.
export function sanitizeImportText(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    // kontrol C0/C1 + zero-width (200B-200F) + bidi embed/override (202A-202E) +
    // bidi isolate (2066-2069) + line/para sep (2028/2029) + BOM. Bidi = anti
    // spoofing/Trojan-Source (CVE-2021-42574).
    if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x2028 || c === 0x2029 || c === 0xFEFF) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function monthFromText(text: string): number | null {
  const low = text.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) if (low.includes(MONTHS[i])) return i + 1;
  const m = low.match(/\b(jan|feb|mar|apr|mei|mey|jun|jul|agu|agt|ags|sep|okt|oct|nov|des|dec)\b/);
  if (m && MONTH_ABBR[m[1]]) return MONTH_ABBR[m[1]];
  return null;
}

type Grid = unknown[][]; // [row][col], 0-based

function sheetGrid(ws: ExcelJS.Worksheet): Grid {
  const grid: Grid = [];
  const maxC = Math.min(ws.columnCount || 0, 30);
  const maxR = Math.min(ws.rowCount || 0, 600);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const arr: unknown[] = [];
    for (let c = 1; c <= maxC; c++) arr.push(row.getCell(c).value);
    grid.push(arr);
  }
  return grid;
}

// Header gabungan per kolom (header sering merge 2 baris). HANYA baris header tabel
// [startRow, endRow) — JANGAN ikutkan baris judul ("PER 30 APRIL") yang mencemari
// deteksi bulan/kolom.
function colHeaders(grid: Grid, startRow: number, endRow: number): string[] {
  const cols = grid[0]?.length ?? 0;
  const out: string[] = [];
  for (let c = 0; c < cols; c++) {
    let h = '';
    for (let r = Math.max(0, startRow); r < Math.min(endRow, grid.length); r++) h += ' ' + cellStr(grid[r][c]);
    out.push(h.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  return out;
}

function findCol(headers: string[], pred: (h: string) => boolean): number {
  for (let c = 0; c < headers.length; c++) if (pred(headers[c])) return c;
  return -1;
}

// Layout SIMPLE: ≥6 baris yang sel-nya nama bulan + ada kolom realisasi/target.
function parseSimple(grid: Grid, sheetName: string): ParsedPendMonth[] | null {
  const headerRow = grid.findIndex(row => row.some(c => /realisasi|penerimaan/i.test(cellStr(c))) && row.some(c => /target|anggaran|bulan/i.test(cellStr(c))));
  const hEnd = headerRow >= 0 ? headerRow + 1 : 1;
  const headers = colHeaders(grid, headerRow >= 0 ? headerRow : 0, hEnd);
  const bulanCol = findCol(headers, h => /bulan|uraian|keterangan/.test(h));
  const realCol  = findCol(headers, h => /realisasi|penerimaan/.test(h) && !/s\.?d|lalu|total/.test(h));
  const tgtCol   = findCol(headers, h => /target|anggaran/.test(h) && !/perubahan/.test(h));
  if (bulanCol < 0 || realCol < 0) return null;
  const found: ParsedPendMonth[] = [];
  for (let r = hEnd; r < grid.length; r++) {
    const bk = monthFromText(cellStr(grid[r][bulanCol]));
    if (!bk || found.some(f => f.bulan_ke === bk)) continue;
    const realisasi = cellNum(grid[r][realCol]);
    if (realisasi == null) continue;
    found.push({ bulan_ke: bk, label: MONTHS[bk - 1].replace(/^./, s => s.toUpperCase()), realisasi, target: tgtCol >= 0 ? cellNum(grid[r][tgtCol]) : null, source: sanitizeImportText(`${sheetName}!baris ${r + 1}`) });
  }
  return found.length >= 6 ? found : null;
}

// Layout RAKOR: 1 bulan/sheet, baris PAD (4.1) → penerimaan bulan itu.
function parseRakor(grid: Grid, sheetName: string, warnings: string[]): ParsedPendMonth | null {
  const headerRow = grid.findIndex(row => row.some(c => /uraian/i.test(cellStr(c))) && row.some(c => /penerimaan|realisa/i.test(cellStr(c))));
  const hStart = headerRow >= 0 ? headerRow : 6;
  const hEnd   = hStart + 2;
  const headers = colHeaders(grid, hStart, hEnd);

  const kodeCol   = findCol(headers, h => /rekening|kode/.test(h));
  const uraianCol = findCol(headers, h => /uraian/.test(h));
  const tgtCol    = findCol(headers, h => /anggaran/.test(h) && !/perubahan/.test(h) && !/penerimaan/.test(h));
  const excluded  = (c: number) => c === kodeCol || c === uraianCol || c === tgtCol;
  // kolom realisasi bulan ini: header memuat nama bulan; else penerimaan incremental.
  // WAJIB bukan kolom kode/uraian/target.
  let monthCol = findCol(headers, h => monthFromText(h) != null && !/s\.?d|lalu|total/.test(h));
  if (monthCol >= 0 && excluded(monthCol)) monthCol = -1;
  let bulanKe = monthCol >= 0 ? monthFromText(headers[monthCol]) : null;
  if (monthCol < 0) {
    for (let c = 0; c < headers.length; c++) {
      if (excluded(c)) continue;
      if (/penerimaan/.test(headers[c]) && !/s\.?d|s\/d|lalu|total/.test(headers[c])) { monthCol = c; break; }
    }
    bulanKe = monthFromText(sheetName) ?? monthFromText(grid.slice(0, 6).map(r => r.map(cellStr).join(' ')).join(' '));
  }
  if (monthCol < 0 || !bulanKe || uraianCol < 0) return null;

  // Baris PAD (4.1) / "PENDAPATAN ASLI DAERAH"
  let padRow = -1;
  for (let r = hEnd; r < grid.length; r++) {
    const kode = kodeCol >= 0 ? cellStr(grid[r][kodeCol]) : '';
    const ur   = cellStr(grid[r][uraianCol]).toUpperCase();
    if (kode === '4.1' || /PENDAPATAN ASLI DAERAH/.test(ur)) { padRow = r; break; }
  }
  const sName = sanitizeImportText(sheetName);
  if (padRow < 0) { warnings.push(`Sheet "${sName}": baris PAD (4.1) tidak ditemukan — dilewati.`); return null; }

  const realisasi = cellNum(grid[padRow][monthCol]);
  if (realisasi == null) { warnings.push(`Sheet "${sName}": nilai penerimaan bulan tidak terbaca — dilewati.`); return null; }
  const target = tgtCol >= 0 ? cellNum(grid[padRow][tgtCol]) : null;
  return { bulan_ke: bulanKe, label: MONTHS[bulanKe - 1].replace(/^./, s => s.toUpperCase()), realisasi, target, source: `${sName}!PAD kol ${monthCol + 1}` };
}

/** Parse buffer xlsx → baris pendapatan per bulan. Tidak melempar; balikkan warnings. */
export async function parsePendapatanBuffer(buf: Buffer): Promise<ParsePendResult> {
  const wb = new ExcelJS.Workbook();
  const warnings: string[] = [];
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  assertSheetCap(wb);
  const byMonth = new Map<number, ParsedPendMonth>();
  wb.eachSheet((ws) => {
    if ((ws.rowCount || 0) === 0) return;
    const grid = sheetGrid(ws);
    const simple = parseSimple(grid, ws.name);
    if (simple) { for (const m of simple) if (!byMonth.has(m.bulan_ke)) byMonth.set(m.bulan_ke, m); return; }
    const rakor = parseRakor(grid, ws.name, warnings);
    if (rakor && !byMonth.has(rakor.bulan_ke)) byMonth.set(rakor.bulan_ke, rakor);
  });

  const months = [...byMonth.values()].sort((a, b) => a.bulan_ke - b.bulan_ke);
  if (months.length === 0) warnings.push('Tidak ada data pendapatan bulanan yang dikenali. Pastikan ada baris PAD (4.1) atau kolom Realisasi/Bulan.');
  return { months, warnings };
}

// ─── IK-4: Parser realisasi BELANJA (all-leaf, section-aware) ────────────────
// Kumpulkan baris LEAF (paling dalam, anti dobel-hitung) lintas blok DPA / sheet,
// + realisasi BULAN INI (incremental, gabungan kolom bila terpisah SPM-LS/GU).
export interface BelanjaLeaf {
  kode:       string;
  keterangan: string;
  realisasi:  number;   // bulan ini (incremental)
  bulan_ke:   number;
  source:     string;
}

function parseBelanjaSheet(grid: Grid, sheetName: string, warnings: string[]): BelanjaLeaf[] {
  const uraianRow = grid.findIndex(row => row.some(c => /uraian/i.test(cellStr(c))));
  if (uraianRow < 0) return [];
  // header belanja sering merge 2–3 baris ("REALISASI"/"BULAN"/"INI" vertikal)
  const headers = colHeaders(grid, uraianRow - 2, uraianRow + 3);
  const kodeCol   = findCol(headers, h => /rekening|kode/.test(h));
  const uraianCol = findCol(headers, h => /uraian/.test(h));
  if (uraianCol < 0) return [];

  const sName = sanitizeImportText(sheetName);
  const bulanKe = monthFromText(sheetName) ?? monthFromText(grid.slice(0, 6).map(r => r.map(cellStr).join(' ')).join(' '));
  if (!bulanKe) { warnings.push(`Sheet "${sName}": bulan tak terdeteksi — dilewati.`); return []; }

  // kolom realisasi BULAN INI (incremental): header memuat "bulan ini" & bukan
  // s/d, bulan lalu, total/jumlah, sisa, anggaran, persen. APBD bisa 2 kolom
  // (SPM-LS + GU) → dijumlah.
  const blnCols: number[] = [];
  headers.forEach((h, c) => {
    if (c === kodeCol || c === uraianCol) return;
    if (/bulan ini/.test(h) && !/s\.?d|s\/d|lalu|jumlah|total|sisa|anggaran|prosen|%/.test(h)) blnCols.push(c);
  });
  if (blnCols.length === 0) { warnings.push(`Sheet "${sName}": kolom realisasi bulan ini tak ditemukan — dilewati.`); return []; }

  const kc = kodeCol >= 0 ? kodeCol : 0;
  const all: { kode: string; ur: string; real: number }[] = [];
  for (let r = uraianRow + 1; r < grid.length; r++) {
    const kode = cellStr(grid[r][kc]);
    if (!/^\d+(\.\d+)+$/.test(kode)) continue;          // skip judul DPA / JUMLAH / ttd
    const ur = cellStr(grid[r][uraianCol]);
    if (!ur) continue;
    let real = 0;
    for (const c of blnCols) { const n = cellNum(grid[r][c]); if (n != null) real += n; }
    all.push({ kode, ur, real });
  }
  // leaf = tidak ada kode lain yang berawalan `kode.` (induk = agregat, dibuang)
  const isLeaf = (kode: string) => !all.some(x => x.kode !== kode && x.kode.startsWith(kode + '.'));
  return all.filter(x => isLeaf(x.kode)).map(x => ({
    kode: x.kode, keterangan: sanitizeImportText(x.ur), realisasi: x.real, bulan_ke: bulanKe,
    source: sanitizeImportText(`${sheetName}!${x.kode}`),
  }));
}

/** Parse buffer xlsx belanja → baris leaf realisasi bulan-ini. Tidak melempar. */
export async function parseBelanjaBuffer(buf: Buffer): Promise<{ rows: BelanjaLeaf[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  const warnings: string[] = [];
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  assertSheetCap(wb);
  const rows: BelanjaLeaf[] = [];
  wb.eachSheet((ws) => {
    if ((ws.rowCount || 0) === 0) return;
    rows.push(...parseBelanjaSheet(sheetGrid(ws), ws.name, warnings));
  });
  if (rows.length === 0) warnings.push('Tidak ada baris belanja yang dikenali (pastikan ada kolom Realisasi Bulan Ini).');
  return { rows, warnings };
}
