// ─── PRIMA E-Anggaran — unduhan Excel & PDF ─────────────────────────────────
// Semua tabel lewat gaya resmi bersama (lib/shared/tabel-dokumen.ts — konsep
// docs/konsep/sistem/CONCEPT-format-unduhan-seragam.md): berkas ini menyusun DATA-nya
// (`dok*`), penulisnya yang menggambar kop, kepala, JUMLAH, catatan, tanda tangan.
// PERF-C3: exceljs/jspdf dimuat dinamis saat tombol diklik, lalu disimpan.

import { fmtRp, fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { tulisPersen } from '@/lib/shared/desimal';
import { loadExcelJs, downloadWorkbook, FMT_PERSEN } from '@/lib/shared/excel-export';
import { kakiDokPdf, periodeTahun, type KopDok, type BlokTtd, type Tingkat } from '@/lib/shared/gaya-dokumen';
import {
  tulisTabelExcel, gambarTabelPdf, teksSelPdf,
  type DokTabel, type KolomDok, type BarisDok, type JenisKolom,
} from '@/lib/shared/tabel-dokumen';
import type {
  SumberSSK, SskRow, RekeningRow, RealRow, CrrRow, PendRow, LaporanSumber,
  MasterOpts, MasterRow, MasterTipe,
} from './_types';
import { MONTHS_KEYS, MONTH_SHORT, CRR_BULAN_LABELS } from './_utils';
import type { BarisRekap, LaporanYatim } from '@/lib/kinerja/rekap';
import { ringkasVersiRekap, namaBerkasRekap, imbuhanBerkasVersi, imbuhanBerkasVersiCetak,
  type VersiSumberRekap, type PilihanVersiRekap, type VersiCetak } from '@/lib/kinerja/versi';
import { hitungJumlahBulan, bulanBerdata, tandaYatim, catatanYatimBulan } from '@/lib/kinerja/cetak-detail';
import { adaTargetPerubahan, targetBerlaku, capaianPendapatan } from '@/lib/kinerja/pendapatan-perubahan';

/** Teks kaki halaman tiap berkas ("PRIMA - E-ANGGARAN"). */
export const MODUL_KINERJA = 'E-ANGGARAN';

let _pdfPromise:  Promise<{ jsPDF: typeof import('jspdf').jsPDF; autoTable: typeof import('jspdf-autotable').default }> | null = null;

export function loadPdf() {
  if (!_pdfPromise) _pdfPromise = Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([pdf, table]) => ({ jsPDF: pdf.jsPDF, autoTable: table.default }));
  return _pdfPromise;
}

type Dok = import('jspdf').jsPDF;
type AutoTable = typeof import('jspdf-autotable').default;

const kop = (judul: string, periode: string | null, keterangan?: string | null): KopDok =>
  ({ judul, periode, keterangan: keterangan ?? null, modul: MODUL_KINERJA });

const kolom = (judul: string, jenis: JenisKolom, lebar?: number): KolomDok => ({ judul, jenis, ...(lebar ? { lebar } : {}) });

/** Satu dokumen → satu lembar → unduh. */
async function unduhSatuLembar(dok: DokTabel, namaLembar: string, berkas: string) {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  tulisTabelExcel(wb.addWorksheet(namaLembar.slice(0, 31)), dok);
  await downloadWorkbook(wb, berkas);
}

/** Satu dokumen → PDF A4 (A3 bila `lebar`) → unduh. */
async function unduhPdf(dok: DokTabel, berkas: string, format: 'a4' | 'a3' = 'a4') {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
  gambarTabelPdf(doc, autoTable, dok, { huruf: format === 'a3' ? 7 : 7.5 });
  kakiDokPdf(doc, MODUL_KINERJA);
  doc.save(berkas);
}

/** Teks PDF tiap baris dokumen — yang tercetak, sel per sel. */
export const teksBarisPdf = (dok: DokTabel): string[][] => dok.baris.map(b => dok.kolom.map((k, i) => teksSelPdf(k, b.sel[i])));

// ─── SSK (RKO) ────────────────────────────────────────────────────────────────
// Judul kolom TIDAK diubah: Import RKO (lib/data/kinerja-import-rko.ts) mengenalinya.

export function dokSsk(rows: SskRow[], sumber: SumberSSK, tahun: string): DokTabel {
  const jumlah = (f: (r: SskRow) => number) => rows.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  const paguTotal = jumlah(r => r.pagu);
  const persenDari = (rp: number) => (paguTotal ? Math.round((rp / paguTotal) * 10000) / 100 : 0);
  return {
    kop: kop(`RKO ${sumber}`, periodeTahun(tahun)),
    kolom: [
      kolom('No', 'nomor'), kolom('Uraian SSK', 'teks', 22), kolom('Uraian', 'uraian', 34), kolom('Pagu (Rp)', 'rupiah', 16),
      ...MONTHS_KEYS.flatMap((_, i) => [kolom(`Target ${MONTH_SHORT[i]}`, 'rupiah', 14), kolom(`% ${MONTH_SHORT[i]}`, 'persen', 8)]),
      kolom('Total (Rp)', 'rupiah', 16), kolom('Total %', 'persen', 9),
    ],
    baris: [
      ...rows.map((r, i): BarisDok => ({ sel: [
        i + 1, r.uraian_ssk, r.uraian, r.pagu,
        ...MONTHS_KEYS.flatMap(m => [r.months[m] || 0, r.months_pct[m] || 0]),
        r.total, r.total_pct,
      ] })),
      ...(rows.length ? [{ total: true, sel: [
        '', '', 'JUMLAH', paguTotal,
        ...MONTHS_KEYS.flatMap(m => { const v = jumlah(r => r.months[m]); return [v, persenDari(v)]; }),
        jumlah(r => r.total), persenDari(jumlah(r => r.total)),
      ] } satisfies BarisDok] : []),
    ],
    mendatar: true,
  };
}

export async function exportSskExcel(params: { rows: SskRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  await unduhSatuLembar(dokSsk(rows, sumber, tahun), `SSK ${sumber}`, `SSK-${sumber}-${tahun}.xlsx`);
}

/** Teks PDF baris RKO (tanpa JUMLAH) — sel persen berkoma, rupiah bertitik. */
export function barisSskPdf(rows: SskRow[]): string[][] {
  return teksBarisPdf(dokSsk(rows, 'GAJI', '')).slice(0, rows.length);
}

export async function exportSskPdf(params: { rows: SskRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  await unduhPdf(dokSsk(rows, sumber, tahun), `SSK-${sumber}-${tahun}.pdf`, 'a3');
}

// ─── Kop dokumen ──────────────────────────────────────────────────────────────
//
// Isi kop Rekap & Detail beda, bentuknya sama (`KopDok`, digambar `kopDokExcel` /
// `kopDokPdf`) — jadi dalam satu berkas bundel halaman rekap sebentuk dgn halaman detail.

/**
 * `ringkasVersi` WAJIB, tanpa nilai bawaan: bawaan `''` dulu memulangkan
 * kalimat "mengacu SSK versi aktif tiap sumber" — kalimat yang menyebut
 * ATURANNYA dan bukan versinya, jadi dua rekap yang diukur ke versi berbeda
 * terbaca identik. Begitu versinya bisa dipilih, kalimat itu bukan cuma kurang
 * informatif, ia menyesatkan — dan nilai bawaan membuatnya bisa kembali diam-
 * diam lewat pemanggil yang lupa.
 */
export function kopRekap(namaBulan: string, tahun: string, ringkasVersi: string): KopDok {
  return kop(
    'LAPORAN PERKEMBANGAN PELAKSANAAN BELANJA — REKAP',
    `S/D BULAN ${namaBulan.toUpperCase()} TAHUN ${tahun} — SEMUA SUMBER`,
    ringkasVersi,
  );
}

/**
 * `versi` WAJIB: unduhan MURNI dan PERUBAHAN-1 pagunya beda, dan kop tanpa versi
 * membuat keduanya identik. Ditulis di baris keterangan kop (baris 5) — letak kepala
 * tabel tidak bergeser. CONCEPT-kinerja-versi-cetak §1.3.
 */
export function kopDetail(sumber: SumberSSK, bulan: number, tahun: string, versi: string): KopDok {
  return kop(
    `LAPORAN REALISASI KINERJA ${sumber}`,
    `BULAN ${(CRR_BULAN_LABELS[bulan - 1] ?? '').toUpperCase()} TAHUN ${tahun}`,
    `SSK ${versi}`,
  );
}

/**
 * Dua pejabat penanda tangan — dipakai LAYAR, PDF, dan Excel.
 *
 * Dulu nama jabatannya ditulis ulang di JSX CetakTab, jadi mengganti
 * "Kabag Program & Anggaran" jadi "Kabag Renbang" harus disentuh di dua tempat
 * dan cukup lupa satu untuk membuat cetakan berbeda dengan layarnya.
 */
export const PENANDA_TANGAN = [
  { peran: 'Mengetahui,',   jabatan: 'Kabag Renbang' },
  { peran: 'Yang membuat,', jabatan: 'Kasubag Program' },
];

/** Blok tanda tangan berkas = layar: tempat & tanggal, peran, ruang tanda tangan, jabatan. */
export function ttdKinerja(namaBulan: string, tahun: string): BlokTtd[] {
  return PENANDA_TANGAN.map(p => ({
    tempat: `Semarang, ${namaBulan} ${tahun}`, peran: p.peran, jabatan: p.jabatan, jabatanDiBawah: true,
  }));
}

// ─── Rekap (Cetak → Rekap) ────────────────────────────────────────────────────
//
// Menerima baris yang SUDAH dihitung `hitungRekap`, bukan menghitung ulang —
// dokumen yang diunduh wajib memuat angka yang persis sama dengan yang dilihat
// orang di layar. Menghitung ulang di sini berarti dua sumber kebenaran untuk
// satu tabel, dan cepat atau lambat keduanya berbeda pendapat.

// Diekspor: tabel LKJIP yang tertaut ke Rekap memakai judul & catatan yang SAMA (lib/lkjip/sumber).
export const REKAP_HEADER = [
  'No', 'Uraian', 'Anggaran (Rp)', 'Target s/d Bln Ini (%)',
  'Realisasi Fisik s/d Bln Ini (Rp)', 'Realisasi Fisik s/d Bln Ini (%)', 'Deviasi Fisik (%)',
  'Tingkat Capaian Fisik (%)',
  'Target Keu s/d Bln Ini (Rp)', 'Bulan Ini (Rp)', 'Realisasi Keu s/d Bln Ini (Rp)',
  'Realisasi Keu s/d Bln Ini (%)', 'Deviasi Keu (%)',
];

/** Jenis tiap kolom Rekap — WAJIB sejajar `REKAP_HEADER` (uang vs persen). */
const REKAP_JENIS: JenisKolom[] = [
  'nomor', 'uraian', 'rupiah', 'persen',
  'rupiah', 'persen', 'persen',
  'persen',
  'rupiah', 'rupiah', 'rupiah',
  'persen', 'persen',
];
const REKAP_LEBAR = [5, 48, 18, 12, 20, 12, 12, 14, 20, 18, 20, 12, 12];

/** Tingkat pohon Rekap → latar dokumen: grand total navy, program & kegiatan biru. */
const tingkatRekap = (indent: number): Tingkat =>
  indent === 0 ? 'akar' : indent === 1 ? 'induk1' : indent === 2 ? 'induk2' : 'biasa';

export interface RekapExportParams {
  baris:    BarisRekap[];
  yatim:    LaporanYatim;
  tahun:    string;
  namaBulan: string;
  /** Lihat `HasilRekap.tanpaRealisasi` — catatannya WAJIB ikut ke berkas. */
  tanpaRealisasi: boolean;
  /**
   * Versi SSK yang jadi acuan tiap sumber + pilihan yang menghasilkannya.
   * WAJIB, dan itu seluruh alasan pemilih versi boleh ada: begitu versinya bisa
   * dipilih, dokumen yang tidak menyebut versinya berubah dari kurang
   * informatif menjadi menyesatkan — dua rekap dengan angka berbeda terbaca
   * identik oleh orang yang cuma memegang berkasnya.
   */
  versiRekap: VersiSumberRekap[];
  pilihanVersi: PilihanVersiRekap;
  /**
   * A9: sumber yang versi SSK acuannya habis dinol-kan. Pagunya 0, jadi ia
   * TIDAK menyumbang apa pun ke total rekap — dan pembaca yang cuma memegang
   * berkasnya tidak punya cara menebak kenapa sumber itu seolah tidak ada.
   */
  sumberDinolkan: string[];
}

/** Catatan yatim ikut dibawa: tanpa ini, dokumen yang dibaca di luar aplikasi
 *  tidak bisa dijelaskan kenapa totalnya lebih kecil dari kas yang keluar. */
export function catatanYatim(yatim: LaporanYatim): string | null {
  if (yatim.jumlahBaris === 0) return null;
  return `Catatan: ${yatim.jumlahItem} rekening (${yatim.jumlahBaris} baris, realisasi keuangan `
    + `${fmtNum(yatim.nominal)}) TIDAK ikut dihitung — rekeningnya sudah tidak ada di SSK acuan `
    + `sehingga tidak punya pagu sebagai pembagi.`;
}

/**
 * Catatan "belum ada realisasi yang diisi".
 *
 * Ia ada di berkas, bukan cuma di layar, dan itu seluruh alasannya: yang
 * ditandatangani dan diedarkan adalah berkasnya. "Realisasi Rp 0" tanpa
 * keterangan akan dibaca sebagai "anggarannya belum dipakai", padahal dokumen
 * ini tidak punya cara membedakannya dari "datanya belum dimasukkan".
 */
export function catatanTanpaRealisasi(tanpaRealisasi: boolean, namaBulan: string, tahun: string): string | null {
  if (!tanpaRealisasi) return null;
  return `Catatan: belum ada data realisasi yang diisi s/d ${namaBulan} ${tahun}. `
    + 'Angka Realisasi Rp 0 di atas berarti datanya belum dimasukkan ke sistem — '
    + 'bukan berarti anggarannya belum dipakai.';
}

/**
 * Catatan "sumber ini dinol-kan".
 *
 * Sebab, bukan akibat — karena itu ia catatan PERTAMA: yatim yang menyusul di
 * bawahnya adalah akibat langsung dari keadaan ini, dan membacanya lebih dulu
 * membuat orang mengira ada dua masalah berbeda.
 */
export function catatanDinolkan(sumberDinolkan: string[]): string | null {
  if (sumberDinolkan.length === 0) return null;
  return `Catatan: seluruh baris SSK ${sumberDinolkan.join(', ')} dinol-kan, jadi pagu & targetnya `
    + 'Rp 0 dan TIDAK ikut menyumbang ke total di atas. Itu disengaja, bukan data yang belum diisi.';
}

/** Dokumen Rekap — SATU susunan untuk Excel DAN PDF (dipisah supaya bisa diuji tanpa DOM). */
export function dokRekap({ baris, yatim, tahun, namaBulan, tanpaRealisasi, sumberDinolkan,
  versiRekap, pilihanVersi }: RekapExportParams): DokTabel {
  return {
    kop: kopRekap(namaBulan, tahun, ringkasVersiRekap(versiRekap, pilihanVersi)),
    kolom: REKAP_HEADER.map((j, i) => kolom(j, REKAP_JENIS[i], REKAP_LEBAR[i])),
    baris: baris.map(b => ({
      tingkat: tingkatRekap(b.indent), kedalaman: b.indent, tebal: b.tebal,
      sel: [
        b.no, b.label, b.pagu, b.targetPct,
        b.realFisik, b.pctFisik, b.devFisik, b.capaianFisik ?? '—',
        b.targetRp, b.realKeuBulanIni, b.realKeu, b.pctKeu, b.devKeu,
      ],
    })),
    catatan: [
      catatanDinolkan(sumberDinolkan),
      catatanTanpaRealisasi(tanpaRealisasi, namaBulan, tahun),
      catatanYatim(yatim),
    ].filter((c): c is string => c !== null),
    ttd: ttdKinerja(namaBulan, tahun),
    mendatar: true,
  };
}

export async function exportRekapExcel(params: RekapExportParams) {
  await unduhSatuLembar(dokRekap(params), 'Rekap', namaBerkasRekap(params.pilihanVersi, params.namaBulan, params.tahun, 'xlsx'));
}

/** Halaman rekap di PDF — dipakai unduhan satuan DAN bundel. */
export function gambarRekapPdf(doc: Dok, autoTable: AutoTable, params: RekapExportParams) {
  gambarTabelPdf(doc, autoTable, dokRekap(params), { huruf: 7 });
}

export async function exportRekapPdf(params: RekapExportParams) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  gambarRekapPdf(doc, autoTable, params);
  kakiDokPdf(doc, MODUL_KINERJA);
  doc.save(namaBerkasRekap(params.pilihanVersi, params.namaBulan, params.tahun, 'pdf'));
}

// ─── Rekening ─────────────────────────────────────────────────────────────────
// Daftar kerja (tanpa tanda tangan). Judul kolom dikenali Import Rekening — jangan diubah.

export function dokRekening(rows: RekeningRow[], sumber: SumberSSK, tahun: string): DokTabel {
  return {
    kop: kop(`DAFTAR REKENING ${sumber}`, periodeTahun(tahun)),
    kolom: [
      kolom('No', 'nomor'), kolom('Program', 'teks', 40), kolom('Kegiatan', 'teks', 26), kolom('Sub Kegiatan', 'teks', 28),
      kolom('Uraian SSK', 'teks', 28), kolom('Rekening Belanja', 'teks', 30), kolom('Sumber Anggaran', 'teks', 18),
    ],
    baris: rows.map((r, i) => ({ sel: [i + 1, r.program ?? '', r.kegiatan ?? '', r.subkegiatan ?? '', r.uraian_ssk ?? '', r.uraian, r.sumber_anggaran ?? ''] })),
    mendatar: true,
  };
}

export async function exportRekeningExcel(params: { rows: RekeningRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  await unduhSatuLembar(dokRekening(rows, sumber, tahun), `Rekening ${sumber}`, `Rekening-${sumber}-${tahun}.xlsx`);
}

// ─── Realisasi ────────────────────────────────────────────────────────────────

// ─── Detail per sumber: susunan bersama layar / Excel / PDF ───────────────────
//
// Dipisah dari pengunduhnya supaya unduhan per-sumber DAN bundel gabungan memakai
// satu definisi. Dua definisi tabel detail cepat atau lambat berbeda pendapat.

export const DETAIL_HEADER = [
  'No', 'Bulan', 'Keterangan', 'Pagu', 'Target Fisik', 'Real Fisik', '% Fisik',
  'Akum Target Fisik', 'Akum Real Fisik', 'Akum % Fisik',
  'Real Keuangan', '% Real Keu', 'Akum Keuangan', 'Akum % Keuangan',
  'Deviasi Fisik %', 'Deviasi Keuangan %',
];

/** Sejajar `DETAIL_HEADER` (16 kolom). */
const DETAIL_JENIS: JenisKolom[] = [
  'nomor', 'teks', 'uraian',
  'rupiah', 'persen', 'rupiah', 'persen',
  'persen', 'rupiah', 'persen',
  'rupiah', 'persen', 'rupiah', 'persen',
  'persen', 'persen',
];

export function realisasiAoa(rows: RealRow[]): (string | number | null)[][] {
  return rows.map((r, i) => [
    i + 1, CRR_BULAN_LABELS[r.bulan - 1] ?? r.bulan, r.keterangan,
    r.pagu_awal, r.target_fisik, r.real_fisik, r.pct_fisik,
    r.akum_target_fisik, r.akum_real_fisik, r.akum_pct_fisik,
    r.real_keuangan, r.pct_keuangan, r.akum_keuangan, r.akum_pct_keuangan,
    r.deviasi_fisik, r.deviasi_keuangan,
  ]);
}

/** Header 15 kolom — SAMA dengan tabel di layar (tanpa kolom Bulan; bulannya di kop). */
export const DETAIL_BULAN_HEADER = [
  'No', 'Uraian Kegiatan', 'Pagu (Rp)', 'Target Fisik', 'Real Fisik', '% Fisik',
  'Akum. Target', 'Akum. Real Fisik', 'Akum. % Fisik',
  'Real Keuangan (Rp)', '% Real Keu', 'Akum. Keuangan (Rp)', 'Akum. % Keuangan',
  'Deviasi Fisik %', 'Deviasi Keuangan %',
];

/** Sejajar `DETAIL_BULAN_HEADER` (15 kolom). */
const DETAIL_BULAN_JENIS: JenisKolom[] = [
  'nomor', 'uraian',
  'rupiah', 'persen', 'rupiah', 'persen',
  'persen', 'rupiah', 'persen',
  'rupiah', 'persen', 'rupiah', 'persen',
  'persen', 'persen',
];
const DETAIL_BULAN_LEBAR = [5, 42, ...Array(13).fill(15)];

/**
 * Baris satu bulan, urutan kolom persis tabel layar. `angka: true` memulangkan
 * angka mentah (Excel — supaya tetap bisa dijumlah), `false` teks berformat (PDF).
 */
export function barisBulanDetail(rows: RealRow[], angka: boolean, versi: string): (string | number)[][] {
  const n = (v: number) => angka ? v : fmtNum(v);
  const p = (v: number) => angka ? v : tulisPersen(v);
  const isi: (string | number)[][] = rows.map((r, i) => [
    i + 1, `${r.keterangan || '-'}${r.yatim ? ` (${tandaYatim(versi)})` : ''}`, n(r.pagu_awal),
    p(r.target_fisik), n(r.real_fisik), p(r.pct_fisik),
    p(r.akum_target_fisik), n(r.akum_real_fisik), p(r.akum_pct_fisik),
    n(r.real_keuangan), p(r.pct_keuangan),
    n(r.akum_keuangan), p(r.akum_pct_keuangan),
    p(r.deviasi_fisik), p(r.deviasi_keuangan),
  ]);
  // Baris JUMLAH dari lib yang sama dengan layar — bukan dijumlah ulang di sini.
  const j = hitungJumlahBulan(rows);
  isi.push([
    '', 'JUMLAH', n(j.pagu), p(j.targetPct), n(j.realFisik), p(j.pctFisik),
    p(j.akumTgtPct), n(j.akumFisik), p(j.akumPctF),
    n(j.realKeu), p(j.pctKeu), n(j.akumKeu), p(j.akumPctKeu),
    p(j.devFisik), p(j.devKeu),
  ]);
  return isi;
}

/**
 * Dokumen satu bulan: kop + tabel + JUMLAH + catatan yatim + tanda tangan. Bentuknya
 * meniru LAYAR supaya berkasnya bisa ditandatangani dan dikirim. Dipakai Excel DAN PDF,
 * unduhan per-sumber DAN bundel.
 */
export function dokDetailBulan(rows: RealRow[], sumber: SumberSSK, bulan: number, tahun: string, versi: string): DokTabel {
  const isi = barisBulanDetail(rows, true, versi);
  return {
    kop: kopDetail(sumber, bulan, tahun, versi),
    kolom: DETAIL_BULAN_HEADER.map((j, i) => kolom(j, DETAIL_BULAN_JENIS[i], DETAIL_BULAN_LEBAR[i])),
    baris: isi.map((sel, i) => (i === isi.length - 1 ? { sel, total: true } : { sel })),
    catatan: [catatanYatimBulan(hitungJumlahBulan(rows), versi)].filter((c): c is string => c !== null),
    ttd: ttdKinerja(CRR_BULAN_LABELS[bulan - 1] ?? '', tahun),
    mendatar: true,
  };
}

/** Satu halaman per bulan. `halamanBaru` false untuk halaman pertama dokumen. */
export function gambarDetailPdf(
  doc: Dok, autoTable: AutoTable,
  rows: RealRow[], sumber: SumberSSK, tahun: string, bulanDipakai: number[],
  halamanBaru: boolean, versi: string,
) {
  let perluHalaman = halamanBaru;
  for (const b of bulanDipakai) {
    const barisBulan = rows.filter(r => r.bulan === b);
    if (barisBulan.length === 0) continue;
    gambarTabelPdf(doc, autoTable, dokDetailBulan(barisBulan, sumber, b, tahun, versi), { halamanBaru: perluHalaman, huruf: 7 });
    perluHalaman = true;
  }
}

// ─── Excel: blok per bulan, meniru layar ──────────────────────────────────────

type Sheet = import('exceljs').Worksheet;

/**
 * Satu sheet, satu blok per bulan, dipisah page-break — BUKAN satu sheet per
 * bulan: 8 sumber x 12 bulan = 96 sheet tidak bisa dipakai siapa pun. Page break
 * membuat hasil cetaknya tetap satu bulan per halaman, sama dengan Print layar.
 */
export function tulisSheetDetailPerBulan(
  ws: Sheet, rows: RealRow[], sumber: SumberSSK, tahun: string, bulanDipakai: number[], versi: string,
) {
  let mulai = 1;
  for (const b of bulanDipakai) {
    const barisBulan = rows.filter(r => r.bulan === b);
    if (barisBulan.length === 0) continue;
    if (mulai > 1) ws.getRow(mulai - 1).addPageBreak();
    mulai = tulisTabelExcel(ws, dokDetailBulan(barisBulan, sumber, b, tahun, versi), { mulai }).sesudah + 1;
  }
}

/**
 * Bulan yang ikut ke berkas. `bulan` dikirim pemanggil supaya berkasnya memuat
 * bulan yang SAMA dengan yang dilihat di layar — dulu daftarnya dihitung sendiri
 * di sini (`bulanBerdata(rows)`), jadi memilih Januari di layar Cetak tetap
 * mengunduh dua belas bulan tanpa satu tanda pun. Tanpa argumen = seluruh bulan
 * berdata, perilaku lama untuk tab Realisasi yang memang mengekspor setahun.
 */
function lingkupBulan(rows: RealRow[], bulan?: number[]) {
  const dipakai = bulan ?? bulanBerdata(rows);
  return { dipakai, baris: rows.filter(r => dipakai.includes(r.bulan)) };
}

/**
 * Bulan disebut di nama berkas hanya kalau dipilih satu — dua unduhan bulan berbeda tidak
 * boleh bernama sama. Versi disisipkan hanya bila BUKAN versi berlaku (`imbuhanBerkasVersiCetak`).
 */
export function namaBerkasRealisasi(sumber: SumberSSK, tahun: string, bulan: number[], ekstensi: 'xlsx' | 'pdf', versi: VersiCetak) {
  const imbuhan = bulan.length === 1 ? `${CRR_BULAN_LABELS[bulan[0] - 1]}-` : '';
  return `Realisasi-${sumber}-${imbuhanBerkasVersiCetak(versi)}${imbuhan}${tahun}.${ekstensi}`;
}

interface RealisasiExportParams { rows: RealRow[]; sumber: SumberSSK; tahun: string; bulan?: number[]; versi: VersiCetak }

export async function exportRealisasiExcel(params: RealisasiExportParams) {
  const { rows, sumber, tahun, versi } = params;
  const { dipakai, baris } = lingkupBulan(rows, params.bulan);
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  tulisSheetDetailPerBulan(wb.addWorksheet(sumber), baris, sumber, tahun, dipakai, versi.label);
  tulisSheetData(wb, baris, sumber, tahun);
  await downloadWorkbook(wb, namaBerkasRealisasi(sumber, tahun, dipakai, 'xlsx', versi));
}

/**
 * Sheet "Data": satu tabel rata semua bulan (tanpa JUMLAH/tanda tangan).
 *
 * Begitu sheet utama dipecah per bulan, ia berhenti jadi satu tabel — sort, filter,
 * dan pivot tidak bisa dipakai karena kop & baris JUMLAH menyelip di tengah-tengah.
 * Sheet ini mengembalikan kemampuan itu; ia juga yang dibaca Import Realisasi.
 */
export function dokDataRealisasi(rows: RealRow[], sumber: SumberSSK, tahun: string): DokTabel {
  return {
    kop: kop(`DATA REALISASI KINERJA ${sumber}`, periodeTahun(tahun)),
    kolom: DETAIL_HEADER.map((j, i) => kolom(j, DETAIL_JENIS[i], i === 2 ? 30 : i === 1 ? 12 : i === 0 ? 5 : 14)),
    baris: realisasiAoa(rows).map(sel => ({ sel })),
    mendatar: true,
  };
}

export function tulisSheetData(wb: import('exceljs').Workbook, rows: RealRow[], sumber: SumberSSK, tahun: string) {
  tulisTabelExcel(wb.addWorksheet(`Data ${sumber}`.slice(0, 31)), dokDataRealisasi(rows, sumber, tahun));
}

export async function exportRealisasiPdf(params: RealisasiExportParams) {
  const { rows, sumber, tahun, versi } = params;
  const { dipakai, baris } = lingkupBulan(rows, params.bulan);
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  gambarDetailPdf(doc, autoTable, baris, sumber, tahun, dipakai, false, versi.label);
  kakiDokPdf(doc, MODUL_KINERJA);
  doc.save(namaBerkasRealisasi(sumber, tahun, dipakai, 'pdf', versi));
}

// ─── CRR ──────────────────────────────────────────────────────────────────────

export function dokCrr(rows: CrrRow[], tahun: string): DokTabel {
  return {
    kop: kop('COST RECOVERY RATE (CRR)', periodeTahun(tahun)),
    kolom: [
      kolom('No', 'nomor'), kolom('Bulan', 'teks', 14),
      kolom('Pendapatan', 'rupiah', 16), kolom('Belanja BLUD', 'rupiah', 16), kolom('Belanja Daerah', 'rupiah', 16),
      kolom('Pend. s/d', 'rupiah', 16), kolom('Belanja BLUD s/d', 'rupiah', 16), kolom('Belanja Daerah s/d', 'rupiah', 16),
      kolom('CRR Parsial %', 'persen', 12), kolom('CRR Total %', 'persen', 12),
    ],
    baris: rows.map((r, i) => ({ sel: [i + 1, r.bulan, r.pendapatan, r.belanja_blud, r.belanja_daerah, r.pendapatan_sd, r.belanja_blud_sd, r.belanja_daerah_sd, r.crr_parsial_pct, r.crr_total_pct] })),
    mendatar: true,
  };
}

export async function exportCrrExcel(params: { rows: CrrRow[]; tahun: string }) {
  const { rows, tahun } = params;
  await unduhSatuLembar(dokCrr(rows, tahun), `CRR ${tahun}`, `CRR-${tahun}.xlsx`);
}

// ─── Pendapatan ───────────────────────────────────────────────────────────────
// Import Pendapatan membaca berkas ini (kolom Keterangan berisi nama bulan) — judul tetap.

export function dokPendapatan(rows: PendRow[], tahun: string): DokTabel {
  const jumlah = (f: (r: PendRow) => number) => rows.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  const capaian = (real: number, target: number) => (target ? Math.round((real / target) * 10000) / 100 : 0);
  // Ada Target Perubahan → kedua kolom ditulis berdampingan; capaian dari target berlaku.
  const perubahan = adaTargetPerubahan(rows);
  const tgt = jumlah(r => (perubahan ? targetBerlaku(r) : r.target));
  const real = jumlah(r => r.realisasi);
  return {
    kop: kop('LAPORAN PENDAPATAN', periodeTahun(tahun)),
    kolom: perubahan
      ? [kolom('No', 'nomor'), kolom('Keterangan', 'uraian', 40), kolom('Target Murni', 'rupiah', 17), kolom('Target Perubahan', 'rupiah', 17), kolom('Realisasi', 'rupiah', 17), kolom('Capaian %', 'persen', 12)]
      : [kolom('No', 'nomor'), kolom('Keterangan', 'uraian', 40), kolom('Target', 'rupiah', 17), kolom('Realisasi', 'rupiah', 17), kolom('Capaian %', 'persen', 12)],
    baris: [
      ...rows.map((r, i): BarisDok => ({ sel: perubahan
        ? [i + 1, r.keterangan, r.target, targetBerlaku(r), r.realisasi, capaianPendapatan(r)]
        : [i + 1, r.keterangan, r.target, r.realisasi, r.capaian_pct] })),
      ...(rows.length ? [{ total: true, sel: perubahan
        ? ['', 'JUMLAH', jumlah(r => r.target), tgt, real, capaian(real, tgt)]
        : ['', 'JUMLAH', tgt, real, capaian(real, tgt)] } satisfies BarisDok] : []),
    ],
    mendatar: false,
  };
}

export async function exportPendapatanExcel(params: { rows: PendRow[]; tahun: string }) {
  const { rows, tahun } = params;
  await unduhSatuLembar(dokPendapatan(rows, tahun), `Pendapatan ${tahun}`, `Pendapatan-${tahun}.xlsx`);
}

// ─── Laporan Konsolidasi (2 sheets: Ringkasan + Trend Bulanan) ────────────────

export async function exportLaporanExcel(params: { data: LaporanSumber; tahun: string }) {
  await downloadWorkbook(await buatWorkbookLaporan(params.data, params.tahun), `Laporan-${params.data.sumber}-${params.tahun}.xlsx`);
}

const kopLaporan = (data: LaporanSumber, tahun: string, judul: string) =>
  kop(`${judul} — ${data.sumber}`, periodeTahun(tahun), `Data s/d bulan ${CRR_BULAN_LABELS[data.bulan_terakhir - 1] ?? '-'}`);

export function dokRingkasanLaporan(data: LaporanSumber, tahun: string): DokTabel {
  return {
    kop: kopLaporan(data, tahun, 'LAPORAN KONSOLIDASI'),
    kolom: [kolom('Keterangan', 'teks', 30), kolom('Nilai', 'rupiah', 24)],
    baris: [
      ['Sumber Anggaran', data.sumber],
      ['Total Pagu', data.total_pagu],
      ['Total Target Fisik', data.total_target_fisik],
      ['Total Realisasi Keuangan', data.total_real_keuangan],
      ['Total Realisasi Fisik', data.total_real_fisik],
      ['% Serapan Keuangan', data.pct_serapan],
      ['% Capaian Fisik', data.pct_fisik],
      ['Bulan Terakhir Data', CRR_BULAN_LABELS[data.bulan_terakhir - 1] ?? '-'],
    ].map(sel => ({ sel })),
    tanpaNomorKolom: true,
    mendatar: false,
  };
}

const TREND_HEADER = ['Bulan', 'Real Keuangan (Rp)', '% Real Keu', 'Akum Keuangan (Rp)', 'Akum % Keuangan', 'Real Fisik (Rp)', 'Akum % Fisik'];
const TREND_JENIS: JenisKolom[] = ['teks', 'rupiah', 'persen', 'rupiah', 'persen', 'rupiah', 'persen'];

export function dokTrendLaporan(data: LaporanSumber, tahun: string): DokTabel {
  return {
    kop: { ...kopLaporan(data, tahun, 'TREND BULANAN'), keterangan: ringkasLaporanPdf(data) },
    kolom: TREND_HEADER.map((j, i) => kolom(j, TREND_JENIS[i], i === 0 ? 14 : 16)),
    baris: data.trend.map(t => ({ sel: [
      CRR_BULAN_LABELS[t.bulan - 1] ?? t.bulan,
      t.real_keuangan, t.pct_keuangan, t.akum_keuangan, t.akum_pct_keuangan, t.real_fisik, t.akum_pct_fisik,
    ] })),
    ttd: ttdKinerja(CRR_BULAN_LABELS[data.bulan_terakhir - 1] ?? '', tahun),
    mendatar: true,
  };
}

/** Dipisah dari tombol unduh supaya isi selnya bisa diuji di Node. */
export async function buatWorkbookLaporan(data: LaporanSumber, tahun = '') {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();

  const wsSum = wb.addWorksheet('Ringkasan');
  const letak = tulisTabelExcel(wsSum, dokRingkasanLaporan(data, tahun));
  // Kolom Nilai campur rupiah, persen, dan nama bulan: baris persen ditimpa per sel
  // (tetap ANGKA, bisa dihitung).
  for (let r = letak.dataAwal; r < letak.dataAwal + 8; r++) {
    if (String(wsSum.getRow(r).getCell(1).value ?? '').startsWith('%')) wsSum.getRow(r).getCell(2).numFmt = FMT_PERSEN;
  }

  tulisTabelExcel(wb.addWorksheet('Trend Bulanan'), dokTrendLaporan(data, tahun));
  return wb;
}

export function barisLaporanPdf(data: LaporanSumber): string[][] {
  return teksBarisPdf(dokTrendLaporan(data, ''));
}

export function ringkasLaporanPdf(data: LaporanSumber): string {
  return `Pagu: ${fmtRp(data.total_pagu)}   Real Keuangan: ${fmtRp(data.total_real_keuangan)}   Serapan: ${tulisPersen(data.pct_serapan)}   Capaian Fisik: ${tulisPersen(data.pct_fisik)}`;
}

export async function exportLaporanPdf(params: { data: LaporanSumber; tahun: string }) {
  const { data, tahun } = params;
  await unduhPdf(dokTrendLaporan(data, tahun), `Laporan-${data.sumber}-${tahun}.pdf`);
}

// ─── Master ───────────────────────────────────────────────────────────────────

/**
 * Judul sheet = TIPE master. Bukan hiasan: itu satu-satunya penanda yang dipakai
 * pembaca berkasnya (lib/data/kinerja-import-master.ts) untuk tahu sebuah nama
 * itu Program atau Kegiatan — isinya sendiri tidak membedakan.
 */
export const MASTER_SHEET: { tipe: MasterTipe; sheet: string }[] = [
  { tipe: 'program',         sheet: 'Program' },
  { tipe: 'kegiatan',        sheet: 'Kegiatan' },
  { tipe: 'subkegiatan',     sheet: 'Sub Kegiatan' },
  { tipe: 'uraian_ssk',      sheet: 'Uraian SSK' },
  { tipe: 'sumber_anggaran', sheet: 'Sumber Anggaran' },
];

export const MASTER_HEADER = ['No', 'Nama', 'Program', 'Kegiatan', 'Sub Kegiatan'];

/** Baris tiap sheet Master, dari MasterOpts yang sudah dipegang layar. */
export function masterAoa(opts: MasterOpts, tipe: MasterTipe): (string | number)[][] {
  const dariRows = (rows: MasterRow[], nama: string[]) =>
    nama.map(n => rows.find(r => r.nama === n) ?? null);

  const baris = (nama: string[], rows: (MasterRow | null)[]) =>
    nama.map((n, i) => [
      i + 1, n,
      rows[i]?.program_ref ?? '', rows[i]?.kegiatan_ref ?? '', rows[i]?.subkegiatan_ref ?? '',
    ]);

  switch (tipe) {
    case 'program':         return baris(opts.program, opts.program.map(() => null));
    case 'kegiatan':        return baris(opts.kegiatan, dariRows(opts.kegiatanRows, opts.kegiatan));
    case 'subkegiatan':     return baris(opts.subkegiatan, dariRows(opts.subkegiatanRows, opts.subkegiatan));
    case 'uraian_ssk':      return baris(opts.uraian_ssk, dariRows(opts.sskRows, opts.uraian_ssk));
    case 'sumber_anggaran': return baris(opts.sumber_anggaran, opts.sumber_anggaran.map(() => null));
  }
}

export function dokMaster(opts: MasterOpts, tipe: MasterTipe, sheet: string, tahun: string): DokTabel {
  return {
    kop: kop(`MASTER ${sheet.toUpperCase()}`, periodeTahun(tahun)),
    kolom: [kolom('No', 'nomor'), kolom('Nama', 'uraian', 55), kolom('Program', 'teks', 40), kolom('Kegiatan', 'teks', 35), kolom('Sub Kegiatan', 'teks', 35)],
    baris: masterAoa(opts, tipe).map(sel => ({ sel })),
    mendatar: true,
  };
}

/** Satu workbook berisi KELIMA tipe — supaya sekali unduh bisa diimpor balik utuh. */
export async function exportMasterExcel(params: { opts: MasterOpts; tahun: string }) {
  const { opts, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  for (const { tipe, sheet } of MASTER_SHEET) tulisTabelExcel(wb.addWorksheet(sheet), dokMaster(opts, tipe, sheet, tahun));
  await downloadWorkbook(wb, `Master-E-Anggaran-${tahun}.xlsx`);
}

// ─── Bundel: Rekap + Detail per sumber dalam SATU berkas ──────────────────────
//
// Excel = satu SHEET per bagian, bukan ditumpuk. Rekap 13 kolom, Detail 15 —
// menumpuknya di satu lembar membuat kolom tidak segaris, dan berkasnya jadi
// tidak bisa disortir/disaring/dirumuskan. Sheet memang untuk itu.
// PDF = bertumpuk, karena kertas memang bertumpuk: halaman rekap, lalu halaman
// tiap sumber lengkap dengan kop & tanda tangan.
//
// Keduanya memakai penyusun yang SAMA dengan unduhan satuan (`dokRekap`,
// `dokDetailBulan`, `dokDataRealisasi`) — yang diunduh wajib memuat angka yang
// persis sama dengan yang dilihat di layar.

export interface BagianDetail {
  sumber: SumberSSK;
  rows:   RealRow[];
  /** Bulan yang dicetak untuk sumber ini — sudah disaring pemanggil. */
  bulan:  number[];
  /** Label versi SSK sumber ini (dari `versiRekap`, bukan `sskVersi` layar Detail). */
  versi:  string;
}

export interface BundelParams extends RekapExportParams {
  detail: BagianDetail[];
}

/** Bundel memuat Rekap, jadi pilihan versinya ikut ditandai — aturan `namaBerkasRekap`. */
export function namaBundel(pilihan: PilihanVersiRekap, namaBulan: string, tahun: string, ext: string) {
  return `Laporan-Realisasi-${imbuhanBerkasVersi(pilihan)}${tahun}-sd-${namaBulan}.${ext}`;
}

export async function exportBundelExcel(params: BundelParams) {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();

  tulisTabelExcel(wb.addWorksheet('Rekap'), dokRekap(params));

  for (const bagian of params.detail) {
    const baris = bagian.rows.filter(r => bagian.bulan.includes(r.bulan));
    if (baris.length === 0) continue;
    tulisSheetDetailPerBulan(wb.addWorksheet(bagian.sumber), baris, bagian.sumber, params.tahun, bagian.bulan, bagian.versi);
    tulisSheetData(wb, baris, bagian.sumber, params.tahun);
  }

  await downloadWorkbook(wb, namaBundel(params.pilihanVersi, params.namaBulan, params.tahun, 'xlsx'));
}

export async function exportBundelPdf(params: BundelParams) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  gambarRekapPdf(doc, autoTable, params);

  for (const bagian of params.detail) {
    const baris = bagian.rows.filter(r => bagian.bulan.includes(r.bulan));
    if (baris.length === 0) continue;
    // halamanBaru = true: tiap sumber selalu mulai di halaman sendiri.
    gambarDetailPdf(doc, autoTable, baris, bagian.sumber, params.tahun, bagian.bulan, true, bagian.versi);
  }

  kakiDokPdf(doc, MODUL_KINERJA);
  doc.save(namaBundel(params.pilihanVersi, params.namaBulan, params.tahun, 'pdf'));
}
