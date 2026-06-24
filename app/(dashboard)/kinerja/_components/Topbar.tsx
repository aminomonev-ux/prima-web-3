'use client';
// Topbar — extracted dari kinerja-client.tsx (companion ke Sidebar).
// dropRef + click-outside scope di sini supaya ref tidak bocor ke parent render.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Home, ShieldCheck, LogOut } from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import type { Role } from '@/types';
import type { KTab, SumberSSK } from '../_types';
import { SSK_THEME } from '../_utils';

interface Props {
  username: string;
  role: Role;
  isLight: boolean;
  themePreference: 'dark' | 'light';
  activeTab: KTab;
  activeSumber: SumberSSK;
  realisasiSumber: SumberSSK;
  loggingOut: boolean;
  onSetSidebarOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onSetCurrentTheme: (v: 'dark' | 'light') => void;
  onGuardPending: (action: () => void) => void;
  onLogout: () => void;
}

export default function Topbar({
  username, role, isLight, themePreference,
  activeTab, activeSumber, realisasiSumber,
  loggingOut,
  onSetSidebarOpen, onSetCurrentTheme, onGuardPending, onLogout,
}: Props) {
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const breadMap: Record<KTab, string> = {
    dashboard:'Dashboard', master:'Master Rekening', rekening:'Rekening',
    ssk:`RKO / ${SSK_THEME[activeSumber]?.label}`,
    realisasi:`Realisasi / ${realisasiSumber}`,
    cetak:`Cetak Realisasi / ${realisasiSumber}`, 'pend-crr':'Pendapatan & CRR',
    laporan:'Laporan Konsolidasi',
    pengaturan:'Pengaturan',
  };
  const initials = username.slice(0,2).toUpperCase();

  return (
    <header className="kinerja-topbar" style={{
      background:'rgba(4,44,83,.92)',
      backdropFilter:'blur(16px)',
      borderBottom:'1px solid #0C447C',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'10px 20px', flexShrink:0, minHeight:'52px',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <button className="lg:hidden" onClick={() => onSetSidebarOpen(p => !p)}
          style={{ border:'none', background:'none', cursor:'pointer', fontSize:'18px', color: isLight ? '#6B7280' : '#85B7EB' }}>
          <i className="fas fa-bars" />
        </button>
        <div className="kinerja-topbar-breadcrumb" style={{ fontSize:'13px', color:'#85B7EB' }}>
          <span style={{ fontWeight:800, background:'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>E-Anggaran</span>
          <span style={{ margin:'0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight:600 }}>{breadMap[activeTab]}</span>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <button className="kinerja-menu-btn" onClick={() => onGuardPending(() => { window.location.href = '/menu'; })}
          style={{ border:`1.5px solid ${isLight ? 'rgba(0,0,0,0.15)' : '#185FA5'}`, borderRadius:'8px', padding:'5px 10px', fontSize:'11px', fontWeight:700, color: isLight ? '#374151' : '#B5D4F4', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', transition:'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#EF9F27'; e.currentTarget.style.color= isLight ? '#B45309' : '#EF9F27'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor= isLight ? 'rgba(0,0,0,0.15)' : '#185FA5'; e.currentTarget.style.color= isLight ? '#374151' : '#B5D4F4'; }}>
          <Home size={13} /> Menu
        </button>
        <ThemeToggle initialTheme={themePreference} onThemeChange={onSetCurrentTheme} />
        <div ref={dropRef} style={{ position:'relative' }}>
          <div className="kinerja-user-badge" onClick={() => setDropOpen(p => !p)}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 10px 5px 5px', borderRadius:'40px', border:`1.5px solid ${isLight ? 'rgba(139,92,246,0.25)' : 'rgba(239,159,39,.2)'}`, background: isLight ? 'rgba(139,92,246,0.05)' : 'rgba(239,159,39,.05)', cursor:'pointer', userSelect:'none' }}>
            <div className="kinerja-user-avatar" style={{ width:'30px', height:'30px', borderRadius:'50%', background:'linear-gradient(135deg,#633806,#EF9F27)', display:'flex', alignItems:'center', justifyContent:'center', color:'#020F1C', fontWeight:800, fontSize:'12px', flexShrink:0 }}>
              {initials}
            </div>
            <div style={{ lineHeight:1.2 }}>
              <div className="kinerja-user-name" style={{ fontSize:'12px', fontWeight:700, color: isLight ? '#0F0F12' : '#E6F1FB' }}>{username}</div>
              <div className="kinerja-user-role" style={{ fontSize:'10px', color: isLight ? '#6B7280' : '#85B7EB' }}>{role}</div>
            </div>
            <ChevronDown size={13} color={isLight ? '#6B7280' : '#85B7EB'} style={{ transition:'transform .2s', transform: dropOpen ? 'rotate(180deg)' : 'none', flexShrink:0 }} />
          </div>
          {dropOpen && (
            <div className="kinerja-dropdown" style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:'190px', background: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(4,44,83,.98)', backdropFilter:'blur(20px)', borderRadius:'12px', border:`1px solid ${isLight ? 'rgba(0,0,0,0.1)' : '#0C447C'}`, boxShadow: isLight ? '0 16px 48px rgba(0,0,0,.15)' : '0 16px 48px rgba(0,0,0,.5)', overflow:'hidden', zIndex:300 }}>
              <button className="kinerja-drop-item" onClick={() => { setDropOpen(false); window.location.href = '/profil'; }}
                style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', fontSize:'13px', fontWeight:500, color: isLight ? '#374151' : '#B5D4F4', cursor:'pointer', border:'none', background:'none', width:'100%', textAlign:'left' }}
                onMouseEnter={e => (e.currentTarget.style.background= isLight ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.05)')}
                onMouseLeave={e => (e.currentTarget.style.background='none')}>
                <ShieldCheck size={14} /> Ganti Password
              </button>
              <div className="kinerja-drop-divider" style={{ height:'1px', background: isLight ? 'rgba(0,0,0,0.08)' : '#0C447C' }} />
              <button className="kinerja-drop-item danger" onClick={onLogout} disabled={loggingOut}
                style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', fontSize:'13px', fontWeight:500, color: isLight ? '#DC2626' : '#FCA5A5', cursor:'pointer', border:'none', background:'none', width:'100%', textAlign:'left', opacity: loggingOut ? .6 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.background= isLight ? 'rgba(226,75,74,.08)' : 'rgba(226,75,74,.1)')}
                onMouseLeave={e => (e.currentTarget.style.background='none')}>
                <LogOut size={14} /> {loggingOut ? 'Keluar...' : 'Keluar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
