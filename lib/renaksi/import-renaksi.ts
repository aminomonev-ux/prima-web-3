// lib/renaksi/import-renaksi.ts — Parser matriks Rencana Aksi → baris siap simpan.
// Server-only, PURE terhadap I/O (tidak menyentuh DB). Dikalibrasi terhadap
// "MATRIK RENCANA AKSI TAHUN 2026" (RSJD Amino).
//
// Deteksi kolom 3 lapis  : override manual > alias header sadar-merge > pola isi
// Deteksi level 3 sinyal : kolom terisi (indentasi matriks) · segmen kode
//                          (X.XX.01 → program, +1.10 → kegiatan, +0001 → sub) ·
//                          kata kunci. Voting; beda pendapat → tandai "perlu cek".
// Hierarki induk         : stack urutan baris (file lengkap). Baris tanpa induk
//                          di file → diselesaikan saat commit terhadap data tahun
//                          berjalan / dipilih user (file satu level).

import { readGrid, sanitize, type Grid, type GridResult } from './grid';

export type RaLevel = 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
export type RaJenis = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';

export const LEVEL_ORDER: RaLevel[] = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'];

export type ColField =
  | 'tujuan' | 'sasaran' | 'kode' | 'program' | 'kegiatan' | 'sub_kegiatan'
  | 'outcome' | 'indikator' | 'satuan' | 'target_tahunan' | 'anggaran' | 'jenis';
export type ColSource = 'header' | 'isi' | 'manual' | 'tidak-ada';
export interface ColReport { field: ColField; col: number | null; header: string; sample: string; source: ColSource }
export interface ColOption { col: number; header: string; sample: string }
export type ColOverrides = Partial<Record<ColField, number>>;

export interface ImportRaRow {
  /** Nomor baris di file — rujukan saat user mengecek */
  baris: number;
  level: RaLevel;
  level_source: 'kolom' | 'kode' | 'kata-kunci' | 'campuran' | 'lanjutan';
  /** true = sinyal tidak bulat / bersumber PDF → minta user cek */
  perlu_cek: boolean;
  kode: string | null;
  nama: string;
  induk_tujuan: string | null;
  induk_sasaran: string | null;
  induk_program: string | null;
  induk_kegiatan: string | null;
  outcome: string | null;
  indikator: string;
  satuan: string;
  jenis: RaJenis;
  target_tahunan: number;
  /** Target TW final (otoritatif) — lihat resolveQuarters untuk asal nilainya */
  q: [number, number, number, number];
  /**
   * 12 target bulanan — HANYA diisi kalau file benar-benar per bulan (nilai
   * berbeda di dalam satu triwulan). Kalibrasi 2026: file menulis nilai TW yang
   * diulang 3× (40,40,40 / 250,250,250) sebagai gaya tampilan, bukan target
   * bulanan; menyimpannya apa adanya membuat aplikasi menjumlahkan 40+40+40=120
   * untuk indikator Akumulatif. Pola berulang → simpan target TW saja.
   */
  bulan: (number | null)[] | null;
  anggaran: number | null;
  catatan: string[];
}

export interface ImportRaResult {
  rows: ImportRaRow[];
  columns: ColReport[];
  columnOptions: ColOption[];
  /** Jumlah baris per level — bahan ringkasan dampak di preview */
  levelCount: Record<RaLevel, number>;
  bulanTerbaca: boolean;
  warnings: string[];
  source: string;
  kind: 'xlsx' | 'csv' | 'pdf';
}

const LEN = { nama: 255, indikator: 500, outcome: 500, satuan: 50, kode: 60 };
const MAX_IMPORT_ROWS = 500;

const BULAN_RE = [
  /^jan/i, /^feb/i, /^mar/i, /^apr/i, /^mei|^may/i, /^jun/i,
  /^jul/i, /^ag(u|s)/i, /^sep/i, /^okt|^oct/i, /^nop|^nov/i, /^des|^dec/i,
];
const RE_JENIS = /(akumulatif|progres\s*positif|progres\s*negatif|pengulangan)/i;

function normJenis(raw: string): RaJenis | null {
  const m = raw.match(RE_JENIS);
  if (!m) return null;
  const t = m[1].toLowerCase().replace(/\s+/g, ' ');
  if (t === 'akumulatif') return 'Akumulatif';
  if (t === 'progres positif') return 'Progres Positif';
  if (t === 'progres negatif') return 'Progres Negatif';
  return 'Pengulangan';
}

/**
 * "1.234,56" / "84.5" / "7.936508" / "37%" / "N/A" → number | null.
 * Pemisah desimal ditentukan dari posisi, bukan asumsi lokal: bila kedua
 * pemisah muncul, yang TERAKHIR adalah desimal; bila hanya satu, ia dianggap
 * desimal kecuali polanya jelas pengelompokan ribuan (1.234 / 1,234,567).
 */
function toNum(raw: string): number | null {
  const s = raw.trim();
  if (!s || /^(n\/?a|-|—)$/i.test(s)) return null;
  let t = s.replace(/%/g, '').replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(t)) return null;

  const punyaTitik = t.includes('.');
  const punyaKoma = t.includes(',');
  if (punyaTitik && punyaKoma) {
    const desimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const ribuan = desimal === '.' ? ',' : '.';
    t = t.split(ribuan).join('');
    if (desimal === ',') t = t.replace(',', '.');
  } else if (punyaKoma) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.split(',').join('') : t.replace(',', '.');
  } else if (punyaTitik) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.split('.').join('');
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Jumlah segmen kode → level. X.XX.01=3 program · .1.10=5 kegiatan · .0001=6 sub */
function levelFromKode(kode: string): RaLevel | null {
  const parts = kode.split('.').filter(Boolean);
  if (parts.length < 3) return null;
  if (parts.length === 3) return 'program';
  if (parts.length <= 5) return 'kegiatan';
  return 'sub-kegiatan';
}

// ─── Kolom ──────────────────────────────────────────────────────────────────

interface ColMap {
  tujuan: number; sasaran: number; kode: number; program: number; kegiatan: number;
  sub_kegiatan: number; outcome: number; indikator: number; satuan: number;
  target_tahunan: number; anggaran: number; jenis: number;
  bulan: number[];  // 12 kolom (-1 kalau tak ada)
  tw: number[];     // 4 kolom (-1 kalau tak ada)
}

const HEADER_ALIAS: Array<{ field: ColField; re: RegExp; not?: RegExp }> = [
  { field: 'sub_kegiatan',   re: /sub\s*-?\s*keg/i },
  { field: 'kegiatan',       re: /\bkegiatan\b/i, not: /sub\s*-?\s*keg/i },
  { field: 'program',        re: /\bprogram\b/i },
  { field: 'sasaran',        re: /\bsasaran\b/i, not: /program|kegiatan/i },
  { field: 'tujuan',         re: /\btujuan\b/i },
  { field: 'kode',           re: /\bkode\b/i },
  { field: 'outcome',        re: /out\s*(put|come)/i },
  { field: 'indikator',      re: /indikator/i },
  { field: 'satuan',         re: /satuan/i },
  { field: 'jenis',          re: /jenis/i },
  { field: 'anggaran',       re: /^rp$|anggaran|pagu/i },
  { field: 'target_tahunan', re: /target/i, not: /tw|triwulan|pentahapan/i },
];

/** Label kolom sadar-merge: "induk › anak" dari baris header (anak = sel master). */
function headerLabels(grid: Grid, raw: Grid, rHead: number, span: number): Map<number, string> {
  const width = Math.max(...grid.slice(rHead, rHead + span).map(r => r.length), 0);
  const out = new Map<number, string>();
  for (let c = 0; c < width; c++) {
    const parts: string[] = [];
    for (let r = rHead; r < rHead + span && r < grid.length; r++) {
      const v = (r === rHead ? grid[r]?.[c] : raw[r]?.[c]) ?? '';
      if (v && !parts.includes(v)) parts.push(v);
    }
    const label = parts.join(' › ');
    if (label) out.set(c, label);
  }
  return out;
}

function resolveColumns(
  grid: Grid, raw: Grid, rHead: number, headSpan: number, dataStart: number,
  overrides: ColOverrides, warnings: string[],
): { cols: ColMap; report: ColReport[]; options: ColOption[] } | null {
  const heads = headerLabels(grid, raw, rHead, headSpan);
  const sample = grid.slice(dataStart, dataStart + 60);
  const score = (c: number, re: RegExp) => (c < 0 ? 0 : sample.filter(r => re.test(r[c] ?? '')).length);

  const pick: Partial<Record<ColField, number>> = {};
  const src: Partial<Record<ColField, ColSource>> = {};
  const taken = new Set<number>();

  for (const alias of HEADER_ALIAS) {
    if (pick[alias.field] !== undefined) continue;
    for (const [c, label] of heads) {
      if (taken.has(c)) continue;
      if (alias.re.test(label) && !(alias.not && alias.not.test(label))) {
        pick[alias.field] = c;
        src[alias.field] = 'header';
        taken.add(c);
        break;
      }
    }
  }

  // Bulan Jan–Des: label anak berupa nama bulan (bukan induk "TW")
  const bulan: number[] = new Array(12).fill(-1);
  for (const [c, label] of heads) {
    const leaf = label.split('›').pop()?.trim() ?? '';
    const idx = BULAN_RE.findIndex(re => re.test(leaf));
    if (idx >= 0 && bulan[idx] === -1) { bulan[idx] = c; taken.add(c); }
  }
  // TW 1–4: label TW tanpa anak bulan
  const tw: number[] = new Array(4).fill(-1);
  for (const [c, label] of heads) {
    if (bulan.includes(c)) continue;
    const m = label.match(/tw\s*\.?\s*(iv|iii|ii|i|[1-4])\b/i);
    if (!m) continue;
    const t = m[1].toUpperCase();
    const idx = t === 'IV' || t === '4' ? 3 : t === 'III' || t === '3' ? 2 : t === 'II' || t === '2' ? 1 : 0;
    if (tw[idx] === -1) { tw[idx] = c; taken.add(c); }
  }

  // ── Lapis isi (content voting) ──
  // Header bisa salah/menggabung — di PDF label "Target" dan "Jenis" sering
  // jatuh ke satu kolom padahal datanya terpisah rapi. Kolom skalar karena itu
  // DIVERIFIKASI dari isinya, dan dipindah kalau isinya tidak cocok.
  const RE_KODE = /^[\dX]+(\.[\dX]+){2,}$/i;
  const RE_ANGKA = /^-?[\d.,]+\s*%?$/;
  const dipakaiPeriode = new Set([...bulan, ...tw].filter(c => c >= 0));

  const cocokkanLewatIsi = (field: ColField, re: RegExp, minimal = 1) => {
    const kini = pick[field];
    if (kini !== undefined && score(kini, re) >= minimal) return;
    const kandidat = [...heads.keys()]
      .filter(c => !dipakaiPeriode.has(c) && c !== pick[field])
      .filter(c => !Object.entries(pick).some(([f, cc]) => cc === c && f !== field && score(c, re) === 0))
      .sort((a, b) => score(b, re) - score(a, re))[0];
    if (kandidat === undefined || score(kandidat, re) < minimal) return;
    // Lepas kolom dari field lain yang isinya jelas bukan miliknya
    for (const [f, cc] of Object.entries(pick) as [ColField, number][]) {
      if (cc === kandidat && f !== field) { delete pick[f]; delete src[f]; }
    }
    if (kini !== undefined) taken.delete(kini);
    pick[field] = kandidat;
    src[field] = 'isi';
    taken.add(kandidat);
  };

  cocokkanLewatIsi('jenis', RE_JENIS);
  cocokkanLewatIsi('kode', RE_KODE);
  if (pick.target_tahunan === undefined || score(pick.target_tahunan, RE_ANGKA) === 0) {
    const teks = new Set([pick.tujuan, pick.sasaran, pick.program, pick.kegiatan,
      pick.sub_kegiatan, pick.outcome, pick.indikator, pick.satuan, pick.jenis, pick.kode]);
    const kandidat = [...heads.keys()]
      .filter(c => !dipakaiPeriode.has(c) && !teks.has(c))
      .sort((a, b) => score(b, RE_ANGKA) - score(a, RE_ANGKA))[0];
    if (kandidat !== undefined && score(kandidat, RE_ANGKA) > 0) {
      pick.target_tahunan = kandidat;
      src.target_tahunan = 'isi';
      taken.add(kandidat);
    }
  }

  for (const [field, col] of Object.entries(overrides) as [ColField, number][]) {
    pick[field] = col - 1;
    src[field] = 'manual';
  }

  if (pick.indikator === undefined) {
    warnings.push('Kolom "Indikator Kinerja" tidak ditemukan — struktur file tidak dikenali.');
    return null;
  }
  const adaEntitas = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub_kegiatan']
    .some(f => pick[f as ColField] !== undefined);
  if (!adaEntitas) {
    warnings.push('Tidak ada satu pun kolom Tujuan/Sasaran/Program/Kegiatan/Sub Kegiatan.');
    return null;
  }

  const g = (f: ColField) => pick[f] ?? -1;
  const cols: ColMap = {
    tujuan: g('tujuan'), sasaran: g('sasaran'), kode: g('kode'), program: g('program'),
    kegiatan: g('kegiatan'), sub_kegiatan: g('sub_kegiatan'), outcome: g('outcome'),
    indikator: g('indikator'), satuan: g('satuan'), target_tahunan: g('target_tahunan'),
    anggaran: g('anggaran'), jenis: g('jenis'), bulan, tw,
  };

  const fields: ColField[] = ['tujuan', 'sasaran', 'kode', 'program', 'kegiatan', 'sub_kegiatan',
    'outcome', 'indikator', 'satuan', 'target_tahunan', 'anggaran', 'jenis'];
  const report: ColReport[] = fields.map(f => {
    const c = pick[f];
    return {
      field: f,
      col: c === undefined ? null : c + 1,
      header: c === undefined ? '' : (heads.get(c) ?? ''),
      sample: c === undefined ? '' : sanitize(sample.map(r => r[c] ?? '').find(v => v) ?? '', 60),
      source: c === undefined ? 'tidak-ada' : (src[f] ?? 'header'),
    };
  });

  const width = Math.max(...grid.slice(rHead, dataStart + 30).map(r => r.length), 0);
  const options: ColOption[] = [];
  for (let c = 0; c < width; c++) {
    const h = heads.get(c) ?? '';
    const s = sample.map(r => r[c] ?? '').find(v => v) ?? '';
    if (h || s) options.push({ col: c + 1, header: sanitize(h, 80), sample: sanitize(s, 60) });
  }

  return { cols, report, options };
}

// ─── Header & batas data ────────────────────────────────────────────────────

function findHeader(grid: Grid): { rHead: number; headSpan: number; dataStart: number } | null {
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const line = (grid[r] ?? []).join(' | ').toLowerCase();
    if (!/indikator/.test(line)) continue;
    if (!/(program|kegiatan|sasaran|tujuan)/.test(line)) continue;
    // Header bisa 1–3 baris (merge). Baris berikut yang isinya "1 2 3 …" atau
    // baris data pertama menutup blok header.
    let span = 1;
    for (let k = 1; k <= 2 && r + k < grid.length; k++) {
      const nxt = (grid[r + k] ?? []).join(' | ').toLowerCase();
      if (/indikator|program|kegiatan|target|tw|jan|satuan/.test(nxt)) span = k + 1;
      else break;
    }
    let dataStart = r + span;
    const numRow = grid[dataStart] ?? [];
    if (numRow.filter(x => /^\d+$/.test(x)).length >= 5) dataStart++;
    return { rHead: r, headSpan: span, dataStart };
  }
  return null;
}

// ─── Entry ──────────────────────────────────────────────────────────────────

export async function parseRenaksiFile(
  buf: Buffer, filename: string, overrides: ColOverrides = {},
): Promise<ImportRaResult> {
  const gr: GridResult = await readGrid(buf, filename);
  const warnings: string[] = [];

  const head = findHeader(gr.grid);
  if (!head) {
    throw new Error('Baris header tabel tidak ditemukan (butuh kolom "Indikator" bersama Program/Kegiatan/Sasaran/Tujuan).');
  }
  const resolved = resolveColumns(gr.grid, gr.raw, head.rHead, head.headSpan, head.dataStart, overrides, warnings);
  if (!resolved) throw new Error('Struktur kolom tidak dikenali. ' + (warnings[warnings.length - 1] ?? ''));
  const { cols, report, options } = resolved;

  const get = (row: string[], c: number) => (c >= 0 ? (row[c] ?? '').trim() : '');
  const numAt = (row: string[], c: number, r: number): number | null => {
    const t = get(row, c);
    if (!t) return null;
    const n = toNum(t);
    if (n === null) return null;
    // xlsx: 0.37 berformat persen → 37
    return gr.percent.has(`${r}:${c}`) ? Math.round(n * 10000) / 100 : n;
  };

  // PDF: teks panjang membungkus jadi beberapa baris visual. Patokan awal record
  // = kolom Target terisi — angka tidak pernah membungkus, sedangkan uraian,
  // indikator, bahkan "Progres Positif" bisa pecah 2 baris. Teks baris lanjutan
  // disambung ke baris sebelumnya per kolom. Format sel sejati tidak perlu ini.
  const dataRows: Array<{ r: number; cells: string[] }> = [];
  for (let r = head.dataStart; r < gr.grid.length; r++) {
    const row = gr.grid[r];
    if (!row || !row.some(v => v && v.trim())) continue;
    if (gr.kind === 'pdf' && !get(row, cols.target_tahunan) && dataRows.length > 0) {
      const prev = dataRows[dataRows.length - 1].cells;
      row.forEach((v, c) => {
        const t = (v ?? '').trim();
        if (!t) return;
        prev[c] = prev[c] ? `${prev[c]} ${t}` : t;
      });
      continue;
    }
    dataRows.push({ r, cells: [...row] });
  }

  const rows: ImportRaRow[] = [];
  const stack: { tujuan: string | null; sasaran: string | null; program: string | null; kegiatan: string | null } =
    { tujuan: null, sasaran: null, program: null, kegiatan: null };
  const levelCount: Record<RaLevel, number> = {
    'tujuan': 0, 'sasaran': 0, 'program': 0, 'kegiatan': 0, 'sub-kegiatan': 0,
  };
  let bulanTerbaca = false;

  type Induk = { tujuan: string | null; sasaran: string | null; program: string | null; kegiatan: string | null };

  function buildRow(
    r: number, row: string[], level: RaLevel, source: ImportRaRow['level_source'],
    perluCek: boolean, kode: string | null, nama: string, induk: Induk,
    indikator: string, catatanAwal?: string,
  ): ImportRaRow {
    const catatan: string[] = catatanAwal ? [catatanAwal] : [];

    const tahunanRaw = get(row, cols.target_tahunan);
    const tahunan = numAt(row, cols.target_tahunan, r);
    if (tahunan === null && tahunanRaw) catatan.push(`Target "${tahunanRaw}" bukan angka — dianggap 0.`);

    const bulan = cols.bulan.map(c => (c >= 0 ? numAt(row, c, r) : null));
    const adaBulan = bulan.some(v => v !== null);
    if (adaBulan) bulanTerbaca = true;

    // Per triwulan: nilai sama di 3 bulan = gaya tampilan "nilai TW diulang" →
    // target TW = nilai itu. Nilai berbeda = data bulanan asli → Akumulatif
    // dijumlah, jenis lain ambil bulan terakhir (sama seperti aplikasi).
    const jenisRaw = get(row, cols.jenis);
    const jenis = normJenis(jenisRaw);
    let bulanAsli = false;
    const q: [number, number, number, number] = [0, 0, 0, 0];
    if (adaBulan) {
      for (let i = 0; i < 4; i++) {
        const part = bulan.slice(i * 3, i * 3 + 3).filter((v): v is number => v !== null);
        if (part.length === 0) continue;
        const seragam = part.every(v => v === part[0]);
        if (!seragam) bulanAsli = true;
        q[i] = seragam ? part[0]
          : (jenis ?? 'Akumulatif') === 'Akumulatif' ? part.reduce((a, b) => a + b, 0) : part[part.length - 1];
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const v = cols.tw[i] >= 0 ? numAt(row, cols.tw[i], r) : null;
        if (v !== null) q[i] = v;
      }
    }

    if (!jenis) catatan.push(`Jenis indikator "${jenisRaw || '(kosong)'}" tidak dikenali — default Akumulatif.`);

    return {
      baris: r + 1,
      level,
      level_source: source,
      perlu_cek: perluCek || gr.kind === 'pdf',
      kode,
      nama,
      induk_tujuan: induk.tujuan,
      induk_sasaran: induk.sasaran,
      induk_program: induk.program,
      induk_kegiatan: induk.kegiatan,
      outcome: sanitize(get(row, cols.outcome), LEN.outcome) || null,
      indikator,
      satuan: sanitize(get(row, cols.satuan), LEN.satuan) || 'Persen',
      jenis: jenis ?? 'Akumulatif',
      target_tahunan: tahunan ?? 0,
      q,
      bulan: bulanAsli ? bulan : null,
      anggaran: level === 'sub-kegiatan' ? numAt(row, cols.anggaran, r) : null,
      catatan,
    };
  }

  for (const { r, cells: row } of dataRows) {
    const indikator = sanitize(get(row, cols.indikator), LEN.indikator);
    const kode = sanitize(get(row, cols.kode), LEN.kode) || null;

    // ── Sinyal 1: kolom entitas mana yang terisi ──
    const isiKolom: Array<{ level: RaLevel; nama: string }> = [];
    const pairs: Array<[RaLevel, number]> = [
      ['tujuan', cols.tujuan], ['sasaran', cols.sasaran], ['program', cols.program],
      ['kegiatan', cols.kegiatan], ['sub-kegiatan', cols.sub_kegiatan],
    ];
    for (const [lv, c] of pairs) {
      const v = sanitize(get(row, c), LEN.nama);
      if (v) isiKolom.push({ level: lv, nama: v });
    }
    const s1 = isiKolom.length === 1 ? isiKolom[0].level : null;

    // ── Sinyal 2: struktur kode ──
    const s2 = kode ? levelFromKode(kode) : null;

    // ── Sinyal 3: kata kunci pada nama entitas ──
    const namaGabung = isiKolom.map(x => x.nama).join(' ');
    const s3: RaLevel | null = /^program\b/i.test(namaGabung) ? 'program' : null;

    // Baris total ("JUMLAH") bukan entitas — jangan cemari stack hierarki
    if (isiKolom.some(x => /^(jumlah|total|jml)\b/i.test(x.nama))) continue;

    const votes = [s1, s2, s3].filter((v): v is RaLevel => v !== null);

    // ── Baris indikator tambahan: tanpa nama entitas & tanpa kode, tapi ada
    // indikator. Induknya BUKAN baris tepat di atasnya (di antara indikator (1)
    // dan (2) milik satu program biasanya diselipkan kegiatan/sub-kegiatannya).
    // Penomoran "(n)" pada indikator dipakai untuk menemukan pemilik yang benar.
    if (votes.length === 0 && indikator) {
      const seq = indikator.match(/^\((\d+)\)/);
      let anchor: ImportRaRow | undefined;
      if (seq) {
        const n = Number(seq[1]);
        for (let i = rows.length - 1; i >= 0; i--) {
          const m = rows[i].indikator.match(/^\((\d+)\)/);
          if (m && Number(m[1]) === n - 1) { anchor = rows[i]; break; }
        }
      }
      if (!anchor) anchor = rows[rows.length - 1];
      if (!anchor) {
        warnings.push(`Baris ${r + 1}: indikator tanpa entitas induk — dilewati.`);
        continue;
      }
      rows.push(buildRow(r, row, anchor.level, 'lanjutan', !seq, anchor.kode, anchor.nama, {
        tujuan: anchor.induk_tujuan, sasaran: anchor.induk_sasaran,
        program: anchor.induk_program, kegiatan: anchor.induk_kegiatan,
      }, indikator, seq
        ? `Indikator tambahan untuk ${anchor.level} "${anchor.nama.slice(0, 40)}" (lanjutan dari indikator (${Number(seq[1]) - 1})).`
        : `Indikator tambahan — induk disimpulkan dari baris di atasnya (${anchor.level} "${anchor.nama.slice(0, 40)}"). Periksa sebelum simpan.`));
      levelCount[anchor.level]++;
      continue;
    }

    if (votes.length === 0) continue;
    const tally = new Map<RaLevel, number>();
    for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);
    let level: RaLevel = votes[0];
    let top = 0;
    for (const [lv, n] of tally) if (n > top) { top = n; level = lv; }
    if (s1 && tally.get(s1) === top) level = s1;  // kolom = sinyal terkuat saat seri
    const levelSource: ImportRaRow['level_source'] =
      tally.size > 1 ? 'campuran' : (s1 ? 'kolom' : s2 ? 'kode' : 'kata-kunci');

    const nama = isiKolom.find(x => x.level === level)?.nama
      ?? isiKolom[isiKolom.length - 1]?.nama
      ?? '';
    if (!nama) {
      warnings.push(`Baris ${r + 1}: nama ${level} kosong — dilewati.`);
      continue;
    }

    // ── Perbarui stack hierarki ──
    if (level === 'tujuan') { stack.tujuan = nama; stack.sasaran = null; stack.program = null; stack.kegiatan = null; }
    else if (level === 'sasaran') { stack.sasaran = nama; stack.program = null; stack.kegiatan = null; }
    else if (level === 'program') { stack.program = nama; stack.kegiatan = null; }
    else if (level === 'kegiatan') { stack.kegiatan = nama; }

    if (!indikator) {
      warnings.push(`Baris ${r + 1} (${level} "${nama.slice(0, 30)}"): indikator kosong — dilewati.`);
      continue;
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      warnings.push(`Melebihi ${MAX_IMPORT_ROWS} baris — sisanya dilewati.`);
      break;
    }

    rows.push(buildRow(r, row, level, levelSource, tally.size > 1, kode, nama, {
      tujuan: level === 'sasaran' ? stack.tujuan : null,
      sasaran: level === 'program' ? stack.sasaran : null,
      program: (level === 'kegiatan' || level === 'sub-kegiatan') ? stack.program : null,
      kegiatan: level === 'sub-kegiatan' ? stack.kegiatan : null,
    }, indikator));
    levelCount[level]++;
  }

  if (rows.length === 0) throw new Error('Tidak ada baris indikator yang terbaca dari file.');

  if (gr.kind === 'pdf') {
    warnings.push('Sumber PDF: struktur tabel direkonstruksi dari posisi teks — periksa pemetaan kolom & level sebelum menyimpan.');
  }

  return {
    rows, columns: report, columnOptions: options, levelCount, bulanTerbaca,
    warnings, source: gr.source, kind: gr.kind,
  };
}
