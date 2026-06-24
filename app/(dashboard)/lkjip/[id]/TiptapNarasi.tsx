'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading2, Heading3, Save } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';

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

interface Props {
  initialHtml: string;
  readOnly: boolean;
  onSave: (html: string) => void;
}

export default function TiptapNarasi({ initialHtml, readOnly, onSave }: Props) {
  const [dirty, setDirty] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit, Underline, TextAlign, TextStyle, OrderedListType],
    content: initialHtml || '<p></p>',
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: () => setDirty(true),
  });

  if (!editor) return <div className="lk-tt-loading">Memuat editor…</div>;

  const btn = (active: boolean, onClick: () => void, title: string, Icon: typeof Bold) => (
    <button type="button" className={`lk-tt-btn${active ? ' on' : ''}`} title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}>
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
          <button type="button" className={`lk-tt-btn lk-tt-abc${editor.isActive('orderedList') && editor.getAttributes('orderedList').listType === 'a' ? ' on' : ''}`} title="Penomoran a, b, c"
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
          <input type="color" className="lk-tt-color" title="Warna teks" defaultValue="#e6f1fb"
            onInput={(e) => editor.chain().focus().setMark('textStyle', { color: (e.target as HTMLInputElement).value }).run()} />
          <select className="lk-tt-size" title="Ukuran teks" value=""
            onChange={(e) => { const v = e.target.value; if (!v) return; if (v === 'reset') editor.chain().focus().unsetMark('textStyle').run(); else editor.chain().focus().setMark('textStyle', { fontSize: v }).run(); e.currentTarget.value = ''; }}>
            <option value="">A±</option>
            {['10px', '12px', '14px', '16px', '18px', '24px'].map(s => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
            <option value="reset">Reset</option>
          </select>
        </div>
      )}
      <EditorContent editor={editor} className="lk-tt-content" />
      {!readOnly && dirty && (
        <div className="lk-tt-save">
          <PrimaButton variant="primary" size="sm" iconLeft={<Save size={14} />} onClick={() => { onSave(editor.getHTML()); setDirty(false); }}>Simpan</PrimaButton>
        </div>
      )}
    </div>
  );
}

const TT_CSS = `
  .lk-tt-loading { color: #85B7EB; font-size: 12.5px; padding: 10px; }
  .lk-tt-bar { display: flex; align-items: center; gap: 2px; padding: 4px; background: #020F1C; border: 1px solid #0C447C; border-bottom: none; border-radius: 6px 6px 0 0; }
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
  .lk-tt-save { margin-top: 10px; display: flex; justify-content: flex-end; }

  [data-theme="light"] .lk-tt-bar { background: #F3F4F6; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tt-btn { color: #4B5563; }
  [data-theme="light"] .lk-tt-btn:hover { background: rgba(0,0,0,.06); color: #0F0F12; }
  [data-theme="light"] .lk-tt-sep { background: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tt-content .ProseMirror { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-tt-content .ProseMirror p.is-editor-empty:first-child::before { color: #9CA3AF; }
`;
