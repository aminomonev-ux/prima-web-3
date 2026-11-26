'use client';
// Menu ⋯ per baris BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §2 butir 2): aksi selain langkah berikutnya.
// Portal + posisi fixed — tabel hidup di wadah overflow:auto yang akan memotong dropdown biasa. Butir yang belum
// bisa dipakai tetap tampil dengan sebabnya (tooltip portal `data-tooltip`, bukan `title`).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/** Aksi lewat `kunci` + satu `onPilih` milik pemanggil: fungsi yang memegang ref (muat ulang) tidak boleh
 *  tersimpan di larik yang dibuat saat render (React compiler, pola components/tabel/RowMenu.tsx). */
export type ButirMenu = { kunci: string; label: string; icon?: ReactNode; bahaya?: boolean; mati?: string | null; pisah?: boolean };
type Warna = { card: string; text: string; sub: string; border: string };

const LEBAR = 236, TEPI = 8;

export default function MenuBaris({ butir, onPilih, c, label = 'Aksi lain' }: { butir: ButirMenu[]; onPilih: (kunci: string) => void; c: Warna; label?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const tombol = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const tutup = () => setPos(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup(); };
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', tutup, true);
    window.addEventListener('resize', tutup);
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('scroll', tutup, true); window.removeEventListener('resize', tutup); };
  }, [pos]);
  const buka = () => {
    const r = tombol.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(TEPI, Math.min(r.right - LEBAR, window.innerWidth - LEBAR - TEPI));
    const tinggi = butir.length * 36 + 12;
    const y = r.bottom + 4 + tinggi > window.innerHeight - TEPI ? Math.max(TEPI, r.top - 4 - tinggi) : r.bottom + 4;
    setPos({ x, y });
  };
  if (butir.length === 0) return null;
  return (
    <>
      <button ref={tombol} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={e => { e.stopPropagation(); if (pos) setPos(null); else buka(); }}
        style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <MoreHorizontal size={15} />
      </button>
      {pos && createPortal(
        <div onMouseDown={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200 }}>
          <div role="menu" onMouseDown={e => e.stopPropagation()}
            style={{ position: 'fixed', left: pos.x, top: pos.y, width: LEBAR, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', padding: 6, borderRadius: 10,
              background: c.card, border: `1px solid ${c.border}`, boxShadow: '0 12px 36px rgba(0,0,0,.35)' }}>
            {butir.map(b => (
              <button key={b.kunci} type="button" role="menuitem" aria-disabled={!!b.mati} data-tooltip={b.mati || undefined} data-tooltip-pos="left"
                onClick={e => { e.stopPropagation(); if (b.mati) return; setPos(null); onPilih(b.kunci); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', fontSize: 12.5, textAlign: 'left', borderWidth: '1px 0 0', borderStyle: 'solid', borderRadius: 6,
                  borderColor: b.pisah ? c.border : 'transparent', marginTop: b.pisah ? 4 : 0, background: 'transparent',
                  color: b.mati ? c.sub : b.bahaya ? '#E24B4A' : c.text, opacity: b.mati ? .6 : 1, cursor: b.mati ? 'not-allowed' : 'pointer' }}>
                {b.icon && <span style={{ display: 'inline-flex', width: 16, justifyContent: 'center', flexShrink: 0 }}>{b.icon}</span>}
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
