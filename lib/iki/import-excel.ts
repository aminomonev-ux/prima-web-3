// lib/iki/import-excel.ts — Parser file Excel dokumen IKI (format "VERSI BPSDMD").
// Server-only, PURE terhadap I/O: terima Buffer, balikkan struktur dokumen + warnings;
// TIDAK menulis DB (pola kinerja-import / pk/import-pejabat). Dikalibrasi terhadap
// 20 file asli IKI STRUKTURAL FINAL 2026 (survei 2026-07-20):
//  • blok "DATA PRIBADI" label:nilai → OPD/Nama/NIP/Jabatan/Ikhtisar
//  • blok "FORM INDIKATOR" header merge → tiap baris = 1 triwulan, 4 baris = 1 RHK,
//    grup by kolom No (grup multi-RHK = kelipatan 4)
//  • kolom dalam span merge dibedakan dari POLA ISI (aspek "a..b..c." vs indikator;
//    romawi vs cara-hitung vs nilai target) — bukan posisi huruf kolom mati
//  • anomali nyata yang ditangani: romawi kosong (infer posisi), NIP kotor,
//    angka numeric berformat persen (numFmt), typo "Ekspetasi", TTD campur aduk
//    (hanya diambil hint jabatan atasan — data atasan dari Master PK di preview)

import ExcelJS from 'exceljs';

export interface ImportIkiTriwulan {
  triwulan: 1 | 2 | 3 | 4;
  target_tw: string;
  uraian: string | null;
  target_aksi: string;
}
export interface ImportIkiRhk {
  rhk: string;
  aspek_a: string;
  aspek_b: string;
  aspek_c: string;
  indikator: string;
  target_tahunan: string;
  formulasi: string | null;
  ekspektasi: string | null;
  triwulan: ImportIkiTriwulan[];
}
export interface ImportIkiGroup {
  rhk_intervensi: string | null;
  rhkList: ImportIkiRhk[];
}
export type ImportColField =
  | 'no' | 'rhk_intervensi' | 'rhk' | 'aspek' | 'indikator' | 'target_tahunan'
  | 'formulasi' | 'romawi' | 'target_tw' | 'uraian' | 'target_aksi';
export type ImportColSource = 'anchor' | 'header' | 'manual' | 'fallback';
export interface ImportColReport {
  field: ImportColField;
  /** Nomor kolom Excel 1-based (null = tidak terdeteksi) */
  col: number | null;
  header: string;
  sample: string;
  source: ImportColSource;
}
export interface ImportColOption { col: number; header: string; sample: string }
export type ImportColOverrides = Partial<Record<ImportColField, number>>;

export interface ImportIkiResult {
  varian: 'STANDAR' | 'DIREKTUR';
  opd: string;
  nama: string;
  nip: string;
  jabatan: string;
  ikhtisar: string | null;
  /** Jabatan atasan dari blok "Mengetahui" — hint matching Master PK, bukan sumber data */
  atasanJabatanHint: string | null;
  groups: ImportIkiGroup[];
  /** Hasil deteksi kolom per field — bahan panel pemetaan di preview */
  columns: ImportColReport[];
  /** Semua kolom yang punya header/isi — pilihan override manual */
  columnOptions: ImportColOption[];
  warnings: string[];
  source: string;
}

// L67 anti zip-bomb + cap sesuai Zod (RhkSchema max 50 baris RHK)
const MAX_SHEETS = 10;
const MAX_SCAN_ROWS = 300;
const MAX_SCAN_COLS = 30;
const MAX_RHK_TOTAL = 50;

const LEN = { nama: 255, jabatan: 255, opd: 255, nip: 50, ikhtisar: 4000, rhk: 500, indikator: 500, intervensi: 500, target: 50, aspek: 50, long: 2000 };

function sanitize(s: string, maxLen: number): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x2028 || c === 0x2029 || c === 0xFEFF) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
    if ('text' in o) return o.text;
  }
  return v;
}

// numFmt-aware: 0.37 berformat persen → "37%"; desimal lain pakai koma (gaya file)
function cellText(cell: ExcelJS.Cell): string {
  const v = unwrap(cell.value);
  if (v == null) return '';
  if (typeof v === 'number') {
    if (/%/.test(cell.numFmt ?? '')) {
      const p = Math.round(v * 10000) / 100;
      return String(p).replace('.', ',') + '%';
    }
    return (Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)).replace('.', ',');
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

const ROMAWI_MAP: Record<string, 1 | 2 | 3 | 4> = { I: 1, II: 2, III: 3, IV: 4 };
const RE_ASPEK_CELL = /a\.?\s*(.+?)\s*b\.?\s*(.+?)\s*c\.?\s*(.+)$/i;
const RE_ASPEK_B = /(akumulatif|progres\s*positif|progres\s*negatif|pengulangan)/i;
// "Ekspetasi" = typo konsisten di file asli
const RE_EKSPEKTASI = /eksp[ea]ktasi(\s+pimpinan)?\s*:?\s*/i;
// Pola nilai target: "1 Dokumen" / "100%" / "12" / "3,5" — untuk content voting
const RE_TARGETISH = /^\d+([.,]\d+)?\s*(%|\p{L}[\s\S]{0,24})?$/u;

function normalizeAspekB(raw: string): string | null {
  const m = raw.match(RE_ASPEK_B);
  if (!m) return null;
  const t = m[1].toLowerCase().replace(/\s+/g, ' ');
  if (t === 'akumulatif') return 'Akumulatif';
  if (t === 'progres positif') return 'Progres Positif';
  if (t === 'progres negatif') return 'Progres Negatif';
  return 'Pengulangan';
}

type Grid = string[][];

// grid = nilai warisan merge (data dibaca dari sini); raw = hanya sel master
// merge (untuk hierarki header & baris penomoran — teks induk tidak "menular")
function sheetGrid(ws: ExcelJS.Worksheet): { grid: Grid; raw: Grid } {
  const grid: Grid = [];
  const raw: Grid = [];
  const maxR = Math.min(ws.rowCount || 0, MAX_SCAN_ROWS);
  const maxC = Math.min(ws.columnCount || 0, MAX_SCAN_COLS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const arr: string[] = [];
    const arrRaw: string[] = [];
    for (let c = 1; c <= maxC; c++) {
      const cell = row.getCell(c);
      const t = cellText(cell);
      arr.push(t);
      arrRaw.push(!cell.isMerged || cell.master === cell ? t : '');
    }
    grid.push(arr);
    raw.push(arrRaw);
  }
  return { grid, raw };
}

function findRow(grid: Grid, re: RegExp, from = 0): number {
  for (let r = from; r < grid.length; r++) if (grid[r].some(x => re.test(x))) return r;
  return -1;
}

// ─── Data Pribadi ───────────────────────────────────────────────────────────

const DP_LABELS: Array<{ key: 'opd' | 'nama' | 'nip' | 'jabatan' | 'ikhtisar'; re: RegExp }> = [
  { key: 'opd',      re: /^opd\b/i },
  { key: 'nama',     re: /^nama\b/i },
  { key: 'nip',      re: /^nip\b/i },
  { key: 'jabatan',  re: /^jabatan\b/i },
  { key: 'ikhtisar', re: /^ikhtisar/i },
];

function parseDataPribadi(grid: Grid, rDP: number, rEnd: number, warnings: string[]) {
  const dp = { opd: '', nama: '', nip: '', jabatan: '', ikhtisar: '' };
  for (let r = rDP + 1; r < Math.min(rEnd < 0 ? rDP + 12 : rEnd, grid.length); r++) {
    const cells = grid[r].map((v, c) => ({ v, c })).filter(x => x.v);
    if (!cells.length) continue;
    const label = DP_LABELS.find(l => l.re.test(cells[0].v));
    if (!label) continue;
    const val = cells.find(x => x.c > cells[0].c && x.v !== ':')?.v ?? '';
    dp[label.key] = val;
  }
  if (!dp.nama) warnings.push('Nama tidak ditemukan di blok Data Pribadi.');
  if (!dp.jabatan) warnings.push('Jabatan tidak ditemukan di blok Data Pribadi.');
  const nipDigits = dp.nip.replace(/\D/g, '');
  if (dp.nip && nipDigits.length !== 18) warnings.push(`NIP "${dp.nip}" bukan 18 digit — periksa sebelum simpan.`);
  return dp;
}

// ─── Kolom form ─────────────────────────────────────────────────────────────

interface ColMap {
  no: number; rhki: number | null; rhk: number; aspek: number; indikator: number;
  targetTahunan: number; formulasi: number; caraHitung: number | null;
  romawi: number; targetTw: number; uraian: number; targetAksi: number;
}
type InternalKey = Exclude<keyof ColMap, 'caraHitung'>;

const FIELD_META: Array<{ key: InternalKey; pub: ImportColField; verify?: RegExp; required?: boolean }> = [
  { key: 'no',            pub: 'no',              verify: /^\d+$/, required: true },
  { key: 'rhki',          pub: 'rhk_intervensi' },
  { key: 'rhk',           pub: 'rhk',             required: true },
  { key: 'aspek',         pub: 'aspek',           verify: RE_ASPEK_CELL },
  { key: 'indikator',     pub: 'indikator',       required: true },
  { key: 'targetTahunan', pub: 'target_tahunan',  verify: RE_TARGETISH },
  { key: 'formulasi',     pub: 'formulasi' },
  { key: 'romawi',        pub: 'romawi',          verify: /^(I|II|III|IV)$/ },
  { key: 'targetTw',      pub: 'target_tw',       verify: RE_TARGETISH, required: true },
  { key: 'uraian',        pub: 'uraian' },
  { key: 'targetAksi',    pub: 'target_aksi',     verify: RE_TARGETISH },
];

// Jangkar baris penomoran kolom "1 2 … 11" — layout baku VERSI BPSDMD STANDAR
const ANCHOR_STANDAR: Record<number, InternalKey> = {
  1: 'no', 2: 'rhki', 3: 'rhk', 4: 'aspek', 5: 'indikator', 6: 'targetTahunan',
  7: 'formulasi', 8: 'romawi', 9: 'targetTw', 10: 'uraian', 11: 'targetAksi',
};

interface ResolvedColumns {
  cols: ColMap;
  report: ImportColReport[];
  options: ImportColOption[];
}

function resolveColumns(
  grid: Grid, raw: Grid, rHead: number, rNum: number, dataStart: number,
  warnings: string[], overrides?: ImportColOverrides,
): ResolvedColumns | null {
  // Header sadar-merge: induk = baris rHead (warisan merge OK), anak = baris
  // rHead+1 HANYA sel master — teks induk merge tidak menular ke label anak
  const maxC = Math.max(...grid.slice(rHead, rHead + 2).map(r => r.length), 0);
  const label = (c: number): string => {
    const parent = grid[rHead]?.[c] ?? '';
    const childRaw = rHead + 1 !== rNum ? (raw[rHead + 1]?.[c] ?? '') : '';
    const child = /^\d+$/.test(childRaw) ? '' : childRaw;
    if (child && child !== parent) return parent ? `${parent} › ${child}` : child;
    return parent;
  };
  const heads = new Map<number, string>();
  for (let c = 0; c < maxC; c++) { const t = label(c); if (t) heads.set(c, t); }

  const colsBy = (re: RegExp, exclude?: RegExp) =>
    [...heads.entries()].filter(([, t]) => re.test(t) && !(exclude && exclude.test(t))).map(([c]) => c);

  // Bedakan kolom dalam span dari pola isi (sampel 30 baris data pertama)
  const sample = grid.slice(dataStart, dataStart + 30);
  const score = (col: number, re: RegExp) => sample.filter(row => re.test(row[col] ?? '')).length;

  // ── Lapis 1: deteksi header + content voting (fallback universal) ──
  const noCol = colsBy(/^no\.?\s*$/i)[0];
  const rhkiCols = colsBy(/diintervensi/i);
  const rhkCols = colsBy(/rencana hasil kerja/i, /diintervensi/i);
  const indSpan = colsBy(/indikator kinerja/i, /rencana hasil/i);
  const ttCol = colsBy(/target tahunan/i)[0];
  const formCol = colsBy(/formulasi/i)[0];
  const twSpan = colsBy(/target triwulan/i);
  const aksiSpan = colsBy(/rencana aksi/i);
  const uraianCol = colsBy(/\buraian\b/i).find(c => aksiSpan.includes(c) || c > (twSpan[twSpan.length - 1] ?? 0));

  if (noCol === undefined || rhkCols.length === 0 || indSpan.length === 0 || twSpan.length === 0) {
    warnings.push('Header FORM tidak lengkap (butuh kolom No / Rencana Hasil Kerja / Indikator / Target Triwulan).');
    return null;
  }

  const aspekCol = [...indSpan, ...rhkCols].sort((a, b) => score(b, RE_ASPEK_CELL) - score(a, RE_ASPEK_CELL))[0];
  const indikatorCol = indSpan.filter(c => c !== aspekCol).sort((a, b) => score(b, /\S/) - score(a, /\S/))[0] ?? indSpan[0];
  const rhkCol = rhkCols.filter(c => c !== aspekCol)[0] ?? rhkCols[0];
  const romawiCol = twSpan.sort((a, b) => score(b, /^(I|II|III|IV)$/) - score(a, /^(I|II|III|IV)$/))[0];
  const caraCol = twSpan.filter(c => c !== romawiCol).sort((a, b) => score(b, RE_ASPEK_B) - score(a, RE_ASPEK_B))[0];
  const targetTwCol = twSpan.filter(c => c !== romawiCol && c !== caraCol).sort((a, b) => score(b, /\S/) - score(a, /\S/))[0];
  const uraian = uraianCol ?? aksiSpan[0];
  const targetAksiCol = aksiSpan.find(c => c !== uraian && /target/i.test(heads.get(c) ?? ''))
    ?? [...heads.entries()]
      .filter(([c, t]) => c !== uraian && c > (romawiCol ?? 0) && /target/i.test(t) && !/tahunan|triwulan/i.test(t))
      .map(([c]) => c)
      .sort((a, b) => b - a)[0]
    ?? aksiSpan.filter(c => c !== uraian).sort((a, b) => score(b, RE_TARGETISH) - score(a, RE_TARGETISH))[0];

  const headerPick: Partial<Record<InternalKey, number>> = {
    no: noCol, rhki: rhkiCols[0], rhk: rhkCol, aspek: aspekCol, indikator: indikatorCol,
    targetTahunan: ttCol, formulasi: formCol, romawi: romawiCol, targetTw: targetTwCol,
    uraian, targetAksi: targetAksiCol,
  };

  // ── Lapis 2: jangkar penomoran kolom (baris "1 2 … 11", sel master saja) ──
  const anchorPick: Partial<Record<InternalKey, number>> = {};
  if (rNum >= 0) {
    const numToCol = new Map<number, number>();
    (raw[rNum] ?? []).forEach((v, c) => {
      if (/^\d+$/.test(v)) { const n = Number(v); if (!numToCol.has(n)) numToCol.set(n, c); }
    });
    const nums = [...numToCol.keys()];
    if (nums.length >= 10 && Math.max(...nums) === 11) {
      for (const [n, key] of Object.entries(ANCHOR_STANDAR)) {
        const col = numToCol.get(Number(n));
        if (col !== undefined) anchorPick[key] = col;
      }
    }
  }

  // ── Komposisi: manual > jangkar > header; kandidat wajib lolos verifikasi isi
  // (field ber-regex: pola cocok; lainnya: minimal ada isi — sel master merge
  // horizontal bisa kosong padahal datanya di kolom sebelah) ──
  const verified = (col: number | undefined, re?: RegExp) =>
    col !== undefined && score(col, re ?? /\S/) > 0;
  const resolved: Partial<Record<InternalKey, number>> = {};
  const report: ImportColReport[] = [];
  for (const f of FIELD_META) {
    let col: number | undefined;
    let source: ImportColSource;
    const ovr = overrides?.[f.pub];
    if (ovr !== undefined) { col = ovr - 1; source = 'manual'; }
    else if (verified(anchorPick[f.key], f.verify)) { col = anchorPick[f.key]; source = 'anchor'; }
    else if (verified(headerPick[f.key], f.verify)) { col = headerPick[f.key]; source = 'header'; }
    else {
      col = headerPick[f.key] ?? anchorPick[f.key];
      source = 'fallback';
      if (col !== undefined && f.verify) warnings.push(`Kolom ${f.pub} (kolom Excel ${col + 1}) tidak cocok pola isi — periksa pemetaan kolom.`);
    }
    resolved[f.key] = col;
    const sampleVal = col !== undefined ? (sample.map(row => row[col!] ?? '').find(v => v) ?? '') : '';
    report.push({
      field: f.pub,
      col: col !== undefined ? col + 1 : null,
      header: col !== undefined ? (heads.get(col) ?? '') : '',
      sample: sanitize(sampleVal, 60),
      source,
    });
    if (f.required && col === undefined) {
      warnings.push(`Kolom wajib ${f.pub} tidak terdeteksi.`);
      return null;
    }
  }

  if (resolved.romawi !== undefined && score(resolved.romawi, /^(I|II|III|IV)$/) === 0) {
    warnings.push('Kolom romawi triwulan tidak terdeteksi isinya — TW akan diinfer dari posisi baris.');
  }

  // Pilihan kolom untuk override manual di preview
  const options: ImportColOption[] = [];
  const optMax = Math.max(maxC, ...sample.map(r => r.length));
  for (let c = 0; c < optMax; c++) {
    const h = heads.get(c) ?? '';
    const s = sample.map(row => row[c] ?? '').find(v => v) ?? '';
    if (h || s) options.push({ col: c + 1, header: sanitize(h, 80), sample: sanitize(s, 60) });
  }

  return {
    cols: {
      no: resolved.no!,
      rhki: resolved.rhki ?? null,
      rhk: resolved.rhk!,
      aspek: resolved.aspek ?? -1,
      indikator: resolved.indikator!,
      targetTahunan: resolved.targetTahunan ?? -1,
      formulasi: resolved.formulasi ?? -1,
      caraHitung: caraCol ?? null,
      romawi: resolved.romawi ?? -1,
      targetTw: resolved.targetTw!,
      uraian: resolved.uraian ?? -1,
      targetAksi: resolved.targetAksi ?? -1,
    },
    report,
    options,
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function parseIkiExcel(buf: Buffer, overrides?: ImportColOverrides): Promise<ImportIkiResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS)
    throw new Error(`File punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);

  // Pilih sheet yang punya blok FORM INDIKATOR (kalibrasi: selalu sheet "Langsung")
  let ws: ExcelJS.Worksheet | undefined;
  let grid: Grid | null = null;
  let raw: Grid | null = null;
  for (const w of wb.worksheets) {
    const g = sheetGrid(w);
    if (findRow(g.grid, /FORM INDIKATOR/i) >= 0) { ws = w; grid = g.grid; raw = g.raw; break; }
  }
  if (!ws || !grid || !raw) throw new Error('Blok "FORM INDIKATOR KINERJA INDIVIDU" tidak ditemukan di sheet mana pun. Pastikan file berformat IKI.');

  const warnings: string[] = [];
  const rForm = findRow(grid, /FORM INDIKATOR/i);
  const rDP = findRow(grid, /DATA PRIBADI/i);
  if (rDP < 0) warnings.push('Blok DATA PRIBADI tidak ditemukan — isi identitas manual di preview.');
  const dpRaw = rDP >= 0 ? parseDataPribadi(grid, rDP, rForm, warnings) : { opd: '', nama: '', nip: '', jabatan: '', ikhtisar: '' };

  const rHead = findRow(grid, /rencana hasil kerja/i, rForm + 1);
  if (rHead < 0) throw new Error('Header tabel FORM tidak ditemukan (kolom "Rencana Hasil Kerja").');
  // Baris penomoran kolom ("1 2 3 …") menandai akhir header
  let rNum = -1;
  for (let r = rHead + 1; r < Math.min(rHead + 5, grid.length); r++) {
    if (grid[r].filter(x => /^\d+$/.test(x)).length >= 5) { rNum = r; break; }
  }
  const dataStart = (rNum >= 0 ? rNum : rHead + 1) + 1;

  const resolvedCols = resolveColumns(grid, raw, rHead, rNum, dataStart, warnings, overrides);
  if (!resolvedCols) throw new Error('Struktur kolom FORM tidak dikenali. ' + warnings[warnings.length - 1]);
  const { cols, report, options } = resolvedCols;
  const varian: 'STANDAR' | 'DIREKTUR' = cols.rhki !== null ? 'STANDAR' : 'DIREKTUR';

  // Batas bawah data = blok TTD
  let rEnd = grid.length;
  let atasanJabatanHint: string | null = null;
  for (let r = dataStart; r < grid.length; r++) {
    if (grid[r].some(x => /^Mengetahui/i.test(x) || /^Semarang\s*,/i.test(x))) {
      rEnd = r;
      const jabRow = grid[r + 1] ?? [];
      atasanJabatanHint = sanitize(jabRow.find(x => x && !/^Semarang/i.test(x)) ?? '', LEN.jabatan) || null;
      break;
    }
  }

  // ── Baris data → grup → RHK → TW ──
  const get = (row: string[], c: number) => (c >= 0 ? (row[c] ?? '') : '');
  type Flat = { no: string; rhki: string; rhk: string; aspek: string; indikator: string; tt: string; form: string; cara: string; romawi: string; ttw: string; uraian: string; taksi: string };
  const flats: Flat[] = [];
  let lastNo = '';
  for (let r = dataStart; r < rEnd; r++) {
    const row = grid[r];
    if (!row.some(x => x)) continue;
    const no = /^\d+$/.test(get(row, cols.no)) ? get(row, cols.no) : lastNo;
    if (!no) continue;
    lastNo = no;
    flats.push({
      no,
      rhki: cols.rhki !== null ? get(row, cols.rhki) : '',
      rhk: get(row, cols.rhk),
      aspek: get(row, cols.aspek),
      indikator: get(row, cols.indikator),
      tt: get(row, cols.targetTahunan),
      form: get(row, cols.formulasi),
      cara: cols.caraHitung !== null ? get(row, cols.caraHitung) : '',
      romawi: get(row, cols.romawi),
      ttw: get(row, cols.targetTw),
      uraian: get(row, cols.uraian),
      taksi: get(row, cols.targetAksi),
    });
  }
  if (flats.length === 0) throw new Error('Tidak ada baris data RHK terbaca di bawah header FORM.');

  const groups: ImportIkiGroup[] = [];
  let totalRhk = 0;
  const groupNos = [...new Set(flats.map(f => f.no))];
  for (const no of groupNos) {
    const rows = flats.filter(f => f.no === no);
    const group: ImportIkiGroup = {
      rhk_intervensi: varian === 'STANDAR' ? (sanitize(rows[0].rhki, LEN.intervensi) || null) : null,
      rhkList: [],
    };
    let cur: ImportIkiRhk | null = null;
    let curKey = '';
    for (const f of rows) {
      // 1 RHK = rentetan baris dengan teks rhk+indikator sama; ganti teks (atau
      // sudah 4 TW) = RHK baru — sel merge vertikal mengulang nilai per baris
      const key = `${f.rhk}|${f.indikator}`;
      if (!cur || key !== curKey || cur.triwulan.length >= 4) {
        if (totalRhk >= MAX_RHK_TOTAL) { warnings.push(`RHK melebihi ${MAX_RHK_TOTAL} — sisanya dilewati.`); break; }
        const aspekMatch = f.aspek.match(RE_ASPEK_CELL);
        const aspekB = normalizeAspekB(f.aspek) ?? normalizeAspekB(f.cara);
        if (!aspekB) warnings.push(`Grup ${no}: cara hitung tidak dikenali ("${f.cara || f.aspek}") — default Akumulatif.`);
        let formulasi: string | null = null;
        let ekspektasi: string | null = null;
        if (f.form) {
          const split = f.form.split(RE_EKSPEKTASI);
          formulasi = sanitize(split[0].replace(/^f?a?ormulasi\s*:?\s*/i, ''), LEN.long) || null;
          ekspektasi = split.length > 2 ? sanitize(split[split.length - 1], LEN.long) || null : null;
        }
        cur = {
          rhk: sanitize(f.rhk, LEN.rhk),
          aspek_a: sanitize(aspekMatch?.[1] ?? 'Kuantitatif', LEN.aspek) || 'Kuantitatif',
          aspek_b: aspekB ?? 'Akumulatif',
          aspek_c: /penunjang/i.test(f.aspek) ? 'Penunjang' : 'Utama',
          indikator: sanitize(f.indikator, LEN.indikator),
          target_tahunan: sanitize(f.tt, LEN.target),
          formulasi,
          ekspektasi,
          triwulan: [],
        };
        curKey = key;
        group.rhkList.push(cur);
        totalRhk++;
      }
      const twNo = ROMAWI_MAP[f.romawi] ?? ((cur.triwulan.length + 1) as 1 | 2 | 3 | 4);
      if (!ROMAWI_MAP[f.romawi]) warnings.push(`Grup ${no}: baris tanpa romawi TW — diinfer sebagai TW ${twNo}.`);
      cur.triwulan.push({
        triwulan: twNo,
        target_tw: sanitize(f.ttw, LEN.target) || '0',
        uraian: sanitize(f.uraian, LEN.long) || null,
        target_aksi: sanitize(f.taksi, LEN.target) || '0',
      });
    }
    // Lengkapi TW yang hilang jadi 4 (Zod wajib 4 baris)
    for (const rhk of group.rhkList) {
      if (rhk.triwulan.length < 4) {
        const have = new Set(rhk.triwulan.map(t => t.triwulan));
        for (const t of [1, 2, 3, 4] as const) {
          if (!have.has(t)) rhk.triwulan.push({ triwulan: t, target_tw: '0', uraian: null, target_aksi: '0' });
        }
        warnings.push(`Grup ${no} "${rhk.indikator.slice(0, 40)}": TW tidak lengkap — kekurangan diisi 0.`);
      }
      rhk.triwulan.sort((a, b) => a.triwulan - b.triwulan);
      if (!rhk.rhk) warnings.push(`Grup ${no}: teks RHK kosong — wajib diisi di editor sebelum simpan.`);
    }
    if (group.rhkList.length > 0) groups.push(group);
  }
  if (groups.length === 0) throw new Error('Tidak ada grup RHK yang terbaca dari file.');

  return {
    varian,
    opd: sanitize(dpRaw.opd, LEN.opd),
    nama: sanitize(dpRaw.nama, LEN.nama),
    nip: sanitize(dpRaw.nip, LEN.nip),
    jabatan: sanitize(dpRaw.jabatan, LEN.jabatan),
    ikhtisar: sanitize(dpRaw.ikhtisar, LEN.ikhtisar) || null,
    atasanJabatanHint,
    groups,
    columns: report,
    columnOptions: options,
    warnings,
    source: `Sheet "${ws.name}"`,
  };
}
