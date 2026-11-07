// ═══ PRIMA — LKJIP — Impor dari Word (pure, tanpa DB/Drive) ════════════════════
// Konsep: docs/CONCEPT-lkjip-impor-word.md. Bytes .docx → pohon bab + blok + Kata Pengantar.
// Route membaca ulang berkas yang SAMA saat "Buat" (sidik dicocokkan di sana), jadi koreksi
// pemakai menempel pada nomor unsur badan berkas ini — urutan pembacaan harus deterministik.
// Pembaca XML kecil milik sendiri, bukan dependensi baru (L57: lockfile wajib regen npm 10.8.2).
import PizZip from 'pizzip';
import {
  sanitizeRows, namaKolomDariKepala, BATAS_KOLOM_TABEL, BATAS_BARIS_TABEL, BATAS_BARIS_KEPALA, DXA_PER_PX,
  type TabelCell, type TabelAlign, type TabelVAlign,
} from './tabel';
import { MAX_DEPTH } from './numbering';
import { judulBabWajib } from './aturan-bab';
import { indentTwips, spasiBawaan, spasiKeTersimpan, BATAS_INDENT_CM, TWIPS_PER_CM, type Inden, type IndenTersimpan, type Spasi } from './halaman';
import { gayaDariWord, teksNomor, type KodeGaya } from './gaya-daftar';
import { susunNarasi } from './susun-daftar';
import { stabiloDariWord, type KodeStabilo } from './format-teks';
import {
  BATAS_BERKAS_IMPOR, PESAN_TERLALU_BESAR, JENIS_PENANDA,
  type JenisPenanda, type Koreksi, type JenisObjek, type TandaTangan, type BarisPratinjau, type RingkasanImpor,
} from './impor-word-jenis';

export * from './impor-word-jenis';

export class ImporWordError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ImporWordError'; }
}

// Cermin `DEFAULT_STYLE` schemas.ts: pembaca ini murni dan tidak menarik Zod + rate-limit server ke berkas ini.
const DEFAULT_STYLE_IMPOR = { lineSpacing: 1.5, spaceAfterPt: 6 };
export const BATAS_BLOK_IMPOR = 2000;
const BATAS_XML = 30 * 1024 * 1024;
const BATAS_MEDIA = 200;
const BATAS_GAMBAR = 10 * 1024 * 1024;           // = batas /api/upload
const BATAS_HTML_BLOK = 45000;                   // NarasiPayloadSchema 50.000, sisakan ruang tag
const BATAS_KATA_PENGANTAR = 20000;              // StyleConfigSchema.kataPengantarHtml
const BATAS_TEKS_SEL = 2000;                     // CellSchema.v

export interface TabelImpor {
  judul: string; kolom: string[]; align: TabelAlign[]; colWidths: number[]; headerRows: number;
  rows: TabelCell[][]; melintang: boolean;
}
export type BlokImpor =
  | { tipe: 'NARASI'; payload: { html: string } }
  | { tipe: 'TABEL'; payload: TabelImpor }
  | { tipe: 'GAMBAR'; gambar: string; payload: { judul: string; fileId: string; caption: string } }
  | { tipe: 'GRAFIK'; gambar: string | null; payload: Record<string, unknown> };
export interface BagianImpor { judul: string; locked: boolean; penanda: number | null; blok: BlokImpor[]; anak: BagianImpor[] }
export interface GambarImpor { ref: string; ext: 'png' | 'jpg' | 'gif'; mime: string; bytes: Uint8Array }

export interface HasilImporWord {
  judulBerkas: string;
  tahunTebakan: number | null;
  kataPengantar: { html: string; paragraf: number; ttd: TandaTangan };
  /** Indent baris pertama paling lazim di berkas (cm) → setelan dokumen; yang lain membawa angkanya sendiri. Null = tak ada paragraf untuk dinilai. */
  indenBawaanCm: number | null;
  /** Spasi paling lazim di berkas → Pengaturan Dokumen; yang lain membawa angkanya sendiri. Null = tak ada paragraf untuk dinilai. */
  spasiBawaan: { lineSpacing: number; spaceAfterPt: number } | null;
  bagian: BagianImpor[];
  gambar: Record<string, GambarImpor>;
  baris: BarisPratinjau[];
  ringkasan: RingkasanImpor;
  peringatan: string[];
}

// ── Pembaca XML kecil ───────────────────────────────────────────────────────
interface El { n: string; a: string; c: (El | string)[] }

const RE_TOKEN = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|([^<]+)/g;
// Teks hanya disimpan di unsur yang memang pembawa teks — spasi di antara tag lain tidak berarti.
const PEMBAWA_TEKS = new Set(['w:t', 'w:instrText', 'a:t', 'c:v', 'dc:title']);

function dekode(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const kode = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(kode); } catch { return ''; }
  });
}

function uraiXml(xml: string): El {
  const akar: El = { n: '', a: '', c: [] };
  const tumpuk: El[] = [akar];
  RE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_TOKEN.exec(xml))) {
    const atas = tumpuk[tumpuk.length - 1];
    if (m[2]) {
      if (m[1]) {
        for (let i = tumpuk.length - 1; i > 0; i--) if (tumpuk[i].n === m[2]) { tumpuk.length = i; break; }
      } else {
        const el: El = { n: m[2], a: m[3] || '', c: [] };
        atas.c.push(el);
        if (!m[4]) tumpuk.push(el);
      }
    } else if (m[5] !== undefined) {
      if (PEMBAWA_TEKS.has(atas.n)) atas.c.push(m[5]);
    } else if (m[6] !== undefined && PEMBAWA_TEKS.has(atas.n)) {
      atas.c.push(dekode(m[6]));
    }
  }
  return akar;
}

const reAtr = new Map<string, RegExp>();
function atr(el: El | undefined, nama: string): string | null {
  if (!el) return null;
  let re = reAtr.get(nama);
  if (!re) { re = new RegExp(`(?:^|\\s)${nama.replace(/[.:]/g, '\\$&')}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`); reAtr.set(nama, re); }
  const m = re.exec(el.a);
  return m ? dekode(m[1] ?? m[2] ?? '') : null;
}
const KOSONG: El = { n: '', a: '', c: [] };
const elemen = (el: El | undefined): El[] => (el ? el.c.filter((x): x is El => typeof x !== 'string') : []);
const anak = (el: El | undefined, n: string): El | undefined => elemen(el).find(x => x.n === n);
const anakSemua = (el: El | undefined, n: string): El[] => elemen(el).filter(x => x.n === n);
function cariSemua(el: El, n: string, out: El[] = []): El[] {
  for (const x of el.c) if (typeof x !== 'string') { if (x.n === n) out.push(x); cariSemua(x, n, out); }
  return out;
}
const teksDalam = (el: El): string => el.c.map(x => (typeof x === 'string' ? x : teksDalam(x))).join('');
/** `<w:b/>` = nyala; `w:val="0|false|off"` = mati. */
const nyala = (el?: El): boolean => !!el && !['0', 'false', 'off', 'none'].includes((atr(el, 'w:val') ?? '').toLowerCase());
const nyalaAtr = (el: El, nama: string): boolean => ['1', 'true', 'on'].includes((atr(el, nama) ?? '').toLowerCase());
const angkaAtr = (el: El | undefined, nama: string): number | null => {
  const v = atr(el, nama);
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// ── Gaya & penomoran ────────────────────────────────────────────────────────
interface GayaPar { nama: string; dasar: string | null; outline: number | null; num: { numId: string; ilvl: number } | null; ind: IndenTersimpan; spasi: SpasiWord }
interface InfoGaya { peta: Map<string, GayaPar>; bawaan: string; dokumen: IndenTersimpan; spasiDokumen: SpasiWord }
/** `<w:spacing>` + `<w:contextualSpacing>`. Hanya yang tertulis: tiap atribut diwarisi sendiri-sendiri. */
interface SpasiWord { sebelum?: number; sesudah?: number; baris?: number; aturan?: string; kontekstual?: boolean }

/** `<w:ind>` sebuah pPr. Hanya atribut yang tertulis: sisanya diwarisi (gaya → daftar → paragraf). */
function bacaInd(pPr: El | undefined): IndenTersimpan {
  const ind = anak(pPr, 'w:ind');
  if (!ind) return {};
  const h: IndenTersimpan = {};
  const kiri = angkaAtr(ind, 'w:left') ?? angkaAtr(ind, 'w:start');
  const kanan = angkaAtr(ind, 'w:right') ?? angkaAtr(ind, 'w:end');
  const gantung = angkaAtr(ind, 'w:hanging');
  const pertama = angkaAtr(ind, 'w:firstLine');
  if (kiri != null) h.kiri = kiri;
  if (kanan != null) h.kanan = kanan;
  if (gantung != null) h.pertama = -gantung;
  else if (pertama != null) h.pertama = pertama;
  return h;
}

// "auto" pada `beforeAutospacing` = spasi gaya HTML; Word memakai 14 pt.
const SPASI_OTOMATIS = 280;
function bacaSpasiWord(pPr: El | undefined): SpasiWord {
  const h: SpasiWord = {};
  const s = anak(pPr, 'w:spacing');
  if (s) {
    const sebelum = angkaAtr(s, 'w:before');
    const sesudah = angkaAtr(s, 'w:after');
    const baris = angkaAtr(s, 'w:line');
    const aturan = atr(s, 'w:lineRule');
    if (sebelum != null) h.sebelum = sebelum;
    if (sesudah != null) h.sesudah = sesudah;
    if (baris != null) h.baris = baris;
    if (aturan) h.aturan = aturan;
    if (nyalaAtr(s, 'w:beforeAutospacing')) h.sebelum = SPASI_OTOMATIS;
    if (nyalaAtr(s, 'w:afterAutospacing')) h.sesudah = SPASI_OTOMATIS;
  }
  const k = anak(pPr, 'w:contextualSpacing');
  if (k) h.kontekstual = nyala(k);
  return h;
}

function bacaGaya(xml: string | null): InfoGaya {
  const peta = new Map<string, GayaPar>();
  let bawaan = 'Normal';
  if (!xml) return { peta, bawaan, dokumen: {}, spasiDokumen: {} };
  const akarGaya = anak(uraiXml(xml), 'w:styles');
  const pPrDokumen = anak(anak(anak(akarGaya, 'w:docDefaults'), 'w:pPrDefault'), 'w:pPr');
  const dokumen = bacaInd(pPrDokumen);
  for (const s of anakSemua(akarGaya, 'w:style')) {
    if (atr(s, 'w:type') !== 'paragraph') continue;
    const id = atr(s, 'w:styleId') ?? '';
    if (!id) continue;
    if (['1', 'true', 'on'].includes(atr(s, 'w:default') ?? '')) bawaan = id;
    const pPr = anak(s, 'w:pPr');
    const numPr = anak(pPr, 'w:numPr');
    const numId = atr(anak(numPr, 'w:numId'), 'w:val');
    peta.set(id, {
      nama: atr(anak(s, 'w:name'), 'w:val') ?? id,
      dasar: atr(anak(s, 'w:basedOn'), 'w:val'),
      outline: angkaAtr(anak(pPr, 'w:outlineLvl'), 'w:val'),
      num: numId ? { numId, ilvl: angkaAtr(anak(numPr, 'w:ilvl'), 'w:val') ?? 0 } : null,
      ind: bacaInd(pPr),
      spasi: bacaSpasiWord(pPr),
    });
  }
  return { peta, bawaan, dokumen, spasiDokumen: bacaSpasiWord(pPrDokumen) };
}

/** Tingkat judul gaya (1 = Judul 1) lewat nama "heading n" atau outlineLvl, menurun lewat basedOn. */
function tingkatGaya(id: string | null, g: InfoGaya, jalan = 0): number | null {
  const s = id ? g.peta.get(id) : undefined;
  if (!s || jalan > 10) return null;
  const m = /^heading\s*([1-9])$/i.exec(s.nama.trim());
  if (m) return Number(m[1]);
  if (s.outline != null && s.outline >= 0 && s.outline <= 8) return s.outline + 1;
  return tingkatGaya(s.dasar, g, jalan + 1);
}
function numGaya(id: string | null, g: InfoGaya, jalan = 0): { numId: string; ilvl: number } | null {
  const s = id ? g.peta.get(id) : undefined;
  if (!s || jalan > 10) return null;
  return s.num ?? numGaya(s.dasar, g, jalan + 1);
}
function indGaya(id: string | null, g: InfoGaya, jalan = 0): IndenTersimpan {
  const s = id ? g.peta.get(id) : undefined;
  if (!s || jalan > 10) return {};
  return { ...indGaya(s.dasar, g, jalan + 1), ...s.ind };
}
function spasiGaya(id: string | null, g: InfoGaya, jalan = 0): SpasiWord {
  const s = id ? g.peta.get(id) : undefined;
  if (!s || jalan > 10) return {};
  return { ...spasiGaya(s.dasar, g, jalan + 1), ...s.spasi };
}
const gayaKeterangan = (id: string | null, g: InfoGaya): boolean =>
  !!id && /^caption$/i.test(g.peta.get(id)?.nama.trim() ?? '');

interface LevelNum { fmt: string; teks: string | null; start: number | null; ind: IndenTersimpan }
interface InfoNum { abs: string; ganti: Record<number, number>; lvl: Record<number, LevelNum> }
interface Penomoran { abs: Map<string, Record<number, LevelNum>>; num: Map<string, InfoNum>; hitung: Map<string, (number | undefined)[]>; dipakai: Set<string> }

function bacaLevel(el: El): Record<number, LevelNum> {
  const out: Record<number, LevelNum> = {};
  for (const l of anakSemua(el, 'w:lvl')) {
    out[angkaAtr(l, 'w:ilvl') ?? 0] = { fmt: atr(anak(l, 'w:numFmt'), 'w:val') ?? 'decimal', teks: atr(anak(l, 'w:lvlText'), 'w:val') ?? null, start: angkaAtr(anak(l, 'w:start'), 'w:val'), ind: bacaInd(anak(l, 'w:pPr')) };
  }
  return out;
}
function bacaPenomoran(xml: string | null): Penomoran {
  const p: Penomoran = { abs: new Map(), num: new Map(), hitung: new Map(), dipakai: new Set() };
  if (!xml) return p;
  const akar = anak(uraiXml(xml), 'w:numbering');
  for (const a of anakSemua(akar, 'w:abstractNum')) p.abs.set(atr(a, 'w:abstractNumId') ?? '', bacaLevel(a));
  for (const n of anakSemua(akar, 'w:num')) {
    const ganti: Record<number, number> = {};
    const lvl: Record<number, LevelNum> = {};
    for (const o of anakSemua(n, 'w:lvlOverride')) {
      const il = angkaAtr(o, 'w:ilvl') ?? 0;
      const st = angkaAtr(anak(o, 'w:startOverride'), 'w:val');
      if (st != null) ganti[il] = st;
      const lv = anak(o, 'w:lvl');
      if (lv) Object.assign(lvl, bacaLevel({ n: '', a: '', c: [lv] }));
    }
    p.num.set(atr(n, 'w:numId') ?? '', { abs: atr(anak(n, 'w:abstractNumId'), 'w:val') ?? '', ganti, lvl });
  }
  return p;
}

interface NumPar { numId: string; kunci: string; ilvl: number; gaya: KodeGaya; nomor: number; induk: number[]; ind: IndenTersimpan }
/**
 * Nomor butir seperti yang Word tampilkan (dicoba di Word sungguhan 2026-11-06): SEMUA num sebabstrak
 * berbagi satu hitungan, termasuk yang ber-startOverride. Override hanya menyetel hitungan bersama itu
 * pada pemakaian PERTAMA num-nya, jadi num lain sesudahnya melanjutkan dari situ (5, 6 lalu num lain = 7).
 * Butir tingkat atas mengulang hitungan tingkat di bawahnya.
 */
function majukanNomor(p: Penomoran, numId: string, ilvl: number): NumPar | null {
  const num = p.num.get(numId);
  if (!num || numId === '0') return null;
  const dasar = p.abs.get(num.abs)?.[ilvl];
  const lv = num.lvl[ilvl] ?? dasar ?? { fmt: 'decimal', teks: null, start: 1 };
  const gaya = gayaDariWord(lv.fmt, lv.teks ?? dasar?.teks);
  if (!gaya) return null;
  const kunci = `a${num.abs}`;
  const arr = p.hitung.get(kunci) ?? [];
  const tandaOverride = `${numId}|${ilvl}`;
  if (num.ganti[ilvl] !== undefined && !p.dipakai.has(tandaOverride)) {
    p.dipakai.add(tandaOverride);
    arr[ilvl] = num.ganti[ilvl];
  } else arr[ilvl] = (arr[ilvl] ?? (lv.start ?? dasar?.start ?? 1) - 1) + 1;
  for (let l = ilvl + 1; l < arr.length; l++) arr[l] = undefined;
  p.hitung.set(kunci, arr);
  return { numId, kunci, ilvl, gaya, nomor: arr[ilvl]!, induk: Array.from({ length: ilvl }, (_, l) => arr[l] ?? 1), ind: { ...(dasar?.ind ?? {}), ...lv.ind } };
}

// ── Paragraf ────────────────────────────────────────────────────────────────
interface Seg { t: string; b: boolean; i: boolean; u: boolean; s: boolean; br?: boolean; naik?: 'superscript' | 'subscript' | null; stabilo?: KodeStabilo | null }
interface Par {
  jenis: 'p'; i: number;
  tingkat: number | null; keterangan: boolean; num: NumPar | null;
  jc: string | null; ind: Inden; teks: string; teksTab: string; seg: Seg[];
  /** Gaya berkas: `w:contextualSpacing` membuang spasi antar-paragraf yang gayanya sama. */
  idGaya: string; spasi: SpasiWord;
  gambar: string[]; grafikWord: string[];
  sect: { melintang: boolean } | null; pisahHalaman: boolean; toc: boolean;
}
type HasilTabel =
  | { muat: true; payload: TabelImpor; ganti: number }
  | { muat: false; alasan: string };
interface Tbl { jenis: 'tbl'; i: number; tabel: HasilTabel; gambarDiDalam: number; paragraf: Par[] }
type Unsur = Par | Tbl;

interface Konteks { gaya: InfoGaya; nomor: Penomoran }

const melintangSect = (sp: El | undefined): boolean => {
  const sz = anak(sp, 'w:pgSz');
  if (!sz) return false;
  if (atr(sz, 'w:orient') === 'landscape') return true;
  const w = angkaAtr(sz, 'w:w'), h = angkaAtr(sz, 'w:h');
  return w != null && h != null && w > h;
};

function bacaParagraf(p: El, ctx: Konteks, i: number, toc: boolean): Par {
  const pPr = anak(p, 'w:pPr');
  const gaya = atr(anak(pPr, 'w:pStyle'), 'w:val') ?? ctx.gaya.bawaan;
  const outline = angkaAtr(anak(pPr, 'w:outlineLvl'), 'w:val');
  const tingkat = outline != null && outline >= 0 && outline <= 8 ? outline + 1 : tingkatGaya(gaya, ctx.gaya);
  const numPr = anak(pPr, 'w:numPr');
  const numIdPar = atr(anak(numPr, 'w:numId'), 'w:val');
  const numSumber = numIdPar != null
    ? { numId: numIdPar, ilvl: angkaAtr(anak(numPr, 'w:ilvl'), 'w:val') ?? 0 }
    : numGaya(gaya, ctx.gaya);
  const num = numSumber ? majukanNomor(ctx.nomor, numSumber.numId, numSumber.ilvl) : null;
  const sp = anak(pPr, 'w:sectPr');
  // Pewarisan Word: gaya → daftar → paragraf. Daftar yang disebut lewat GAYA kalah dari gaya itu sendiri.
  const dariGaya = { ...ctx.gaya.dokumen, ...indGaya(gaya, ctx.gaya) };
  const dariDaftar = num?.ind ?? {};
  const indSumber = { ...(numIdPar != null ? { ...dariGaya, ...dariDaftar } : { ...dariDaftar, ...dariGaya }), ...bacaInd(pPr) };
  const par: Par = {
    jenis: 'p', i, tingkat, keterangan: gayaKeterangan(gaya, ctx.gaya), num,
    jc: atr(anak(pPr, 'w:jc'), 'w:val'), ind: { kiri: indSumber.kiri ?? 0, kanan: indSumber.kanan ?? 0, pertama: indSumber.pertama ?? 0 },
    idGaya: gaya, spasi: { ...ctx.gaya.spasiDokumen, ...spasiGaya(gaya, ctx.gaya), ...bacaSpasiWord(pPr) },
    teks: '', teksTab: '', seg: [], gambar: [], grafikWord: [],
    sect: sp ? { melintang: melintangSect(sp) } : null,
    pisahHalaman: nyala(anak(pPr, 'w:pageBreakBefore')), toc,
  };
  const tambah = (t: string, rPr: El | undefined, br = false) => {
    const u = anak(rPr, 'w:u');
    const naik = atr(anak(rPr, 'w:vertAlign'), 'w:val');
    par.seg.push({
      t, br, b: nyala(anak(rPr, 'w:b')), i: nyala(anak(rPr, 'w:i')),
      u: !!u && (atr(u, 'w:val') ?? 'single') !== 'none',
      s: nyala(anak(rPr, 'w:strike')) || nyala(anak(rPr, 'w:dstrike')),
      naik: naik === 'superscript' || naik === 'subscript' ? naik : null,
      stabilo: stabiloDariWord(atr(anak(rPr, 'w:highlight'), 'w:val')),
    });
  };
  const run = (r: El) => {
    const rPr = anak(r, 'w:rPr');
    for (const x of elemen(r)) {
      switch (x.n) {
        case 'w:t': { const t = teksDalam(x); tambah(t, rPr); par.teksTab += t; break; }
        case 'w:tab': case 'w:ptab': tambah('\t', rPr); par.teksTab += '\t'; break;
        case 'w:br':
          if (atr(x, 'w:type') === 'page') par.pisahHalaman = true;
          else { tambah('', rPr, true); par.teksTab += ' '; }
          break;
        case 'w:cr': tambah('', rPr, true); break;
        case 'w:noBreakHyphen': tambah('-', rPr); par.teksTab += '-'; break;
        case 'w:drawing':
          for (const b of cariSemua(x, 'a:blip')) { const id = atr(b, 'r:embed') ?? atr(b, 'r:link'); if (id) par.gambar.push(id); }
          for (const c of cariSemua(x, 'c:chart')) { const id = atr(c, 'r:id'); if (id) par.grafikWord.push(id); }
          break;
        case 'w:pict': case 'w:object':
          for (const v of cariSemua(x, 'v:imagedata')) { const id = atr(v, 'r:id'); if (id) par.gambar.push(id); }
          break;
        case 'w:instrText': if (/\b(TOC|PAGEREF)\b/.test(teksDalam(x))) par.toc = true; break;
        case 'mc:AlternateContent': { const ch = anak(x, 'mc:Choice'); if (ch) run({ n: 'w:r', a: '', c: [...(rPr ? [rPr] : []), ...elemen(ch)] }); break; }
        default: break;
      }
    }
  };
  const jalan = (el: El) => {
    for (const x of elemen(el)) {
      if (x.n === 'w:r') run(x);
      else if (x.n === 'w:hyperlink') {
        if (/^_Toc/.test(atr(x, 'w:anchor') ?? '')) par.toc = true;
        jalan(x);
      } else if (['w:ins', 'w:smartTag', 'w:customXml', 'w:moveTo', 'w:fldSimple', 'w:bdo', 'w:dir'].includes(x.n)) {
        if (x.n === 'w:fldSimple' && /\b(TOC|PAGEREF)\b/.test(atr(x, 'w:instr') ?? '')) par.toc = true;
        jalan(x);
      } else if (x.n === 'w:sdt') jalan(anak(x, 'w:sdtContent') ?? x);
      else if (x.n === 'mc:AlternateContent') { const ch = anak(x, 'mc:Choice'); if (ch) jalan(ch); }
    }
  };
  jalan(p);
  if (/^TOC\d/i.test(gaya) || /^toc\s*\d/i.test(ctx.gaya.peta.get(gaya)?.nama ?? '')) par.toc = true;
  par.teks = par.seg.map(s => (s.br ? ' ' : s.t)).join('').replace(/\s+/g, ' ').trim();
  return par;
}

// ── Tabel ───────────────────────────────────────────────────────────────────
const ALIGN: Record<string, TabelAlign> = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };

function awalanButir(n: NumPar): string {
  return teksNomor(n.gaya, n.nomor, n.induk);
}

/** Paragraf sel dibaca di urutan dokumen supaya hitungan nomor daftar tetap sama dengan Word. */
function bacaTabel(tbl: El, ctx: Konteks, paragrafSel: Par[]): { hasil: HasilTabel; gambarDiDalam: number } {
  const grid = anakSemua(anak(tbl, 'w:tblGrid'), 'w:gridCol').map(g => angkaAtr(g, 'w:w') ?? 0);
  const baris: El[] = [];
  const kumpulBaris = (el: El) => {
    for (const x of elemen(el)) {
      if (x.n === 'w:tr') baris.push(x);
      else if (x.n === 'w:sdt') kumpulBaris(anak(x, 'w:sdtContent') ?? x);
      else if (x.n === 'w:customXml') kumpulBaris(x);
    }
  };
  kumpulBaris(tbl);
  interface SelMentah { mulai: number; akhir: number; lanjut: boolean; teks: string; tebal: boolean; al?: TabelAlign; va?: TabelVAlign; rot: boolean; lebar: number | null }
  const isi: { kepala: boolean; sel: SelMentah[] }[] = [];
  let ganti = 0, gambarDiDalam = 0;

  const teksParagrafSel = (p: El): { teks: string; tebal: boolean; jc: string | null } => {
    const par = bacaParagraf(p, ctx, -1, false);
    paragrafSel.push(par);
    gambarDiDalam += par.gambar.length + par.grafikWord.length;
    let teks = par.seg.map(s => (s.br ? '\n' : s.t)).join('').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (teks && par.num) teks = `${awalanButir(par.num)} ${teks}`;
    const bertekst = par.seg.filter(s => s.t.trim());
    return { teks, tebal: bertekst.length > 0 && bertekst.every(s => s.b), jc: par.jc };
  };
  const teksBersarang = (t: El): string => {
    const out: string[] = [];
    for (const tr of cariSemua(t, 'w:tr')) {
      out.push(cariSemua(tr, 'w:tc').map(tc => anakSemua(tc, 'w:p').map(p => teksParagrafSel(p).teks).filter(Boolean).join(' ')).join(' | '));
    }
    return out.filter(Boolean).join('\n');
  };

  for (const tr of baris) {
    const trPr = anak(tr, 'w:trPr');
    let pos = angkaAtr(anak(trPr, 'w:gridBefore'), 'w:val') ?? 0;
    const sel: SelMentah[] = [];
    const kumpulSel = (el: El) => {
      for (const tc of elemen(el)) {
        if (tc.n === 'w:sdt') { kumpulSel(anak(tc, 'w:sdtContent') ?? tc); continue; }
        if (tc.n === 'w:customXml') { kumpulSel(tc); continue; }
        if (tc.n !== 'w:tc') continue;
        const tcPr = anak(tc, 'w:tcPr');
        const span = Math.max(1, angkaAtr(anak(tcPr, 'w:gridSpan'), 'w:val') ?? 1);
        const vm = anak(tcPr, 'w:vMerge');
        const lanjut = !!vm && (atr(vm, 'w:val') ?? 'continue') !== 'restart';
        const paragraf: { teks: string; tebal: boolean; jc: string | null }[] = [];
        for (const x of elemen(tc)) {
          if (x.n === 'w:p') paragraf.push(teksParagrafSel(x));
          else if (x.n === 'w:tbl') paragraf.push({ teks: teksBersarang(x), tebal: false, jc: null });
          else if (x.n === 'w:sdt') for (const p of cariSemua(x, 'w:p')) paragraf.push(teksParagrafSel(p));
        }
        let teks = paragraf.map(q => q.teks).filter(Boolean).join('\n').slice(0, BATAS_TEKS_SEL);
        // Sel diawali "=" dibaca editor sebagai rumus — tanda samadengan lebar menjaganya tetap teks.
        if (teks.startsWith('=')) { teks = `＝${teks.slice(1)}`; ganti++; }
        const berisi = paragraf.filter(q => q.teks);
        const jc = berisi[0]?.jc ?? paragraf[0]?.jc ?? null;
        const vAlign = atr(anak(tcPr, 'w:vAlign'), 'w:val');
        const arah = atr(anak(tcPr, 'w:textDirection'), 'w:val') ?? '';
        const tcW = anak(tcPr, 'w:tcW');
        sel.push({
          mulai: pos, akhir: pos + span, lanjut, teks,
          tebal: berisi.length > 0 && berisi.every(q => q.tebal),
          al: jc ? ALIGN[jc] : undefined,
          va: vAlign === 'center' ? 'middle' : vAlign === 'bottom' ? 'bottom' : undefined,
          rot: /^(btLr|tbRl|tbRlV|tbLrV)$/.test(arah),
          lebar: tcW && (atr(tcW, 'w:type') ?? 'dxa') === 'dxa' ? angkaAtr(tcW, 'w:w') : null,
        });
        pos += span;
      }
    };
    kumpulSel(tr);
    isi.push({ kepala: nyala(anak(trPr, 'w:tblHeader')), sel });
  }
  const tolak = (alasan: string) => ({ hasil: { muat: false as const, alasan }, gambarDiDalam });
  if (isi.length === 0) return tolak('tabel kosong');

  // Grid dirapikan: hanya batas yang menjadi tepi sel sungguhan (konsep §4) — grid Word 22 kolom
  // di berkas kalibrasi ternyata 12 kolom nyata.
  const batas = [...new Set(isi.flatMap(b => b.sel.flatMap(s => [s.mulai, s.akhir])))].sort((a, b) => a - b);
  const ncol = batas.length - 1;
  if (ncol < 1) return tolak('tabel kosong');
  if (ncol > BATAS_KOLOM_TABEL) return tolak(`${ncol} kolom (maks ${BATAS_KOLOM_TABEL})`);
  if (isi.length > BATAS_BARIS_TABEL) return tolak(`${isi.length} baris (maks ${BATAS_BARIS_TABEL})`);
  const kol = new Map(batas.map((b, k) => [b, k]));

  const rows: TabelCell[][] = isi.map(() => Array.from({ length: ncol }, () => ({ v: '' }) as TabelCell));
  const asalVertikal = new Map<number, { r: number; c: number }>();
  isi.forEach((b, r) => {
    for (const s of b.sel) {
      const c = kol.get(s.mulai)!, cs = kol.get(s.akhir)! - c;
      if (s.lanjut) {
        const asal = asalVertikal.get(c);
        if (asal) { rows[asal.r][asal.c].rs = r - asal.r + 1; continue; }
      }
      const cell: TabelCell = { v: s.teks };
      if (cs > 1) cell.cs = cs;
      if (s.tebal) cell.b = true;
      if (s.al) cell.al = s.al;
      if (s.va) cell.va = s.va;
      if (s.rot) cell.rot = true;
      rows[r][c] = cell;
      for (let k = c; k < c + cs; k++) asalVertikal.delete(k);
      asalVertikal.set(c, { r, c });
    }
  });
  const rapi = sanitizeRows(rows, ncol);

  // Kepala = baris "ulangi sebagai judul"; tanpa itu baris pertama, diperpanjang sejauh gabungan tegaknya.
  let kepala = 0;
  while (kepala < isi.length && isi[kepala].kepala) kepala++;
  if (kepala === 0) kepala = 1;
  for (let r = 0; r < kepala && r < rapi.length; r++) {
    for (const cell of rapi[r]) if (!cell.h) kepala = Math.max(kepala, r + (cell.rs ?? 1));
  }
  kepala = Math.min(kepala, BATAS_BARIS_KEPALA, rapi.length);

  const colWidths = Array.from({ length: ncol }, (_, k) => {
    let tw = 0;
    if (grid.length >= batas[k + 1]) for (let g = batas[k]; g < batas[k + 1]; g++) tw += grid[g] ?? 0;
    if (!tw) tw = isi.flatMap(b => b.sel).find(x => x.mulai === batas[k] && x.akhir === batas[k + 1] && x.lebar)?.lebar ?? 0;
    return Math.max(24, Math.min(2000, Math.round((tw || 2100) / DXA_PER_PX)));
  });

  return {
    gambarDiDalam,
    hasil: {
      muat: true, ganti,
      payload: {
        judul: '', kolom: namaKolomDariKepala(rapi, kepala, Array.from({ length: ncol }, () => '')),
        align: [], colWidths, headerRows: kepala, rows: rapi, melintang: false,
      },
    },
  };
}

// ── Urutan unsur badan ──────────────────────────────────────────────────────
function kumpulkanUnsur(body: El, ctx: Konteks): { unsur: Unsur[]; akhirMelintang: boolean } {
  const unsur: Unsur[] = [];
  const jalan = (el: El, toc: boolean) => {
    for (const x of elemen(el)) {
      if (x.n === 'w:p') unsur.push(bacaParagraf(x, ctx, unsur.length, toc));
      else if (x.n === 'w:tbl') {
        const i = unsur.length;
        const paragraf: Par[] = [];
        const { hasil, gambarDiDalam } = bacaTabel(x, ctx, paragraf);
        unsur.push({ jenis: 'tbl', i, tabel: hasil, gambarDiDalam, paragraf });
      } else if (x.n === 'w:sdt') {
        const galeri = cariSemua(anak(x, 'w:sdtPr') ?? KOSONG, 'w:docPartGallery').map(g => atr(g, 'w:val') ?? '').join(' ');
        jalan(anak(x, 'w:sdtContent') ?? x, toc || /contents/i.test(galeri));
      } else if (['w:customXml', 'w:smartTag', 'w:ins', 'w:moveTo'].includes(x.n)) jalan(x, toc);
      else if (x.n === 'mc:AlternateContent') { const ch = anak(x, 'mc:Choice'); if (ch) jalan(ch, toc); }
    }
  };
  jalan(body, false);
  return { unsur, akhirMelintang: melintangSect(anak(body, 'w:sectPr')) };
}

// ── Narasi → HTML ───────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAG_TAB = '<span data-tab="1">\t</span>';
function htmlBaris(seg: Seg[]): string {
  const bersih = seg.map(s => ({ ...s, t: s.t.replace(/\u00a0/g, ' ') }));
  const kosong = (t: string) => !t.includes('\t') && !t.trim();
  while (bersih.length && !bersih[0].br && kosong(bersih[0].t)) bersih.shift();
  while (bersih.length && (bersih[bersih.length - 1].br || !bersih[bersih.length - 1].t.trim())) bersih.pop();
  if (bersih.length) { bersih[0].t = bersih[0].t.replace(/^ +/, ''); const z = bersih[bersih.length - 1]; z.t = z.t.replace(/\s+$/, ''); }
  let out = '';
  let i = 0;
  while (i < bersih.length) {
    const s = bersih[i];
    if (s.br) { out += '<br>'; i++; continue; }
    let t = s.t;
    let j = i + 1;
    while (j < bersih.length && !bersih[j].br && bersih[j].b === s.b && bersih[j].i === s.i && bersih[j].u === s.u && bersih[j].s === s.s && (bersih[j].naik ?? null) === (s.naik ?? null) && (bersih[j].stabilo ?? null) === (s.stabilo ?? null)) { t += bersih[j].t; j++; }
    let h = esc(t.replace(/ {2,}/g, ' ')).replace(/\t/g, TAG_TAB);
    if (t.trim()) {
      if (s.naik) h = s.naik === 'superscript' ? `<sup>${h}</sup>` : `<sub>${h}</sub>`;
      if (s.stabilo) h = `<mark data-stabilo="${s.stabilo}">${h}</mark>`;
      if (s.s) h = `<s>${h}</s>`;
      if (s.u) h = `<u>${h}</u>`;
      if (s.i) h = `<em>${h}</em>`;
      if (s.b) h = `<strong>${h}</strong>`;
    }
    out += h;
    i = j;
  }
  return out;
}

// Word tanpa isian apa pun: rapat, tunggal.
const SPASI_WORD_KOSONG: Spasi = { sebelum: 0, sesudah: 0, baris: 240 };
/** Tinggi baris pasti ("exactly", "at least") bukan kelipatan: tak bisa dibawa, ikut Pengaturan Dokumen. */
const barisKelipatan = (s: SpasiWord) => !s.aturan || s.aturan === 'auto';
/** Spasi yang Word pakai untuk paragraf ini. `w:contextualSpacing` membuang spasi di sisi paragraf bergaya sama. */
function spasiBerlakuWord(par: Par[], i: number, dokumen: Spasi): Spasi {
  const p = par[i];
  const s = p.spasi;
  return {
    sebelum: s.kontekstual && par[i - 1]?.idGaya === p.idGaya ? 0 : s.sebelum ?? SPASI_WORD_KOSONG.sebelum,
    sesudah: s.kontekstual && par[i + 1]?.idGaya === p.idGaya ? 0 : s.sesudah ?? SPASI_WORD_KOSONG.sesudah,
    baris: barisKelipatan(s) ? s.baris ?? SPASI_WORD_KOSONG.baris : dokumen.baris,
  };
}
const htmlNarasi = (par: Par[], bawaanDxa: number, dokumen: Spasi): string[] =>
  susunNarasi(par.map((p, i) => ({ isi: htmlBaris(p.seg).slice(0, BATAS_HTML_BLOK - 200), jc: p.jc, ind: p.ind, num: p.num, spasi: spasiKeTersimpan(spasiBerlakuWord(par, i, dokumen), dokumen) })), bawaanDxa, BATAS_HTML_BLOK);

// Pengaturan Dokumen hanya menerima empat spasi baris ini.
const BARIS_PENGATURAN = new Map<number, number>([[240, 1], [276, 1.15], [360, 1.5], [480, 2]]);
const BATAS_SESUDAH_PENGATURAN_PT = 24;
const palingBerat = (bobot: Map<number, number>) => [...bobot.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];

// ── Keterangan objek ────────────────────────────────────────────────────────
const RE_KETERANGAN = /^(Tabel|Gambar|Grafik)\s+(\d{1,3}(?:\.\d{1,3})*)(?=$|[\s.:)\-–—])\s*[.:)\-–—]?\s*(.*)$/i;
const RE_BAB = /^BAB\s+([IVXLC]{1,6})\b\.?\s*[:.\-–—]?\s*(.*)$/i;
const RE_LAMPIRAN = /^LAMPIRAN\b/i;
// Nomor ketikan di depan judul ("A. ", "1.1 ") — LKJIP menomori sendiri.
const RE_NOMOR_KETIK = /^(?:(?:[A-Za-z]|[IVXivx]{1,5})[.)]|\d{1,2}(?:\.\d{1,2}){0,3}[.)]?)\s+(?=\S)/;

const jenisObjekDari = (s: string): JenisObjek => {
  const t = s.toLowerCase();
  return t === 'tabel' ? 'Tabel' : t === 'grafik' ? 'Grafik' : 'Gambar';
};
const rapikan = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s.:\-–—]+/, '').replace(/[\s:]+$/, '').trim();
const adaGambar = (u: Unsur | undefined): u is Par => !!u && u.jenis === 'p' && (u.gambar.length > 0 || u.grafikWord.length > 0);
const cocokObjek = (jenis: JenisObjek, u: Unsur | undefined): boolean =>
  !!u && (jenis === 'Tabel' ? u.jenis === 'tbl' : adaGambar(u) && (jenis === 'Grafik' || (u as Par).gambar.length > 0));

// ── Kata Pengantar & daftar di bagian depan ─────────────────────────────────
const RE_TEMPAT_TANGGAL = /^[A-Z][A-Za-z.' -]{1,40},\s*\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}$/;
const RE_JUDUL_DEPAN = /^(DAFTAR\s+(ISI|TABEL|GAMBAR|GRAFIK|LAMPIRAN|SINGKATAN)|RINGKASAN\s+EKSEKUTIF|IKHTISAR\s+EKSEKUTIF|EXECUTIVE\s+SUMMARY)$/i;
const RE_JUDUL_KP = /^KATA\s+PENGANTAR$/i;

/** Daftar Tabel/Gambar/Grafik di bagian depan → judul cadangan per nomor (dipotong di tab sebelum nomor halaman). */
function bacaDaftar(depan: Par[]): Map<string, string> {
  const peta = new Map<string, string>();
  let kini: { kunci: string; teks: string } | null = null;
  const selesai = () => {
    if (!kini) return;
    const potong = kini.teks.lastIndexOf('\t');
    const judul = rapikan((potong >= 0 ? kini.teks.slice(0, potong) : kini.teks).replace(/\t/g, ' ').replace(RE_KETERANGAN, '$3'));
    if (judul && !peta.has(kini.kunci)) peta.set(kini.kunci, judul);
    kini = null;
  };
  for (const p of depan) {
    const t = p.teksTab.replace(/^\s+/, '');
    const m = RE_KETERANGAN.exec(p.teks);
    if (m) { selesai(); kini = { kunci: `${jenisObjekDari(m[1])}|${m[2]}`, teks: t }; }
    else if (kini && p.teks) kini.teks += ` ${t}`;
    else selesai();
    if (kini && kini.teks.includes('\t')) selesai();
  }
  selesai();
  return peta;
}

const TTD_KOSONG: TandaTangan = { tempatTanggal: '', jabatan: '', nama: '', pangkat: '', nip: '' };

/** Tanda tangan dibaca dari bawah: NIP, lalu nama (+ pangkat) di atas jeda kosong, jabatan di bawah tempat-tanggal. */
function bacaTandaTangan(L: Par[], peringatan: string[]): { ttd: TandaTangan; mulai: number } {
  const idxNip = L.map(p => /^NIP\b/i.test(p.teks)).lastIndexOf(true);
  const idxTT = L.map(p => RE_TEMPAT_TANGGAL.test(p.teks)).lastIndexOf(true);
  if (idxNip < 0 && idxTT < 0) return { ttd: { ...TTD_KOSONG }, mulai: L.length };
  if (idxNip < 0) {
    peringatan.push('Tanda tangan Kata Pengantar hanya terbaca tempat-tanggalnya — lengkapi nama & NIP di Pengaturan Dokumen.');
    return { ttd: { ...TTD_KOSONG, tempatTanggal: L[idxTT].teks.slice(0, 120) }, mulai: idxTT };
  }
  const bawah: string[] = [];
  let j = idxNip - 1;
  while (j > idxTT && j >= 0 && L[j].teks) { bawah.unshift(L[j].teks); j--; }
  let jabatan: string[];
  let nama: string, pangkat: string;
  let mulai: number;
  if (j >= 0 && j > idxTT && !L[j].teks) {
    nama = bawah[0] ?? '';
    pangkat = bawah.slice(1).join(' ');
    let k = j;
    while (k > idxTT && !L[k].teks) k--;
    const atas: string[] = [];
    while (k > idxTT && k >= 0 && L[k].teks) { atas.unshift(L[k].teks); k--; }
    jabatan = atas;
    mulai = idxTT >= 0 ? idxTT : k + 1;
  } else {
    // Tanpa jeda kosong, batas jabatan/nama ditebak: dua baris terbawah = nama + pangkat.
    if (bawah.length >= 3) { pangkat = bawah[bawah.length - 1]; nama = bawah[bawah.length - 2]; jabatan = bawah.slice(0, -2); }
    else { nama = bawah[0] ?? ''; pangkat = bawah[1] ?? ''; jabatan = []; }
    mulai = idxTT >= 0 ? idxTT : j + 1;
    peringatan.push('Tanda tangan Kata Pengantar dibaca tanpa jeda antara jabatan dan nama — periksa di Pengaturan Dokumen.');
  }
  return {
    ttd: {
      tempatTanggal: idxTT >= 0 ? L[idxTT].teks.slice(0, 120) : '',
      jabatan: jabatan.join('\n').slice(0, 300), nama: nama.slice(0, 120), pangkat: pangkat.slice(0, 120),
      nip: L[idxNip].teks.slice(0, 60),
    },
    mulai,
  };
}

// ── Berkas ──────────────────────────────────────────────────────────────────
function bukaZip(data: Uint8Array): PizZip {
  if (data.length >= 4 && data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) {
    throw new ImporWordError('Berkas ini format Word lama (.doc). Buka di Word lalu Simpan Sebagai .docx dulu.');
  }
  if (data.length > BATAS_BERKAS_IMPOR) throw new ImporWordError(PESAN_TERLALU_BESAR);
  try { return new PizZip(data); }
  catch { throw new ImporWordError('Berkas bukan dokumen Word .docx yang sah.'); }
}

// L67: ukuran terurai diperiksa sebelum dibuka bila zip mencatatnya (bom zip).
function teksZip(zip: PizZip, nama: string, batas = BATAS_XML): string | null {
  const f = zip.file(nama);
  if (!f) return null;
  const ukuran = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (typeof ukuran === 'number' && ukuran > batas) throw new ImporWordError('Isi dokumen Word terlalu besar untuk diimpor.');
  const t = f.asText();
  if (t.length > batas) throw new ImporWordError('Isi dokumen Word terlalu besar untuk diimpor.');
  return t;
}

function sniffGambar(b: Uint8Array): { ext: 'png' | 'jpg' | 'gif'; mime: string } | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: 'gif', mime: 'image/gif' };
  return null;
}

function bacaRels(xml: string | null): Map<string, { target: string; luar: boolean }> {
  const peta = new Map<string, { target: string; luar: boolean }>();
  if (!xml) return peta;
  for (const r of cariSemua(uraiXml(xml), 'Relationship')) {
    peta.set(atr(r, 'Id') ?? '', { target: atr(r, 'Target') ?? '', luar: atr(r, 'TargetMode') === 'External' });
  }
  return peta;
}
const jalurWord = (target: string): string => {
  const bagian: string[] = [];
  for (const s of (target.startsWith('/') ? target.slice(1) : `word/${target}`).split('/')) {
    if (s === '..') bagian.pop(); else if (s && s !== '.') bagian.push(s);
  }
  return bagian.join('/');
};

function bacaGrafikWord(zip: PizZip, jalur: string): { chartType: 'pie' | 'bar' | 'line'; data: { label: string; value: number }[] } | null {
  const xml = teksZip(zip, jalur, 5 * 1024 * 1024);
  if (!xml) return null;
  const plot = cariSemua(uraiXml(xml), 'c:plotArea')[0];
  if (!plot) return null;
  const jenisEl = elemen(plot).find(x => /^c:\w+Chart$/.test(x.n));
  const chartType = !jenisEl ? 'bar' : /pie|doughnut/i.test(jenisEl.n) ? 'pie' : /line/i.test(jenisEl.n) ? 'line' : 'bar';
  const ser = jenisEl ? anak(jenisEl, 'c:ser') : undefined;
  if (!ser) return null;
  const titik = (el: El | undefined): Map<number, string> => {
    const m = new Map<number, string>();
    if (el) for (const pt of cariSemua(el, 'c:pt')) m.set(angkaAtr(pt, 'idx') ?? m.size, teksDalam(anak(pt, 'c:v') ?? KOSONG));
    return m;
  };
  const kat = titik(anak(ser, 'c:cat'));
  const nil = titik(anak(ser, 'c:val'));
  const data = [...nil.entries()].sort((a, b) => a[0] - b[0]).slice(0, 50)
    .map(([idx, v]) => ({ label: (kat.get(idx) ?? `Data ${idx + 1}`).slice(0, 120), value: Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }));
  return data.length ? { chartType, data } : null;
}

const tahunDari = (teks: string[]): number | null => {
  const hitung = new Map<number, number>();
  for (const t of teks) for (const m of t.matchAll(/\b(20[1-9]\d)\b/g)) hitung.set(Number(m[1]), (hitung.get(Number(m[1])) ?? 0) + 1);
  return [...hitung.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
};

// ── Pembaca utama ───────────────────────────────────────────────────────────
type Peran = 'bab' | 'babJudul' | 'sub' | 'subsub' | 'lampiran' | 'judul' | 'lanjutJudul' | 'isi' | 'kosong' | 'buang';
interface Keterangan { jenis: JenisObjek; nomor: string; judul: string; target: number; lanjut: number[] }

export function bacaDocxLkjip(data: Uint8Array | ArrayBuffer, koreksi: Koreksi = {}): HasilImporWord {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const zip = bukaZip(bytes);
  const docXml = teksZip(zip, 'word/document.xml');
  if (!docXml) throw new ImporWordError('Berkas bukan dokumen Word .docx (word/document.xml tidak ada).');
  const media = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
  if (media.length > BATAS_MEDIA) throw new ImporWordError(`Berkas berisi ${media.length} gambar (maks ${BATAS_MEDIA}).`);

  const peringatan: string[] = [];
  const ctx: Konteks = { gaya: bacaGaya(teksZip(zip, 'word/styles.xml')), nomor: bacaPenomoran(teksZip(zip, 'word/numbering.xml')) };
  const rels = bacaRels(teksZip(zip, 'word/_rels/document.xml.rels'));
  const body = anak(anak(uraiXml(docXml), 'w:document'), 'w:body');
  if (!body) throw new ImporWordError('Isi dokumen Word tidak terbaca.');
  const { unsur, akhirMelintang } = kumpulkanUnsur(body, ctx);

  // Setelan dokumen = indent baris pertama yang paling banyak dipakai isi berkas (ditimbang panjang teks,
  // supaya label pendek tidak mengalahkan paragraf isi). Sisanya membawa angkanya sendiri lewat `data-ind-*`,
  // jadi berkas tanpa indent tidak mendadak menjorok 1,27 cm sesudah diimpor.
  const bobotPertama = new Map<number, number>();
  for (const u of unsur) {
    if (u.jenis !== 'p' || u.num || u.tingkat != null || u.keterangan || u.toc || !u.teks || u.ind.pertama < 0 || u.jc === 'center' || u.jc === 'right') continue;
    bobotPertama.set(u.ind.pertama, (bobotPertama.get(u.ind.pertama) ?? 0) + u.teks.length);
  }
  const palingLazim = [...bobotPertama.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const indenBawaanCm = palingLazim === undefined ? null
    : palingLazim > BATAS_INDENT_CM * TWIPS_PER_CM ? BATAS_INDENT_CM
      : Math.round((palingLazim / TWIPS_PER_CM) * 100) / 100;
  const bawaanDxa = indentTwips(indenBawaanCm ?? 0);

  // Orientasi tiap unsur: sectPr paragraf mengakhiri section-nya, jadi dibaca dari belakang.
  const melintang: boolean[] = new Array(unsur.length);
  let orient = akhirMelintang;
  for (let k = unsur.length - 1; k >= 0; k--) {
    const u = unsur[k];
    if (u.jenis === 'p' && u.sect) orient = u.sect.melintang;
    melintang[k] = orient;
  }

  const par = (k: number): Par | null => (unsur[k]?.jenis === 'p' ? unsur[k] as Par : null);

  // ── Batas bagian depan: Judul 1 berisi pertama; berkas tanpa gaya Judul memakai baris "BAB I" ──
  const adaJudul1 = unsur.some(u => u.jenis === 'p' && u.tingkat === 1 && u.teks && !u.toc);
  const tingkatPar = (p: Par): number | null => {
    if (p.tingkat != null) return p.tingkat;
    if (!adaJudul1 && !p.toc && !p.num && RE_BAB.test(p.teks)) return 1;
    return null;
  };
  let awalIsi = unsur.findIndex(u => u.jenis === 'p' && !u.toc && u.teks !== '' && tingkatPar(u) === 1);
  if (awalIsi < 0) {
    awalIsi = 0;
    peringatan.push('Tidak ada Judul 1 / baris "BAB …" — seluruh isi masuk satu bab. Susun babnya di pratinjau atau di editor.');
  }

  // ── Bagian depan: daftar (cadangan judul objek) + Kata Pengantar ──
  const depan: Par[] = [];
  // Sama seperti indent: yang paling banyak dipakai isi berkas jadi Pengaturan Dokumen, sisanya membawa angkanya
  // sendiri lewat `data-sp-*`. Kalau tidak, nyaris tiap paragraf berkas biasa membawa atribut yang sama.
  const bobotBaris = new Map<number, number>();
  const bobotSesudah = new Map<number, number>();
  let barisPasti = 0;
  // Sampul & halaman depan tidak ikut: gayanya bukan gaya isi laporan.
  const isiBerkas = unsur.slice(awalIsi).filter((u): u is Par => u.jenis === 'p' && u.tingkat == null && !u.keterangan && !u.toc);
  isiBerkas.forEach((u, i) => {
    if (!u.teks) return;
    if (!barisKelipatan(u.spasi)) barisPasti++;
    const s = spasiBerlakuWord(isiBerkas, i, SPASI_WORD_KOSONG);
    if (BARIS_PENGATURAN.has(s.baris) && barisKelipatan(u.spasi)) bobotBaris.set(s.baris, (bobotBaris.get(s.baris) ?? 0) + u.teks.length);
    if (s.sesudah <= BATAS_SESUDAH_PENGATURAN_PT * 20) bobotSesudah.set(s.sesudah, (bobotSesudah.get(s.sesudah) ?? 0) + u.teks.length);
  });
  const barisLazim = palingBerat(bobotBaris);
  const sesudahLazim = palingBerat(bobotSesudah);
  const adaSpasiBawaan = barisLazim !== undefined || sesudahLazim !== undefined;
  const spasiBawaanDok = adaSpasiBawaan ? {
    lineSpacing: barisLazim !== undefined ? BARIS_PENGATURAN.get(barisLazim)! : DEFAULT_STYLE_IMPOR.lineSpacing,
    spaceAfterPt: sesudahLazim !== undefined ? sesudahLazim / 20 : DEFAULT_STYLE_IMPOR.spaceAfterPt,
  } : null;
  const spasiDok = spasiBawaan(spasiBawaanDok?.spaceAfterPt ?? DEFAULT_STYLE_IMPOR.spaceAfterPt, spasiBawaanDok?.lineSpacing ?? DEFAULT_STYLE_IMPOR.lineSpacing);
  if (barisPasti) peringatan.push(`${barisPasti} paragraf memakai tinggi baris pasti (bukan kelipatan) — spasi barisnya ikut Pengaturan Dokumen.`);

  for (let k = 0; k < awalIsi; k++) {
    const u = unsur[k];
    if (u.jenis === 'p') depan.push(u);
    else depan.push(...u.paragraf);   // tanda tangan kadang disusun di tabel tanpa garis
  }
  const daftar = bacaDaftar(depan);
  const halaman: Par[][] = [[]];
  for (const p of depan) {
    if (p.pisahHalaman && halaman[halaman.length - 1].length) halaman.push([]);
    halaman[halaman.length - 1].push(p);
    if (p.sect) halaman.push([]);
  }
  const bukanDaftar = (h: Par[]) => !h.some(p => p.toc || RE_KETERANGAN.test(p.teks) || /^DAFTAR\s/i.test(p.teks));
  let kp: Par[] = [];
  const idxJudulKp = halaman.findIndex(h => h.some(p => !p.toc && RE_JUDUL_KP.test(p.teks)));
  if (idxJudulKp >= 0) {
    const h = halaman[idxJudulKp];
    kp = h.slice(h.findIndex(p => !p.toc && RE_JUDUL_KP.test(p.teks)) + 1);
    for (let k = idxJudulKp + 1; k < halaman.length; k++) {
      const hh = halaman[k];
      if (!bukanDaftar(hh) || hh.some(p => RE_JUDUL_DEPAN.test(p.teks))) break;
      kp.push(...hh);
    }
  } else {
    const idxNip = halaman.map(h => bukanDaftar(h) && h.some(p => /^NIP\b/i.test(p.teks))).lastIndexOf(true);
    if (idxNip >= 0) kp = halaman[idxNip];
  }
  const kpTerpakai = new Set(kp);
  halaman.forEach((h, k) => {
    if (k === 0 || !h.some(p => p.teks) || !bukanDaftar(h) || h.some(p => kpTerpakai.has(p))) return;
    const awal = h.find(p => p.teks)?.teks ?? '';
    if (!RE_JUDUL_KP.test(awal)) peringatan.push(`Bagian depan "${awal.slice(0, 60)}" tidak dibawa — LKJIP belum punya tempat untuk bagian itu.`);
  });
  let kataPengantar: HasilImporWord['kataPengantar'] = { html: '', paragraf: 0, ttd: { ...TTD_KOSONG } };
  if (kp.length) {
    const { ttd, mulai } = bacaTandaTangan(kp, peringatan);
    const isi = kp.slice(0, mulai).filter(p => p.teks);
    let html = htmlNarasi(isi, bawaanDxa, spasiDok).join('');
    if (html.length > BATAS_KATA_PENGANTAR) {
      html = html.slice(0, BATAS_KATA_PENGANTAR);
      html = html.slice(0, html.lastIndexOf('</p>') + 4);
      peringatan.push('Kata Pengantar lebih panjang dari batas 20.000 huruf — sisanya terpotong.');
    }
    kataPengantar = { html, paragraf: isi.length, ttd };
  } else if (awalIsi > 0) {
    peringatan.push('Kata Pengantar tidak dikenali — isi di Pengaturan Dokumen bila perlu.');
  }

  // ── Peran tiap paragraf badan (sebelum koreksi) ──
  const peran: Peran[] = new Array(unsur.length).fill('isi');
  const judulBab = new Map<number, string>();
  let judulKosong = 0;
  for (let k = awalIsi; k < unsur.length; k++) {
    const p = par(k);
    if (!p) continue;
    if (p.toc) { peran[k] = 'buang'; continue; }
    if (!p.teks && !p.gambar.length && !p.grafikWord.length) {
      if (p.tingkat != null && p.tingkat <= 2) judulKosong++;
      peran[k] = 'kosong';
      continue;
    }
    if (peran[k] === 'babJudul') continue;
    const t = tingkatPar(p);
    if (t == null || !p.teks) continue;
    if (t === 1) {
      if (RE_LAMPIRAN.test(p.teks)) { peran[k] = 'lampiran'; judulBab.set(k, 'LAMPIRAN'); continue; }
      peran[k] = 'bab';
      const mb = RE_BAB.exec(p.teks);
      if (mb) {
        let judul = rapikan(mb[2]);
        if (!judul) {
          let j = k + 1;
          while (j < unsur.length && par(j) && !par(j)!.teks && !adaGambar(unsur[j])) j++;
          const q = par(j);
          if (q && q.teks && !q.num && !RE_BAB.test(q.teks) && (tingkatPar(q) === 1 || (q.tingkat == null && q.jc === 'center' && q.teks.length <= 120))) {
            judul = q.teks;
            peran[j] = 'babJudul';
          }
        }
        judulBab.set(k, judul || `BAB ${mb[1].toUpperCase()}`);
      } else judulBab.set(k, p.teks.replace(RE_NOMOR_KETIK, ''));
      continue;
    }
    if (t >= 3 && RE_LAMPIRAN.test(p.teks) && p.teks.length <= 40) { peran[k] = 'lampiran'; judulBab.set(k, 'LAMPIRAN'); continue; }
    peran[k] = t === 2 ? 'sub' : 'subsub';
  }
  if (judulKosong) peringatan.push(`${judulKosong} judul kosong dibuang.`);

  // Sub-bab bergaya Normal: paragraf bernomor di daftar yang dipakai Judul 2 bab itu (INOVASI/PENGHARGAAN).
  const tandaSub = new Map<number, string>();
  {
    let awalBab = awalIsi;
    const hitung = new Map<string, number>();
    const simpan = () => { const top = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0]; if (top) tandaSub.set(awalBab, top[0]); hitung.clear(); };
    for (let k = awalIsi; k < unsur.length; k++) {
      if (peran[k] === 'bab' || peran[k] === 'lampiran') { simpan(); awalBab = k; }
      const p = par(k);
      if (p && peran[k] === 'sub' && p.num) { const kunci = `${p.num.numId}|${p.num.ilvl}`; hitung.set(kunci, (hitung.get(kunci) ?? 0) + 1); }
    }
    simpan();
    let tanda = tandaSub.get(awalIsi);
    for (let k = awalIsi; k < unsur.length; k++) {
      if (peran[k] === 'bab' || peran[k] === 'lampiran') tanda = tandaSub.get(k);
      const p = par(k);
      if (!p || peran[k] !== 'isi' || !p.num || !tanda || p.tingkat != null) continue;
      if (`${p.num.numId}|${p.num.ilvl}` === tanda && p.teks.length <= 150 && !p.gambar.length) peran[k] = 'sub';
    }
    // Judul 2 yang bernomor di daftar lain: kemungkinan butir bagian sebelumnya, bukan sub-bab.
    tanda = tandaSub.get(awalIsi);
    for (let k = awalIsi; k < unsur.length; k++) {
      if (peran[k] === 'bab' || peran[k] === 'lampiran') tanda = tandaSub.get(k);
      const p = par(k);
      if (p && peran[k] === 'sub' && p.tingkat != null && p.num && tanda && `${p.num.numId}|${p.num.ilvl}` !== tanda) {
        peringatan.push(`"${p.teks.slice(0, 60)}" bergaya Judul 2 tetapi bernomor di daftar lain — mungkin bagian dari sub-bab sebelumnya. Periksa di pratinjau.`);
      }
    }
  }

  // ── Keterangan objek: di atas atau di bawah objeknya ──
  interface Pilihan { target: number; lanjut: number[] }
  interface Calon { k: number; jenis: JenisObjek; nomor: string; sisa: string; depan: Pilihan | null; belakang: Pilihan | null }
  const keluarga = (p: Par): 'judul' | 'tengah' | 'lain' => (p.keterangan || (p.tingkat != null && p.tingkat >= 3)) ? 'judul' : p.jc === 'center' ? 'tengah' : 'lain';
  const bisaLanjut = (q: Par | null, kel: 'judul' | 'tengah' | 'lain', k: number): boolean =>
    !!q && kel !== 'lain' && (peran[k] === 'isi' || peran[k] === 'subsub') && !q.num && !q.gambar.length && !q.grafikWord.length
    && q.teks.length > 0 && q.teks.length <= 300 && !RE_KETERANGAN.test(q.teks) && keluarga(q) === kel;
  const calon: Calon[] = [];
  for (let k = awalIsi; k < unsur.length; k++) {
    const p = par(k);
    if (!p || (peran[k] !== 'isi' && peran[k] !== 'subsub') || p.num || p.gambar.length || p.teks.length > 300) continue;
    const m = RE_KETERANGAN.exec(p.teks);
    if (!m) continue;
    const jenis = jenisObjekDari(m[1]);
    const kel = keluarga(p);
    let j = k + 1;
    const lanjut: number[] = [];
    while (j < unsur.length) {
      if (peran[j] === 'kosong') { j++; continue; }
      if (lanjut.length < 3 && bisaLanjut(par(j), kel, j)) { lanjut.push(j); j++; continue; }
      break;
    }
    const depanOk = cocokObjek(jenis, unsur[j]) ? { target: j, lanjut } : null;
    let b = k - 1;
    while (b >= awalIsi && peran[b] === 'kosong') b--;
    let belakangOk: Pilihan | null = null;
    if (b >= awalIsi && cocokObjek(jenis, unsur[b])) {
      const lb: number[] = [];
      let q = k + 1;
      while (q < unsur.length && lb.length < 2 && kel === 'judul' && bisaLanjut(par(q), kel, q)) { lb.push(q); q++; }
      belakangOk = { target: b, lanjut: lb };
    }
    if (depanOk || belakangOk) calon.push({ k, jenis, nomor: m[2], sisa: m[3], depan: depanOk, belakang: belakangOk });
    else if (peran[k] === 'subsub') {
      peran[k] = 'isi';
      peringatan.push(`Keterangan "${p.teks.slice(0, 50)}" tidak bertemu ${jenis.toLowerCase()}nya — masuk sebagai narasi.`);
    }
  }
  // Arah yang tak bisa diputuskan sendiri (objek di depan DAN di belakang) mengikuti kebiasaan berkas.
  const arahUtama = (kelompok: (j: JenisObjek) => boolean): 'depan' | 'belakang' => {
    const c = calon.filter(x => kelompok(x.jenis));
    const d = c.filter(x => x.depan && !x.belakang).length, bl = c.filter(x => x.belakang && !x.depan).length;
    return bl > d ? 'belakang' : 'depan';
  };
  const arah = { tabel: arahUtama(j => j === 'Tabel'), gambar: arahUtama(j => j !== 'Tabel') };
  const keterangan = new Map<number, Keterangan>();
  const milikTarget = new Map<number, number>();
  const pasang = (k: number, jenis: JenisObjek, nomor: string, sisa: string, pilihan: Pilihan) => {
    const judul = rapikan([sisa, ...pilihan.lanjut.map(j => par(j)!.teks)].join(' '));
    keterangan.set(k, { jenis, nomor, judul: judul || daftar.get(`${jenis}|${nomor}`) || '', target: pilihan.target, lanjut: pilihan.lanjut });
    milikTarget.set(pilihan.target, k);
    peran[k] = 'judul';
    for (const j of pilihan.lanjut) peran[j] = 'lanjutJudul';
  };
  for (const c of calon) {
    const urut = arah[c.jenis === 'Tabel' ? 'tabel' : 'gambar'] === 'depan' ? [c.depan, c.belakang] : [c.belakang, c.depan];
    const pilih = urut.find((x): x is Pilihan => !!x && !milikTarget.has(x.target) && x.lanjut.every(j => peran[j] !== 'lanjutJudul'));
    if (pilih) pasang(c.k, c.jenis, c.nomor, c.sisa, pilih);
    else if (peran[c.k] === 'subsub') peran[c.k] = 'isi';
  }

  // ── Penanda (yang bisa dikoreksi) & penerapan koreksi ──
  const otomatis = new Map<number, JenisPenanda>();
  for (let k = awalIsi; k < unsur.length; k++) {
    const r = peran[k];
    const p = par(k);
    if (r === 'bab' || r === 'lampiran') otomatis.set(k, 'bab');
    else if (r === 'sub') otomatis.set(k, 'sub');
    else if (r === 'subsub') otomatis.set(k, 'subsub');
    else if (r === 'judul') otomatis.set(k, 'judul');
    else if (r === 'isi' && p && p.teks && (p.tingkat != null || RE_KETERANGAN.test(p.teks))) otomatis.set(k, 'narasi');
  }
  const kedalamanBaru = new Map<number, number>();   // penanda bab yang dijadikan sub/subsub
  for (const [kk, jenisKor] of Object.entries(koreksi)) {
    const idx = Number(kk);
    const asal = otomatis.get(idx);
    if (asal === undefined || !JENIS_PENANDA.includes(jenisKor) || jenisKor === asal) continue;
    const p = par(idx)!;
    const lepasKeterangan = (jadi: Peran) => {
      const ket = keterangan.get(idx);
      if (!ket) return;
      keterangan.delete(idx);
      milikTarget.delete(ket.target);
      for (const j of ket.lanjut) peran[j] = jadi;
    };
    const lepasJudulBab = (jadi: Peran) => {
      for (let j = idx + 1; j < unsur.length && (peran[j] === 'kosong' || peran[j] === 'babJudul'); j++) {
        if (peran[j] === 'babJudul') { peran[j] = jadi; break; }
      }
    };
    const babAsal = peran[idx] === 'bab' || peran[idx] === 'lampiran';
    if (jenisKor === 'narasi' || jenisKor === 'buang') {
      const jadi: Peran = jenisKor === 'buang' ? 'buang' : 'isi';
      lepasKeterangan(jadi);
      if (babAsal) lepasJudulBab(jadi);
      peran[idx] = jadi;
    } else if (jenisKor === 'judul') {
      if (babAsal) lepasJudulBab('isi');
      let j = idx + 1;
      while (j < unsur.length && (peran[j] === 'kosong' || peran[j] === 'babJudul')) j++;
      const u = unsur[j];
      if (u && (u.jenis === 'tbl' || adaGambar(u)) && !milikTarget.has(j)) {
        const m = RE_KETERANGAN.exec(p.teks);
        const jenis: JenisObjek = u.jenis === 'tbl' ? 'Tabel' : (m && jenisObjekDari(m[1]) === 'Grafik') ? 'Grafik' : 'Gambar';
        pasang(idx, jenis, m?.[2] ?? '', m ? m[3] : p.teks, { target: j, lanjut: [] });
      } else {
        peran[idx] = 'isi';
        peringatan.push(`"${p.teks.slice(0, 50)}" dijadikan judul objek, tetapi tidak ada tabel/gambar tepat sesudahnya — masuk sebagai narasi.`);
      }
    } else {
      lepasKeterangan('isi');
      if (jenisKor === 'bab') {
        if (!babAsal) judulBab.set(idx, rapikan(p.teks.replace(RE_BAB, '$2').replace(RE_NOMOR_KETIK, '')) || p.teks);
        peran[idx] = peran[idx] === 'lampiran' ? 'lampiran' : 'bab';
      } else if (babAsal) {
        kedalamanBaru.set(idx, jenisKor === 'sub' ? 1 : 2);
      } else peran[idx] = jenisKor;
    }
  }
  const dipakai = (k: number): JenisPenanda => {
    const kd = kedalamanBaru.get(k);
    if (kd != null) return kd === 1 ? 'sub' : 'subsub';
    const r = peran[k];
    return r === 'bab' || r === 'lampiran' ? 'bab' : r === 'sub' ? 'sub' : r === 'subsub' ? 'subsub' : r === 'judul' ? 'judul' : r === 'buang' ? 'buang' : 'narasi';
  };

  // ── Susun pohon & blok ──
  const bagian: BagianImpor[] = [];
  const jalur: BagianImpor[] = [];
  const baris: BarisPratinjau[] = [];
  const gambar: Record<string, GambarImpor> = {};
  const ring: RingkasanImpor = { bab: 0, sub: 0, subsub: 0, narasi: 0, tabel: 0, gambar: 0, grafik: 0, tabelDitolak: 0, gambarDilewati: 0 };
  const lampiran = new Set<BagianImpor>();
  let gambarLuar = 0, gambarFormat = 0, gambarBesar = 0, tanpaKeterangan = 0, gambarDiTabel = 0, samaDengan = 0, grafikWord = 0;
  let buf: Par[] = [];

  const kini = (): BagianImpor => {
    if (!jalur.length) {
      const b: BagianImpor = { judul: 'ISI DOKUMEN', locked: false, penanda: null, blok: [], anak: [] };
      bagian.push(b);
      jalur.push(b);
      ring.bab++;
      if (awalIsi > 0) peringatan.push('Ada isi sebelum bab pertama — dimasukkan ke bab "ISI DOKUMEN".');
    }
    return jalur[jalur.length - 1];
  };
  const tambahBlok = (b: BlokImpor) => { kini().blok.push(b); };
  const salurkan = () => {
    if (!buf.length) return;
    const potongan = htmlNarasi(buf, bawaanDxa, spasiDok);
    for (const html of potongan) tambahBlok({ tipe: 'NARASI', payload: { html } });
    if (potongan.length) {
      ring.narasi += potongan.length;
      baris.push({ jenis: 'narasi', paragraf: buf.filter(p => p.teks).length, kedalaman: jalur.length - 1 });
    }
    buf = [];
  };
  const bukaBagian = (k: number, kedalaman: number, judul: string): { b: BagianImpor; nyata: number } => {
    salurkan();
    const b: BagianImpor = { judul: judul.slice(0, 255), locked: false, penanda: k, blok: [], anak: [] };
    if (kedalaman === 0) { bagian.push(b); jalur.length = 0; jalur.push(b); }
    else {
      kini();
      const d = Math.min(kedalaman, jalur.length, MAX_DEPTH);
      jalur.length = d;
      jalur[d - 1].anak.push(b);
      jalur.push(b);
    }
    const nyata = jalur.length - 1;
    if (nyata === 0) ring.bab++; else if (nyata === 1) ring.sub++; else ring.subsub++;
    return { b, nyata };
  };
  const ambilGambar = (rid: string): string | null => {
    const rel = rels.get(rid);
    if (!rel || rel.luar) { gambarLuar++; return null; }
    const ref = jalurWord(rel.target);
    if (gambar[ref]) return ref;
    const f = zip.file(ref);
    if (!f) { gambarLuar++; return null; }
    const b = f.asUint8Array();
    if (b.length > BATAS_GAMBAR) { gambarBesar++; return null; }
    const jenis = sniffGambar(b);
    if (!jenis) { gambarFormat++; return null; }
    gambar[ref] = { ref, ...jenis, bytes: b };
    return ref;
  };

  for (let k = awalIsi; k < unsur.length; k++) {
    const u = unsur[k];
    const r = peran[k];
    if (u.jenis === 'tbl') {
      salurkan();
      const kk = milikTarget.get(k);
      const ket = kk != null ? keterangan.get(kk) : undefined;
      gambarDiTabel += u.gambarDiDalam;
      if (!u.tabel.muat) {
        ring.tabelDitolak++;
        const nama = ket ? `Tabel ${ket.nomor}` : 'Sebuah tabel';
        peringatan.push(`${nama} tidak diimpor: ${u.tabel.alasan}. Tempatnya ditandai di narasi — salin manual dari Word.`);
        tambahBlok({ tipe: 'NARASI', payload: { html: `<p><strong>[${esc(nama)}${ket?.judul ? ` ${esc(ket.judul)}` : ''} tidak muat — salin manual dari Word]</strong></p>` } });
        baris.push({ jenis: 'objek', objek: 'Tabel', judul: ket?.judul ?? '', kedalaman: jalur.length - 1, penanda: kk ?? null, catatan: `tidak diimpor: ${u.tabel.alasan}` });
        continue;
      }
      samaDengan += u.tabel.ganti;
      if (!ket) tanpaKeterangan++;
      tambahBlok({ tipe: 'TABEL', payload: { ...u.tabel.payload, judul: (ket?.judul ?? '').slice(0, 255), melintang: melintang[k] } });
      ring.tabel++;
      baris.push({
        jenis: 'objek', objek: 'Tabel', judul: ket?.judul ?? '', kedalaman: jalur.length - 1, penanda: kk ?? null,
        catatan: `${u.tabel.payload.kolom.length} kolom × ${u.tabel.payload.rows.length} baris${melintang[k] ? ' · melintang' : ''}`,
      });
      continue;
    }
    if (r === 'bab' || r === 'lampiran') {
      const kd = kedalamanBaru.get(k);
      const { b, nyata } = bukaBagian(k, kd ?? 0, judulBab.get(k) ?? u.teks);
      if (r === 'lampiran' && kd == null) lampiran.add(b);
      baris.push({ jenis: 'penanda', id: k, teks: b.judul, dipakai: dipakai(k), otomatis: otomatis.get(k) ?? 'bab', kedalaman: nyata });
      continue;
    }
    if (r === 'sub' || r === 'subsub') {
      const kedalaman = r === 'sub' ? 1 : Math.max(2, (tingkatPar(u) ?? 3) - 1);
      const { b, nyata } = bukaBagian(k, kedalaman, u.teks.replace(RE_NOMOR_KETIK, ''));
      baris.push({ jenis: 'penanda', id: k, teks: b.judul, dipakai: dipakai(k), otomatis: otomatis.get(k) ?? r, kedalaman: nyata });
      continue;
    }
    if (otomatis.has(k) && r !== 'judul') {
      baris.push({ jenis: 'penanda', id: k, teks: u.teks.slice(0, 160), dipakai: dipakai(k), otomatis: otomatis.get(k)!, kedalaman: null });
    }
    if (r === 'judul') {
      if (keterangan.has(k)) baris.push({ jenis: 'penanda', id: k, teks: u.teks.slice(0, 160), dipakai: 'judul', otomatis: otomatis.get(k) ?? 'judul', kedalaman: null });
      continue;
    }
    if (r !== 'isi') continue;
    if (!adaGambar(u)) { buf.push(u); continue; }
    if (u.teks) buf.push({ ...u, gambar: [], grafikWord: [] });
    salurkan();
    const kk = milikTarget.get(k);
    const ket = kk != null ? keterangan.get(kk) : undefined;
    let pertama = true;
    for (const rid of u.gambar) {
      const ref = ambilGambar(rid);
      const ketIni = pertama ? ket : undefined;
      pertama = false;
      if (!ref) { ring.gambarDilewati++; continue; }
      if (!ketIni) tanpaKeterangan++;
      const judul = (ketIni?.judul ?? '').slice(0, 255);
      if (ketIni?.jenis === 'Grafik') {
        tambahBlok({ tipe: 'GRAFIK', gambar: ref, payload: { judul, source: 'gambar', chartType: 'bar', data: [], imageFileId: '', caption: '' } });
        ring.grafik++;
      } else {
        tambahBlok({ tipe: 'GAMBAR', gambar: ref, payload: { judul, fileId: '', caption: '' } });
        ring.gambar++;
      }
      baris.push({ jenis: 'objek', objek: ketIni?.jenis === 'Grafik' ? 'Grafik' : 'Gambar', judul: ketIni?.judul ?? '', kedalaman: jalur.length - 1, penanda: ketIni ? kk! : null, catatan: '' });
    }
    for (const rid of u.grafikWord) {
      const rel = rels.get(rid);
      const isi = rel && !rel.luar ? bacaGrafikWord(zip, jalurWord(rel.target)) : null;
      const ketIni = pertama ? ket : undefined;
      pertama = false;
      grafikWord++;
      tambahBlok({ tipe: 'GRAFIK', gambar: null, payload: { judul: (ketIni?.judul ?? '').slice(0, 255), source: 'manual', chartType: isi?.chartType ?? 'bar', data: isi?.data ?? [], imageFileId: '', caption: '' } });
      ring.grafik++;
      baris.push({ jenis: 'objek', objek: 'Grafik', judul: ketIni?.judul ?? '', kedalaman: jalur.length - 1, penanda: ketIni ? kk! : null, catatan: isi ? `${isi.data.length} titik data` : 'datanya tidak terbaca' });
    }
  }
  salurkan();

  // LAMPIRAN tanpa isi tidak dibuat: docgen menomorinya "BAB V", padahal isinya (PK, RKT) memang tidak ada di badan.
  for (const b of lampiran) {
    if (b.blok.length || b.anak.length) {
      peringatan.push('LAMPIRAN dibuat sebagai bab tambahan — di Word ia bernomor BAB sesudah BAB terakhir.');
      continue;
    }
    if (bagian.includes(b)) { bagian.splice(bagian.indexOf(b), 1); ring.bab--; }
    const idx = baris.findIndex(x => x.jenis === 'penanda' && x.id === b.penanda);
    if (idx >= 0) baris.splice(idx, 1);
    peringatan.push('LAMPIRAN tidak berisi apa pun di badan dokumen (hanya di daftar isi) — tidak dibuat. Tambahkan isinya manual bila perlu.');
  }
  // D4: BAB I–IV dikunci seperti template standar — hanya bila judulnya memang BAB wajib.
  bagian.forEach((b, i) => { b.locked = i < 4 && judulBabWajib(b.judul.replace(/\s+/g, ' ')); });
  const babTakDikenal = bagian.slice(0, 4).filter(b => !b.locked).map(b => b.judul);
  if (babTakDikenal.length) peringatan.push(`Bab tidak dikunci karena judulnya bukan BAB wajib standar: ${babTakDikenal.map(j => `"${j.slice(0, 40)}"`).join(', ')}.`);

  const jumlahBlok = (bs: BagianImpor[]): number => bs.reduce((n, b) => n + b.blok.length + jumlahBlok(b.anak), 0);
  if (jumlahBlok(bagian) > BATAS_BLOK_IMPOR) throw new ImporWordError(`Hasil impor lebih dari ${BATAS_BLOK_IMPOR} blok — pecah dokumennya dulu.`);

  if (ring.grafik - grafikWord > 0) peringatan.push(`${ring.grafik - grafikWord} grafik berupa gambar — masuk sebagai blok Grafik bergambar, bisa diganti grafik dari tabel di editor.`);
  if (grafikWord) peringatan.push(`${grafikWord} grafik Word dibaca dari datanya — buka lalu tekan Simpan Grafik supaya gambarnya masuk ke Word.`);
  if (gambarFormat) peringatan.push(`${gambarFormat} gambar berformat selain PNG/JPG/GIF (mis. EMF, SVG) dilewati.`);
  if (gambarBesar) peringatan.push(`${gambarBesar} gambar lebih dari 10 MB dilewati.`);
  if (gambarLuar) peringatan.push(`${gambarLuar} gambar tertaut ke luar berkas dilewati.`);
  if (gambarDiTabel) peringatan.push(`${gambarDiTabel} gambar di dalam sel tabel dilewati — sel tabel LKJIP hanya berisi teks.`);
  if (samaDengan) peringatan.push(`${samaDengan} sel tabel diawali "=" ditulis dengan "＝" supaya tidak dibaca sebagai rumus.`);
  if (tanpaKeterangan) peringatan.push(`${tanpaKeterangan} tabel/gambar tanpa keterangan "Tabel n"/"Gambar n" — judulnya kosong, isi di editor.`);

  const judulBerkas = rapikan(teksDalam(cariSemua(uraiXml(teksZip(zip, 'docProps/core.xml', 1024 * 1024) ?? ''), 'dc:title')[0] ?? KOSONG)).slice(0, 255);
  const tahunTebakan = tahunDari(baris.flatMap(b => (b.jenis === 'penanda' ? [b.teks] : b.jenis === 'objek' ? [b.judul] : [])));

  return { judulBerkas, tahunTebakan, kataPengantar, indenBawaanCm, spasiBawaan: spasiBawaanDok, bagian, gambar, baris, ringkasan: ring, peringatan };
}
