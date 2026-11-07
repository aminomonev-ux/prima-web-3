// ═══ PRIMA — LKJIP — Ekstensi Tiptap narasi: format daftar, super/subscript, stabilo ═══
// Tanpa dependency baru. Skemanya dipakai juga oleh uji di Node.

import { Extension, Mark, Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { adalahBullet, bacaSusunan, gayaDariTagDaftar, gayaSah, tulisSusunan, type KodeGaya } from './gaya-daftar';
import { adalahDaftar, dalamLanjutan, enterLanjutan, gayaNode, naikTingkat, posisiDaftar, tekanTab, ubahHuruf } from './perintah-narasi';
import { stabiloSah } from './format-teks';
import { bacaSpasi, type Spasi } from './halaman';

// `1) `, `(1) `, `a. `, `a) `, `(a) `, `i. `, `I. `, `A. ` di awal baris menjadi daftar, seperti AutoFormat Word.
// Huruf hanya yang memulai deret: "b. " di awal kalimat lebih mungkin singkatan daripada butir kedua.
export const POLA_KETIK = /^(?:\((\d{1,3}|[aAiI])\)|(\d{1,3}|[aAiI])([.)]))\s$/;
export const gayaKetikan = (m: RegExpMatchArray): { gaya: KodeGaya; angka: number | null } | null => {
  const inti = m[1] ?? m[2];
  const angka = /^\d+$/.test(inti) ? Number(inti) : null;
  const dasar = angka === null ? inti : '1';
  const kode = m[1] ? `(${dasar})` : `${dasar}${m[3]}`;
  return gayaSah(kode) ? { gaya: kode, angka } : null;
};

export const GayaDaftar = Extension.create({
  name: 'gayaDaftar',
  priority: 1000,
  addGlobalAttributes() {
    return [{
      types: ['orderedList', 'bulletList'],
      attributes: {
        gaya: {
          default: null,
          parseHTML: (el: HTMLElement) => gayaDariTagDaftar((el.cloneNode(false) as HTMLElement).outerHTML),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.gaya ? { 'data-gaya': attrs.gaya } : {}),
        },
        susunan: {
          default: null,
          parseHTML: (el: HTMLElement) => { const s = bacaSusunan(el.getAttribute('data-susunan')); return s ? tulisSusunan(s) : null; },
          renderHTML: (attrs: Record<string, unknown>) => (attrs.susunan ? { 'data-susunan': attrs.susunan } : {}),
        },
        lanjut: {
          default: null,
          parseHTML: (el: HTMLElement) => (el.hasAttribute('data-lanjut') ? true : null),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.lanjut ? { 'data-lanjut': '1' } : {}),
        },
      },
    }];
  },
  addInputRules() {
    const type = this.editor.schema.nodes.orderedList;
    return [wrappingInputRule({
      find: POLA_KETIK,
      type,
      getAttributes: (m: RegExpMatchArray) => {
        const h = gayaKetikan(m);
        return h ? { gaya: h.gaya, start: h.angka ?? 1 } : {};
      },
      // Hanya bila nomornya memang kelanjutan daftar di atasnya.
      joinPredicate: (m: RegExpMatchArray, sebelum: PMNode) => {
        const h = gayaKetikan(m);
        return !!h && h.angka !== null && adalahDaftar(sebelum) && !adalahBullet(gayaNode(sebelum))
          && gayaNode(sebelum) === h.gaya && (Number(sebelum.attrs.start) || 1) + sebelum.childCount === h.angka;
      },
    })];
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state, view } = this.editor;
        return tekanTab(state, view.dispatch);
      },
      // Di luar daftar Shift+Tab sengaja dilepas: itu jalan keluar papan ketik dari editor, sebab Tab kini menulis.
      'Shift-Tab': () => {
        const { state, view } = this.editor;
        const { $from } = state.selection;
        if (!posisiDaftar($from)) return false;
        if (!dalamLanjutan($from)) naikTingkat(state, view.dispatch);
        return true;
      },
      Enter: () => {
        const { state, view } = this.editor;
        return enterLanjutan(state, view.dispatch);
      },
      'Shift-F3': () => {
        const { state, view } = this.editor;
        ubahHuruf('putar')(state, view.dispatch);
        return true;
      },
    };
  },
});

/** Teks tempelan berkarakter tab → simpul tab. Tanpa ini tab-nya hilang jadi spasi begitu blok dibuka lagi. */
export function pecahTab(f: Fragment, schema: Schema, dalamKode = false): Fragment {
  const isi: PMNode[] = [];
  f.forEach(n => {
    if (n.isText && !dalamKode && n.text!.includes('\t')) {
      n.text!.split('\t').forEach((t, i) => {
        if (i) isi.push(schema.nodes.tabNarasi.create(null, null, n.marks));
        if (t) isi.push(schema.text(t, n.marks));
      });
    } else isi.push(n.content.size ? n.copy(pecahTab(n.content, schema, !!n.type.spec.code)) : n);
  });
  return Fragment.fromArray(isi);
}

// Tab sungguhan, bukan karakter di teks: ProseMirror meratakan spasi putih saat membaca HTML, jadi `\t` di teks
// berubah jadi spasi sesudah blok dibuka lagi. Simpul sendiri = `<w:tab/>` di Word.
export const TabNarasi = Node.create({
  name: 'tabNarasi',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'span[data-tab]', priority: 60 }],
  renderHTML: () => ['span', { 'data-tab': '1' }, '\t'],
  renderText: () => '\t',
  addProseMirrorPlugins() {
    const { schema } = this.editor;
    return [new Plugin({
      props: { transformPasted: slice => new Slice(pecahTab(slice.content, schema), slice.openStart, slice.openEnd) },
    })];
  },
});

// Spasi per paragraf: angka Word di `data-sp-*`; `--s-*` hanya untuk digambar CSS editor (`halaman.ts`).
const atributSpasiTiptap = (k: keyof Spasi, nama: string, css: (v: number) => string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => bacaSpasi(` data-sp-${k}="${el.getAttribute(`data-sp-${k}`) ?? ''}"`)[k] ?? null,
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nama] == null ? {} : { [`data-sp-${k}`]: attrs[nama], style: `--s-${k}:${css(Number(attrs[nama]))}` }),
});
export const SpasiParagraf = Extension.create({
  name: 'spasiParagraf',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'listItem'],
      attributes: {
        spSebelum: atributSpasiTiptap('sebelum', 'spSebelum', v => `${v / 20}pt`),
        spSesudah: atributSpasiTiptap('sesudah', 'spSesudah', v => `${v / 20}pt`),
        spBaris: atributSpasiTiptap('baris', 'spBaris', v => `${v / 240}`),
      },
    }];
  },
});

export const Superskrip = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: ({ HTMLAttributes }) => ['sup', mergeAttributes(HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-Shift-=': () => this.editor.commands.toggleMark('superscript') };
  },
});

export const Subskrip = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: ({ HTMLAttributes }) => ['sub', mergeAttributes(HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-=': () => this.editor.commands.toggleMark('subscript') };
  },
});

export const Stabilo = Mark.create({
  name: 'stabilo',
  addAttributes() {
    return {
      warna: {
        default: 'kuning',
        parseHTML: (el: HTMLElement) => { const k = el.getAttribute('data-stabilo'); return stabiloSah(k) ? k : 'kuning'; },
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-stabilo': attrs.warna }),
      },
    };
  },
  parseHTML: () => [{ tag: 'mark' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes), 0],
});
