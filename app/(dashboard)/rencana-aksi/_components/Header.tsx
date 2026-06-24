'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, ShieldCheck, Home } from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { ROLE_LABELS } from '@/lib/constants';
import { YEAR_RANGE } from '../_lib/types';

interface Props {
  onToggleSidebar: () => void;
  selectedYear: number;
  onYearChange: (y: number) => void;
  username: string;
  role: string;
  initials: string;
  themePreference: 'dark' | 'light';
  onLogout: () => void;
}

export default function Header({
  onToggleSidebar, selectedYear, onYearChange,
  username, role, initials, themePreference, onLogout,
}: Props) {
  const router = useRouter();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const roleLabel = ROLE_LABELS[role] ?? role;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur-md"
            style={{
              borderColor: 'var(--ra-header-border, #E2E8F0)',
              background: 'var(--ra-header-bg, rgba(250,250,250,0.95))',
            }}>
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden focus:outline-none cursor-pointer"
          data-tooltip="Buka/tutup menu"
          data-tooltip-pos="below"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div>
          <h2 className="text-sm font-semibold text-gray-800 md:text-base"
              style={{ color: 'var(--ra-text, #1E293B)' }}>
            Renaksi & Kinerja OPD Sub-Activity Monitoring
          </h2>
          <div className="flex items-center gap-1.5 text-xs"
               style={{ color: 'var(--ra-text-muted, #64748B)' }}>
            <span className="hidden sm:inline">RSJD Dr. Amino Gondohutomo</span>
            <span className="hidden sm:inline">•</span>
            <span className="font-semibold text-[#1D9E75]">Periode RKPD</span>
            <select
              value={selectedYear}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="ra-year-select"
            >
              {YEAR_RANGE.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Tombol Menu — seragam dengan BLUD/PK shell */}
        <button
          onClick={() => router.push('/menu')}
          className="ra-menu-btn hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
          style={{
            border: '1.5px solid var(--ra-menu-border, rgba(0,0,0,0.15))',
            color: 'var(--ra-menu-text, #374151)',
            background: 'transparent',
          }}
        >
          <Home className="h-3.5 w-3.5" />
          <span>Menu</span>
        </button>

        <ThemeToggle initialTheme={themePreference} />

        {/* User chip dropdown — pattern BLUD/PK: avatar LEFT + text RIGHT */}
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setDropOpen(!dropOpen)}
            className="ra-user-pill flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-all cursor-pointer"
            style={{
              border: '1.5px solid var(--ra-user-border, rgba(239,159,39,.25))',
              background: 'var(--ra-user-bg, rgba(239,159,39,.06))',
              fontFamily: 'inherit',
            }}
          >
            <div className="h-7 w-7 rounded-full flex items-center justify-center font-extrabold text-[11px] flex-shrink-0"
                 style={{
                   background: 'linear-gradient(135deg, #633806, #EF9F27)',
                   color: '#020F1C',
                 }}>
              {initials}
            </div>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-[12px] font-bold uppercase"
                   style={{ color: 'var(--ra-text, #1E293B)' }}>{username}</div>
              <div className="text-[10px] font-medium"
                   style={{ color: 'var(--ra-text-muted, #94A3B8)' }}>{roleLabel}</div>
            </div>
            <ChevronDown className={`h-3 w-3 transition-transform ${dropOpen ? 'rotate-180' : ''}`}
                         style={{ color: 'var(--ra-text-muted, #64748B)' }} />
          </button>

          {dropOpen && (
            <div className="absolute right-0 top-12 w-52 rounded-xl shadow-xl border z-50 overflow-hidden"
                 style={{ background: 'var(--ra-card, #FAFAFA)', borderColor: 'var(--ra-border, #E2E8F0)' }}>
              <div className="px-3.5 py-2.5 border-b" style={{ borderColor: 'var(--ra-border, #E2E8F0)' }}>
                <div className="text-xs font-bold"
                     style={{ color: 'var(--ra-text, #1E293B)' }}>{username}</div>
                <div className="text-[10px] font-medium mt-0.5"
                     style={{ color: 'var(--ra-text-muted, #94A3B8)' }}>{roleLabel}</div>
              </div>
              <button
                onClick={() => { setDropOpen(false); router.push('/profil'); }}
                className="ra-dd-item w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium transition-colors text-left cursor-pointer"
                style={{ color: 'var(--ra-text, #1E293B)' }}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Ganti Password</span>
              </button>
              <div className="border-t" style={{ borderColor: 'var(--ra-border, #E2E8F0)' }} />
              <button
                onClick={() => { setDropOpen(false); onLogout(); }}
                className="ra-dd-item-danger w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium transition-colors text-left cursor-pointer"
                style={{ color: '#E24B4A' }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ra-menu-btn { --ra-menu-text: #B5D4F4; --ra-menu-border: #185FA5; }
        [data-theme="light"] .ra-menu-btn { --ra-menu-text: #374151; --ra-menu-border: rgba(0,0,0,0.15); }
        .ra-menu-btn:hover { border-color: #EF9F27 !important; color: #EF9F27 !important; }
        [data-theme="light"] .ra-menu-btn:hover { border-color: #8B5CF6 !important; color: #6D28D9 !important; background: rgba(139,92,246,0.06) !important; }
        .ra-user-pill:hover { filter: brightness(1.08); }
        .ra-dd-item:hover { background: rgba(239,159,39,0.06) !important; }
        [data-theme="light"] .ra-dd-item:hover { background: rgba(139,92,246,0.06) !important; }
        .ra-dd-item-danger:hover { background: rgba(226,75,74,0.08) !important; }
      `}</style>
    </header>
  );
}
