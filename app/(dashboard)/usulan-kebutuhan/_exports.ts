// PERF-C2 Tahap 3: Excel + PDF exporters extracted dari usulan-client.tsx.
// SDL-Audit v1.1 Phase 4: migrate xlsx-js-style → exceljs (CVE prototype pollution + ReDoS).
// PERF-C3 dipertahankan — exceljs + jspdf + jspdf-autotable masih dynamic-import
// (dalam handler, bukan top-level) supaya tidak masuk initial bundle.
// Layout: 1 sheet/section per SUB BIDANG + sheet/halaman "Ringkasan" di depan.

import { fetchJson } from '@/lib/shared/api';
import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export';
import type { UsulanHeader, UsulanItem } from './_types';
import type ExcelJS from 'exceljs';

/** Helper: fetch all items per usulan ID dalam 1 round-trip. */
async function fetchExportItems(rows: UsulanHeader[]): Promise<Record<number, UsulanItem[]>> {
  const d = await fetchJson<Record<number, UsulanItem[]>>('/api/usulan/export', {
    method: 'POST',
    body: JSON.stringify({ ids: rows.map(r => r.id) }),
  });
  return d.ok ? (d.data ?? {}) : {};
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  left:   { style: 'thin', color: { argb: 'FF000000' } },
  right:  { style: 'thin', color: { argb: 'FF000000' } },
};

// ─── Shared aggregation helpers ──────────────────────────────────────────────

type ItemAgg = { subtotal: number; va: number; vk: number; ds: number; count: number };

function aggItems(items: UsulanItem[]): ItemAgg {
  return {
    subtotal: items.reduce((s, it) => s + Number(it.total_est), 0),
    va:       items.reduce((s, it) => s + (Number(it.admin_nominal) || 0), 0),
    vk:       items.reduce((s, it) => s + (Number(it.kasubag_nominal) || 0), 0),
    ds:       items.reduce((s, it) => s + (it.status === 'DISETUJUI' ? (Number(it.nominal_disetujui) || 0) : 0), 0),
    count:    items.length,
  };
}

/** Group headers by sub_bidang, insertion order preserved. */
function groupBySubBidang(rows: UsulanHeader[]): Map<string, UsulanHeader[]> {
  const m = new Map<string, UsulanHeader[]>();
  for (const r of rows) {
    const k = r.sub_bidang || '(Tanpa Sub Bidang)';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

/** Rekap per sub-bidang untuk sheet/halaman Ringkasan. */
function subTotals(subRows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>) {
  const usulan = subRows.length;
  let items = 0, est = 0, va = 0, vk = 0, ds = 0;
  for (const r of subRows) {
    const a = aggItems(itemsMap[r.id] ?? []);
    est += a.subtotal || Number(r.total_nilai) || 0;
    va += a.va; vk += a.vk; ds += a.ds; items += a.count;
  }
  return { usulan, items, est, va, vk, ds };
}

/** Excel sheet name: max 31 char, tanpa \ / ? * [ ] :, anti-duplikat. */
function safeSheetName(name: string, used: Set<string>): string {
  let s = (name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
  const base = s;
  let i = 1;
  while (used.has(s.toLowerCase())) {
    const suf = ` (${++i})`;
    s = base.slice(0, 31 - suf.length) + suf;
  }
  used.add(s.toLowerCase());
  return s;
}

// ═══ EXCEL ════════════════════════════════════════════════════════════════════

const colLetter = (c: number) => String.fromCharCode(65 + c);

/** Render 1 sheet untuk satu sub-bidang (judul + per-usulan tabel + total sub-bidang). */
function renderSubBidangSheet(ws: ExcelJS.Worksheet, sub: string, rows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>) {
  const nCols = 12;
  ws.columns = [8, 32, 28, 7, 10, 24, 24, 12, 18, 22, 22, 22].map(w => ({ width: w }));
  let curRow = 0;

  curRow++;
  ws.getCell(`A${curRow}`).value = `SUB BIDANG: ${sub.toUpperCase()}`;
  ws.mergeCells(`A${curRow}:${colLetter(nCols - 1)}${curRow}`);
  ws.getCell(`A${curRow}`).font = { bold: true, size: 13 };
  ws.getCell(`A${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  curRow++;
  ws.getCell(`A${curRow}`).value = 'PRIMA · RSJD Dr. Amino Gondohutomo · ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  ws.mergeCells(`A${curRow}:${colLetter(nCols - 1)}${curRow}`);
  ws.getCell(`A${curRow}`).font = { size: 9, color: { argb: 'FF6B7280' } };
  ws.getCell(`A${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  let gT = 0, gVA = 0, gVK = 0, gDS = 0;

  for (let g = 0; g < rows.length; g++) {
    const r = rows[g];
    const items: UsulanItem[] = itemsMap[r.id] ?? [];
    const a = aggItems(items);
    const subtotal = a.subtotal;
    gT += subtotal || Number(r.total_nilai); gVA += a.va; gVK += a.vk; gDS += a.ds;

    // Group header row (per usulan)
    curRow++;
    ws.getCell(`A${curRow}`).value = `${g + 1}.  ${r.no_usulan}   |   ${r.tanggal?.slice(0, 10) ?? ''}   |   Pengusul: ${r.pengusul}   |   ${r.jenis_belanja || '-'}   |   Status: ${r.status_ringkas}`;
    ws.mergeCells(`A${curRow}:${colLetter(nCols - 1)}${curRow}`);
    for (let c = 0; c < nCols; c++) {
      const cell = ws.getCell(`${colLetter(c)}${curRow}`);
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = BORDER_THIN;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    }

    // Item header row
    curRow++;
    const itemHeader = ['No', 'Nama Barang', 'Spesifikasi', 'Qty', 'Satuan', 'Harga Estimasi (Rp)', 'Total Estimasi (Rp)', 'Prioritas', 'Status', 'Verif Admin (Rp)', 'Verif Kasubag (Rp)', 'Disetujui (Rp)'];
    itemHeader.forEach((v, c) => {
      const cell = ws.getCell(`${colLetter(c)}${curRow}`);
      cell.value = sanitizeCell(v);
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = BORDER_THIN;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 11 ? 'FFA7F3D0' : 'FFE2E8F0' } };
    });

    // Item rows
    if (items.length) {
      items.forEach((it, i) => {
        curRow++;
        const itemRow = [i + 1, it.nama_barang, it.spesifikasi || '-', Number(it.qty), it.satuan, Number(it.harga_est), Number(it.total_est), it.prioritas, it.status, Number(it.admin_nominal) || 0, Number(it.kasubag_nominal) || 0, it.status === 'DISETUJUI' ? Number(it.nominal_disetujui) || 0 : 0];
        itemRow.forEach((v, c) => {
          const cell = ws.getCell(`${colLetter(c)}${curRow}`);
          cell.value = sanitizeCell(v);
          const isCenter = c === 0 || c === 3 || c === 7 || c === 8;
          const isRp = c === 5 || c === 6 || c >= 9;
          cell.font = { size: 9 };
          cell.alignment = { horizontal: isCenter ? 'center' : isRp ? 'right' : 'left', vertical: 'middle' };
          cell.border = BORDER_THIN;
          if (c === 11) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          if (isRp && typeof v === 'number') cell.numFmt = '#,##0';
        });
      });
    } else {
      curRow++;
      const emptyRow = ['-', '(data item tidak tersedia)', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'];
      emptyRow.forEach((v, c) => {
        const cell = ws.getCell(`${colLetter(c)}${curRow}`);
        cell.value = sanitizeCell(v);
        cell.font = { size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = BORDER_THIN;
      });
    }

    // Subtotal row (per usulan)
    curRow++;
    ws.getCell(`A${curRow}`).value = `Subtotal — ${r.no_usulan}`;
    ws.getCell(`G${curRow}`).value = subtotal || Number(r.total_nilai);
    ws.getCell(`J${curRow}`).value = a.va;
    ws.getCell(`K${curRow}`).value = a.vk;
    ws.getCell(`L${curRow}`).value = a.ds;
    ws.mergeCells(`A${curRow}:F${curRow}`);
    for (let c = 0; c < nCols; c++) {
      const cell = ws.getCell(`${colLetter(c)}${curRow}`);
      cell.font = { bold: true, size: 9, italic: true };
      cell.alignment = { horizontal: c <= 5 ? 'left' : 'right', vertical: 'middle' };
      cell.border = BORDER_THIN;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 11 ? 'FFA7F3D0' : 'FFFEF9C3' } };
      if ((c === 6 || c >= 9) && typeof cell.value === 'number') cell.numFmt = '#,##0';
    }
  }

  // Total sub-bidang
  curRow++;
  ws.getCell(`A${curRow}`).value = `TOTAL SUB BIDANG — ${sub}`;
  ws.getCell(`G${curRow}`).value = gT;
  ws.getCell(`J${curRow}`).value = gVA;
  ws.getCell(`K${curRow}`).value = gVK;
  ws.getCell(`L${curRow}`).value = gDS;
  ws.mergeCells(`A${curRow}:F${curRow}`);
  for (let c = 0; c < nCols; c++) {
    const cell = ws.getCell(`${colLetter(c)}${curRow}`);
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: c <= 5 ? 'center' : 'right', vertical: 'middle' };
    cell.border = BORDER_THIN;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 11 ? 'FF6EE7B7' : 'FFFEF08A' } };
    if ((c === 6 || c >= 9) && typeof cell.value === 'number') cell.numFmt = '#,##0';
  }
}

/** Sheet "Ringkasan" — rekap per sub-bidang + total keseluruhan. */
function renderRingkasanSheet(ws: ExcelJS.Worksheet, groups: Map<string, UsulanHeader[]>, itemsMap: Record<number, UsulanItem[]>) {
  ws.columns = [{ width: 30 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];
  const nC = 7;
  let curRow = 0;

  curRow++;
  ws.getCell(`A${curRow}`).value = 'RINGKASAN PER SUB BIDANG — USULAN KEBUTUHAN';
  ws.mergeCells(`A${curRow}:${colLetter(nC - 1)}${curRow}`);
  ws.getCell(`A${curRow}`).font = { bold: true, size: 13 };
  ws.getCell(`A${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  curRow++;
  ws.getCell(`A${curRow}`).value = 'PRIMA · RSJD Dr. Amino Gondohutomo · ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  ws.mergeCells(`A${curRow}:${colLetter(nC - 1)}${curRow}`);
  ws.getCell(`A${curRow}`).font = { size: 9, color: { argb: 'FF6B7280' } };
  ws.getCell(`A${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  curRow++;
  const head = ['Sub Bidang', 'Jml Usulan', 'Jml Item', 'Total Estimasi (Rp)', 'Verif Admin (Rp)', 'Verif Kasubag (Rp)', 'Disetujui (Rp)'];
  head.forEach((v, c) => {
    const cell = ws.getCell(`${colLetter(c)}${curRow}`);
    cell.value = sanitizeCell(v);
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_THIN;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 6 ? 'FF166534' : 'FF166534' } };
  });

  let tU = 0, tI = 0, tE = 0, tVA = 0, tVK = 0, tDS = 0;
  for (const [sub, subRows] of groups) {
    const t = subTotals(subRows, itemsMap);
    tU += t.usulan; tI += t.items; tE += t.est; tVA += t.va; tVK += t.vk; tDS += t.ds;
    curRow++;
    const row = [sub, t.usulan, t.items, t.est, t.va, t.vk, t.ds];
    row.forEach((v, c) => {
      const cell = ws.getCell(`${colLetter(c)}${curRow}`);
      cell.value = sanitizeCell(v);
      cell.font = { size: 9 };
      cell.alignment = { horizontal: c === 0 ? 'left' : 'right', vertical: 'middle' };
      cell.border = BORDER_THIN;
      if (c === 6) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      if (c >= 3 && typeof v === 'number') cell.numFmt = '#,##0';
    });
  }

  curRow++;
  const tot = ['TOTAL KESELURUHAN', tU, tI, tE, tVA, tVK, tDS];
  tot.forEach((v, c) => {
    const cell = ws.getCell(`${colLetter(c)}${curRow}`);
    cell.value = sanitizeCell(v);
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: c === 0 ? 'left' : 'right', vertical: 'middle' };
    cell.border = BORDER_THIN;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === 6 ? 'FF6EE7B7' : 'FFFEF08A' } };
    if (c >= 3 && typeof v === 'number') cell.numFmt = '#,##0';
  });
}

/**
 * Export usulan ke Excel (exceljs): sheet "Ringkasan" + 1 sheet per sub-bidang.
 */
export async function exportExcel(rows: UsulanHeader[], filename: string) {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const itemsMap = await fetchExportItems(rows);
  const groups = groupBySubBidang(rows);

  renderRingkasanSheet(wb.addWorksheet('Ringkasan'), groups, itemsMap);

  const used = new Set<string>(['ringkasan']);
  for (const [sub, subRows] of groups) {
    renderSubBidangSheet(wb.addWorksheet(safeSheetName(sub, used)), sub, subRows, itemsMap);
  }

  await downloadWorkbook(wb, filename + '.xlsx');
}

// ═══ PDF ══════════════════════════════════════════════════════════════════════

/**
 * Export usulan ke PDF (jspdf + jspdf-autotable) — landscape A4.
 * Halaman Ringkasan di depan → halaman pemisah per sub-bidang → tabel per usulan.
 */
export async function exportPrint(title: string, rows: UsulanHeader[]) {
  const [pdfMod, tableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const jsPDF     = pdfMod.jsPDF;
  const autoTable = tableMod.default;
  const itemsMap  = await fetchExportItems(rows);
  const groups    = groupBySubBidang(rows);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const green: [number, number, number]     = [22, 101, 52];
  const darkGreen: [number, number, number] = [20, 83, 45];
  const lightGray: [number, number, number] = [248, 250, 252];
  const yellow: [number, number, number]    = [254, 249, 195];
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

  const footer = (data: { settings: { margin: { left: number } } }) => {
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(`Halaman ${doc.getNumberOfPages()}`, data.settings.margin.left, pageH - 5);
  };

  // ── Halaman 1: Ringkasan per sub-bidang ──
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...green);
  doc.text('PRIMA — ' + title + ' · RINGKASAN', 14, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
  doc.text('RSJD Dr. Amino Gondohutomo  ·  Dicetak: ' + new Date().toLocaleString('id-ID'), 14, 20);

  let tU = 0, tI = 0, tE = 0, tVA = 0, tVK = 0, tDS = 0;
  const ringkasanBody = [...groups.entries()].map(([sub, subRows]) => {
    const t = subTotals(subRows, itemsMap);
    tU += t.usulan; tI += t.items; tE += t.est; tVA += t.va; tVK += t.vk; tDS += t.ds;
    return [sub, String(t.usulan), String(t.items), rp(t.est), rp(t.va), rp(t.vk), rp(t.ds)];
  });
  autoTable(doc, {
    startY: 26,
    head: [['Sub Bidang', 'Jml Usulan', 'Jml Item', 'Total Estimasi', 'Verif Admin', 'Verif Kasubag', 'Disetujui']],
    body: ringkasanBody.length ? ringkasanBody : [['(tidak ada data)', '-', '-', '-', '-', '-', '-']],
    foot: [[
      { content: 'TOTAL KESELURUHAN', styles: { halign: 'left', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: String(tU), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: String(tI), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: rp(tE), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: rp(tVA), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: rp(tVK), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
      { content: rp(tDS), styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [0, 0, 0] } },
    ]],
    headStyles: { fillColor: green, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    footStyles: { fontSize: 8 },
    didDrawPage: footer,
    margin: { left: 14, right: 14 },
  });

  // ── Per sub-bidang: halaman pemisah + tabel ──
  for (const [sub, subRows] of groups) {
    const st = subTotals(subRows, itemsMap);

    // Halaman pemisah
    doc.addPage();
    doc.setFillColor(...green);
    doc.rect(0, pageH / 2 - 22, pageW, 44, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text(`SUB BIDANG: ${sub.toUpperCase()}`, pageW / 2, pageH / 2, { align: 'center', baseline: 'middle' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(`${st.usulan} usulan · ${st.items} item · Total Estimasi ${rp(st.est)}`, pageW / 2, pageH / 2 + 14, { align: 'center' });
    footer({ settings: { margin: { left: 14 } } });

    // Halaman tabel
    doc.addPage();
    let startY = 16;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...green);
    doc.text(`SUB BIDANG: ${sub.toUpperCase()}`, 14, startY);
    startY += 6;

    let gT = 0, gVA = 0, gVK = 0, gDS = 0;
    for (let g = 0; g < subRows.length; g++) {
      const r = subRows[g];
      const items: UsulanItem[] = itemsMap[r.id] ?? [];
      const a = aggItems(items);
      const subtotal = a.subtotal || Number(r.total_nilai);
      gT += subtotal; gVA += a.va; gVK += a.vk; gDS += a.ds;

      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGreen);
      doc.text(`${g + 1}. ${r.no_usulan}  |  ${r.tanggal?.slice(0, 10) ?? ''}  |  ${r.pengusul}  |  ${r.jenis_belanja || '-'}  |  ${r.status_ringkas}`, 14, startY);
      startY += 1;

      autoTable(doc, {
        startY,
        head: [['No', 'Nama Barang', 'Spesifikasi', 'Qty', 'Satuan', 'Harga Estimasi (Rp)', 'Total Estimasi (Rp)', 'Prioritas', 'Status', 'Verif Admin (Rp)', 'Verif Kasubag (Rp)', 'Disetujui (Rp)']],
        body: items.length
          ? items.map((it, i) => [
              i + 1, it.nama_barang, it.spesifikasi || '-', it.qty, it.satuan,
              rp(Number(it.harga_est)), rp(Number(it.total_est)), it.prioritas, it.status,
              rp(Number(it.admin_nominal) || 0), rp(Number(it.kasubag_nominal) || 0),
              it.status === 'DISETUJUI' ? rp(Number(it.nominal_disetujui) || 0) : '-',
            ])
          : [['-', '(data tidak tersedia)', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
        headStyles: { fillColor: green, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
        bodyStyles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: lightGray },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { cellWidth: 40 },
          2: { cellWidth: 35 },
          3: { halign: 'center', cellWidth: 10 },
          4: { halign: 'center', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 28 },
          6: { halign: 'right', cellWidth: 28 },
          7: { halign: 'center', cellWidth: 16 },
          8: { halign: 'center', cellWidth: 20 },
          9: { halign: 'right', cellWidth: 22 },
          10: { halign: 'right', cellWidth: 22 },
          11: { halign: 'right', cellWidth: 22 },
        },
        foot: [[
          { content: `Subtotal: ${rp(subtotal)}`, colSpan: 9, styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
          { content: rp(a.va), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
          { content: rp(a.vk), styles: { halign: 'right', fontStyle: 'bold', fillColor: yellow, textColor: [0, 0, 0] } },
          { content: rp(a.ds), styles: { halign: 'right', fontStyle: 'bold', fillColor: [167, 243, 208], textColor: [0, 0, 0] } },
        ]],
        footStyles: { fontSize: 8 },
        didDrawPage: footer,
        margin: { left: 14, right: 14 },
      });

      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
      if (startY > pageH - 20 && g < subRows.length - 1) { doc.addPage(); startY = 14; }
    }

    // Total sub-bidang
    if (startY > pageH - 20) { doc.addPage(); startY = 14; }
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...green);
    doc.text(`TOTAL ${sub.toUpperCase()}: ${rp(gT)}`, 14, startY + 2);
    doc.setFontSize(8); doc.setTextColor(107, 114, 128);
    doc.text(`Verif Admin: ${rp(gVA)}   ·   Verif Kasubag: ${rp(gVK)}   ·   Disetujui: ${rp(gDS)}`, 14, startY + 8);
  }

  doc.save(title.toLowerCase().replace(/\s+/g, '-') + '.pdf');
}
