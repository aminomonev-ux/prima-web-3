'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListTree, ListRestart, ListPlus, ListStart, AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading2, Heading3, Save, Hash, RefreshCw, BookmarkPlus, IndentIncrease, IndentDecrease, Undo2, Redo2, Eraser, Superscript as SuperscriptIcon, Subscript as SubscriptIcon, Highlighter, CaseSensitive, ChevronDown, Scissors, Copy, ClipboardPaste, Pilcrow, Paintbrush } from 'lucide-react';
import type { ObjekRujukan } from '@/lib/lkjip/numbering';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog, promptDialog } from '@/components/ui/ConfirmDialog';
import { RowMenu, type RowMenuItem } from '@/components/tabel/RowMenu';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { angkaDiHtml, bandingAngka, idAngkaBaru, kalimatAngka, kunciTarikan, resepTerpakai, type ResepAngka } from '@/lib/lkjip/angka';
import type { HasilTarik } from '@/lib/lkjip/tautan';
import { mulaiDaftarBlok, type LanjutanBlok } from '@/lib/lkjip/lanjut-daftar';
import { adalahBullet, cssGayaDaftar, gayaBawaan, type KodeBullet, type KodeGaya, type KodeNomor, type KodeSusunan, SUSUNAN } from '@/lib/lkjip/gaya-daftar';
import { STABILO, UKURAN_PT, ptDariCss, type KodeStabilo, type ModeHuruf } from '@/lib/lkjip/format-teks';
import { GayaDaftar, SpasiParagraf, Stabilo, Subskrip, Superskrip, TabNarasi } from '@/lib/lkjip/ekstensi-narasi';
import { tempelDariWord } from '@/lib/lkjip/tempel-word';
import {
  akarBlokDari, adaPilihanTeks, ambilFormat, aturGayaTingkat, aturLanjut, aturNomorAwal, aturSusunan, bungkusDaftar, dalamLanjutan, gayaNode, hapusFormat, indeksAkar, kodeSusunanDari,
  mulaiUlangDariSatu, naikTingkat, nomorTerkunciDesimal, posisiDaftar, sasaranParagraf, simpananInden, simpananSpasi, susunanPohon, terapkanFormat, turunTingkat, ubahHuruf,
  type FormatKuas, type SasaranParagraf,
} from '@/lib/lkjip/perintah-narasi';
import {
  LEBAR_DXA, PX_TULIS, LANGKAH_BESAR_DXA, BUTIR_KIRI_DXA, BUTIR_GANTUNG_DXA,
  bacaInden, bidangBerubah, dxaDariCss, indentTwips, indenBawaan, indenBerlaku, keTersimpan, pxHuruf, spasiBawaan, spasiKeTersimpan,
  type Inden, type Spasi,
} from '@/lib/lkjip/halaman';
import PenggarisNarasi from './PenggarisNarasi';
import { GALERI_CSS, GaleriBullet, GaleriNomor, GaleriTingkat, PilihanHuruf, PilihanStabilo } from './GaleriDaftar';
import ParagrafModal, { type PerataanNarasi } from './ParagrafModal';

const AngkaModal = dynamic(() => import('./AngkaModal'), { ssr: false });

// Ekstensi ringan (tanpa dependency baru) — atribut text-align pada paragraf/heading.
const TextAlign = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.textAlign || null,
          renderHTML: (attrs: Record<string, unknown>) => (attrs.textAlign ? { style: `text-align:${attrs.textAlign}` } : {}),
        },
      },
    }];
  },
});

// Mark inline untuk warna & ukuran teks (span style) — tanpa dependency baru.
const TextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.color || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span', getAttrs: (el) => { const e = el as HTMLElement; return (e.style?.color || e.style?.fontSize) ? {} : false; } }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

// Angka tertaut ke modul (konsep §19.1): atom sebaris — tidak bisa disunting sebagian, Backspace
// menghapus seluruhnya. Teksnya disimpan sebagai isi span; resepnya di payload.angka[id].
const AngkaTaut = Node.create({
  name: 'angkaTaut',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-angka'),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-angka': attrs.id }),
      },
      teks: {
        default: '',
        parseHTML: (el: HTMLElement) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-angka]', priority: 60 }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), String(node.attrs.teks ?? '')];
  },
  renderText({ node }) {
    return String(node.attrs.teks ?? '');
  },
});

// Rujukan silang ke Tabel/Gambar/Grafik (konsep tabel-excel §12.5): atom sebaris yang menyimpan ID BLOK.
// Teksnya ("Tabel 3.1") disegarkan dari nomor sekarang tiap editor dibuka; di Word jadi field REF.
const RujukTaut = Node.create({
  name: 'rujukTaut',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-rujuk'),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-rujuk': attrs.id }),
      },
      teks: {
        default: '',
        parseHTML: (el: HTMLElement) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-rujuk]', priority: 60 }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const putus = String(node.attrs.teks ?? '').endsWith(' ?');
    return ['span', mergeAttributes(HTMLAttributes, putus ? { class: 'rujuk-putus' } : {}), String(node.attrs.teks ?? '')];
  },
  renderText({ node }) {
    return String(node.attrs.teks ?? '');
  },
});
const META_SEGAR = 'lkjipRujukSegar';

// "Lanjut daftar": nomor awal daftar akar dipasang sebagai DEKORASI (atribut start di DOM saja), tidak ditulis ke
// isi blok — kalau disimpan, angkanya basi begitu daftar sebelumnya bertambah dan tertinggal saat sambungannya
// dilepas. CSS `counter-reset: list-item` tidak dipakai: Chromium mengabaikannya untuk <ol> (dicoba di editor
// 2026-11-05). Daftar tanpa sambungan tetap didekorasi dengan nomornya sendiri, sebab melepas dekorasi ikut
// menghapus atribut start bawaannya dari DOM.
interface InfoLanjut { lanjutan?: LanjutanBlok; continueList: boolean }
const KUNCI_LANJUT = new PluginKey<InfoLanjut>('lkjipLanjutDaftar');
function dekorLanjut(doc: PMNode, info: InfoLanjut | undefined): DecorationSet {
  const { akar, pos, ukuran } = akarBlokDari(doc);
  const mulai = mulaiDaftarBlok(akar, info?.lanjutan, info?.continueList ?? false);
  const dekor = mulai.flatMap((m, i) => (m === null ? [] : [Decoration.node(pos[i], pos[i] + ukuran[i], { start: String(m) })]));
  return dekor.length ? DecorationSet.create(doc, dekor) : DecorationSet.empty;
}
const LanjutDaftar = Extension.create({
  name: 'lanjutDaftar',
  addProseMirrorPlugins() {
    return [new Plugin<InfoLanjut>({
      key: KUNCI_LANJUT,
      state: {
        init: () => ({ continueList: false }),
        apply: (tr, nilai) => (tr.getMeta(KUNCI_LANJUT) as InfoLanjut | undefined) ?? nilai,
      },
      props: { decorations: state => dekorLanjut(state.doc, KUNCI_LANJUT.getState(state)) },
    })];
  },
});

// Indent per paragraf (konsep penggaris §15): tiga angka dxa di paragraf/judul/butir, seperti `w:ind` Word.
// `null` = ikut bawaan. Tersimpan sebagai `data-ind-*`; `--i-*` hanya untuk digambar CSS di bawah.
// Tempelan dari Word membawa margin & text-indent — ikut terbaca di paragraf/judul (butir daftarnya tidak:
// margin <li> di halaman web lain bukan niat penulisnya).
function angkaInden(el: HTMLElement, k: keyof Inden): number | null {
  const tersimpan = bacaInden(` data-ind-${k}="${el.getAttribute(`data-ind-${k}`) ?? ''}"`)[k];
  if (tersimpan !== undefined) return tersimpan;
  if (el.tagName === 'LI') return null;
  const dxa = dxaDariCss(k === 'kiri' ? el.style.marginLeft : k === 'kanan' ? el.style.marginRight : el.style.textIndent);
  if (dxa === null || (k !== 'pertama' && dxa <= 0)) return null;
  return Math.max(-LEBAR_DXA, Math.min(LEBAR_DXA, dxa));
}
const atributIndenTiptap = (k: keyof Inden, nama: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => angkaInden(el, k),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nama] == null ? {} : { [`data-ind-${k}`]: attrs[nama], style: `--i-${k}:${attrs[nama]}` }),
});
const IndenParagraf = Extension.create({
  name: 'indenParagraf',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'listItem'],
      attributes: {
        indKiri: atributIndenTiptap('kiri', 'indKiri'),
        indKanan: atributIndenTiptap('kanan', 'indKanan'),
        indPertama: atributIndenTiptap('pertama', 'indPertama'),
      },
    }];
  },
});

// Kuas format disimpan di luar komponen: sumbernya bisa di blok narasi lain, dan tiap blok punya editor sendiri.
let kuasKini: { format: FormatKuas; tetap: boolean } | null = null;
const pendengarKuas = new Set<() => void>();
const aturKuas = (k: typeof kuasKini) => { kuasKini = k; pendengarKuas.forEach(f => f()); };
const dengarKuas = (f: () => void) => { pendengarKuas.add(f); return () => { pendengarKuas.delete(f); }; };

interface Props {
  initialHtml: string;
  initialAngka?: Record<string, ResepAngka>;
  tahunDokumen: number;
  readOnly: boolean;
  /** Tabel/Gambar/Grafik yang bisa dirujuk — nomornya SEKARANG (`daftarObjekRujukan`). */
  objek?: ObjekRujukan[];
  /** Nomor berikutnya tiap gaya daftar sebelum blok ini (`lanjutanDaftar`). */
  lanjutan?: LanjutanBlok;
  /** Centang "Lanjut daftar" blok ini: daftar pertamanya menyambung. */
  continueList?: boolean;
  onLanjutDaftar?: (lanjut: boolean) => void;
  /** Gaya halaman dari Pengaturan Dokumen: huruf, ukuran, spasi, perataan, indent baris pertama bawaan. */
  gaya?: { fontFamily?: string; fontSizePt?: number; lineSpacing?: number; align?: string; spaceAfterPt?: number; firstLineIndentCm?: number };
  onSave: (html: string, angka: Record<string, ResepAngka>) => void;
}

type JenisPop = 'bullet' | 'nomor' | 'tingkat' | 'stabilo' | 'huruf';

export default function TiptapNarasi({ initialHtml, initialAngka, tahunDokumen, readOnly, objek, lanjutan, continueList = false, onLanjutDaftar, gaya, onSave }: Props) {
  const [dirty, setDirty] = useState(false);
  const [pilihRujuk, setPilihRujuk] = useState(false);
  const [pop, setPop] = useState<{ jenis: JenisPop; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [modalParagraf, setModalParagraf] = useState(false);
  const kuas = useSyncExternalStore(dengarKuas, () => kuasKini, () => null);
  // Klik bagian kiri tombol memakai format terakhir yang dipilih di galeri, seperti Word.
  const [bulletTerakhir, setBulletTerakhir] = useState<KodeBullet>('•');
  const [nomorTerakhir, setNomorTerakhir] = useState<KodeNomor>('1.');
  const [angka, setAngka] = useState<Record<string, ResepAngka>>(initialAngka ?? {});
  const [modalAngka, setModalAngka] = useState(false);
  const [memperbarui, setMemperbarui] = useState(false);
  // Beberapa angka satu kalimat biasanya dari sumber yang sama — modal dibuka lagi di sana.
  const [sumberTerakhir, setSumberTerakhir] = useState<Pick<ResepAngka, 'sumber' | 'setelan'> | null>(() => {
    const semua = Object.values(initialAngka ?? {});
    return semua.length ? { sumber: semua[semua.length - 1].sumber, setelan: semua[semua.length - 1].setelan } : null;
  });
  const editor = useEditor({
    // Tiptap v3 (K2, 2026-09-30): StarterKit kini membawa Underline sendiri, plus Link dan
    // TrailingNode. Link dimatikan — <a> dibuang penyaring server saat Simpan, jadi tautan
    // yang tampil di editor akan lenyap diam-diam. TrailingNode dimatikan — ia menambah
    // paragraf kosong di ujung narasi, yang ikut tercetak ke Word.
    extensions: [StarterKit.configure({ link: false, trailingNode: false }), TextAlign, TextStyle, GayaDaftar, Superskrip, Subskrip, Stabilo, AngkaTaut, RujukTaut, LanjutDaftar, IndenParagraf, SpasiParagraf, TabNarasi],
    content: initialHtml || '<p></p>',
    editable: !readOnly,
    immediatelyRender: false,
    // v3 berhenti me-render ulang tiap transaksi; tombol bilah alat membaca `isActive` saat
    // render, jadi tanpa ini "Tebal"/"Rata" tidak ikut menyala saat kursor pindah.
    shouldRerenderOnTransaction: true,
    editorProps: { transformPastedHTML: html => tempelDariWord(html) },
    // Penyegaran nomor rujukan bukan suntingan orangnya — tidak memunculkan tombol Simpan.
    onUpdate: ({ transaction }) => { if (!transaction.getMeta(META_SEGAR)) setDirty(true); },
  });

  // Nomor rujukan mengikuti dokumen SEKARANG: tabel yang disisip di depannya menggeser "Tabel 3.1" jadi 3.2.
  const petaRujuk = useMemo(() => new Map((objek ?? []).map(o => [String(o.id), o.sebut])), [objek]);
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    let ubah = false;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name !== 'rujukTaut') return;
      const teks = petaRujuk.get(String(n.attrs.id)) ?? `${String(n.attrs.teks ?? '').split(' ')[0] || 'Tabel'} ?`;
      if (teks !== n.attrs.teks) { tr.setNodeMarkup(pos, undefined, { ...n.attrs, teks }); ubah = true; }
    });
    if (ubah) editor.view.dispatch(tr.setMeta(META_SEGAR, true).setMeta('addToHistory', false));
  }, [editor, petaRujuk]);

  // Sambungan berubah (blok lain disimpan, centang diubah) → dekorasinya disegarkan tanpa menyentuh isi.
  const kunciLanjutan = JSON.stringify(lanjutan ?? {});
  useEffect(() => {
    if (!editor) return;
    const nilai: InfoLanjut = { lanjutan: JSON.parse(kunciLanjutan) as LanjutanBlok, continueList };
    editor.view.dispatch(editor.state.tr.setMeta(KUNCI_LANJUT, nilai).setMeta(META_SEGAR, true).setMeta('addToHistory', false));
  }, [editor, kunciLanjutan, continueList]);

  // Daftar rujukan menutup saat klik di luar / Esc — tombolnya tidak mengambil fokus (kursor narasi tetap).
  const rujukRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!pilihRujuk) return;
    const luar = (e: MouseEvent) => { if (!rujukRef.current?.contains(e.target as globalThis.Node)) setPilihRujuk(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPilihRujuk(false); };
    document.addEventListener('mousedown', luar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', luar); document.removeEventListener('keydown', esc); };
  }, [pilihRujuk]);

  useEffect(() => {
    if (!kuas) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aturKuas(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [kuas]);

  // Popover galeri ada di portal: yang dianggap "di dalam" tombol pembuka & kotaknya sendiri.
  useEffect(() => {
    if (!pop) return;
    const tutup = () => setPop(null);
    const luar = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.('.lk-tt-pop, .lk-tt-popbtn')) tutup(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup(); };
    document.addEventListener('mousedown', luar);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', tutup, true);
    return () => { document.removeEventListener('mousedown', luar); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', tutup, true); };
  }, [pop]);

  if (!editor) return <div className="lk-tt-loading">Memuat editor…</div>;
  const ed = editor;

  let jumlahAngka = 0;
  ed.state.doc.descendants(n => { if (n.type.name === 'angkaTaut' && angka[String(n.attrs.id)]) jumlahAngka++; });

  function simpan(angkaKini: Record<string, ResepAngka> = angka) {
    const html = ed.getHTML();
    onSave(html, resepTerpakai(html, angkaKini));
    setDirty(false);
  }

  function sisipkanRujukan(o: ObjekRujukan) {
    ed.chain().focus().insertContent({ type: 'rujukTaut', attrs: { id: String(o.id), teks: o.sebut } }).run();
    setPilihRujuk(false);
  }

  function sisipkanAngka(teks: string, resep: ResepAngka) {
    const id = idAngkaBaru([...Object.keys(angka), ...angkaDiHtml(ed.getHTML()).keys()]);
    setAngka(a => ({ ...a, [id]: resep }));
    setSumberTerakhir({ sumber: resep.sumber, setelan: resep.setelan });
    ed.chain().focus().insertContent({ type: 'angkaTaut', attrs: { id, teks } }).run();
    setModalAngka(false);
  }

  // Satu tarikan per resep sumber; sama → tidak menulis apa pun (konsep §19.1).
  async function perbaruiAngka() {
    const html = ed.getHTML();
    const resep = resepTerpakai(html, angka);
    if (!Object.keys(resep).length) return;
    setMemperbarui(true);
    try {
      const { DAFTAR_SUMBER } = await import('@/lib/lkjip/sumber');
      const hasilPer = new Map<string, HasilTarik>();
      const gagal = new Map<string, string>();
      for (const r of Object.values(resep)) {
        const k = kunciTarikan(r);
        if (hasilPer.has(k) || gagal.has(k)) continue;
        try { hasilPer.set(k, await DAFTAR_SUMBER[r.sumber].tarik(r.setelan, url => fetchJson<unknown>(url), tahunDokumen)); }
        catch (e) { gagal.set(k, e instanceof Error && e.name === 'GagalTarik' ? e.message : 'Gagal menarik data. Coba lagi.'); }
      }
      const banding = bandingAngka(html, resep, hasilPer);
      const berubah = banding.filter(b => b.status === 'berubah');
      const catatanGagal = gagal.size ? `\n\nTidak bisa diperiksa: ${[...gagal.values()][0]}` : '';
      if (!berubah.length) {
        if (!banding.length && gagal.size) toast.error([...gagal.values()][0]);
        else toast.info(`${kalimatAngka(banding) === 'Tidak ada yang berubah.' ? 'Semua angka sudah sama dengan sumbernya.' : kalimatAngka(banding)}${catatanGagal}`);
        return;
      }
      if (!(await confirmDialog({
        title: 'Perbarui angka dari modul?',
        message: `${kalimatAngka(banding)}.${catatanGagal}`,
        confirmLabel: 'Terapkan & simpan', variant: 'warning',
      }))) return;
      const baru = new Map(berubah.map(b => [b.id, b.baru!]));
      const tr = ed.state.tr;
      ed.state.doc.descendants((n, pos) => {
        const id = String(n.attrs.id);
        if (n.type.name === 'angkaTaut' && baru.has(id)) tr.setNodeMarkup(pos, undefined, { ...n.attrs, teks: baru.get(id) });
      });
      ed.view.dispatch(tr);
      const kini = waktuSekarangWIB().slice(0, 16);
      // Angka yang tak ditemukan lagi tidak ikut distempel: teksnya memang tidak ditarik ulang.
      const hilang = new Set(banding.filter(b => b.status === 'hilang').map(b => b.id));
      const angkaBaru = Object.fromEntries(Object.entries(resep).map(([id, r]) => {
        const h = hasilPer.get(kunciTarikan(r));
        return [id, h && !hilang.has(id) ? { ...r, ringkas: h.ringkas.slice(0, 500), ditarikPada: kini } : r];
      }));
      setAngka(angkaBaru);
      simpan(angkaBaru);
      toast.success(`${berubah.length} angka diperbarui.`);
    } finally { setMemperbarui(false); }
  }

  const btn = (active: boolean, onClick: () => void, title: string, Icon: typeof Bold, mati = false) => (
    <button type="button" className={`lk-tt-btn${active ? ' on' : ''}`} data-tooltip={title} data-tooltip-pos="below" aria-label={title} aria-disabled={mati || undefined} onMouseDown={e => { e.preventDefault(); if (!mati) onClick(); }}>
      <Icon size={14} />
    </button>
  );

  // Satu set variabel untuk teks: huruf, spasi, jarak paragraf, dan indent di layar = di Word.
  const bawaanDxa = indentTwips(gaya?.firstLineIndentCm ?? 0);
  const variabel = {
    '--lk-indent-dxa': String(bawaanDxa),
    '--lk-font': `${pxHuruf(gaya?.fontSizePt ?? 12)}px`,
    '--lk-lh': String(gaya?.lineSpacing ?? 1.5),
    '--lk-after': `${((gaya?.spaceAfterPt ?? 6) * 4) / 3}px`,
    '--lk-align': gaya?.align === 'left' ? 'left' : 'justify',
    '--lk-fontfam': gaya?.fontFamily ?? 'Arial',
  } as CSSProperties;

  // Penggaris membaca paragraf pertama pilihan; mengubah = bidang itu saja di semua paragraf terpilih.
  const sasaran = sasaranParagraf(ed.state);
  const berlakuDi = (s: SasaranParagraf) => indenBerlaku(simpananInden(s.node), s.jenis, s.bawaan ?? bawaanDxa, s.kedalaman, s.gantung);
  const indenKini = sasaran[0] ? berlakuDi(sasaran[0]) : indenBawaan('paragraf', bawaanDxa);
  const campur = sasaran.some(s => { const i = berlakuDi(s); return i.kiri !== indenKini.kiri || i.kanan !== indenKini.kanan || i.pertama !== indenKini.pertama; });
  const punyaIsian = sasaran.some(s => Object.keys(simpananInden(s.node)).length > 0);
  const atributInden = (s: SasaranParagraf, ubah: (i: Inden, s: SasaranParagraf) => Partial<Inden> | null) => {
    const i = berlakuDi(s);
    const bidang = ubah(i, s);
    const simpan = bidang ? keTersimpan({ ...i, ...bidang }, s.jenis, s.bawaan ?? bawaanDxa, s.kedalaman, s.gantung) : {};
    return { indKiri: simpan.kiri ?? null, indKanan: simpan.kanan ?? null, indPertama: simpan.pertama ?? null };
  };
  const terapkanInden = (ubah: (i: Inden, s: SasaranParagraf) => Partial<Inden> | null) => {
    const tr = ed.state.tr;
    for (const s of sasaranParagraf(ed.state)) {
      const a = atributInden(s, ubah);
      // Nilai sama = jangan menulis: keluar dari isian angka tanpa mengubah apa pun tidak boleh memunculkan Simpan.
      if (a.indKiri === (s.node.attrs.indKiri ?? null) && a.indKanan === (s.node.attrs.indKanan ?? null) && a.indPertama === (s.node.attrs.indPertama ?? null)) continue;
      tr.setNodeMarkup(s.pos, undefined, { ...s.node.attrs, ...a });
    }
    if (tr.docChanged) ed.view.dispatch(tr);
  };
  const bawaanSpasi = spasiBawaan(gaya?.spaceAfterPt ?? 6, gaya?.lineSpacing ?? 1.5);
  const spasiKini: Spasi = { ...bawaanSpasi, ...(sasaran[0] ? simpananSpasi(sasaran[0].node) : {}) };
  // Satu transaksi = satu langkah Undo. Hanya bidang yang diubah di dialog yang mengenai semua paragraf terpilih.
  function terapkanParagraf(h: { inden: Inden; perataan: PerataanNarasi | null; spasi: Spasi }) {
    const ubahInden = bidangBerubah(indenKini, h.inden);
    const ubahSpasi = bidangBerubah(spasiKini, h.spasi);
    const adaInden = Object.keys(ubahInden).length > 0;
    const adaSpasi = Object.keys(ubahSpasi).length > 0;
    const tr = ed.state.tr;
    for (const s of sasaranParagraf(ed.state)) {
      const isian = spasiKeTersimpan({ ...bawaanSpasi, ...simpananSpasi(s.node), ...ubahSpasi }, bawaanSpasi);
      tr.setNodeMarkup(s.pos, undefined, {
        ...s.node.attrs,
        ...(adaInden ? atributInden(s, () => ubahInden) : {}),
        ...(adaSpasi ? { spSebelum: isian.sebelum ?? null, spSesudah: isian.sesudah ?? null, spBaris: isian.baris ?? null } : {}),
      });
    }
    if (h.perataan !== perataanKini) {
      ed.state.doc.nodesBetween(ed.state.selection.from, ed.state.selection.to, (n, pos) => {
        if (!n.isTextblock) return true;
        tr.setNodeMarkup(pos, undefined, { ...n.attrs, textAlign: h.perataan });
        return false;
      });
    }
    if (tr.docChanged) ed.view.dispatch(tr);
    ed.view.focus();
  }
  // Tombol tambah/kurangi: ke kelipatan 0,5 inci berikutnya, seperti Word. Di dalam daftar memindah tingkat,
  // kecuali yang tak bisa pindah (butir pertama; tingkat teratas — mengurangi tidak boleh melepas nomornya).
  const geserKiri = (arah: 1 | -1) => {
    const posisi = dalamLanjutan(ed.state.selection.$from) ? null : posisiDaftar(ed.state.selection.$from);
    if (posisi && (arah > 0 ? turunTingkat(ed.state, ed.view.dispatch) : posisi.kedalaman > 1 && naikTingkat(ed.state, ed.view.dispatch))) return;
    terapkanInden(i => ({
      kiri: Math.max(0, (arah > 0 ? Math.floor(i.kiri / LANGKAH_BESAR_DXA) + 1 : Math.ceil(i.kiri / LANGKAH_BESAR_DXA) - 1) * LANGKAH_BESAR_DXA),
    }));
  };

  const posDaftar = posisiDaftar(ed.state.selection.$from);
  const gayaKini = posDaftar ? gayaNode(posDaftar.daftar) : null;
  const susunanKini = posDaftar ? kodeSusunanDari(susunanPohon(posDaftar.akar)) : null;
  const jalankan = (perintah: (s: typeof ed.state, d: typeof ed.view.dispatch) => boolean) => { const hasil = perintah(ed.state, ed.view.dispatch); ed.view.focus(); return hasil; };
  const tutupSemua = () => { setPop(null); setMenu(null); };
  // Klik = sekali pakai, klik dua kali = dipakai berkali-kali sampai Esc, seperti Word.
  const ambilKuas = (tetap: boolean) => aturKuas({ format: ambilFormat(ed.state), tetap });
  // Menunggu satu putaran: pilihan hasil menyeret baru sampai ke ProseMirror lewat `selectionchange` sesudah mouseup.
  const sapuKuas = (e: ReactMouseEvent) => {
    if (!kuasKini || e.button !== 0) return;
    setTimeout(() => {
      const k = kuasKini;
      if (!k) return;
      terapkanFormat(k.format)(ed.state, ed.view.dispatch);
      if (!k.tetap) aturKuas(null);
    }, 0);
  };

  function pilihGaya(k: KodeGaya) {
    if (adalahBullet(k)) setBulletTerakhir(k);
    else setNomorTerakhir(k as KodeNomor);
    jalankan((s, d) => aturGayaTingkat(k)(s, d) || bungkusDaftar(k)(s, d));
    tutupSemua();
  }
  function pilihSusunan(k: KodeSusunan) {
    jalankan((s, d) => aturSusunan(k)(s, d) || bungkusDaftar(SUSUNAN[k][0], SUSUNAN[k])(s, d));
    tutupSemua();
  }
  // Lepas nomor sepenuhnya, berapa pun tingkatnya. Rantai Tiptap = satu langkah Undo.
  function lepasDaftar() {
    const k = posisiDaftar(ed.state.selection.$from)?.kedalaman ?? 0;
    let c = ed.chain().focus();
    for (let i = 0; i < k; i++) c = c.liftListItem('listItem');
    c.run();
    tutupSemua();
  }
  function pilihHuruf(m: ModeHuruf) {
    jalankan(ubahHuruf(m));
    tutupSemua();
  }
  function pilihStabilo(k: KodeStabilo | null) {
    const c = ed.chain().focus();
    (k ? c.setMark('stabilo', { warna: k }) : c.unsetMark('stabilo')).run();
    tutupSemua();
  }
  function aturUkuran(pt: string) {
    if (pt === 'reset') {
      const warna = ed.getAttributes('textStyle').color;
      const c = ed.chain().focus();
      (warna ? c.setMark('textStyle', { color: warna, fontSize: null }) : c.unsetMark('textStyle')).run();
    } else if (pt) ed.chain().focus().setMark('textStyle', { fontSize: `${pt}pt` }).run();
  }
  const aturRata = (nilai: PerataanNarasi | null) => { ed.chain().focus().updateAttributes('paragraph', { textAlign: nilai }).updateAttributes('heading', { textAlign: nilai }).run(); };
  const bukaPop = (jenis: JenisPop) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setPilihRujuk(false);
    setPop(p => (p?.jenis === jenis ? null : { jenis, x: r.left, y: r.bottom + 4 }));
  };
  // Selama popover terbuka tooltip tombolnya dilepas: letaknya tepat di atas butir pertama popover.
  const tipPop = (jenis: JenisPop, teks: string) => (pop?.jenis === jenis ? undefined : teks);
  const lebarPop = pop?.jenis === 'huruf' ? 204 : pop?.jenis === 'stabilo' ? 214 : pop?.jenis === 'bullet' ? 216 : 256;
  const kiriPop = pop ? Math.max(8, Math.min(pop.x, window.innerWidth - lebarPop - 8)) : 0;

  const ukuranTampil = String(ptDariCss(ed.getAttributes('textStyle').fontSize) ?? gaya?.fontSizePt ?? 12);
  const stabiloKini = ed.isActive('stabilo') ? (ed.getAttributes('stabilo').warna as KodeStabilo) : null;
  const perataanKini = ((ed.getAttributes('paragraph').textAlign ?? ed.getAttributes('heading').textAlign) as PerataanNarasi | undefined) ?? null;

  // Menu klik kanan. Di luar pilihan kursor pindah ke titik klik dulu, seperti Word; di dalam pilihan, pilihannya tetap.
  function bukaMenu(e: ReactMouseEvent) {
    if (e.shiftKey) return; // Shift + klik kanan = menu peramban (saran ejaan)
    e.preventDefault();
    const titik = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const { from, to } = ed.state.selection;
    if (titik && (titik.pos < from || titik.pos > to)) ed.commands.setTextSelection(titik.pos);
    setPop(null);
    setPilihRujuk(false);
    setMenu({ x: e.clientX, y: e.clientY });
  }
  const potongSalin = (perintah: 'cut' | 'copy') => { ed.view.focus(); document.execCommand(perintah); setMenu(null); };
  async function tempelDariMenu() {
    setMenu(null);
    try {
      const isi = await navigator.clipboard.read();
      const item = isi[0];
      if (item?.types.includes('text/html')) ed.view.pasteHTML(await (await item.getType('text/html')).text());
      else if (item?.types.includes('text/plain')) ed.view.pasteText(await (await item.getType('text/plain')).text());
      ed.view.focus();
    } catch {
      toast.error('Peramban tidak mengizinkan menu ini membaca papan klip. Tekan Ctrl+V.');
    }
  }
  async function mintaNomorAwal() {
    setMenu(null);
    const awal = Number(posDaftar?.daftar.attrs.start) || 1;
    const isian = await promptDialog({ title: 'Atur nomor awal', message: 'Daftar ini mulai dari nomor berapa?', label: 'Nomor awal', petunjuk: 'Angka 1 sampai 9999.', nilaiAwal: String(awal), minLength: 1, maxLength: 4, confirmLabel: 'Terapkan' });
    if (isian === null) { ed.view.focus(); return; }
    const n = Number(String(isian).trim());
    if (!Number.isInteger(n) || n < 1 || n > 9999) { toast.error('Nomor awal harus angka 1 sampai 9999.'); return; }
    jalankan(aturNomorAwal(n));
    if (posDaftar && posDaftar.kedalaman === 1 && continueList && indeksAkar(ed.state.doc, posDaftar.akarPos) === 0) onLanjutDaftar?.(false);
  }
  const akarPertama = posDaftar ? indeksAkar(ed.state.doc, posDaftar.akarPos) === 0 : false;
  const sudahLanjut = posDaftar ? (akarPertama && continueList) || !!posDaftar.akar.attrs.lanjut : false;
  function pilihLanjut() {
    setMenu(null);
    if (!posDaftar) return;
    // Daftar pertama blok memakai centang "Lanjut daftar" yang sudah terlihat di kepala blok, supaya tidak ada dua sakelar.
    if (akarPertama) { if (posDaftar.akar.attrs.lanjut) jalankan(aturLanjut(false)); onLanjutDaftar?.(!sudahLanjut); }
    else jalankan(aturLanjut(!sudahLanjut));
  }
  function pilihMulaiUlang() {
    setMenu(null);
    if (posDaftar && posDaftar.kedalaman === 1 && posDaftar.butirIndeks === 0 && akarPertama && continueList) onLanjutDaftar?.(false);
    jalankan(mulaiUlangDariSatu);
  }

  function itemMenu(): RowMenuItem[] {
    const adaPilihan = adaPilihanTeks(ed.state);
    const bisaTempel = typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
    const nomor = posDaftar && !adalahBullet(gayaKini ?? gayaBawaan('ul'));
    const terkunciDesimal = !!posDaftar && nomorTerkunciDesimal(posDaftar);
    return [
      { icon: <Scissors size={14} />, label: 'Potong', pintasan: 'Ctrl+X', disabled: !adaPilihan, alasan: 'Pilih teks dulu', onClick: () => potongSalin('cut') },
      { icon: <Copy size={14} />, label: 'Salin', pintasan: 'Ctrl+C', disabled: !adaPilihan, alasan: 'Pilih teks dulu', onClick: () => potongSalin('copy') },
      { icon: <ClipboardPaste size={14} />, label: 'Tempel', pintasan: 'Ctrl+V', disabled: !bisaTempel, alasan: 'Alamat http: peramban melarang menu membaca papan klip. Tekan Ctrl+V.', onClick: () => void tempelDariMenu() },
      { icon: <Eraser size={14} />, label: 'Hapus format', pisah: true, onClick: () => { jalankan(hapusFormat); setMenu(null); } },
      { icon: <Paintbrush size={14} />, label: 'Kuas format', onClick: () => { ambilKuas(false); setMenu(null); } },
      { icon: <CaseSensitive size={14} />, label: 'Ubah huruf', sub: <PilihanHuruf onPilih={pilihHuruf} /> },
      { icon: <Pilcrow size={14} />, label: 'Paragraf…', onClick: () => { setMenu(null); setModalParagraf(true); } },
      { icon: <ListOrdered size={14} />, label: 'Penomoran', pisah: true, sub: <GaleriNomor aktif={gayaKini} onPilih={pilihGaya} onTanpa={posDaftar ? lepasDaftar : undefined} /> },
      { icon: <List size={14} />, label: 'Bullet', sub: <GaleriBullet aktif={gayaKini} onPilih={pilihGaya} onTanpa={posDaftar ? lepasDaftar : undefined} /> },
      { icon: <ListTree size={14} />, label: 'Daftar bertingkat', sub: <GaleriTingkat aktif={susunanKini} onPilih={pilihSusunan} /> },
      ...(posDaftar ? [
        { icon: <IndentIncrease size={14} />, label: 'Turun satu tingkat', pintasan: 'Tab', onClick: () => { jalankan(turunTingkat); setMenu(null); } },
        { icon: <IndentDecrease size={14} />, label: 'Naik satu tingkat', pintasan: 'Shift+Tab', onClick: () => { jalankan(naikTingkat); setMenu(null); } },
      ] : []),
      ...(nomor ? [
        { icon: <ListRestart size={14} />, label: 'Mulai ulang dari 1', disabled: terkunciDesimal && posDaftar.butirIndeks > 0, alasan: 'Nomor bertingkat 1.1. mengikuti nomor induknya', onClick: pilihMulaiUlang },
        { icon: <ListPlus size={14} />, label: sudahLanjut ? 'Jangan lanjutkan penomoran' : 'Lanjutkan penomoran', disabled: posDaftar.kedalaman > 1, alasan: 'Hanya untuk daftar tingkat teratas', onClick: pilihLanjut },
        { icon: <ListStart size={14} />, label: 'Atur nomor awal…', disabled: terkunciDesimal, alasan: 'Nomor bertingkat 1.1. mengikuti nomor induknya', onClick: () => void mintaNomorAwal() },
      ] : []),
      { icon: <BookmarkPlus size={14} />, label: 'Sisipkan rujukan', pisah: true, onClick: () => { setMenu(null); setPilihRujuk(true); } },
      { icon: <Hash size={14} />, label: 'Sisipkan angka dari modul', onClick: () => { setMenu(null); setModalAngka(true); } },
    ];
  }

  return (
    <div className="lk-tt" style={variabel}>
      <style>{TT_CSS}</style>
      <style>{GALERI_CSS}</style>
      {!readOnly && (
        <div className="lk-tt-bar">
          {btn(false, () => editor.chain().focus().undo().run(), 'Batalkan (Ctrl+Z)', Undo2, !editor.can().undo())}
          {btn(false, () => editor.chain().focus().redo().run(), 'Ulangi (Ctrl+Y)', Redo2, !editor.can().redo())}
          <span className="lk-tt-sep" />
          {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Tebal', Bold)}
          {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Miring', Italic)}
          {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Garis bawah', UnderlineIcon)}
          {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Coret', Strikethrough)}
          {btn(editor.isActive('superscript'), () => editor.chain().focus().toggleMark('superscript').run(), 'Superskrip (Ctrl+Shift+=)', SuperscriptIcon)}
          {btn(editor.isActive('subscript'), () => editor.chain().focus().toggleMark('subscript').run(), 'Subskrip (Ctrl+=)', SubscriptIcon)}
          <button type="button" className={`lk-tt-btn lk-tt-popbtn${stabiloKini ? ' on' : ''}`} data-tooltip={tipPop('stabilo', 'Warna stabilo')} data-tooltip-pos="below" aria-label="Warna stabilo" aria-expanded={pop?.jenis === 'stabilo'} onMouseDown={bukaPop('stabilo')}><Highlighter size={14} /></button>
          <button type="button" className="lk-tt-btn lk-tt-popbtn" data-tooltip={tipPop('huruf', 'Ubah huruf (Shift+F3)')} data-tooltip-pos="below" aria-label="Ubah huruf" aria-expanded={pop?.jenis === 'huruf'} onMouseDown={bukaPop('huruf')}><CaseSensitive size={15} /></button>
          {btn(false, () => jalankan(hapusFormat), 'Hapus format', Eraser)}
          <button type="button" className={`lk-tt-btn${kuas ? ' on' : ''}`} aria-label="Kuas format" aria-pressed={!!kuas}
            data-tooltip={kuas ? 'Sapukan pada teks tujuan. Esc untuk batal.' : 'Kuas format: klik untuk sekali pakai, klik dua kali untuk berkali-kali'} data-tooltip-pos="below"
            onMouseDown={e => e.preventDefault()} onClick={() => { if (kuas) aturKuas(null); else ambilKuas(false); }} onDoubleClick={() => ambilKuas(true)}>
            <Paintbrush size={14} />
          </button>
          <span className="lk-tt-sep" />
          <span className="lk-tt-belah">
            {btn(!!gayaKini && adalahBullet(gayaKini), () => { if (gayaKini && adalahBullet(gayaKini)) lepasDaftar(); else pilihGaya(bulletTerakhir); }, 'Bullet', List)}
            <button type="button" className="lk-tt-btn lk-tt-panah lk-tt-popbtn" data-tooltip={tipPop('bullet', 'Pilih bullet')} data-tooltip-pos="below" aria-label="Pilih bullet" aria-expanded={pop?.jenis === 'bullet'} onMouseDown={bukaPop('bullet')}><ChevronDown size={11} /></button>
          </span>
          <span className="lk-tt-belah">
            {btn(!!gayaKini && !adalahBullet(gayaKini), () => { if (gayaKini && !adalahBullet(gayaKini)) lepasDaftar(); else pilihGaya(nomorTerakhir); }, 'Penomoran', ListOrdered)}
            <button type="button" className="lk-tt-btn lk-tt-panah lk-tt-popbtn" data-tooltip={tipPop('nomor', 'Pilih penomoran')} data-tooltip-pos="below" aria-label="Pilih penomoran" aria-expanded={pop?.jenis === 'nomor'} onMouseDown={bukaPop('nomor')}><ChevronDown size={11} /></button>
          </span>
          <button type="button" className={`lk-tt-btn lk-tt-teks lk-tt-popbtn${susunanKini && posDaftar?.akar.attrs.susunan ? ' on' : ''}`} data-tooltip={tipPop('tingkat', 'Daftar bertingkat')} data-tooltip-pos="below" aria-label="Daftar bertingkat" aria-expanded={pop?.jenis === 'tingkat'} onMouseDown={bukaPop('tingkat')}><ListTree size={14} /><ChevronDown size={11} /></button>
          <span className="lk-tt-sep" />
          {btn(editor.isActive({ textAlign: 'left' }), () => aturRata('left'), 'Rata kiri', AlignLeft)}
          {btn(editor.isActive({ textAlign: 'center' }), () => aturRata('center'), 'Rata tengah', AlignCenter)}
          {btn(editor.isActive({ textAlign: 'right' }), () => aturRata('right'), 'Rata kanan', AlignRight)}
          {btn(editor.isActive({ textAlign: 'justify' }), () => aturRata('justify'), 'Rata kiri-kanan', AlignJustify)}
          <span className="lk-tt-sep" />
          {btn(false, () => geserKiri(-1), 'Kurangi indent', IndentDecrease)}
          {btn(false, () => geserKiri(1), 'Tambah indent', IndentIncrease)}
          <span className="lk-tt-sep" />
          {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Sub-judul', Heading2)}
          {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Sub-sub-judul', Heading3)}
          <span className="lk-tt-sep" />
          {/* K1: input & select tak bisa menggambar ::after — tooltip dipasang di pembungkus. */}
          <span className="lk-tt-tip" data-tooltip="Warna teks" data-tooltip-pos="below">
            <input type="color" className="lk-tt-color" aria-label="Warna teks" defaultValue="#e6f1fb"
              onInput={(e) => editor.chain().focus().setMark('textStyle', { color: (e.target as HTMLInputElement).value }).run()} />
          </span>
          <span className="lk-tt-tip" data-tooltip="Ukuran huruf (pt)" data-tooltip-pos="below"><select className="lk-tt-size" aria-label="Ukuran huruf" value={ukuranTampil}
            onChange={e => aturUkuran(e.target.value)}>
            {!UKURAN_PT.map(String).includes(ukuranTampil) && <option value={ukuranTampil}>{ukuranTampil.replace('.', ',')}</option>}
            {UKURAN_PT.map(s => <option key={s} value={String(s)}>{String(s).replace('.', ',')}</option>)}
            <option value="reset">Bawaan</option>
          </select></span>
          <span className="lk-tt-sep" />
          <button type="button" className="lk-tt-btn lk-tt-teks" data-tooltip="Sisipkan angka dari E-Anggaran, Renaksi, BLUD, atau PK — bisa diperbarui nanti" data-tooltip-pos="below"
            aria-label="Angka dari Modul" onMouseDown={e => { e.preventDefault(); setModalAngka(true); }}>
            <Hash size={13} /> Angka
          </button>
          <span className="lk-tt-rujuk" ref={rujukRef}>
            <button type="button" className={`lk-tt-btn lk-tt-teks${pilihRujuk ? ' on' : ''}`} aria-expanded={pilihRujuk} aria-label="Rujukan ke tabel, gambar, atau grafik"
              data-tooltip="Sisipkan rujukan &quot;Tabel 3.1&quot; — nomornya ikut berubah bila tabel lain disisip di depannya" data-tooltip-pos="below"
              onMouseDown={e => { e.preventDefault(); setPilihRujuk(v => !v); }}>
              <BookmarkPlus size={13} /> Rujukan
            </button>
            {pilihRujuk && (
              <div className="lk-tt-rujuk-menu" role="listbox" aria-label="Pilih yang dirujuk">
                {objek?.length ? objek.map(o => (
                  <button key={o.id} type="button" role="option" aria-selected={false} onMouseDown={e => { e.preventDefault(); sisipkanRujukan(o); }}>
                    <b>{o.sebut}</b>{o.judul ? <span>{o.judul}</span> : null}
                  </button>
                )) : <div className="lk-tt-rujuk-kosong">Belum ada tabel, gambar, atau grafik bernomor di dokumen ini.</div>}
              </div>
            )}
          </span>
        </div>
      )}
      {!readOnly && (
        <PenggarisNarasi inden={indenKini} jenis={sasaran[0]?.jenis ?? 'paragraf'} campur={campur} punyaIsian={punyaIsian}
          tinggiTeks={() => ed.view.dom.getBoundingClientRect().height}
          onUbah={u => terapkanInden(() => u)} onBawaan={() => terapkanInden(() => null)} />
      )}
      {/* Hanya menangkap klik kanan pengguna; papan ketik sudah ditangani ProseMirror di dalamnya. */}
      <div className={kuas && !readOnly ? 'lk-tt-kuas' : undefined} onContextMenu={readOnly ? undefined : bukaMenu} onMouseUp={readOnly ? undefined : sapuKuas}>
        <EditorContent editor={editor} className="lk-tt-content" />
      </div>
      {!readOnly && (dirty || jumlahAngka > 0) && (
        <div className="lk-tt-save">
          {jumlahAngka > 0 && (
            <PrimaButton menulis variant="purple" size="sm" iconLeft={<RefreshCw size={14} />} disabled={memperbarui} onClick={() => void perbaruiAngka()}
              data-tooltip="Tarik ulang sumbernya, lalu tunjukkan angka yang berubah sebelum diterapkan">
              {memperbarui ? 'Memeriksa…' : `Perbarui angka (${jumlahAngka})`}
            </PrimaButton>
          )}
          {dirty && <PrimaButton menulis variant="primary" size="sm" iconLeft={<Save size={14} />} onClick={() => simpan()}>Simpan</PrimaButton>}
        </div>
      )}
      {modalAngka && <AngkaModal tahunDokumen={tahunDokumen} awal={sumberTerakhir} onSisipkan={sisipkanAngka} onTutup={() => setModalAngka(false)} />}
      {pop && createPortal(
        <div className="lk-tt-pop" role="dialog" aria-label="Pilihan format" style={{ left: kiriPop, top: pop.y }}>
          {pop.jenis === 'bullet' && <GaleriBullet aktif={gayaKini} onPilih={pilihGaya} onTanpa={posDaftar ? lepasDaftar : undefined} />}
          {pop.jenis === 'nomor' && <GaleriNomor aktif={gayaKini} onPilih={pilihGaya} onTanpa={posDaftar ? lepasDaftar : undefined} />}
          {pop.jenis === 'tingkat' && <GaleriTingkat aktif={susunanKini} onPilih={pilihSusunan} />}
          {pop.jenis === 'huruf' && <PilihanHuruf onPilih={pilihHuruf} />}
          {pop.jenis === 'stabilo' && <PilihanStabilo aktif={stabiloKini} onPilih={pilihStabilo} onTanpa={() => pilihStabilo(null)} />}
        </div>,
        document.body,
      )}
      {menu && <RowMenu x={menu.x} y={menu.y} items={itemMenu()} onClose={() => { setMenu(null); ed.view.focus(); }} lebar={252} />}
      {modalParagraf && sasaran[0] && (
        <ParagrafModal inden={indenKini} jenis={sasaran[0].jenis} perataan={perataanKini} spasi={spasiKini}
          onTutup={() => { setModalParagraf(false); ed.view.focus(); }}
          onTerapkan={h => { setModalParagraf(false); terapkanParagraf(h); }} />
      )}
    </div>
  );
}

const TT_CSS = `
  /* Bilah alat, penggaris, dan kotak teks selebar bidang tulis — di layar lebar dulu bilahnya melar 1.268 px
     sementara kotak teks 615 px, dan tombol penggaris terlempar jauh dari kolomnya. */
  .lk-tt { max-width: calc(${PX_TULIS}px + 30px); }
  .lk-tt-loading { color: #85B7EB; font-size: 12.5px; padding: 10px; }
  .lk-tt-tip { display: inline-flex; }
  .lk-tt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 4px; background: #020F1C; border: 1px solid #0C447C; border-bottom: none; border-radius: 6px 6px 0 0; }
  .lk-tt-btn { background: none; border: none; color: #B5D4F4; width: 28px; height: 28px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .lk-tt-btn:hover { background: rgba(255,255,255,0.08); color: #E6F1FB; }
  .lk-tt-btn.on { background: rgba(124,92,252,0.22); color: #C9BCFF; }
  .lk-tt-btn[aria-disabled="true"] { opacity: .35; cursor: default; }
  .lk-tt-btn[aria-disabled="true"]:hover { background: none; color: #B5D4F4; }
  .lk-tt-belah { display: inline-flex; }
  .lk-tt-belah .lk-tt-btn:first-child { border-radius: 5px 0 0 5px; }
  .lk-tt-panah { width: 16px; border-radius: 0 5px 5px 0; }
  .lk-tt-pop { position: fixed; z-index: 440; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 8px; box-shadow: 0 14px 34px rgba(0,0,0,.5); }
  [data-theme="light"] .lk-tt-pop { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  .lk-rowmenu-sub { padding: 8px; }
  .lk-rowmenu-item.terbuka { background: rgba(124,92,252,0.20); color: #fff; }
  [data-theme="light"] .lk-rowmenu-item.terbuka { background: rgba(124,92,252,0.12); color: #111827; }
  .lk-paragraf select { width: 100%; height: 32px; background: #020F1C; color: #E6F1FB; border: 1px solid #0C447C; border-radius: 6px; font-size: 13px; padding: 0 6px; margin-top: 3px; }
  .lk-paragraf select option { background: #020F1C; color: #E6F1FB; }
  .lk-paragraf label { font-size: 12px; color: #B5D4F4; display: block; }
  .lk-paragraf input { margin-bottom: 0; margin-top: 3px; }
  .lk-paragraf-baris { margin-bottom: 12px; }
  .lk-paragraf-judul { font-size: 11.5px; font-weight: 600; color: #85B7EB; margin-bottom: 6px; }
  [data-theme="light"] .lk-paragraf-judul { color: #1E5FA5; }
  .lk-paragraf-kisi { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
  .lk-tt-kuas .ProseMirror { cursor: copy; }
  [data-theme="light"] .lk-paragraf select { background: #F9FAFB; color: #374151; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-paragraf select option { background: #FFFFFF; color: #374151; }
  [data-theme="light"] .lk-paragraf label { color: #374151; }
  .lk-tt-sep { width: 1px; height: 18px; background: #0C447C; margin: 0 4px; }
  .lk-tt-color { width: 26px; height: 26px; padding: 1px; border: 1px solid #0C447C; border-radius: 5px; background: none; cursor: pointer; }
  .lk-tt-size { height: 26px; background: #020F1C; color: #B5D4F4; border: 1px solid #0C447C; border-radius: 5px; font-size: 11px; cursor: pointer; }
  .lk-tt-size option { background: #020F1C; color: #E6F1FB; }
  [data-theme="light"] .lk-tt-size { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tt-size option { background: #FFFFFF; color: #374151; }
  [data-theme="light"] .lk-tt-color { border-color: rgba(0,0,0,.12); }
  /* container-type: 1cqw = 1% lebar kolom tulis, sama bagi paragraf & butir bersarang — jadi indent di layar
     sebanding persis dengan bidang tulis Word (8.788 dxa), berapa pun lebar kartunya. */
  .lk-tt-content .ProseMirror { background: #020F1C; border: 1px solid #0C447C; border-radius: 0 0 6px 6px; color: #E6F1FB; padding: 12px 14px; min-height: 120px; font-family: var(--lk-fontfam, Arial); font-size: var(--lk-font, 13.5px); line-height: var(--lk-lh, 1.5); text-align: var(--lk-align, justify); width: calc(${PX_TULIS}px + 30px); max-width: 100%; box-sizing: border-box; outline: none; container-type: inline-size; --lk-dxa: calc(100cqw / ${LEBAR_DXA}); }
  .lk-tt-content .ProseMirror:focus { border-color: #185FA5; }
  /* Spasi: --s-* milik paragraf itu (ditulis SpasiParagraf), selain itu Pengaturan Dokumen — sama dengan docgen. */
  .lk-tt-content .ProseMirror p { margin: var(--s-sebelum, 0) 0 var(--s-sesudah, var(--lk-after, 8px)); line-height: var(--s-baris, var(--lk-lh, 1.5)); }
  /* Tab: kelipatan 1,27 cm seperti tab bawaan Word. */
  .lk-tt-content .ProseMirror span[data-tab] { white-space: pre; tab-size: calc(720 * var(--lk-dxa)); }
  /* Indent: --i-* milik paragraf itu (ditulis IndenParagraf), selain itu bawaan — sama dengan docgen. */
  .lk-tt-content .ProseMirror > p, .lk-tt-content .ProseMirror > h1, .lk-tt-content .ProseMirror > h2, .lk-tt-content .ProseMirror > h3 { margin-left: calc(var(--i-kiri, 0) * var(--lk-dxa)); margin-right: calc(var(--i-kanan, 0) * var(--lk-dxa)); text-indent: calc(var(--i-pertama, 0) * var(--lk-dxa)); }
  .lk-tt-content .ProseMirror > p { text-indent: calc(var(--i-pertama, var(--lk-indent-dxa, 0)) * var(--lk-dxa)); }
  .lk-tt-content .ProseMirror h1 { font-size: 1.5em; }
  .lk-tt-content .ProseMirror h2 { font-size: 1.3em; }
  .lk-tt-content .ProseMirror h3 { font-size: 1.12em; }
  .lk-tt-content .ProseMirror h1, .lk-tt-content .ProseMirror h2, .lk-tt-content .ProseMirror h3 { font-weight: 700; margin-top: var(--s-sebelum, 0); margin-bottom: var(--s-sesudah, var(--lk-after, 8px)); line-height: var(--s-baris, var(--lk-lh, 1.5)); }
  /* Daftar digambar sendiri: nomor native selalu menempel di teks, padahal di Word nomor rata kiri di
     kiri + pertama lalu teks di kiri. --lk-abs = posisi teks dari tepi kolom, supaya butir bersarang
     (margin-nya relatif terhadap induk) tetap memakai angka mutlak seperti w:ind. */
  .lk-tt-content .ProseMirror ol, .lk-tt-content .ProseMirror ul { padding: 0; margin: 0; }
  .lk-tt-content .ProseMirror ol > li, .lk-tt-content .ProseMirror ul > li { --lk-gantung: ${BUTIR_GANTUNG_DXA}; }
  .lk-tt-content .ProseMirror > ol, .lk-tt-content .ProseMirror > ul { --lk-induk: 0; }
  .lk-tt-content .ProseMirror li > ol, .lk-tt-content .ProseMirror li > ul { --lk-induk: var(--lk-abs); }
  .lk-tt-content .ProseMirror li { list-style: none !important; position: relative; --s-sebelum: initial; --s-sesudah: initial; --s-baris: initial; line-height: var(--s-baris, var(--lk-lh, 1.5)); --i-kiri: initial; --i-kanan: initial; --i-pertama: initial; --lk-abs: var(--i-kiri, calc(var(--lk-induk, 0) + ${BUTIR_KIRI_DXA})); margin-left: calc((var(--lk-abs) - var(--lk-induk, 0)) * var(--lk-dxa)); margin-right: calc(var(--i-kanan, 0) * var(--lk-dxa)); }
  /* Paragraf kedua dst. butir: tanpa nomor, rata dengan teks butir kecuali punya indent & spasi sendiri (angka mutlak dari tepi kolom). */
  .lk-tt-content .ProseMirror li > p:not(:first-child) { --s-sebelum: initial; --s-sesudah: initial; --s-baris: initial; --i-kiri: initial; --i-kanan: initial; --i-pertama: initial; margin-left: calc((var(--i-kiri, var(--lk-abs)) - var(--lk-abs)) * var(--lk-dxa)); margin-right: calc(var(--i-kanan, 0) * var(--lk-dxa)); text-indent: calc(var(--i-pertama, 0) * var(--lk-dxa)); }
  /* Float, bukan absolute: nomor yang lebih lebar dari gantungnya mendorong baris pertama seperti tab Word,
     tidak menimpa teks. Baris berikutnya tetap di kiri. */
  .lk-tt-content .ProseMirror ol > li::before, .lk-tt-content .ProseMirror ul > li::before { float: left; box-sizing: border-box; margin-left: calc(var(--i-pertama, calc(var(--lk-gantung) * -1)) * var(--lk-dxa)); min-width: calc(var(--i-pertama, calc(var(--lk-gantung) * -1)) * -1 * var(--lk-dxa)); padding-right: .25em; user-select: none; }
  .lk-tt-content .ProseMirror ol > li::before { content: counter(list-item) "."; }
  .lk-tt-content .ProseMirror ul > li::before { content: "•"; }
  ${cssGayaDaftar('.lk-tt-content .ProseMirror')}
  ${(Object.keys(STABILO) as KodeStabilo[]).map(k => `.lk-tt-content .ProseMirror mark[data-stabilo="${k}"] { background: ${STABILO[k].css}; color: #0F0F12; }`).join('\n  ')}
  .lk-tt-content .ProseMirror p.is-editor-empty:first-child::before { content: 'Tulis narasi…'; color: #5E8BBE; float: left; height: 0; pointer-events: none; }
  .lk-tt-save { margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .lk-tt-teks { width: auto; gap: 4px; padding: 0 7px; font-size: 11.5px; font-weight: 600; }
  .lk-tt-content .ProseMirror span[data-angka] { background: rgba(124,92,252,0.16); border: 1px solid rgba(124,92,252,0.45); border-radius: 4px; padding: 0 3px; white-space: nowrap; cursor: default; }
  .lk-tt-content .ProseMirror span[data-angka].ProseMirror-selectednode { outline: 2px solid #7C5CFC; outline-offset: 1px; }
  .lk-tt-content .ProseMirror span[data-rujuk] { background: rgba(55,138,221,0.16); border: 1px solid rgba(55,138,221,0.5); border-radius: 4px; padding: 0 3px; white-space: nowrap; cursor: default; }
  .lk-tt-content .ProseMirror span[data-rujuk].rujuk-putus { background: rgba(226,75,74,0.14); border-color: #E24B4A; color: #FCA5A5; }
  .lk-tt-content .ProseMirror span[data-rujuk].ProseMirror-selectednode { outline: 2px solid #378ADD; outline-offset: 1px; }
  .lk-tt-rujuk { position: relative; display: inline-flex; }
  .lk-tt-rujuk-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; width: 320px; max-width: 80vw; max-height: 280px; overflow-y: auto; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 6px; box-shadow: 0 14px 34px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 1px; }
  .lk-tt-rujuk-menu button { display: flex; gap: 8px; align-items: baseline; text-align: left; width: 100%; background: none; border: none; color: #D6E6F7; padding: 7px 9px; border-radius: 6px; cursor: pointer; font-size: 12.5px; }
  .lk-tt-rujuk-menu button:hover { background: rgba(124,92,252,0.20); color: #fff; }
  .lk-tt-rujuk-menu button b { white-space: nowrap; color: #85B7EB; }
  .lk-tt-rujuk-menu button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lk-tt-rujuk-kosong { padding: 8px 10px; font-size: 12px; color: #85B7EB; }
  [data-theme="light"] .lk-tt-rujuk-menu { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tt-rujuk-menu button { color: #374151; }
  [data-theme="light"] .lk-tt-rujuk-menu button:hover { background: rgba(124,92,252,0.12); color: #111827; }
  [data-theme="light"] .lk-tt-rujuk-menu button b { color: #1E5FA5; }
  [data-theme="light"] .lk-tt-rujuk-kosong { color: #6B7280; }
  [data-theme="light"] .lk-tt-content .ProseMirror span[data-rujuk].rujuk-putus { color: #E24B4A; }

  [data-theme="light"] .lk-tt-bar { background: #F3F4F6; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tt-btn { color: #4B5563; }
  [data-theme="light"] .lk-tt-btn:hover { background: rgba(0,0,0,.06); color: #0F0F12; }
  [data-theme="light"] .lk-tt-sep { background: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tt-content .ProseMirror { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-tt-content .ProseMirror p.is-editor-empty:first-child::before { color: #6B7280; }
`;
