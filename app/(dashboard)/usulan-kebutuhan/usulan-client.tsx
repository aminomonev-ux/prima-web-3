'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
// PERF-C3: exceljs + jspdf + jspdf-autotable di-dynamic-import dalam
// exportExcel/exportPrint handler, BUKAN top-level. Saves ~830KB di initial bundle
// untuk user yang tidak pernah klik tombol Export Excel/PDF.
// (xlsx-js-style → exceljs migration: SDL-Audit v1.1 Phase 4 SDL-H2)
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, FilePlus, FileText, Search, List,
  BarChart2, Users, Clock, PiggyBank,
  ChevronDown, LogOut, ChevronLeft,
  ShieldCheck, Menu as MenuIcon, AlertCircle, CheckCircle2,
  Bell,
  Shield, ClipboardCheck, Building2, Settings,
} from 'lucide-react';
import Tip from '@/components/ui/Tip';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { APP_NAME, ROLE_LABELS, SUBBIDANG_ROLES, BIDANG_ROLES, BIDANG_TO_SUBBIDANG, ROLE_SUBBIDANG_OPTIONS } from '@/lib/constants';
import type { Role } from '@/types';
import { DetailModal } from './_modals/DetailModal';
import { TelaahModal } from './_modals/TelaahModal';
import { PutusanModal } from './_modals/PutusanModal';
import { TahunModal } from './_modals/TahunModal';
import { BidangReviewModal } from './_modals/BidangReviewModal';
import PrimaButton from '@/components/ui/PrimaButton';
import { RekapVerifPanel } from './_panels/RekapVerifPanel';
import { TrackingPanel } from './_panels/TrackingPanel';
// PERF-C2 Tahap 10d (bonus): dynamic import untuk panel heavy + jarang.
// SetPaguPanel, BatasWaktuPanel cuma diakses ADMIN, jarang dibuka.
const SetPaguPanel    = dynamic(() => import('./_panels/SetPaguPanel').then(m => ({ default: m.SetPaguPanel })),       { ssr: false });
const BatasWaktuPanel = dynamic(() => import('./_panels/BatasWaktuPanel').then(m => ({ default: m.BatasWaktuPanel })), { ssr: false });
import { RekapPanel } from './_panels/RekapPanel';
import { DashboardPanel } from './_panels/DashboardPanel';
import { BidangAntrianPanel } from './_panels/BidangAntrianPanel';
import { BidangDataPanel } from './_panels/BidangDataPanel';
import { AntrianPanel } from './_panels/AntrianPanel';
import { DataUsulanPanel } from './_panels/DataUsulanPanel';
// KelolaUserPanel: usePaginatedList + tabel besar — diakses ADMIN only.
const KelolaUserPanel = dynamic(() => import('./_panels/KelolaUserPanel').then(m => ({ default: m.KelolaUserPanel })), { ssr: false });
import { SemuaPanel } from './_panels/SemuaPanel';
import { MilikPanel } from './_panels/MilikPanel';
// HapusUsulanPanel: SUPER_ADMIN only — sangat jarang.
const HapusUsulanPanel = dynamic(() => import('./_panels/HapusUsulanPanel').then(m => ({ default: m.HapusUsulanPanel })), { ssr: false });
// BuatPanel: form editor terbesar (~480 baris). Bukan landing — user buka via sidebar.
const BuatPanel = dynamic(() => import('./_panels/BuatPanel').then(m => ({ default: m.BuatPanel })), { ssr: false });
import {
  KPIData, UsulanHeader, UsulanItem, ItemForm, UserRow, NotifRow,
  ADMIN_ANTRIAN_STATUSES, HIDE_DATA_ADMIN_STATUSES,
} from './_types';
import type { Panel } from './_types';
import { getPanels } from './_utils';
import { exportExcel, exportPrint } from './_exports';
import { fetchJson } from '@/lib/shared/api';
import { usePaginatedList } from '@/lib/shared/hooks';
import ThemeToggle from '@/components/ui/ThemeToggle';

// PERF-W3: SWR untuk dedup & cache fetch endpoint KPI yang berat
// (GROUP BY usulan_items). Sebelumnya fetchKPI pakai manual ref-cache
// 30s, tapi fetchRekap di-hit terpisah tanpa cache → double load.
import useSWR, { useSWRConfig } from 'swr';

// SWR fetcher util — throw kalau ok:false supaya SWR error state benar.
// Generic <T> matches `data` shape dari ApiResult<T>.
async function swrFetcher<T>(url: string): Promise<T> {
  const d = await fetchJson<T>(url);
  if (!d.ok) throw new Error(d.message);
  return d.data as T;
}


interface Props { userId: number; role: Role; username: string; themePreference: 'dark' | 'light'; }

// PERF-C2 (Tahap 1 foundation): Panel type + KPIData, UsulanHeader, UsulanItem,
// ItemForm, UserRow, TelaahDecision, PutusanDecision, NotifRow,
// STATUS_BADGE, STATUS_GROUPS, HIDE_BIDANG_STATUSES + format helpers
// (fmtRp/fmtTgl/fmtNum/parseNum) sekarang di-import dari ./_types
// (sumber di sibling _types.ts level dengan _modals/ & future _panels/).

export default function UsulanClient({ userId, role, username, themePreference }: Props) {
  const router = useRouter();
  const [panel, setPanel]         = useState<Panel>('dashboard');
  const [sidebarOpen, setSidebar] = useState(false);
  // Desktop sidebar collapse — terpisah dari sidebarOpen (mobile drawer).
  // Persist preference di localStorage supaya tetap saat reload.
  const [sidebarHidden, setSidebarHidden] = useState(false);
  // Sidebar grouping — track which group dropdowns are open (mutually exclusive saat collapsed)
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useEffect(() => {
    try { setSidebarHidden(localStorage.getItem('prima_sidebar_hidden') === '1'); } catch {}
  }, []);
  // Click-outside flyout panel saat sidebar collapsed
  useEffect(() => {
    if (!sidebarHidden || !openGroup) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.('.ua-group-wrap')) setOpenGroup(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [sidebarHidden, openGroup]);
  const toggleSidebar = useCallback(() => {
    setSidebarHidden(v => {
      const next = !v;
      try { localStorage.setItem('prima_sidebar_hidden', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const [dropOpen, setDropOpen]   = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = currentTheme === 'light';
  const dropRef  = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifList,  setNotifList]  = useState<NotifRow[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const panels    = getPanels(role);
  const roleLabel = ROLE_LABELS[role] ?? role;
  const initial   = username.charAt(0).toUpperCase();
  const isAdmin   = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const subBidangOptions: string[] = (() => {
    if ((BIDANG_ROLES as readonly string[]).includes(role))
      return BIDANG_TO_SUBBIDANG[role] ?? [...(SUBBIDANG_ROLES as readonly string[])];
    if (ROLE_SUBBIDANG_OPTIONS[role])
      return ROLE_SUBBIDANG_OPTIONS[role];
    return [...(SUBBIDANG_ROLES as readonly string[])];
  })();
  const defaultSubBidang = subBidangOptions.length === 1 ? subBidangOptions[0] : '';


  // BUG-FIX (post PERF-W3): kpi derived langsung dari SWR data, BUKAN useState +
  // sync useEffect. Pola lama menyebabkan first-render dashboard kosong: SWR
  // belum resolve → kpi=null → conditional {kpi && <cards/>} = false → tampilan
  // cuma ClockCard. Setelah kpiData populated, useEffect setKpi baru jalan di
  // commit berikutnya. Race ini hilang dengan derived value (read kpiData tiap
  // render — paint pertama setelah fetch resolve langsung punya kpi).
  const [kpiLd, setKpiLd] = useState(true);

  
  // PERF-C2 Tahap 10b: kirSemModal pindah ke MilikPanel (internal).
  // kirSemLoading tetap di shell karena handler doKirimSemua disini.
  const [kirSemLoading, setKirSemLoading] = useState(false);
  const [filterTahun, setFilterTahun]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterJenisMilik, setFilterJenisMilik] = useState('');
  const [filterScope, setFilterScope]   = useState<'milik'|'satu_bidang'>('milik');
  const searchRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  
  // PERF-C2 Tahap 10d: form-only refs (subBidangRef/jenisBelanjaRef/fileInputRef/
  // namaBarangRef/qtyRef/hargaRef) pindah ke BuatPanel internal.
  // buatErrRef TETAP di shell karena dipakai useEffect autoscroll banner error
  // (depends on buatErr yang juga di shell).
  const buatErrRef    = useRef<HTMLDivElement>(null);

  
  const [filterBidangSemua, setFilterBidangSemua] = useState('');
  const [filterStatusSemua, setFilterStatusSemua] = useState('');
  const [filterSearchSemua, setFilterSearchSemua] = useState('');
  const [filterTahunSemua, setFilterTahunSemua]   = useState('');
  const [filterJenisSemua, setFilterJenisSemua]   = useState('');
  const searchSemuaRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  
  const [fTahun, setFTahun]           = useState('');
  const [fSubBidang, setFSubBidang]   = useState(defaultSubBidang);
  const [fJenisBelanja, setFJenisBelanja] = useState('');
  const [items, setItems]             = useState<ItemForm[]>([]);
  // PERF-C2 Tahap 10d: currentItem & editingIdx pindah ke BuatPanel internal.
  const [editingUsulanId, setEditingUsulanId]       = useState<number|null>(null);
  const [editingUsulanNo, setEditingUsulanNo]       = useState('');
  const [editingUpdatedAt, setEditingUpdatedAt]     = useState<string|null>(null);
  const [buatLoading, setBuatLoading] = useState(false);
  const [buatErr, setBuatErr]         = useState('');
  const [buatOk, setBuatOk]           = useState('');
  const [showTahunModal, setShowTahunModal]   = useState(false);
  const [fJenis, setFJenis] = useState<'MURNI'|'PERUBAHAN'|'PERGESERAN'|''>('');
  // PERF-C2 Tahap 10d: resetConfirmOpen/highlightField/uploadingFile/uploadFileErr
  // pindah ke BuatPanel internal (form-only state).
  const [noUsulanPreview, setNoUsulanPreview] = useState('');
  // PERF-W6: clockTime dipindah ke leaf ClockCard. Buat form pakai todayDate (set once on mount).
  const [todayDate, setTodayDate]             = useState<Date|null>(null);
  const [confirmDlg, setConfirmDlg]           = useState<{msg:string;onOk:()=>void}|null>(null);
  const [toast, setToast]                     = useState<{text:string;isErr:boolean}|null>(null);
  const toastTimerRef  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const detailCacheRef = useRef<Map<number,{header:UsulanHeader;items:UsulanItem[]}>>(new Map());
  const configLoadedRef = useRef(false);


  // PERF-C2 Tahap 8: TrackingPanel self-contained — state internal di panel.

  
  const [filterStatusDU, setFilterStatusDU]     = useState('');
  const [filterBidangDU, setFilterBidangDU]     = useState('');
  const [filterTahunDU,  setFilterTahunDU]      = useState('');
  const [filterSearchDU, setFilterSearchDU]     = useState('');
  const [filterJenisDU,  setFilterJenisDU]      = useState('');
  const duSearchRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [filterStatusDA, setFilterStatusDA]     = useState('');
  const [filterBidangDA, setFilterBidangDA]     = useState('');
  const [filterTahunDA,  setFilterTahunDA]      = useState('');
  const [filterSearchDA, setFilterSearchDA]     = useState('');
  const [filterJenisDA,  setFilterJenisDA]      = useState('');
  const daSearchRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [filterAntrianTahun,  setFilterAntrianTahun]  = useState('');
  const [filterAntrianBidang, setFilterAntrianBidang] = useState('');
  const [filterAntrianStatus, setFilterAntrianStatus] = useState('');

  
  const [filterBidangAntrianTahun,  setFilterBidangAntrianTahun]  = useState('');
  const [filterBidangAntrianSearch, setFilterBidangAntrianSearch] = useState('');
  
  const [filterBidangDataTahun,  setFilterBidangDataTahun]  = useState('');
  const [filterBidangDataStatus, setFilterBidangDataStatus] = useState('');
  const [filterBidangDataJenis,  setFilterBidangDataJenis]  = useState('');

  // PERF-C2 Tahap 7: BidangReviewModal self-contained — shell hanya butuh
  // header untuk trigger render (modal own items/decisions/updatedAt internal).
  const [bidangRevHeader, setBidangRevHeader] = useState<UsulanHeader|null>(null);

  
  const [rekapData, setRekapData]   = useState<{sub_bidang:string;cnt:number;total_est:number;disetujui:number;ditolak:number;belum_ditelaah:number;ditelaah:number;ditolak_admin:number;direvisi_admin:number;nominal_admin:number;nominal_kasubag:number;nominal_disetujui:number}[]>([]);
  const [rekapLoading, setRekapLoading] = useState(false);

  
  // O3: filterUserStatus dihapus — aksi nonaktif/aktifkan dipindah ke /admin
  // (canonical user management). Panel kelola-user di usulan = read-only status
  // + ubah role saja.
  const [userSearchQ, setUserSearchQ]   = useState('');
  const userSearchRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  
  // PERF-C2 Tahap 10c: hapusConfirm/hapusKonfirmText/hapusAllConfirm/hapusAllText
  // pindah ke HapusUsulanPanel (internal modal state).
  const [hapusSearch, setHapusSearch]   = useState('');
  const [hapusBidang, setHapusBidang]   = useState('');
  const [hapusOk, setHapusOk]           = useState('');
  const [hapusAllLoading, setHapusAllLoading] = useState(false);
  const [hapusAllProgress, setHapusAllProgress] = useState({done:0, total:0});


  const [hapusErr, setHapusErr]         = useState('');

  // PERF-W2: usePaginatedList — limit:50 (bukan 20 default), error ke setHapusErr (bukan toast).
  const hapusHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: { scope: 'semua', search: hapusSearch.trim(), bidang: hapusBidang },
    enabled: panel === 'hapus-usulan',
    limit: 50,
    onError: (msg) => setHapusErr(msg),
  });
  const {
    data: hapusData,
    loading: hapusLoading,
    page: hapusPage,
    total: hapusTotal,
    totalPages: hapusPages,
  } = hapusHook;
  const fetchHapus = hapusHook.setPage;


  // PERF-C2 Tahap 8: bwMulai/bwSelesai/bwPesan/bwAktif tetap di shell
  // karena dipakai juga oleh ClockCard di header. bwLoading/bwOk/bwErr
  // pindah ke BatasWaktuPanel (internal).
  const [bwMulai, setBwMulai]     = useState('');
  const [bwSelesai, setBwSelesai] = useState('');
  const [bwPesan, setBwPesan]     = useState('');
  const [bwAktif, setBwAktif]     = useState(false);

  
  // PERF-C2 Tahap 8: SetPaguPanel self-contained — shell hanya simpan
  // paguCurrent (untuk display + reuse di tempat lain).
  const [paguCurrent, setPaguCurrent] = useState(0);

  
  const [detailOpen, setDetailOpen]   = useState(false);
  const [detailData, setDetailData]   = useState<{header:UsulanHeader;items:UsulanItem[]}|null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revisiEdits, setRevisiEdits] = useState<Record<number,{spesifikasi?:string;qty?:number;harga_est?:number}>>({});

  
  // PERF-C2 Tahap 4: TelaahModal self-contained — shell hanya butuh header
  // untuk trigger render (modal render kalau header truthy).
  const [telaahHeader, setTelaahHeader] = useState<UsulanHeader|null>(null);

  
  // PERF-C2 Tahap 5: PutusanModal self-contained — shell hanya butuh header.
  const [putusanHeader, setPutusanHeader] = useState<UsulanHeader|null>(null);
  const [bulkModal,   setBulkModal]   = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCount,   setBulkCount]   = useState<{total_item:number;total_header:number}|null>(null);

  const cy = new Date().getFullYear();
  const tahunList = Array.from({length: cy+2-2024+1}, (_,i) => String(cy+2-i)); 

  

  // PERF-W3: KPI endpoint berat (GROUP BY usulan_items) — pakai SWR dengan
  // dedupingInterval 30s. Pindah panel = pakai cache (no re-fetch). fetchRekap
  // share cache yang sama (slice .chartBidang) — single source of truth.
  const kpiEnabled = panel === 'dashboard' || panel === 'semua' || panel === 'antrian'
                     || panel === 'rekap'   || panel === 'rekap-verif' || panel === 'data-admin';
  const { data: kpiData, isLoading: kpiSwrLoading, isValidating: kpiSwrValidating } = useSWR<KPIData>(
    kpiEnabled ? '/api/usulan/kpi' : null,
    swrFetcher,
    { dedupingInterval: 30_000, revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true },
  );
  const { mutate: swrMutate } = useSWRConfig();

  // Derived: kpi available di paint pertama setelah SWR resolve (tanpa sync lag).
  const kpi = kpiData ?? null;

  // Sync loading: pakai isLoading saja supaya force-revalidate (mutate) tidak
  // memunculkan skeleton di seluruh KPI card (cukup background refresh).
  useEffect(() => { setKpiLd(kpiSwrLoading); }, [kpiSwrLoading]);

  // fetchKPI(force) — public API tetap, internal pakai SWR mutate. Force=true
  // bypass dedup window → trigger revalidate. Force=false hanya revalidate
  // kalau cache sudah stale (>30s).
  // BUG-FIX (post PERF-W3): kpiSwrValidating BUKAN deps useCallback. SWR
  // validating flip false→true→false setiap fetch → fetchKPI ref churn →
  // useEffect `if (panel==='dashboard') fetchKPI()` re-fire infinite loop.
  // Solusi: baca kpiSwrValidating via ref supaya fetchKPI ref stabil.
  const kpiValidatingRef = useRef(false);
  useEffect(() => { kpiValidatingRef.current = kpiSwrValidating; }, [kpiSwrValidating]);
  const fetchKPI = useCallback(async (force = false) => {
    await swrMutate('/api/usulan/kpi', undefined, { revalidate: force || !kpiValidatingRef.current });
  }, [swrMutate]);

  // bfcache & session guard — cegah akun lain muncul saat klik back
  useEffect(() => {
    const validate = async () => {
      const d = await fetchJson<unknown>('/api/auth/me', { cache: 'no-store' });
      const meId = (d as { userId?: unknown }).userId;
      if (!d.ok || String(meId) !== String(userId)) {
        window.location.replace('/login');
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { validate(); window.location.reload(); }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') validate();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);

  useEffect(() => {
    if (!dropOpen && !notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropOpen  && dropRef.current  && !dropRef.current.contains(e.target as Node))  setDropOpen(false);
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen, notifOpen]);

  // BUG-FIX: useEffect manual fetchKPI() di-hapus. SWR sudah auto-fetch saat
  // kpiEnabled toggle ke true (panel switch). Manual call menyebabkan race
  // dengan useSWR initial fetch → cache thrash → dashboard kosong pertama kali.

  // PERF-W2: usePaginatedList — panel utama user, 5 filter.
  // BUG-W5 clamp logic + PERF-W4 abort sudah di-handle di hook.
  const milikHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: {
      scope: filterScope,
      tahun: filterTahun, status: filterStatus, search: filterSearch,
      jenis: filterJenisMilik,
    },
    enabled: panel === 'milik',
    onError: (msg) => showToast(msg),
  });
  const {
    data: milikData,
    loading: milikLoading,
    page: milikPage,
    total: milikTotal,
    totalPages: milikPages,
  } = milikHook;
  const fetchMilik = milikHook.setPage;

  // PERF-W2: usePaginatedList — 5 filter.
  // ADMIN: scope antrian_admin = hanya kelompok yang masih punya item DIAJUKAN
  // (selesai telaah → pindah ke panel Data Admin). SUPER_ADMIN tetap lihat semua.
  const semuaHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: {
      scope: role === 'ADMIN' ? 'antrian_admin' : 'semua',
      bidang: filterBidangSemua, status: filterStatusSemua,
      search: filterSearchSemua, tahun: filterTahunSemua, jenis: filterJenisSemua,
    },
    enabled: panel === 'semua',
    onError: (msg) => showToast(msg),
  });
  const {
    data: semuaData,
    loading: semuaLoading,
    page: semuaPage,
    total: semuaTotal,
    totalPages: semuaPages,
  } = semuaHook;
  const fetchSemua = semuaHook.setPage;

  // PERF-W2: usePaginatedList — defaultStatus role-based dihitung inline.
  // ADMIN_KASUBAG default lihat status DITELAAH (mereka yg approve setelah telaah),
  // role lain (Admin) default lihat DIPROSES (queue masuk).
  const antrianStatus = filterAntrianStatus || (role === 'ADMIN_KASUBAG' ? 'DITELAAH' : 'DIPROSES');
  const antrianHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: {
      scope: 'semua', status: antrianStatus,
      tahun: filterAntrianTahun, bidang: filterAntrianBidang,
    },
    enabled: panel === 'antrian',
    onError: (msg) => showToast(msg),
  });
  const {
    data: antrianData,
    loading: antrianLoading,
    page: antrianPage,
    total: antrianTotal,
    totalPages: antrianPages,
  } = antrianHook;
  const fetchAntrian = antrianHook.setPage;

  // BUG-FIX: KPI di panel antrian sudah di-handle SWR via kpiEnabled (auto
  // fetch on toggle true). Manual fetchKPI redundant + bikin race condition.

  // PERF-W2: usePaginatedList — 5 filter (DU = panel "Data Usulan" / admin view).
  const dataUsulanHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: {
      scope: 'semua',
      status: filterStatusDU, bidang: filterBidangDU, tahun: filterTahunDU,
      search: filterSearchDU, jenis: filterJenisDU,
    },
    enabled: panel === 'data-usulan',
    onError: (msg) => showToast(msg),
  });
  const {
    data: dataUsulanData,
    loading: dataUsulanLoading,
    page: dataUsulanPage,
    total: dataUsulanTotal,
    totalPages: dataUsulanPages,
  } = dataUsulanHook;
  const fetchDataUsulan = dataUsulanHook.setPage;

  // Panel "Data Admin": kelompok yang telaah admin-nya sudah tuntas (scope data_admin).
  const dataAdminHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: {
      scope: 'data_admin',
      status: filterStatusDA, bidang: filterBidangDA, tahun: filterTahunDA,
      search: filterSearchDA, jenis: filterJenisDA,
    },
    enabled: panel === 'data-admin',
    onError: (msg) => showToast(msg),
  });
  const {
    data: dataAdminData,
    loading: dataAdminLoading,
    page: dataAdminPage,
    total: dataAdminTotal,
    totalPages: dataAdminPages,
  } = dataAdminHook;
  const fetchDataAdmin = dataAdminHook.setPage;

  // PERF-W2: usePaginatedList — bundles loading/page/total/clamp/abort.
  const bidangAntrian = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: { scope: 'bidang_antrian', tahun: filterBidangAntrianTahun, search: filterBidangAntrianSearch },
    enabled: panel === 'bidang-antrian',
    onError: (msg) => showToast(msg),
  });
  const {
    data: bidangAntrianData,
    loading: bidangAntrianLoading,
    page: bidangAntrianPage,
    total: bidangAntrianTotal,
    totalPages: bidangAntrianPages,
  } = bidangAntrian;
  const fetchBidangAntrian = bidangAntrian.setPage;

  // PERF-W2: usePaginatedList — bundles loading/page/total/clamp/abort.
  const bidangDataHook = usePaginatedList<UsulanHeader>({
    endpoint: '/api/usulan',
    params: { scope: 'bidang_data', tahun: filterBidangDataTahun, status: filterBidangDataStatus, jenis: filterBidangDataJenis },
    enabled: panel === 'bidang-data',
    onError: (msg) => showToast(msg),
  });
  const {
    data: bidangDataList,
    loading: bidangDataLoading,
    page: bidangDataPage,
    total: bidangDataTotal,
    totalPages: bidangDataPages,
  } = bidangDataHook;
  const fetchBidangData = bidangDataHook.setPage;

  // PERF-W3: fetchRekap dulu hit /api/usulan/kpi terpisah tanpa cache. Sekarang
  // share SWR cache yang sama dengan fetchKPI — slice .chartBidang dari kpiData.
  // Effect dijalankan saat kpiData update (auto-sync, no separate fetch).
  useEffect(() => {
    if ((panel === 'rekap' || panel === 'rekap-verif') && kpiData) {
      setRekapData(kpiData.chartBidang as Parameters<typeof setRekapData>[0]);
    }
  }, [panel, kpiData]);

  // Loading state untuk panel rekap mengikuti SWR loading
  useEffect(() => {
    if (panel === 'rekap' || panel === 'rekap-verif') setRekapLoading(kpiSwrLoading);
  }, [panel, kpiSwrLoading]);

  const fetchConfig = useCallback(async (force = false) => {
    if (!force && configLoadedRef.current) return;
    const d = await fetchJson<Record<string,string>>('/api/config');
    if (d.ok && d.data) {
      const cfg = d.data;
      if (cfg.batas_mulai)   setBwMulai(cfg.batas_mulai);
      if (cfg.batas_selesai) setBwSelesai(cfg.batas_selesai);
      if (cfg.batas_pesan)   setBwPesan(cfg.batas_pesan);
      setBwAktif(cfg.batas_aktif === 'true');
      if (cfg.pagu_blud)     setPaguCurrent(Number(cfg.pagu_blud) || 0);
      configLoadedRef.current = true;
    }
    // React Compiler: setState refs declared explicitly (stable, but rule needs presence).
  }, [setBwMulai, setBwSelesai, setBwPesan, setBwAktif, setPaguCurrent]);

  useEffect(() => {
    if (panel === 'dashboard' || panel === 'batas-waktu' || panel === 'set-pagu' || panel === 'buat') fetchConfig();
  }, [panel, fetchConfig]);

  
  // PERF-W6: Set today date once on mount (hydration-safe). Tidak butuh ticking
  // per-detik karena field "Tanggal" di Buat form cuma display tanggal (bukan jam).
  useEffect(() => { setTodayDate(new Date()); }, []);

  
  useEffect(() => {
    if (!editingUsulanId && fSubBidang && fTahun && fJenis) {
      const p = new URLSearchParams({ sub_bidang: fSubBidang, tahun: fTahun, jenis: fJenis });
      (async () => {
        const d = await fetchJson<unknown>(`/api/usulan/preview-no?${p}`);
        if (d.ok) setNoUsulanPreview((d as { no_usulan?: string }).no_usulan || '');
      })();
    } else if (!editingUsulanId) {
      setNoUsulanPreview('');
    }
  }, [fSubBidang, fTahun, fJenis, editingUsulanId]);

  
  useEffect(() => {
    if (panel === 'buat' && !editingUsulanId) {

      const t = setTimeout(() => {
        setFTahun(prev => {
          if (!prev) { setShowTahunModal(true); }
          return prev;
        });
      }, 50);
      return () => clearTimeout(t);
    }

  }, [panel, editingUsulanId]);

  // UX: auto-scroll ke banner error saat validasi gagal di Buat/Edit Usulan
  // (user di posisi scroll-bawah klik Save tidak akan tahu error muncul kalau
  // banner tetap di atas layar). Skip kalau banner sudah visible — supaya
  // tidak ganggu flow addToList yang sudah scroll ke field via scrollFocus().
  useEffect(() => {
    if (!buatErr) return;
    const tid = setTimeout(() => {
      const banner = buatErrRef.current;
      if (!banner) return;
      const rect = banner.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 40;
      if (!isVisible) {
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 350);
    return () => clearTimeout(tid);
  }, [buatErr]);

  // PERF-W2: usePaginatedList — onError fallback message preserved.
  const usersHook = usePaginatedList<UserRow>({
    endpoint: '/api/admin/users',
    params: { search: userSearchQ },
    enabled: panel === 'kelola-user',
    onError: (msg) => showToast(msg || 'Gagal memuat user.'),
  });
  const {
    data: userList,
    loading: userLoading,
    page: userPage,
    total: userTotal,
    totalPages: userPages,
  } = usersHook;
  const fetchUsers = usersHook.setPage;

  // fetchHapus → bidangAntrian.setPage via usePaginatedList hook (declared above)




  function onSearch(v: string) {
    setFilterSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(()=>fetchMilik(1), 350);
  }
  function onSearchSemua(v: string) {
    setFilterSearchSemua(v);
    if (searchSemuaRef.current) clearTimeout(searchSemuaRef.current);
    searchSemuaRef.current = setTimeout(()=>fetchSemua(1), 350);
  }
  function onSearchDA(v: string) {
    setFilterSearchDA(v);
    if (daSearchRef.current) clearTimeout(daSearchRef.current);
    daSearchRef.current = setTimeout(()=>fetchDataAdmin(1), 350);
  }
  function onSearchUser(v: string) {
    setUserSearchQ(v);
    if (userSearchRef.current) clearTimeout(userSearchRef.current);
    userSearchRef.current = setTimeout(()=>fetchUsers(1), 350);
  }

  

  async function doSubmit(isDraft: boolean) {
    setBuatErr(''); setBuatOk('');
    if (!fSubBidang)    { setBuatErr('Pilih sub bidang terlebih dahulu'); return; }
    if (!fTahun)        { setBuatErr('Pilih tahun anggaran terlebih dahulu'); return; }
    if (!fJenis)        { setBuatErr('Pilih jenis usulan (MURNI/PERUBAHAN/PERGESERAN) terlebih dahulu'); return; }
    if (!items.length)  { setBuatErr('Tambahkan minimal 1 item ke daftar terlebih dahulu'); return; }
    const missingSatuanIdx = items.findIndex(i => !i.satuan || !String(i.satuan).trim());
    if (missingSatuanIdx >= 0) {
      const it = items[missingSatuanIdx];
      const label = it.nama_barang?.trim() || `#${missingSatuanIdx + 1}`;
      setBuatErr(`Item "${label}" belum memilih satuan. Lengkapi kolom Satuan untuk semua item sebelum menyimpan.`);
      return;
    }
    setBuatLoading(true);
    try {
      const buildItems = (arr: ItemForm[]) => arr.map(i=>({
        nama_barang:i.nama_barang, spesifikasi:i.spesifikasi,
        qty:Number(i.qty)||1, satuan:i.satuan, harga_est:Number(i.harga_est)||0,
        prioritas:i.prioritas, alasan:i.alasan,
        url_merk1:i.url_merk1, url_merk2:i.url_merk2, url_merk3:i.url_merk3, file_url:i.file_url,
      }));

      const groupMap: Record<string, { sub_bidang: string; jenis_belanja: string; items: ItemForm[] }> = {};
      items.forEach(item => {
        const key = `${item.sub_bidang||fSubBidang}|||${item.jenis_belanja||fJenisBelanja}`;
        if (!groupMap[key]) groupMap[key] = { sub_bidang:item.sub_bidang||fSubBidang, jenis_belanja:item.jenis_belanja||fJenisBelanja, items:[] };
        groupMap[key].items.push(item);
      });

      if (editingUsulanId) {
        const originalKey = `${fSubBidang}|||${fJenisBelanja}`;
        const originalGroup = groupMap[originalKey];
        const newGroups = Object.entries(groupMap).filter(([k])=>k!==originalKey).map(([,g])=>g);

        if (originalGroup) {
          const d = await fetchJson(`/api/usulan/${editingUsulanId}`, {
            method: 'PATCH',
            body: JSON.stringify({action:'update_draft',sub_bidang:fSubBidang,tahun_anggaran:fTahun,jenis_usulan:fJenis||'MURNI',jenis_belanja:fJenisBelanja,items:originalGroup.items.map(i=>({...buildItems([i])[0]})),is_draft:isDraft,updated_at_check:editingUpdatedAt}),
          });
          if (!d.ok) { setBuatErr(d.message||'Gagal menyimpan'); return; }
        }

        if (newGroups.length) {
          const d = await fetchJson('/api/usulan', {
            method: 'POST',
            body: JSON.stringify({tahun_anggaran:fTahun,jenis_usulan:fJenis||'MURNI',groups:newGroups.map(g=>({sub_bidang:g.sub_bidang,jenis_belanja:g.jenis_belanja,items:buildItems(g.items)})),is_draft:isDraft}),
          });
          if (!d.ok) { setBuatErr(d.message||'Gagal membuat usulan baru'); return; }
        }
      } else {
        const groups = Object.values(groupMap).map(g=>({sub_bidang:g.sub_bidang,jenis_belanja:g.jenis_belanja,items:buildItems(g.items)}));
        const d = await fetchJson('/api/usulan', {
          method: 'POST',
          body: JSON.stringify({tahun_anggaran:fTahun,jenis_usulan:fJenis||'MURNI',groups,is_draft:isDraft}),
        });
        if (!d.ok) { setBuatErr(d.message||'Gagal menyimpan'); return; }
      }

      // BuatPanel will unmount when setPanel('milik') below; currentItem/editingIdx
      // reset implicitly on next mount.
      setItems([]);
      setEditingUsulanId(null); setEditingUsulanNo(''); setEditingUpdatedAt(null);
      setFSubBidang(defaultSubBidang); setFJenisBelanja(''); setFTahun(''); setNoUsulanPreview('');
      fetchKPI(true); fetchMilik(1);
      showToast(isDraft ? 'Draft berhasil disimpan.' : 'Usulan berhasil dikirim.', false);
      setPanel('milik');
    } finally { setBuatLoading(false); }
  }

  
  async function openEditDraft(u: UsulanHeader) {
    setBuatErr(''); setBuatOk('');
    try {
      const d = await fetchJson<{ header: Record<string,unknown>; items: UsulanItem[] }>(`/api/usulan/${u.id}`);
      if (!d.ok) { showToast(d.message || 'Gagal memuat draft'); return; }
      if (!d.data) { showToast('Data draft tidak valid'); return; }
      const { header, items: rawItems } = d.data;

      
      const tahunMatch = (u.no_usulan||'').match(/^UA-(\d{4})/);
      const tahun = tahunMatch ? tahunMatch[1] : String(new Date().getFullYear());

      
      const loadedItems: ItemForm[] = rawItems.map(it => ({
        id:          crypto.randomUUID(),
        nama_barang: it.nama_barang  || '',
        spesifikasi: it.spesifikasi  || '',
        qty:         it.qty          || 1,
        satuan:      it.satuan       || 'Unit',
        harga_est:   it.harga_est    || 0,
        prioritas:   (it.prioritas as 'TINGGI'|'SEDANG'|'RENDAH') || 'SEDANG',
        alasan:      it.alasan       || '',
        url_merk1:   it.url_merk1    || '',
        url_merk2:   it.url_merk2    || '',
        url_merk3:   it.url_merk3    || '',
        file_url:    it.file_url     || '',
        sub_bidang:  it.sub_bidang   || String((header as Record<string,unknown>).sub_bidang || ''),
        jenis_belanja:  it.jenis_belanja   || '',
      }));

      setFTahun(tahun);
      setFSubBidang(u.sub_bidang);
      setFJenisBelanja((header.jenis_belanja as string)||'');
      setItems(loadedItems);
      // BuatPanel mounts on setPanel('buat') below with fresh currentItem/editingIdx.
      setEditingUsulanId(u.id);
      setEditingUsulanNo(u.no_usulan);
      setEditingUpdatedAt(String(header.updated_at ?? ''));
      setBuatOk(`Draft ${u.no_usulan} dimuat — ${loadedItems.length} item. Tambah item baru atau edit item yang ada.`);
      setPanel('buat');
    } catch { showToast('Gagal memuat draft.'); }
  }

  function doHapusMilik(u: UsulanHeader) {
    setConfirmDlg({
      msg: `Hapus usulan ${u.no_usulan}?`,
      onOk: async () => {
        const d = await fetchJson(`/api/usulan/${u.id}`, { method: 'DELETE' });
        if (d.ok) { detailCacheRef.current.delete(u.id); fetchMilik(milikPage); fetchKPI(true); showToast('Usulan dihapus.', false); }
        else showToast(d.message || 'Gagal menghapus.');
      },
    });
  }

  function doCancelByCreator(u: UsulanHeader) {
    // BUG-W4: pengusul cancel usulan yang masih DIAJUKAN_REVIEW. Item revert ke DRAFT,
    // bidang dapat notifikasi, audit log USULAN_CANCEL.
    setConfirmDlg({
      msg: `Batalkan usulan ${u.no_usulan}? Usulan akan kembali ke Draft dan bisa diedit ulang. Bidang akan diberitahu.`,
      onOk: async () => {
        const d = await fetchJson(`/api/usulan/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'cancel_by_creator' }),
        });
        if (d.ok) {
          detailCacheRef.current.delete(u.id);
          fetchMilik(milikPage);
          fetchKPI(true);
          showToast(d.message || 'Usulan dibatalkan.', false);
        } else {
          showToast(d.message || 'Gagal membatalkan usulan.');
        }
      },
    });
  }

  function doAjukan(u: UsulanHeader) {
    setConfirmDlg({
      msg: `Kirim usulan ${u.no_usulan}?`,
      onOk: async () => {
        const d = await fetchJson(`/api/usulan/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'ajukan' }),
        });
        if (d.ok) { detailCacheRef.current.delete(u.id); fetchMilik(milikPage); fetchKPI(true); showToast(d.message || 'Berhasil.', false); }
        else showToast(d.message || 'Gagal mengirim.');
      },
    });
  }

  async function doKirimSemua() {
    setKirSemLoading(true);
    try {
      const d = await fetchJson('/api/usulan', { method: 'PUT' });
      if (d.ok) {
        detailCacheRef.current.clear();
        fetchMilik(1);
        fetchKPI(true);
        showToast(d.message || 'Semua usulan berhasil dikirim.', false);
      } else {
        showToast(d.message || 'Gagal mengirim.');
      }
    } finally {
      setKirSemLoading(false);
      // Modal close handled by MilikPanel after await success.
    }
  }

  async function doHapus(u: UsulanHeader, konfirmText: string) {
    // BUG-W6: defensive — UI button sudah disabled kalau text != 'HAPUS',
    // tapi guard di handler mencegah bypass via devtools / race condition.
    if (konfirmText !== 'HAPUS') {
      setHapusErr('Ketik HAPUS di kolom konfirmasi terlebih dahulu.');
      return;
    }
    setHapusErr(''); setHapusOk('');
    const d = await fetchJson<{ message: string }>(`/api/usulan/${u.id}`, { method: 'DELETE' });
    if (d.ok) {
      detailCacheRef.current.delete(u.id);
      setHapusOk(d.message || 'Usulan dihapus.');
      hapusHook.mutate(prev => prev.filter(x => x.id !== u.id));
      fetchKPI(true);
    } else {
      setHapusErr(d.message);
    }
  }

  async function doHapusSemua(konfirmText: string) {
    if (konfirmText !== 'HAPUS SEMUA') {
      setHapusErr('Ketik HAPUS SEMUA di kolom konfirmasi terlebih dahulu.');
      return;
    }
    setHapusErr(''); setHapusOk('');
    setHapusAllLoading(true);
    try {
      // 1) Kumpulkan semua ID yang match filter saat ini (semua halaman)
      const ids: number[] = [];
      let pg = 1;
      while (true) {
        const p = new URLSearchParams({scope:'semua', page:String(pg), limit:'100'});
        if (hapusSearch.trim()) p.set('search', hapusSearch.trim());
        if (hapusBidang)        p.set('bidang', hapusBidang);
        const d = await fetchJson<UsulanHeader[]>(`/api/usulan?${p}`);
        if (!d.ok) { setHapusErr(d.message); return; }
        const data = d as unknown as { data: UsulanHeader[]; pagination: { totalPages: number } };
        for (const row of data.data) ids.push(row.id);
        if (pg >= (data.pagination.totalPages || 1)) break;
        pg += 1;
      }
      if (ids.length === 0) { setHapusErr('Tidak ada data untuk dihapus.'); return; }
      setHapusAllProgress({done:0, total:ids.length});
      // 2) Hapus sekuensial agar audit log konsisten & menghindari rate limit
      let success = 0; let failed = 0;
      for (let i=0; i<ids.length; i++) {
        const dj = await fetchJson(`/api/usulan/${ids[i]}`, { method: 'DELETE' });
        if (dj.ok) { success++; detailCacheRef.current.delete(ids[i]); }
        else failed++;
        setHapusAllProgress({done:i+1, total:ids.length});
      }
      setHapusOk(`Berhasil hapus ${success} usulan${failed?`, gagal ${failed}`:''}.`);
      fetchHapus(1);
      fetchKPI(true);
    } catch {
      setHapusErr('Gagal terhubung.');
    } finally {
      setHapusAllLoading(false);
    }
  }

  // PERF-C2 Tahap 8: doTracking dipindah ke _panels/TrackingPanel.tsx (self-contained).

  const hapusSearchRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  function onSearchDU(v: string) {
    setFilterSearchDU(v);
    if (duSearchRef.current) clearTimeout(duSearchRef.current);
    duSearchRef.current = setTimeout(()=>fetchDataUsulan(1), 400);
  }

  function onSearchHapus(v: string) {
    setHapusSearch(v);
    if (hapusSearchRef.current) clearTimeout(hapusSearchRef.current);
    hapusSearchRef.current = setTimeout(()=>fetchHapus(1), 400);
  }

  // PERF-C2 Tahap 8: doSaveBatasWaktu dipindah ke _panels/BatasWaktuPanel.tsx.
  // onSaved callback di shell trigger fetchConfig refresh.

  // PERF-C2 Tahap 8: doSavePagu dipindah ke _panels/SetPaguPanel.tsx.

  // O3: doUserAction dihapus — aksi nonaktif/aktifkan/reset-pw/delete/access
  // adalah domain admin-client (/admin). Panel kelola-user usulan = ubah role saja.

  async function doChangeRole(uid: number, role: string) {
    const d = await fetchJson('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: uid, action: 'ubah-role', role }),
    });
    if (d.ok) { showToast(d.message || 'Role diubah.', false); fetchUsers(userPage); }
    else { showToast(d.message || 'Gagal ubah role.'); fetchUsers(userPage); }
  }

  
  async function openDetail(u: UsulanHeader) {
    setRevisiEdits({});
    const cached = detailCacheRef.current.get(u.id);
    if (cached) {
      setDetailData(cached); setDetailLoading(false); setDetailOpen(true);
      return;
    }
    setDetailData({ header: u, items: [] });
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const d = await fetchJson<{ header: UsulanHeader; items: UsulanItem[] }>(`/api/usulan/${u.id}`);
      if (d.ok && d.data) {
        detailCacheRef.current.set(u.id, d.data);
        setDetailData(d.data);
      } else if (!d.ok) {
        showToast(d.message || 'Gagal memuat detail.');
      }
    } finally { setDetailLoading(false); }
  }

  
  // PERF-C2 Tahap 4: openTelaah/doTelaah dipindah ke _modals/TelaahModal.tsx
  // — modal self-contained dengan useEffect fetch items + submit handler.
  // Shell trigger via `setTelaahHeader(u)` dan refresh via onSuccess callback.

  
  // PERF-C2 Tahap 5: openPutusan/doPutusan dipindah ke _modals/PutusanModal.tsx
  // BUG-C5 guard (no-fallback ke allItems) dipertahankan di modal.

  
  // PERF-C2 Tahap 7: openBidangReview/doBidangReview dipindah ke
  // _modals/BidangReviewModal.tsx (BUG-W4 optimistic locking dipertahankan).

  async function openBulkModal() {
    setBulkCount(null); setBulkModal(true);
    const actAs = role === 'SUPER_ADMIN' ? '?actAs=kasubag' : '';
    const d = await fetchJson<{ total_item: number; total_header: number }>(`/api/usulan/putusan-bulk${actAs}`);
    if (d.ok) setBulkCount(d.data ?? null);
    else setBulkCount({ total_item: 0, total_header: 0 });
  }

  async function doBulkAcc() {
    setBulkLoading(true);
    try {
      const actAs = role === 'SUPER_ADMIN' ? 'kasubag' : '';
      const d = await fetchJson('/api/usulan/putusan-bulk', {
        method: 'PUT',
        body: JSON.stringify({ actAs }),
      });
      if (d.ok) {
        setBulkModal(false);
        detailCacheRef.current.clear();
        fetchAntrian(1);
        fetchKPI(true);
        showToast(d.message || 'Semua usulan berhasil diproses.', false);
      } else {
        showToast(d.message || 'Gagal memproses.');
      }
    } finally { setBulkLoading(false); }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout',{method:'POST'});
    window.location.href = '/login';
  }

  const fetchNotif = useCallback(async (signal?: AbortSignal) => {
    // PERF-W4: signal di-pass dari caller supaya cycle bisa dibatalkan saat
    // tab di-hide / component unmount / cycle baru replace cycle lama.
    const d = await fetchJson<NotifRow[]>('/api/notifications', { signal });
    if (d.ok) {
      setNotifList(d.data ?? []);
      setNotifUnread(Number((d as { unread?: unknown }).unread) || 0);
    }
    // Silent on error — fetchNotif runs in interval polling, tidak perlu toast tiap 30s.
    // AbortError ter-handle di fetchJson (return ok:false silent).
  }, []);

  // PERF-W4: Polling notifikasi dengan AbortController + visibility check.
  // Sebelumnya: tab di-background tetap fetch tiap 30s (boros bandwidth + bisa
  // stack request kalau OS suspend tab). Sekarang: pause saat hidden, resume
  // langsung saat tab aktif lagi (fresh data tanpa nunggu cycle berikutnya).
  useEffect(() => {
    let ctrl: AbortController | null = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      ctrl?.abort();                       // batalkan cycle yang belum selesai
      ctrl = new AbortController();
      fetchNotif(ctrl.signal);
    };
    tick();                                // initial fetch
    const t = setInterval(tick, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      ctrl?.abort();
    };
  }, [fetchNotif]);

  async function markAllNotifRead() {
    // BUG-W1: optimistic update + rollback kalau API gagal supaya badge tidak desync.
    const prevList   = notifList;
    const prevUnread = notifUnread;
    setNotifList(prev => prev.map(n => ({ ...n, dibaca: true })));
    setNotifUnread(0);
    const d = await fetchJson('/api/notifications', { method: 'PATCH' });
    if (!d.ok) {
      setNotifList(prevList);
      setNotifUnread(prevUnread);
      showToast(d.message || 'Gagal menandai semua sebagai dibaca.', true);
    }
  }

  async function markNotifRead(id: number) {
    // BUG-W1: optimistic update + rollback kalau API gagal.
    setNotifList(prev => prev.map(n => n.id === id ? { ...n, dibaca: true } : n));
    setNotifUnread(prev => Math.max(0, prev - 1));
    const d = await fetchJson(`/api/notifications/${id}`, { method: 'PATCH' });
    if (!d.ok) {
      setNotifList(prev => prev.map(n => n.id === id ? { ...n, dibaca: false } : n));
      setNotifUnread(prev => prev + 1);
      showToast(d.message || 'Gagal menandai notifikasi dibaca.', true);
    }
  }

  // PERF-C2 Tahap 3: exportExcel + exportPrint + fetchExportItems helper
  // sekarang di ./_exports.ts (pure module-level, dynamic import preserved).


  function showToast(text: string, isErr = true) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({text, isErr});
    toastTimerRef.current = setTimeout(()=>setToast(null), 3500);
  }

  // PERF-C2 Tahap 10d: updateCurrent/scrollFocus/addToList/editItem/removeItem/
  // cancelEdit/handleFileUpload pindah ke BuatPanel internal (form-only).

  
  type SidebarItem = { id: Panel; label: string; icon: React.ReactNode; group?: string; color: string };
  const sidebarItems: SidebarItem[] = ([
    {id:'dashboard',      label:'Dashboard',        icon:<LayoutDashboard size={17}/>, color:'#3B82F6'},
    {id:'buat',           label:'Buat Usulan',      icon:<FilePlus size={17}/>,        group:'Pengajuan',  color:'#F97316'},
    {id:'milik',          label:'Usulan Saya',      icon:<FileText size={17}/>,        group:'Pengajuan',  color:'#06B6D4'},
    {id:'tracking',       label:'Lacak Usulan',     icon:<Search size={17}/>,          group:'Pengajuan',  color:'#10B981'},
    {id:'semua',          label:'Semua Usulan',     icon:<List size={17}/>,            group:'Admin',      color:'#8B5CF6'},
    {id:'data-admin',     label:'Data Admin',       icon:<FileText size={17}/>,        group:'Admin',      color:'#0EA5E9'},
    {id:'rekap',          label:'Rekap & Laporan',  icon:<BarChart2 size={17}/>,       group:'Admin',      color:'#EC4899'},
    {id:'antrian',        label:'Antrian Verif',    icon:<Clock size={17}/>,           group:'Verifikasi', color:'#F59E0B'},
    {id:'data-usulan',    label:'Data Usulan',      icon:<FileText size={17}/>,        group:'Verifikasi', color:'#0EA5E9'},
    {id:'rekap-verif',    label:'Rekap Verifikasi', icon:<BarChart2 size={17}/>,       group:'Verifikasi', color:'#A855F7'},
    {id:'bidang-antrian', label:'Review Bidang',    icon:<Clock size={17}/>,           group:'Bidang',     color:'#14B8A6'},
    {id:'bidang-data',    label:'Data Review',      icon:<FileText size={17}/>,        group:'Bidang',     color:'#0EA5E9'},
    {id:'kelola-user',    label:'Kelola User',      icon:<Users size={17}/>,           group:'Pengaturan', color:'#6366F1'},
    {id:'batas-waktu',    label:'Batas Waktu',      icon:<Clock size={17}/>,           group:'Pengaturan', color:'#F43F5E'},
    {id:'set-pagu',       label:'Set Pagu BLUD',    icon:<PiggyBank size={17}/>,       group:'Pengaturan', color:'#22C55E'},
    {id:'hapus-usulan',   label:'Hapus Usulan',     icon:<DeleteIcon size={17}/>,          group:'Pengaturan', color:'#EF4444'},
  ] as SidebarItem[]).filter(i => panels.includes(i.id as Panel));

  // Build groups: section header → array of items. Item tanpa group masuk '__main'.
  const GROUP_META: Record<string, { icon: React.ReactNode; color: string }> = {
    'Pengajuan':  { icon:<FilePlus size={17}/>,       color:'#F97316' },
    'Admin':      { icon:<Shield size={17}/>,         color:'#8B5CF6' },
    'Verifikasi': { icon:<ClipboardCheck size={17}/>, color:'#F59E0B' },
    'Bidang':     { icon:<Building2 size={17}/>,      color:'#14B8A6' },
    'Pengaturan': { icon:<Settings size={17}/>,       color:'#6366F1' },
  };
  const sidebarGroups: Array<{ name: string; items: SidebarItem[] }> = [];
  for (const item of sidebarItems) {
    const g = item.group ?? '__main';
    let bucket = sidebarGroups.find(x => x.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; sidebarGroups.push(bucket); }
    bucket.items.push(item);
  }

  
  return (
    <>
      <style>{`
        /* ── Canvas ── */
        .ua-body{display:flex;min-height:100vh;font-family:var(--font-jakarta),'Inter',ui-sans-serif,system-ui,sans-serif;background:#020F1C;color:#E6F1FB;background-image:linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px);background-size:48px 48px;}
        /* ── Sidebar ── */
        .ua-sidebar{width:240px;background:rgba(4,44,83,0.97);backdrop-filter:blur(16px);border-right:1px solid #0C447C;position:fixed;top:0;left:0;bottom:0;z-index:200;display:flex;flex-direction:column;transition:transform .25s;overflow-y:auto;}
        .ua-sidebar.closed{transform:translateX(-100%);}
        .ua-sidebar-head{padding:16px 16px 12px;border-bottom:1px solid #0C447C;display:flex;align-items:center;justify-content:space-between;}
        .ua-sidebar-brand{display:flex;align-items:center;gap:8px;}
        .ua-sidebar-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#633806,#EF9F27);border:1.5px solid rgba(239,159,39,.4);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .ua-sidebar-title{font-size:13px;font-weight:800;background:linear-gradient(135deg,#EF9F27,#FAC775);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.3px;white-space:nowrap;}
        .ua-sidebar-sub{font-size:9px;color:#85B7EB;}
        .ua-close-btn{background:none;border:1px solid #0C447C;color:#85B7EB;cursor:pointer;padding:5px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .15s;}
        .ua-close-btn:hover{background:rgba(133,183,235,.1);color:#E6F1FB;border-color:#185FA5;}
        /* Collapsed sidebar — icon only mode */
        .ua-sidebar.collapsed{width:64px;overflow:visible;}
        .ua-sidebar.collapsed .ua-sidebar-brand > div:last-child{display:none;}
        .ua-sidebar.collapsed .ua-sidebar-head{flex-direction:column;gap:8px;justify-content:center;padding:14px 8px 10px;}
        .ua-sidebar.collapsed .sb-item{justify-content:center;padding:11px 0;gap:0;}
        .ua-sidebar.collapsed .sb-label{display:none;}
        .ua-sidebar.collapsed .sb-group-label{display:none;}
        .ua-sidebar.collapsed .sb-item.active{border-right-width:3px;}
        /* Custom tooltip — muncul saat hover sb-item di collapsed mode */
        .ua-sidebar.collapsed .sb-item,
        .ua-sidebar.collapsed .sb-group-toggle{position:relative;}
        .ua-sidebar.collapsed .sb-item::after,
        .ua-sidebar.collapsed .sb-group-toggle::after{
          content:attr(data-label);
          position:absolute;
          left:calc(100% + 14px);
          top:50%;
          transform:translateY(-50%) translateX(-6px);
          background:linear-gradient(135deg,#EF9F27,#FAC775);
          color:#020F1C;
          font-size:12px;
          font-weight:800;
          letter-spacing:.2px;
          padding:6px 12px;
          border-radius:8px;
          white-space:nowrap;
          box-shadow:0 6px 20px rgba(239,159,39,.35),0 2px 6px rgba(0,0,0,.4);
          opacity:0;
          pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:300;
        }
        .ua-sidebar.collapsed .sb-item::before,
        .ua-sidebar.collapsed .sb-group-toggle::before{
          content:'';
          position:absolute;
          left:calc(100% + 8px);
          top:50%;
          transform:translateY(-50%) translateX(-6px);
          width:0;height:0;
          border-top:6px solid transparent;
          border-bottom:6px solid transparent;
          border-right:7px solid #EF9F27;
          opacity:0;
          pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:301;
        }
        .ua-sidebar.collapsed .sb-item:hover::after,
        .ua-sidebar.collapsed .sb-item:hover::before,
        .ua-sidebar.collapsed .sb-group-toggle:hover::after,
        .ua-sidebar.collapsed .sb-group-toggle:hover::before{
          opacity:1;
          transform:translateY(-50%) translateX(0);
        }
        /* Light theme — gradient ungu-pink (override gold default) */
        [data-theme="light"] .ua-sidebar.collapsed .sb-item::after,
        [data-theme="light"] .ua-sidebar.collapsed .sb-group-toggle::after{
          background:linear-gradient(135deg,#8B5CF6,#EC4899);
          color:#FFFFFF;
          box-shadow:0 6px 20px rgba(139,92,246,.4),0 2px 6px rgba(0,0,0,.12);
        }
        [data-theme="light"] .ua-sidebar.collapsed .sb-item::before,
        [data-theme="light"] .ua-sidebar.collapsed .sb-group-toggle::before{
          border-right-color:#8B5CF6;
        }
        .sb-group-label{font-size:9px;font-weight:700;color:#85B7EB;text-transform:uppercase;letter-spacing:1.2px;padding:12px 16px 4px;opacity:.6;}
        .sb-item{display:flex;align-items:center;gap:11px;padding:10px 14px;font-size:14px;font-weight:600;color:#B5D4F4;cursor:pointer;border:none;background:none;width:100%;text-align:left;border-radius:0;transition:all .15s;font-family:inherit;}
        .sb-item:hover{background:rgba(255,255,255,.05);color:#E6F1FB;}
        .sb-item.active{font-weight:700;}
        .sb-item-icon{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
        /* Group toggle (collapsible section) */
        .ua-group-wrap{position:relative;}
        .sb-group-toggle{display:flex;align-items:center;gap:11px;padding:10px 14px;font-size:12.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#85B7EB;cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:inherit;transition:all .15s;}
        .sb-group-toggle:hover{background:rgba(255,255,255,.04);color:#E6F1FB;}
        .sb-group-toggle .sb-label{flex:1;}
        /* Group panel */
        .ua-group-panel{padding:2px 0 6px;}
        .sb-sub-item{display:flex;align-items:center;gap:10px;padding:7px 14px 7px 20px;font-size:13.5px;font-weight:600;color:#B5D4F4;cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:inherit;transition:all .15s;border-left:3px solid transparent;}
        .sb-sub-item:hover{background:rgba(255,255,255,.04);color:#E6F1FB;}
        .sb-sub-item.active{font-weight:700;}
        .sb-sub-icon{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
        /* Flyout panel saat sidebar collapsed */
        .ua-sidebar.collapsed .ua-group-wrap{position:relative;}
        .ua-sidebar.collapsed .sb-group-toggle{justify-content:center;padding:11px 0;gap:0;}
        .ua-sidebar.collapsed .sb-group-toggle .sb-label,
        .ua-sidebar.collapsed .sb-group-toggle .sb-chev{display:none;}
        .ua-sidebar.collapsed .ua-group-panel{position:absolute;left:calc(100% + 10px);top:0;width:220px;padding:10px 4px 12px;background:rgba(4,44,83,.98);border:1px solid #0C447C;border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.5);z-index:300;}
        .ua-sidebar.collapsed .ua-group-panel .sb-sub-item{padding:7px 12px;}
        .ua-sidebar.collapsed .ua-group-panel .sb-label{display:inline!important;}
        /* ── Main ── */
        /* min-width:0 + overflow-x:hidden mencegah konten lebar (tabel/filter)
           mendorong flex item grow → window horizontal scroll → sidebar ikut ter-geser. */
        .ua-main{flex:1;min-width:0;margin-left:240px;display:flex;flex-direction:column;min-height:100vh;overflow-x:hidden;transition:margin .25s;}
        .ua-header{position:sticky;top:0;z-index:100;height:58px;background:rgba(4,44,83,.92);backdrop-filter:blur(16px);border-bottom:1px solid #0C447C;display:flex;align-items:center;justify-content:space-between;padding:0 20px;}
        .ua-hamburger{background:none;border:none;cursor:pointer;color:#85B7EB;display:none;padding:4px;}
        .ua-main.full{margin-left:64px;transition:margin .25s;}
        .ua-breadcrumb{font-size:12px;color:#85B7EB;}
        .ua-page-title{font-size:15px;font-weight:800;color:#E6F1FB;}
        .ua-header-right{display:flex;align-items:center;gap:10px;}
        .ua-user-trigger{display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 12px 4px 4px;border-radius:40px;border:1.5px solid rgba(239,159,39,.2);background:rgba(239,159,39,.05);transition:all .2s;user-select:none;}
        .ua-user-trigger:hover{border-color:rgba(239,159,39,.45);background:rgba(239,159,39,.09);}
        .ua-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#633806,#EF9F27);color:#020F1C;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .ua-dropdown{position:absolute;top:calc(100% + 6px);right:0;width:200px;background:rgba(4,44,83,.98);backdrop-filter:blur(20px);border-radius:12px;border:1px solid #0C447C;box-shadow:0 16px 48px rgba(0,0,0,.5);overflow:hidden;z-index:300;}
        .ua-dd-item{display:flex;align-items:center;gap:8px;padding:9px 14px;font-size:13px;font-weight:500;color:#B5D4F4;cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:inherit;transition:background .15s,color .15s;}
        .ua-dd-item:hover{background:rgba(255,255,255,.05);color:#E6F1FB;}
        .ua-dd-item.danger{color:#FCA5A5;}
        .ua-dd-item.danger:hover{background:rgba(226,75,74,.1);color:#FCA5A5;}
        /* ── Notif ── */
        .notif-btn{position:relative;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;color:#85B7EB;transition:background .15s;}
        .notif-btn:hover{background:rgba(239,159,39,.1);color:#EF9F27;}
        .notif-badge{position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:8px;background:#E24B4A;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1;}
        .notif-panel{position:absolute;top:calc(100% + 8px);right:0;width:320px;background:rgba(4,44,83,.98);border-radius:14px;border:1px solid #0C447C;box-shadow:0 16px 48px rgba(0,0,0,.5);z-index:300;overflow:hidden;}
        .notif-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #0C447C;}
        .notif-title{font-size:13px;font-weight:800;color:#E6F1FB;}
        .notif-read-all{font-size:11px;color:#EF9F27;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;}
        .notif-read-all:hover{text-decoration:underline;}
        .notif-list{max-height:360px;overflow-y:auto;}
        .notif-item{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid #0C447C;cursor:pointer;transition:background .15s;}
        .notif-item:hover{background:rgba(255,255,255,.04);}
        .notif-item.unread{background:rgba(239,159,39,.05);}
        .notif-dot{width:8px;height:8px;border-radius:50%;background:#EF9F27;flex-shrink:0;margin-top:4px;}
        .notif-dot.read{background:#185FA5;}
        .notif-pesan{font-size:12px;color:#B5D4F4;line-height:1.4;}
        .notif-meta{font-size:10px;color:#85B7EB;margin-top:2px;}
        .notif-empty{padding:24px;text-align:center;font-size:12px;color:#85B7EB;}
        .ua-dd-divider{height:1px;background:#0C447C;}
        .ua-content{flex:1;padding:24px 20px;width:100%;}
        /* ── KPI ── */
        .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}
        .kpi-card{background:#042C53;border-radius:14px;padding:16px 18px;border:1px solid #0C447C;}
        .kpi-label{font-size:11px;font-weight:600;color:#85B7EB;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;}
        .kpi-value{font-size:22px;font-weight:800;color:#E6F1FB;font-family:'JetBrains Mono','Courier New',monospace;}
        .kpi-sub{font-size:11px;color:#85B7EB;margin-top:2px;}
        /* ── TABLE ── */
        /* overflow-x:auto supaya tabel lebar scroll horizontal di dalam wrap, bukan window.
           overflow-y:hidden preserve rounded corner. */
        .ua-table-wrap{background:#042C53;border-radius:14px;border:1px solid #0C447C;overflow-x:auto;overflow-y:hidden;}
        .ua-table{width:100%;border-collapse:collapse;font-size:13px;}
        .ua-table th{background:#0C447C;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#B5D4F4;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #185FA5;white-space:nowrap;}
        .ua-table td{padding:10px 14px;border-bottom:1px solid rgba(12,68,124,.5);vertical-align:middle;color:#B5D4F4;}
        .ua-table tr:last-child td{border-bottom:none;}
        .ua-table tr:hover td{background:rgba(255,255,255,.03);}
        /* ── FILTER ── */
        .filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;}
        .filter-select{padding:7px 10px;border:1.5px solid #0C447C;border-radius:8px;font-size:12px;color:#B5D4F4;background:#042C53;outline:none;cursor:pointer;font-family:inherit;}
        .filter-select:focus{border-color:#EF9F27;box-shadow:0 0 0 3px rgba(239,159,39,.12);}
        .filter-select option{background:#042C53;color:#E6F1FB;}
        .filter-input{padding:7px 12px;border:1.5px solid #0C447C;border-radius:8px;font-size:12px;color:#B5D4F4;background:#042C53;outline:none;font-family:inherit;}
        .filter-input:focus{border-color:#EF9F27;box-shadow:0 0 0 3px rgba(239,159,39,.12);}
        .filter-input::placeholder{color:#85B7EB;opacity:.7;}
        /* ── BUTTONS ── */
        .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;transition:all .15s;font-family:inherit;white-space:nowrap;}
        .btn-primary{background:#EF9F27;color:#020F1C;}
        .btn-primary:hover{background:#FAC775;transform:translateY(-1px);}
        .btn-secondary{background:transparent;color:#B5D4F4;border:1.5px solid #185FA5;}
        .btn-secondary:hover{border-color:#EF9F27;color:#EF9F27;background:rgba(239,159,39,.06);}
        .btn-warning{background:#378ADD;color:#fff;border:none;}
        .btn-warning:hover{background:#2B6FB5;}
        .btn-success{background:#1D9E75;color:#fff;border:none;}
        .btn-success:hover{background:#178A64;}
        .btn-danger{background:#E24B4A;color:#fff;border:none;}
        .btn-danger:hover{background:#C0392B;}
        .btn-purple{background:#7C5CFC;color:#fff;border:none;}
        .btn-purple:hover{background:#6344E0;}
        .btn-sm{padding:5px 10px;font-size:11.5px;}
        .btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important;}
        /* ── PAGU BAR ── */
        .pagu-bar-wrap{background:#042C53;border:1px solid #0C447C;border-radius:14px;padding:16px 20px;margin-bottom:16px;}
        .pagu-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}
        .pagu-kpi-card{border-radius:10px;padding:12px 16px;border:1px solid #185FA5;background:#0C447C;}
        .pagu-kpi-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;color:#85B7EB;}
        .pagu-kpi-val{font-size:17px;font-weight:800;color:#E6F1FB;}
        .pagu-bar-track{height:10px;background:#0C447C;border-radius:99px;overflow:hidden;margin-bottom:6px;}
        .pagu-bar-fill{height:100%;background:linear-gradient(90deg,#EF9F27,#FAC775);border-radius:99px;transition:width .6s;}
        .pagu-bar-meta{font-size:11px;color:#85B7EB;display:flex;gap:12px;}
        @media(max-width:768px){.pagu-kpi-grid{grid-template-columns:repeat(2,1fr);}}
        /* ── FORM ── */
        .form-card{background:#042C53;border-radius:14px;border:1px solid #0C447C;padding:20px;margin-bottom:16px;}
        .form-card-title{font-size:13px;font-weight:700;color:#E6F1FB;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #0C447C;}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
        .form-group{margin-bottom:12px;}
        .form-label{display:block;font-size:11px;font-weight:700;color:#B5D4F4;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px;}
        .form-control{width:100%;padding:9px 12px;border:1.5px solid #0C447C;border-radius:6px;font-size:13px;color:#E6F1FB;background:rgba(12,68,124,.3);outline:none;transition:all .2s;font-family:inherit;box-sizing:border-box;caret-color:#EF9F27;}
        .form-control::placeholder{color:#85B7EB;opacity:.7;}
        .form-control:focus{border-color:#EF9F27;box-shadow:0 0 0 3px rgba(239,159,39,.12);background:rgba(12,68,124,.5);}
        .form-control:read-only{background:rgba(12,68,124,.15);color:#85B7EB;}
        select.form-control{-webkit-appearance:auto;appearance:auto;}
        select.form-control option{background:#042C53;color:#E6F1FB;}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{opacity:1;background:rgba(12,68,124,.7);border-left:1px solid #185FA5;cursor:pointer;filter:invert(0.8);}
        input[type=number]{-moz-appearance:auto;}
        .clock-card{background:rgba(12,68,124,.3);border:1.5px solid #185FA5;border-radius:14px;padding:14px 20px;margin-bottom:12px;text-align:center;}
        .input-item-card{border:2px solid rgba(239,159,39,.3)!important;background:#042C53!important;}
        /* ── ITEM TABLE ── */
        .item-table{width:100%;border-collapse:collapse;font-size:12px;}
        .item-table th{background:#0C447C;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#B5D4F4;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #185FA5;}
        .item-table td{padding:6px 8px;border-bottom:1px solid rgba(12,68,124,.5);vertical-align:middle;color:#B5D4F4;}
        .item-input{width:100%;padding:6px 8px;border:1.5px solid #0C447C;border-radius:6px;font-size:12px;color:#E6F1FB;background:rgba(12,68,124,.3);outline:none;font-family:inherit;caret-color:#EF9F27;}
        .item-input:focus{border-color:#EF9F27;box-shadow:0 0 0 2px rgba(239,159,39,.12);}
        /* ── PAGINATION ── */
        .pg-btn{padding:5px 9px;border:1.5px solid #0C447C;border-radius:6px;font-size:12px;background:#042C53;color:#B5D4F4;cursor:pointer;font-family:inherit;transition:all .15s;}
        .pg-btn:hover:not(:disabled){border-color:#EF9F27;color:#EF9F27;}
        .pg-btn.active{background:#EF9F27;color:#020F1C;border-color:#EF9F27;font-weight:700;}
        .pg-btn:disabled{opacity:.35;cursor:not-allowed;}
        /* ── MSG ── */
        .msg-err{padding:10px 14px;border-radius:8px;font-size:13px;display:flex;align-items:flex-start;gap:8px;background:#791F1F;color:#FCA5A5;border:1px solid rgba(226,75,74,.4);margin-bottom:12px;}
        .msg-ok{padding:10px 14px;border-radius:8px;font-size:13px;display:flex;align-items:flex-start;gap:8px;background:#085041;color:#6EE7B7;border:1px solid rgba(29,158,117,.4);margin-bottom:12px;}
        /* ── MODAL ── */
        .modal-overlay{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;}
        .modal-card{background:#042C53;border:1px solid #0C447C;border-radius:14px;width:100%;max-width:800px;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.5);}
        .modal-header{padding:18px 22px 14px;border-bottom:1px solid #0C447C;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#042C53;border-radius:14px 14px 0 0;z-index:10;}
        .modal-title{font-size:15px;font-weight:800;color:#E6F1FB;}
        .modal-sub{font-size:11px;color:#85B7EB;margin-top:2px;}
        .modal-body{padding:20px 22px;}
        .modal-footer{padding:14px 22px 18px;border-top:1px solid #0C447C;display:flex;gap:8px;justify-content:flex-end;}
        /* ── DECISION ROW ── */
        .dec-row{border:1px solid #0C447C;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:rgba(12,68,124,.2);}
        .dec-row-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;}
        .dec-item-no{width:24px;height:24px;border-radius:50%;background:#EF9F27;color:#020F1C;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
        .dec-item-info{flex:1;}
        .dec-item-name{font-size:13px;font-weight:700;color:#E6F1FB;}
        .dec-item-meta{font-size:11px;color:#85B7EB;margin-top:2px;}
        .dec-row-bottom{display:grid;grid-template-columns:160px 1fr 1fr;gap:8px;align-items:end;}
        .dec-label{font-size:10px;font-weight:700;color:#B5D4F4;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;}
        .dec-select{width:100%;padding:7px 10px;border:1.5px solid #0C447C;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;background:#042C53;color:#B5D4F4;font-family:inherit;outline:none;}
        .dec-select:focus{border-color:#EF9F27;}
        .dec-select.s-ok{border-color:#1D9E75;background:rgba(29,158,117,.12);color:#6EE7B7;}
        .dec-select.s-warn{border-color:#BA7517;background:rgba(186,117,23,.12);color:#FAC775;}
        .dec-select.s-err{border-color:#E24B4A;background:rgba(226,75,74,.12);color:#FCA5A5;}
        .dec-select option{background:#042C53;color:#E6F1FB;}
        .dec-input{width:100%;padding:7px 10px;border:1.5px solid #0C447C;border-radius:7px;font-size:12px;font-family:inherit;outline:none;background:rgba(12,68,124,.3);color:#E6F1FB;box-sizing:border-box;caret-color:#EF9F27;}
        .dec-input:focus{border-color:#EF9F27;}
        /* ── ANTRIAN CARD ── */
        .antrian-card{background:#042C53;border:1px solid #0C447C;border-radius:14px;padding:16px;margin-bottom:12px;transition:box-shadow .2s,border-color .2s;}
        .antrian-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.3);border-color:#185FA5;}
        .antrian-no{font-size:12px;font-weight:800;color:#EF9F27;background:rgba(239,159,39,.1);padding:2px 8px;border-radius:6px;font-family:'JetBrains Mono','Courier New',monospace;border:1px solid rgba(239,159,39,.25);}
        /* ── USER ROW ── */
        .user-card{background:#042C53;border:1px solid #0C447C;border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .user-avatar-sm{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#633806,#EF9F27);color:#020F1C;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        /* ── REKAP TABLE ── */
        .rekap-table{width:100%;border-collapse:collapse;}
        .rekap-table th{background:#0C447C;padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#B5D4F4;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #185FA5;}
        .rekap-table td{padding:9px 14px;border-bottom:1px solid rgba(12,68,124,.5);font-size:13px;color:#B5D4F4;}
        /* ── MOBILE ── */
        @media(max-width:768px){
          .ua-sidebar{transform:translateX(-100%);}
          .ua-sidebar.open{transform:translateX(0);}
          .ua-main{margin-left:0;}
          .ua-hamburger{display:flex;}
          /* Mobile: sidebar drawer pakai translateX, ignore collapsed mode */
          .ua-sidebar.collapsed{width:240px;}
          .ua-sidebar.collapsed .sb-label,
          .ua-sidebar.collapsed .sb-group-label,
          .ua-sidebar.collapsed .ua-sidebar-brand,
          .ua-sidebar.collapsed .ua-sidebar-brand > div{display:initial;}
          .ua-sidebar.collapsed .ua-sidebar-brand{display:flex;}
          .ua-sidebar.collapsed .sb-item{justify-content:flex-start;padding:9px 16px;gap:9px;}
          .ua-main.full{margin-left:0;}
          .kpi-grid{grid-template-columns:repeat(2,1fr);}
          .form-row{grid-template-columns:1fr;}
          .dec-row-bottom{grid-template-columns:1fr 1fr;}
          .modal-card{max-width:100%;}
        }
        @media(max-width:480px){.kpi-grid{grid-template-columns:1fr;}}

        /* ═══════════════════════════════════════════
           LIGHT THEME OVERRIDES
        ═══════════════════════════════════════════ */
        [data-theme="light"] .ua-body{background:#ECEEF3;background-image:linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px);background-size:48px 48px;color:#0F0F12;}
        /* Scrollbar light — apply ke semua scrollable container di page ini */
        [data-theme="light"] *::-webkit-scrollbar{width:10px;height:10px;background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-track{background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-thumb{background:#C7CCD4;border:2px solid #ECEEF3;border-radius:6px;}
        [data-theme="light"] *::-webkit-scrollbar-thumb:hover{background:#A0A6B0;}
        [data-theme="light"] *::-webkit-scrollbar-corner{background:#ECEEF3;}
        [data-theme="light"] *{scrollbar-color:#C7CCD4 #ECEEF3;scrollbar-width:thin;}
        /* Sidebar */
        [data-theme="light"] .ua-sidebar{background:rgba(250,250,250,0.98);border-right:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .ua-sidebar-head{border-bottom:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .ua-sidebar-sub{color:#6B7280;}
        [data-theme="light"] .ua-close-btn{color:#6B7280;}
        [data-theme="light"] .ua-close-btn:hover{color:#0F0F12;}
        [data-theme="light"] .sb-group-label{color:#9CA3AF;}
        [data-theme="light"] .sb-item{color:#374151;}
        [data-theme="light"] .sb-item:hover{background:rgba(139,92,246,0.06);color:#5B21B6;}
        [data-theme="light"] .sb-item.active{font-weight:800;}
        [data-theme="light"] .sb-group-toggle{color:#6B7280;}
        [data-theme="light"] .sb-group-toggle:hover{background:rgba(139,92,246,0.06);color:#5B21B6;}
        [data-theme="light"] .sb-sub-item{color:#374151;}
        [data-theme="light"] .sb-sub-item:hover{background:rgba(139,92,246,0.06);color:#5B21B6;}
        [data-theme="light"] .sb-sub-item.active{font-weight:800;}
        [data-theme="light"] .ua-sidebar.collapsed .ua-group-panel{background:#FAFAFA;border:1px solid rgba(139,92,246,0.25);box-shadow:0 12px 36px rgba(0,0,0,0.12);}
        /* Header */
        [data-theme="light"] .ua-header{background:rgba(250,250,250,0.95);border-bottom:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(16px);}
        [data-theme="light"] .ua-breadcrumb{color:#6B7280;}
        [data-theme="light"] .ua-page-title{color:#0F0F12;}
        [data-theme="light"] .ua-toggle{border-color:rgba(0,0,0,0.12);color:#6B7280;}
        [data-theme="light"] .ua-toggle:hover{background:rgba(0,0,0,0.04);color:#0F0F12;border-color:rgba(0,0,0,0.2);}
        /* User badge */
        [data-theme="light"] .ua-user-trigger{border-color:rgba(139,92,246,0.25);background:rgba(139,92,246,0.05);}
        [data-theme="light"] .ua-user-trigger:hover{border-color:rgba(139,92,246,0.45);background:rgba(139,92,246,0.09);}
        /* Tooltip ungu-pink di light (override amber default) */
        [data-theme="light"] .ua-sidebar.collapsed .sb-item::after{
          background:linear-gradient(135deg,#8B5CF6,#EC4899);
          color:#FFFFFF;
          box-shadow:0 6px 20px rgba(139,92,246,.35),0 2px 6px rgba(0,0,0,.15);
        }
        [data-theme="light"] .ua-sidebar.collapsed .sb-item::before{
          border-right-color:#8B5CF6;
        }
        /* Brand icon + title — ungu-pink di light */
        [data-theme="light"] .ua-sidebar-icon{background:linear-gradient(135deg,#8B5CF6,#EC4899);border-color:rgba(139,92,246,0.4);}
        [data-theme="light"] .ua-sidebar-title{background:linear-gradient(135deg,#8B5CF6,#EC4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
        /* User avatar — ungu-pink di light */
        [data-theme="light"] .ua-avatar{background:linear-gradient(135deg,#8B5CF6,#EC4899);color:#FFFFFF;}
        [data-theme="light"] .ua-dropdown{background:rgba(250,250,250,0.98);border:1px solid rgba(0,0,0,0.1);box-shadow:0 16px 48px rgba(0,0,0,0.15);}
        [data-theme="light"] .ua-dd-item{color:#374151;}
        [data-theme="light"] .ua-dd-item:hover{background:rgba(0,0,0,0.04);color:#0F0F12;}
        [data-theme="light"] .ua-dd-item.danger{color:#DC2626;}
        [data-theme="light"] .ua-dd-item.danger:hover{background:rgba(226,75,74,0.08);}
        [data-theme="light"] .ua-dd-divider{background:rgba(0,0,0,0.08);}
        /* Notif */
        [data-theme="light"] .notif-btn{color:#6B7280;}
        [data-theme="light"] .notif-btn:hover{background:rgba(239,159,39,0.08);color:#B45309;}
        [data-theme="light"] .notif-panel{background:rgba(250,250,250,0.98);border:1px solid rgba(0,0,0,0.1);box-shadow:0 16px 48px rgba(0,0,0,0.15);}
        [data-theme="light"] .notif-header{border-bottom:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .notif-title{color:#0F0F12;}
        [data-theme="light"] .notif-item{border-bottom:1px solid rgba(0,0,0,0.06);}
        [data-theme="light"] .notif-item:hover{background:rgba(0,0,0,0.02);}
        [data-theme="light"] .notif-item.unread{background:rgba(239,159,39,0.05);}
        [data-theme="light"] .notif-pesan{color:#374151;}
        [data-theme="light"] .notif-meta{color:#9CA3AF;}
        [data-theme="light"] .notif-empty{color:#9CA3AF;}
        /* KPI */
        [data-theme="light"] .kpi-card{background:#FAFAFA;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        [data-theme="light"] .kpi-label{color:#6B7280;}
        [data-theme="light"] .kpi-value{color:#0F0F12;}
        [data-theme="light"] .kpi-sub{color:#9CA3AF;}
        /* Table */
        [data-theme="light"] .ua-table-wrap{background:#FAFAFA;border:1px solid rgba(139,92,246,0.15);}
        [data-theme="light"] .ua-table th{background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10));color:#5B21B6;border-bottom:1px solid rgba(139,92,246,0.22);font-weight:700;}
        [data-theme="light"] .ua-table td{border-bottom:1px solid rgba(139,92,246,0.08);color:#374151;}
        [data-theme="light"] .ua-table tr:hover td{background:rgba(139,92,246,0.04);}
        /* Filter */
        [data-theme="light"] .filter-select{background:#FAFAFA;border-color:rgba(139,92,246,0.25);color:#5B21B6;}
        [data-theme="light"] .filter-select:hover{border-color:#8B5CF6;}
        [data-theme="light"] .filter-select:focus{border-color:#8B5CF6;box-shadow:0 0 0 3px rgba(139,92,246,0.15);}
        [data-theme="light"] .filter-select option{background:#FAFAFA;color:#0F0F12;}
        [data-theme="light"] .filter-input{background:#FAFAFA;border-color:rgba(139,92,246,0.25);color:#0F0F12;}
        [data-theme="light"] .filter-input:hover{border-color:#8B5CF6;}
        [data-theme="light"] .filter-input:focus{border-color:#8B5CF6;box-shadow:0 0 0 3px rgba(139,92,246,0.15);}
        [data-theme="light"] .filter-input::placeholder{color:#9CA3AF;}
        /* Avatar — ungu-pink gradient di light mode */
        [data-theme="light"] .user-avatar-sm{background:linear-gradient(135deg,#8B5CF6,#EC4899);color:#FFFFFF;}
        /* Buttons */
        [data-theme="light"] .btn-secondary{color:#5B21B6;border-color:rgba(139,92,246,0.3);background:rgba(139,92,246,0.04);}
        [data-theme="light"] .btn-secondary:hover{border-color:#8B5CF6;color:#6D28D9;background:rgba(139,92,246,0.10);}
        [data-theme="light"] .btn-primary{background:linear-gradient(135deg,#8B5CF6,#EC4899);color:#FFFFFF;border:none;}
        [data-theme="light"] .btn-primary:hover{filter:brightness(1.05);box-shadow:0 4px 12px rgba(139,92,246,0.35);}
        /* Pagu */
        [data-theme="light"] .pagu-bar-wrap{background:#FAFAFA;border:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .pagu-kpi-card{border-radius:12px!important;padding:14px 18px!important;border-width:1.5px!important;border-style:solid!important;box-shadow:0 4px 12px rgba(0,0,0,0.06)!important;}
        [data-theme="light"] .pagu-kpi-label{font-size:10.5px!important;font-weight:800!important;letter-spacing:.8px!important;}
        [data-theme="light"] .pagu-kpi-val{font-size:19px!important;font-weight:800!important;letter-spacing:-.3px!important;}
        /* Card 1 — Pagu BLUD (violet) */
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(1){background:#EDE9FE!important;border-color:rgba(139,92,246,.45)!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(1) .pagu-kpi-label{color:#6D28D9!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(1) .pagu-kpi-val{color:#4C1D95!important;}
        /* Card 2 — Nilai Aktif (pink) */
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(2){background:#FCE7F3!important;border-color:rgba(236,72,153,.45)!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(2) .pagu-kpi-label{color:#BE185D!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(2) .pagu-kpi-val{color:#831843!important;}
        /* Card 3 — Sedang Ditelaah (amber) */
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(3){background:#FEF3C7!important;border-color:rgba(245,158,11,.5)!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(3) .pagu-kpi-label{color:#B45309!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(3) .pagu-kpi-val{color:#78350F!important;}
        /* Card 4 — Disetujui Kabag (green) */
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(4){background:#D1FAE5!important;border-color:rgba(16,185,129,.5)!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(4) .pagu-kpi-label{color:#047857!important;}
        [data-theme="light"] .pagu-kpi-grid > .pagu-kpi-card:nth-child(4) .pagu-kpi-val{color:#064E3B!important;}
        [data-theme="light"] .pagu-bar-track{background:#E5E7EB;}
        [data-theme="light"] .pagu-progress-label{color:#374151!important;}
        [data-theme="light"] .pagu-bar-meta{color:#6B7280;}
        /* Form */
        [data-theme="light"] .form-card{background:#FAFAFA;border:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .form-card-title{color:#0F0F12;border-bottom:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .form-label{color:#374151;}
        [data-theme="light"] .form-control{background:#FAFAFA;border-color:rgba(139,92,246,0.25);color:#0F0F12;}
        [data-theme="light"] .form-control:hover{border-color:rgba(139,92,246,0.45);}
        [data-theme="light"] .form-control::placeholder{color:#9CA3AF;}
        [data-theme="light"] .form-control:focus{background:#FAFAFA;border-color:#8B5CF6;box-shadow:0 0 0 3px rgba(139,92,246,0.15);}
        [data-theme="light"] select.form-control{color:#5B21B6;}
        [data-theme="light"] .form-control:read-only{background:#F9FAFB;color:#6B7280;}
        [data-theme="light"] select.form-control option{background:#FAFAFA;color:#0F0F12;}
        /* Clock — !important needed karena inline style di ClockCard sudah di-override via prop, tapi jaga-jaga */
        [data-theme="light"] .clock-card{background:linear-gradient(135deg,#FAFAFA,#F1F0EC)!important;border:1.5px solid rgba(0,0,0,0.1)!important;border-top:3px solid #EF9F27!important;}
        /* Input item card */
        [data-theme="light"] .input-item-card{background:#FAFAFA!important;border:2px solid rgba(139,92,246,.2)!important;}
        /* Item table */
        [data-theme="light"] .item-table th{background:#F3F4F6;color:#374151;border-bottom:1px solid rgba(0,0,0,0.1);}
        [data-theme="light"] .item-table td{border-bottom:1px solid rgba(0,0,0,0.06);color:#374151;}
        [data-theme="light"] .item-input{background:#FAFAFA;border-color:rgba(0,0,0,0.12);color:#0F0F12;}
        [data-theme="light"] .item-input:focus{border-color:#8B5CF6;box-shadow:0 0 0 2px rgba(139,92,246,0.12);}
        /* Pagination */
        [data-theme="light"] .pg-btn{background:#FAFAFA;border-color:rgba(0,0,0,0.12);color:#374151;}
        [data-theme="light"] .pg-btn:hover:not(:disabled){border-color:#EF9F27;color:#B45309;}
        /* Modal */
        [data-theme="light"] .modal-card{background:#FAFAFA;border:1px solid rgba(0,0,0,0.1);box-shadow:0 32px 80px rgba(0,0,0,0.15);}
        [data-theme="light"] .modal-header{background:#FAFAFA;border-bottom:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .modal-title{color:#0F0F12;}
        [data-theme="light"] .modal-sub{color:#6B7280;}
        [data-theme="light"] .modal-footer{border-top:1px solid rgba(0,0,0,0.08);}
        /* Decision rows */
        [data-theme="light"] .dec-row{background:#F9FAFB;border:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .dec-item-name{color:#0F0F12;}
        [data-theme="light"] .dec-item-meta{color:#6B7280;}
        [data-theme="light"] .dec-label{color:#374151;}
        [data-theme="light"] .dec-select{background:#FAFAFA;border-color:rgba(0,0,0,0.12);color:#374151;}
        [data-theme="light"] .dec-select option{background:#FAFAFA;color:#0F0F12;}
        [data-theme="light"] .dec-input{background:#FAFAFA;border-color:rgba(0,0,0,0.12);color:#0F0F12;}
        /* Antrian & User cards */
        [data-theme="light"] .antrian-card{background:#FAFAFA;border:1px solid rgba(0,0,0,0.08);}
        [data-theme="light"] .antrian-card:hover{border-color:rgba(139,92,246,0.3);box-shadow:0 4px 20px rgba(0,0,0,0.08);}
        [data-theme="light"] .user-card{background:#FAFAFA;border:1px solid rgba(0,0,0,0.08);}
        /* Rekap table */
        [data-theme="light"] .rekap-table th{background:#F3F4F6;color:#374151;border-bottom:1px solid rgba(0,0,0,0.1);}
        [data-theme="light"] .rekap-table td{border-bottom:1px solid rgba(0,0,0,0.06);color:#374151;}
      `}</style>

      <div className="ua-body">
        {sidebarOpen && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:150}} onClick={()=>setSidebar(false)}/>}

        {/* ── SIDEBAR ── */}
        <aside className={`ua-sidebar${sidebarOpen?' open':''}${sidebarHidden?' collapsed':''}`}>
          <div className="ua-sidebar-head">
            <div className="ua-sidebar-brand">
              <div className="ua-sidebar-icon"><ShieldCheck size={18} strokeWidth={2.2} color={isLight?'#FFFFFF':'#020F1C'}/></div>
              <div>
                <div className="ua-sidebar-title">{APP_NAME} · Usulan</div>
                <div className="ua-sidebar-sub">RSJD Dr. Amino Gondohutomo</div>
              </div>
            </div>
            <Tip label={sidebarHidden?'Perluas sidebar':'Kecilkan sidebar'}><button
              className="ua-close-btn"
              onClick={()=>{ if(sidebarOpen){setSidebar(false);} else {toggleSidebar();} }}
              aria-label={sidebarHidden?'Perluas sidebar':'Kecilkan sidebar'}
            >
              <MenuIcon size={17}/>
            </button></Tip>
          </div>
          {sidebarGroups.map(grp => {
            if (grp.name === '__main') {
              // Item top-level (Dashboard) tanpa header group
              return grp.items.map(item => {
                const active = panel === item.id;
                return (
                  <button key={item.id}
                    className={`sb-item${active?' active':''}`}
                    onClick={()=>{setPanel(item.id);setSidebar(false);setOpenGroup(null);}}
                    data-label={item.label}
                    style={active ? { background:`linear-gradient(90deg, ${item.color}33, ${item.color}11)`, borderRight:`3px solid ${item.color}`, color:item.color } : undefined}>
                    <span className="sb-item-icon" style={{ background:`${item.color}22`, color:item.color }}>{item.icon}</span>
                    <span className="sb-label">{item.label}</span>
                  </button>
                );
              });
            }
            const meta = GROUP_META[grp.name] ?? { icon:<List size={17}/>, color:'#6366F1' };
            const groupActive = grp.items.some(it => it.id === panel);
            const isOpen = openGroup === grp.name || groupActive;
            return (
              <div key={grp.name} className="ua-group-wrap">
                <button className={`sb-group-toggle${groupActive?' active':''}`}
                  onClick={()=>setOpenGroup(prev => prev===grp.name ? null : grp.name)}
                  data-label={grp.name}
                  data-rima={grp.name==='Pengajuan' ? 'usulan.sidebar-grup-pengajuan' : undefined}
                  style={groupActive ? { color:meta.color } : undefined}>
                  <span className="sb-item-icon" style={{ background:`${meta.color}22`, color:meta.color }}>{meta.icon}</span>
                  <span className="sb-label">{grp.name}</span>
                  <ChevronDown size={13} className="sb-chev" style={{ transform: isOpen?'rotate(180deg)':'none', transition:'transform .18s', flexShrink:0 }}/>
                </button>
                {isOpen && (
                  <div className="ua-group-panel">
                    {grp.items.map(item => {
                      const active = panel === item.id;
                      return (
                        <button key={item.id}
                          className={`sb-sub-item${active?' active':''}`}
                          onClick={()=>{setPanel(item.id);setSidebar(false);if(sidebarHidden) setOpenGroup(null);}}
                          data-label={item.label}
                          data-rima={item.id==='buat' ? 'usulan.sidebar-buat' : item.id==='tracking' ? 'usulan.tab-tracking' : undefined}
                          style={active ? { background:`linear-gradient(90deg, ${item.color}33, ${item.color}11)`, borderLeft:`3px solid ${item.color}`, color:item.color } : undefined}>
                          <span className="sb-sub-icon" style={{ background:`${item.color}22`, color:item.color }}>{item.icon}</span>
                          <span className="sb-label">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* ── MAIN ── */}
        <div className={`ua-main${sidebarHidden?' full':''}`}>
          <header className="ua-header">
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <button className="ua-hamburger" onClick={()=>setSidebar(true)} aria-label="Buka menu"><MenuIcon size={20}/></button>
              <div>
                <div className="ua-breadcrumb">Usulan Kebutuhan</div>
                <div className="ua-page-title">{sidebarItems.find(s=>s.id===panel)?.label??'Dashboard'}</div>
              </div>
            </div>
            <div className="ua-header-right">
              <button className="btn btn-sm btn-secondary" onClick={()=>router.push('/menu')}><ChevronLeft size={13}/>Menu</button>
              {/* Theme toggle */}
              <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />
              <div ref={notifRef} style={{position:'relative'}}>
                <button className="notif-btn" onClick={()=>{setNotifOpen(!notifOpen);setDropOpen(false);}}>
                  <Bell size={18}/>
                  {notifUnread > 0 && <span className="notif-badge">{notifUnread > 99 ? '99+' : notifUnread}</span>}
                </button>
                {notifOpen && (
                  <div className="notif-panel" style={{position:'absolute',zIndex:300}}>
                    <div className="notif-header">
                      <span className="notif-title">Notifikasi {notifUnread > 0 && <span style={{color:'#dc2626'}}>({notifUnread})</span>}</span>
                      {notifUnread > 0 && <button className="notif-read-all" onClick={markAllNotifRead}>Tandai semua dibaca</button>}
                    </div>
                    <div className="notif-list">
                      {notifList.length === 0
                        ? <div className="notif-empty">Tidak ada notifikasi</div>
                        : notifList.map(n => (
                          <div key={n.id} className={`notif-item${n.dibaca?'':' unread'}`} onClick={()=>{ if(!n.dibaca) markNotifRead(n.id); }}>
                            <div className={`notif-dot${n.dibaca?' read':''}`}/>
                            <div>
                              <div className="notif-pesan" dangerouslySetInnerHTML={{__html: n.pesan}}/>
                              <div className="notif-meta">
                                {n.no_usulan && <span style={{fontWeight:600,color:'#0d7a3a'}}>{n.no_usulan} · </span>}
                                {new Date(n.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
              <div ref={dropRef} style={{position:'relative'}}>
                <div className="ua-user-trigger" onClick={()=>{setDropOpen(!dropOpen);setNotifOpen(false);}}>
                  <div className="ua-avatar">{initial}</div>
                  <div style={{display:'flex',flexDirection:'column',lineHeight:1.2}}>
                    <span style={{fontSize:12,fontWeight:700,color:isLight?'#0F0F12':'#E6F1FB'}}>{username}</span>
                    <span style={{fontSize:10,color:isLight?'#6B7280':'#85B7EB'}}>{roleLabel}</span>
                  </div>
                  <ChevronDown size={13} color={isLight?'#6B7280':'#85B7EB'} style={{transition:'transform .2s',transform:dropOpen?'rotate(180deg)':'none'}}/>
                </div>
                {dropOpen && (
                  <div className="ua-dropdown" style={{position:'absolute',zIndex:300}}>
                    <button className="ua-dd-item" onClick={()=>{setDropOpen(false);router.push('/profil');}}>
                      <ShieldCheck size={14}/> Ganti Password
                    </button>
                    <div className="ua-dd-divider"/>
                    <button className="ua-dd-item danger" onClick={handleLogout} disabled={loggingOut}>
                      <LogOut size={14}/> {loggingOut?'Keluar...':'Keluar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="ua-content">

            {/* ════ DASHBOARD ════ */}
            {panel==='dashboard' && (
              <DashboardPanel
                kpi={kpi} kpiLoading={kpiLd}
                role={role} username={username}
                bwAktif={bwAktif} bwMulai={bwMulai} bwSelesai={bwSelesai} bwPesan={bwPesan}
                onRefresh={() => fetchKPI()}
                isLight={isLight}
              />
            )}

            {/* ════ BUAT USULAN ════ */}
            {/* ════ BUAT USULAN ════ */}
            {panel==='buat' && (
              <BuatPanel
                username={username} todayDate={todayDate}
                fTahun={fTahun} setFTahun={setFTahun}
                fJenis={fJenis} setFJenis={setFJenis}
                fSubBidang={fSubBidang} setFSubBidang={setFSubBidang}
                fJenisBelanja={fJenisBelanja} setFJenisBelanja={setFJenisBelanja}
                items={items} setItems={setItems}
                editingUsulanId={editingUsulanId} setEditingUsulanId={setEditingUsulanId}
                editingUsulanNo={editingUsulanNo} setEditingUsulanNo={setEditingUsulanNo}
                setEditingUpdatedAt={setEditingUpdatedAt}
                buatErr={buatErr} setBuatErr={setBuatErr}
                buatOk={buatOk}   setBuatOk={setBuatOk}
                buatLoading={buatLoading}
                noUsulanPreview={noUsulanPreview}
                buatErrRef={buatErrRef}
                tahunList={tahunList}
                subBidangOptions={subBidangOptions}
                defaultSubBidang={defaultSubBidang}
                bwAktif={bwAktif} bwMulai={bwMulai} bwSelesai={bwSelesai} bwPesan={bwPesan}
                doSubmit={doSubmit}
                isLight={isLight}
              />
            )}

            {/* ════ USULAN SAYA ════ */}
            {panel==='milik' && (
              <MilikPanel
                role={role} username={username}
                kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterScope={filterScope}   setFilterScope={setFilterScope}
                filterTahun={filterTahun}   setFilterTahun={setFilterTahun}
                filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                filterJenis={filterJenisMilik} setFilterJenis={setFilterJenisMilik}
                filterSearch={filterSearch} onSearchChange={onSearch}
                data={milikData} loading={milikLoading}
                page={milikPage} totalPages={milikPages} total={milikTotal}
                setPage={fetchMilik}
                openDetail={openDetail}
                openEditDraft={openEditDraft}
                doAjukan={doAjukan}
                doHapusMilik={doHapusMilik}
                doCancelByCreator={doCancelByCreator}
                doKirimSemua={doKirimSemua}
                kirSemLoading={kirSemLoading}
                onNewClick={() => setPanel('buat')}
                onExportExcel={exportExcel}
                onExportPdf={exportPrint}
                isLight={isLight}
              />
            )}

            {/* ════ MODAL BULK ACC ════ */}
            {bulkModal && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
                onClick={e=>{if(e.target===e.currentTarget&&!bulkLoading)setBulkModal(false);}}>
                <div style={{background:'#042C53',border:'1px solid #0C447C',borderRadius:12,padding:28,maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
                  <div style={{fontSize:16,fontWeight:700,color:'#E6F1FB',marginBottom:12}}>
                    {role==='ADMIN_KABAG' ? '✅ ACC Semua Usulan Final' : '📋 Proses Semua Usulan → Kabag'}
                  </div>
                  {bulkCount === null ? (
                    <div style={{padding:'20px 0',textAlign:'center',color:'#6b7280',fontSize:13}}>Menghitung antrian...</div>
                  ) : bulkCount.total_item === 0 ? (
                    <div style={{padding:'12px 0'}}>
                      <p style={{fontSize:13,color:'#6b7280'}}>Tidak ada usulan yang perlu diproses saat ini.</p>
                      <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
                        <PrimaButton variant="ghost" size="sm" onClick={()=>setBulkModal(false)}>Tutup</PrimaButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{background:'rgba(29,158,117,.08)',border:'1px solid rgba(29,158,117,.25)',borderRadius:8,padding:'12px 16px',marginBottom:16}}>
                        <div style={{display:'flex',gap:24}}>
                          <div>
                            <div style={{fontSize:11,color:'#85B7EB',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Total Usulan</div>
                            <div style={{fontSize:22,fontWeight:800,color:'#6EE7B7'}}>{bulkCount.total_header}</div>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:'#85B7EB',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Total Item</div>
                            <div style={{fontSize:22,fontWeight:800,color:'#6EE7B7'}}>{bulkCount.total_item}</div>
                          </div>
                        </div>
                      </div>
                      <p style={{fontSize:13,color:'#B5D4F4',lineHeight:1.6,marginBottom:8}}>
                        {role==='ADMIN_KABAG'
                          ? <>Semua <strong>{bulkCount.total_item} item</strong> dari <strong>{bulkCount.total_header} usulan</strong> akan disetujui final. Nominal menggunakan hasil revisi kasubag atau telaah admin.</>
                          : <>Semua <strong>{bulkCount.total_item} item</strong> dari <strong>{bulkCount.total_header} usulan</strong> akan diteruskan ke Kabag. Nominal menggunakan hasil telaah admin.</>
                        }
                      </p>
                      <p style={{fontSize:12,color:'#FAC775',background:'rgba(186,117,23,.1)',borderRadius:6,padding:'8px 12px',marginBottom:20}}>
                        ⚠ Aksi ini tidak dapat dibatalkan. Pastikan semua usulan sudah diperiksa terlebih dahulu.
                      </p>
                      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                        <PrimaButton variant="ghost" size="sm" onClick={()=>setBulkModal(false)} disabled={bulkLoading}>Batal</PrimaButton>
                        <PrimaButton variant="primary" size="sm" onClick={doBulkAcc} disabled={bulkLoading}>
                          {bulkLoading ? 'Memproses...' : (role==='ADMIN_KABAG' ? '✅ Ya, ACC Semua' : '📋 Ya, Proses Semua')}
                        </PrimaButton>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ════ LACAK USULAN ════ */}
            {panel==='tracking' && (
              <TrackingPanel openDetail={openDetail}/>
            )}

            {/* ════ SEMUA USULAN (admin) ════ */}
            {panel==='semua' && (
              <SemuaPanel
                role={role} isAdmin={isAdmin}
                kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterTahun={filterTahunSemua}   setFilterTahun={setFilterTahunSemua}
                filterBidang={filterBidangSemua} setFilterBidang={setFilterBidangSemua}
                filterStatus={filterStatusSemua} setFilterStatus={setFilterStatusSemua}
                filterJenis={filterJenisSemua}   setFilterJenis={setFilterJenisSemua}
                filterSearch={filterSearchSemua} onSearchChange={onSearchSemua}
                data={semuaData} loading={semuaLoading}
                page={semuaPage} totalPages={semuaPages} total={semuaTotal}
                setPage={fetchSemua}
                openDetail={openDetail}
                openTelaah={setTelaahHeader}
                onExportExcel={exportExcel}
                onExportPdf={exportPrint}
                statusOnly={role === 'ADMIN' ? ADMIN_ANTRIAN_STATUSES : undefined}
                isLight={isLight}
              />
            )}

            {/* ════ DATA ADMIN (hasil telaah admin tuntas) ════ */}
            {panel==='data-admin' && (
              <SemuaPanel
                role={role} isAdmin={isAdmin}
                kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterTahun={filterTahunDA}   setFilterTahun={setFilterTahunDA}
                filterBidang={filterBidangDA} setFilterBidang={setFilterBidangDA}
                filterStatus={filterStatusDA} setFilterStatus={setFilterStatusDA}
                filterJenis={filterJenisDA}   setFilterJenis={setFilterJenisDA}
                filterSearch={filterSearchDA} onSearchChange={onSearchDA}
                data={dataAdminData} loading={dataAdminLoading}
                page={dataAdminPage} totalPages={dataAdminPages} total={dataAdminTotal}
                setPage={fetchDataAdmin}
                openDetail={openDetail}
                openTelaah={setTelaahHeader}
                onExportExcel={exportExcel}
                onExportPdf={exportPrint}
                exportName="data-admin" exportTitle="Data Admin"
                statusHide={HIDE_DATA_ADMIN_STATUSES}
                isLight={isLight}
              />
            )}

            {/* ════ ANTRIAN VERIF (Kasubag/Kabag) ════ */}
            {panel==='antrian' && (
              <AntrianPanel
                role={role} kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterTahun={filterAntrianTahun}   setFilterTahun={setFilterAntrianTahun}
                filterBidang={filterAntrianBidang} setFilterBidang={setFilterAntrianBidang}
                filterStatus={filterAntrianStatus} setFilterStatus={setFilterAntrianStatus}
                data={antrianData} loading={antrianLoading}
                page={antrianPage} totalPages={antrianPages} total={antrianTotal}
                setPage={fetchAntrian}
                openDetail={openDetail}
                openPutusan={setPutusanHeader}
                openBulkModal={openBulkModal}
                isLight={isLight}
              />
            )}

            {/* ════ DATA USULAN (Kasubag/Kabag) ════ */}
            {panel==='data-usulan' && (
              <DataUsulanPanel
                tahunList={tahunList}
                filterTahun={filterTahunDU}     setFilterTahun={setFilterTahunDU}
                filterBidang={filterBidangDU}   setFilterBidang={setFilterBidangDU}
                filterStatus={filterStatusDU}   setFilterStatus={setFilterStatusDU}
                filterJenis={filterJenisDU}     setFilterJenis={setFilterJenisDU}
                filterSearch={filterSearchDU}   onSearchChange={onSearchDU}
                data={dataUsulanData} loading={dataUsulanLoading}
                page={dataUsulanPage} totalPages={dataUsulanPages} total={dataUsulanTotal}
                setPage={fetchDataUsulan}
                openDetail={openDetail}
                onExportExcel={exportExcel}
                onExportPdf={exportPrint}
                isLight={isLight}
              />
            )}

            {/* ════ REKAP VERIF ════ */}
            {panel==='rekap-verif' && (
              <RekapVerifPanel loading={rekapLoading} data={rekapData} onRefresh={() => fetchKPI(true)} isLight={isLight}/>
            )}

            {/* ════ REKAP & LAPORAN (admin) ════ */}
            {panel==='rekap' && (
              <RekapPanel loading={rekapLoading} data={rekapData} onRefresh={() => fetchKPI(true)} isLight={isLight}/>
            )}

            {/* ════ BIDANG ANTRIAN ════ */}
            {panel==='bidang-antrian' && (
              <BidangAntrianPanel
                kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterTahun={filterBidangAntrianTahun}   setFilterTahun={setFilterBidangAntrianTahun}
                filterSearch={filterBidangAntrianSearch} setFilterSearch={setFilterBidangAntrianSearch}
                data={bidangAntrianData} loading={bidangAntrianLoading}
                page={bidangAntrianPage} totalPages={bidangAntrianPages} total={bidangAntrianTotal}
                setPage={fetchBidangAntrian}
                openDetail={openDetail}
                openReview={setBidangRevHeader}
                isLight={isLight}
              />
            )}

            {/* ════ BIDANG DATA ════ */}
            {panel==='bidang-data' && (
              <BidangDataPanel
                kpi={kpi} kpiLoading={kpiLd} tahunList={tahunList}
                filterTahun={filterBidangDataTahun}     setFilterTahun={setFilterBidangDataTahun}
                filterStatus={filterBidangDataStatus}   setFilterStatus={setFilterBidangDataStatus}
                filterJenis={filterBidangDataJenis}     setFilterJenis={setFilterBidangDataJenis}
                data={bidangDataList} loading={bidangDataLoading}
                page={bidangDataPage} totalPages={bidangDataPages} total={bidangDataTotal}
                setPage={fetchBidangData}
                openDetail={openDetail}
                onExportExcel={exportExcel}
                onExportPdf={exportPrint}
                isLight={isLight}
              />
            )}

            {/* ════ KELOLA USER ════ */}
            {panel==='kelola-user' && (
              <KelolaUserPanel
                searchQ={userSearchQ} onSearchChange={onSearchUser}
                data={userList} loading={userLoading}
                page={userPage} totalPages={userPages} total={userTotal}
                setPage={fetchUsers}
                doChangeRole={doChangeRole}
                isLight={isLight}
              />
            )}

            {/* ════ BATAS WAKTU ════ */}
            {panel==='batas-waktu' && (
              <BatasWaktuPanel
                bwMulai={bwMulai}     setBwMulai={setBwMulai}
                bwSelesai={bwSelesai} setBwSelesai={setBwSelesai}
                bwPesan={bwPesan}     setBwPesan={setBwPesan}
                bwAktif={bwAktif}     setBwAktif={setBwAktif}
                onSaved={() => { configLoadedRef.current = false; fetchConfig(true); }}
              />
            )}

            {/* ════ SET PAGU ════ */}
            {panel==='set-pagu' && (
              <SetPaguPanel
                currentPagu={paguCurrent}
                onSaved={(n) => { setPaguCurrent(n); fetchKPI(true); }}
              />
            )}

            {/* ════ HAPUS USULAN ════ */}
            {panel==='hapus-usulan' && (
              <HapusUsulanPanel
                filterBidang={hapusBidang}  setFilterBidang={setHapusBidang}
                filterSearch={hapusSearch}  onSearchChange={onSearchHapus}
                data={hapusData} loading={hapusLoading}
                page={hapusPage} totalPages={hapusPages} total={hapusTotal}
                setPage={fetchHapus}
                hapusErr={hapusErr} setHapusErr={setHapusErr}
                hapusOk={hapusOk}   setHapusOk={setHapusOk}
                hapusAllLoading={hapusAllLoading}
                hapusAllProgress={hapusAllProgress}
                doHapus={doHapus}
                doHapusSemua={doHapusSemua}
                isLight={isLight}
              />
            )}

          </div>{/* /ua-content */}
        </div>{/* /ua-main */}
      </div>{/* /ua-body */}

      {/* ══════════════════════════════════════════════════
          MODAL: DETAIL USULAN
      ══════════════════════════════════════════════════ */}
      <DetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        data={detailData}
        loading={detailLoading}
        revisiEdits={revisiEdits}
        setRevisiEdits={setRevisiEdits}
        role={role}
        currentUserId={userId}
        detailCacheRef={detailCacheRef}
        onResubmitSuccess={() => fetchMilik(milikPage)}
        showToast={showToast}
        setConfirmDlg={setConfirmDlg}
        isLight={isLight}
      />

      {/* ══════════════════════════════════════════════════
          MODAL: TELAAH (Admin) — extracted PERF-C2 Tahap 4
      ══════════════════════════════════════════════════ */}
      {telaahHeader && (
        <TelaahModal
          header={telaahHeader}
          onClose={() => setTelaahHeader(null)}
          onSuccess={() => {
            detailCacheRef.current.delete(telaahHeader.id);
            fetchSemua(semuaPage);
            fetchKPI(true);
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: PUTUSAN (Kasubag/Kabag) — extracted PERF-C2 Tahap 5
      ══════════════════════════════════════════════════ */}
      {putusanHeader && (
        <PutusanModal
          header={putusanHeader}
          role={role}
          onClose={() => setPutusanHeader(null)}
          onSuccess={() => {
            detailCacheRef.current.delete(putusanHeader.id);
            fetchAntrian(antrianPage);
            fetchKPI(true);
          }}
          showToast={showToast}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: PILIH TAHUN ANGGARAN — extracted PERF-C2 Tahap 6
      ══════════════════════════════════════════════════ */}
      {showTahunModal && (
        <TahunModal
          tahunList={tahunList}
          tahun={fTahun}
          setTahun={setFTahun}
          jenis={fJenis}
          setJenis={setFJenis}
          onClose={() => setShowTahunModal(false)}
          isLight={isLight}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: BIDANG REVIEW — extracted PERF-C2 Tahap 7
      ══════════════════════════════════════════════════ */}
      {bidangRevHeader && (
        <BidangReviewModal
          header={bidangRevHeader}
          onClose={() => setBidangRevHeader(null)}
          onSuccess={(msg) => {
            detailCacheRef.current.delete(bidangRevHeader.id);
            fetchBidangAntrian(bidangAntrianPage);
            fetchKPI(true);
            showToast(msg, false);
          }}
        />
      )}

      {/* ══ CONFIRM DIALOG ══ */}
      {confirmDlg && (
        <div className="modal-overlay" style={{zIndex:9999}} onClick={e=>{if(e.target===e.currentTarget){setConfirmDlg(null);}}}>
          <div style={{background:'#042C53',border:'1px solid #0C447C',borderRadius:14,padding:'28px 28px 20px',maxWidth:360,width:'90%',boxShadow:'0 8px 40px rgba(0,0,0,.5)',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>❓</div>
            <div style={{fontWeight:700,fontSize:15,color:'#E6F1FB',marginBottom:20,lineHeight:1.5}}>{confirmDlg.msg}</div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <PrimaButton variant="ghost" onClick={()=>setConfirmDlg(null)}>Batal</PrimaButton>
              <PrimaButton variant="primary" onClick={()=>{const fn=confirmDlg.onOk;setConfirmDlg(null);fn();}}>Ya, Lanjutkan</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOAST ══ */}
      {toast && (
        <div style={{
          position:'fixed',bottom:24,right:24,zIndex:10000,
          background:toast.isErr?'#fef2f2':'#f0fdf4',
          border:`1px solid ${toast.isErr?'#fca5a5':'#86efac'}`,
          color:toast.isErr?'#dc2626':'#15803d',
          borderRadius:10,padding:'12px 18px',fontSize:13,fontWeight:600,
          display:'flex',alignItems:'center',gap:8,
          boxShadow:'0 4px 20px rgba(0,0,0,.12)',maxWidth:360,
        }}>
          {toast.isErr ? <AlertCircle size={15}/> : <CheckCircle2 size={15}/>}
          {toast.text}
          <button onClick={()=>setToast(null)} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',marginLeft:4,lineHeight:1,padding:0}}>✕</button>
        </div>
      )}
    </>
  );
}