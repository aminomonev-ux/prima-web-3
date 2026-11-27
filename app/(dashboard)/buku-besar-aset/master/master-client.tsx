'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import type { BbaBarang, BbaLokasi } from '@/lib/data/buku-besar-aset';
import type { MasterKategoriData } from '@/lib/bba/kategori';
import SpandukBeku from '@/components/ui/SpandukBeku';
import SpandukLihat from '@/components/ui/SpandukLihat';
import type { InfoBeku } from '@/lib/security/beku';
import BarangPanel from './BarangPanel';
import KategoriPanel from './KategoriPanel';
import LokasiPanel from './LokasiPanel';
import PengaturanPanel from './PengaturanPanel';
import BbaNav, { navDockBba, type PetaIzinLayar } from '../_components/BbaNav';

type TabMaster = 'KATEGORI' | 'BARANG' | 'LOKASI' | 'PENGATURAN';
type Props = { username: string; role: string; themePreference: 'dark' | 'light'; initialKategori: MasterKategoriData; initialBarang: BbaBarang[];
  initialLokasi: BbaLokasi[]; tabAwal: TabMaster;
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku;
  izin: PetaIzinLayar };

export default function MasterClient({ username, role, themePreference, initialKategori, initialBarang, initialLokasi, tabAwal, beku, izin }: Props) {
  const router = useRouter();
  const bolehUbah = izin.master === 'EDIT';
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const c = {
    canvas: isLight ? '#F5F5F7' : '#020F1C', card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB', sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C', rowOdd: isLight ? '#F3F4F6' : 'rgba(4,44,83,.6)',
    input: isLight ? '#FFFFFF' : 'rgba(2,15,28,.6)',
  };

  const [kategori, setKategori] = useState<MasterKategoriData>(initialKategori);
  const [tab, setTab] = useState<TabMaster>(tabAwal);

  return (
    <div style={{ minHeight: '100vh', background: c.canvas, color: c.text }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', minHeight: 52, background: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ fontSize: 13, color: c.sub }}>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Buku Besar Aset</span>
          <span style={{ margin: '0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>Master {tab === 'BARANG' ? 'Barang' : tab === 'LOKASI' ? 'Ruangan' : tab === 'PENGATURAN' ? 'Pengaturan' : 'Kategori'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <div style={{ padding: '24px 16px 100px', maxWidth: tab === 'BARANG' || tab === 'KATEGORI' ? 900 : 720, margin: '0 auto' }}>
        <BbaNav aktif="master" peta={izin} c={c} />
        <SpandukBeku {...beku}/>
        {!bolehUbah && <SpandukLihat label="Master" />}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([['KATEGORI', 'Kategori'], ['BARANG', 'Barang'], ['LOKASI', 'Ruangan'], ['PENGATURAN', 'Pengaturan']] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setTab(val)}
              style={{ padding: '5px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${tab === val ? '#EF9F27' : c.border}`, background: tab === val ? 'rgba(239,159,39,.15)' : 'transparent', color: tab === val ? '#EF9F27' : c.sub }}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'BARANG' ? <>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🧾 Master Barang</h1>
          <BarangPanel c={c} awal={initialBarang} kategori={kategori} bolehUbah={bolehUbah} />
        </> : tab === 'PENGATURAN' ? <>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>⚙️ Pengaturan</h1>
          <PengaturanPanel c={c} bolehUbah={bolehUbah} />
        </> : tab === 'LOKASI' ? <>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📍 Master Ruangan</h1>
          <LokasiPanel c={c} awal={initialLokasi} bolehUbah={bolehUbah} />
        </> : <>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>🗂️ Master Kategori</h1>
        <KategoriPanel c={c} data={kategori} onData={setKategori} bolehUbah={bolehUbah} />
        </>}
      </div>

      <FloatingDock isLight={isLight} nav={navDockBba(izin, 'master', href => router.push(href))} />
    </div>
  );
}
