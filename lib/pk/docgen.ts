// lib/pk/docgen.ts
// Word document generator untuk Perjanjian Kinerja (PK).
// Pattern: docxtemplater (template-based) + dynamic import L18 PERF-C3.
//
// 2 template di lib/pk/templates/:
//   - pk-rsjd-amino-murni.docx       (jenis_pk='MURNI')
//   - pk-rsjd-amino-perubahan.docx   (jenis_pk='PERUBAHAN')
//
// Setup template: lihat lib/pk/templates/README.md untuk syntax placeholder.

import { promises as fs } from 'fs';
import path from 'path';
import { sql } from '@/lib/data/db';
import { fmtRp } from '@/lib/shared/utils';

export type PkDokumenForGenerate = {
  id: number;
  tahun: string;
  tanggal_dokumen: string;
  jenis_pk: 'MURNI' | 'PERUBAHAN';
  unit_pertama: string;  nama_pertama: string;  jabatan_pertama: string;  pangkat_pertama: string | null;  nip_pertama: string | null;
  unit_kedua: string;    nama_kedua: string;    jabatan_kedua: string;    pangkat_kedua: string | null;    nip_kedua: string | null;
  lampiran: Array<{
    uraian: string;
    indikator: string | null;
    target: string | null;
    level: 'program' | 'kegiatan' | 'subkegiatan';
    program: string | null;
    kegiatan: string | null;
    subkegiatan: string | null;
  }>;
  anggaran: Array<{
    uraian: string;
    keterangan_sumber: string;
    nominal: number;
    level: 'program' | 'kegiatan' | 'subkegiatan';
    program: string | null;
    kegiatan: string | null;
    subkegiatan: string | null;
  }>;
};

/**
 * Load dokumen header + lampiran + anggaran untuk generate.
 */
async function loadPkDokumenForGenerate(dokumenId: number): Promise<PkDokumenForGenerate | null> {
  const headers = await sql`
    SELECT id, tahun, tanggal_dokumen, jenis_pk,
           unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
           unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua
    FROM pk_dokumen
    WHERE id = ${dokumenId}
    LIMIT 1
  ` as PkDokumenForGenerate[];
  if (!headers.length) return null;

  const [lampiranRaw, anggaranRaw] = await Promise.all([
    sql`SELECT uraian, indikator, target, level, program, kegiatan, subkegiatan
        FROM pk_dokumen_lampiran WHERE dokumen_id = ${dokumenId} ORDER BY urutan, id`,
    sql`SELECT uraian, keterangan_sumber, nominal, level, program, kegiatan, subkegiatan
        FROM pk_dokumen_anggaran WHERE dokumen_id = ${dokumenId} ORDER BY urutan, id`,
  ]);

  return {
    ...headers[0],
    lampiran: lampiranRaw as unknown as PkDokumenForGenerate['lampiran'],
    anggaran: anggaranRaw as unknown as PkDokumenForGenerate['anggaran'],
  };
}

/**
 * Escape teks user → XML entities aman untuk dimasukkan ke Word docx.
 * Critical untuk cegah XML injection saat user input mengandung `< > & " '`.
 */
function escapeXml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build raw Word XML untuk tabel Lampiran Sasaran.
 * 4 kolom: No | Sasaran [Level] | Indikator Kinerja [Level] | Target.
 * Header label dinamis sesuai level (mirror GAS insertLampiranTable_):
 *   - subkegiatan → "Sasaran Sub Kegiatan" + "Indikator Kinerja Sub Kegiatan"
 *   - kegiatan    → "Sasaran Kegiatan" + "Indikator Kinerja Kegiatan"
 *   - program     → "Sasaran Program" + "Indikator Kinerja Program"
 * Cell sasaran pakai subkegiatan ?? kegiatan ?? program (level paling dalam).
 */
function buildLampiranTableXml(rows: PkDokumenForGenerate['lampiran']): string {
  // Arial size 13pt = 26 half-points
  const cellTextProps = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="26"/></w:rPr>`;
  const cellBorder = `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>`;
  // Header tanpa shading abu-abu (match gambar 2 — clean white header).
  // Placeholder ini render di section landscape (A4 16839×11907, margin L1411+R1138 → content 14290 dxa).
  // Total 14000 dxa (~23.7 cm) — hampir penuh landscape content, text data 1 baris.
  const colWidths = [700, 5500, 6000, 1800];

  // Detect level — kalau mixed, pakai dari row pertama (mirror GAS line 4658-4660)
  const levels = new Set(rows.map(r => r.level).filter(Boolean));
  const lvl = levels.size === 1 ? Array.from(levels)[0] : (rows[0]?.level ?? 'subkegiatan');
  const levelLabel = lvl === 'program' ? 'Program'
                   : lvl === 'kegiatan' ? 'Kegiatan'
                   : 'Sub Kegiatan';
  const headerLabels = ['No', `Sasaran ${levelLabel}`, `Indikator Kinerja ${levelLabel}`, 'Target'];

  const headerRow = `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
    headerLabels
      .map((label, i) =>
        `<w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${cellBorder}</w:tcPr>` +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
        `<w:r>${cellTextProps.replace('<w:sz', '<w:b/><w:sz')}<w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>` +
        `</w:p></w:tc>`)
      .join('') +
    `</w:tr>`;

  const dataRows = rows.map((r, i) => {
    // Sasaran cell — pakai level paling dalam (mirror GAS line 4678-4682)
    const sasaran = r.level === 'program' ? (r.program ?? '')
                  : r.level === 'kegiatan' ? (r.kegiatan ?? '')
                  : (r.subkegiatan || r.kegiatan || r.program || r.uraian || '');
    const cells = [
      String(i + 1),
      sasaran,
      r.indikator ?? '-',
      r.target ?? '-',
    ];
    return `<w:tr>` +
      cells.map((val, j) =>
        `<w:tc><w:tcPr><w:tcW w:w="${colWidths[j]}" w:type="dxa"/>${cellBorder}</w:tcPr>` +
        `<w:p><w:pPr><w:jc w:val="${j === 0 ? 'center' : j === 3 ? 'center' : 'left'}"/></w:pPr>` +
        `<w:r>${cellTextProps}<w:t xml:space="preserve">${escapeXml(val)}</w:t></w:r>` +
        `</w:p></w:tc>`).join('') +
      `</w:tr>`;
  }).join('');

  // Empty-state row kalau tidak ada lampiran
  const body = rows.length > 0 ? dataRows : `<w:tr><w:tc><w:tcPr><w:tcW w:w="14000" w:type="dxa"/><w:gridSpan w:val="4"/>${cellBorder}</w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${cellTextProps}<w:t xml:space="preserve">— Tidak ada sasaran —</w:t></w:r></w:p></w:tc></w:tr>`;

  return `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="14000" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    headerRow + body +
    `</w:tbl>`;
}

/**
 * Build raw Word XML untuk tabel Anggaran (mirror GAS insertAnggaranTable_).
 * 3 kolom: [Level] | Anggaran | Keterangan — borderless, tanpa total row.
 * Header label dinamis:
 *   - subkegiatan → "Sub Kegiatan"
 *   - kegiatan    → "Kegiatan"
 *   - program     → "Program"
 * Cell uraian pakai subkegiatan ?? kegiatan ?? program (level paling dalam).
 * Nominal: "Rp xxx" atau "-" kalau 0. Keterangan: keterangan_sumber (APBD/BLUD/dll).
 */
function buildAnggaranTableXml(rows: PkDokumenForGenerate['anggaran']): string {
  // Arial size 13pt = 26 half-points (user req: arial semua, ukuran 13)
  const cellTextProps = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="26"/></w:rPr>`;
  // BORDERLESS — semua tcBorders nil (mirror GAS line 5110: table.setBorderWidth(0))
  const cellNoBorder = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`;
  // Total 14000 dxa (~23.7 cm) — sejajar dgn tabel sasaran, hampir penuh landscape content area.
  // Keterangan 3000 dxa supaya header "Keterangan" tidak wrap di Arial 13pt.
  const colWidths = [8000, 3000, 3000];

  // Detect level — header label dinamis (mirror GAS line 5063-5067)
  const lvl = rows[0]?.level ?? 'subkegiatan';
  const levelLabel = lvl === 'program' ? 'Program'
                   : lvl === 'kegiatan' ? 'Kegiatan'
                   : 'Sub Kegiatan';
  const headerLabels = [levelLabel, 'Anggaran', 'Keterangan'];

  const headerRow = `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
    headerLabels
      .map((label, i) =>
        `<w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${cellNoBorder}</w:tcPr>` +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
        `<w:r>${cellTextProps.replace('<w:sz', '<w:b/><w:sz')}<w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>` +
        `</w:p></w:tc>`)
      .join('') +
    `</w:tr>`;

  const dataRows = rows.map((r) => {
    // Uraian cell — level terdalam (mirror GAS line 5078)
    const uraian = r.subkegiatan || r.kegiatan || r.program || r.uraian || '';
    const nominal = Number(r.nominal) || 0;
    // fmtRp() sudah include prefix "Rp " — jangan prefix manual lagi (anti-bug "Rp Rp xxx")
    const nominalDisplay = nominal <= 0 ? '-' : fmtRp(nominal);
    const cells = [
      { val: uraian,                 align: 'left'   },
      { val: nominalDisplay,         align: 'right'  },
      { val: r.keterangan_sumber,    align: 'center' },
    ];
    return `<w:tr>` +
      cells.map((c, j) =>
        `<w:tc><w:tcPr><w:tcW w:w="${colWidths[j]}" w:type="dxa"/>${cellNoBorder}</w:tcPr>` +
        `<w:p><w:pPr><w:jc w:val="${c.align}"/></w:pPr>` +
        `<w:r>${cellTextProps}<w:t xml:space="preserve">${escapeXml(c.val)}</w:t></w:r>` +
        `</w:p></w:tc>`).join('') +
      `</w:tr>`;
  }).join('');

  const body = rows.length > 0
    ? dataRows
    : `<w:tr><w:tc><w:tcPr><w:tcW w:w="14000" w:type="dxa"/><w:gridSpan w:val="3"/>${cellNoBorder}</w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${cellTextProps}<w:t xml:space="preserve">— Tidak ada anggaran —</w:t></w:r></w:p></w:tc></w:tr>`;

  // Spacer paragraph sebelum tabel anggaran — supaya jarak jelas dari tabel sasaran
  // (OOXML default tabel ke tabel dempet tanpa spacing). w:before=240 ~= 12pt jeda.
  const spacerParagraph = `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr></w:p>`;
  return spacerParagraph +
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="14000" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>` +
    // Table-level borders all nil (extra guarantee borderless)
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `</w:tblPr>` +
    `<w:tblGrid>${colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    headerRow + body +
    `</w:tbl>`;
}

/**
 * Title Case: "KEPALA BIDANG PELAYANAN MEDIS" → "Kepala Bidang Pelayanan Medis"
 * "PLT. WADIR PELAYANAN" → "Plt. Wadir Pelayanan" (titik tetap aman).
 */
function toTitleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).map(w =>
    w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)
  ).join(' ');
}

/** RS suffix yang di-append di setiap jabatan (Unit Kerja header + tanda tangan). */
const RS_SUFFIX = 'RSJD Dr. Amino Gondohutomo';

/** Format jabatan untuk Word: title-case + suffix RS. Kosong tetap kosong. */
function fmtJabatan(j: string | null | undefined): string {
  const v = (j ?? '').trim();
  if (!v) return '';
  return `${toTitleCase(v)} ${RS_SUFFIX}`;
}

/**
 * Format jabatan khusus area TTD: UPPERCASE penuh + TANPA suffix RS.
 * Exception: prefix "Plt." / "Plh." tetap title-case (bukan PLT./PLH.) sesuai konvensi PNS.
 */
function fmtJabatanTtd(j: string | null | undefined): string {
  const v = (j ?? '').trim();
  if (!v) return '';
  return v.toUpperCase().replace(/^(PLT|PLH)\.\s*/i, (_, p) => `${p[0]}${p.slice(1).toLowerCase()}. `);
}

/**
 * Format tanggal Indonesia: "23 Mei 2026"
 */
function fmtTanggalID(iso: string): string {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Generate Word document untuk dokumen PK.
 * Returns Buffer + suggested filename.
 *
 * Pattern dynamic import (L18 PERF-C3) — docxtemplater + pizzip lazy-load.
 * Template file resolved dari lib/pk/templates/ via process.cwd().
 *
 * @throws Error kalau template file tidak ada atau render gagal.
 */
export async function generatePkDocument(dokumenId: number): Promise<{ buffer: Buffer; filename: string }> {
  const data = await loadPkDokumenForGenerate(dokumenId);
  if (!data) throw new Error(`Dokumen PK id=${dokumenId} tidak ditemukan`);

  const templateFile = data.jenis_pk === 'PERUBAHAN'
    ? 'pk-rsjd-amino-perubahan.docx'
    : 'pk-rsjd-amino-murni.docx';
  const templatePath = path.join(process.cwd(), 'lib/pk/templates', templateFile);

  let content: Buffer;
  try {
    content = await fs.readFile(templatePath);
  } catch {
    throw new Error(
      `Template ${templateFile} tidak ditemukan. ` +
      `Setup template di lib/pk/templates/ — lihat lib/pk/templates/README.md untuk instruksi.`,
    );
  }

  // Dynamic import (L18) — load library hanya saat generate
  const PizZipMod = await import('pizzip');
  const DocxtemplaterMod = await import('docxtemplater');
  const PizZip = PizZipMod.default;
  const Docxtemplater = DocxtemplaterMod.default;

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  doc.render({
    // Header
    tahun:                data.tahun,
    tanggal_dokumen:      fmtTanggalID(data.tanggal_dokumen),
    jenis_pk:             data.jenis_pk,
    // Pihak Pertama (bawahan) — {jabatan_pertama} title-case+suffix utk Unit Kerja header,
    // {jabatan_pertama_ttd} UPPERCASE tanpa suffix khusus area TTD hal 1+2.
    nama_pertama:         data.nama_pertama,
    jabatan_pertama:      fmtJabatan(data.jabatan_pertama),
    jabatan_pertama_ttd:  fmtJabatanTtd(data.jabatan_pertama),
    pangkat_pertama:      data.pangkat_pertama ?? '',
    nip_pertama:          data.nip_pertama ?? '',
    // Pihak Kedua (atasan)
    nama_kedua:           data.nama_kedua,
    jabatan_kedua:        fmtJabatan(data.jabatan_kedua),
    jabatan_kedua_ttd:    fmtJabatanTtd(data.jabatan_kedua),
    pangkat_kedua:        data.pangkat_kedua ?? '',
    nip_kedua:            data.nip_kedua ?? '',
    // Raw XML untuk tabel lampiran + anggaran (placeholder {@xxx} di template)
    lampiran_xml:         buildLampiranTableXml(data.lampiran),
    anggaran_xml:         buildAnggaranTableXml(data.anggaran),
  });

  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;

  // Filename: PK-{tahun}-{unit_pertama_safe}-{jenis_pk}.docx
  const safeUnit = data.unit_pertama
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  const filename = `PK-${data.tahun}-${safeUnit}-${data.jenis_pk}.docx`;

  return { buffer: buf, filename };
}
