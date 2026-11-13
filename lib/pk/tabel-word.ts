// lib/pk/tabel-word.ts — dua tabel halaman 2 Perjanjian Kinerja sebagai XML Word.
//
// PURE (tanpa DB, tanpa berkas): `docgen.ts` menyisipkannya lewat `{@lampiran_xml}` dan
// `{@anggaran_xml}`, `scripts/test-pk-sesuai-pdf.mts` mengujinya langsung.
// Susunan mengikuti PK Perubahan 2026 (docs/CONCEPT-pk-halaman-2-sesuai-pdf.md §2–§3).

import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { pisahTargetSatuan, satuanTarget } from '@/lib/shared/target-renaksi';
import { keteranganTercetak } from './sumber-dana';

export type LevelPk = 'program' | 'kegiatan' | 'subkegiatan';

export interface BarisLampiranPk {
  uraian: string;
  indikator: string | null;
  target: string | null;
  satuan: string | null;
  level: LevelPk;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
}

export interface BarisAnggaranPk {
  uraian: string;
  keterangan_sumber: string;
  /** Baris lama: ✎ di sumber selain BLUD menjumlahkan BLUD tanpa menyebutnya — lihat lib/pk/sumber-dana.ts. */
  auto_filled_from_blud?: boolean | number | null;
  nominal: number | string;
  level: LevelPk;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
}

export const LABEL_LEVEL: Record<LevelPk, string> = {
  program: 'Program',
  kegiatan: 'Kegiatan',
  subkegiatan: 'Sub Kegiatan',
};

/** Bidang tulis section 2 kedua templat (A4 tegak): 11.907 − (706 + 850) dxa. Tabel wajib muat di dalamnya. */
export const LEBAR_BIDANG = 10351;
// Kolom NO 700: di 500 dxa "NO" dan "(1)" patah jadi dua baris di Word (isi sel = lebar − 216 dxa tepi).
export const KOLOM_SASARAN = [700, 3700, 3050, 1500, 1400] as const;
export const KOLOM_ANGGARAN = [700, 5250, 2500, 1900] as const;

/** 12 pt — satuan Word setengah-poin. */
const UKURAN_HURUF = 24;

/**
 * Teks → aman di dalam XML Word. Selain lima entitas, karakter kendali dibuang: XML 1.0
 * melarangnya, dan satu saja (tempelan dari PDF/Excel) membuat Word menolak membuka berkasnya.
 */
export function escapeXml(s: unknown): string {
  return tanpaKarakterKendali(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Untuk nilai yang di-escape docxtemplater sendiri (nama, jabatan, NIP): cukup buang karakter kendalinya. */
export function tanpaKarakterKendali(s: unknown): string {
  let bersih = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 9 || c === 10 || c === 13) bersih += ' ';
    else if (c >= 32 && c !== 0xFFFE && c !== 0xFFFF && !(c >= 0xD800 && c <= 0xDFFF)) bersih += ch;
  }
  return bersih;
}

const hurufSel = (tebal: boolean) =>
  `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${tebal ? '<w:b/><w:bCs/>' : ''}` +
  `<w:sz w:val="${UKURAN_HURUF}"/><w:szCs w:val="${UKURAN_HURUF}"/></w:rPr>`;

const SISI = ['top', 'left', 'bottom', 'right'];
const GARIS = '<w:tcBorders>' +
  SISI.map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') +
  '</w:tcBorders>';
const TANPA_GARIS = '<w:tcBorders>' + SISI.map(s => `<w:${s} w:val="nil"/>`).join('') + '</w:tcBorders>';

type Rata = 'left' | 'center' | 'right';
interface Sel {
  teks: string;
  lebar: number;
  rata: Rata;
  tebal?: boolean;
  bentang?: number;
  /** 'awal' membuka sel gabung menurun, 'lanjut' meneruskannya (isinya kosong). */
  gabung?: 'awal' | 'lanjut';
  tengahTegak?: boolean;
}

function sel(c: Sel, garis: string): string {
  const huruf = hurufSel(!!c.tebal);
  const isi = c.gabung === 'lanjut' || c.teks === ''
    ? ''
    : `<w:r>${huruf}<w:t xml:space="preserve">${escapeXml(c.teks)}</w:t></w:r>`;
  return `<w:tc><w:tcPr><w:tcW w:w="${c.lebar}" w:type="dxa"/>` +
    (c.bentang ? `<w:gridSpan w:val="${c.bentang}"/>` : '') +
    (c.gabung ? (c.gabung === 'awal' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '') +
    garis +
    (c.tengahTegak ? '<w:vAlign w:val="center"/>' : '') +
    `</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>` +
    `<w:jc w:val="${c.rata}"/>${huruf}</w:pPr>${isi}</w:p></w:tc>`;
}

/** `kepala` = baris diulang di tiap halaman (`w:tblHeader`); hanya berlaku untuk baris-baris teratas. */
function baris(sels: Sel[], garis: string, kepala = false): string {
  return `<w:tr><w:trPr><w:cantSplit/>${kepala ? '<w:tblHeader/>' : ''}</w:trPr>` +
    sels.map(c => sel(c, garis)).join('') + '</w:tr>';
}

const jumlah = (kolom: readonly number[]) => kolom.reduce((a, b) => a + b, 0);

function tabel(kolom: readonly number[], isi: string, tanpaGaris: boolean): string {
  return '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${jumlah(kolom)}" w:type="dxa"/><w:jc w:val="center"/>` +
    (tanpaGaris
      ? '<w:tblBorders>' + [...SISI, 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('') + '</w:tblBorders>'
      : '') +
    '<w:tblLayout w:type="fixed"/></w:tblPr>' +
    `<w:tblGrid>${kolom.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    isi + '</w:tbl>';
}

function levelDokumen(rows: readonly { level: LevelPk }[]): LevelPk {
  return rows[0]?.level ?? 'subkegiatan';
}

function teksSasaran(r: BarisLampiranPk): string {
  const milikLevel = r.level === 'program' ? r.program : r.level === 'kegiatan' ? r.kegiatan : r.subkegiatan;
  return rapikanNamaEntitas(milikLevel || r.uraian || r.subkegiatan || r.kegiatan || r.program || '');
}

/** Baris lama yang satuannya masih menempel di target ("765 Orang") dipisah saat dicetak. */
export function targetDanSatuan(r: Pick<BarisLampiranPk, 'target' | 'satuan'>): { target: string; satuan: string } {
  const target = (r.target ?? '').trim();
  const satuan = satuanTarget(r.satuan);
  if (satuan || !target) return { target, satuan };
  return pisahTargetSatuan(target) ?? { target, satuan: '' };
}

/** Indikator berturut-turut dengan sasaran yang sama = satu kelompok, satu nomor. */
export function kelompokSasaran(rows: readonly BarisLampiranPk[]): Array<{ sasaran: string; baris: BarisLampiranPk[] }> {
  const out: Array<{ sasaran: string; level: LevelPk; baris: BarisLampiranPk[] }> = [];
  for (const r of rows) {
    const sasaran = teksSasaran(r);
    const akhir = out[out.length - 1];
    if (akhir && akhir.sasaran === sasaran && akhir.level === r.level) akhir.baris.push(r);
    else out.push({ sasaran, level: r.level, baris: [r] });
  }
  return out;
}

/** Tabel 1: NO | Sasaran {Level} | Indikator Kinerja | Satuan | Target. */
export function buildLampiranTableXml(rows: readonly BarisLampiranPk[]): string {
  const k = KOLOM_SASARAN;
  const label = LABEL_LEVEL[levelDokumen(rows)];
  const judul = ['NO', `Sasaran ${label}`, 'Indikator Kinerja', 'Satuan', 'Target'];

  const kepala =
    baris(judul.map((teks, i) => ({ teks, lebar: k[i], rata: 'center' as Rata, tebal: true, tengahTegak: true })), GARIS, true) +
    baris(judul.map((_, i) => ({ teks: `(${i + 1})`, lebar: k[i], rata: 'center' as Rata, tebal: true })), GARIS, true) +
    baris([{ teks: label, lebar: jumlah(k), rata: 'left', tebal: true, bentang: k.length }], GARIS, true);

  const badan = kelompokSasaran(rows).map((g, no) => g.baris.map((r, i) => {
    const gabung = g.baris.length > 1 ? (i === 0 ? 'awal' as const : 'lanjut' as const) : undefined;
    const ts = targetDanSatuan(r);
    return baris([
      { teks: String(no + 1), lebar: k[0], rata: 'center', gabung },
      { teks: g.sasaran, lebar: k[1], rata: 'left', gabung },
      { teks: rapikanIndikator(r.indikator ?? ''), lebar: k[2], rata: 'left' },
      { teks: ts.satuan, lebar: k[3], rata: 'center' },
      { teks: ts.target, lebar: k[4], rata: 'center' },
    ], GARIS);
  }).join('')).join('');

  const kosong = baris([{ teks: '— Tidak ada sasaran —', lebar: jumlah(k), rata: 'center', bentang: k.length }], GARIS);
  return tabel(k, kepala + (rows.length > 0 ? badan : kosong), false);
}

const tulisRupiah = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Nominal tanpa "Rp" (judul kolomnya sudah menyebut Rp); nol ditulis "0", bukan dikosongkan. */
export function nominalAnggaran(n: number | string | null | undefined): string {
  const angka = Number(n);
  return tulisRupiah.format(Number.isFinite(angka) ? angka : 0);
}

/** Tabel 2: NO | {Level} | Anggaran (Rp) | Keterangan — tanpa garis, didahului paragraf jeda. */
export function buildAnggaranTableXml(rows: readonly BarisAnggaranPk[]): string {
  const k = KOLOM_ANGGARAN;
  const judul = ['NO', LABEL_LEVEL[levelDokumen(rows)], 'Anggaran (Rp)', 'Keterangan'];
  const kepala = baris(judul.map((teks, i) => ({ teks, lebar: k[i], rata: 'center' as Rata, tebal: true })), TANPA_GARIS, true);

  const badan = rows.map((r, i) => baris([
    { teks: String(i + 1), lebar: k[0], rata: 'center' },
    { teks: rapikanNamaEntitas(r.subkegiatan || r.kegiatan || r.program || r.uraian || ''), lebar: k[1], rata: 'left' },
    { teks: nominalAnggaran(r.nominal), lebar: k[2], rata: 'right' },
    { teks: keteranganTercetak(r.keterangan_sumber ?? '', r.auto_filled_from_blud), lebar: k[3], rata: 'center' },
  ], TANPA_GARIS)).join('');

  const kosong = baris([{ teks: '— Tidak ada anggaran —', lebar: jumlah(k), rata: 'center', bentang: k.length }], TANPA_GARIS);
  // Dua tabel berurutan menempel tanpa jarak di OOXML; paragraf ini jedanya.
  return '<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr></w:p>' +
    tabel(k, kepala + (rows.length > 0 ? badan : kosong), true);
}
