// ═══ PRIMA — LKJIP — Word generator (formatting + TOC) ════════════
// Bangun .docx LENGKAP dari nol via PizZip. Fitur:
//  - Gaya dokumen dari style_config (font/ukuran/spasi/justify) → styles.xml
//  - Narasi rich-text (Tiptap HTML) → run OOXML (bold/italic/underline/strike/list)
//  - Daftar Isi/Tabel/Gambar OTOMATIS via field native Word (TOC) + caption SEQ
//  - settings.xml updateFields=true → Word refresh field saat dibuka
// escapeXml WAJIB di semua teks user. PERF-C3/L18: pizzip dynamic-import.
import { getDokumenDetail } from './data';
import { flattenTree, type SectionNode, type BlockNode } from './numbering';
import { DEFAULT_STYLE, type StyleConfig } from './schemas';
import { normalizeRows, buildTableMeta, displayValue } from './tabel';
import { getDriveClient } from '@/lib/services/drive';

function escapeXml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function decodeEntities(s: string): string {
  return String(s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

// ── helper run/paragraph (non-heading) ──
function rPr(font: string, sz: number, o: { bold?: boolean; italic?: boolean } = {}): string {
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}<w:sz w:val="${sz}"/></w:rPr>`;
}
function para(text: string, font: string, sz: number, o: { bold?: boolean; italic?: boolean; align?: string } = {}): string {
  const pPr = o.align ? `<w:pPr><w:jc w:val="${o.align}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r>${rPr(font, sz, o)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}
function pageBreak(): string { return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`; }

// ── Word field (TOC / SEQ) ──
function field(instr: string, cached = ''): string {
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t xml:space="preserve">${escapeXml(cached)}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

// Konversi warna (hex/rgb tervalidasi sanitizer) → RRGGBB utk OOXML w:color.
function colorToHex6(c: string): string | null {
  const v = c.trim();
  let m = /^#([0-9a-fA-F]{6})$/.exec(v); if (m) return m[1].toUpperCase();
  m = /^#([0-9a-fA-F]{3})$/.exec(v); if (m) return m[1].split('').map(x => x + x).join('').toUpperCase();
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(v);
  if (m) return [m[1], m[2], m[3]].map(n => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
}

// Allocator numId: tiap list (ul/ol/ol-alpha) dapat numId UNIK → list independen
// restart sendiri (a,b,c lalu list berikutnya balik a,b,c — bukan lanjut d,e,f).
// continueLast=true → PAKAI ULANG numId terakhir dgn abs sama → Word lanjut nomor
// lintas-blok (a,b,c yang terpotong tabel/gambar; flag continueList di blok narasi).
// abs: 0=bullet, 1=decimal, 2=lowerLetter.
type NumAlloc = {
  next: number;
  instances: { numId: number; abs: number }[];
  lastByAbs: Record<number, number>;
  alloc: (kind: 'ul' | 'ol' | 'ola', continueLast?: boolean) => number;
};
function makeNumAlloc(): NumAlloc {
  const a: NumAlloc = {
    next: 1, instances: [], lastByAbs: {},
    alloc: (kind, continueLast = false) => {
      const abs = kind === 'ul' ? 0 : kind === 'ola' ? 2 : 1;
      if (continueLast && a.lastByAbs[abs]) return a.lastByAbs[abs];
      const numId = a.next++;
      a.instances.push({ numId, abs });
      a.lastByAbs[abs] = numId;
      return numId;
    },
  };
  return a;
}
function buildNumbering(instances: { numId: number; abs: number }[]): string {
  const ind = `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>`;
  const abstract =
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>${ind}</w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/>${ind}</w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/>${ind}</w:lvl></w:abstractNum>`;
  const nums = instances.map(i => `<w:num w:numId="${i.numId}"><w:abstractNumId w:val="${i.abs}"/></w:num>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abstract}${nums}</w:numbering>`;
}

// ── Narasi HTML (Tiptap) → paragraf OOXML ──
// indentTwips: first-line indent paragraf isi (gambar 2 — tiap paragraf menjorok).
// Tidak diterapkan ke heading & list item (list pakai hanging indent dari numbering).
// continueList: blok ini melanjutkan penomoran list dari blok sebelumnya (abs sama)
// → list PERTAMA yang dibuka pakai-ulang numId terakhir (a,b,c lanjut, bukan restart).
function narasiToXml(html: string, font: string, sz: number, indentTwips = 0, alloc?: NumAlloc, continueList = false): string {
  if (!html || !html.trim()) return '';
  // CT_PPr: <w:ind> WAJIB sebelum <w:jc>. indXml dipasang di paragraf isi saja.
  const indXml = indentTwips > 0 ? `<w:ind w:firstLine="${indentTwips}"/>` : '';
  const tokens = html.split(/(<[^>]+>)/).filter(t => t !== '');
  const paras: string[] = [];
  let runs: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let olAlpha = false; // <ol type="a"> → penomoran huruf (a, b, c)
  let firstListOpen = true; // continueList hanya untuk list pertama di blok
  let currentNumId = 0; // numId list yang sedang dibuka (dialokasikan saat <ul>/<ol>)
  let inLi = false;
  let pAlign: string | null = null;
  let headingLevel = 0;
  let runColor: string | null = null;
  let runSize: number | null = null;
  const marks = { b: false, i: false, u: false, s: false };

  const curRpr = () => {
    const r = [`<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>`];
    if (marks.b || headingLevel) r.push('<w:b/>');
    if (marks.i) r.push('<w:i/>');
    if (marks.u) r.push('<w:u w:val="single"/>');
    if (marks.s) r.push('<w:strike/>');
    if (runColor) r.push(`<w:color w:val="${runColor}"/>`);
    const hsz = headingLevel === 1 ? sz + 10 : headingLevel === 2 ? sz + 6 : headingLevel === 3 ? sz + 2 : sz;
    r.push(`<w:sz w:val="${runSize ?? hsz}"/>`);
    return `<w:rPr>${r.join('')}</w:rPr>`;
  };
  const pushText = (txt: string) => {
    const t = decodeEntities(txt);
    if (!t) return;
    runs.push(`<w:r>${curRpr()}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`);
  };
  const flush = (pPrInner = '') => {
    if (runs.length === 0) return;
    paras.push(`<w:p>${pPrInner ? `<w:pPr>${pPrInner}</w:pPr>` : ''}${runs.join('')}</w:p>`);
    runs = [];
  };

  for (const tok of tokens) {
    if (tok.startsWith('<')) {
      const m = /^<\/?([a-zA-Z0-9]+)/.exec(tok);
      const tag = m ? m[1].toLowerCase() : '';
      const closing = tok.startsWith('</');
      switch (tag) {
        case 'p':
          if (inLi) break; // p di dalam li → biar batas </li> yang flush (numPr)
          if (closing) { flush(`${indXml}${pAlign ? `<w:jc w:val="${pAlign}"/>` : ''}`); pAlign = null; }
          else {
            flush();
            const am = /text-align\s*:\s*(left|center|right|justify)/i.exec(tok);
            pAlign = am ? (am[1].toLowerCase() === 'justify' ? 'both' : am[1].toLowerCase()) : null;
          }
          break;
        case 'h1': case 'h2': case 'h3':
          if (inLi) break;
          if (closing) { flush(pAlign ? `<w:jc w:val="${pAlign}"/>` : ''); pAlign = null; headingLevel = 0; }
          else {
            flush();
            headingLevel = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
            const am = /text-align\s*:\s*(left|center|right|justify)/i.exec(tok);
            pAlign = am ? (am[1].toLowerCase() === 'justify' ? 'both' : am[1].toLowerCase()) : null;
          }
          break;
        case 'br':  runs.push(`<w:r>${curRpr()}<w:br/></w:r>`); break;
        case 'strong': case 'b': marks.b = !closing; break;
        case 'em':     case 'i': marks.i = !closing; break;
        case 'u': marks.u = !closing; break;
        case 's': case 'strike': case 'del': marks.s = !closing; break;
        case 'span':
          if (closing) { runColor = null; runSize = null; }
          else {
            const cm = /(?<![-a-zA-Z])color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]*\))/i.exec(tok);
            runColor = cm ? colorToHex6(cm[1]) : null;
            const sm = /font-size\s*:\s*(\d{1,3})px/i.exec(tok);
            runSize = sm ? Math.round(parseInt(sm[1], 10) * 1.5) : null;
          }
          break;
        case 'ul':
          if (closing) { listType = null; }
          else { listType = 'ul'; const cont = continueList && firstListOpen; firstListOpen = false; currentNumId = alloc ? alloc.alloc('ul', cont) : 1; }
          break;
        case 'ol':
          if (closing) { listType = null; olAlpha = false; }
          else { listType = 'ol'; olAlpha = /type\s*=\s*["']?a/i.test(tok); const cont = continueList && firstListOpen; firstListOpen = false; currentNumId = alloc ? alloc.alloc(olAlpha ? 'ola' : 'ol', cont) : (olAlpha ? 3 : 2); }
          break;
        case 'li':
          if (closing) {
            const numId = currentNumId || (listType === 'ol' ? (olAlpha ? 3 : 2) : 1);
            flush(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`);
            inLi = false;
          } else { flush(); inLi = true; }
          break;
        default: break;
      }
    } else {
      pushText(tok);
    }
  }
  flush(indXml);
  return paras.join('');
}

// ── Caption ber-SEQ (auto-nomor + masuk Daftar Tabel/Gambar) ──
function caption(label: 'Tabel' | 'Gambar' | 'Grafik', text: string, font: string, sz: number): string {
  const capSz = Math.max(18, sz - 2);
  const lead = `<w:r>${rPr(font, capSz, { bold: true })}<w:t xml:space="preserve">${label} </w:t></w:r>`;
  const seq = field(` SEQ ${label} \\* ARABIC `, '1');
  const tail = text.trim() ? `<w:r>${rPr(font, capSz, { bold: true })}<w:t xml:space="preserve"> </w:t></w:r><w:r>${rPr(font, capSz)}<w:t xml:space="preserve">${escapeXml(text.trim())}</w:t></w:r>` : '';
  return `<w:p><w:pPr><w:pStyle w:val="Caption"/><w:jc w:val="center"/></w:pPr>${lead}${seq}${tail}</w:p>`;
}

function buildTabelXml(payload: unknown, font: string, sz: number, headerFill: string): string {
  const p = (payload ?? {}) as { judul?: string; kolom?: string[]; align?: string[]; colWidths?: number[]; rows?: unknown };
  const kolom = Array.isArray(p.kolom) ? p.kolom : [];
  const colAlign = Array.isArray(p.align) ? p.align : [];
  if (kolom.length === 0) return '';
  const ncol = kolom.length;
  const rows = normalizeRows(p.rows).map(r => { while (r.length < ncol) r.push({ v: '' }); return r.slice(0, ncol); });
  const meta = buildTableMeta(rows, ncol);
  const totalW = 9000;
  // Lebar kolom: pakai colWidths (px → dxa, 1px≈15) bila lengkap; selain itu bagi rata.
  const pxW = Array.isArray(p.colWidths) && p.colWidths.length === ncol ? p.colWidths : null;
  const widths = pxW ? pxW.map(w => Math.max(360, Math.round(Number(w) * 15))) : kolom.map(() => Math.floor(totalW / ncol));
  const spanW = (c: number, cs: number) => { let s = 0; for (let i = c; i < c + cs && i < ncol; i++) s += widths[i]; return s; };
  const border = `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>`;
  const sideXml = (tag: string, w: number | undefined) =>
    w === undefined ? `<w:${tag} w:val="single" w:sz="4" w:color="000000"/>`
      : w <= 0 ? `<w:${tag} w:val="nil"/>`
        : `<w:${tag} w:val="single" w:sz="${w}" w:color="000000"/>`;
  const borderOf = (bd?: { t?: number; r?: number; b?: number; l?: number }) =>
    !bd ? border : `<w:tcBorders>${sideXml('top', bd.t)}${sideXml('left', bd.l)}${sideXml('bottom', bd.b)}${sideXml('right', bd.r)}</w:tcBorders>`;
  const cellSz = Math.max(18, sz - 2);
  const jcOf = (a: string | undefined) => a === 'right' ? 'right' : a === 'center' ? 'center' : a === 'justify' ? 'both' : 'left';
  const vaOf = (v: string | undefined) => v === 'middle' ? 'center' : v === 'bottom' ? 'bottom' : 'top';

  const hrCount = Math.max(0, Math.min(Number((p as { headerRows?: number }).headerRows) || 0, rows.length));
  const renderRow = (r: number, isHeader: boolean): string => {
    let cells = '';
    for (let c = 0; c < ncol; c++) {
      const m = meta[r][c];
      if (m.kind === 'skip') continue;
      const cell = rows[r][c] ?? { v: '' };
      const tcPr = [`<w:tcW w:w="${spanW(c, m.cs)}" w:type="dxa"/>`];
      if (m.cs > 1) tcPr.push(`<w:gridSpan w:val="${m.cs}"/>`);
      if (m.kind === 'origin' && m.rs > 1) tcPr.push(`<w:vMerge w:val="restart"/>`);
      if (m.kind === 'vcont') tcPr.push(`<w:vMerge w:val="continue"/>`);
      if (cell.va) tcPr.push(`<w:vAlign w:val="${vaOf(cell.va)}"/>`);
      else if (isHeader) tcPr.push(`<w:vAlign w:val="center"/>`);
      tcPr.push(borderOf(cell.bd));
      const fill = cell.bg ? cell.bg : (isHeader ? headerFill : '');
      if (fill) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);
      const csz = cell.fs ? cell.fs * 2 : cellSz;
      const align = cell.al ?? (isHeader ? 'center' : colAlign[c]);
      const body = m.kind === 'vcont'
        ? `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`
        : `<w:p><w:pPr><w:jc w:val="${jcOf(align)}"/><w:spacing w:after="0"/></w:pPr>` +
          `<w:r>${rPr(font, csz, { bold: isHeader || !!cell.b })}<w:t xml:space="preserve">${escapeXml(displayValue(rows, r, c))}</w:t></w:r></w:p>`;
      cells += `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${body}</w:tc>`;
    }
    const trPr = isHeader ? `<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>` : '';
    return `<w:tr>${trPr}${cells}</w:tr>`;
  };
  // Header = kolom thead (1 baris, default) ATAU hrCount baris pertama rows (header bertingkat).
  const headerRow = hrCount > 0 ? '' : `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>` +
    kolom.map((k, ci) =>
      `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${border}<w:shd w:val="clear" w:color="auto" w:fill="${headerFill}"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>` +
      `<w:r>${rPr(font, cellSz, { bold: true })}<w:t xml:space="preserve">${escapeXml(k)}</w:t></w:r></w:p></w:tc>`,
    ).join('') + `</w:tr>`;
  const dataRows = rows.map((_row, r) => renderRow(r, r < hrCount)).join('');

  const table = `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>` +
    `</w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
  return caption('Tabel', p.judul ?? '', font, sz) + table + para('', font, sz);
}

type ImageInfo = { id: number; relId: string; mediaName: string; ext: string; wEmu: number; hEmu: number };

function sniffImgExt(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';
  if (buf.length > 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  return null;
}
function jpegDims(buf: Buffer): { w: number; h: number } | null {
  let o = 2;
  while (o + 9 < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const marker = buf[o + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
    }
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return null;
}
function imgDimsEmu(buf: Buffer, ext: string): { wEmu: number; hEmu: number } {
  let w = 0, h = 0;
  try {
    if (ext === 'png') { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
    else if (ext === 'gif') { w = buf.readUInt16LE(6); h = buf.readUInt16LE(8); }
    else if (ext === 'jpg') { const d = jpegDims(buf); if (d) { w = d.w; h = d.h; } }
  } catch { /* fallback di bawah */ }
  if (!w || !h) { w = 480; h = 360; }
  const PX = 9525, MAXW = 5760000;        // 9525 EMU/px @96dpi · lebar maks ≈6 inci
  let wEmu = w * PX, hEmu = h * PX;
  if (wEmu > MAXW) { hEmu = Math.round(hEmu * MAXW / wEmu); wEmu = MAXW; }
  return { wEmu, hEmu };
}
function drawingPara(info: ImageInfo): string {
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="${WP}">` +
    `<wp:extent cx="${info.wEmu}" cy="${info.hEmu}"/><wp:docPr id="${info.id}" name="Gambar${info.id}"/>` +
    `<a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}">` +
    `<pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${info.id}" name="Gambar${info.id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${info.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${info.wEmu}" cy="${info.hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function buildGambarXml(payload: unknown, font: string, sz: number, imgMap: Map<string, ImageInfo>): string {
  const p = (payload ?? {}) as { judul?: string; fileId?: string; caption?: string };
  const text = [p.judul, p.caption].filter(x => x && x.trim()).join(' — ');
  const info = p.fileId ? imgMap.get(p.fileId) : undefined;
  const body = info ? drawingPara(info) : para('[ Gambar ]', font, sz, { italic: true, align: 'center' });
  return body + caption('Gambar', text, font, sz) + para('', font, sz);
}

function buildGrafikXml(payload: unknown, font: string, sz: number, imgMap: Map<string, ImageInfo>): string {
  const p = (payload ?? {}) as { judul?: string; imageFileId?: string; caption?: string };
  const text = [p.judul, p.caption].filter(x => x && x.trim()).join(' — ');
  const info = p.imageFileId ? imgMap.get(p.imageFileId) : undefined;
  const body = info ? drawingPara(info) : para('[ Grafik ]', font, sz, { italic: true, align: 'center' });
  return body + caption('Grafik', text, font, sz) + para('', font, sz);
}

function buildHeadingXml(node: SectionNode): string {
  const lvl = Math.min(Math.max(node.depth + 1, 1), 6);
  const text = node.depth === 0 ? `${node.nomor} ${node.judul}`.toUpperCase() : `${node.nomor} ${node.judul}`;
  return `<w:p><w:pPr><w:pStyle w:val="Heading${lvl}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildBlockXml(b: BlockNode, font: string, sz: number, imgMap: Map<string, ImageInfo>, headerFill: string, indentTwips = 0, alloc?: NumAlloc): string {
  switch (b.tipe) {
    case 'NARASI': { const p = (b.payload as { html?: string; continueList?: boolean }) ?? {}; return narasiToXml(p.html ?? '', font, sz, indentTwips, alloc, p.continueList === true); }
    case 'TABEL':  return buildTabelXml(b.payload, font, sz, headerFill);
    case 'GAMBAR': return buildGambarXml(b.payload, font, sz, imgMap);
    case 'GRAFIK': return buildGrafikXml(b.payload, font, sz, imgMap);
    default:       return '';
  }
}

// ── Halaman daftar otomatis (TOC fields) ──
function indexPage(title: string, instr: string, font: string): string {
  return para(title, font, 28, { bold: true, align: 'center' }) +
    `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${field(instr, 'Klik kanan → Update Field untuk memuat daftar & nomor halaman.')}</w:p>`;
}

// ── Page/section helpers (footer + nomor halaman) ──
const PGSZ = `<w:pgSz w:w="11907" w:h="16839"/>`;
const PGMAR = `<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>`;

function sectProps(opts: { footer: boolean; numFmt?: 'lowerRoman' | 'decimal'; start?: number }): string {
  const fref = opts.footer ? `<w:footerReference r:id="rId4" w:type="default"/>` : '';
  const pgnum = opts.numFmt ? `<w:pgNumType w:fmt="${opts.numFmt}"${opts.start ? ` w:start="${opts.start}"` : ''}/>` : '';
  return `${fref}${PGSZ}${PGMAR}${pgnum}`;
}
const sectBreak = (props: string) => `<w:p><w:pPr><w:sectPr>${props}</w:sectPr></w:pPr></w:p>`;

function buildFooterXml(cfg: StyleConfig): string {
  const font = cfg.fontFamily;
  const sz = Math.max(18, Math.round(cfg.fontSizePt * 2) - 4);
  const pageField = field(' PAGE \\* MERGEFORMAT ', '1');
  const text = (cfg.footerText ?? '').trim();
  const p = text
    ? `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="8788"/></w:tabs></w:pPr>` +
      `<w:r>${rPr(font, sz)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` +
      `<w:r><w:tab/></w:r>${pageField}</w:p>`
    : `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${pageField}</w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p}</w:ftr>`;
}

// ── styles.xml dinamis ──
function headingStyle(id: number, font: string, sz: number): string {
  return `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${id - 1}"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
}
function buildStyles(cfg: StyleConfig): string {
  const font = cfg.fontFamily;
  const sz = Math.round(cfg.fontSizePt * 2);
  const line = Math.round(cfg.lineSpacing * 240);
  const after = Math.round(cfg.spaceAfterPt * 20);
  const jc = cfg.align === 'left' ? 'left' : 'both';
  const capSz = Math.max(18, sz - 2);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:sz w:val="${sz}"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="${after}" w:line="${line}" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:spacing w:before="60" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:i/><w:sz w:val="${capSz}"/></w:rPr></w:style>` +
    headingStyle(1, font, 32) + headingStyle(2, font, 28) + headingStyle(3, font, 26) +
    headingStyle(4, font, sz) + headingStyle(5, font, sz) + headingStyle(6, font, sz) +
    `</w:styles>`;
}

// Halaman Kata Pengantar (front-matter, roman) + blok tanda tangan kanan. '' bila kosong.
function kataPengantarPage(cfg: StyleConfig, font: string, sz: number, alloc?: NumAlloc): string {
  const hasTtd = !!(cfg.ttdTempatTanggal || cfg.ttdJabatan || cfg.ttdNama || cfg.ttdPangkat || cfg.ttdNip);
  if (!cfg.kataPengantarHtml && !hasTtd) return '';
  const title = para('KATA PENGANTAR', font, Math.max(sz, 28), { bold: true, align: 'center' });
  const isi = cfg.kataPengantarHtml ? narasiToXml(cfg.kataPengantarHtml, font, sz, Math.round((cfg.firstLineIndentCm ?? 0) * 567), alloc) : '';
  const sigP = (text: string, opt: { bold?: boolean; underline?: boolean } = {}) => {
    const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${opt.bold ? '<w:b/>' : ''}${opt.underline ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/></w:rPr>`;
    return `<w:p><w:pPr><w:ind w:left="5040"/><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr><w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  };
  let sig = '';
  if (hasTtd) {
    sig += para('', font, sz);
    if (cfg.ttdTempatTanggal) sig += sigP(cfg.ttdTempatTanggal);
    for (const line of cfg.ttdJabatan.split('\n')) if (line.trim()) sig += sigP(line.trim());
    sig += sigP('') + sigP('') + sigP('');
    if (cfg.ttdNama) sig += sigP(cfg.ttdNama, { bold: true, underline: true });
    if (cfg.ttdPangkat) sig += sigP(cfg.ttdPangkat);
    if (cfg.ttdNip) sig += sigP(cfg.ttdNip);
  }
  return title + para('', font, sz) + isi + sig;
}

function buildBody(tree: SectionNode[], cfg: StyleConfig, judul: string, tahun: number, imgMap: Map<string, ImageInfo>, alloc: NumAlloc): string {
  const font = cfg.fontFamily;
  const sz = Math.round(cfg.fontSizePt * 2);
  const indentTwips = Math.round((cfg.firstLineIndentCm ?? 0) * 567); // 1cm ≈ 567 twips

  const cover =
    para('LAPORAN KINERJA INSTANSI PEMERINTAH', font, 36, { bold: true, align: 'center' }) +
    para(`TAHUN ${tahun}`, font, 32, { bold: true, align: 'center' }) +
    para('', font, sz) +
    para('RSJD Dr. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH', font, 26, { bold: true, align: 'center' }) +
    para(judul, font, sz, { italic: true, align: 'center' });

  // Front-matter: (Kata Pengantar bila ada) + 4 halaman daftar, dipisah page-break.
  const kp = kataPengantarPage(cfg, font, sz, alloc);
  const daftar = [
    ...(kp ? [kp] : []),
    indexPage('DAFTAR ISI', ` TOC \\o "1-6" \\h \\z \\u `, font),
    indexPage('DAFTAR TABEL', ` TOC \\h \\z \\c "Tabel" `, font),
    indexPage('DAFTAR GAMBAR', ` TOC \\h \\z \\c "Gambar" `, font),
    indexPage('DAFTAR GRAFIK', ` TOC \\h \\z \\c "Grafik" `, font),
  ].join(pageBreak());

  const sections = flattenTree(tree).map(node =>
    buildHeadingXml(node) + node.blocks.map(b => buildBlockXml(b, font, sz, imgMap, cfg.tableHeaderFill, indentTwips, alloc)).join(''),
  ).join('');

  // Penomoran: cover (tanpa nomor) · daftar (romawi i,ii) · isi (arab 1,2) — bila pageNumber+romanFront.
  let body: string;
  if (!cfg.pageNumber) {
    body = `${cover}${pageBreak()}${daftar}${pageBreak()}${sections}<w:sectPr>${sectProps({ footer: false })}</w:sectPr>`;
  } else if (cfg.romanFront) {
    body = `${cover}${sectBreak(sectProps({ footer: false }))}` +
      `${daftar}${sectBreak(sectProps({ footer: true, numFmt: 'lowerRoman', start: 1 }))}` +
      `${sections}<w:sectPr>${sectProps({ footer: true, numFmt: 'decimal', start: 1 })}</w:sectPr>`;
  } else {
    body = `${cover}${sectBreak(sectProps({ footer: false }))}` +
      `${daftar}${pageBreak()}${sections}<w:sectPr>${sectProps({ footer: true, numFmt: 'decimal', start: 1 })}</w:sectPr>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body}</w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
  `<Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
  `</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
  `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/>` +
  `</Relationships>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:updateFields w:val="true"/></w:settings>`;

// Pre-fetch gambar (blok GAMBAR) dari Drive — best-effort: byte → media + rel + content-type.
async function collectImages(tree: SectionNode[]): Promise<{ map: Map<string, ImageInfo>; media: { name: string; buf: Buffer }[]; relsXml: string; ctXml: string }> {
  const ids: string[] = [];
  for (const node of flattenTree(tree)) {
    for (const b of node.blocks) {
      const fid = b.tipe === 'GAMBAR' ? (b.payload as { fileId?: string })?.fileId
        : b.tipe === 'GRAFIK' ? (b.payload as { imageFileId?: string })?.imageFileId
        : undefined;
      if (typeof fid === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(fid)) ids.push(fid);
    }
  }
  const map = new Map<string, ImageInfo>();
  const media: { name: string; buf: Buffer }[] = [];
  const exts = new Set<string>();
  let drive: ReturnType<typeof getDriveClient> | null = null;
  let idx = 0;
  for (const fid of [...new Set(ids)]) {
    try {
      if (!drive) drive = getDriveClient();
      const res = await drive.files.get({ fileId: fid, alt: 'media' }, { responseType: 'arraybuffer' });
      const buf = Buffer.from(res.data as unknown as ArrayBuffer);
      if (buf.length === 0 || buf.length > 12 * 1024 * 1024) continue;
      const ext = sniffImgExt(buf);
      if (!ext) continue;
      idx++;
      const mediaName = `image${idx}.${ext}`;
      const { wEmu, hEmu } = imgDimsEmu(buf, ext);
      map.set(fid, { id: 100 + idx, relId: `rIdImg${idx}`, mediaName, ext, wEmu, hEmu });
      media.push({ name: `word/media/${mediaName}`, buf });
      exts.add(ext);
    } catch { /* gambar gagal di-fetch → fallback placeholder; jangan gagalkan generate */ }
  }
  const relsXml = [...map.values()].map(i => `<Relationship Id="${i.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.mediaName}"/>`).join('');
  const ctMime = (e: string) => e === 'jpg' ? 'image/jpeg' : e === 'png' ? 'image/png' : 'image/gif';
  const ctXml = [...exts].map(e => `<Default Extension="${e}" ContentType="${ctMime(e)}"/>`).join('');
  return { map, media, relsXml, ctXml };
}

/**
 * Generate Word (.docx) untuk dokumen LKJIP. Return Buffer + filename.
 * @throws Error kalau dokumen tidak ada.
 */
export async function generateLkjipDocx(dokumenId: number): Promise<{ buffer: Buffer; filename: string }> {
  const detail = await getDokumenDetail(dokumenId);
  if (!detail) throw new Error(`Dokumen LKJIP id=${dokumenId} tidak ditemukan`);
  const cfg = detail.style_config ?? DEFAULT_STYLE;
  const images = await collectImages(detail.tree);

  const PizZipMod = await import('pizzip');
  const PizZip = PizZipMod.default;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES.replace('</Types>', `${images.ctXml}</Types>`));
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS.replace('</Relationships>', `${images.relsXml}</Relationships>`));
  const numAlloc = makeNumAlloc();
  const docXml = buildBody(detail.tree, cfg, detail.judul, detail.tahun, images.map, numAlloc); // alokasikan numId dulu
  zip.file('word/styles.xml', buildStyles(cfg));
  zip.file('word/numbering.xml', buildNumbering(numAlloc.instances));
  zip.file('word/settings.xml', SETTINGS_XML);
  zip.file('word/footer.xml', buildFooterXml(cfg));
  zip.file('word/document.xml', docXml);
  for (const mf of images.media) zip.file(mf.name, mf.buf);

  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  const filename = `LKJIP-${detail.tahun}-${detail.canonical_id}.docx`;
  return { buffer, filename };
}
