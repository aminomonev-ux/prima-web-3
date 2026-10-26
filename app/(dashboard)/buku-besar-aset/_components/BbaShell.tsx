'use client';
// Kerangka halaman BBA baru (Buku Aset, Cetak): kepala + bilah bagian + spanduk + dock dari daftar
// yang sama (BbaNav). Warna sebaris mengikuti halaman Rencana & Master yang sudah ada.
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import SpandukBeku from '@/components/ui/SpandukBeku';
import SpandukLihat from '@/components/ui/SpandukLihat';
import type { InfoBeku } from '@/lib/security/beku';
import { LABEL_MENU_BBA, type MenuBba } from '@/lib/bba/peran';
import BbaNav, { navDockBba, type PetaIzinLayar } from './BbaNav';

export function warnaBba(isLight: boolean) {
  return {
    canvas: isLight ? '#F5F5F7' : '#020F1C', card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB', sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C', rowOdd: isLight ? '#F3F4F6' : 'rgba(4,44,83,.6)',
    input: isLight ? '#FFFFFF' : 'rgba(2,15,28,.6)',
  };
}
export type WarnaBba = ReturnType<typeof warnaBba>;

type AksiDock = { icon: ReactNode; label: string; onClick: () => void };

type Props = {
  username: string; role: string; themePreference: 'dark' | 'light';
  beku: InfoBeku; izin: PetaIzinLayar; aktif: MenuBba;
  /** Teks kecil di kepala sesudah "Buku Besar Aset /". */
  remah: string;
  aksiDock?: AksiDock[];
  children: (c: WarnaBba) => ReactNode;
};

export default function BbaShell({ username, role, themePreference, beku, izin, aktif, remah, aksiDock, children }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const c = warnaBba(isLight);
  return (
    <div style={{ minHeight: '100vh', background: c.canvas, color: c.text }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', minHeight: 52, background: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ fontSize: 13, color: c.sub, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Buku Besar Aset</span>
          <span style={{ margin: '0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>{remah}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>
      <div style={{ padding: '24px 28px 100px' }}>
        <BbaNav aktif={aktif} peta={izin} c={c} />
        <SpandukBeku {...beku} />
        {izin[aktif] === 'LIHAT' && aktif !== 'cetak' && <SpandukLihat label={LABEL_MENU_BBA[aktif]} />}
        {children(c)}
      </div>
      <FloatingDock isLight={isLight} limelight nav={navDockBba(izin, aktif, href => router.push(href))} actions={aksiDock} />
    </div>
  );
}
