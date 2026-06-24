'use client';
// Sidebar — extracted dari kinerja-client.tsx untuk eliminasi rule react-hooks/refs
// (renderSidebar inline closure trace ke pendingMasterRef via guardPending).
// L21 (split god component): refs tetap di parent, di-akses via prop callback.

import type { Role } from '@/types';
import type { KTab, SumberSSK } from '../_types';
import { SUMBER_LIST, SSK_THEME, TAHUN_OPTIONS } from '../_utils';
import Tip from '@/components/ui/Tip';
import {
  LayoutDashboard, Database, ClipboardList, FileText,
  ClipboardCheck, Printer,
  BarChart3, ChevronDown, LineChart,
  Menu, Settings, TrendingUp,
} from 'lucide-react';

// ── Module-level helpers (cegah rule react-hooks/static-components) ──────────

function IconBox({ icon: Icon, color = '#1855bb', active = false }: { icon: React.ElementType; color?: string; active?: boolean }) {
  return (
    <div style={{
      width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
      background: active ? 'rgba(255,255,255,0.22)' : color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={15} color="white" strokeWidth={2.2} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="kinerja-section-label" style={{ fontSize:'11px', fontWeight:800, letterSpacing:'.09em', color:'#85B7EB', textTransform:'uppercase', padding:'16px 18px 6px', opacity:.7 }}>
      {children}
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active: boolean;
  color?: string;
  isLight: boolean;
  dataRima?: string;
}
function SidebarItem({ icon, label, onClick, active, color = '#EF9F27', isLight, dataRima }: SidebarItemProps) {
  return (
    <button onClick={onClick} className={`kinerja-nav-item${active?' active':''}`} data-label={label} data-rima={dataRima} style={{
      display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px',
      borderRadius:'10px', margin:'2px 8px', fontSize:'15px', fontWeight: active ? 700 : 600,
      color: active ? (isLight ? '#FFFFFF' : '#020F1C') : (isLight ? '#374151' : '#B5D4F4'), cursor:'pointer', border:'none',
      width:'calc(100% - 16px)', textAlign:'left',
      background: active ? `linear-gradient(135deg,${color},${color}cc)` : 'transparent',
      boxShadow: active ? `0 3px 12px ${color}44` : 'none',
      transition:'all .15s',
    }}>
      <IconBox icon={icon} color={color} active={active} />
      <span className="kinerja-nav-label">{label}</span>
    </button>
  );
}

interface DropdownToggleProps {
  icon: React.ElementType;
  label: string;
  open: boolean;
  onClick: () => void;
  color?: string;
  active?: boolean;
  isLight: boolean;
}
function DropdownToggle({ icon, label, open, onClick, color = '#EF9F27', active = false, isLight }: DropdownToggleProps) {
  return (
    <button onClick={onClick} className={`kinerja-nav-item kinerja-dropdown-toggle${active?' active':''}`} data-label={label} style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap:'10px', padding:'9px 12px', borderRadius:'10px', margin:'2px 8px',
      fontSize:'15px', fontWeight: active ? 700 : 600,
      color: active ? (isLight ? '#FFFFFF' : '#020F1C') : (isLight ? '#374151' : '#B5D4F4'), cursor:'pointer', border:'none',
      width:'calc(100% - 16px)', textAlign:'left',
      background: active ? `linear-gradient(135deg,${color},${color}cc)` : 'transparent',
      boxShadow: active ? `0 3px 12px ${color}44` : 'none',
      transition:'all .15s',
    }}>
      <span style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <IconBox icon={icon} color={color} active={active} />
        <span className="kinerja-nav-label">{label}</span>
      </span>
      <ChevronDown size={14} color={active ? 'rgba(255,255,255,0.8)' : '#85B7EB'}
        className="kinerja-nav-chevron"
        style={{ transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink:0 }} />
    </button>
  );
}

interface Props {
  role: Role;
  isLight: boolean;
  tahun: string;
  activeTab: KTab;
  activeSumber: SumberSSK;
  realisasiSumber: SumberSSK;
  sidebarOpen: boolean;
  sidebarHidden: boolean;
  rkoOpen: boolean;
  realOpen: boolean;
  onTahunChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onNav: (tab: KTab, sub?: SumberSSK, realSub?: SumberSSK) => void;
  onSetSidebarOpen: (v: boolean) => void;
  onToggleSidebar: () => void;
  onSetRkoOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onSetRealOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}

export default function Sidebar({
  role, isLight, tahun, activeTab, activeSumber, realisasiSumber,
  sidebarOpen, sidebarHidden, rkoOpen, realOpen,
  onTahunChange, onNav, onSetSidebarOpen, onToggleSidebar, onSetRkoOpen, onSetRealOpen,
}: Props) {
  return (
    <aside style={{
      background:'rgba(4,44,83,.97)', borderRight:'1px solid #0C447C',
      width:'260px', flexShrink:0, display:'flex', flexDirection:'column', overflowY:'auto',
      position:'fixed', top:0, left: sidebarOpen ? 0 : '-260px', bottom:0, zIndex:200,
      transition:'left .25s, width .25s', boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,.4)' : 'none',
      backdropFilter:'blur(16px)',
    }}
    className={`lg:static! lg:left-0! lg:shadow-none! kinerja-sidebar${sidebarHidden?' collapsed':''}`}
    >
      <div className="kinerja-sidebar-head" style={{ padding:'18px 18px 10px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid #0C447C', justifyContent:'space-between' }}>
        <div className="kinerja-brand-wrap" style={{ display:'flex', alignItems:'center', gap:'12px', minWidth:0 }}>
          <div className="kinerja-sidebar-icon" style={{ width:'36px', height:'36px', borderRadius:'10px', background:'linear-gradient(135deg,#633806,#EF9F27)', border:'1.5px solid rgba(239,159,39,.4)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <TrendingUp size={18} color={isLight ? '#FFFFFF' : '#020F1C'} strokeWidth={2.5} />
          </div>
          <div className="kinerja-brand-text">
            <div className="kinerja-sidebar-title" style={{ fontSize:'13px', fontWeight:800, background:'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.1, whiteSpace:'nowrap', letterSpacing:'.3px' }}>PRIMA · E-Anggaran</div>
            <div className="kinerja-sidebar-sub" style={{ fontSize:'9.5px', color:'#85B7EB', fontWeight:600, whiteSpace:'nowrap' }}>RSJD Dr. Amino Gondohutomo</div>
          </div>
        </div>
        <Tip label={sidebarHidden?'Perluas sidebar':'Kecilkan sidebar'}><button
          className="kinerja-toggle-btn"
          onClick={()=>{ if(sidebarOpen){onSetSidebarOpen(false);} else {onToggleSidebar();} }}
          aria-label={sidebarHidden?'Perluas sidebar':'Kecilkan sidebar'}
          style={{
            background:'none', border:`1px solid ${isLight?'rgba(0,0,0,0.15)':'#0C447C'}`, color: isLight?'#6B7280':'#85B7EB',
            cursor:'pointer', padding:'5px', borderRadius:'6px', display:'flex',
            alignItems:'center', justifyContent:'center', transition:'all .15s', flexShrink:0,
          }}
        >
          <Menu size={16}/>
        </button></Tip>
      </div>

      <div style={{ padding: sidebarHidden ? '10px 8px 6px' : '10px 14px 6px' }}>
        <select value={tahun} onChange={onTahunChange}
          className="kinerja-tahun-select" data-rima="kinerja.sidebar-tahun"
          title={sidebarHidden ? `Tahun ${tahun}` : undefined}
          style={{ width:'100%', border:'1.5px solid #0C447C', borderRadius:'9px', padding: sidebarHidden?'6px 4px':'7px 10px', fontSize: sidebarHidden?'11px':'13px', fontWeight:800, color:'#E6F1FB', background:'#042C53', cursor:'pointer', outline:'none', textAlign: sidebarHidden?'center':'left', textAlignLast: sidebarHidden?'center':'left' }}>
          {TAHUN_OPTIONS.map(y => <option key={y} value={y}>{sidebarHidden ? y : `Tahun ${y}`}</option>)}
        </select>
      </div>

      <nav style={{ flex:1, paddingBottom:'16px' }}>
        <SidebarItem icon={LayoutDashboard} label="Beranda" onClick={() => onNav('dashboard')} active={activeTab==='dashboard'} color="#334155" isLight={isLight} />

        <SectionLabel>Laporan</SectionLabel>
        <SidebarItem icon={BarChart3} label="Laporan Konsolidasi" onClick={() => onNav('laporan')} active={activeTab==='laporan'} color="#6366f1" isLight={isLight} />

        <SectionLabel>Rekening</SectionLabel>
        <SidebarItem icon={Database}      label="Master Rekening" onClick={() => onNav('master')}   active={activeTab==='master'}   color="#06b6d4" isLight={isLight} dataRima="kinerja.sidebar-master" />
        <SidebarItem icon={ClipboardList} label="Rekening"        onClick={() => onNav('rekening')} active={activeTab==='rekening'} color="#8b5cf6" isLight={isLight} />

        <SectionLabel>RKO</SectionLabel>
        <div className="kinerja-dropdown-group">
          <span data-rima="kinerja.sidebar-rko"><DropdownToggle icon={FileText} label="RKO" open={rkoOpen}
            onClick={() => { onSetRkoOpen(p => !p); onSetRealOpen(false); }} color="#f97316" active={activeTab==='ssk'} isLight={isLight} /></span>

          {rkoOpen && (
            <div className="kinerja-dropdown-panel" style={{ paddingLeft:'10px', paddingTop:'2px' }}>
              <div className="kinerja-flyout-title">RKO — Sumber</div>
              {SUMBER_LIST.map(s => {
                const active = activeTab==='ssk' && activeSumber===s;
                return (
                  <button key={s} onClick={() => { onNav('ssk',s); onSetRkoOpen(true); }} style={{
                    display:'flex', alignItems:'center', gap:'9px', padding:'8px 12px',
                    borderRadius:'9px', margin:'2px 8px', fontSize:'13px', fontWeight: active ? 700 : 500,
                    color: active ? (isLight ? '#FFFFFF' : '#020F1C') : (isLight ? '#374151' : '#B5D4F4'), cursor:'pointer', border:'none', width:'calc(100% - 16px)',
                    background: active ? `linear-gradient(135deg,${SSK_THEME[s].color},${SSK_THEME[s].color}cc)` : 'transparent',
                    boxShadow: active ? `0 2px 8px ${SSK_THEME[s].color}44` : 'none',
                  }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: active ? 'white' : SSK_THEME[s].color, flexShrink:0 }} />
                    {SSK_THEME[s].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <SectionLabel>Realisasi dan Cetak</SectionLabel>
        <div className="kinerja-dropdown-group">
          <span data-rima="kinerja.sidebar-realisasi"><DropdownToggle icon={ClipboardCheck} label="Realisasi" open={realOpen}
            onClick={() => { onSetRealOpen(p => !p); onSetRkoOpen(false); }} color="#16a34a"
            active={activeTab==='realisasi'||activeTab==='cetak'} isLight={isLight} /></span>

          {realOpen && (
            <div className="kinerja-dropdown-panel" style={{ paddingLeft:'10px', paddingTop:'2px' }}>
              <div className="kinerja-flyout-title">Realisasi — Sumber</div>
              {SUMBER_LIST.map(s => {
                const active = (activeTab==='realisasi'||activeTab==='cetak') && realisasiSumber===s;
                return (
                  <button key={s} onClick={() => { onNav('realisasi', undefined, s); onSetRealOpen(true); }} style={{
                    display:'flex', alignItems:'center', gap:'9px', padding:'8px 12px',
                    borderRadius:'9px', margin:'2px 8px', fontSize:'13px', fontWeight: active ? 700 : 500,
                    color: active ? (isLight ? '#FFFFFF' : '#020F1C') : (isLight ? '#374151' : '#B5D4F4'), cursor:'pointer', border:'none', width:'calc(100% - 16px)',
                    background: active ? `linear-gradient(135deg,${SSK_THEME[s].color},${SSK_THEME[s].color}cc)` : 'transparent',
                    boxShadow: active ? `0 2px 8px ${SSK_THEME[s].color}44` : 'none',
                  }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: active ? 'white' : SSK_THEME[s].color, flexShrink:0 }} />
                    Real. {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <SidebarItem icon={Printer} label="Cetak Realisasi" onClick={() => onNav('cetak')} active={activeTab==='cetak'} color="#0891b2" isLight={isLight} />

        <SectionLabel>Pendapatan</SectionLabel>
        <SidebarItem icon={LineChart} label="Pendapatan & CRR" onClick={() => onNav('pend-crr')} active={activeTab==='pend-crr'} color="#ec4899" isLight={isLight} />

        {role === 'SUPER_ADMIN' && (
          <>
            <SectionLabel>Sistem</SectionLabel>
            <SidebarItem icon={Settings} label="Pengaturan" onClick={() => onNav('pengaturan')} active={activeTab==='pengaturan'} color="#E24B4A" isLight={isLight} />
          </>
        )}
      </nav>

      <div style={{ padding:'12px 16px', fontSize:'11px', color:'#85B7EB', fontWeight:600, borderTop:'1px solid #0C447C' }}>
        PRIMA v1.0 · E-Anggaran
      </div>
    </aside>
  );
}
