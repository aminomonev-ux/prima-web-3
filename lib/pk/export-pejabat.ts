// lib/pk/export-pejabat.ts — Unduh Master Pejabat sebagai .xlsx / .docx.
// Server-only. PURE terhadap I/O (pola import-pejabat.ts): terima baris, balikkan Buffer.
//
// Berkas yang lahir di sini WAJIB terbaca balik oleh `parsePejabatImport` — itu
// seluruh gunanya: unduh → betulkan di Excel/Word → Import File. Jadi judul kolom
// di bawah bukan selera tampilan, melainkan kunci kecocokan `HEADER_ALIASES` di
// berkas impor; mengubah salah satunya memutus lingkarannya tanpa galat apa pun.
// Dijaga scripts/test-pk-pejabat-roundtrip.mts lewat parser yang SAMA.

import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { sanitizeCell } from '@/lib/shared/excel-export';

export type ExportFormat = 'xlsx' | 'docx';

export interface ExportPejabatRow {
  unit_kerja: string;
  nama: string;
  jabatan: string;
  pangkat: string | null;
  nip: string | null;
}

/**
 * Urutan & bunyi judul kolom. Sudah dicocokkan satu per satu ke `HEADER_ALIASES`:
 * "Pangkat/Golongan" lolos karena `normHeader` mengubah garis miring jadi spasi,
 * dan "No" sengaja tidak menyerempet alias mana pun.
 */
export const HEADER_PEJABAT = ['No', 'Unit Kerja', 'Nama', 'Jabatan', 'Pangkat/Golongan', 'NIP'] as const;

const LEBAR_KOLOM = [6, 34, 30, 28, 18, 24];      // xlsx (karakter)
const LEBAR_DXA   = [700, 3800, 3600, 3400, 1900, 2000]; // docx (twips)

export function namaBerkasPejabat(tahun: string, format: ExportFormat): string {
  return `Master-Pejabat-${tahun}.${format}`;
}

export const MIME_EXPORT: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function judul(tahun: string): string {
  return `MASTER PEJABAT TAHUN ${tahun}`;
}

/** Baris → sel teks, urutannya mengikuti HEADER_PEJABAT. */
function baris(r: ExportPejabatRow, i: number): string[] {
  return [String(i + 1), r.unit_kerja, r.nama, r.jabatan, r.pangkat ?? '', r.nip ?? ''];
}

// ─── Excel ──────────────────────────────────────────────────────────────────

async function buatXlsx(rows: ExportPejabatRow[], tahun: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Master Pejabat', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  LEBAR_KOLOM.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.mergeCells(1, 1, 1, HEADER_PEJABAT.length);
  const cellJudul = ws.getCell(1, 1);
  cellJudul.value = judul(tahun);
  cellJudul.font = { name: 'Calibri', size: 12, bold: true };
  cellJudul.alignment = { horizontal: 'center', vertical: 'middle' };

  const BARIS_HEADER = 3;
  HEADER_PEJABAT.forEach((h, i) => {
    const c = ws.getCell(BARIS_HEADER, i + 1);
    c.value = h;
    c.font = { name: 'Calibri', size: 10, bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  rows.forEach((r, idx) => {
    const nomorBaris = BARIS_HEADER + 1 + idx;
    baris(r, idx).forEach((teks, i) => {
      const c = ws.getCell(nomorBaris, i + 1);
      // sanitizeCell = pagar formula-injection (CWE-1236) yang sama dengan ekspor lain.
      c.value = sanitizeCell(teks);
      c.font = { name: 'Calibri', size: 10 };
      c.alignment = { vertical: 'top', wrapText: true, horizontal: i === 0 ? 'center' : 'left' };
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      // NIP 18 digit melewati presisi angka Excel (2^53 ~ 16 digit) — ditulis sebagai
      // angka, dua digit terakhirnya berubah DIAM-DIAM lalu terimpor balik jadi NIP
      // palsu. Format teks memaksa Excel membiarkannya apa adanya.
      if (i === 5) c.numFmt = '@';
    });
  });

  ws.views = [{ state: 'frozen', ySplit: BARIS_HEADER }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

// ─── Word ───────────────────────────────────────────────────────────────────

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  + `<Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
  + `</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sel(teks: string, lebar: number, tebal: boolean): string {
  const rPr = tebal ? `<w:rPr><w:b/><w:sz w:val="18"/></w:rPr>` : `<w:rPr><w:sz w:val="18"/></w:rPr>`;
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/></w:tcPr>`
    + `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(teks)}</w:t></w:r></w:p></w:tc>`;
}

function barisTabel(sel2: string[], tebal: boolean): string {
  return `<w:tr>${sel2.map((t, i) => sel(t, LEBAR_DXA[i], tebal)).join('')}</w:tr>`;
}

function buatDocx(rows: ExportPejabatRow[], tahun: string): Buffer {
  const garis = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(sisi => `<w:${sisi} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('');

  const tabel = `<w:tbl>`
    + `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${garis}</w:tblBorders></w:tblPr>`
    + `<w:tblGrid>${LEBAR_DXA.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + barisTabel([...HEADER_PEJABAT], true)
    + rows.map((r, i) => barisTabel(baris(r, i), false)).join('')
    + `</w:tbl>`;

  // Judul sengaja PARAGRAF, bukan tabel: `docxGrid` menyapu SEMUA <w:tbl> dan
  // menggabung barisnya, jadi kop berbentuk tabel akan terbaca sebagai pejabat.
  const judulXml = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>`
    + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${esc(judul(tahun))}</w:t></w:r></w:p>`
    + `<w:p/>`;

  const sectPr = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`
    + `<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:body>${judulXml}${tabel}${sectPr}</w:body></w:document>`;

  const zip = new PizZip();
  // [Content_Types].xml ditulis PERTAMA — pengendus MIME (file-type) di route impor
  // membaca urutan entri zip untuk membedakan docx dari zip biasa.
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', docXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function buatBerkasPejabat(
  rows: ExportPejabatRow[],
  tahun: string,
  format: ExportFormat,
): Promise<Buffer> {
  return format === 'xlsx' ? buatXlsx(rows, tahun) : buatDocx(rows, tahun);
}
