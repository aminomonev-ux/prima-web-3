// lib/iki/export-pdf.ts
// Export PDF dokumen IKI via jspdf + jspdf-autotable (dynamic import, pola BLUD).
// Layout dari lib/iki/layout.ts — WAJIB identik 5 PDF referensi (CONCEPT-iki §5):
// landscape, header abu-abu + baris penomoran, border thin hitam, rowspan grup,
// blok ttd per varian (STANDAR 2 ttd / DIREKTUR 1 ttd kanan).
// CUSTOM (docs/CONCEPT-iki-custom.md §6): judul/Data Pribadi/ttd sama, tabelnya dari `susunKisiCetak`,
// kertas A4 atau F4 mendatar menurut pilihan dokumen.
import type { jsPDF as JsPdf } from 'jspdf';
import type { CellDef, CellHookData, RowInput, UserOptions } from 'jspdf-autotable';
import { alasanTakBisaCetak, buildIkiGrid, buildTtd, docTitle, ikiFilename, type IkiGridDokumen, type TtdBlock } from './layout';
import { bacaTabelCustom, susunKisiCetak, lebarKolomMm, KERTAS_IKI, MARGIN_PDF_MM, type GarisCetak, type SelCetak } from './custom';

const GREY: [number, number, number] = [217, 217, 217];
const BLACK: [number, number, number] = [0, 0, 0];

export async function exportIkiPdf(doc: IkiGridDokumen, tahun: string): Promise<void> {
  const pdf = await buildIkiPdf(doc);
  pdf.save(ikiFilename(doc, tahun, 'pdf'));
}

/** Bytes PDF untuk export massal zip — tanpa auto-save. */
export async function buildIkiPdfBytes(doc: IkiGridDokumen): Promise<ArrayBuffer> {
  const pdf = await buildIkiPdf(doc);
  return pdf.output('arraybuffer') as ArrayBuffer;
}

async function buildIkiPdf(doc: IkiGridDokumen) {
  const alasan = alasanTakBisaCetak(doc);
  if (alasan) throw new Error(alasan);

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const custom = doc.varian === 'CUSTOM' ? bacaTabelCustom(doc.tabel_custom) : null;
  const f4 = KERTAS_IKI.F4;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: custom?.kertas === 'F4' ? [f4.tinggiMm, f4.lebarMm] : 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = MARGIN_PDF_MM;

  // ── Judul ──
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(docTitle(doc.jenis), pageW / 2, 12, { align: 'center' });

  // ── I. DATA PRIBADI ──
  pdf.setFontSize(8.5);
  let y = 20;
  pdf.text('I', marginX, y);
  pdf.text('DATA PRIBADI', marginX + 6, y);
  pdf.setFont('helvetica', 'normal');
  const labelX = marginX + 6;
  const colonX = marginX + 26;
  const valX = marginX + 30;
  const maxValW = pageW - valX - marginX;
  const pribadi: Array<[string, string]> = [
    ['OPD', doc.opd],
    ['Nama', doc.nama],
    ['NIP', doc.nip],
    ['Jabatan', doc.jabatan],
    ['Ikhtisar', doc.ikhtisar ?? ''],
  ];
  y += 5;
  for (const [label, value] of pribadi) {
    pdf.text(label, labelX, y);
    pdf.text(':', colonX, y);
    const lines = pdf.splitTextToSize(value, maxValW) as string[];
    pdf.text(lines, valX, y);
    y += Math.max(1, lines.length) * 4;
  }

  // ── II. FORM ──
  y += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.text('II', marginX, y);
  pdf.text('FORM INDIKATOR KINERJA INDIVIDU', labelX, y);
  y += 2.5;

  // ── Tabel ──
  if (custom) {
    autoTable(pdf, opsiTabelCustom(pdf, custom, y, marginX));
  } else {
    const grid = buildIkiGrid(doc);
    const head: RowInput[] = grid.head.map(row =>
      row.map((c): CellDef => ({
        content: c.text,
        colSpan: c.colSpan,
        rowSpan: c.rowSpan,
        styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' },
      })),
    );
    const body: RowInput[] = grid.body.map(row =>
      row
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c): CellDef => ({
          content: c.text,
          rowSpan: c.rowSpan,
          styles: {
            halign: c.align ?? 'left',
            valign: c.valign ?? 'top',
          },
        })),
    );

    const totalW = grid.pdfWidths.reduce((a, b) => a + b, 0);
    const usable = pageW - marginX * 2;
    const scale = usable / totalW;
    const columnStyles: Record<number, { cellWidth: number }> = {};
    grid.pdfWidths.forEach((w, i) => { columnStyles[i] = { cellWidth: w * scale }; });

    autoTable(pdf, {
      head,
      body,
      startY: y,
      margin: { left: marginX, right: marginX, top: 10, bottom: 12 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 1.2,
        lineColor: BLACK,
        lineWidth: 0.15,
        textColor: BLACK,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: GREY,
        textColor: BLACK,
        lineColor: BLACK,
        lineWidth: 0.15,
        fontSize: 7.5,
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles,
      rowPageBreak: 'auto',
    });
  }

  // ── Blok tanda tangan ──
  const lastY = (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  let ttdY = lastY + 10;
  const ttdHeight = 42;
  if (ttdY + ttdHeight > pageH - 8) {
    pdf.addPage();
    ttdY = 20;
  }
  const { kiri, kanan } = buildTtd(doc);
  const drawBlock = (block: TtdBlock, centerX: number) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    let by = ttdY;
    for (const line of block.lines.filter(Boolean)) {
      const wrapped = pdf.splitTextToSize(line, 90) as string[];
      pdf.text(wrapped, centerX, by, { align: 'center' });
      by += wrapped.length * 4;
    }
    by += 20; // ruang tanda tangan basah
    pdf.setFont('helvetica', 'bold');
    const namaLines = pdf.splitTextToSize(block.nama, 90) as string[];
    pdf.text(namaLines, centerX, by, { align: 'center' });
    const namaW = Math.min(90, pdf.getTextWidth(namaLines[0] ?? ''));
    pdf.line(centerX - namaW / 2, by + 1, centerX + namaW / 2, by + 1);
    by += namaLines.length * 4;
    pdf.setFont('helvetica', 'normal');
    if (block.pangkat) { pdf.text(block.pangkat, centerX, by, { align: 'center' }); by += 4; }
    if (block.nip) pdf.text(block.nip, centerX, by, { align: 'center' });
  };
  if (kiri) drawBlock(kiri, pageW * 0.25);
  drawBlock(kanan, kiri ? pageW * 0.75 : pageW * 0.72);

  return pdf;
}

const rgb = (hex: string | undefined, cadangan: [number, number, number]): [number, number, number] =>
  hex && /^[0-9a-fA-F]{6}$/.test(hex) ? [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number] : cadangan;
/** mm — garis biasa sama dengan STANDAR (0,15), tebal = baris JUMLAH / pilihan "Tebal". */
const TEBAL_GARIS: Record<GarisCetak, number> = { 0: 0, 1: 0.15, 2: 0.5 };
const FONT_PDF = 7;
/** Kepala tabel 7,5 pt — sama dengan `headStyles.fontSize` STANDAR/DIREKTUR (§12: bentuk "Seperti …" harus identik). */
const FONT_KEPALA_PDF = 7.5;
const PAD_PDF = 1.2;

/**
 * Tabel CUSTOM untuk autoTable. Kepala (baris `headerRows`) masuk `head` supaya diulang tiap halaman.
 * Teks tegak tidak didukung autoTable: selnya dikosongkan, tingginya dipesan lewat `minCellHeight`, lalu
 * teksnya digambar berputar 90° di `didDrawCell`. Garis bawah huruf tidak didukung jsPDF — di PDF tidak tampil
 * (Excel tetap membawanya).
 */
function opsiTabelCustom(pdf: JsPdf, t: ReturnType<typeof bacaTabelCustom>, startY: number, marginX: number): UserOptions {
  const kisi = susunKisiCetak(t);
  const tegak = new Map<string, SelCetak>();
  const keBaris = (baris: (SelCetak | null)[][], bagian: 'head' | 'body'): RowInput[] => baris.map((row, r) =>
    row.flatMap((s, c): CellDef[] => {
      if (!s) return [];
      const fs = s.fs ?? (bagian === 'head' ? FONT_KEPALA_PDF : FONT_PDF);
      let tinggiTegak = 0;
      if (s.rot) {
        tegak.set(`${bagian}:${r}:${c}`, s);
        pdf.setFont('helvetica', s.b ? 'bold' : 'normal');
        pdf.setFontSize(fs);
        tinggiTegak = pdf.getTextWidth(s.teks) + PAD_PDF * 2;
      }
      return [{
        content: s.rot ? '' : s.teks,
        colSpan: s.cs,
        rowSpan: s.rs,
        styles: {
          halign: s.al,
          valign: s.va,
          fontStyle: s.b && s.i ? 'bolditalic' : s.b ? 'bold' : s.i ? 'italic' : 'normal',
          fontSize: fs,
          fillColor: rgb(s.bg, [255, 255, 255]),
          textColor: rgb(s.fc, BLACK),
          lineWidth: { top: TEBAL_GARIS[s.garis.t], right: TEBAL_GARIS[s.garis.r], bottom: TEBAL_GARIS[s.garis.b], left: TEBAL_GARIS[s.garis.l] },
          ...(s.rot ? { minCellHeight: tinggiTegak / s.rs } : {}),
        },
      }];
    }));
  const columnStyles: Record<number, { cellWidth: number }> = {};
  lebarKolomMm(kisi.lebarPx, kisi.kertas).forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  return {
    head: keBaris(kisi.baris.slice(0, kisi.headerRows), 'head'),
    body: keBaris(kisi.baris.slice(kisi.headerRows), 'body'),
    startY,
    margin: { left: marginX, right: marginX, top: 10, bottom: 12 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: FONT_PDF, cellPadding: PAD_PDF, lineColor: BLACK, textColor: BLACK, overflow: 'linebreak' },
    headStyles: { lineColor: BLACK },
    columnStyles,
    rowPageBreak: 'auto',
    didDrawCell: (data: CellHookData) => {
      if (data.section === 'foot') return;
      const s = tegak.get(`${data.section}:${data.row.index}:${data.column.index}`);
      if (!s) return;
      const fs = s.fs ?? (data.section === 'head' ? FONT_KEPALA_PDF : FONT_PDF);
      pdf.setFont('helvetica', s.b && s.i ? 'bolditalic' : s.b ? 'bold' : s.i ? 'italic' : 'normal');
      pdf.setFontSize(fs);
      pdf.setTextColor(...rgb(s.fc, BLACK));
      // Dibaca dari bawah ke atas, ditengahkan mendatar di sel (tinggi huruf ± 0,35 × ukuran pt dalam mm).
      const x = data.cell.x + data.cell.width / 2 + (fs * 0.3528) / 3;
      pdf.text(s.teks, x, data.cell.y + data.cell.height - PAD_PDF, { angle: 90 });
      pdf.setTextColor(...BLACK);
    },
  };
}
