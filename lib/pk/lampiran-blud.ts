// lib/pk/lampiran-blud.ts — lampiran "Rincian anggaran BLUD per penanggung jawab" di akhir berkas
// Word PK FINAL (konsep docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md). MURNI: tanpa DB.
//
// Lampiran TIDAK disimpan: disisipkan ke salinan berkas saat diunduh, dari versi DPA/Pergeseran
// yang dipilih orangnya. Berkas FINAL di database tidak pernah diubah.

import PizZip from 'pizzip';
import { escapeXml, nominalAnggaran } from './tabel-word';
import { keteranganTercetak } from './sumber-dana';

/** Baris anggaran PK sejauh yang dibutuhkan untuk mencari bagian BLUD-nya. */
export interface BarisAnggaranBlud {
  keterangan_sumber: string;
  auto_filled_from_blud?: boolean | number | null;
  nominal: number | string;
}

export interface BludDokumen {
  /** Ada baris yang menyebut BLUD — hanya PK seperti ini yang ditawari lampiran. */
  ada: boolean;
  /** Jumlah baris berketerangan tepat "BLUD". */
  nominal: number;
  /** Ada baris gabungan ("APBD & BLUD") — bagian BLUD-nya tidak tercatat terpisah. */
  campuran: boolean;
}

export function bludDokumen(rows: readonly BarisAnggaranBlud[]): BludDokumen {
  let nominal = 0, campuran = false, ada = false;
  for (const r of rows) {
    const k = keteranganTercetak(r.keterangan_sumber ?? '', r.auto_filled_from_blud).trim();
    if (!/\bBLUD\b/i.test(k)) continue;
    ada = true;
    if (k.toUpperCase() === 'BLUD') nominal += Number(r.nominal) || 0;
    else campuran = true;
  }
  return { ada, nominal, campuran };
}

export type Kecocokan = 'cocok' | 'beda' | 'tak-diperiksa';

/** Total versi vs nominal BLUD di PK. Baris gabungan membuat bagian BLUD PK tidak diketahui. */
export function kecocokan(total: number, pk: BludDokumen): Kecocokan {
  if (pk.campuran) return 'tak-diperiksa';
  return Math.round(total) === Math.round(pk.nominal) ? 'cocok' : 'beda';
}

export interface IsiLampiranBlud {
  unit: string;
  /** "Pergeseran BLUD versi 31 Oktober 2026 · DPA Perubahan ke-1" */
  sumber: string;
  per: Array<{ label: string; nominal: number; ada: boolean }>;
  total: number;
  pk: BludDokumen;
  dobel: number;
}

/** Kalimat catatan di bawah tabel — dipakai Word DAN dialog pemilih (satu bunyi). */
export function catatanLampiran(isi: Pick<IsiLampiranBlud, 'per' | 'total' | 'pk' | 'dobel'>): Array<{ teks: string; merah: boolean }> {
  const out: Array<{ teks: string; merah: boolean }> = [];
  const hilang = isi.per.filter(p => !p.ada).map(p => p.label);
  if (hilang.length) out.push({ teks: `Penanggung jawab tidak ditemukan di versi ini: ${hilang.join(', ')}.`, merah: false });
  const c = kecocokan(isi.total, isi.pk);
  if (c === 'beda') {
    const selisih = isi.total - isi.pk.nominal;
    out.push({
      teks: `Jumlah ini ${selisih > 0 ? 'lebih' : 'kurang'} Rp ${nominalAnggaran(Math.abs(selisih))} dari nominal BLUD `
        + `di Perjanjian Kinerja (Rp ${nominalAnggaran(isi.pk.nominal)}).`,
      merah: true,
    });
  } else if (c === 'tak-diperiksa') {
    out.push({
      teks: 'Sebagian anggaran Perjanjian Kinerja tercatat gabungan (mis. "APBD & BLUD"), '
        + 'jadi kecocokan dengan nominal BLUD tidak bisa diperiksa.',
      merah: false,
    });
  }
  if (isi.dobel > 0) out.push({ teks: `${isi.dobel} baris anggaran tercatat di dua penanggung jawab.`, merah: false });
  return out;
}

// ─── Word ────────────────────────────────────────────────────────────────────

/** Bidang tulis section terakhir templat PK (A4 tegak) — sama dengan tabel halaman 2. */
const KOLOM = [700, 6151, 3500] as const;
const UKURAN = 24;

const huruf = (tebal: boolean, merah = false) =>
  `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${tebal ? '<w:b/><w:bCs/>' : ''}`
  + (merah ? '<w:color w:val="C00000"/>' : '')
  + `<w:sz w:val="${UKURAN}"/><w:szCs w:val="${UKURAN}"/></w:rPr>`;

const paragraf = (teks: string, o: { tebal?: boolean; rata?: 'left' | 'center'; merah?: boolean; sebelum?: number; sesudah?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.sebelum ?? 0}" w:after="${o.sesudah ?? 0}" w:line="276" w:lineRule="auto"/>`
  + `<w:jc w:val="${o.rata ?? 'left'}"/>${huruf(!!o.tebal, o.merah)}</w:pPr>`
  + (teks ? `<w:r>${huruf(!!o.tebal, o.merah)}<w:t xml:space="preserve">${escapeXml(teks)}</w:t></w:r>` : '')
  + '</w:p>';

const GARIS = '<w:tcBorders>' + ['top', 'left', 'bottom', 'right']
  .map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') + '</w:tcBorders>';

function sel(teks: string, lebar: number, rata: 'left' | 'center' | 'right', tebal = false, bentang = 0): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/>${bentang ? `<w:gridSpan w:val="${bentang}"/>` : ''}${GARIS}`
    + '<w:vAlign w:val="center"/></w:tcPr>'
    + `<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="${rata}"/>${huruf(tebal)}</w:pPr>`
    + (teks ? `<w:r>${huruf(tebal)}<w:t xml:space="preserve">${escapeXml(teks)}</w:t></w:r>` : '')
    + '</w:p></w:tc>';
}

const baris = (sels: string, kepala = false) =>
  `<w:tr><w:trPr><w:cantSplit/>${kepala ? '<w:tblHeader/>' : ''}</w:trPr>${sels}</w:tr>`;

/** Halaman lampiran sebagai XML badan Word, diawali pemisah halaman. */
export function buildLampiranBludXml(isi: IsiLampiranBlud): string {
  const [kNo, kPj, kRp] = KOLOM;
  const lebar = kNo + kPj + kRp;
  const kepala = baris(sel('NO', kNo, 'center', true) + sel('Penanggung Jawab', kPj, 'center', true)
    + sel('Anggaran (Rp)', kRp, 'center', true), true);
  const badan = isi.per.map((p, i) => baris(
    sel(String(i + 1), kNo, 'center') + sel(p.label, kPj, 'left')
    + sel(p.ada ? nominalAnggaran(p.nominal) : 'tidak ditemukan', kRp, 'right'),
  )).join('');
  const jumlah = baris(sel('Jumlah', kNo + kPj, 'center', true, 2) + sel(nominalAnggaran(isi.total), kRp, 'right', true));
  const tabel = '<w:tbl><w:tblPr>'
    + `<w:tblW w:w="${lebar}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${KOLOM.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + kepala + badan + jumlah + '</w:tbl>';

  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    + paragraf('LAMPIRAN', { tebal: true, rata: 'center' })
    + paragraf('RINCIAN ANGGARAN BLUD PER PENANGGUNG JAWAB', { tebal: true, rata: 'center', sesudah: 240 })
    + paragraf(`Unit Kerja : ${isi.unit}`)
    + paragraf(`Sumber : ${isi.sumber}`, { sesudah: 160 })
    + tabel
    + catatanLampiran(isi).map((c, i) => paragraf(c.teks, { merah: c.merah, sebelum: i === 0 ? 160 : 60 })).join('');
}

/**
 * Sisipkan XML sebelum `<w:sectPr>` badan (yang TERAKHIR — sectPr di dalam paragraf menandai
 * pergantian bagian dan selalu lebih awal). Lampiran mewarisi tata halaman bagian terakhir.
 */
export function sisipkanKeDocx(docx: Uint8Array, xml: string): Buffer {
  const zip = new PizZip(docx);
  const berkas = zip.file('word/document.xml');
  if (!berkas) throw new Error('Berkas Word tidak memuat word/document.xml');
  const isi = berkas.asText();
  const akhirBadan = isi.lastIndexOf('</w:body>');
  const sect = isi.lastIndexOf('<w:sectPr', akhirBadan);
  const titik = sect >= 0 && sect < akhirBadan ? sect : akhirBadan;
  if (titik < 0) throw new Error('Berkas Word tidak memuat badan dokumen');
  zip.file('word/document.xml', isi.slice(0, titik) + xml + isi.slice(titik));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
