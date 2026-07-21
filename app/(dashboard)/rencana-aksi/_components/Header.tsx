'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, ShieldCheck, Home, Copy, Lock, FileUp } from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PrimaButton from '@/components/ui/PrimaButton';
import { ROLE_LABELS } from '@/lib/constants';
import { YEAR_RANGE, BULAN_LABELS } from '../_lib/types';
import { apiDuplikasiTahun, apiGetLock, apiSetLock } from '../_lib/api';
import ImportRenaksiModal from './ImportRenaksiModal';

interface Props {
  onToggleSidebar: () => void;
  selectedYear: number;
  onYearChange: (y: number) => void;
  username: string;
  role: string;
  initials: string;
  themePreference: 'dark' | 'light';
  onLogout: () => void;
  notify?: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  /** Muat ulang data setelah import massal */
  onDataChanged?: () => void;
}

export default function Header({
  onToggleSidebar, selectedYear, onYearChange,
  username, role, initials, themePreference, onLogout, notify, onDataChanged,
}: Props) {
  const router = useRouter();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const roleLabel = ROLE_LABELS[role] ?? role;

  // Alat admin: Duplikasi Tahun + Kunci Periode (khusus ADMIN/SUPER_ADMIN)
  const isAdminTools = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const [dupOpen, setDupOpen] = useState(false);
  const [dupDari, setDupDari] = useState(selectedYear);
  const [dupKe, setDupKe] = useState(selectedYear + 1);
  const [dupBusy, setDupBusy] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockBulan, setLockBulan] = useState(0);
  const [lockBusy, setLockBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const openDup = () => {
    setDupDari(selectedYear);
    setDupKe(Math.min(selectedYear + 1, YEAR_RANGE[YEAR_RANGE.length - 1]));
    setDupOpen(true);
  };

  const openLock = async () => {
    setLockOpen(true);
    try { setLockBulan(await apiGetLock(selectedYear)); } catch { setLockBulan(0); }
  };

  const handleDuplikasi = async () => {
    if (dupBusy || dupDari === dupKe) return;
    setDupBusy(true);
    try {
      const inserted = await apiDuplikasiTahun(dupDari, dupKe);
      setDupOpen(false);
      notify?.(`${inserted} indikator tersalin dari ${dupDari} ke ${dupKe} — realisasi mulai dari kosong`, 'success');
      onYearChange(dupKe);
    } catch (e) {
      notify?.((e as Error).message || 'Gagal duplikasi tahun', 'error');
    } finally { setDupBusy(false); }
  };

  const handleSimpanLock = async () => {
    if (lockBusy) return;
    setLockBusy(true);
    try {
      await apiSetLock(selectedYear, lockBulan);
      setLockOpen(false);
      notify?.(lockBulan === 0
        ? `Kunci periode ${selectedYear} dibuka — semua bulan bisa diedit`
        : `Periode ${selectedYear} terkunci s.d. ${BULAN_LABELS[lockBulan - 1]} — realisasi bulan terkunci tidak bisa diubah`, 'warning');
    } catch (e) {
      notify?.((e as Error).message || 'Gagal menyimpan kunci periode', 'error');
    } finally { setLockBusy(false); }
  };

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
        {isAdminTools && (
          <>
            <button
              onClick={() => setImportOpen(true)}
              className="ra-menu-btn hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
              style={{
                border: '1.5px solid var(--ra-menu-border, rgba(0,0,0,0.15))',
                color: 'var(--ra-menu-text, #374151)',
                background: 'transparent',
              }}
              data-tooltip="Isi struktur & target dari file Excel/CSV/PDF"
            >
              <FileUp className="h-3.5 w-3.5" />
              <span>Import File</span>
            </button>
            <button
              onClick={openDup}
              className="ra-menu-btn hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
              style={{
                border: '1.5px solid var(--ra-menu-border, rgba(0,0,0,0.15))',
                color: 'var(--ra-menu-text, #374151)',
                background: 'transparent',
              }}
              data-tooltip="Salin struktur + target ke tahun kosong"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Duplikasi Tahun</span>
            </button>
            <button
              onClick={() => { void openLock(); }}
              className="ra-menu-btn hidden sm:inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
              style={{
                border: '1.5px solid var(--ra-menu-border, rgba(0,0,0,0.15))',
                color: 'var(--ra-menu-text, #374151)',
                background: 'transparent',
              }}
              data-tooltip="Kunci/buka realisasi periode yang sudah final"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Kunci Periode</span>
            </button>
          </>
        )}

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

      {importOpen && (
        <ImportRenaksiModal
          tahun={selectedYear}
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); onDataChanged?.(); }}
          notify={(m, t) => notify?.(m, t)}
        />
      )}

      {/* Modal Duplikasi Tahun */}
      {dupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0f172a]/70" onClick={() => setDupOpen(false)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#7C5CFC] to-[#378ADD]" />
            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Duplikasi ke Tahun Baru</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Menyalin seluruh struktur (Tujuan s.d. Sub Kegiatan) beserta target dari tahun sumber
                  ke tahun tujuan yang <strong>masih kosong</strong>. Realisasi mulai dari nol.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 space-y-1 block">
                  <span>Dari tahun</span>
                  <select value={dupDari} onChange={(e) => setDupDari(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-bold text-slate-800 focus:border-[#7C5CFC] focus:outline-none">
                    {YEAR_RANGE.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 space-y-1 block">
                  <span>Ke tahun (kosong)</span>
                  <select value={dupKe} onChange={(e) => setDupKe(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-bold text-slate-800 focus:border-[#7C5CFC] focus:outline-none">
                    {YEAR_RANGE.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              </div>
              {dupDari === dupKe && (
                <p className="text-[11px] text-[#E24B4A] font-medium">Tahun sumber dan tujuan harus berbeda.</p>
              )}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <PrimaButton variant="ghost" size="sm" onClick={() => setDupOpen(false)}>Batal</PrimaButton>
                <PrimaButton variant="purple" size="sm" disabled={dupBusy || dupDari === dupKe} onClick={() => { void handleDuplikasi(); }}>
                  {dupBusy ? 'Menyalin…' : 'Duplikasi'}
                </PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kunci Periode */}
      {lockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0f172a]/70" onClick={() => setLockOpen(false)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#EF9F27] to-[#BA7517]" />
            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Kunci Periode {selectedYear}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Realisasi bulan yang terkunci tidak bisa diubah/direset oleh siapa pun sampai kunci dibuka —
                  pakai setelah laporan periode itu final. Kunci &amp; buka tercatat di audit log.
                </p>
              </div>
              <label className="text-xs font-semibold text-slate-600 space-y-1 block">
                <span>Kunci sampai dengan</span>
                <select value={lockBulan} onChange={(e) => setLockBulan(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-bold text-slate-800 focus:border-[#EF9F27] focus:outline-none">
                  <option value={0}>— Terbuka (tanpa kunci) —</option>
                  {BULAN_LABELS.map((b, i) => (
                    <option key={b} value={i + 1}>{b} (bulan 1–{i + 1} terkunci)</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <PrimaButton variant="ghost" size="sm" onClick={() => setLockOpen(false)}>Batal</PrimaButton>
                <PrimaButton variant="warning" size="sm" disabled={lockBusy} onClick={() => { void handleSimpanLock(); }}>
                  {lockBusy ? 'Menyimpan…' : 'Simpan Kunci'}
                </PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}

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
