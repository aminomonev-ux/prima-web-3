'use client';
// Menu aksi popover (portal) — anti-clip scroll, auto-flip. Dipakai menu bagian di pohon dokumen
// dan menu klik-kanan tabel (konsep tabel-excel §5.10). Gaya `.lk-rowmenu*` ada di ED_CSS editor.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
};

export function RowMenu({ x, y, items, onClose, onPilih, lebar = 216 }: { x: number; y: number; items: RowMenuItem[]; onClose: () => void; onPilih?: (kunci: string) => void; lebar?: number }) {
  const ITEM = 33, PAD = 7;
  // Tinggi diukur sesudah tergambar: garis pemisah & butir bahaya menambah jarak, jadi perkiraan 33 px/butir
  // meleset — menu tabel 16 butir ternyata 584 px (bukan 542) dan butir terakhirnya jatuh di bawah layar.
  const kotak = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(items.length * ITEM + PAD * 2);
  useLayoutEffect(() => { const t = kotak.current?.offsetHeight; if (t && t !== h) setH(t); }, [items.length, h]);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = x + lebar > vw - 8 ? Math.max(8, x - lebar - 32) : x;       // flip ke kiri kalau mentok kanan
  const top = y + h > vh - 8 ? Math.max(8, vh - h - 8) : y;               // naik kalau mentok bawah
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return createPortal(
    <div className="lk-rowmenu-bg" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div ref={kotak} className="lk-rowmenu" role="menu" style={{ left, top, width: lebar, maxHeight: vh - 16, overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        {items.map((it, i) => (
          <button key={i} type="button" role="menuitem"
            className={`lk-rowmenu-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}${it.pisah ? ' pisah' : ''}`}
            aria-disabled={it.disabled}
            data-tooltip={it.disabled ? it.alasan : undefined} data-tooltip-pos="right"
            onClick={() => { if (it.disabled) return; if (it.onClick) it.onClick(); else if (it.kunci) onPilih?.(it.kunci); }}>
            <span className="lk-rowmenu-ic">{it.icon}</span>
            <span className="lk-rowmenu-lb">{it.label}</span>
            {it.pintasan && <span className="lk-rowmenu-kb">{it.pintasan}</span>}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
