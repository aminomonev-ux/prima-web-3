// lib/data/kinerja-import-laporan.ts — pembaca berkas "laporan realisasi" bulanan
// E-Anggaran (bentuk kedua Import Realisasi). Server-only (exceljs), PURE terhadap
// I/O: terima Buffer, balikkan baris + peringatan; TIDAK menulis DB.
//
// Bentuk yang dibidik (dua-duanya nyata, bedanya satu kolom):
//   sistem luar : No | Bulan | Keterangan | Pagu Awal | Target Fisik (%) | Realisasi Fisik (Anggaran) | … | Realisasi Keuangan | Akumulasi … | Deviasi …
//   ekspor app  : No | Bulan | Keterangan | Pagu | Target Fisik | Real Fisik | % Fisik | Akum … | Real Keuangan | % Real Keu | Akum … | Deviasi …
//
// Dari 15-16 kolom itu yang dibaca HANYA empat: Bulan, Keterangan, Realisasi
// Fisik, Realisasi Keuangan. Sisanya turunan — kolomnya sudah DIBUANG dari
// `kinerja_realisasi` (migration-031) dan dihitung server lewat
// `recalcAllRealisasiServer`. Mengimpornya bukan cuma mubazir: tidak ada tempat
// menyimpannya, dan angkanya akan langsung ditimpa hasil hitungan.

import ExcelJS from 'exceljs';
import { sanitizeImportText } from './kinerja-import';

export interface LaporanLeaf {
  keterangan: string;
  /** Realisasi Keuangan — nama `realisasi` mengikuti BelanjaInput supaya satu matcher. */
  realisasi:  number;
  real_fisik: number;
  bulan_ke:   number;
  source:     string;
}

const MAX_SHEETS    = 60;
const MAX_GRID_ROWS = 6000;
const MAX_GRID_COLS = 40;
const MAX_ROWS      = 5000;
const MAXLEN_KET    = 500;   // kinerja_realisasi.keterangan VARCHAR(500)

const BULAN: RegExp[] = [
  /\bjan(uari)?\b/, /\bfeb(ruari)?\b/, /\bmar(et)?\b/, /\bapr(il)?\b/,
  /\bmei\b/, /\bjun(i)?\b/, /\bjul(i)?\b/, /\bagu(stus)?\b|\bags\b|\bagt\b/,
  /\bsep(tember)?\b/, /\bokt(ober)?\b/, /\bnov(ember)?\b/, /\bdes(ember)?\b/,
];

/** "Januari" / "jan" / 1 → 1. 0 kalau tidak dikenali. */
export function bulanKeDariTeks(v: string): number {
  const t = v.toLowerCase().trim();
  if (!t) return 0;
  const angka = Number(t);
  if (Number.isInteger(angka) && angka >= 1 && angka <= 12) return angka;
  const i = BULAN.findIndex(p => p.test(t));
  return i < 0 ? 0 : i + 1;
}

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}

function cellStr(v: unknown): string {
  const u = unwrap(v);
  if (u == null) return '';
  if (u instanceof Date) return u.toISOString().slice(0, 10);
  return String(u).replace(/\s+/g, ' ').trim();
}

function angka(v: unknown): number {
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

interface Peta { bulan: number; keterangan: number; fisik: number; keuangan: number }

/**
 * Peta kolom dari satu baris judul.
 *
 * Penyaring di depan yang menentukan semuanya: berkas ini punya EMPAT kolom yang
 * sama-sama menyebut "fisik" dan TIGA yang menyebut "keuangan". Yang dicari cuma
 * angka bulan berjalan, jadi semua kolom akumulasi, persentase, target, deviasi,
 * dan pagu dibuang lebih dulu. Tanpa itu "Akumulasi Realisasi Fisik" bisa terambil
 * sebagai realisasi bulan ini — angka yang benar bentuknya, salah artinya.
 */
export function petaKolomLaporan(baris: string[]): Peta | null {
  let bulan = -1, keterangan = -1, fisik = -1, keuangan = -1;
  for (let c = 0; c < baris.length; c++) {
    const h = normHeader(baris[c] ?? '');
    if (!h || h.length > 60) continue;
    if (/\bakum|akumulasi\b/.test(h)) continue;
    if (/prosentase|persentase|%|\bpct\b/.test(h)) continue;
    if (/\bdeviasi\b|\btarget\b|\bpagu\b/.test(h)) continue;

    // Dipatok ke judul yang PERSIS "Bulan"/"Periode", bukan sekadar memuat katanya:
    // laporan belanja sistem akuntansi punya kolom "Realisasi Bulan Ini", dan
    // pengenal yang longgar akan memungutnya sebagai kolom Bulan lalu merebut
    // berkas itu dari jalur lamanya.
    if (/^bulan( ke)?$|^periode$/.test(h))      { if (bulan < 0) bulan = c; continue; }
    if (/\bkeuangan\b/.test(h))                 { if (keuangan < 0) keuangan = c; continue; }
    if (/\bfisik\b/.test(h))                    { if (fisik < 0) fisik = c; continue; }
    if (/\bketerangan\b|\buraian\b/.test(h))    { if (keterangan < 0) keterangan = c; continue; }
  }
  // Ketiganya WAJIB — itulah yang membedakan bentuk ini dari laporan belanja
  // sistem akuntansi (yang tidak punya kolom Bulan per baris). Pengenalan yang
  // longgar di sini berarti berkas belanja direbut dari jalur lamanya.
  if (bulan < 0 || keterangan < 0 || keuangan < 0) return null;
  return { bulan, keterangan, fisik, keuangan };
}

function bacaSheet(grid: string[][], mentah: unknown[][], sheetName: string, warnings: string[]): LaporanLeaf[] {
  const batas = Math.min(20, grid.length);
  let barisHeader = -1;
  let peta: Peta | null = null;
  for (let r = 0; r < batas; r++) {
    const p = petaKolomLaporan(grid[r] ?? []);
    if (p) { barisHeader = r; peta = p; break; }
  }
  if (!peta || barisHeader < 0) return [];

  if (peta.fisik < 0) {
    warnings.push(`Sheet "${sheetName}": kolom Realisasi Fisik tidak ditemukan — hanya keuangan yang diisi.`);
  }

  const out: LaporanLeaf[] = [];
  for (let r = barisHeader + 1; r < grid.length; r++) {
    const keterangan = sanitizeImportText(grid[r][peta.keterangan] ?? '').slice(0, MAXLEN_KET);
    if (!keterangan) continue;
    if (petaKolomLaporan(grid[r])) continue;                  // echo baris judul
    if (out.length >= MAX_ROWS) break;

    const bulan_ke = bulanKeDariTeks(grid[r][peta.bulan] ?? '');
    if (bulan_ke === 0) {
      warnings.push(`Baris ${r + 1} dilewati — kolom Bulan tidak terbaca ("${(grid[r][peta.bulan] ?? '').slice(0, 20)}").`);
      continue;
    }

    out.push({
      keterangan,
      realisasi:  angka(mentah[r][peta.keuangan]),
      real_fisik: peta.fisik >= 0 ? angka(mentah[r][peta.fisik]) : 0,
      bulan_ke,
      source:     sanitizeImportText(`${sheetName}!baris ${r + 1}`),
    });
  }
  return out;
}

/**
 * Baca berkas sebagai laporan realisasi bulanan. Balikkan baris kosong (bukan
 * lempar galat) kalau bentuknya bukan ini — pemanggilnya yang jatuh ke pembaca
 * laporan belanja lama.
 */
export async function parseLaporanRealisasiBuffer(
  buf: Buffer,
): Promise<{ rows: LaporanLeaf[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  const warnings: string[] = [];
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS) {
    throw new Error(`Berkas punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  }

  const rows: LaporanLeaf[] = [];
  for (const ws of wb.worksheets) {
    const maxC = Math.min(ws.columnCount || 0, MAX_GRID_COLS);
    const maxR = Math.min(ws.rowCount || 0, MAX_GRID_ROWS);
    const grid: string[][] = [];
    const mentah: unknown[][] = [];
    for (let r = 1; r <= maxR; r++) {
      const row = ws.getRow(r);
      const t: string[] = []; const m: unknown[] = [];
      for (let c = 1; c <= maxC; c++) { t.push(cellStr(row.getCell(c).value)); m.push(row.getCell(c).value); }
      grid.push(t); mentah.push(m);
    }
    rows.push(...bacaSheet(grid, mentah, sanitizeImportText(ws.name), warnings));
  }
  return { rows, warnings };
}
