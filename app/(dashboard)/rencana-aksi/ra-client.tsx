'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, RotateCcw, X, Sparkles, AlertTriangle } from 'lucide-react';
import DownloadButton from '@/components/ui/DownloadButton';
import Sidebar from './_components/Sidebar';
import Header from './_components/Header';
import MainDashboard from './_components/MainDashboard';
import DataEntryForm from './_components/DataEntryForm';
import CetakPanel from './_components/CetakPanel';
import { QuarterModal, TargetsModal, DetailModal, ResetRealisasiModal } from './_components/Modals';
import MatrixBulananModal from './_components/MatrixBulananModal';
import type { RaRow, RaLevel, RaJenis } from './_lib/types';
import { LEVEL_LABELS, anggaranRollup } from './_lib/types';
import { apiList, apiUpdateJenis, apiUpdateBulanRealisasi, VersionConflictError } from './_lib/api';
import { exportIndikatorPdf, exportIndikatorXlsx } from './_lib/exports';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialTahun: number;
  initialLevel: RaLevel;
  initialMode: 'dashboard' | 'data-entry' | 'cetak';
  initialRows: RaRow[];
}

type Notif = { type: 'success' | 'info' | 'warning' | 'error'; message: string };

export default function RaClient({
  username, role, themePreference,
  initialTahun, initialLevel, initialMode, initialRows,
}: Props) {
  const router = useRouter();

  const [tahun, setTahun]   = useState(initialTahun);
  const [level, setLevel]   = useState<RaLevel>(initialLevel);
  const [mode, setMode]     = useState<'dashboard' | 'data-entry' | 'cetak'>(initialMode);
  const [rows, setRows]     = useState<RaRow[]>(initialRows);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [notif, setNotif]   = useState<Notif | null>(null);

  const [selectedSasaran, setSelectedSasaran]       = useState('');
  const [selectedProgram, setSelectedProgram]       = useState('');
  const [selectedKegiatan, setSelectedKegiatan]     = useState('');
  const [selectedSubKegiatan, setSelectedSubKegiatan] = useState('');
  const [selectedIndicator, setSelectedIndicator]   = useState('');

  const [activeQuarter, setActiveQuarter] = useState<1 | 2 | 3 | 4 | null>(null);
  const [isTargetsOpen, setIsTargetsOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen]   = useState(false);
  const [isResetOpen, setIsResetOpen]     = useState(false);
  const [isMatrixOpen, setIsMatrixOpen]   = useState(false);

  const initials = (username || 'U').slice(0, 2).toUpperCase();

  const notify = useCallback((message: string, type: Notif['type'] = 'success') => {
    setNotif({ message, type });
  }, []);

  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 5000);
    return () => clearTimeout(t);
  }, [notif]);

  // Sync URL
  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set('tahun', String(tahun));
    sp.set('level', level);
    sp.set('mode', mode);
    router.replace(`/rencana-aksi?${sp.toString()}`, { scroll: false });
  }, [tahun, level, mode, router]);

  // Active row
  const activeRow = useMemo(() =>
    rows.find(r => r.level === level && r.indikator === selectedIndicator) ?? null,
  [rows, level, selectedIndicator]);

  // Anggaran roll-up: tersimpan di sub-kegiatan; level di atas = SUM keturunan.
  // Fetch program + sub-kegiatan saat mode dashboard (program dipakai jembatan
  // sasaran→program→sub-kegiatan untuk roll-up level sasaran).
  const [rollupRows, setRollupRows] = useState<RaRow[]>([]);
  useEffect(() => {
    if (mode !== 'dashboard') return;
    let cancelled = false;
    void (async () => {
      try {
        const [progs, subs] = await Promise.all([
          apiList(tahun, 'program'),
          apiList(tahun, 'sub-kegiatan'),
        ]);
        if (!cancelled) setRollupRows([...progs, ...subs]);
      } catch { /* anggaran rollup opsional — abaikan error */ }
    })();
    return () => { cancelled = true; };
  }, [mode, tahun]);

  const activeAnggaran = useMemo(
    () => (activeRow ? anggaranRollup(level, activeRow, rollupRows) : null),
    [activeRow, level, rollupRows],
  );

  // Safety reset saat data kosong utk level aktif — selectors selalu kembali ke
  // '— Pilih —'. TIDAK auto-pick first row (UX: user explicit memilih).
  useEffect(() => {
    const lvlRows = rows.filter(r => r.level === level);
    if (lvlRows.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSasaran(''); setSelectedProgram(''); setSelectedKegiatan(''); setSelectedSubKegiatan(''); setSelectedIndicator('');
    }
  }, [rows, level]);

  const reloadCtrlRef = useRef<AbortController | null>(null);
  const reloadRows = useCallback(async (yr: number, lvl: RaLevel) => {
    reloadCtrlRef.current?.abort();
    const ctrl = new AbortController();
    reloadCtrlRef.current = ctrl;
    try {
      const data = await apiList(yr, lvl, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setRows(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      notify((err as Error).message || 'Gagal memuat data', 'error');
    }
  }, [notify]);

  const handleYearChange = async (newYear: number) => {
    setTahun(newYear);
    setSelectedSasaran(''); setSelectedProgram(''); setSelectedKegiatan(''); setSelectedSubKegiatan(''); setSelectedIndicator('');
    await reloadRows(newYear, level);
    notify(`Pindah ke periode rencana aksi tahun ${newYear}`, 'info');
  };

  const handleSelectMenu = async (m: RaLevel) => {
    setMode('dashboard');
    setLevel(m);
    setSelectedSasaran(''); setSelectedProgram(''); setSelectedKegiatan(''); setSelectedSubKegiatan(''); setSelectedIndicator('');
    setIsSidebarOpen(false);
    await reloadRows(tahun, m);
    notify(`Navigasi beralih ke menu: ${LEVEL_LABELS[m].toUpperCase()}`, 'info');
  };

  const handleSelectDataEntry = async (m: RaLevel) => {
    setMode('data-entry');
    setLevel(m);
    setSelectedSasaran(''); setSelectedProgram(''); setSelectedKegiatan(''); setSelectedSubKegiatan(''); setSelectedIndicator('');
    setIsSidebarOpen(false);
    await reloadRows(tahun, m);
    notify(`Navigasi beralih ke entri data: DATA ENTRY ${m.toUpperCase()}`, 'info');
  };

  const handleSelectCetak = () => {
    setMode('cetak');
    setIsSidebarOpen(false);
    notify('Mode Cetak Gabungan aktif', 'info');
  };

  const jenisSubmittingRef = useRef(false);
  const handleChangeJenis = async (j: RaJenis) => {
    if (!activeRow || jenisSubmittingRef.current) return;
    jenisSubmittingRef.current = true;
    try {
      await apiUpdateJenis(activeRow.id, j, activeRow.version);
      notify(`Jenis indikator diubah menjadi ${j}`, 'success');
      await reloadRows(tahun, level);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        notify('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', 'warning');
        await reloadRows(tahun, level);
      } else {
        notify((err as Error).message || 'Gagal ubah jenis', 'error');
      }
    } finally {
      jenisSubmittingRef.current = false;
    }
  };

  const bulanRealisasiSubmittingRef = useRef(false);
  const handleSaveBulanRealisasi = async (months: (number | null)[]) => {
    if (!activeRow || bulanRealisasiSubmittingRef.current) return;
    bulanRealisasiSubmittingRef.current = true;
    try {
      await apiUpdateBulanRealisasi(activeRow.id, months, activeRow.version);
      notify('Realisasi bulanan tersimpan. Triwulan terhitung otomatis.', 'success');
      await reloadRows(tahun, level);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        notify('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', 'warning');
        await reloadRows(tahun, level);
      } else {
        notify((err as Error).message || 'Gagal simpan realisasi bulanan', 'error');
      }
    } finally {
      bulanRealisasiSubmittingRef.current = false;
    }
  };

  const handleExportPdf = async () => {
    if (!activeRow) { notify('Pilih indikator terlebih dahulu', 'warning'); return; }
    try { await exportIndikatorPdf(activeRow); notify('PDF berhasil diunduh', 'success'); }
    catch (err) { notify((err as Error).message || 'Gagal export PDF', 'error'); }
  };

  const handleExportXlsx = async () => {
    if (!activeRow) { notify('Pilih indikator terlebih dahulu', 'warning'); return; }
    try { await exportIndikatorXlsx(activeRow); notify('Excel berhasil diunduh', 'success'); }
    catch (err) { notify((err as Error).message || 'Gagal export Excel', 'error'); }
  };

  const handleResetRealisasi = () => {
    if (!activeRow) { notify('Pilih indikator terlebih dahulu', 'warning'); return; }
    setIsResetOpen(true);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="ra-scope flex h-screen w-full overflow-hidden bg-[#EEF2F6] antialiased text-slate-800"
         style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      {/* Dark/Light theme overrides — default = dark; data-theme="light" disables overrides */}
      <style>{`
        html:not([data-theme="light"]) .ra-scope {
          background-color: #020F1C !important; color: #E6F1FB;
          --ra-text: #E6F1FB;
          --ra-text-muted: #85B7EB;
          --ra-card: #042C53;
          --ra-border: #0C447C;
        }

        /* Backgrounds */
        html:not([data-theme="light"]) .ra-scope .bg-white { background-color: #042C53 !important; }
        html:not([data-theme="light"]) .ra-scope .bg-white\\/95 { background-color: rgba(4,44,83,0.95) !important; }
        html:not([data-theme="light"]) .ra-scope .bg-\\[\\#EEF2F6\\] { background-color: #020F1C !important; }
        html:not([data-theme="light"]) .ra-scope .bg-slate-50 { background-color: #031628 !important; }
        html:not([data-theme="light"]) .ra-scope .bg-slate-50\\/50 { background-color: rgba(3,22,40,0.5) !important; }
        html:not([data-theme="light"]) .ra-scope .bg-slate-50\\/70 { background-color: rgba(3,22,40,0.7) !important; }
        html:not([data-theme="light"]) .ra-scope .bg-slate-100 { background-color: #073064 !important; }
        html:not([data-theme="light"]) .ra-scope .bg-slate-200 { background-color: #0C447C !important; }
        html:not([data-theme="light"]) .ra-scope .bg-gray-100 { background-color: #073064 !important; }

        /* Borders */
        html:not([data-theme="light"]) .ra-scope .border-slate-200 { border-color: #0C447C !important; }
        html:not([data-theme="light"]) .ra-scope .border-slate-100 { border-color: #0C447C !important; }
        html:not([data-theme="light"]) .ra-scope .border-slate-50 { border-color: #073064 !important; }
        html:not([data-theme="light"]) .ra-scope .border-gray-200 { border-color: #0C447C !important; }

        /* Text */
        /* Hardcoded hex text fixes (info banner navy text invisible di dark) */
        html:not([data-theme="light"]) .ra-scope .text-\\[\\#1F3F73\\] { color: #B5D4F4 !important; }
        /* Rekomendasi Evaluasi (DetailModal): dark-amber #7A4D0A invisible di dark canvas */
        html:not([data-theme="light"]) .ra-scope .text-\\[\\#7A4D0A\\] { color: #F4C77A !important; }
        /* Informasi Target Acuan (TargetsModal): dark-green #0F5C44 invisible di dark canvas */
        html:not([data-theme="light"]) .ra-scope .text-\\[\\#0F5C44\\] { color: #6BD9AC !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-900 { color: #FFFFFF !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-800 { color: #E6F1FB !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-700 { color: #C5D7E5 !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-600 { color: #B0C5D6 !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-500 { color: #94B0C7 !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-400 { color: #7090A8 !important; }
        html:not([data-theme="light"]) .ra-scope .text-slate-300 { color: #506D85 !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-800 { color: #E6F1FB !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-700 { color: #C5D7E5 !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-600 { color: #B0C5D6 !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-500 { color: #94B0C7 !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-400 { color: #7090A8 !important; }
        html:not([data-theme="light"]) .ra-scope .text-gray-900 { color: #FFFFFF !important; }

        /* Inputs */
        html:not([data-theme="light"]) .ra-scope input,
        html:not([data-theme="light"]) .ra-scope select,
        html:not([data-theme="light"]) .ra-scope textarea {
          background-color: #031628 !important;
          color: #E6F1FB !important;
          border-color: #0C447C !important;
        }
        html:not([data-theme="light"]) .ra-scope input::placeholder,
        html:not([data-theme="light"]) .ra-scope textarea::placeholder { color: #506D85 !important; }
        html:not([data-theme="light"]) .ra-scope select option { background-color: #042C53 !important; color: #E6F1FB !important; }

        /* Hover states */
        html:not([data-theme="light"]) .ra-scope .hover\\:bg-slate-50:hover { background-color: rgba(3,22,40,0.6) !important; }
        html:not([data-theme="light"]) .ra-scope .hover\\:bg-slate-50\\/70:hover { background-color: rgba(3,22,40,0.7) !important; }
        html:not([data-theme="light"]) .ra-scope .hover\\:bg-gray-100:hover { background-color: rgba(12,68,124,0.4) !important; }

        /* Header & Footer */
        html:not([data-theme="light"]) .ra-scope header { background-color: rgba(2,15,28,0.95) !important; border-color: #0C447C !important; }
        html:not([data-theme="light"]) .ra-scope footer { background-color: #042C53 !important; border-color: #0C447C !important; color: #94B0C7 !important; }

        /* Table */
        html:not([data-theme="light"]) .ra-scope thead tr { background-color: #031628 !important; }
        html:not([data-theme="light"]) .ra-scope tbody tr { border-color: #0C447C !important; }

        /* Modal — backdrop sudah dark, body card pakai bg-white → di-darken */
        /* (sudah ditangani oleh .bg-white override di atas) */

        /* Theme toggle pill — pakai dark variant */
        html:not([data-theme="light"]) .ra-scope .theme-toggle-pill {
          --theme-toggle-track: rgba(4,44,83,0.6);
          --theme-toggle-border: #0C447C;
          --theme-toggle-inactive-text: rgba(230,241,251,0.5);
        }
        html[data-theme="light"] .ra-scope .theme-toggle-pill {
          --theme-toggle-track: #F1F5F9;
          --theme-toggle-border: #E2E8F0;
          --theme-toggle-inactive-text: #64748B;
        }

        /* SIDEBAR — light mode override: sidebar default dark, follow theme saat light */
        html[data-theme="light"] .ra-scope .ra-sidebar { background-color: #FAFAFA !important; color: #475569 !important; }
        /* Brand lockup seragam (icon container + judul gradient) — theme-aware */
        .ra-scope .ra-brand-icon { background: linear-gradient(135deg,#633806,#EF9F27); border: 1.5px solid rgba(239,159,39,.4); color: #020F1C; box-shadow: 0 4px 12px rgba(239,159,39,.2); }
        .ra-scope .ra-brand-title { background: linear-gradient(135deg,#EF9F27,#FAC775); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        html[data-theme="light"] .ra-scope .ra-brand-icon { background: linear-gradient(135deg,#8B5CF6,#EC4899) !important; border-color: rgba(139,92,246,.4) !important; color: #FFFFFF !important; box-shadow: 0 4px 12px rgba(139,92,246,.25) !important; }
        html[data-theme="light"] .ra-scope .ra-brand-title { background: linear-gradient(135deg,#8B5CF6,#EC4899); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        html[data-theme="light"] .ra-scope .ra-sidebar .border-\\[\\#0C447C\\] { border-color: #E2E8F0 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .border-\\[\\#0C447C\\]\\/60 { border-color: #E2E8F0 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .bg-\\[\\#020916\\]\\/90 { background-color: #F8FAFC !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-white { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-gray-300 { color: #475569 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-gray-400 { color: #64748B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-gray-500 { color: #94A3B8 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-gray-100 { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .text-gray-200 { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:bg-\\[\\#0C447C\\]\\/30:hover { background-color: #F1F5F9 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:bg-\\[\\#0C447C\\]\\/20:hover { background-color: #F1F5F9 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:bg-\\[\\#0C447C\\]\\/40:hover { background-color: #F1F5F9 !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:text-white:hover { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:text-gray-100:hover { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar .hover\\:text-gray-200:hover { color: #334155 !important; }
        /* Active item gradient — keep accent colors, swap text + border */
        html[data-theme="light"] .ra-scope .ra-sidebar button[class*="from-[#EF9F27]/15"] { color: #1E293B !important; }
        html[data-theme="light"] .ra-scope .ra-sidebar button[class*="from-[#378ADD]/15"] { color: #1E293B !important; }

        /* ═══ LIGHT MODE — PRIMA PINK/UNGU ACCENT (mirror BLUD/Usulan/Admin) ═══ */
        /* Canvas align dengan PRIMA standard */
        html[data-theme="light"] .ra-scope .bg-\\[\\#EEF2F6\\] { background-color: #F5F5F7 !important; }
        /* Off-white surface (kurangi silau light) — mirror PRIMA #FAFAFA, simetris dgn dark .bg-white override */
        html[data-theme="light"] .ra-scope .bg-white { background-color: #FAFAFA !important; }
        html[data-theme="light"] .ra-scope .bg-white\\/95 { background-color: rgba(250,250,250,0.95) !important; }

        /* Brand logo gradient (sidebar) — amber/green → ungu/pink */
        html[data-theme="light"] .ra-scope .ra-sidebar .bg-gradient-to-tr.from-\\[\\#EF9F27\\].to-\\[\\#1D9E75\\] {
          background-image: linear-gradient(to top right, #8B5CF6, #EC4899) !important;
        }
        html[data-theme="light"] .ra-scope .ra-sidebar .bg-gradient-to-tr.from-\\[\\#EF9F27\\].to-\\[\\#1D9E75\\] > div {
          background-color: #FFFFFF !important;
          color: #7C3AED !important;
        }

        /* Sidebar accent "2026" + active dot — amber → ungu */
        html[data-theme="light"] .ra-scope .ra-sidebar .text-\\[\\#EF9F27\\] { color: #7C3AED !important; }

        /* Sidebar active item Data Entry (amber gradient) → purple gradient */
        html[data-theme="light"] .ra-scope .ra-sidebar button.bg-gradient-to-r.from-\\[\\#EF9F27\\]\\/15.to-\\[\\#BA7517\\]\\/15 {
          background-image: linear-gradient(to right, rgba(139,92,246,0.15), rgba(236,72,153,0.15)) !important;
          border-left-color: #8B5CF6 !important;
        }
        html[data-theme="light"] .ra-scope .ra-sidebar button.bg-gradient-to-r.from-\\[\\#EF9F27\\]\\/15.to-\\[\\#BA7517\\]\\/15 svg { color: #8B5CF6 !important; }
        /* Sidebar active item Kinerja (blue gradient) → purple gradient juga di light */
        html[data-theme="light"] .ra-scope .ra-sidebar button.bg-gradient-to-r.from-\\[\\#378ADD\\]\\/15.to-\\[\\#1D9E75\\]\\/15 {
          background-image: linear-gradient(to right, rgba(139,92,246,0.15), rgba(236,72,153,0.15)) !important;
          border-left-color: #EC4899 !important;
        }
        html[data-theme="light"] .ra-scope .ra-sidebar button.bg-gradient-to-r.from-\\[\\#378ADD\\]\\/15.to-\\[\\#1D9E75\\]\\/15 svg { color: #EC4899 !important; }

        /* Main card top stripe gradient (amber→purple→blue) → ungu→pink */
        html[data-theme="light"] .ra-scope .bg-gradient-to-r.from-\\[\\#EF9F27\\].via-\\[\\#7C5CFC\\].to-\\[\\#378ADD\\] {
          background-image: linear-gradient(to right, #8B5CF6, #EC4899) !important;
        }

        /* Indikator Utama title amber stripe + numeric accent */
        html[data-theme="light"] .ra-scope .text-\\[\\#EF9F27\\] { color: #7C3AED !important; }

        /* Backgrounds & borders amber → ungu */
        html[data-theme="light"] .ra-scope .bg-\\[\\#EF9F27\\]\\/5 { background-color: rgba(139,92,246,0.05) !important; }
        html[data-theme="light"] .ra-scope .bg-\\[\\#EF9F27\\]\\/10 { background-color: rgba(139,92,246,0.10) !important; }
        html[data-theme="light"] .ra-scope .bg-\\[\\#EF9F27\\]\\/15 { background-color: rgba(139,92,246,0.15) !important; }
        html[data-theme="light"] .ra-scope .border-\\[\\#EF9F27\\] { border-color: #8B5CF6 !important; }
        html[data-theme="light"] .ra-scope .border-\\[\\#EF9F27\\]\\/20 { border-color: rgba(139,92,246,0.20) !important; }
        html[data-theme="light"] .ra-scope .border-\\[\\#EF9F27\\]\\/40 { border-color: rgba(139,92,246,0.40) !important; }

        /* Hover & focus accents */
        html[data-theme="light"] .ra-scope .hover\\:text-\\[\\#EF9F27\\]:hover { color: #7C3AED !important; }
        html[data-theme="light"] .ra-scope .hover\\:bg-\\[\\#EF9F27\\]\\/5:hover { background-color: rgba(139,92,246,0.05) !important; }
        html[data-theme="light"] .ra-scope .hover\\:bg-\\[\\#EF9F27\\]\\/10:hover { background-color: rgba(139,92,246,0.10) !important; }
        html[data-theme="light"] .ra-scope .hover\\:border-\\[\\#EF9F27\\]:hover { border-color: #8B5CF6 !important; }
        html[data-theme="light"] .ra-scope .hover\\:text-\\[\\#BA7517\\]:hover { color: #6D28D9 !important; }
        html[data-theme="light"] .ra-scope .focus\\:border-\\[\\#EF9F27\\]:focus { border-color: #8B5CF6 !important; }
        html[data-theme="light"] .ra-scope .focus\\:ring-\\[\\#EF9F27\\]:focus { --tw-ring-color: #8B5CF6 !important; }
        html[data-theme="light"] .ra-scope input:focus,
        html[data-theme="light"] .ra-scope select:focus,
        html[data-theme="light"] .ra-scope textarea:focus {
          border-color: #8B5CF6 !important;
          box-shadow: 0 0 0 3px rgba(139,92,246,0.15) !important;
        }

        /* PrimaButton primary di light mode — solid gradient ungu→pink (mirror BLUD btn-primary) */
        html[data-theme="light"] .ra-scope .btn-prima[data-variant="primary"] {
          background: linear-gradient(135deg, #8B5CF6, #EC4899) !important;
          color: #FFFFFF !important;
          border-left: 3px solid transparent !important;
          border: none !important;
        }
        html[data-theme="light"] .ra-scope .btn-prima[data-variant="primary"]:hover:not(:disabled) {
          filter: brightness(1.05);
          box-shadow: 0 4px 12px rgba(139,92,246,0.35) !important;
        }
        html[data-theme="light"] .ra-scope .btn-prima[data-variant="purple"] {
          background: linear-gradient(135deg, #7C3AED, #DB2777) !important;
          color: #FFFFFF !important;
          border-left: 3px solid transparent !important;
          border: none !important;
        }
        html[data-theme="light"] .ra-scope .btn-prima[data-variant="purple"]:hover:not(:disabled) {
          filter: brightness(1.05);
          box-shadow: 0 4px 12px rgba(124,58,237,0.35) !important;
        }

        /* Anggaran chip (MainDashboard) — amber di dark, ungu/pink (tema light) di light */
        .ra-scope .ra-anggaran-chip {
          border: 2px solid #EF9F27; border-radius: 4px;
          box-shadow: 3px 3px 0 rgba(239,159,39,.40);
          background: rgba(239,159,39,.12); padding: 5px 12px;
        }
        html[data-theme="light"] .ra-scope .ra-anggaran-chip {
          border-color: #8B5CF6;
          box-shadow: 3px 3px 0 rgba(139,92,246,.30);
          background: rgba(139,92,246,.10);
        }
        html[data-theme="light"] .ra-scope .ra-anggaran-label { color: #7C3AED !important; }
        html[data-theme="light"] .ra-scope .ra-anggaran-val { color: #6D28D9 !important; }

        /* User chip avatar gradient (header) → ungu/pink */
        html[data-theme="light"] .ra-scope header [style*="EF9F27"][style*="BA7517"],
        html[data-theme="light"] .ra-scope header div[style*="linear-gradient(135deg, #EF9F27, #BA7517)"] {
          background: linear-gradient(135deg, #8B5CF6, #EC4899) !important;
        }

        /* Periode RKPD year picker — green keep, OK */

        /* PDF/Excel/Reset pill quick actions — keep semantic (red/green/amber-warning) */
        /* PDF icon merah, Excel hijau — biarkan. Reset Realisasi pakai amber=warning, biarkan untuk semantic */

        /* SoftSelect full-width override untuk cascading dropdown cell (grid layout).
           DESIGN-SYSTEM rule: native <select> di dark theme WAJIB pakai SoftSelect.
           Default .soft-select = inline-block + minWidth 160px. Override jadi block full-width. */
        .ra-scope .ra-cascade-cell .soft-select { display: block; width: 100%; min-width: 0 !important; }
        .ra-scope .ra-cascade-cell .soft-select-trigger { width: 100%; }
      `}</style>

      {/* Sidebar */}
      <Sidebar
        currentMenu={level}
        viewMode={mode}
        onSelectMenu={handleSelectMenu}
        onSelectDataEntry={handleSelectDataEntry}
        onSelectCetak={handleSelectCetak}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main workspace */}
      <div className="relative flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          selectedYear={tahun}
          onYearChange={handleYearChange}
          username={username}
          role={role}
          initials={initials}
          themePreference={themePreference}
          onLogout={handleLogout}
          notify={notify}
          onDataChanged={() => { void reloadRows(tahun, level); }}
        />

        {/* Centered quick actions pill — Posisi sama dengan source's "Reporting + Reset Data".
            Source: 1 tombol Reporting → diganti 2 tombol (PDF + Excel).
            Source: tombol Reset Data → diganti Reset Realisasi (per indikator aktif, kode 4-digit). */}
        {mode === 'dashboard' && (
          <div className="flex justify-center w-full pt-1.5 pb-0.5 px-4 bg-[#EEF2F6] shrink-0">
            <div className="prima-glowbar">
              <span className="prima-glowbar-clip" aria-hidden="true">
                <span className="prima-glowbar-glow" />
              </span>
              <div className="prima-glowbar-row">
                <DownloadButton
                  variant="pdf"
                  label="PDF"
                  onClick={handleExportPdf}
                  disabled={!activeRow}
                  data-tooltip="Unduh PDF indikator yang dipilih"
                  data-tooltip-pos="below"
                />

                <div className="prima-glowbar-sep" />

                <DownloadButton
                  variant="excel"
                  label="Excel"
                  onClick={handleExportXlsx}
                  disabled={!activeRow}
                  data-tooltip="Unduh Excel indikator yang dipilih"
                  data-tooltip-pos="below"
                />

                <div className="prima-glowbar-sep" />

                <button
                  onClick={handleResetRealisasi}
                  disabled={!activeRow}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-[#F5F7FA] hover:text-[#BA7517] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  data-tooltip="Reset realisasi indikator aktif (TW I-IV → 0)"
                  data-tooltip-pos="below"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#EF9F27]" />
                  <span>Reset Realisasi</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification */}
        {notif && (
          <div className="fixed top-20 right-6 z-40 max-w-sm">
            <div className={`flex items-start gap-3 rounded-2xl p-4 shadow-xl border ${
              notif.type === 'success' ? 'bg-slate-900 border-[#1D9E75]/30 text-white'
              : notif.type === 'warning' ? 'bg-[#BA7517] border-[#EF9F27]/40 text-amber-50'
              : notif.type === 'error' ? 'bg-[#E24B4A] border-[#E24B4A]/40 text-white'
              : 'bg-slate-900 border-[#378ADD]/30 text-sky-50'
            }`}>
              {notif.type === 'success' && <CheckCircle className="h-5 w-5 text-[#1D9E75] shrink-0" />}
              {notif.type === 'warning' && <RotateCcw className="h-5 w-5 text-amber-200 shrink-0" />}
              {notif.type === 'error'   && <AlertTriangle className="h-5 w-5 text-white shrink-0" />}
              {notif.type === 'info'    && <Sparkles className="h-5 w-5 text-[#378ADD] shrink-0" />}
              <div className="flex-1 text-xs font-semibold leading-relaxed">{notif.message}</div>
              <button onClick={() => setNotif(null)} className="text-gray-300 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {mode === 'cetak' ? (
          <CetakPanel tahun={tahun} notify={notify} />
        ) : mode === 'data-entry' ? (
          <DataEntryForm
            level={level}
            rows={rows}
            selectedYear={tahun}
            role={role}
            onReload={() => reloadRows(tahun, level)}
            notify={notify}
          />
        ) : (
          <MainDashboard
            level={level}
            rows={rows}
            selectedYear={tahun}
            selectedSasaran={selectedSasaran}
            selectedProgram={selectedProgram}
            selectedKegiatan={selectedKegiatan}
            selectedSubKegiatan={selectedSubKegiatan}
            selectedIndicator={selectedIndicator}
            setSelectedSasaran={setSelectedSasaran}
            setSelectedProgram={setSelectedProgram}
            setSelectedKegiatan={setSelectedKegiatan}
            setSelectedSubKegiatan={setSelectedSubKegiatan}
            setSelectedIndicator={setSelectedIndicator}
            onOpenQuarterModal={(q) => setActiveQuarter(q.id)}
            onOpenTargetsModal={() => setIsTargetsOpen(true)}
            onOpenDetailModal={() => setIsDetailOpen(true)}
            onChangeJenis={handleChangeJenis}
            onSaveBulanRealisasi={handleSaveBulanRealisasi}
            anggaran={activeAnggaran}
            onOpenMatrix={level === 'sub-kegiatan' ? () => setIsMatrixOpen(true) : undefined}
          />
        )}

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-500 shrink-0">
          <div>
            <strong>{tahun} © PRIMA</strong>, RSJD Dr. Amino Gondohutomo
          </div>
          <div className="flex items-center gap-1">
            <span>Modul Renaksi & Kinerja</span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-[#EF9F27]">PRIMA v1.0</span>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <QuarterModal
        row={activeRow}
        quarterId={activeQuarter}
        onClose={() => setActiveQuarter(null)}
        onSaved={async () => { setActiveQuarter(null); await reloadRows(tahun, level); }}
        notify={notify}
      />

      <TargetsModal
        row={activeRow}
        isOpen={isTargetsOpen}
        onClose={() => setIsTargetsOpen(false)}
        onSaved={async () => { setIsTargetsOpen(false); await reloadRows(tahun, level); }}
        notify={notify}
      />

      <DetailModal
        row={activeRow}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        anggaran={activeAnggaran}
      />

      <ResetRealisasiModal
        row={activeRow}
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        onConfirmed={async () => { setIsResetOpen(false); await reloadRows(tahun, level); }}
        notify={notify}
      />

      <MatrixBulananModal
        isOpen={isMatrixOpen}
        tahun={tahun}
        rows={rows.filter(r => r.level === 'sub-kegiatan')}
        onClose={() => setIsMatrixOpen(false)}
        onSaved={async () => { await reloadRows(tahun, level); }}
        notify={notify}
      />
    </div>
  );
}
