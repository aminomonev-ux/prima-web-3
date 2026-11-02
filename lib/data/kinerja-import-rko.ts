// lib/data/kinerja-import-rko.ts — pembaca berkas Excel RKO (tab SSK) E-Anggaran.
// Server-only (exceljs). PURE terhadap I/O: terima Buffer, balikkan baris +
// peringatan; TIDAK menulis DB (pola kinerja-import-rekening.ts).
//
// Kolom dikenali dari ISTILAH judulnya, bukan letaknya — berkas dari sumber berbeda
// menulis hal yang sama dengan kata berbeda ("Nama Rekening"/"Uraian", "DPA Perubahan"/
// "Pagu", "Sept"/"September"). Bentuk yang sudah terbukti nyata:
//   sistem luar : No | Uraian | Pagu Awal | Januari - Target Fisik | Januari - Persentase | … | Total
//   ekspor app  : No | Uraian SSK | Uraian | Pagu (Rp) | Target Jan | % Jan | … | Total (Rp) | Total %
//   RKO keuangan: [Kode Rekening] | Nama Rekening | PAGU / DPA Perubahan | Jan 2026 … Sept 2026 … | Total Belanja | Sisa Anggaran
// Tebakan yang keliru dibetulkan pemakai lewat panel pemetaan di modal (`paksa`).
// CONCEPT-kinerja-impor-rko-istilah.md.
//
// Kolom persentase & total SENGAJA tidak dibaca — turunan dari pagu + nilai
// bulanan, dan aplikasi menghitungnya sendiri. Bonusnya beda satuan (berkas luar
// menulis pecahan 0,0562; aplikasi menulis 5,62) jadi tidak relevan sama sekali.

import ExcelJS from 'exceljs';
import { nilaiSelExcel } from '@/lib/shared/excel-sel';
import { sanitizeImportText } from './kinerja-import';
import type { BarisRko, PetaRko } from '@/lib/kinerja/gabung-rko';
import type { SskMonths, SumberSSK } from '@/app/(dashboard)/kinerja/_types';

export interface KolomRko { indeks: number; label: string; judul: string }
/** Baris yang angkanya jumlah baris di bawahnya — dilewati, disebut di pratinjau. */
export interface BarisKelompokRko { uraian: string; nilai: number }

export interface ParseRkoResult {
  rows:        BarisRko[];
  warnings:    string[];
  /** Sumber yang tertulis di nama sheet ("RKO BLUD") — null kalau tak terbaca. */
  sumberSheet: SumberSSK | null;
  source:      string;
  /** Label kolom sumber untuk panel transparansi di modal. */
  mapping:     { uraian: string; pagu: string; bulan: string[] };
  /** Letak kolom yang dipakai — dikirim balik modal kalau pemakai membetulkannya. */
  peta:        PetaRko;
  /** Kolom berjudul di baris judul — pilihan panel pemetaan. */
  kolom:       KolomRko[];
  kelompok:    BarisKelompokRko[];
}

const MAX_SHEETS    = 60;
const MAX_GRID_ROWS = 6000;
const MAX_GRID_COLS = 40;
const MAX_ROWS      = 5000;
const MAXLEN_URAIAN = 500;   // kinerja_ssk.uraian VARCHAR(500)
const BARIS_CARI    = 20;

const SUMBER_VALID: SumberSSK[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN'];

const KUNCI_BULAN: { key: keyof SskMonths; pola: RegExp }[] = [
  { key: 'jan', pola: /\bjan(uari)?\b/ },
  { key: 'feb', pola: /\bfeb(ruari)?\b|\bpeb(ruari)?\b/ },
  { key: 'mar', pola: /\bmar(et)?\b|\bmrt\b/ },
  { key: 'apr', pola: /\bapr(il)?\b/ },
  { key: 'mei', pola: /\bmei\b/ },
  { key: 'jun', pola: /\bjun(i)?\b/ },
  { key: 'jul', pola: /\bjul(i)?\b/ },
  { key: 'agu', pola: /\bagu(stus)?\b|\bags\b|\bagt\b/ },
  { key: 'sep', pola: /\bsep(t|tember)?\b/ },
  { key: 'okt', pola: /\bokt(ober)?\b/ },
  { key: 'nov', pola: /\bno[pv](ember)?\b/ },
  { key: 'des', pola: /\bdes(ember)?\b/ },
];

/** Kolom turunan/pelengkap — tidak pernah dipungut jadi kolom nama, pagu, maupun bulan. */
const TURUNAN = /persen|persentase|\s%|^%|\bpct\b|\btotal\b|\bsisa\b|\brealisasi\b|\bdeviasi\b|\bselisih\b|\bcapaian\b/;

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}

const adaRumus = (v: unknown): boolean => !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);

function cellStr(v: unknown): string {
  const u = unwrap(v);
  if (u == null) return '';
  if (u instanceof Date) return u.toISOString().slice(0, 10); // tanggal-utc-ok: exceljs membaca sel tanggal sebagai tengah malam UTC
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
  return s.toLowerCase().replace(/[*:./\\()-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function colLabel(c: number): string {
  return 'Kolom ' + (c < 26 ? String.fromCharCode(65 + c) : `#${c + 1}`);
}

type Peta = Omit<PetaRko, 'sheet' | 'header' | 'dua'>;

const skorNama = (h: string) => (/\bnama\b|\buraian\b/.test(h) ? 3 : 0) + (/\brekening\b|\bakun\b/.test(h) ? 2 : 0) + (/\bbelanja\b/.test(h) ? 1 : 0);
const skorPagu = (h: string) => (/\bpagu\b/.test(h) ? 3 : /\bdpa\b/.test(h) ? 2 : /\banggaran\b|\balokasi\b/.test(h) ? 1 : 0);

/**
 * Peta kolom dari satu baris judul.
 *
 * Urutan pemeriksaan MENGIKAT: judul bulan di berkas luar berbunyi
 * "Januari - Target Fisik" DAN "Januari - Persentase" — dua-duanya menyebut
 * bulannya. Kolom turunan harus dibuang lebih dulu, kalau tidak Januari bisa terisi
 * 0,0562 alih-alih 2,3 miliar. "Kode Rekening" & "Uraian SSK" juga disingkirkan
 * sebelum mencari nama baris — keduanya memuat kata "rekening"/"uraian", dan
 * berkas yang menaruh kode paling kiri dulu terbaca berisi "5.1.1.1.1.1".
 * Kalau beberapa kolom sama-sama cocok, yang istilahnya paling kuat yang menang
 * ("Nama Rekening" > "Rekening Belanja"; "Pagu" > "DPA" > "Anggaran").
 */
function petaKolom(baris: string[]): Peta | null {
  let uraian = -1, sUraian = 0, pagu = -1, sPagu = 0, kode = -1;
  const bulan: (number | null)[] = KUNCI_BULAN.map(() => null);

  for (let c = 0; c < baris.length; c++) {
    const h = normHeader(baris[c] ?? '');
    if (!h || h.length > 60) continue;
    if (TURUNAN.test(h)) continue;

    const b = KUNCI_BULAN.findIndex(x => x.pola.test(h));
    if (b >= 0) { if (bulan[b] === null) bulan[b] = c; continue; }

    if (/\bkode\b|\bkd\b|\bkorek\b/.test(h)) { if (kode < 0) kode = c; continue; }
    if (/\bsumber\b|\bssk\b/.test(h)) continue;

    const sp = skorPagu(h);
    if (sp > 0) { if (sp > sPagu) { pagu = c; sPagu = sp; } continue; }
    const sn = skorNama(h);
    if (sn > sUraian) { uraian = c; sUraian = sn; }
  }

  // Tanpa nama baris tidak ada yang bisa dicocokkan; tanpa satu pun bulan berkas
  // itu bukan RKO. Pagu boleh tidak ada — beberapa berkas hanya membawa jadwal.
  if (uraian < 0 || bulan.every(x => x === null)) return null;
  return { uraian, pagu: pagu < 0 ? null : pagu, kode: kode < 0 ? null : kode, bulan };
}

const skorPeta = (p: Peta) => p.bulan.filter(x => x !== null).length * 2 + 3 + (p.pagu !== null ? 2 : 0) + (p.kode !== null ? 1 : 0);

/** Judul dua baris digabung per kolom: sel gabung ("Target Bulanan") ikut di setiap kolom bawahnya. */
const judulGabung = (a: string[], b: string[]) => a.map((x, c) => `${x ?? ''} ${b?.[c] ?? ''}`.trim());

/**
 * Baris judul TERBAIK (bukan yang pertama lolos) di 20 baris teratas, satu atau dua baris.
 * Sama kuat → yang satu baris dan paling atas: menggabung baris judul dengan baris data
 * tidak boleh menang hanya karena isinya kebetulan memuat kata kunci.
 */
function cariHeader(grid: string[][]): { row: number; dua: boolean; peta: Peta; skor: number } | null {
  let terbaik: { row: number; dua: boolean; peta: Peta; skor: number } | null = null;
  for (let r = 0; r < Math.min(BARIS_CARI, grid.length); r++) {
    for (const dua of [false, true]) {
      if (dua && r + 1 >= grid.length) continue;
      const peta = petaKolom(dua ? judulGabung(grid[r] ?? [], grid[r + 1] ?? []) : grid[r] ?? []);
      if (!peta) continue;
      const skor = skorPeta(peta);
      if (!terbaik || skor > terbaik.skor || (skor === terbaik.skor && !dua && terbaik.dua)) terbaik = { row: r, dua, peta, skor };
    }
  }
  return terbaik;
}

interface Grid { teks: string[][]; mentah: unknown[][] }

function sheetGrid(ws: ExcelJS.Worksheet): Grid {
  const teks: string[][] = [];
  const mentah: unknown[][] = [];
  const maxC = Math.min(ws.columnCount || 0, MAX_GRID_COLS);
  const maxR = Math.min(ws.rowCount || 0, MAX_GRID_ROWS);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const t: string[] = [];
    const m: unknown[] = [];
    for (let c = 1; c <= maxC; c++) { const v = nilaiSelExcel(row.getCell(c)); t.push(cellStr(v)); m.push(v); }
    teks.push(t); mentah.push(m);
  }
  return { teks, mentah };
}

/** "RKO BLUD" / "RKO_BLUD_2026-09-02" → 'BLUD'. Garis bawah dijadikan spasi dulu. */
export function sumberRkoDariNama(teks: string): SumberSSK | null {
  const t = teks.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  return SUMBER_VALID.find(s => new RegExp(`\\b${s}\\b`).test(t)) ?? null;
}

interface BarisMentah { uraian: string; kode: string; nilai: number; rumus: boolean }

const ruasKode = (k: string) => k.split('.').filter(Boolean).length;

/**
 * Baris kelompok ("BELANJA PEGAWAI", "5.1.1.1 BELANJA GAJI…") = angkanya jumlah baris
 * di bawahnya. Menjumlahkannya ke RKO menggandakan pagu, jadi dilewati.
 *
 * Diperiksa dari BAWAH: subkelompok ditandai dulu, lalu kelompok di atasnya menjumlah
 * baris yang bukan kelompok — kalau dari atas, "BELANJA PEGAWAI" ikut menjumlah
 * subkelompoknya sendiri dan tidak pernah cocok. Kecocokan angka saja tidak cukup
 * (dua rekening bisa kebetulan bernilai sama); wajib ada tanda dari berkasnya: pagu
 * berupa rumus, kode lebih pendek dari kode baris sesudahnya, atau ditulis kapital
 * semua — tanda terakhir diabaikan kalau SEMUA baris kapital, dan hanya berlaku bila
 * menjumlah ≥ 2 baris.
 */
export function tandaiKelompok(baris: BarisMentah[]): boolean[] {
  const kapital = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
  const semuaKapital = baris.length > 0 && baris.every(b => kapital(b.uraian));
  const kel = baris.map(() => false);
  for (let i = baris.length - 1; i >= 0; i--) {
    const b = baris[i];
    if (!(b.nilai > 0)) continue;
    const berikut = baris[i + 1];
    const kodeInduk = !!b.kode && !!berikut?.kode && berikut.kode.startsWith(`${b.kode}.`) && ruasKode(b.kode) < ruasKode(berikut.kode);
    const tandaKuat = b.rumus || kodeInduk;
    const tandaKapital = !semuaKapital && kapital(b.uraian);
    if (!tandaKuat && !tandaKapital) continue;
    let jumlah = 0, n = 0;
    for (let j = i + 1; j < baris.length; j++) {
      if (kel[j]) continue;
      jumlah += baris[j].nilai; n++;
      if (Math.abs(jumlah - b.nilai) < 0.5 && (tandaKuat || n >= 2)) { kel[i] = true; break; }
      if (jumlah > b.nilai + 0.5) break;
    }
  }
  return kel;
}

function judulDi(teks: string[][], header: number, dua: boolean): string[] {
  return dua ? judulGabung(teks[header] ?? [], teks[header + 1] ?? []) : teks[header] ?? [];
}

function bacaSheet(grid: Grid, nama: string, paksa?: PetaRko): { hasil: ParseRkoResult; skor: number } {
  const { teks, mentah } = grid;
  const source = `Sheet "${sanitizeImportText(nama)}"`;
  const sumberSheet = sumberRkoDariNama(nama);
  const warnings: string[] = [];
  const kosongPeta: PetaRko = { sheet: nama, header: 0, dua: false, uraian: 0, kode: null, pagu: null, bulan: KUNCI_BULAN.map(() => null) };
  const kosong = { hasil: { rows: [], warnings, sumberSheet, source, mapping: { uraian: '-', pagu: '-', bulan: [] }, peta: kosongPeta, kolom: [], kelompok: [] }, skor: 0 };

  const header = paksa
    ? { row: paksa.header, dua: paksa.dua, peta: { uraian: paksa.uraian, kode: paksa.kode, pagu: paksa.pagu, bulan: paksa.bulan }, skor: 1 }
    : cariHeader(teks);
  if (!header) return kosong;

  const { peta } = header;
  const judul = judulDi(teks, header.row, header.dua);
  const kolom: KolomRko[] = judul.flatMap((j, c) => (j ? [{ indeks: c, label: colLabel(c), judul: sanitizeImportText(j).slice(0, 80) }] : []));
  const mapping = {
    uraian: colLabel(peta.uraian),
    pagu:   peta.pagu !== null ? colLabel(peta.pagu) : '(tidak ada)',
    bulan:  peta.bulan.map(c => (c !== null ? colLabel(c) : '-')),
  };

  const bulanHilang = KUNCI_BULAN.filter((_, i) => peta.bulan[i] === null).map(b => b.key.toUpperCase());
  if (bulanHilang.length > 0) warnings.push(`Berkas tidak memuat kolom ${bulanHilang.join(', ')} — target bulan itu diisi 0.`);
  if (peta.pagu === null) warnings.push('Kolom Pagu tidak ditemukan — pagu diisi 0, persentase ikut 0.');

  const calon: (BarisRko & { rumus: boolean })[] = [];
  let terpotong = false;
  for (let r = header.row + (header.dua ? 2 : 1); r < teks.length; r++) {
    const uraian = sanitizeImportText(teks[r][peta.uraian] ?? '').slice(0, MAXLEN_URAIAN);
    if (!uraian) continue;
    if (petaKolom(teks[r])) continue;                 // echo baris judul (berkas multi-halaman)
    if (calon.length >= MAX_ROWS) { terpotong = true; break; }

    const months = KUNCI_BULAN.reduce((acc, b, i) => {
      const c = peta.bulan[i];
      acc[b.key] = c === null ? 0 : angkaRko(mentah[r][c]);
      return acc;
    }, {} as SskMonths);
    const pagu = peta.pagu !== null ? angkaRko(mentah[r][peta.pagu]) : 0;
    const kode = peta.kode !== null ? sanitizeImportText(teks[r][peta.kode] ?? '').slice(0, 64) : '';
    calon.push({ uraian, pagu, months, ...(kode ? { kode } : {}), rumus: peta.pagu !== null && adaRumus(mentah[r][peta.pagu]) });
  }
  if (terpotong) warnings.push(`Berkas berisi lebih dari ${MAX_ROWS} baris — hanya ${MAX_ROWS} pertama yang diambil.`);

  const nilai = (b: BarisRko) => (peta.pagu !== null ? b.pagu : Object.values(b.months).reduce((s, v) => s + v, 0));
  const kel = tandaiKelompok(calon.map(b => ({ uraian: b.uraian, kode: b.kode ?? '', nilai: nilai(b), rumus: b.rumus })));
  const rows = calon.flatMap((b, i) => (kel[i] ? [] : [{ uraian: b.uraian, pagu: b.pagu, months: b.months, ...(b.kode ? { kode: b.kode } : {}) }]));
  const kelompok = calon.flatMap((b, i) => (kel[i] ? [{ uraian: b.uraian, nilai: nilai(b) }] : []));

  return {
    hasil: { rows, warnings, sumberSheet, source, mapping, kolom, kelompok, peta: { sheet: nama, header: header.row, dua: header.dua, ...peta } },
    skor: header.skor,
  };
}

/**
 * `paksa` = pemetaan yang dibetulkan pemakai di modal: sheet, baris judul, dan kolomnya
 * dipakai apa adanya, tanpa menebak lagi.
 */
export async function parseRkoImport(buf: Buffer, paksa?: PetaRko): Promise<ParseRkoResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS) {
    throw new Error(`Berkas punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  }

  if (paksa) {
    const ws = wb.worksheets.find(w => w.name === paksa.sheet);
    if (!ws) throw new Error(`Sheet "${sanitizeImportText(paksa.sheet)}" tidak ada di berkas ini.`);
    const { hasil } = bacaSheet(sheetGrid(ws), ws.name, paksa);
    if (hasil.rows.length === 0) throw new Error('Dengan pemetaan ini tidak ada baris RKO terbaca — periksa kolom Nama rekening.');
    return hasil;
  }

  // Sheet dengan judul paling cocok yang menang, baru jumlah barisnya — sheet rekap
  // yang barisnya banyak tidak boleh mengalahkan sheet RKO yang judulnya jelas.
  let terbaik: { hasil: ParseRkoResult; skor: number } | null = null;
  for (const ws of wb.worksheets) {
    const b = bacaSheet(sheetGrid(ws), ws.name);
    if (b.hasil.rows.length === 0) continue;
    if (!terbaik || b.skor > terbaik.skor || (b.skor === terbaik.skor && b.hasil.rows.length > terbaik.hasil.rows.length)) terbaik = b;
  }
  if (!terbaik) {
    throw new Error('Tidak ada baris RKO terdeteksi. Pastikan ada kolom nama rekening/uraian dan kolom target per bulan (Januari…Desember).');
  }
  return terbaik.hasil;
}
