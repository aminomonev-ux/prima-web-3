'use client';
// Combobox cari-atau-ketik untuk form BBA (docs/konsep/bba/CONCEPT-bba-penawaran-matriks.md §4): pilihan dari Master/daftar
// yang bisa dicari, ATAU teks yang diketik sendiri. Hanya mengisi form — yang menulis tetap tombol Simpan pemiliknya (L78).
// Daftar dibuka lewat portal `position: fixed` supaya tidak terpotong `overflow: auto` badan modal.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

export type OpsiCari = { kunci: string; label: string; sub?: string | null; cari?: string };

export type WarnaCari = { card: string; border: string; sub: string; text: string };

type Props = {
  c: WarnaCari;
  inp: React.CSSProperties;
  /** Teks di kotak isian (nilai yang akan tersimpan bila diketik sendiri). */
  teks: string;
  onTeks: (t: string) => void;
  opsi: readonly OpsiCari[];
  onPilih: (o: OpsiCari) => void;
  placeholder?: string;
  /** Judul daftar ("Rekanan yang pernah dicatat"). */
  judul?: string;
  /** Kalimat baris "pakai yang diketik" — null = tidak ditawarkan. */
  manual?: ((t: string) => string) | null;
  ariaLabel?: string;
  disabled?: boolean;
  /** Batas baris daftar. */
  maks?: number;
  onBlur?: () => void;
};

type Posisi = { left: number; top: number; width: number; atas: boolean };
/** Di bawah kotak; di atasnya bila ruang bawah sempit. */
function posisiDaftar(el: HTMLElement | null): Posisi | null {
  const r = el?.getBoundingClientRect();
  if (!r) return null;
  const atas = window.innerHeight - r.bottom < 260 && r.top > 260;
  return { left: r.left, top: atas ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 300), atas };
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function CariPilih({ c, inp, teks, onTeks, opsi, onPilih, placeholder, judul, manual, ariaLabel, disabled, maks = 60, onBlur }: Props) {
  const [buka, setBuka] = useState(false);
  const [sorot, setSorot] = useState(0);
  const [pos, setPos] = useState<Posisi | null>(null);
  const kotak = useRef<HTMLInputElement>(null);
  const id = useId();

  const cocok = useMemo(() => {
    const q = norm(teks);
    const kata = q ? q.split(' ') : [];
    return opsi.filter(o => { const h = norm(`${o.label} ${o.sub ?? ''} ${o.cari ?? ''}`); return kata.every(k => h.includes(k)); }).slice(0, maks);
  }, [teks, opsi, maks]);
  const persis = opsi.some(o => norm(o.label) === norm(teks));
  const tawarManual = !!manual && !!teks.trim() && !persis;
  const jumlah = cocok.length + (tawarManual ? 1 : 0);

  const bukaDaftar = () => { setPos(posisiDaftar(kotak.current)); setBuka(true); };
  useEffect(() => {
    if (!buka) return;
    const ukur = () => setPos(posisiDaftar(kotak.current));
    window.addEventListener('scroll', ukur, true);
    window.addEventListener('resize', ukur);
    return () => { window.removeEventListener('scroll', ukur, true); window.removeEventListener('resize', ukur); };
  }, [buka]);
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (kotak.current?.contains(t) || t.closest?.(`[data-cari-pilih="${id}"]`))) return;
      setBuka(false);
    };
    document.addEventListener('mousedown', tutup);
    return () => document.removeEventListener('mousedown', tutup);
  }, [buka, id]);

  const pilih = (i: number) => {
    if (i < cocok.length) onPilih(cocok[i]);
    setBuka(false);
  };

  return (
    <>
      <span style={{ position: 'relative', display: 'block' }}>
        <input ref={kotak} value={teks} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} role="combobox" aria-expanded={buka} aria-controls={id}
          autoComplete="off" style={{ ...inp, paddingRight: 26 }}
          onFocus={() => { bukaDaftar(); setSorot(0); }}
          onBlur={onBlur}
          onChange={e => { onTeks(e.target.value); bukaDaftar(); setSorot(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); bukaDaftar(); setSorot(s => Math.min(s + 1, Math.max(jumlah - 1, 0))); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSorot(s => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter' && buka && jumlah) { e.preventDefault(); pilih(sorot); }
            else if (e.key === 'Escape' && buka) { e.stopPropagation(); setBuka(false); }
            else if (e.key === 'Tab') setBuka(false);
          }} />
        <Search size={13} color={c.sub} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </span>
      {buka && pos && !disabled && (cocok.length > 0 || tawarManual) && createPortal(
        <div id={id} data-cari-pilih={id} role="listbox"
          style={{ position: 'fixed', left: pos.left, top: pos.atas ? undefined : pos.top, bottom: pos.atas ? window.innerHeight - pos.top : undefined, width: pos.width, maxHeight: 260, overflowY: 'auto',
            zIndex: 100001, background: c.card, border: '1px solid #7C5CFC', borderRadius: 8, boxShadow: '0 14px 34px rgba(0,0,0,.45)', color: c.text }}>
          {judul && <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: c.sub, padding: '6px 10px', borderBottom: `1px solid ${c.border}` }}>{judul}</div>}
          {cocok.map((o, i) => (
            <div key={o.kunci} role="option" aria-selected={i === sorot} onMouseDown={e => { e.preventDefault(); pilih(i); }} onMouseEnter={() => setSorot(i)}
              style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', background: i === sorot ? 'rgba(124,92,252,.2)' : 'transparent', borderBottom: `1px solid ${c.border}` }}>
              {o.label}
              {o.sub && <div style={{ fontSize: 10.8, color: c.sub, marginTop: 2 }}>{o.sub}</div>}
            </div>
          ))}
          {tawarManual && (
            <div role="option" aria-selected={sorot === cocok.length} onMouseDown={e => { e.preventDefault(); setBuka(false); }} onMouseEnter={() => setSorot(cocok.length)}
              style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: '#7C5CFC', background: sorot === cocok.length ? 'rgba(124,92,252,.2)' : 'transparent' }}>
              {manual!(teks.trim())}
            </div>
          )}
        </div>, document.body)}
    </>
  );
}
