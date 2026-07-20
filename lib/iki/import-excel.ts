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

function sheetGrid(ws: ExcelJS.Worksheet): Grid {
  const grid: Grid = [];
  const maxR = Math.min(ws.rowCount || 0, MAX_SCAN_ROWS);
  const maxC = Math.min(ws.columnCount || 0, MAX_SCAN_COLS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const arr: string[] = [];
    for (let c = 1; c <= maxC; c++) arr.push(cellText(row.getCell(c)));
    grid.push(arr);
  }
  return grid;
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

function headerTexts(grid: Grid, rHead: number): Map<number, string> {
  const out = new Map<number, string>();
  for (let r = rHead; r < Math.min(rHead + 2, grid.length); r++) {
    grid[r].forEach((v, c) => {
      if (v && !out.has(c)) out.set(c, v);
      else if (v && out.has(c) && !out.get(c)!.includes(v)) out.set(c, out.get(c) + ' ' + v);
    });
  }
  return out;
}

function resolveColumns(grid: Grid, rHead: number, dataStart: number, warnings: string[]): ColMap | null {
  const heads = headerTexts(grid, rHead);
  const colsBy = (re: RegExp, exclude?: RegExp) =>
    [...heads.entries()].filter(([, t]) => re.test(t) && !(exclude && exclude.test(t))).map(([c]) => c);

  const noCol = colsBy(/^no\.?\s*$/i)[0];
  const rhkiCols = colsBy(/diintervensi/i);
  const rhkCols = colsBy(/rencana hasil kerja/i, /diintervensi/i);
  const indSpan = colsBy(/indikator kinerja/i, /rencana hasil/i);
  const ttCol = colsBy(/target tahunan/i)[0];
  const formCol = colsBy(/formulasi/i)[0];
  const twSpan = colsBy(/target triwulan/i);
  const aksiSpan = colsBy(/rencana aksi/i);
  const uraianCol = colsBy(/^.*\buraian\b.*$/i).find(c => aksiSpan.includes(c) || c > (twSpan[twSpan.length - 1] ?? 0));

  if (noCol === undefined || rhkCols.length === 0 || indSpan.length === 0 || twSpan.length === 0) {
    warnings.push('Header FORM tidak lengkap (butuh kolom No / Rencana Hasil Kerja / Indikator / Target Triwulan).');
    return null;
  }

  // Bedakan kolom dalam span dari pola isi (sampel 30 baris data pertama)
  const sample = grid.slice(dataStart, dataStart + 30);
  const score = (col: number, re: RegExp) => sample.filter(row => re.test(row[col] ?? '')).length;

  const aspekCol = [...indSpan, ...rhkCols].sort((a, b) => score(b, RE_ASPEK_CELL) - score(a, RE_ASPEK_CELL))[0];
  const indikatorCol = indSpan.filter(c => c !== aspekCol).sort((a, b) => score(b, /\S/) - score(a, /\S/))[0] ?? indSpan[0];
  const rhkCol = rhkCols.filter(c => c !== aspekCol)[0] ?? rhkCols[0];

  const romawiCol = twSpan.sort((a, b) => score(b, /^(I|II|III|IV)$/) - score(a, /^(I|II|III|IV)$/))[0];
  const caraCol = twSpan.filter(c => c !== romawiCol).sort((a, b) => score(b, RE_ASPEK_B) - score(a, RE_ASPEK_B))[0];
  const targetTwCol = twSpan.filter(c => c !== romawiCol && c !== caraCol).sort((a, b) => score(b, /\S/) - score(a, /\S/))[0];

  const uraian = uraianCol ?? aksiSpan[0];
  const targetAksiCol = [...heads.entries()]
    .filter(([c, t]) => c !== uraian && c > (romawiCol ?? 0) && /target/i.test(t) && !/tahunan|triwulan/i.test(t))
    .map(([c]) => c)
    .sort((a, b) => b - a)[0] ?? Math.max(...aksiSpan, uraian ?? 0) + 1;

  if (score(romawiCol, /^(I|II|III|IV)$/) === 0) {
    warnings.push('Kolom romawi triwulan tidak terdeteksi isinya — TW akan diinfer dari posisi baris.');
  }

  return {
    no: noCol,
    rhki: rhkiCols[0] ?? null,
    rhk: rhkCol,
    aspek: aspekCol,
    indikator: indikatorCol,
    targetTahunan: ttCol ?? -1,
    formulasi: formCol ?? -1,
    caraHitung: caraCol ?? null,
    romawi: romawiCol,
    targetTw: targetTwCol ?? -1,
    uraian: uraian ?? -1,
    targetAksi: targetAksiCol,
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function parseIkiExcel(buf: Buffer): Promise<ImportIkiResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS)
    throw new Error(`File punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);

  // Pilih sheet yang punya blok FORM INDIKATOR (kalibrasi: selalu sheet "Langsung")
  let ws: ExcelJS.Worksheet | undefined;
  let grid: Grid | null = null;
  for (const w of wb.worksheets) {
    const g = sheetGrid(w);
    if (findRow(g, /FORM INDIKATOR/i) >= 0) { ws = w; grid = g; break; }
  }
  if (!ws || !grid) throw new Error('Blok "FORM INDIKATOR KINERJA INDIVIDU" tidak ditemukan di sheet mana pun. Pastikan file berformat IKI.');

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

  const cols = resolveColumns(grid, rHead, dataStart, warnings);
  if (!cols) throw new Error('Struktur kolom FORM tidak dikenali. ' + warnings[warnings.length - 1]);
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
    warnings,
    source: `Sheet "${ws.name}"`,
  };
}
