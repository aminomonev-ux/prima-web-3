'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
// O2: Tab dynamic-imported supaya bundle initial /kinerja tidak include
// semua tab. Tab di-load on-demand saat user pertama kali navigasi ke sana.
const DashboardTab = lazy(() => import('./_tabs/DashboardTab'));
const CetakTab     = lazy(() => import('./_tabs/CetakTab'));
const LaporanTab   = lazy(() => import('./_tabs/LaporanTab'));
const PengaturanTab = lazy(() => import('./_tabs/PengaturanTab'));
const RekeningTab  = lazy(() => import('./_tabs/RekeningTab'));
const MasterTab    = lazy(() => import('./_tabs/MasterTab'));
const PendapatanCrrTab = lazy(() => import('./_tabs/PendapatanCrrTab'));
const SskTab       = lazy(() => import('./_tabs/SskTab'));
const RealisasiTab = lazy(() => import('./_tabs/RealisasiTab'));
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { fetchJson } from '@/lib/shared/api';
import type { Role } from '@/types';
import SpandukBeku from '@/components/ui/SpandukBeku';
import type { InfoBeku } from '@/lib/security/beku';
// ─── Types & Helpers — semua dipindah ke ./_types.ts + ./_utils.ts ──────────
// Shell hanya import yang masih dipakai untuk fetcher + state container.
import type {
  SumberSSK, KTab, MasterRow, RekeningRow, SskRow, RealRow,
} from './_types';
import { recalcAllRealisasi } from './_utils';
import type { ItemSskAktif } from '@/lib/kinerja/rekap';
import type { PilihanVersiRekap, VersiSumberRekap } from '@/lib/kinerja/versi';
import { muatBahanRekap } from '@/lib/kinerja/muat-rekap';
import { bandingRealisasi, kalimatBelumTersimpan } from '@/lib/kinerja/banding-realisasi';
import { jumlahSskBerubah } from '@/lib/kinerja/sunting-ssk';
import type { BulanTertutup } from '@/lib/kinerja/tutup-bulan';
import Sidebar from './_components/Sidebar';
import Topbar from './_components/Topbar';
import { bolehBatalkanFinal } from '@/lib/constants';

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { userId: number; role: Role; username: string; themePreference: 'dark' | 'light';
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku; }

export default function KinerjaClient({ userId, role, username, themePreference, beku }: Props) {
  void userId;

  const tahunDefault = new Date().getFullYear().toString();
  const [tahun,       setTahun]       = useState(tahunDefault);
  const [activeTab,   setActiveTab]   = useState<KTab>('dashboard');
  // IK-2: Rima pemicu Import — chip link /kinerja?import=pendapatan → buka tab
  // Pendapatan & CRR + minta tab membuka modal Import sekali (Model A′).
  const searchParams = useSearchParams();
  const wantImportPend = searchParams.get('import') === 'pendapatan';
  const [autoImportPend, setAutoImportPend] = useState(false);
  useEffect(() => {
    if (wantImportPend) { setActiveTab('pend-crr'); setAutoImportPend(true); }
  }, [wantImportPend]);
  const consumeImportPend = useCallback(() => setAutoImportPend(false), []);
  // IK-4 #5: chip Rima /kinerja?import=realisasi → buka tab Realisasi + modal Import.
  const wantImportReal = searchParams.get('import') === 'realisasi';
  const [autoImportReal, setAutoImportReal] = useState(false);
  useEffect(() => {
    if (wantImportReal) { setActiveTab('realisasi'); setAutoImportReal(true); }
  }, [wantImportReal]);
  const consumeImportReal = useCallback(() => setAutoImportReal(false), []);
  // IK-3: chip Rima "Buka Pendapatan & CRR" → /kinerja?tab=pend-crr (buka tab, tanpa modal).
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    const valid: KTab[] = ['dashboard','master','rekening','ssk','realisasi','cetak','pend-crr','laporan','pengaturan'];
    if (tabParam && (valid as string[]).includes(tabParam)) setActiveTab(tabParam as KTab);
  }, [tabParam]);
  const [activeSumber,setActiveSumber]= useState<SumberSSK>('GAJI');
  // O2: masterTipe state dipindah ke _tabs/MasterTab (panel-lokal).
  const [masterSumber,setMasterSumber]= useState<SumberSSK>('GAJI'); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  // Desktop sidebar collapse — icon-only mode, persist di localStorage
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => {
    try { setSidebarHidden(localStorage.getItem('kinerja_sidebar_hidden') === '1'); } catch {}
  }, []);
  const toggleSidebar = () => {
    setSidebarHidden(v => {
      const next = !v;
      try { localStorage.setItem('kinerja_sidebar_hidden', next ? '1' : '0'); } catch {}
      return next;
    });
  };
  const [loggingOut,  setLoggingOut]  = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = currentTheme === 'light';
  // Custom confirm modal
  const [confirmModal, setConfirmModal] = useState<{ msg: string; action: () => void } | null>(null);
  function showConfirm(msg: string, action: () => void) { setConfirmModal({ msg, action }); }
  function confirmOk() { if (confirmModal) { confirmModal.action(); setConfirmModal(null); } }
  function confirmCancel() { setConfirmModal(null); }

  // Data states
  // O2: kpi state dipindah ke _tabs/DashboardTab (panel-lokal).
  // O2: masterRows state dipindah ke _tabs/MasterTab. Shell di-notify pending
  // changes via onPendingChange callback ke pendingMasterRef untuk beforeunload guard.
  const [rekeningRows,setRekeningRows]= useState<RekeningRow[]>([]);
  const [sskRows,     setSskRows]     = useState<SskRow[]>([]);
  // Refactor Versi (Checkpoint C): versi SSK aktif. Default MURNI seq=0.
  const [sskVersi,    setSskVersi]    = useState<{ tipe: 'MURNI'|'PERUBAHAN'; seq: number }>({ tipe: 'MURNI', seq: 0 });
  const [sskVersion,  setSskVersion]  = useState(0); // V3-6 optimistic lock baseline (dari GET)
  const [realVersion, setRealVersion] = useState(0); // V3-6 optimistic lock baseline realisasi
  /**
   * Isi TERSIMPAN terakhir (dari GET / sesudah Simpan). "Belum tersimpan" dihitung dari
   * layar vs dasar ini, bukan bendera yang dinyalakan di tiap jalur (L79b) — ketik,
   * Init, Impor, Samakan, Pulihkan terdeteksi tanpa satu pun bisa lupa memasangnya.
   */
  const [sskDasar,    setSskDasar]    = useState<SskRow[]>([]);

  // Form states
  // O2: masterInput, masterEditId, 3 ref state dipindah ke _tabs/MasterTab.
  // O2: rekForm + rekEditIdx state dipindah ke _tabs/RekeningTab.
  const [masterOpts, setMasterOpts] = useState<{
    program: string[]; kegiatan: string[]; kegiatanRows: MasterRow[]; subkegiatan: string[]; subkegiatanRows: MasterRow[]; sumber_anggaran: string[]; uraian_ssk: string[]; sskRows: MasterRow[];
  }>({ program: [], kegiatan: [], kegiatanRows: [], subkegiatan: [], subkegiatanRows: [], sumber_anggaran: [], uraian_ssk: [], sskRows: [] });
  const [, setMasterOptsLoaded] = useState(false); // masterOptsLoaded not used in render

  // Loading
  // O2: loadingKpi + kpi state dipindah ke _tabs/DashboardTab (lokal panel).
  const [loadingData, setLoadingData] = useState(false);
  const [saving,      setSaving]      = useState(false);

  // Phase 3 & 4 data states
  const [realisasiSumber, setRealisasiSumber] = useState<SumberSSK>('GAJI');
  const [realisasiBulan,  setRealisasiBulan]  = useState<number>(new Date().getMonth() + 1);
  const [realisasiRows,   setRealisasiRows]   = useState<RealRow[]>([]);
  const [realDasar,       setRealDasar]       = useState<RealRow[]>([]);
  /** Bulan realisasi yang sudah ditutup — datang di balasan yang sama dengan barisnya (L88). */
  const [realTertutup,    setRealTertutup]    = useState<BulanTertutup[]>([]);
  const [realisasiAllRows, setRealisasiAllRows] = useState<RealRow[]>([]);
  // A8: item SSK versi aktif SEMUA sumber — penyebut Rekap. Datang dari balasan
  // yang sama dengan barisnya, jadi "versi mana" cuma punya satu jawaban (L88).
  const [realisasiAllItems, setRealisasiAllItems] = useState<ItemSskAktif[]>([]);
  /** A9: sumber yang versi SSK acuannya habis dinol-kan — pagunya 0 disengaja. */
  const [sumberDinolkan, setSumberDinolkan] = useState<SumberSSK[]>([]);
  /**
   * Pilihan versi untuk Cetak -> Rekap. Bawaannya "berlaku" = perilaku seluruh
   * layar lain, jadi jawaban yang benar didapat tanpa memilih apa pun dan
   * pilihan yang lain butuh tindakan sengaja.
   */
  const [pilihanVersi, setPilihanVersi] = useState<PilihanVersiRekap>('berlaku');
  /** Versi yang BENAR-BENAR dipakai tiap sumber — untuk kop dokumen & label layar. */
  const [versiRekap, setVersiRekap] = useState<VersiSumberRekap[]>([]);
  /**
   * Nomor giliran pemuatan Rekap. Pemuatannya 8 permintaan (16 kalau versi
   * murni, karena daftar versinya dibaca dulu), jadi dua pemuatan yang saling
   * menyalip BISA selesai tidak berurutan — dan yang selesai terakhir belum
   * tentu yang terakhir diminta. Tanpa pagar ini, mengklik "Versi Murni" lalu
   * cepat kembali ke "Versi Berlaku" meninggalkan angka murni di layar dengan
   * label DAN nama berkas "berlaku": dokumen yang salah menyebut versinya,
   * tepat yang seluruh fitur ini ada untuk mencegah.
   */
  const giliranMuatRef = useRef(0);
  /** Rekap sudah pernah dimuat? Penentu apakah ganti tahun perlu memuat ulang. */
  const rekapPernahDimuatRef = useRef(false);
  // O2: cetakView state dipindah ke _tabs/CetakTab.
  // O2: crrRows + pendapatanRows state dipindah ke _tabs/PendapatanCrrTab.

  // O2: Laporan state (laporanSumber, laporanData, laporanAll) dipindah ke _tabs/LaporanTab.

  // Submenu RKO toggle
  const [rkoOpen,        setRkoOpen]        = useState(false);
  const [realOpen,       setRealOpen]       = useState(false);

  // O2: cetakBulan, rekapBulan, rekapDepth state dipindah ke _tabs/CetakTab.

  // O2: crrAutoFilling state dipindah ke _tabs/PendapatanCrrTab.

  // Loaded guard (avoid double-fetch)
  const loaded = useRef<Record<string,boolean>>({});

  // Ref untuk melacak pending master rows (dipakai di beforeunload listener).
  // O2: di-set via callback `onPendingChange` dari MasterTab (state lokal panel).
  const pendingMasterRef = useRef(false);
  const handleMasterPendingChange = useCallback((hasPending: boolean) => {
    pendingMasterRef.current = hasPending;
  }, []);

  // ─── Belum tersimpan: Realisasi & RKO ──────────────────────────────────────
  // Layar Realisasi menampilkan SATU bulan tapi memegang setahun, dan hampir tiap
  // pergantian konteks (sumber, versi, tahun, menu) memuat ulang lalu menimpa layar —
  // dulu tanpa satu pertanyaan pun. Docs/CONCEPT-kinerja-simpan-realisasi.md §4.
  const bandingReal = useMemo(() => bandingRealisasi(realDasar, realisasiRows), [realDasar, realisasiRows]);
  const sskBerubah  = useMemo(() => jumlahSskBerubah(sskDasar, sskRows), [sskDasar, sskRows]);
  const alasanBelumTersimpan = useMemo(() => {
    const bagian: string[] = [];
    if (bandingReal.adaPerubahan) bagian.push(`Realisasi ${realisasiSumber}: ${kalimatBelumTersimpan(bandingReal.perBulan)}`);
    if (sskBerubah > 0) bagian.push(`RKO ${activeSumber}: ${sskBerubah} baris`);
    return bagian.length > 0 ? bagian.join('\n') : null;
  }, [bandingReal, sskBerubah, realisasiSumber, activeSumber]);
  // Lewat ref: `guardPending` & beforeunload dipasang sekali dan dipakai Topbar/Sidebar.
  const alasanRef = useRef<string | null>(null);
  const buangRef  = useRef<() => void>(() => {});
  useEffect(() => {
    alasanRef.current = alasanBelumTersimpan;
    // "Tinggalkan" = isiannya DIBUANG: layar dikembalikan ke isi tersimpan, kalau tidak
    // isian yang sudah ditinggalkan tetap tercatat "belum tersimpan" dan setiap
    // pergantian berikutnya menanyakannya lagi.
    buangRef.current = () => { setRealisasiRows(realDasar); setSskRows(sskDasar); };
  }, [alasanBelumTersimpan, realDasar, sskDasar]);

  /** Kalimat isian yang belum tersimpan di seluruh shell, `null` kalau aman. */
  const alasanTinggalkan = useCallback((): string | null => {
    const bagian = [
      pendingMasterRef.current ? 'Master Rekening: ada data baru' : null,
      alasanRef.current,
    ].filter(Boolean);
    return bagian.length > 0 ? bagian.join('\n') : null;
  }, []);

  // Guard browser refresh / close tab
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (alasanTinggalkan()) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [alasanTinggalkan]);

  /** Guard tiap pergantian yang membuang isi layar: menu, sumber, versi, tahun, Keluar.
   *  useCallback + ref supaya ref-access tidak terdeteksi sebagai during-render. */
  const guardPending = useCallback((action: () => void) => {
    const alasan = alasanTinggalkan();
    if (alasan) {
      showConfirm(`Ada isian yang belum disimpan:\n${alasan}\n\nAbaikan dan lanjutkan?`, () => { buangRef.current(); action(); });
    } else {
      action();
    }
  }, [alasanTinggalkan]);

  // Tahun change: reset loaded guard supaya semua tab re-fetch dgn tahun baru.
  // React 19: pisah dari inline JSX agar mutasi ref tidak terdeteksi sbg "during render".
  // Lewat guardPending: ganti tahun memuat ulang semua tab dan menimpa isian di layar.
  const handleTahunChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = e.target.value;
    guardPending(() => {
      setTahun(t);
      loaded.current = {};
    });
  }, [guardPending]);

  // Click-outside untuk tutup sidebar flyout (saat collapsed).
  // Drop-user click-outside dipindah ke <Topbar/> (refs scope di sana).
  useEffect(() => {
    if (!sidebarHidden) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const insideGroup = target.closest?.('.kinerja-dropdown-group');
      if (!insideGroup) {
        setRkoOpen(false);
        setRealOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sidebarHidden]);

  // Dipanggil Topbar lewat guardPending — pertanyaannya sudah dijawab SEBELUM sesi
  // dimatikan. Ref dilepas supaya beforeunload tidak bertanya lagi sesudah sesinya mati.
  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    pendingMasterRef.current = false;
    alasanRef.current = null;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Keluar wajib muat ulang penuh: sisa sesi ikut terbuang
    window.location.href = '/login';
  }, []);

  const canEdit = ['SUPER_ADMIN','ADMIN','ADMIN_KASUBAG','ADMIN_KABAG','RENBANG','PROGRAM','KEUANGAN'].includes(role);

  // ─── Data Fetchers ──────────────────────────────────────────────────────────

  // NEW-1 (BUG-W3 follow-up): migrate raw fetch() → fetchJson untuk dapat
  // error handling (network/HTTP/JSON parse) + surface server message. Server
  // response shape pakai {ok, FIELD} (kpi/rows/data) — cast via `as` karena
  // tidak fit ke ApiResult<T>.data standar.

  // O2: fetchKpi dipindah ke _tabs/DashboardTab (panel-lokal).

  // O2: fetchMaster dipindah ke _tabs/MasterTab (panel-lokal).

  const fetchRekening = useCallback(async (sumber: SumberSSK) => {
    setLoadingData(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/rekening?tahun=${tahun}&sumber=${sumber}`);
      if (d.ok) setRekeningRows((d as unknown as { rows: RekeningRow[] }).rows);
      else toast.error(d.message || 'Gagal memuat rekening');
    } finally { setLoadingData(false); }
  }, [tahun]);

  const fetchMasterOpts = useCallback(async () => {
    // Silent fail per-fetch: kalau salah satu endpoint gagal, isi [] untuk yang itu
    // saja, jangan blok semua dropdown (UX: better partial daripada blank options).
    const pickRows = (d: Awaited<ReturnType<typeof fetchJson>>): MasterRow[] =>
      d.ok ? (d as { rows?: MasterRow[] }).rows ?? [] : [];
    const [prog, keg, sub, sumberAng, sskData] = await Promise.all([
      fetchJson<unknown>(`/api/kinerja/master?tahun=${tahun}&tipe=program`),
      fetchJson<unknown>(`/api/kinerja/master?tahun=${tahun}&tipe=kegiatan`),
      fetchJson<unknown>(`/api/kinerja/master?tahun=${tahun}&tipe=subkegiatan`),
      fetchJson<unknown>(`/api/kinerja/master?tahun=${tahun}&tipe=sumber_anggaran`),
      fetchJson<unknown>(`/api/kinerja/master?tahun=${tahun}&tipe=uraian_ssk`),
    ]);
    const progRows = pickRows(prog);
    const kegRows  = pickRows(keg);
    const subRows  = pickRows(sub);
    const sumberAngRows = pickRows(sumberAng);
    const sskDataRows = pickRows(sskData);
    setMasterOpts({
      program:          progRows.map(r => r.nama),
      kegiatan:         kegRows.map(r => r.nama),
      kegiatanRows:     kegRows,
      subkegiatan:      subRows.map(r => r.nama),
      subkegiatanRows:  subRows,
      sumber_anggaran:  sumberAngRows.map(r => r.nama),
      uraian_ssk:       sskDataRows.map(r => r.nama),
      sskRows:          sskDataRows,
    });
    setMasterOptsLoaded(true);
  }, [tahun]);

  // Refactor Versi: auto-set sskVersi ke LATEST (seq tertinggi) saat ganti sumber/tahun.
  // Default UX: user lihat versi terbaru, bukan MURNI (yang biasanya sudah locked).
  // Nomor giliran tiap pemuat: pergantian sumber/versi/tab memicu beberapa pemuatan
  // berturut-turut, dan jawaban yang datang TERLAMBAT tidak boleh menimpa yang terbaru —
  // layarnya akan berisi angka sumber/versi lain di bawah label yang benar.
  const giliranVersiRef = useRef(0);
  const giliranSskRef   = useRef(0);
  const giliranRealRef  = useRef(0);

  const ensureLatestVersi = useCallback(async (sumber: SumberSSK) => {
    const giliran = ++giliranVersiRef.current;
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${sumber}`);
      if (!d.ok || giliran !== giliranVersiRef.current) return;
      const items = ((d as unknown as { items: { versi_tipe: 'MURNI'|'PERUBAHAN'; versi_seq: number }[] }).items) ?? [];
      if (items.length === 0) { setSskVersi({ tipe: 'MURNI', seq: 0 }); return; }
      // Cari latest: max seq, prefer PERUBAHAN > MURNI di seq sama
      const latest = items.reduce((acc, cur) => {
        if (cur.versi_seq > acc.versi_seq) return cur;
        if (cur.versi_seq === acc.versi_seq && cur.versi_tipe === 'PERUBAHAN' && acc.versi_tipe === 'MURNI') return cur;
        return acc;
      }, items[0]);
      setSskVersi({ tipe: latest.versi_tipe, seq: latest.versi_seq });
    } catch { /* fallback ke MURNI seq=0 */ }
  }, [tahun]);

  /** Isi RKO tersimpan TANPA memasangnya — pemuat biasa DAN penggabung bentrok 409. */
  const ambilSsk = useCallback(async (sumber: SumberSSK, versiTipe?: 'MURNI'|'PERUBAHAN', versiSeq?: number) => {
    const vt = versiTipe ?? sskVersi.tipe;
    const vs = versiSeq  ?? sskVersi.seq;
    const d = await fetchJson<unknown>(`/api/kinerja/ssk?tahun=${tahun}&sumber=${sumber}&versi_tipe=${vt}&versi_seq=${vs}`);
    if (!d.ok) return { ok: false as const, message: d.message };
    const j = d as unknown as { rows: SskRow[]; version?: number };
    return { ok: true as const, rows: j.rows, version: Number(j.version ?? 0) };
  }, [tahun, sskVersi.tipe, sskVersi.seq]);

  const fetchSsk = useCallback(async (sumber: SumberSSK, versiTipe?: 'MURNI'|'PERUBAHAN', versiSeq?: number) => {
    const giliran = ++giliranSskRef.current;
    setLoadingData(true);
    try {
      const h = await ambilSsk(sumber, versiTipe, versiSeq);
      if (giliran !== giliranSskRef.current) return;
      if (h.ok) {
        setSskRows(h.rows);
        setSskDasar(h.rows);
        setSskVersion(h.version);
      } else toast.error(h.message || 'Gagal memuat SSK');
    } finally { if (giliran === giliranSskRef.current) setLoadingData(false); }
  }, [ambilSsk]);

  /**
   * Isi realisasi tersimpan TANPA memasangnya ke layar — dipakai pemuat biasa DAN
   * penggabung bentrok 409 (yang harus membandingkan dulu sebelum memasang apa pun).
   */
  const ambilRealisasi = useCallback(async (sumber: SumberSSK, versiTipe?: 'MURNI'|'PERUBAHAN', versiSeq?: number) => {
    const vt = versiTipe ?? sskVersi.tipe;
    const vs = versiSeq  ?? sskVersi.seq;
    const d = await fetchJson<unknown>(`/api/kinerja/realisasi?tahun=${tahun}&sumber=${sumber}&versi_tipe=${vt}&versi_seq=${vs}`);
    if (!d.ok) return { ok: false as const, message: d.message };
    const j = d as unknown as { rows: RealRow[]; version?: number; tertutup?: BulanTertutup[] };
    // Refactor Versi: GET hydrated path mengembalikan kolom turunan ter-recalc dari server.
    // Tetap panggil recalcAllRealisasi (idempotent) supaya konsisten dgn UI lama saat user edit.
    return { ok: true as const, rows: recalcAllRealisasi(j.rows), version: Number(j.version ?? 0), tertutup: j.tertutup ?? [] };
  }, [tahun, sskVersi.tipe, sskVersi.seq]);

  const fetchRealisasi = useCallback(async (sumber: SumberSSK, versiTipe?: 'MURNI'|'PERUBAHAN', versiSeq?: number) => {
    const giliran = ++giliranRealRef.current;
    setLoadingData(true);
    try {
      const h = await ambilRealisasi(sumber, versiTipe, versiSeq);
      if (giliran !== giliranRealRef.current) return;
      if (h.ok) {
        setRealisasiRows(h.rows);
        setRealDasar(h.rows);
        setRealVersion(h.version);
        setRealTertutup(h.tertutup);
      }
      else toast.error(h.message || 'Gagal memuat realisasi');
    } finally { if (giliran === giliranRealRef.current) setLoadingData(false); }
  }, [ambilRealisasi]);

  /**
   * `pilihan` dioper eksplisit, bukan dibaca dari state: pemilihnya memanggil
   * fungsi ini pada klik yang sama dengan `setPilihanVersi`, dan state React
   * belum berganti di saat itu — membacanya dari state akan memuat versi yang
   * BARUSAN ditinggalkan, tepat kesalahan yang paling sulit dikenali karena
   * layarnya tetap berisi angka yang masuk akal.
   */
  const fetchRealisasiAll = useCallback(async (pilihan: PilihanVersiRekap = pilihanVersi) => {
    const giliran = ++giliranMuatRef.current;
    setLoadingData(true);
    try {
      // Partial fail OK: sumber yang gagal kosong sendiri, sumber lain tetap tampil, tanpa
      // toast per sumber. Resepnya di lib/kinerja/muat-rekap.ts — dipakai juga tabel LKJIP
      // yang tertaut ke Rekap, jadi keduanya mustahil berbeda angka.
      const bahan = await muatBahanRekap(tahun, pilihan, url => fetchJson<unknown>(url));
      // Hasil dari giliran yang sudah ditinggalkan DIBUANG, tidak dipasang:
      // memasangnya berarti angka dari pilihan lama duduk di bawah label
      // pilihan baru.
      if (giliran !== giliranMuatRef.current) return;
      setRealisasiAllRows(bahan.rows);
      setRealisasiAllItems(bahan.items);
      setSumberDinolkan(bahan.dinolkan);
      setVersiRekap(bahan.versiRekap);
      rekapPernahDimuatRef.current = true;
    } finally {
      // Hanya giliran terakhir yang boleh mematikan penanda memuat; kalau tidak,
      // pemuatan yang selesai lebih dulu membuat layar tampak siap sementara
      // yang lain masih berjalan.
      if (giliran === giliranMuatRef.current) setLoadingData(false);
    }
  }, [tahun, pilihanVersi]);

  /**
   * Ganti pilihan versi = ganti konteks: pilihannya disetel DAN datanya dimuat
   * ulang dalam satu tindakan. Menyetel pilihannya saja meninggalkan layar
   * berisi angka versi lama di bawah label versi baru (L78b/L83).
   */
  const gantiPilihanVersi = useCallback((v: PilihanVersiRekap) => {
    setPilihanVersi(v);
    void fetchRealisasiAll(v);
  }, [fetchRealisasiAll]);

  /**
   * Pembungkus TANPA argumen untuk layar Cetak.
   *
   * `fetchRealisasiAll` menerima `pilihan` sebagai argumen pertama, jadi
   * mengopernya langsung sebagai penangan (`onClick={onFetchAll}`) akan
   * mengirim event klik ke situ — objek yang bukan 'berlaku', sehingga seluruh
   * sumber dimuat dari versi murni sementara pemilihnya masih berbunyi "Versi
   * Berlaku". Bentuk cacat itu sudah pernah terjadi di repo ini
   * (`onClick={savePendapatan}` membuat `force` truthy, catatan Tahap 9a).
   */
  const muatRekap = useCallback(() => { void fetchRealisasiAll(); }, [fetchRealisasiAll]);

  /**
   * Ganti tahun sementara Rekap sudah dimuat = angka di layar jadi milik tahun
   * lain, sedangkan kop & judulnya sudah mengumumkan tahun yang baru. Dimuat
   * lewat ref supaya efek ini TIDAK ikut berjalan saat `pilihanVersi` berganti
   * (`gantiPilihanVersi` sudah memuatnya) — dua pemuatan untuk satu tindakan
   * adalah cara balapan di atas lahir.
   */
  const muatRekapRef = useRef(muatRekap);
  useEffect(() => { muatRekapRef.current = muatRekap; }, [muatRekap]);
  useEffect(() => { if (rekapPernahDimuatRef.current) muatRekapRef.current(); }, [tahun]);


  // O2: fetchCrr + fetchPendapatan dipindah ke _tabs/PendapatanCrrTab.

  // O2: fetchLaporan + fetchLaporanSemua dipindah ke _tabs/LaporanTab.

  // ─── Effects ────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  // O2: useEffect untuk fetchKpi() dipindah ke DashboardTab (panel-lokal).
  // O2: useEffect fetchMaster dipindah ke _tabs/MasterTab (panel-lokal).
  useEffect(() => { if (activeTab === 'rekening') fetchRekening(activeSumber); }, [activeTab, activeSumber, tahun, fetchRekening]);
  // Refactor Versi: auto-set versi latest saat sumber/tahun berubah.
  // Versi acuan dipakai bersama tab RKO (sumber `activeSumber`) dan tab Realisasi/Cetak
  // (sumber `realisasiSumber`) — keduanya BISA berbeda. Dulu yang dipakai selalu
  // `activeSumber`, jadi membuka Realisasi BLUD sementara GAJI sudah PERUBAHAN-1 memuat
  // BLUD dengan versi yang tidak ia punya: semua baris yatim, Init berkata "SSK kosong".
  const tabRealisasi = activeTab === 'realisasi' || activeTab === 'cetak';
  const sumberVersi = tabRealisasi ? realisasiSumber : activeSumber;
  useEffect(() => { ensureLatestVersi(sumberVersi); }, [sumberVersi, tahun, ensureLatestVersi]);
  useEffect(() => {
    if (activeTab === 'ssk') {
      fetchSsk(activeSumber);
      fetchRekening(activeSumber); // diperlukan oleh tombol "Inject dari Rekening"
    }
  }, [activeTab, activeSumber, tahun, fetchSsk, fetchRekening]);
  // Fetch SSK juga saat realisasi dibuka — dibutuhkan oleh initRealisasiFromSSK
  useEffect(() => { if (activeTab === 'realisasi') fetchSsk(realisasiSumber); }, [activeTab, realisasiSumber, tahun, fetchSsk]);
  useEffect(() => { if (activeTab === 'realisasi' || activeTab === 'cetak') fetchRealisasi(realisasiSumber); }, [activeTab, realisasiSumber, tahun, fetchRealisasi]);
  // O2: useEffect fetchPendapatan/fetchCrr dipindah ke _tabs/PendapatanCrrTab.
  // O2: useEffect fetch laporan dipindah ke _tabs/LaporanTab.
  useEffect(() => { setMasterOptsLoaded(false); }, [tahun]);
  // Re-fetch setiap buka rekening agar sinkron dengan master terbaru
  useEffect(() => { if (activeTab === 'rekening' || activeTab === 'master') fetchMasterOpts(); }, [activeTab, fetchMasterOpts]);
  // Re-fetch juga saat kembali ke rekening dari master (user mungkin baru tambah data)
  useEffect(() => { if (activeTab !== 'master') return; setMasterOptsLoaded(false); }, [activeTab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Master CRUD ────────────────────────────────────────────────────────────
  // O2: saveMaster + addMasterLocal + saveAllMaster + deleteMaster + editMaster +
  // deleteAllMaster semua dipindah ke _tabs/MasterTab (panel-lokal).

  // ─── Rekening CRUD ──────────────────────────────────────────────────────────

  // O2: addRekRow + editRekRow + deleteRekRow + saveRekening dipindah ke _tabs/RekeningTab.

  // ─── SSK CRUD ───────────────────────────────────────────────────────────────
  // O2: addSskRow + injectRekening + deleteSskRow + updateSskPagu +
  // updateSskMonth + saveSsk dipindah ke _tabs/SskTab (panel-lokal).

  // ─── Realisasi CRUD ─────────────────────────────────────────────────────────
  // O2: addRealRow + deleteRealRow + updateRealInput + initRealisasiFromSSK +
  // saveRealisasi dipindah ke _tabs/RealisasiTab (panel-lokal).


  // ─── Export wrappers ─────────────────────────────────────────────────────────
  // O2: 8 export function dipindah ke ./_exports.ts (pure, terima data sebagai
  // param). Wrapper ini bind state component ke param eksplisit — supaya
  // JSX onClick tetap `() => doExportSsk()` tanpa argument.
  // O2: doExportSskExcel/Pdf dipindah ke _tabs/SskTab.
  // O2: doExportRekeningExcel dipindah ke _tabs/RekeningTab.
  // O2: doExportRealisasiExcel/Pdf dipindah ke _tabs/RealisasiTab.
  // O2: doExportCrrExcel + doExportPendapatanExcel dipindah ke _tabs/PendapatanCrrTab.
  // O2: doExportLaporanExcel/Pdf dipindah ke _tabs/LaporanTab (panel-lokal).

  // ─── Render: Sidebar ────────────────────────────────────────────────────────

  const nav = useCallback((tab: KTab, sub?: SumberSSK, realSub?: SumberSSK) => {
    guardPending(() => {
      setActiveTab(tab);
      if (sub) setActiveSumber(sub);
      if (realSub) setRealisasiSumber(realSub);
      setSidebarOpen(false);
      if (tab !== 'ssk') setRkoOpen(false);
      if (tab !== 'realisasi' && tab !== 'cetak') setRealOpen(false);
    });
  }, [guardPending]);

  // Pergantian di DALAM tab yang memuat ulang lalu menimpa layar — lewat penjaga yang sama.
  const gantiSumberRealisasi = useCallback((s: SumberSSK) => guardPending(() => setRealisasiSumber(s)), [guardPending]);
  const gantiSumberRko       = useCallback((s: SumberSSK) => guardPending(() => setActiveSumber(s)), [guardPending]);
  const pilihVersi = useCallback((v: { tipe: 'MURNI'|'PERUBAHAN'; seq: number }) =>
    guardPending(() => setSskVersi(v)), [guardPending]);

  // ── Sidebar/Topbar di-extract ke _components/{Sidebar,Topbar}.tsx — eliminasi
  // rule react-hooks/refs (refs trace via guardPending closure).


  // ─── Render: Dashboard ──────────────────────────────────────────────────────


  // ─── Render: Master Rekening ─────────────────────────────────────────────────
  // PENTING: ini adalah fungsi render biasa (bukan React component) agar tidak
  // menyebabkan unmount/remount setiap re-render → fix bug focus hilang saat ketik


  // ─── Render: Rekening ────────────────────────────────────────────────────────


  // ─── Render: SSK ─────────────────────────────────────────────────────────────


  // ─── Render: Nomen ───────────────────────────────────────────────────────────

  // ─── Render: Realisasi ────────────────────────────────────────────────────────


  // ─── Render: Cetak Realisasi ─────────────────────────────────────────────────



  // ─── Render: Laporan Konsolidasi ─────────────────────────────────────────────


  // ─── Main Render ─────────────────────────────────────────────────────────────
  // O2: table style helpers (thStyle/thSub/tdBase/tdRight/tdCenter/inputNum) di-inline
  // di tab masing-masing yang masih pakai (SskTab, RealisasiTab).

  return (
    <>
      <style>{`
        /* Sidebar */
        [data-theme="light"] .kinerja-sidebar{background:rgba(255,255,255,0.98)!important;border-right:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .kinerja-sidebar-head{border-bottom:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .kinerja-sidebar-sub{color:#6B7280!important;}
        [data-theme="light"] .kinerja-section-label{color:#6B7280!important;}
        [data-theme="light"] .kinerja-nav-item{color:#374151!important;}
        [data-theme="light"] .kinerja-nav-item:hover{background:rgba(139,92,246,0.06)!important;color:#5B21B6!important;}
        [data-theme="light"] .kinerja-nav-item.active{background:linear-gradient(90deg,rgba(139,92,246,.28),rgba(236,72,153,.20))!important;color:#5B21B6!important;font-weight:800!important;border-right:3px solid #8B5CF6!important;}
        [data-theme="light"] .kinerja-tahun-select{background:#FFFFFF!important;border-color:rgba(139,92,246,0.25)!important;color:#5B21B6!important;}
        /* Topbar */
        [data-theme="light"] .kinerja-topbar{background:rgba(255,255,255,0.95)!important;border-bottom:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .kinerja-topbar-sub{color:#6B7280!important;}
        [data-theme="light"] .kinerja-topbar-breadcrumb{color:#6B7280!important;}
        [data-theme="light"] .kinerja-menu-btn{border-color:rgba(139,92,246,0.3)!important;color:#5B21B6!important;background:rgba(139,92,246,0.04)!important;}
        [data-theme="light"] .kinerja-menu-btn:hover{border-color:#8B5CF6!important;color:#6D28D9!important;background:rgba(139,92,246,0.10)!important;}
        /* User badge */
        [data-theme="light"] .kinerja-user-badge{border-color:rgba(139,92,246,0.25)!important;background:rgba(139,92,246,0.05)!important;}
        [data-theme="light"] .kinerja-user-name{color:#0F0F12!important;}
        [data-theme="light"] .kinerja-user-role{color:#6B7280!important;}
        [data-theme="light"] .kinerja-dropdown{background:rgba(255,255,255,0.98)!important;border:1px solid rgba(0,0,0,0.1)!important;box-shadow:0 16px 48px rgba(0,0,0,0.15)!important;}
        [data-theme="light"] .kinerja-drop-item{color:#374151!important;}
        [data-theme="light"] .kinerja-drop-item:hover{background:rgba(0,0,0,0.04)!important;}
        [data-theme="light"] .kinerja-drop-item.danger{color:#DC2626!important;}
        [data-theme="light"] .kinerja-drop-divider{background:rgba(0,0,0,0.08)!important;}
        /* Brand icon + title + avatar — ungu-pink */
        [data-theme="light"] .kinerja-sidebar-icon{background:linear-gradient(135deg,#8B5CF6,#EC4899)!important;border-color:rgba(139,92,246,0.4)!important;}
        [data-theme="light"] .kinerja-sidebar-title{background:linear-gradient(135deg,#8B5CF6,#EC4899)!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;}
        [data-theme="light"] .kinerja-user-avatar{background:linear-gradient(135deg,#8B5CF6,#EC4899)!important;color:#FFFFFF!important;}
        /* Scrollbar */
        [data-theme="light"] *::-webkit-scrollbar{width:10px;height:10px;background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-track{background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-thumb{background:#C7CCD4;border:2px solid #ECEEF3;border-radius:6px;}
        [data-theme="light"] *::-webkit-scrollbar-thumb:hover{background:#A0A6B0;}
        [data-theme="light"] *::-webkit-scrollbar-corner{background:#ECEEF3;}
        [data-theme="light"] *{scrollbar-color:#C7CCD4 #ECEEF3;scrollbar-width:thin;}
        /* Tabel umum (target plain HTML table tags di tab) */
        [data-theme="light"] table thead{background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))!important;}
        [data-theme="light"] table thead th{color:#5B21B6!important;background:transparent!important;font-weight:700!important;border-color:rgba(139,92,246,0.22)!important;}
        [data-theme="light"] table tbody td{color:#374151!important;border-color:rgba(139,92,246,0.08)!important;}
        [data-theme="light"] table tbody tr:hover td{background:rgba(139,92,246,0.04)!important;}
        /* Input/select fallback light */
        [data-theme="light"] input:not([type=checkbox]):not([type=radio]):not([type=file]),
        [data-theme="light"] select,
        [data-theme="light"] textarea{background:#FFFFFF!important;border-color:rgba(139,92,246,0.25)!important;color:#0F0F12!important;}
        [data-theme="light"] input:focus,
        [data-theme="light"] select:focus,
        [data-theme="light"] textarea:focus{border-color:#8B5CF6!important;box-shadow:0 0 0 3px rgba(139,92,246,0.15)!important;outline:none!important;}
        /* Dark scrollbar untuk tab content area */
        *::-webkit-scrollbar{width:10px;height:10px;background:#020F1C;}
        *::-webkit-scrollbar-track{background:#020F1C;}
        *::-webkit-scrollbar-thumb{background:#0C447C;border:2px solid #020F1C;border-radius:6px;}
        *::-webkit-scrollbar-thumb:hover{background:#185FA5;}
        *::-webkit-scrollbar-corner{background:#020F1C;}
        *{scrollbar-color:#0C447C #020F1C;scrollbar-width:thin;}
        /* Collapsed sidebar — icon only mode */
        .kinerja-sidebar.collapsed{width:64px!important;overflow:visible!important;}
        .kinerja-sidebar.collapsed .kinerja-brand-text{display:none;}
        .kinerja-sidebar.collapsed .kinerja-brand-wrap{justify-content:center;}
        .kinerja-sidebar.collapsed .kinerja-sidebar-head{justify-content:center;padding:14px 8px 10px;flex-direction:column;gap:8px;}
        .kinerja-sidebar.collapsed .kinerja-nav-item{padding:9px 0!important;margin:2px 6px!important;width:calc(100% - 12px)!important;justify-content:center!important;gap:0!important;}
        .kinerja-sidebar.collapsed .kinerja-nav-label{display:none;}
        .kinerja-sidebar.collapsed .kinerja-nav-chevron{display:none;}
        .kinerja-sidebar.collapsed .kinerja-section-label{display:none;}
        .kinerja-sidebar.collapsed .kinerja-dropdown-toggle{justify-content:center!important;}
        /* Title flyout (hidden saat expanded) */
        .kinerja-flyout-title{display:none;}
        /* Sub-dropdown panel — saat collapsed, render sebagai FLYOUT popup
           absolute ke kanan sidebar (bukan stacked vertikal di dalam 64px). */
        .kinerja-dropdown-group{position:relative;}
        .kinerja-sidebar.collapsed .kinerja-dropdown-panel{
          position:absolute!important;
          left:calc(100% + 10px); top:0;
          width:220px;
          padding:10px 4px 12px!important;
          background:rgba(4,44,83,.98);
          border:1px solid #0C447C;
          border-radius:10px;
          box-shadow:0 12px 36px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3);
          z-index:300;
          backdrop-filter:blur(16px);
        }
        .kinerja-sidebar.collapsed .kinerja-dropdown-panel .kinerja-flyout-title{
          display:block; font-size:10px; font-weight:800; letter-spacing:.08em;
          text-transform:uppercase; color:#85B7EB; padding:2px 12px 8px;
          border-bottom:1px solid rgba(12,68,124,.4); margin-bottom:6px;
        }
        /* Light variant — flyout putih dengan border ungu */
        [data-theme="light"] .kinerja-sidebar.collapsed .kinerja-dropdown-panel{
          background:#FFFFFF;
          border:1px solid rgba(139,92,246,.25);
          box-shadow:0 12px 36px rgba(139,92,246,.20), 0 2px 8px rgba(0,0,0,.08);
        }
        [data-theme="light"] .kinerja-sidebar.collapsed .kinerja-dropdown-panel .kinerja-flyout-title{
          color:#5B21B6;
          border-bottom-color:rgba(139,92,246,.15);
        }
        .kinerja-sidebar.collapsed nav > div > div:not(.kinerja-section-label){padding-left:0!important;}
        /* Custom tooltip — muncul saat hover nav-item di collapsed */
        .kinerja-sidebar.collapsed .kinerja-nav-item{position:relative;}
        .kinerja-sidebar.collapsed .kinerja-nav-item::after{
          content:attr(data-label); position:absolute;
          left:calc(100% + 14px); top:50%;
          transform:translateY(-50%) translateX(-6px);
          background:linear-gradient(135deg,#EF9F27,#FAC775); color:#020F1C;
          font-size:12px; font-weight:800; letter-spacing:.2px;
          padding:6px 12px; border-radius:8px; white-space:nowrap;
          box-shadow:0 6px 20px rgba(239,159,39,.35),0 2px 6px rgba(0,0,0,.4);
          opacity:0; pointer-events:none;
          transition:opacity .18s ease, transform .18s ease; z-index:300;
        }
        .kinerja-sidebar.collapsed .kinerja-nav-item::before{
          content:''; position:absolute;
          left:calc(100% + 8px); top:50%;
          transform:translateY(-50%) translateX(-6px);
          width:0;height:0;
          border-top:6px solid transparent; border-bottom:6px solid transparent;
          border-right:7px solid #EF9F27;
          opacity:0; pointer-events:none;
          transition:opacity .18s ease, transform .18s ease; z-index:301;
        }
        .kinerja-sidebar.collapsed .kinerja-nav-item:hover::after,
        .kinerja-sidebar.collapsed .kinerja-nav-item:hover::before{
          opacity:1; transform:translateY(-50%) translateX(0);
        }
        /* Light tooltip — ungu-pink */
        [data-theme="light"] .kinerja-sidebar.collapsed .kinerja-nav-item::after{
          background:linear-gradient(135deg,#8B5CF6,#EC4899)!important; color:#FFFFFF!important;
          box-shadow:0 6px 20px rgba(139,92,246,.35),0 2px 6px rgba(0,0,0,.15)!important;
        }
        [data-theme="light"] .kinerja-sidebar.collapsed .kinerja-nav-item::before{
          border-right-color:#8B5CF6!important;
        }
        /* Footer hide when collapsed */
        .kinerja-sidebar.collapsed > div:last-child{font-size:0!important;padding:6px 0!important;text-align:center!important;}
        .kinerja-sidebar.collapsed > div:last-child::after{content:'·'; font-size:14px; color:#85B7EB;}
        /* Tahun selector compact when collapsed — biarkan text "YYYY" tetap muncul */
        .kinerja-sidebar.collapsed .kinerja-tahun-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;background-image:none!important;}
        /* Sidebar di lg breakpoint pakai flex flow (position:static via Tailwind),
           main auto-fill sisa lebar — TIDAK perlu margin-left tambahan. */
      `}</style>

      <div style={{ display:'flex', minHeight:'100vh', backgroundColor: isLight ? '#ECEEF3' : '#020F1C', backgroundImage: isLight ? 'linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)' : 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize:'48px 48px', color: isLight ? '#0F0F12' : '#E6F1FB' }}>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:190 }} />
        )}

        <Sidebar
          role={role}
          isLight={isLight}
          tahun={tahun}
          activeTab={activeTab}
          activeSumber={activeSumber}
          realisasiSumber={realisasiSumber}
          sidebarOpen={sidebarOpen}
          sidebarHidden={sidebarHidden}
          rkoOpen={rkoOpen}
          realOpen={realOpen}
          onTahunChange={handleTahunChange}
          onNav={nav}
          onSetSidebarOpen={setSidebarOpen}
          onToggleSidebar={toggleSidebar}
          onSetRkoOpen={setRkoOpen}
          onSetRealOpen={setRealOpen}
        />

        <main className={`kinerja-main-wrap${sidebarHidden?' full':''}`} style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          <Topbar
            username={username}
            role={role}
            isLight={isLight}
            themePreference={themePreference}
            activeTab={activeTab}
            activeSumber={activeSumber}
            realisasiSumber={realisasiSumber}
            loggingOut={loggingOut}
            onSetSidebarOpen={setSidebarOpen}
            onSetCurrentTheme={setCurrentTheme}
            onGuardPending={guardPending}
            onLogout={handleLogout}
          />
          <section style={{ flex:1, overflowY:'auto' }}>
            {/* P5 — di DALAM area isi yang menggulung, bukan di atas shell: bilah tab di
                atasnya `position: sticky`, dan spanduk di luar section akan menggeser
                seluruh kolom tanpa ikut tergulung. */}
            {beku.beku && <div style={{ padding: '16px 20px 0' }}><SpandukBeku {...beku}/></div>}
            {activeTab === 'dashboard'  && (
            <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
              <DashboardTab tahun={tahun} isLight={isLight} />
            </Suspense>
          )}
            {activeTab === 'master'     && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <MasterTab
                  tahun={tahun}
                  canEdit={canEdit}
                  masterOpts={masterOpts}
                  showConfirm={showConfirm}
                  onPendingChange={handleMasterPendingChange}
                  onMasterOptsRefresh={fetchMasterOpts}
                  isLight={isLight}
                />
              </Suspense>
            )}
            {activeTab === 'rekening'   && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <RekeningTab
                  rekeningRows={rekeningRows}
                  setRekeningRows={setRekeningRows}
                  activeSumber={activeSumber}
                  setActiveSumber={setActiveSumber}
                  masterOpts={masterOpts}
                  tahun={tahun}
                  canEdit={canEdit}
                  loadingData={loadingData}
                  saving={saving}
                  setSaving={setSaving}
                  onMasterOptsRefresh={fetchMasterOpts}
                  isLight={isLight}
                />
              </Suspense>
            )}
            {activeTab === 'ssk'        && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <SskTab
                  sskRows={sskRows}
                  setSskRows={setSskRows}
                  activeSumber={activeSumber}
                  setActiveSumber={gantiSumberRko}
                  rekeningRows={rekeningRows}
                  tahun={tahun}
                  canEdit={canEdit}
                  loadingData={loadingData}
                  saving={saving}
                  setSaving={setSaving}
                  isLight={isLight}
                  sskVersi={sskVersi}
                  setSskVersi={setSskVersi}
                  pilihVersi={pilihVersi}
                  sskVersion={sskVersion}
                  setSskVersion={setSskVersion}
                  refetchSsk={() => fetchSsk(activeSumber)}
                  sskBerubah={sskBerubah}
                  sskDasar={sskDasar}
                  setSskDasar={setSskDasar}
                  ambilSsk={ambilSsk}
                />
              </Suspense>
            )}
            {activeTab === 'realisasi'  && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <RealisasiTab
                  realisasiSumber={realisasiSumber}
                  setRealisasiSumber={gantiSumberRealisasi}
                  realisasiBulan={realisasiBulan}
                  setRealisasiBulan={setRealisasiBulan}
                  realisasiRows={realisasiRows}
                  setRealisasiRows={setRealisasiRows}
                  sskRows={sskRows}
                  tahun={tahun}
                  canEdit={canEdit}
                  loadingData={loadingData}
                  saving={saving}
                  setSaving={setSaving}
                  isLight={isLight}
                  sskVersi={sskVersi}
                  pilihVersi={pilihVersi}
                  realVersion={realVersion}
                  setRealVersion={setRealVersion}
                  refetchReal={() => fetchRealisasi(realisasiSumber)}
                  realDasar={realDasar}
                  setRealDasar={setRealDasar}
                  bandingReal={bandingReal}
                  realTertutup={realTertutup}
                  setRealTertutup={setRealTertutup}
                  ambilRealisasi={ambilRealisasi}
                  autoOpenImport={autoImportReal}
                  onImportConsumed={consumeImportReal}
                />
              </Suspense>
            )}
            {activeTab === 'cetak'      && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <CetakTab
                  realisasiRows={realisasiRows}
                  realisasiAllRows={realisasiAllRows}
                  realisasiAllItems={realisasiAllItems}
                  realisasiSumber={realisasiSumber}
                  setRealisasiSumber={setRealisasiSumber}
                  tahun={tahun}
                  loadingData={loadingData}
                  onFetchAll={muatRekap}
                  isLight={isLight}
                  sskVersi={sskVersi}
                  sumberDinolkan={sumberDinolkan}
                  pilihanVersi={pilihanVersi}
                  onGantiPilihanVersi={gantiPilihanVersi}
                  versiRekap={versiRekap}
                />
              </Suspense>
            )}
            {activeTab === 'pend-crr'   && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <PendapatanCrrTab tahun={tahun} canEdit={canEdit} isLight={isLight} autoOpenImport={autoImportPend} onImportConsumed={consumeImportPend} />
              </Suspense>
            )}
            {activeTab === 'laporan'    && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <LaporanTab tahun={tahun} isLight={isLight} />
              </Suspense>
            )}
            {activeTab === 'pengaturan' && (
              <Suspense fallback={<div style={{ padding:'40px', textAlign:'center', color:'#85B7EB' }}>Memuat...</div>}>
                <PengaturanTab tahun={tahun} isLight={isLight} isSuperAdmin={bolehBatalkanFinal(role)} />
              </Suspense>
            )}
          </section>
        </main>
      </div>

      {/* ── Custom Confirm Modal ─────────────────────────────────────────────── */}
      {confirmModal && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {/* Backdrop */}
          <div onClick={confirmCancel}
            style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(4px)' }} />
          {/* Modal card */}
          <div style={{ position:'relative', background: isLight ? '#FFFFFF' : '#042C53', borderRadius:'18px', padding:'28px 30px 22px', maxWidth:'380px', width:'90%', boxShadow: isLight ? '0 24px 60px rgba(0,0,0,.18)' : '0 24px 60px rgba(0,0,0,.5)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #0C447C' }}>
            {/* Icon */}
            <div style={{ width:'48px', height:'48px', borderRadius:'12px', background: isLight ? 'rgba(139,92,246,.10)' : 'rgba(186,117,23,.15)', border: isLight ? '1px solid rgba(139,92,246,.3)' : '1px solid rgba(239,159,39,.3)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'16px' }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={isLight ? '#7C3AED' : '#EF9F27'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Pesan */}
            <div style={{ fontSize:'14px', fontWeight:600, color: isLight ? '#0F0F12' : '#E6F1FB', lineHeight:1.6, marginBottom:'22px', whiteSpace:'pre-line' }}>
              {confirmModal.msg}
            </div>
            {/* Tombol */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
              <button onClick={confirmCancel}
                style={{ padding:'9px 20px', borderRadius:'10px', border: isLight ? '1.5px solid rgba(139,92,246,.3)' : '1.5px solid #185FA5', background: isLight ? 'rgba(139,92,246,.04)' : 'transparent', fontSize:'13px', fontWeight:700, color: isLight ? '#5B21B6' : '#B5D4F4', cursor:'pointer' }}>
                Batal
              </button>
              <button onClick={confirmOk}
                style={{ padding:'9px 20px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#E24B4A,#C0392B)', fontSize:'13px', fontWeight:700, color:'white', cursor:'pointer' }}>
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
