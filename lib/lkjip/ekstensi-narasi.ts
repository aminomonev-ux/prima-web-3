// ═══ PRIMA — LKJIP — Ekstensi Tiptap narasi: format daftar, super/subscript, stabilo ═══
// Tanpa dependency baru. Skemanya dipakai juga oleh uji di Node.

import { Extension, Mark, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { adalahBullet, bacaSusunan, gayaDariTagDaftar, gayaSah, tulisSusunan, type KodeGaya } from './gaya-daftar';
import { adalahDaftar, gayaNode, naikTingkat, posisiDaftar, turunTingkat, ubahHuruf } from './perintah-narasi';
import { stabiloSah } from './format-teks';

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
      // Di dalam daftar Tab selalu dimakan: `sinkListItem` menolak butir pertama, dan tanpa ini fokus lompat keluar editor.
      Tab: () => {
        const { state, view } = this.editor;
        if (!posisiDaftar(state.selection.$from)) return false;
        turunTingkat(state, view.dispatch);
        return true;
      },
      'Shift-Tab': () => {
        const { state, view } = this.editor;
        if (!posisiDaftar(state.selection.$from)) return false;
        naikTingkat(state, view.dispatch);
        return true;
      },
      'Shift-F3': () => {
        const { state, view } = this.editor;
        ubahHuruf('putar')(state, view.dispatch);
        return true;
      },
    };
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
