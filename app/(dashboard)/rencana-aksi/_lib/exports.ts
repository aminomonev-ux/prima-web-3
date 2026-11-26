'use client';

import type { RaRow } from './types';
import { realisasiAkhirTahun, tulisRealisasi, quartersOf, LEVEL_LABELS, outcomeOf, capaianTahunan, capaianRpjmd, capaianTriwulan } from './types';
import type { CetakFilter } from './cetak-filter';
import { DEFAULT_CETAK_FILTER, buildCetakRows, cetakRollupBase, cetakHeader, catatanPaguCetak, lebarKolomPdf, tulisSelCetak } from './cetak-filter';
import { sanitizeCell, loadExcelJs } from '@/lib/shared/excel-export';
import { tulisDesimal, tulisPersen } from '@/lib/shared/desimal';
import { polosSelExcel } from '@/lib/shared/excel-sel';
import { cariBarisKepala } from '@/lib/shared/impor-tabel';
import { kakiDokPdf, kopDokPdf, periodeTahun, rgb, gayaKepalaExcel, hiasSelData, type KopDok, type DokPdf } from '@/lib/shared/gaya-dokumen';
import { tulisTabelExcel, gambarTabelPdf, teksSelPdf, type DokTabel, type KolomDok, type JenisKolom, type SelKepala } from '@/lib/shared/tabel-dokumen';
import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';

/** Unduhan tidak memuat penanda matriks (bintang, "(1)") yang ikut tersimpan lewat impor. */
function barisBersih(r: RaRow): RaRow {
  return {
    ...r,
    program: rapikanNamaEntitas(r.program),
    kegiatan: r.kegiatan == null ? r.kegiatan : rapikanNamaEntitas(r.kegiatan),
    sub_kegiatan: r.sub_kegiatan == null ? r.sub_kegiatan : rapikanNamaEntitas(r.sub_kegiatan),
    indikator: rapikanIndikator(r.indikator),
  };
}

let _pdf: Promise<{ jsPDF: typeof import('jspdf').jsPDF; autoTable: typeof import('jspdf-autotable').default }> | null = null;
function loadPdf() {
  if (!_pdf) _pdf = Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([pdf, table]) => ({ jsPDF: pdf.jsPDF, autoTable: table.default }));
  return _pdf;
}

// Penolong bersama: menangani interop CJS sehingga berkas ini juga bisa dijalankan uji di Node.
const loadXlsx = loadExcelJs;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

// ─── Gaya dokumen bersama ────────────────────────────────────────────────────
// Semua tabel lewat lib/shared/tabel-dokumen.ts (kop, kepala navy, nomor kolom, kaki halaman) —
// konsep docs/konsep/sistem/CONCEPT-format-unduhan-seragam.md. Berkas ini menyusun DATA-nya.

export const MODUL_RENAKSI = 'RENCANA AKSI';

const kopRenaksi = (judul: string, tahun: number | null | undefined, keterangan?: string | null): KopDok =>
  ({ judul, subjudul: 'RENCANA AKSI & KINERJA', periode: periodeTahun(tahun), keterangan: keterangan ?? null, modul: MODUL_RENAKSI });

const kol = (judul: string, jenis: JenisKolom, lebar?: number): KolomDok => ({ judul, jenis, ...(lebar ? { lebar } : {}) });

function pdfBaru(jsPDF: typeof import('jspdf').jsPDF, mendatar = true) {
  return new jsPDF({ orientation: mendatar ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
}

// ─── Export tabel list (Data Entry) ─────────────────────────────────────────

export async function exportListPdf(mentah: RaRow[], tahun: number, level: RaRow['level']) {
  (await buatPdfList(mentah, tahun, level)).save(`rencana-aksi-${level}-${tahun}.pdf`);
}

/** Dokumen PDF daftar Data Entry (kolom ringkas: TW ditulis R/T). */
export function dokListPdf(mentah: RaRow[], tahun: number, level: RaRow['level']): DokTabel {
  const rows = mentah.map(barisBersih);
  return {
    kop: kopRenaksi(`DATA ENTRY ${LEVEL_LABELS[level].toUpperCase()}`, tahun, `Total ${rows.length} indikator`),
    kolom: [
      kol('No', 'nomor', 6), kol('Program/Sasaran', 'teks', 26), kol('Kegiatan', 'teks', 22), kol('Sub Kegiatan', 'teks', 22),
      kol('Sasaran (Outcome)', 'teks', 30), kol('Indikator', 'uraian', 34), kol('Jenis', 'teks', 12), kol('Satuan', 'teks', 10),
      kol('RPJMD', 'desimal', 9), kol('Tahunan', 'desimal', 9),
      kol('TW1 R/T', 'teks', 10), kol('TW2 R/T', 'teks', 10), kol('TW3 R/T', 'teks', 10), kol('TW4 R/T', 'teks', 10),
    ],
    baris: rows.map((r, i) => ({ sel: [
      i + 1, r.program, r.kegiatan ?? '—', r.sub_kegiatan ?? '—', outcomeOf(r) || '—', r.indikator, r.jenis, r.satuan,
      r.target_rpjmd, r.target_tahunan,
      // Realisasi belum diisi = "—", bukan kosong (dulu tercetak "/5").
      `${tulisRealisasi(r.q1_realisasi)}/${tulisDesimal(r.q1_target)}`,
      `${tulisRealisasi(r.q2_realisasi)}/${tulisDesimal(r.q2_target)}`,
      `${tulisRealisasi(r.q3_realisasi)}/${tulisDesimal(r.q3_target)}`,
      `${tulisRealisasi(r.q4_realisasi)}/${tulisDesimal(r.q4_target)}`,
    ] })),
    mendatar: true,
  };
}

/** Dipisah dari tombolnya supaya isi berkas bisa diperiksa di Node. */
export async function buatPdfList(mentah: RaRow[], tahun: number, level: RaRow['level']) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = pdfBaru(jsPDF);
  gambarTabelPdf(doc, autoTable, dokListPdf(mentah, tahun, level), { huruf: 7 });
  kakiDokPdf(doc, MODUL_RENAKSI);
  return doc;
}

/**
 * `induk` = baris tingkat di atasnya (untuk kolom "Indikator Induk" — teks indikator yang
 * dijabarkan, dibaca balik oleh Import Renaksi). Tanpa `induk` / tingkat tujuan: kolomnya tidak ada.
 */
export async function exportListXlsx(mentah: RaRow[], tahun: number, level: RaRow['level'], induk: RaRow[] = []) {
  const wb = await buatWorkbookList(mentah, level, induk);
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${level}-${tahun}.xlsx`);
}

const KOLOM_ENTITAS: Record<RaRow['level'], [string, string][]> = {
  tujuan: [['Tujuan', 'e_tujuan']],
  sasaran: [['Tujuan', 'e_tujuan'], ['Sasaran', 'e_sasaran']],
  program: [['Sasaran', 'e_sasaran'], ['Program', 'e_program']],
  kegiatan: [['Program', 'e_program'], ['Kegiatan', 'e_kegiatan']],
  'sub-kegiatan': [['Program', 'e_program'], ['Kegiatan', 'e_kegiatan'], ['Sub Kegiatan', 'e_sub']],
};

/**
 * Dokumen Excel daftar Data Entry. Judul kolom dikenali Import Renaksi — unduhan ini
 * diimpor balik (kop & baris nomor kolom dilewati pembacanya, lib/shared/impor-tabel.ts).
 */
export function dokList(mentah: RaRow[], level: RaRow['level'], induk: RaRow[] = []): DokTabel {
  const rows = mentah.map(barisBersih);
  const pakaiInduk = level !== 'tujuan' && induk.length > 0;
  const teksInduk = new Map(induk.map(r => [r.id, rapikanIndikator(r.indikator)]));
  // Kolom entitas per tingkat: tingkat itu + induknya, dengan judul yang dikenali Import Renaksi
  // (dulu satu kolom "Program/Sasaran" ambigu → unduhan tidak bisa diimpor balik).
  const entitas = KOLOM_ENTITAS[level];
  const kolom: [KolomDok, (r: RaRow, i: number) => string | number | null][] = [
    [kol('No', 'nomor', 5), (_, i) => i + 1],
    ...entitas.map(([judul, key]): [KolomDok, (r: RaRow) => string] => [kol(judul, 'teks', 32), r => ({
      e_tujuan: rapikanNamaEntitas((level === 'tujuan' ? r.program : r.tujuan) ?? ''),
      e_sasaran: rapikanNamaEntitas((level === 'sasaran' ? r.program : r.sasaran) ?? ''),
      e_program: r.program, e_kegiatan: r.kegiatan ?? '', e_sub: r.sub_kegiatan ?? '',
    } as Record<string, string>)[key]]),
    [kol('Kode', 'kode', 16), r => r.kode ?? ''],
    [kol('Sasaran (Outcome)', 'teks', 38), r => outcomeOf(r)],
    [kol('Indikator', 'uraian', 40), r => r.indikator],
    ...(pakaiInduk ? [[kol('Indikator Induk', 'teks', 40), (r: RaRow) => (r.induk_indikator_id != null ? (teksInduk.get(r.induk_indikator_id) ?? '') : '')] as [KolomDok, (r: RaRow) => string]] : []),
    [kol('Jenis', 'teks', 14), r => r.jenis],
    [kol('Satuan', 'teks', 10), r => r.satuan],
    [kol('Target RPJMD', 'desimal', 13), r => r.target_rpjmd],
    [kol('Target Tahunan', 'desimal', 14), r => r.target_tahunan],
    ...([1, 2, 3, 4] as const).flatMap(q => [
      [kol(`TW${q} Target`, 'desimal', 10), (r: RaRow) => r[`q${q}_target`]],
      [kol(`TW${q} Realisasi`, 'desimal', 12), (r: RaRow) => r[`q${q}_realisasi`] ?? '—'],
    ] as [KolomDok, (r: RaRow) => string | number | null][]),
    [kol('Real Akhir', 'desimal', 12), r => realisasiAkhirTahun(r) ?? '—'],
  ];
  return {
    kop: kopRenaksi(`DATA ENTRY ${LEVEL_LABELS[level].toUpperCase()}`, mentah[0]?.tahun ?? null),
    kolom: kolom.map(([k]) => k),
    baris: rows.map((r, i) => ({ sel: kolom.map(([, nilai]) => nilai(r, i)) })),
    mendatar: true,
  };
}

/** Dipisah dari tombolnya supaya isi berkas bisa diuji di Node (bolak-balik dengan Import Renaksi). */
export async function buatWorkbookList(mentah: RaRow[], level: RaRow['level'], induk: RaRow[] = []) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  tulisTabelExcel(wb.addWorksheet(LEVEL_LABELS[level]), dokList(mentah, level, induk));
  return wb;
}

// ─── Export gabungan hierarki (Menu Cetak) ─────────────────────────────────
// Filter-aware: kolom & baris ikut `CetakFilter` (sumber: _lib/cetak-filter.ts)
// supaya hasil PDF/Excel = yang tampil di layar. Header bergrup: lead (rowSpan 2)
// · grup TW (colSpan = jumlah sub T/R aktif) · tail. Tanpa Triwulan → 1 baris datar.

function xlsxColWidth(key: string): number {
  if (key === 'no') return 5;
  if (key === 'indikator' || key === 'outcome') return 38;
  if (key === 'tujuan' || key === 'sasaran' || key === 'program' || key === 'kegiatan' || key === 'sub_kegiatan') return 28;
  if (key === 'anggaran') return 16;
  if (key === 'sumber_anggaran') return 30;
  if (key === 'jenis') return 14;
  return 10;
}

/**
 * Dokumen Cetak gabungan — SATU susunan untuk Excel DAN PDF. Angka tetap ANGKA di Excel
 * (persen 85,5 disimpan 0,855 berformat 0.00%); teks PDF = `tulisSelCetak` (= layar).
 */
export function dokGabungan(allRows: RaRow[], tahun: number | null, filter: CetakFilter = DEFAULT_CETAK_FILTER): DokTabel {
  const hier = buildCetakRows(allRows, filter);
  const rollup = cetakRollupBase(allRows, filter);
  const hdr = cetakHeader(filter);
  const kepala: SelKepala[][] = hdr.twQuarters.length
    ? [
        [
          ...hdr.lead.map(c => ({ teks: c.header, rowSpan: 2 })),
          // 1 sub (Target ATAU Realisasi saja) → label gabung "TWn T/R", rentang tegak.
          ...hdr.twQuarters.map(t => (t.sub.length === 1 ? { teks: `TW${t.q} ${t.sub[0].header}`, rowSpan: 2 } : { teks: `TW${t.q}`, colSpan: t.sub.length })),
          ...hdr.tail.map(c => ({ teks: c.header, rowSpan: 2 })),
        ],
        hdr.twQuarters.flatMap(t => (t.sub.length === 1 ? [] : t.sub.map(s => ({ teks: s.header })))),
      ]
    : [[...hdr.lead, ...hdr.tail].map(c => ({ teks: c.header }))];
  return {
    // Pemisah pakai » (WinAnsi 0xBB), BUKAN → (U+2192): font bawaan jsPDF cuma paham WinAnsi
    // (Gate F, scripts/check-pdf-glyphs.mjs).
    kop: kopRenaksi('RENCANA AKSI & KINERJA', tahun, 'Tujuan » Sasaran » Program » Kegiatan » Sub Kegiatan'),
    kepala,
    kolom: hdr.flat.map(c => ({
      judul: c.header,
      jenis: c.key === 'no' ? 'nomor' : c.key === 'indikator' ? 'uraian' : c.money ? 'rupiah' : c.persen ? 'persen' : c.align === 'right' ? 'desimal' : 'teks',
      lebar: xlsxColWidth(c.key),
      ...(c.persen ? { numFmt: '0.00%', teksPdf: (v: number) => tulisSelCetak(c, v * 100) } : { teksPdf: (v: number) => tulisSelCetak(c, v) }),
    })),
    baris: hier.map(h => ({ sel: hdr.flat.map(c => {
      const v = c.value(h, rollup);
      // Persen tetap ANGKA supaya bisa dihitung di Excel: 85,5 disimpan 0,855 berformat 0.00%.
      if (c.persen && typeof v === 'number') return v / 100;
      if ((c.persen || c.realisasi) && v == null) return tulisSelCetak(c, v);
      return v;
    }) })),
    catatan: catatanPaguCetak(rollup, filter).map(c => `Catatan: ${c}`),
    mendatar: true,
  };
}

export async function buildCombinedPdf(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = pdfBaru(jsPDF);
  const dok = dokGabungan(allRows, tahun, filter);
  if (!dok.baris.length) {
    const y = kopDokPdf(doc as unknown as DokPdf, dok.kop);
    doc.setFontSize(10);
    doc.setTextColor(140);
    doc.text('— Belum ada data —', 14, y + 6);
    doc.setTextColor(0);
    kakiDokPdf(doc as unknown as DokPdf, MODUL_RENAKSI);
    return doc;
  }

  const tepi = 10;
  const huruf = 6;
  const padding = 1.2;
  const hdr = cetakHeader(filter);
  const body = dok.baris.map(b => dok.kolom.map((k, i) => teksSelPdf(k, b.sel[i])));
  // Kata terpanjang tiap kolom (isi + judul) di ukuran huruf tabel → batas bawah lebar kolom teks.
  doc.setFontSize(huruf);
  const kataTerpanjang = (s: string) => s.split(/\s+/).reduce((m, w) => Math.max(m, w ? doc.getTextWidth(w) : 0), 0);
  const minKata = hdr.flat.map((c, i) =>
    Math.max(kataTerpanjang(c.header) * 1.1, ...body.map(r => kataTerpanjang(r[i]))) + 2 * padding + 0.6);
  const lebar = lebarKolomPdf(hdr.flat, doc.internal.pageSize.getWidth() - 2 * tepi, minKata);
  gambarTabelPdf(doc, autoTable, dok, { huruf, lebarKolom: lebar });
  kakiDokPdf(doc as unknown as DokPdf, MODUL_RENAKSI);
  return doc;
}

export async function exportCombinedPdf(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const doc = await buildCombinedPdf(allRows, tahun, filter);
  doc.save(`rencana-aksi-${tahun}-gabungan.pdf`);
}

export async function exportCombinedXlsx(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const wb = await buatWorkbookGabungan(allRows, filter, tahun);
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${tahun}-gabungan.xlsx`);
}

/** Dipisah dari unduhannya supaya isi berkasnya bisa diperiksa uji regresi. */
export async function buatWorkbookGabungan(allRows: RaRow[], filter: CetakFilter = DEFAULT_CETAK_FILTER, tahun: number | null = allRows[0]?.tahun ?? null) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  tulisTabelExcel(wb.addWorksheet('Renaksi & Kinerja'), dokGabungan(allRows, tahun, filter));
  return wb;
}

// ─── Export 1 indikator (Dashboard Kinerja) ────────────────────────────────

export async function exportIndikatorPdf(mentah: RaRow) {
  (await buatPdfIndikator(mentah)).save(`rencana-aksi-${mentah.level}-${mentah.tahun}-detail.pdf`);
}

const persenTeks = (p: number | null) => (p === null ? '—' : tulisPersen(p));

/** Dua dokumen satu indikator: ringkasan (Uraian · Nilai) dan tabel triwulan. */
export function dokIndikator(mentah: RaRow): { ringkasan: DokTabel; triwulan: DokTabel } {
  const row = barisBersih(mentah);
  const realAkhir = realisasiAkhirTahun(row);
  const kop = kopRenaksi(`${LEVEL_LABELS[row.level].toUpperCase()} — DETAIL INDIKATOR`, row.tahun, row.indikator);
  return {
    ringkasan: {
      kop,
      // Angka tetap ANGKA di Excel; PDF berkoma (7,5, bukan 7.5) lewat tulisDesimal.
      kolom: [kol('Uraian', 'teks', 28), { ...kol('Nilai', 'teks', 60), teksPdf: v => tulisDesimal(v) }],
      baris: ([
        ['Tahun', String(row.tahun)],
        ['Level', LEVEL_LABELS[row.level]],
        ['Program/Sasaran', row.program],
        ['Kegiatan', row.kegiatan ?? '—'],
        ['Sub Kegiatan', row.sub_kegiatan ?? '—'],
        ['Sasaran (Outcome)', outcomeOf(row) || '—'],
        ['Indikator', row.indikator],
        ['Jenis', row.jenis],
        ['Satuan', row.satuan],
        ['Target RPJMD', row.target_rpjmd],
        ['Target Tahunan', row.target_tahunan],
        ['Realisasi Akhir', realAkhir ?? '—'],
        ['Capaian Tahunan (%)', persenTeks(capaianTahunan(row))],
        ['Capaian RPJMD (%)', persenTeks(capaianRpjmd(row))],
      ] as [string, string | number][]).map(sel => ({ sel })),
      tanpaNomorKolom: true,
      mendatar: false,
    },
    triwulan: {
      kop,
      kolom: [kol('Triwulan', 'teks', 18), kol('Target', 'desimal', 14), kol('Realisasi', 'desimal', 14), kol('Capaian %', 'desimal', 14)],
      baris: quartersOf(row).map(q => {
        // Satu aturan dengan layar: target 0 / belum bisa dihitung = "—".
        const pct = capaianTriwulan(row, q.id);
        return { sel: [`TW ${q.id}`, q.target, q.realisasi ?? '—', pct == null ? '—' : Math.round(pct * 100) / 100] };
      }),
      mendatar: false,
    },
  };
}

export async function buatPdfIndikator(mentah: RaRow) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = pdfBaru(jsPDF, false);
  const { ringkasan, triwulan } = dokIndikator(mentah);
  const y = gambarTabelPdf(doc, autoTable, ringkasan, { huruf: 9 });
  autoTable(doc, {
    ...{ theme: 'grid' },
    startY: y + 4,
    margin: { left: 10, right: 10, bottom: 14 },
    head: [triwulan.kolom.map(k => k.judul), triwulan.kolom.map((_, i) => `(${i + 1})`)],
    body: triwulan.baris.map(b => triwulan.kolom.map((k, i) => (typeof b.sel[i] === 'number' && k.judul === 'Capaian %' ? persenTeks(b.sel[i] as number) : teksSelPdf(k, b.sel[i])))),
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: rgb('garisTegak'), lineWidth: 0.1, textColor: rgb('teks') },
    headStyles: { fillColor: rgb('navy'), textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.row.index === 1) {
        d.cell.styles.fillColor = rgb('biru1'); d.cell.styles.textColor = rgb('navy');
        d.cell.styles.fontStyle = 'italic'; d.cell.styles.fontSize = 7;
      }
    },
  });
  kakiDokPdf(doc as unknown as DokPdf, MODUL_RENAKSI);
  return doc;
}

export async function exportIndikatorXlsx(mentah: RaRow) {
  const buf = await (await buatWorkbookIndikator(mentah)).xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${mentah.level}-${mentah.tahun}-detail.xlsx`);
}

export async function buatWorkbookIndikator(mentah: RaRow) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Detail Indikator');
  const { ringkasan, triwulan } = dokIndikator(mentah);
  const letak = tulisTabelExcel(ws, ringkasan);
  // Tabel triwulan di bawah ringkasan, kepala navy sama (tanpa kop kedua).
  const mulai = letak.sesudah + 1;
  const kepala = ws.getRow(mulai);
  triwulan.kolom.forEach((k, i) => { kepala.getCell(i + 1).value = k.judul; gayaKepalaExcel(kepala.getCell(i + 1)); });
  triwulan.baris.forEach((b, j) => {
    const r = ws.getRow(mulai + 1 + j);
    b.sel.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = typeof v === 'string' ? sanitizeCell(v) : v ?? null;
      hiasSelData(c, { angka: i > 0, volume: true });
      // "—" teks dirata kanan seperti angka di kolomnya.
      if (i > 0) c.alignment = { horizontal: 'right', vertical: 'top' };
    });
    r.getCell(4).numFmt = '0.00';
  });
  return wb;
}

// ─── Matriks Bulanan: export template + parse import ────────────────────────
// Layout tetap (kolom A..R): ID | Program | Kegiatan | Sub Kegiatan | Indikator |
// Satuan | Jan..Des. Import mencocokkan baris via kolom ID.

const MATRIX_HEAD = ['ID', 'Program', 'Kegiatan', 'Sub Kegiatan', 'Indikator', 'Satuan',
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function exportMatrixBulananXlsx(mentah: RaRow[], tahun: number) {
  const buf = await (await buatWorkbookMatriks(mentah, tahun)).xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${tahun}-realisasi-bulanan.xlsx`);
}

export async function buatWorkbookMatriks(mentah: RaRow[], tahun: number) {
  // Diimpor balik lewat kolom ID, jadi nama boleh ditulis bersih.
  const rows = mentah.map(barisBersih);
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Realisasi Bulanan ${tahun}`);
  tulisTabelExcel(ws, {
    kop: kopRenaksi('MATRIKS REALISASI BULANAN', tahun, 'Kolom ID jangan diubah — dipakai untuk mencocokkan baris saat diimpor balik.'),
    kolom: MATRIX_HEAD.map((judul, i) => kol(judul, i === 0 ? 'kode' : i === 4 ? 'uraian' : i >= 6 ? 'desimal' : 'teks', i === 0 ? 8 : i === 4 ? 45 : i === 5 ? 10 : i >= 6 ? 8 : 28)),
    baris: rows.map(r => {
      const months = Array.isArray(r.bulan_realisasi) && r.bulan_realisasi.length === 12 ? r.bulan_realisasi : Array(12).fill(null);
      // R3: sel kosong = belum diisi, 0 = nol nyata
      return { sel: [r.id, r.program, r.kegiatan ?? '', r.sub_kegiatan ?? '', r.indikator, r.satuan, ...months.map(m => (m == null ? null : m))] };
    }),
    mendatar: true,
  });
  return wb;
}

/**
 * Parse file import Matriks Bulanan → Map id → 12 nilai (null = kosong).
 * Guard: ≤5MB, sheet pertama saja + cap jumlah sheet (L67 anti zip-bomb),
 * header wajib sama dengan template.
 */
export async function parseMatrixBulananXlsx(file: File): Promise<Map<number, (number | null)[]>> {
  if (file.size > 5 * 1024 * 1024) throw new Error('File terlalu besar (maks 5 MB)');
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  if (wb.worksheets.length > 10) throw new Error('File tidak valid (terlalu banyak sheet)');
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Sheet pertama tidak ditemukan');
  // Kepala ID … Jan: baris 1 (unduhan lama, polos) atau di bawah kop (unduhan bergaya resmi).
  const kepala = cariBarisKepala(
    Array.from({ length: Math.min(ws.rowCount, 25) }, (_, i) => Array.from({ length: 7 }, (_, c) => polosSelExcel(ws.getRow(i + 1).getCell(c + 1)))),
    b => b[0]?.toUpperCase() === 'ID' && b[6] === 'Jan',
  );
  if (kepala < 0) {
    throw new Error('Format tidak dikenali — pakai file hasil "Unduh Excel" dari matriks ini');
  }
  const out = new Map<number, (number | null)[]>();
  const maxRow = Math.min(ws.rowCount, kepala + 1001);
  for (let i = kepala + 2; i <= maxRow; i++) {
    const row = ws.getRow(i);
    const id = Number(polosSelExcel(row.getCell(1)));
    if (!Number.isInteger(id) || id <= 0) continue;
    const months: (number | null)[] = [];
    for (let c = 7; c <= 18; c++) {
      // Nilai polos: sel berumus (=A+B, atau rumus ber-hasil 0) dulu terbaca kosong lewat
      // `parseFloat(String(objek))` — padahal orang lumrah menjumlah di Excel sebelum impor.
      const v = polosSelExcel(row.getCell(c));
      if (v == null || v === '') { months.push(null); continue; }
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      months.push(Number.isFinite(n) && n >= 0 ? n : null);
    }
    out.set(id, months);
  }
  if (out.size === 0) throw new Error('Tidak ada baris data yang bisa dibaca dari file');
  return out;
}
