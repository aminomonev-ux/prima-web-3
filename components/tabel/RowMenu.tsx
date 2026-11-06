'use client';
// Menu aksi popover (portal) — anti-clip scroll, auto-flip. Dipakai menu bagian di pohon dokumen, menu klik-kanan
// tabel (konsep tabel-excel §5.10), dan menu klik-kanan narasi. Gaya `.lk-rowmenu*` ada di ./tabel-css.ts.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

export type RowMenuItem = {
  icon: React.ReactNode; label: string;
  /** Langsung (menu pohon dokumen), ATAU lewat `kunci` + `onPilih` milik menu — menu tabel memakai yang
   *  kedua: aksinya memegang ref kisi, dan fungsi semacam itu tak boleh tersimpan di larik yang dibuat saat render. */
  onClick?: () => void; kunci?: string;
  disabled?: boolean; danger?: boolean; alasan?: string;
  /** Garis pemisah di atas butir ini. */
  pisah?: boolean;
  /** Pintasan papan ketik di kanan label. */
  pintasan?: string;
  /** Isi sub-menu: terbuka saat butir disorot atau diklik. */
  sub?: React.ReactNode;
};

const TEPI = 8;

export function RowMenu({ x, y, items, onClose, onPilih, lebar = 216 }: { x: number; y: number; items: RowMenuItem[]; onClose: () => void; onPilih?: (kunci: string) => void; lebar?: number }) {
  const ITEM = 33, PAD = 7;
  // Tinggi diukur sesudah tergambar: garis pemisah & butir bahaya menambah jarak, jadi perkiraan 33 px/butir
  // meleset — menu tabel 16 butir ternyata 584 px (bukan 542) dan butir terakhirnya jatuh di bawah layar.
  const kotak = useRef<HTMLDivElement | null>(null);
  const kotakSub = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(items.length * ITEM + PAD * 2);
  const [sub, setSub] = useState<{ i: number; top: number; left: number } | null>(null);
  useLayoutEffect(() => { const t = kotak.current?.offsetHeight; if (t && t !== h) setH(t); }, [items.length, h]);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = x + lebar > vw - TEPI ? Math.max(TEPI, x - lebar - 32) : x;       // flip ke kiri kalau mentok kanan
  const top = y + h > vh - TEPI ? Math.max(TEPI, vh - h - TEPI) : y;             // naik kalau mentok bawah
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  // Sub-menu diletakkan sesudah terukur: di kanan menu, di kiri kalau tak muat, menimpa menu kalau layar sempit.
  const iSub = sub?.i ?? null;
  useLayoutEffect(() => {
    const el = kotakSub.current;
    if (!el || iSub === null) return;
    const w = el.offsetWidth, tinggi = el.offsetHeight;
    setSub(s => {
      if (!s) return s;
      const kanan = left + lebar + 4;
      const nextLeft = kanan + w <= vw - TEPI ? kanan : left - w - 4 >= TEPI ? left - w - 4 : Math.max(TEPI, vw - w - TEPI);
      const nextTop = Math.max(TEPI, Math.min(s.top, vh - tinggi - TEPI));
      return nextLeft === s.left && nextTop === s.top ? s : { ...s, left: nextLeft, top: nextTop };
    });
  }, [iSub, left, lebar, vw, vh]);
  const bukaSub = (i: number, el: HTMLElement) => setSub(s => (s?.i === i ? s : { i, top: el.getBoundingClientRect().top - PAD, left: left + lebar + 4 }));
  const isiSub = sub ? items[sub.i]?.sub : null;
  return createPortal(
    <div className="lk-rowmenu-bg" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div ref={kotak} className="lk-rowmenu" role="menu" style={{ left, top, width: lebar, maxHeight: vh - 16, overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        {items.map((it, i) => (
          <button key={i} type="button" role="menuitem"
            className={`lk-rowmenu-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}${it.pisah ? ' pisah' : ''}${sub?.i === i ? ' terbuka' : ''}`}
            aria-disabled={it.disabled} aria-haspopup={it.sub ? 'menu' : undefined} aria-expanded={it.sub ? sub?.i === i : undefined}
            data-tooltip={it.disabled ? it.alasan : undefined} data-tooltip-pos="right"
            onMouseEnter={e => { if (it.sub && !it.disabled) bukaSub(i, e.currentTarget); else setSub(null); }}
            onClick={e => { if (it.disabled) return; if (it.sub) { bukaSub(i, e.currentTarget); return; } if (it.onClick) it.onClick(); else if (it.kunci) onPilih?.(it.kunci); }}>
            <span className="lk-rowmenu-ic">{it.icon}</span>
            <span className="lk-rowmenu-lb">{it.label}</span>
            {it.pintasan && <span className="lk-rowmenu-kb">{it.pintasan}</span>}
            {it.sub && <span className="lk-rowmenu-ic"><ChevronRight size={13} /></span>}
          </button>
        ))}
      </div>
      {sub && isiSub && (
        <div ref={kotakSub} className="lk-rowmenu lk-rowmenu-sub" role="menu" style={{ left: sub.left, top: sub.top }} onMouseDown={e => e.stopPropagation()}>
          {isiSub}
        </div>
      )}
    </div>,
    document.body,
  );
}
