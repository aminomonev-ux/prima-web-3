// ═══ PRIMA — LKJIP — Cari & Ganti seluruh dokumen (pure, aman-klien) ═══
// Konsep `docs/CONCEPT-lkjip-daftar-word.md` §11. Layar mencari di sini; server mengganti di sini juga, jadi
// yang ditampilkan dan yang ditulis tidak mungkin berbeda aturan.
// Mencari isi TERSIMPAN: editor blok memegang ketikannya di state lokal, jadi yang belum disimpan tak terlihat.
import { displayValue, namaKolomDariKepala, nilaiKetikan, normalizeRows, type TabelCell, bacaAtur } from './tabel';
import { flattenTree, type BlockNode, type SectionNode } from './numbering';

export interface OpsiCari { kata: string; hurufBesar?: boolean; seluruhKata?: boolean }
export type TempatTemuan =
  | { jenis: 'judul-bab'; sectionId: number }
  | { jenis: 'pengantar' }
  | { jenis: 'narasi'; blockId: number }
  | { jenis: 'bidang'; blockId: number; bidang: 'judul' | 'caption' }
  | { jenis: 'sel'; blockId: number; r: number; c: number };
export interface Temuan {
  tempat: TempatTemuan;
  /** Urutan kecocokan di dalam tempat ini. */
  ke: number;
  sectionId: number | null;
  blockId: number | null;
  letak: string;
  sebelum: string;
  cocok: string;
  sesudah: string;
  /** Kenapa tidak bisa diganti; `null` = bisa. */
  alasan: string | null;
}
export interface DataDokumen { tree: SectionNode[]; kataPengantarHtml: string }
export interface HasilGanti {
  blok: { id: number; payload: unknown }[];
  judulBab: { id: number; judul: string }[];
  pengantar: string | null;
  jumlah: number;
  ditahan: number;
}

/** Sama dengan pemotong diam-diam di `sanitizeNarasiHtml`: melewatinya memotong akhir blok tanpa kabar. */
export const BATAS_HTML_NARASI = 50000;
export const BATAS_JUDUL_BAB = 255;
export class GantiTerlaluPanjangError extends Error {
  constructor(letak: string) { super(`Hasil penggantian di ${letak} melebihi batas panjang. Kurangi teks penggantinya atau ganti satu per satu.`); this.name = 'GantiTerlaluPanjangError'; }
}

const ALASAN_TAUTAN = 'Tabel tertaut mengikuti modul sumbernya';
const ALASAN_NOMOR = 'Kolom No. dihitung otomatis';
const ALASAN_RUMUS = 'Hasil rumus: ubah rumus atau sel asalnya';
const ALASAN_FORMAT = 'Angka berformat: sunting selnya langsung';
const ALASAN_BAB = 'Judul BAB wajib tidak bisa diubah';

const PENGGANTI_ATOM = '\uFFFC';
const POLA_ATOM = /(?<![-a-zA-Z])data-(?:angka|rujuk|tab)\s*=/;
const POLA_BLOK = new Set(['p', 'h1', 'h2', 'h3', 'li', 'ol', 'ul']);

/** Pola kecocokan. Spasi juga mencocokkan spasi tak-putus: tempelan dari Word penuh dengan itu. */
export function polaCariTeks(o: OpsiCari): RegExp | null {
  if (!o.kata) return null;
  const inti = o.kata.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '[ \\u00a0]');
  const sumber = o.seluruhKata ? `(?<![\\p{L}\\p{N}_])${inti}(?![\\p{L}\\p{N}_])` : inti;
  return new RegExp(sumber, o.hurufBesar ? 'gu' : 'giu');
}

const ENTITAS: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const urai = (s: string) => s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (m, d, h, n) => {
  if (d) return String.fromCodePoint(Number(d));
  if (h) return String.fromCodePoint(parseInt(h, 16));
  return ENTITAS[String(n).toLowerCase()] ?? m;
});
const sandi = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');

interface Potongan { tok: number; dari: number; teks: string }
interface Satuan { teks: string; potongan: Potongan[] }

/** HTML narasi → satu satuan per paragraf: kecocokan boleh melintasi tebal/miring, tidak melintasi paragraf atau atom. */
function urainarasi(html: string): { tokens: string[]; satuan: Satuan[] } {
  const tokens = html.split(/(<[^>]+>)/);
  const satuan: Satuan[] = [];
  let kini: Satuan = { teks: '', potongan: [] };
  const tutup = () => { if (kini.teks) satuan.push(kini); kini = { teks: '', potongan: [] }; };
  const spanAtom: boolean[] = [];
  tokens.forEach((tok, i) => {
    if (!tok) return;
    if (!tok.startsWith('<')) {
      if (spanAtom.includes(true)) { kini.teks += PENGGANTI_ATOM; return; }
      const teks = urai(tok);
      kini.potongan.push({ tok: i, dari: kini.teks.length, teks });
      kini.teks += teks;
      return;
    }
    const tag = (/^<\/?([a-zA-Z0-9]+)/.exec(tok)?.[1] ?? '').toLowerCase();
    if (POLA_BLOK.has(tag)) tutup();
    else if (tag === 'br') kini.teks += '\n';
    else if (tag === 'span') {
      if (tok.startsWith('</')) spanAtom.pop();
      else spanAtom.push(POLA_ATOM.test(tok));
    }
  });
  tutup();
  return { tokens, satuan };
}

const potongTepi = (s: string) => s.replace(new RegExp(PENGGANTI_ATOM, 'g'), '…').replace(/[\n\t]/g, ' ');
const LEBAR_CUPLIKAN = 40;
function cuplikan(teks: string, m: RegExpExecArray) {
  const a = m.index, b = a + m[0].length;
  return {
    sebelum: `${a > LEBAR_CUPLIKAN ? '…' : ''}${potongTepi(teks.slice(Math.max(0, a - LEBAR_CUPLIKAN), a))}`,
    cocok: m[0],
    sesudah: `${potongTepi(teks.slice(b, b + LEBAR_CUPLIKAN))}${b + LEBAR_CUPLIKAN < teks.length ? '…' : ''}`,
  };
}
const semuaCocok = (teks: string, pola: RegExp) => [...teks.matchAll(pola)] as RegExpExecArray[];

// Sisa format yang seluruh teksnya habis diganti. Sampai stabil: `<em><u></u></em>` butuh dua putaran.
function buangTagKosong(html: string): string {
  let kini = html;
  for (;;) {
    const baru = kini.replace(/<(strong|b|em|i|u|s|sup|sub|mark|span)\b[^>]*><\/\1>/g, '');
    if (baru === kini) return kini;
    kini = baru;
  }
}

/** Ganti di HTML narasi. `ke` = hanya kecocokan ke-n; tanpa itu semuanya. Yang melintasi format mengikuti format awalnya. */
export function gantiDiNarasi(html: string, pola: RegExp, dengan: string, ke?: number): { html: string; n: number } {
  const { tokens, satuan } = urainarasi(html);
  let urut = 0, n = 0;
  const berubah = new Set<Potongan>();
  for (const s of satuan) {
    const cocok = semuaCocok(s.teks, pola).map(m => ({ m, i: urut++ })).filter(x => ke === undefined || x.i === ke);
    // Dari belakang: pemotongan tidak menggeser kecocokan yang lebih awal.
    for (const { m } of cocok.reverse()) {
      const a = m.index, b = a + m[0].length;
      const kena = s.potongan.filter(p => p.dari < b && p.dari + p.teks.length > a);
      kena.forEach((p, i) => {
        const dari = Math.max(0, a - p.dari);
        const sampai = Math.min(p.teks.length, b - p.dari);
        p.teks = p.teks.slice(0, dari) + (i === 0 ? dengan : '') + p.teks.slice(sampai);
        berubah.add(p);
      });
      n++;
    }
  }
  for (const p of berubah) tokens[p.tok] = sandi(p.teks);
  return { html: n ? buangTagKosong(tokens.join('')) : html, n };
}

const namaTipe: Record<BlockNode['tipe'], string> = { NARASI: 'Narasi', TABEL: 'Tabel', GAMBAR: 'Gambar', GRAFIK: 'Grafik' };
const letakBlok = (n: SectionNode, b: BlockNode) => `${n.nomor} · ${namaTipe[b.tipe]}`;

type Payload = Record<string, unknown>;
const bacaTabel = (payload: Payload) => {
  const rows = normalizeRows(payload.rows);
  const headerRows = Math.max(0, Number(payload.headerRows) || 0);
  const kolomNomor = bacaAtur(payload).kolomNomor;
  const tertaut = !!payload.tautan;
  return { rows, headerRows, kolomNomor, tertaut };
};
const alasanSel = (t: ReturnType<typeof bacaTabel>, r: number, c: number) => (
  t.tertaut ? ALASAN_TAUTAN : t.kolomNomor !== null && c === t.kolomNomor && r >= t.headerRows ? ALASAN_NOMOR : null
);

export function cariDiDokumen(d: DataDokumen, o: OpsiCari): Temuan[] {
  const pola = polaCariTeks(o);
  if (!pola) return [];
  const hasil: Temuan[] = [];
  const dariTeks = (teks: string, tempat: TempatTemuan, letak: string, sectionId: number | null, blockId: number | null, alasan: string | null, mulai = 0): number => {
    let ke = mulai;
    for (const m of semuaCocok(teks, pola)) hasil.push({ tempat, ke: ke++, sectionId, blockId, letak, alasan, ...cuplikan(teks, m) });
    return ke;
  };
  const dariHtml = (html: string, tempat: TempatTemuan, letak: string, sectionId: number | null, blockId: number | null) => {
    let ke = 0;
    for (const s of urainarasi(html).satuan) ke = dariTeks(s.teks, tempat, letak, sectionId, blockId, null, ke);
  };
  if (d.kataPengantarHtml) dariHtml(d.kataPengantarHtml, { jenis: 'pengantar' }, 'Kata Pengantar', null, null);
  for (const node of flattenTree(d.tree)) {
    dariTeks(node.judul, { jenis: 'judul-bab', sectionId: node.id }, `${node.nomor} · Judul`, node.id, null, node.locked ? ALASAN_BAB : null);
    for (const b of node.blocks) {
      const p = (b.payload ?? {}) as Payload;
      const letak = letakBlok(node, b);
      if (b.tipe === 'NARASI') { dariHtml(String(p.html ?? ''), { jenis: 'narasi', blockId: b.id }, letak, node.id, b.id); continue; }
      for (const bidang of ['judul', 'caption'] as const) {
        if (typeof p[bidang] === 'string') dariTeks(p[bidang], { jenis: 'bidang', blockId: b.id, bidang }, letak, node.id, b.id, null);
      }
      if (b.tipe !== 'TABEL') continue;
      const t = bacaTabel(p);
      t.rows.forEach((row, r) => row.forEach((cell: TabelCell, c) => {
        if (cell.h) return;
        const tempat: TempatTemuan = { jenis: 'sel', blockId: b.id, r, c };
        const rumus = String(cell.v ?? '').startsWith('=');
        if (!rumus && semuaCocok(String(cell.v ?? ''), pola).length) { dariTeks(String(cell.v ?? ''), tempat, letak, node.id, b.id, alasanSel(t, r, c)); return; }
        dariTeks(displayValue(t.rows, r, c), tempat, letak, node.id, b.id, rumus ? ALASAN_RUMUS : ALASAN_FORMAT);
      }));
    }
  }
  return hasil;
}

const samaTempat = (a: TempatTemuan, b: TempatTemuan) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Hasil penggantian tanpa menulis apa pun. `sasaran` = satu kecocokan saja. Yang tak boleh diganti dihitung
 * `ditahan`, tidak pernah diam-diam dilewati. Payload masih mentah: pemanggil server wajib melewatkannya ke
 * `parseBlockPayload` seperti simpanan biasa.
 */
export function gantiDiDokumen(d: DataDokumen, o: OpsiCari, dengan: string, sasaran?: { tempat: TempatTemuan; ke: number }): HasilGanti {
  const hasil: HasilGanti = { blok: [], judulBab: [], pengantar: null, jumlah: 0, ditahan: 0 };
  const pola = polaCariTeks(o);
  if (!pola) return hasil;
  const kena = (tempat: TempatTemuan) => !sasaran || samaTempat(sasaran.tempat, tempat);
  const keUntuk = (tempat: TempatTemuan) => (sasaran && samaTempat(sasaran.tempat, tempat) ? sasaran.ke : undefined);
  const gantiTeks = (teks: string, ke?: number) => {
    let i = 0, n = 0;
    const baru = teks.replace(pola, m => { const pilih = ke === undefined || i === ke; i++; if (!pilih) return m; n++; return dengan; });
    return { teks: baru, n };
  };
  const narasi = (html: string, tempat: TempatTemuan, letak: string) => {
    const g = gantiDiNarasi(html, pola, dengan, keUntuk(tempat));
    if (g.n && g.html.length > BATAS_HTML_NARASI) throw new GantiTerlaluPanjangError(letak);
    hasil.jumlah += g.n;
    return g;
  };
  if (d.kataPengantarHtml && kena({ jenis: 'pengantar' })) {
    const g = narasi(d.kataPengantarHtml, { jenis: 'pengantar' }, 'Kata Pengantar');
    if (g.n) hasil.pengantar = g.html;
  }
  for (const node of flattenTree(d.tree)) {
    const tempatJudul: TempatTemuan = { jenis: 'judul-bab', sectionId: node.id };
    if (kena(tempatJudul)) {
      const g = gantiTeks(node.judul, keUntuk(tempatJudul));
      if (g.n && node.locked) hasil.ditahan += g.n;
      else if (g.n) {
        if (!g.teks.trim() || g.teks.length > BATAS_JUDUL_BAB) throw new GantiTerlaluPanjangError(`judul ${node.nomor}`);
        hasil.judulBab.push({ id: node.id, judul: g.teks });
        hasil.jumlah += g.n;
      }
    }
    for (const b of node.blocks) {
      const p = (b.payload ?? {}) as Payload;
      if (b.tipe === 'NARASI') {
        const tempat: TempatTemuan = { jenis: 'narasi', blockId: b.id };
        if (!kena(tempat)) continue;
        const g = narasi(String(p.html ?? ''), tempat, letakBlok(node, b));
        if (g.n) hasil.blok.push({ id: b.id, payload: { ...p, html: g.html } });
        continue;
      }
      let baru: Payload | null = null;
      for (const bidang of ['judul', 'caption'] as const) {
        const tempat: TempatTemuan = { jenis: 'bidang', blockId: b.id, bidang };
        if (!kena(tempat) || typeof p[bidang] !== 'string') continue;
        const g = gantiTeks(p[bidang], keUntuk(tempat));
        if (g.n) { baru = { ...(baru ?? p), [bidang]: g.teks }; hasil.jumlah += g.n; }
      }
      if (b.tipe === 'TABEL') {
        const t = bacaTabel(p);
        let ubahSel = false;
        const rows = t.rows.map((row, r) => row.map((cell: TabelCell, c) => {
          const tempat: TempatTemuan = { jenis: 'sel', blockId: b.id, r, c };
          if (cell.h || !kena(tempat)) return cell;
          const v = String(cell.v ?? '');
          if (v.startsWith('=') || !semuaCocok(v, pola).length) {
            hasil.ditahan += semuaCocok(displayValue(t.rows, r, c), pola).length;
            return cell;
          }
          const g = gantiTeks(v, keUntuk(tempat));
          if (alasanSel(t, r, c)) { hasil.ditahan += g.n; return cell; }
          if (!g.n) return cell;
          ubahSel = true;
          hasil.jumlah += g.n;
          return { ...cell, v: nilaiKetikan(cell, g.teks) };
        }));
        if (ubahSel) baru = { ...(baru ?? p), rows, kolom: namaKolomDariKepala(rows, t.headerRows, Array.isArray(p.kolom) ? p.kolom.map(String) : []) };
      }
      if (baru) hasil.blok.push({ id: b.id, payload: baru });
    }
  }
  return hasil;
}
