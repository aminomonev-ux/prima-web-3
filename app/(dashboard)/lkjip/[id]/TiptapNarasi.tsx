'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading2, Heading3, Save, Hash, RefreshCw, BookmarkPlus } from 'lucide-react';
import type { ObjekRujukan } from '@/lib/lkjip/numbering';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { angkaDiHtml, bandingAngka, idAngkaBaru, kalimatAngka, kunciTarikan, resepTerpakai, type ResepAngka } from '@/lib/lkjip/angka';
import type { HasilTarik } from '@/lib/lkjip/tautan';

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

// Penomoran huruf (a, b, c) pada orderedList → <ol type="a">. Tanpa dependency baru.
const OrderedListType = Extension.create({
  name: 'orderedListType',
  addGlobalAttributes() {
    return [{
      types: ['orderedList'],
      attributes: {
        listType: {
          default: null,
          parseHTML: (el: HTMLElement) => (el.getAttribute('type') === 'a' || el.style.listStyleType === 'lower-alpha') ? 'a' : null,
          renderHTML: (attrs: Record<string, unknown>) => (attrs.listType === 'a' ? { type: 'a', style: 'list-style-type: lower-alpha' } : {}),
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

interface Props {
  initialHtml: string;
  initialAngka?: Record<string, ResepAngka>;
  tahunDokumen: number;
  readOnly: boolean;
  /** Tabel/Gambar/Grafik yang bisa dirujuk — nomornya SEKARANG (`daftarObjekRujukan`). */
  objek?: ObjekRujukan[];
  onSave: (html: string, angka: Record<string, ResepAngka>) => void;
}

export default function TiptapNarasi({ initialHtml, initialAngka, tahunDokumen, readOnly, objek, onSave }: Props) {
  const [dirty, setDirty] = useState(false);
  const [pilihRujuk, setPilihRujuk] = useState(false);
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
    extensions: [StarterKit.configure({ link: false, trailingNode: false }), TextAlign, TextStyle, OrderedListType, AngkaTaut, RujukTaut],
    content: initialHtml || '<p></p>',
    editable: !readOnly,
    immediatelyRender: false,
    // v3 berhenti me-render ulang tiap transaksi; tombol bilah alat membaca `isActive` saat
    // render, jadi tanpa ini "Tebal"/"Rata" tidak ikut menyala saat kursor pindah.
    shouldRerenderOnTransaction: true,
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

  const btn = (active: boolean, onClick: () => void, title: string, Icon: typeof Bold) => (
    <button type="button" className={`lk-tt-btn${active ? ' on' : ''}`} data-tooltip={title} data-tooltip-pos="below" aria-label={title} onMouseDown={e => { e.preventDefault(); onClick(); }}>
      <Icon size={14} />
    </button>
  );

  return (
    <div className="lk-tt">
      <style>{TT_CSS}</style>
      {!readOnly && (
        <div className="lk-tt-bar">
          {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Tebal', Bold)}
          {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Miring', Italic)}
          {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Garis bawah', UnderlineIcon)}
          {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Coret', Strikethrough)}
          <span className="lk-tt-sep" />
          {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet', List)}
          {btn(editor.isActive('orderedList') && editor.getAttributes('orderedList').listType !== 'a', () => editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { listType: null }).run(), 'Penomoran 1, 2, 3', ListOrdered)}
          <button type="button" className={`lk-tt-btn lk-tt-abc${editor.isActive('orderedList') && editor.getAttributes('orderedList').listType === 'a' ? ' on' : ''}`} data-tooltip="Penomoran a, b, c" data-tooltip-pos="below" aria-label="Penomoran a, b, c"
            onMouseDown={e => { e.preventDefault();
              if (editor.isActive('orderedList') && editor.getAttributes('orderedList').listType === 'a') { editor.chain().focus().toggleOrderedList().run(); return; }
              const c = editor.chain().focus();
              if (!editor.isActive('orderedList')) c.toggleOrderedList();
              c.updateAttributes('orderedList', { listType: 'a' }).run();
            }}>a,b</button>
          <span className="lk-tt-sep" />
          {btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().updateAttributes('paragraph', { textAlign: 'left' }).run(), 'Rata kiri', AlignLeft)}
          {btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().updateAttributes('paragraph', { textAlign: 'center' }).run(), 'Rata tengah', AlignCenter)}
          {btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().updateAttributes('paragraph', { textAlign: 'right' }).run(), 'Rata kanan', AlignRight)}
          {btn(editor.isActive({ textAlign: 'justify' }), () => editor.chain().focus().updateAttributes('paragraph', { textAlign: 'justify' }).run(), 'Rata kiri-kanan', AlignJustify)}
          <span className="lk-tt-sep" />
          {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Sub-judul', Heading2)}
          {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Sub-sub-judul', Heading3)}
          <span className="lk-tt-sep" />
          {/* K1: input & select tak bisa menggambar ::after — tooltip dipasang di pembungkus. */}
          <span className="lk-tt-tip" data-tooltip="Warna teks" data-tooltip-pos="below">
            <input type="color" className="lk-tt-color" aria-label="Warna teks" defaultValue="#e6f1fb"
              onInput={(e) => editor.chain().focus().setMark('textStyle', { color: (e.target as HTMLInputElement).value }).run()} />
          </span>
          <span className="lk-tt-tip" data-tooltip="Ukuran teks" data-tooltip-pos="below"><select className="lk-tt-size" aria-label="Ukuran teks" value=""
            onChange={(e) => { const v = e.target.value; if (!v) return; if (v === 'reset') editor.chain().focus().unsetMark('textStyle').run(); else editor.chain().focus().setMark('textStyle', { fontSize: v }).run(); e.currentTarget.value = ''; }}>
            <option value="">A±</option>
            {['10px', '12px', '14px', '16px', '18px', '24px'].map(s => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
            <option value="reset">Reset</option>
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
      <EditorContent editor={editor} className="lk-tt-content" />
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
    </div>
  );
}

const TT_CSS = `
  .lk-tt-loading { color: #85B7EB; font-size: 12.5px; padding: 10px; }
  .lk-tt-tip { display: inline-flex; }
  .lk-tt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 4px; background: #020F1C; border: 1px solid #0C447C; border-bottom: none; border-radius: 6px 6px 0 0; }
  .lk-tt-btn { background: none; border: none; color: #B5D4F4; width: 28px; height: 28px; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .lk-tt-btn:hover { background: rgba(255,255,255,0.08); color: #E6F1FB; }
  .lk-tt-btn.on { background: rgba(124,92,252,0.22); color: #C9BCFF; }
  .lk-tt-abc { font-size: 11.5px; font-weight: 700; font-style: italic; width: auto; padding: 0 6px; }
  .lk-tt-sep { width: 1px; height: 18px; background: #0C447C; margin: 0 4px; }
  .lk-tt-color { width: 26px; height: 26px; padding: 1px; border: 1px solid #0C447C; border-radius: 5px; background: none; cursor: pointer; }
  .lk-tt-size { height: 26px; background: #020F1C; color: #B5D4F4; border: 1px solid #0C447C; border-radius: 5px; font-size: 11px; cursor: pointer; }
  .lk-tt-size option { background: #020F1C; color: #E6F1FB; }
  [data-theme="light"] .lk-tt-size { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tt-size option { background: #FFFFFF; color: #374151; }
  [data-theme="light"] .lk-tt-color { border-color: rgba(0,0,0,.12); }
  .lk-tt-content .ProseMirror { background: #020F1C; border: 1px solid #0C447C; border-radius: 0 0 6px 6px; color: #E6F1FB; padding: 12px 14px; min-height: 120px; font-size: 13.5px; line-height: 1.6; text-align: justify; outline: none; }
  .lk-tt-content .ProseMirror:focus { border-color: #185FA5; }
  .lk-tt-content .ProseMirror p { margin: 0 0 8px; }
  .lk-tt-content .ProseMirror h1 { font-size: 1.5em; font-weight: 700; margin: 8px 0 6px; }
  .lk-tt-content .ProseMirror h2 { font-size: 1.3em; font-weight: 700; margin: 8px 0 6px; }
  .lk-tt-content .ProseMirror h3 { font-size: 1.12em; font-weight: 700; margin: 6px 0 5px; }
  .lk-tt-content .ProseMirror ul { list-style: disc outside; padding-left: 24px; margin: 0 0 8px; }
  .lk-tt-content .ProseMirror ol { list-style: decimal outside; padding-left: 24px; margin: 0 0 8px; }
  .lk-tt-content .ProseMirror ol[type="a"] { list-style-type: lower-alpha; }
  .lk-tt-content .ProseMirror li { margin: 2px 0; }
  .lk-tt-content .ProseMirror li > p { margin: 0; }
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
