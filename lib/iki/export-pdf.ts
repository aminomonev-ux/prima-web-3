// lib/iki/export-pdf.ts
// Export PDF dokumen IKI via jspdf + jspdf-autotable (dynamic import, pola BLUD).
// Layout dari lib/iki/layout.ts — WAJIB identik 5 PDF referensi (CONCEPT-iki §5):
// landscape, header abu-abu + baris penomoran, border thin hitam, rowspan grup,
// blok ttd per varian (STANDAR 2 ttd / DIREKTUR 1 ttd kanan).
import type { CellDef, RowInput } from 'jspdf-autotable';
import { buildIkiGrid, buildTtd, ikiFilename, type IkiGridDokumen, type TtdBlock } from './layout';

const GREY: [number, number, number] = [217, 217, 217];
const BLACK: [number, number, number] = [0, 0, 0];

export async function exportIkiPdf(doc: IkiGridDokumen, tahun: string): Promise<void> {
  if (doc.rhk.length === 0) throw new Error('Belum ada baris RHK — tidak ada yang bisa di-export');

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const grid = buildIkiGrid(doc);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 8;

  // ── Judul ──
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('INDIKATOR KINERJA INDIVIDU', pageW / 2, 12, { align: 'center' });

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

  pdf.save(ikiFilename(doc, tahun, 'pdf'));
}
