'use client';
// FloatingDock — bar navigasi mengambang bawah-tengah (konsep B).
// Dua grup: nav antar-modul (kiri) + aksi cepat (kanan), dipisah separator.
// Native button OK (skip-rule PrimaButton: shell navigation). Token ikut DESIGN-SYSTEM.
// `limelight` (opt-in) = lampu sorot amber menyorot item nav aktif (current:true).

import { useRef, useState, useLayoutEffect, type ReactNode } from 'react';

export interface DockItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  current?: boolean;
}

interface Props {
  nav: DockItem[];
  actions?: DockItem[];
  isLight: boolean;
  limelight?: boolean;
}

export default function FloatingDock({ nav, actions = [], isLight, limelight = false }: Props) {
  const c = {
    bg: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C',
    elev: isLight ? '#EEF1F5' : '#0A356A',
    sub: isLight ? '#6B7280' : '#85B7EB',
    hover: isLight ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)',
    actBg: isLight ? 'rgba(124,92,252,.12)' : 'rgba(124,92,252,.18)',
    actFg: isLight ? '#7C5CFC' : '#b9a8ff',
    actBorder: 'rgba(124,92,252,.4)',
  };

  const navRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const [beamReady, setBeamReady] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activeIndex = nav.findIndex(it => it.current);
  const targetIndex = hoverIndex != null ? hoverIndex : activeIndex;

  useLayoutEffect(() => {
    if (!limelight) return;
    const beam = beamRef.current;
    if (!beam) return;
    const target = targetIndex >= 0 ? navRefs.current[targetIndex] : null;
    if (target) {
      beam.style.left = `${target.offsetLeft + target.offsetWidth / 2 - beam.offsetWidth / 2}px`;
      if (!beamReady) setTimeout(() => setBeamReady(true), 50);
    } else {
      beam.style.left = '-999px';
    }
  }, [targetIndex, limelight, beamReady]);

  const renderItem = (it: DockItem, kind: 'nav' | 'action', idx: number) => (
    <button key={it.label} onClick={it.onClick} data-tooltip={it.label} data-tooltip-pos="above"
      ref={el => { navRefs.current[idx] = el; }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 54, padding: '6px 0', borderRadius: 12, cursor: 'pointer', border: 'none', background: 'none', transition: 'transform .15s, background .15s', position: 'relative', zIndex: 2 }}
      onMouseEnter={e => { e.currentTarget.style.background = c.hover; e.currentTarget.style.transform = 'translateY(-3px)'; setHoverIndex(idx); }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'none'; setHoverIndex(null); }}>
      <span style={{
        width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...(it.current
          ? { background: 'linear-gradient(135deg,#633806,#EF9F27)', color: '#020F1C' }
          : kind === 'action'
            ? { background: c.actBg, color: c.actFg, border: `1px solid ${c.actBorder}` }
            : { background: c.elev, color: c.sub }),
      }}>{it.icon}</span>
      <small style={{ fontSize: 9, color: c.sub, fontWeight: 600 }}>{it.label}</small>
    </button>
  );

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 18, boxShadow: isLight ? '0 16px 44px rgba(0,0,0,.18)' : '0 16px 44px rgba(0,0,0,.55)', backdropFilter: 'blur(16px)', zIndex: 400 }}>
      {limelight && (
        <div ref={beamRef} aria-hidden="true"
          style={{ position: 'absolute', top: 0, left: -999, width: 34, height: 4, borderRadius: 99, background: isLight ? 'linear-gradient(90deg,#6D28D9,#7C5CFC)' : 'linear-gradient(90deg,#EF9F27,#FBBF24)', boxShadow: isLight ? '0 0 10px 2px rgba(124,92,252,.5)' : '0 0 12px 2px rgba(239,159,39,.65)', pointerEvents: 'none', zIndex: 1, transition: beamReady ? 'left .4s cubic-bezier(.4,0,.2,1)' : undefined }}>
          <div style={{ position: 'absolute', left: '-45%', top: 4, width: '190%', height: 54, clipPath: 'polygon(8% 100%, 30% 0, 70% 0, 92% 100%)', background: isLight ? 'linear-gradient(to bottom, rgba(124,92,252,.5), rgba(124,92,252,0))' : 'linear-gradient(to bottom, rgba(251,191,39,.28), rgba(251,191,39,0))', pointerEvents: 'none' }} />
        </div>
      )}
      {nav.map((it, i) => renderItem(it, 'nav', i))}
      {actions.length > 0 && <div style={{ width: 1, height: 34, background: c.border, margin: '0 4px', position: 'relative', zIndex: 2 }} />}
      {actions.map((it, j) => renderItem(it, 'action', nav.length + j))}
    </div>
  );
}
