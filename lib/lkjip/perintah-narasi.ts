// ═══ PRIMA — LKJIP — Perintah editor narasi (ProseMirror, tanpa DOM & React) ═══
// Konsep `docs/CONCEPT-lkjip-daftar-word.md`. Dipisah dari komponen supaya bisa diuji dgn skema sungguhan di Node.
// Format milik TINGKAT, bukan butir (cara Word): Tab, Shift+Tab, dan galeri selalu menyamakan seluruh pohon
// daftar dengan susunannya — butir yang naik tingkat ikut berganti nomor tanpa disentuh.

import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { liftListItem, sinkListItem, wrapRangeInList } from '@tiptap/pm/schema-list';
import {
  KODE_DESIMAL, SUSUNAN, adalahBullet, bacaSusunan, gayaBawaan, gayaBerikut, gayaSah, susunanPenuh, tagGaya, tulisSusunan,
  URUTAN_SUSUNAN, type KodeGaya, type KodeSusunan,
} from './gaya-daftar';
import { konteksSebelum, modeBerikut, rentangKata, ubahSegmen, type ModeHuruf } from './format-teks';
import type { AkarBlok } from './lanjut-daftar';

export type Perintah = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

export const adalahDaftar = (n: PMNode) => n.type.name === 'orderedList' || n.type.name === 'bulletList';
export const gayaNode = (n: PMNode): KodeGaya => {
  const k = n.attrs.gaya;
  const tag = n.type.name === 'bulletList' ? 'ul' : 'ol';
  return gayaSah(k) && tagGaya(k) === tag ? k : gayaBawaan(tag);
};

export interface PosisiDaftar {
  akarPos: number; akar: PMNode;
  daftarPos: number; daftar: PMNode;
  butirPos: number; butirIndeks: number;
  /** Tingkat daftar di kursor, 1 = akar. */
  kedalaman: number;
}
export function posisiDaftar($p: ResolvedPos): PosisiDaftar | null {
  let akarD = 0, daftarD = 0, kedalaman = 0;
  for (let d = $p.depth; d > 0; d--) {
    if (!adalahDaftar($p.node(d))) continue;
    kedalaman++;
    if (!daftarD) daftarD = d;
    akarD = d;
  }
  if (!kedalaman || daftarD >= $p.depth) return null;
  return {
    akarPos: $p.before(akarD), akar: $p.node(akarD),
    daftarPos: $p.before(daftarD), daftar: $p.node(daftarD),
    butirPos: $p.before(daftarD + 1), butirIndeks: $p.index(daftarD),
    kedalaman,
  };
}

const anakDaftar = (n: PMNode, tiap: (daftar: PMNode, posRelatif: number) => void) => {
  n.forEach((butir, oButir) => butir.forEach((c, oAnak) => { if (adalahDaftar(c)) tiap(c, oButir + 1 + oAnak); }));
};

/** Susunan pohon: yang tersimpan di akar, atau diturunkan dari format yang sudah dipakai tiap tingkat. */
export function susunanPohon(akar: PMNode): KodeGaya[] {
  const tersimpan = bacaSusunan(akar.attrs.susunan);
  if (tersimpan) return tersimpan;
  const per: KodeGaya[] = [];
  const jalan = (n: PMNode, d: number) => {
    per[d] ??= gayaNode(n);
    anakDaftar(n, c => jalan(c, d + 1));
  };
  jalan(akar, 0);
  return susunanPenuh(per);
}

/** Satu transaksi: tiap daftar di pohon mengikuti format tingkatnya, tipe simpul ikut (bullet ↔ nomor). */
export function samakanPohon(tr: Transaction, akarPos: number, susunan: readonly KodeGaya[]): void {
  const akar = tr.doc.nodeAt(akarPos);
  if (!akar || !adalahDaftar(akar)) return;
  const { orderedList, bulletList } = tr.doc.type.schema.nodes;
  const teksSusunan = tulisSusunan(susunan);
  const jalan = (n: PMNode, pos: number, d: number) => {
    const g = susunan[Math.min(d, susunan.length) - 1];
    const tipe = adalahBullet(g) ? bulletList : orderedList;
    const simpan = d === 1 ? teksSusunan : null;
    if (tipe !== n.type || n.attrs.gaya !== g || n.attrs.susunan !== simpan || n.attrs.type) {
      tr.setNodeMarkup(pos, tipe, { ...n.attrs, gaya: g, type: null, susunan: simpan });
    }
    anakDaftar(n, (c, rel) => jalan(c, pos + 1 + rel, d + 1));
  };
  jalan(akar, akarPos, 1);
}

/** Semua pohon daftar yang tersentuh pilihan — menu & galeri berlaku untuk semuanya, seperti Word. */
function akarTerpilih(state: EditorState): { pos: number; node: PMNode }[] {
  const { from, to } = state.selection;
  const hasil: { pos: number; node: PMNode }[] = [];
  state.doc.forEach((node, pos) => {
    if (adalahDaftar(node) && pos < to && pos + node.nodeSize > from) hasil.push({ pos, node });
  });
  return hasil;
}

/** Tingkat `1.1.` hanya bermakna kalau semua induknya juga `1.1.`: yang di bawah tingkat ganti ikut turun. */
function rapikanDesimal(s: KodeGaya[], tingkat: number): KodeGaya[] {
  const hasil = [...s];
  for (let l = tingkat + 1; l < hasil.length; l++) if (hasil[l] === KODE_DESIMAL) hasil[l] = gayaBerikut(hasil[l - 1]);
  return hasil;
}

// ─── Tingkat ──────────────────────────────────────────────────────────────────
const pindahTingkat = (dasar: typeof sinkListItem): Perintah => (state, dispatch) => {
  const pos = posisiDaftar(state.selection.$from);
  if (!pos) return false;
  const tampung: Transaction[] = [];
  if (!dasar(state.schema.nodes.listItem)(state, t => tampung.push(t))) return false;
  const tr = tampung[0];
  if (tr) {
    samakanPohon(tr, pos.akarPos, susunanPohon(pos.akar));
    dispatch?.(tr);
  }
  return true;
};
export const turunTingkat: Perintah = pindahTingkat(sinkListItem);
export const naikTingkat: Perintah = pindahTingkat(liftListItem);

// ─── Galeri ───────────────────────────────────────────────────────────────────
/** Ganti format tingkat di kursor, di seluruh pohon yang terpilih. `false` = kursor bukan di daftar. */
export const aturGayaTingkat = (kode: KodeGaya): Perintah => (state, dispatch) => {
  const pos = posisiDaftar(state.selection.$from);
  if (!pos) return false;
  const tr = state.tr;
  for (const a of akarTerpilih(state)) {
    const s = susunanPohon(a.node);
    s[pos.kedalaman - 1] = kode;
    samakanPohon(tr, a.pos, rapikanDesimal(s, pos.kedalaman - 1));
  }
  if (tr.docChanged) dispatch?.(tr);
  return true;
};

export const aturSusunan = (kode: KodeSusunan): Perintah => (state, dispatch) => {
  if (!posisiDaftar(state.selection.$from)) return false;
  const tr = state.tr;
  for (const a of akarTerpilih(state)) samakanPohon(tr, a.pos, SUSUNAN[kode]);
  if (tr.docChanged) dispatch?.(tr);
  return true;
};

/**
 * Paragraf terpilih → daftar. `wrapRangeInList` langsung, bukan `toggleList` Tiptap: yang terakhir menyambung ke
 * daftar di dekatnya tanpa melihat format, jadi "a)" di bawah daftar "1." ikut menjadi nomor 1.
 * Disambung hanya bila daftar tepat di atasnya bergaya sama, sehingga nomornya berlanjut seperti Word.
 */
export const bungkusDaftar = (gaya: KodeGaya, susunan?: readonly KodeGaya[]): Perintah => (state, dispatch) => {
  const { schema } = state;
  const tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (n, pos) => {
    if (n.type.name === 'heading') tr.setNodeMarkup(pos, schema.nodes.paragraph, { ...n.attrs, level: undefined });
    return !n.isTextblock;
  });
  const range = tr.doc.resolve(tr.mapping.map(from)).blockRange(tr.doc.resolve(tr.mapping.map(to)));
  if (!range) return false;
  const tipe = adalahBullet(gaya) ? schema.nodes.bulletList : schema.nodes.orderedList;
  const attrs = { gaya, ...(susunan ? { susunan: tulisSusunan(susunan) } : {}) };
  if (!wrapRangeInList(tr, range, tipe, attrs)) return false;
  const pos = posisiDaftar(tr.selection.$from);
  if (pos) {
    const sebelum = tr.doc.resolve(pos.akarPos).nodeBefore;
    if (sebelum && adalahDaftar(sebelum) && gayaNode(sebelum) === gaya) tr.join(pos.akarPos);
  }
  dispatch?.(tr.scrollIntoView());
  return true;
};

/** Susunan galeri yang sama persis dengan pohon ini; kosong = sudah diubah per tingkat. */
export function kodeSusunanDari(s: readonly KodeGaya[]): KodeSusunan | null {
  return URUTAN_SUSUNAN.find(k => SUSUNAN[k].every((g, i) => g === s[i])) ?? null;
}

// ─── Nomor ────────────────────────────────────────────────────────────────────
/** `1.1.` di tingkat bawah tak bisa berdiri sendiri: `%1` hanya benar kalau ia berbagi hitungan dgn induknya. */
export const nomorTerkunciDesimal = (pos: PosisiDaftar) => pos.kedalaman > 1 && gayaNode(pos.daftar) === KODE_DESIMAL;

/** Butir di kursor memulai daftar baru dari 1; di butir pertama cukup melepas sambungan & nomor awalnya. */
export const mulaiUlangDariSatu: Perintah = (state, dispatch) => {
  const pos = posisiDaftar(state.selection.$from);
  if (!pos || adalahBullet(gayaNode(pos.daftar))) return false;
  const attrs = { ...pos.daftar.attrs, start: 1, lanjut: null };
  const tr = state.tr;
  if (pos.butirIndeks === 0) tr.setNodeMarkup(pos.daftarPos, undefined, attrs);
  else tr.split(pos.butirPos, 1, [{ type: pos.daftar.type, attrs }]);
  dispatch?.(tr);
  return true;
};

export const aturNomorAwal = (nomor: number): Perintah => (state, dispatch) => {
  const pos = posisiDaftar(state.selection.$from);
  if (!pos || adalahBullet(gayaNode(pos.daftar))) return false;
  dispatch?.(state.tr.setNodeMarkup(pos.daftarPos, undefined, { ...pos.daftar.attrs, start: Math.max(1, Math.min(9999, Math.trunc(nomor))), lanjut: null }));
  return true;
};

export const aturLanjut = (lanjut: boolean): Perintah => (state, dispatch) => {
  const pos = posisiDaftar(state.selection.$from);
  if (!pos || pos.kedalaman > 1 || adalahBullet(gayaNode(pos.akar))) return false;
  dispatch?.(state.tr.setNodeMarkup(pos.akarPos, undefined, { ...pos.akar.attrs, lanjut: lanjut ? true : null, start: 1 }));
  return true;
};

/** Indeks daftar akar di blok — daftar pertama memakai centang "Lanjut daftar" milik bloknya. */
export function indeksAkar(doc: PMNode, akarPos: number): number {
  let i = -1, ketemu = -1;
  doc.forEach((n, p) => { if (adalahDaftar(n)) { i++; if (p === akarPos) ketemu = i; } });
  return ketemu;
}

// Cermin `tulisButir` docgen: butir yang punya paragraf bertulisan sendiri memakai nomor, yang hanya berisi
// daftar bersarang tidak.
const butirBernomor = (butir: PMNode) => {
  let ada = false;
  butir.forEach(c => { if (c.isTextblock && c.content.size > 0) ada = true; });
  return ada;
};
/** Daftar akar sebuah blok untuk `mulaiDaftarBlok`. */
export function akarBlokDari(doc: PMNode): { akar: AkarBlok[]; pos: number[]; ukuran: number[] } {
  const akar: AkarBlok[] = [], pos: number[] = [], ukuran: number[] = [];
  doc.forEach((n, p) => {
    if (!adalahDaftar(n)) return;
    let bernomor = 0;
    n.forEach(b => { if (butirBernomor(b)) bernomor++; });
    akar.push({ gaya: gayaNode(n), start: Number(n.attrs.start) || 1, lanjut: !!n.attrs.lanjut, bernomor });
    pos.push(p);
    ukuran.push(n.nodeSize);
  });
  return { akar, pos, ukuran };
}

// ─── Format ───────────────────────────────────────────────────────────────────
/** Hapus format (huruf, perataan, indent); judul jadi paragraf. Tanpa pilihan = seluruh paragraf di kursor. Daftar tetap. */
export const hapusFormat: Perintah = (state, dispatch) => {
  const { from, to, empty, $from } = state.selection;
  const a = empty ? $from.start() : from;
  const b = empty ? $from.end() : to;
  const tr = state.tr.removeMark(a, b);
  const { paragraph } = state.schema.nodes;
  state.doc.nodesBetween(a, b, (n, pos) => {
    const ind = { indKiri: null, indKanan: null, indPertama: null };
    if (n.type.name === 'heading') tr.setNodeMarkup(pos, paragraph, { textAlign: null, ...ind });
    else if (n.type.name === 'paragraph') tr.setNodeMarkup(pos, undefined, { ...n.attrs, textAlign: null, ...ind });
    else if (n.type.name === 'listItem') tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...ind });
    return !n.isTextblock;
  });
  tr.setStoredMarks([]);
  dispatch?.(tr);
  return true;
};

const PENGGANTI_ATOM = '￼';
/** Ubah huruf. `'putar'` = Shift+F3. Tanpa pilihan = kata di kursor. Simbol tebal/warna & atom (angka tertaut) tetap. */
export const ubahHuruf = (mode: ModeHuruf | 'putar'): Perintah => (state, dispatch) => {
  const { selection: { from, to, empty, $from }, doc, schema } = state;
  let a = from, b = to;
  if (empty) {
    const [x, y] = rentangKata($from.parent.textBetween(0, $from.parent.content.size, '\n', PENGGANTI_ATOM), $from.parentOffset);
    if (x === y) return false;
    a = $from.start() + x;
    b = $from.start() + y;
  }
  const m = mode === 'putar' ? modeBerikut(doc.textBetween(a, b, ' ', '')) : mode;
  const ganti: { from: number; to: number; teks: string; marks: PMNode['marks'] }[] = [];
  doc.nodesBetween(a, b, (blok, posBlok) => {
    if (!blok.isTextblock) return true;
    const awal = posBlok + 1;
    const dari = Math.max(a, awal);
    const sampai = Math.min(b, awal + blok.content.size);
    const potong: { teks: string; from: number; to: number; marks: PMNode['marks'] | null }[] = [];
    blok.forEach((c, o) => {
      const cDari = Math.max(dari, awal + o);
      const cSampai = Math.min(sampai, awal + o + c.nodeSize);
      if (cDari >= cSampai) return;
      if (c.isText) potong.push({ teks: c.text!.slice(cDari - awal - o, cSampai - awal - o), from: cDari, to: cSampai, marks: c.marks });
      else potong.push({ teks: PENGGANTI_ATOM, from: cDari, to: cSampai, marks: null });
    });
    const hasil = ubahSegmen(potong.map(p => p.teks), m, konteksSebelum(blok.textBetween(0, dari - awal, '\n', PENGGANTI_ATOM)));
    potong.forEach((p, i) => { if (p.marks && hasil[i] !== p.teks) ganti.push({ from: p.from, to: p.to, teks: hasil[i], marks: p.marks }); });
    return false;
  });
  if (!ganti.length) return true;
  const tr = state.tr;
  for (const g of ganti.reverse()) tr.replaceWith(g.from, g.to, schema.text(g.teks, g.marks));
  const akhirA = tr.mapping.map(a, -1);
  const akhirB = tr.mapping.map(b, 1);
  tr.setSelection(empty ? TextSelection.create(tr.doc, Math.min(akhirB, akhirA + (from - a))) : TextSelection.create(tr.doc, akhirA, akhirB));
  dispatch?.(tr);
  return true;
};

/** Teks pilihan untuk putaran & penjagaan menu. */
export const adaPilihanTeks = (state: EditorState) => !state.selection.empty;
