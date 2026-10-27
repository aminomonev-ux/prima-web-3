'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, Download, Paperclip, ListChecks } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import DeleteButton from '@/components/ui/DeleteButton';
import EditButton from '@/components/ui/EditButton';
import RealisasiButton from '@/components/ui/RealisasiButton';
import Tip from '@/components/ui/Tip';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { InputNominal } from '@/components/ui/input-nominal';
import { fetchJson } from '@/lib/shared/api';
import { perluReferensi, buktiBelumLengkap } from '@/lib/bba/referensi';
import { BBA_STATUSES, LABEL_STATUS, pilihanStatusRealisasi, statusSebelumTerima, alasanTakBisaHapus, type BbaStatus } from '@/lib/bba/status';
import { bolehBatalkanFinal } from '@/lib/constants';
import type { BbaRow, BbaListResult, BbaKpi, BbaImportCandidate } from '@/lib/data/buku-besar-aset';
import SpandukBeku from '@/components/ui/SpandukBeku';
import SpandukLihat from '@/components/ui/SpandukLihat';
import type { InfoBeku } from '@/lib/security/beku';
import ModalItem, { LencanaRef, LencanaBukti, STATUS_COLOR, type TabItem } from './_components/ModalItem';
import PerBarang from './_components/PerBarang';
import ModalTautkan from './_components/ModalTautkan';
import SaranTahunLalu from './_components/SaranTahunLalu';
import { JENIS_RENCANA, LABEL_JENIS, ANGGARAN, LABEL_ANGGARAN, bolehDitandai, type Anggaran } from '@/lib/bba/rencana';
import BbaNav, { navDockBba, type PetaIzinLayar } from './_components/BbaNav';

const SUMBER = ['BLUD', 'APBD', 'DAK', 'LAINNYA'] as const;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; initialTahun: number; initialResult: BbaListResult; initialKpi: BbaKpi; kategori: string[];
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku;
  /** Izin lima bagian (lib/bba/peran.ts) — hanya menyembunyikan tombol; pagarnya di route. */
  izin: PetaIzinLayar };

type ImportGroup   = { count: number; total: number; items: BbaImportCandidate[] };
type ImportPreview = { tahun: number; disetujui: ImportGroup; ditolak: ImportGroup };
/** Modal item (§4.4): `daftar` null = Tambah item, tanpa daftar kiri. */
type BukaModal = { daftar: BbaRow[] | null; id: number | null; tab: TabItem; saringan: 'BELUM' | 'SEMUA' };

const DITOLAK_LABEL: Record<string, string> = { ADMIN: 'Ditolak Admin', KASUBAG: 'Ditolak Kasubag', KABAG: 'Ditolak Kabag' };

export default function BukuBesarAsetClient({ username, role, themePreference, initialTahun, initialResult, initialKpi, kategori, beku, izin }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const searchRef = useRef<HTMLInputElement>(null);
  const c = {
    canvas: isLight ? '#F5F5F7' : '#020F1C', card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB', sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C', rowOdd: isLight ? '#F3F4F6' : 'rgba(4,44,83,.6)',
    input: isLight ? '#FFFFFF' : 'rgba(2,15,28,.6)',
  };

  const [rows, setRows] = useState<BbaRow[]>(initialResult.rows);
  const [total, setTotal] = useState(initialResult.total);
  // A1: KPI dari server (SUM SQL seluruh data ter-filter) — bukan dihitung dari page
  const [kpi, setKpi] = useState<BbaKpi>(initialKpi);
  const [loading, setLoading] = useState(false);
  const [tahun, setTahun] = useState(initialTahun);
  const [fStatus, setFStatus] = useState('');
  const [fSumber, setFSumber] = useState('');
  const [fOrigin, setFOrigin] = useState('');
  const [tab, setTab] = useState<'' | 'DISETUJUI' | 'DITOLAK'>('');
  const [q, setQ] = useState('');
  const [fKelengkapan, setFKelengkapan] = useState<'' | 'REF' | 'BUKTI'>('');
  const [fJenis, setFJenis] = useState('');
  const [fAnggaran, setFAnggaran] = useState('');
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [menandai, setMenandai] = useState(false);
  const [modal, setModal] = useState<BukaModal | null>(null);
  const [tampilan, setTampilan] = useState<'ITEM' | 'BARANG'>('ITEM');
  const [segarkanBarang, setSegarkanBarang] = useState(0);
  const [tautkanBuka, setTautkanBuka] = useState(false);
  // tgl = tanggal realisasi; tglProses = tanggal pesan/kontrak (status Dalam Proses, §5.2)
  const [realForm, setRealForm] = useState<{ row: BbaRow; nilai: number; vol: number; tgl: string; tglProses: string; status: BbaStatus } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | 'EMPTY' | null>(null);
  const [detailRow, setDetailRow] = useState<BbaRow | null>(null);
  const [saving, setSaving] = useState(false);
  // Rencana: tambah/ubah/hapus item, referensi, tarik usulan, tautkan barang. Pengadaan: Proses &
  // Realisasi. Bukti dukung dipegang keduanya. Pendataan eksisting milik Buku Aset (Umum Aset).
  const bolehRencana = izin.rencana === 'EDIT';
  const bolehPengadaan = izin.pengadaan === 'EDIT';
  const bolehBukti = bolehRencana || bolehPengadaan;

  // Jawaban muatan bisa tiba tidak berurutan (ganti tahun saat muatan lama belum pulang) —
  // hanya muatan TERAKHIR yang boleh mengisi tabel, kalau tidak tabel menampilkan tahun lain.
  const nomorMuat = useRef(0);
  const kunciSaringan = `${tahun}|${fStatus}|${fSumber}|${fOrigin}|${tab}|${fJenis}|${fAnggaran}`;
  const kunciTermuat = useRef(kunciSaringan);
  const load = useCallback(async () => {
    const nomor = ++nomorMuat.current;
    kunciTermuat.current = `${tahun}|${fStatus}|${fSumber}|${fOrigin}|${tab}|${fJenis}|${fAnggaran}`;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tahun: String(tahun), page: '1', limit: '200' });
      if (fStatus) params.set('status', fStatus);
      if (fSumber) params.set('sumber', fSumber);
      if (fOrigin) params.set('origin', fOrigin);
      if (tab)     params.set('keputusan', tab);
      if (fJenis)  params.set('jenis', fJenis);
      if (fAnggaran) params.set('anggaran', fAnggaran);
      if (q.trim()) params.set('q', q.trim());
      const d = await fetchJson<unknown>(`/api/buku-besar-aset?${params}`);
      if (nomor !== nomorMuat.current) return;
      if (d.ok) {
        const r = d as unknown as BbaListResult & { kpi?: BbaKpi };
        setRows(r.rows); setTotal(r.total); setPilih(new Set());
        if (r.kpi) setKpi(r.kpi);
      } else toast.error(d.message || 'Gagal memuat');
    } finally { if (nomor === nomorMuat.current) setLoading(false); }
  }, [tahun, fStatus, fSumber, fOrigin, tab, fJenis, fAnggaran, q]);

  /** §7.4: tanda anggaran borongan. Angka kunci dari baris yang dimuat — basi = 409, daftar dimuat ulang (L77). */
  async function tandai(anggaran: Anggaran) {
    const item = rows.filter(r => pilih.has(r.id)).map(r => ({ id: r.id, expected_version: r.version }));
    if (item.length === 0) return;
    setMenandai(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/anggaran', { method: 'POST', body: JSON.stringify({ anggaran, item }) }) as unknown as { ok: boolean; code?: string; message?: string; ditandai?: number; alasan?: string[] };
      if (!d.ok) {
        toast.error(d.alasan?.length ? `${d.message}` : d.message || 'Gagal menandai');
        if (d.code === 'VERSION_CONFLICT') void load();
        return;
      }
      toast.success(d.ditandai ? `${d.ditandai} rencana ditandai ${LABEL_ANGGARAN[anggaran].toLowerCase()}` : 'Tidak ada yang berubah');
      muatUlang();
    } finally { setMenandai(false); }
  }

  /** Sesudah ada yang tertulis: tabel item DAN tampilan Per Barang ikut segar. */
  const muatUlang = () => { void load(); setSegarkanBarang(n => n + 1); };

  // Auto-refresh saat ganti tahun/status/sumber (debounce supaya ketik tahun tak spam).
  // Patokannya saringan yang terakhir DIMUAT, bukan "sudah mount" — efek ganda strict mode
  // dulu menembak muatan tahun awal yang bisa pulang belakangan. Tahun setengah diketik
  // (mis. "208") tidak dimuat. Pencarian teks (q) tetap manual.
  useEffect(() => {
    if (kunciTermuat.current === kunciSaringan || tahun < 2020 || tahun > 2100) return;
    const t = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciSaringan]);

  // Saringan kelengkapan bekerja atas baris yang SUDAH dimuat (≤ 200) — aturannya fungsi
  // murni `lib/bba/referensi.ts`, bukan kueri kedua yang bisa berbeda pendapat.
  const rowsTampil = fKelengkapan === 'REF' ? rows.filter(perluReferensi)
    : fKelengkapan === 'BUKTI' ? rows.filter(r => buktiBelumLengkap(r.bukti))
    : rows;
  const perluRef = rows.filter(perluReferensi);

  const bukaItem = (r: BbaRow, tab: TabItem) => setModal({ daftar: rowsTampil, id: r.id, tab, saringan: 'SEMUA' });
  const bukaBaru = () => setModal({ daftar: null, id: null, tab: 'data', saringan: 'SEMUA' });
  const bukaLengkapi = () => perluRef.length > 0 && setModal({ daftar: perluRef, id: perluRef[0].id, tab: 'ref', saringan: 'BELUM' });

  async function saveRealisasi() {
    if (!realForm) return;
    if (realForm.vol < 0 || realForm.vol > realForm.row.vol) { toast.error(`Unit realisasi harus 0 – ${realForm.row.vol}`); return; }
    // A3: pre-check konsistensi status ↔ angka (server juga menolak)
    if (realForm.status === 'REALISASI_PENUH' && realForm.vol !== realForm.row.vol) { toast.error(`Status Realisasi Penuh mengharuskan unit realisasi = ${realForm.row.vol}`); return; }
    if (realForm.status === 'TIDAK_TEREALISASI' && (realForm.vol !== 0 || realForm.nilai !== 0)) { toast.error('Status Tidak Terealisasi mengharuskan unit & nilai realisasi 0'); return; }
    const sebelumTerima = statusSebelumTerima(realForm.status);
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/realisasi', {
        method: 'PATCH',
        body: JSON.stringify({
          id: realForm.row.id, expected_version: realForm.row.version,
          nilai_realisasi: sebelumTerima ? 0 : realForm.nilai, vol_realisasi: sebelumTerima ? 0 : realForm.vol,
          tgl_realisasi: sebelumTerima ? null : realForm.tgl || null,
          tgl_proses: realForm.status === 'DIPROSES' ? realForm.tglProses || null : null,
          status: realForm.status,
        }),
      });
      if (d.ok) { toast.success(realForm.status === 'DIPROSES' ? 'Tersimpan — item dalam proses' : 'Realisasi tersimpan'); setRealForm(null); muatUlang(); }
      else if ((d as { code?: string }).code === 'VERSION_CONFLICT') { toast.error('Data sudah diubah pengguna lain — memuat ulang.'); setRealForm(null); muatUlang(); }
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  // Status disarankan dari unit + nilai (CONCEPT-import-usulan §6) — tetap bisa override manual.
  function suggestStatus(vol: number, nilai: number, row: BbaRow): BbaStatus {
    if (vol === 0) return 'TIDAK_TEREALISASI';
    if (vol === row.vol && nilai >= row.nilai_rencana) return 'REALISASI_PENUH';
    return 'REALISASI_SEBAGIAN';
  }

  async function openImportPreview() {
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/import-usulan', { method: 'POST', body: JSON.stringify({ mode: 'preview', tahun }) });
      if (!d.ok) { toast.error(d.message || 'Gagal memuat preview'); return; }
      const p = d as unknown as ImportPreview;
      setImportPreview(p.disetujui.count + p.ditolak.count === 0 ? 'EMPTY' : p);
    } finally { setSaving(false); }
  }

  async function commitImport() {
    if (!importPreview || importPreview === 'EMPTY') return;
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/import-usulan', { method: 'POST', body: JSON.stringify({ mode: 'commit', tahun }) });
      if (d.ok) {
        const h = d as unknown as { inserted: number; tertaut?: number };
        toast.success(`${h.inserted} item ditarik dari Usulan Kebutuhan${h.tertaut ? ` · ${h.tertaut} langsung tertaut ke barang` : ''}`);
        setImportPreview(null); muatUlang();
      } else toast.error(d.message || 'Gagal menarik data');
    } finally { setSaving(false); }
  }

  async function del(row: BbaRow) {
    const ikut = row.ref.n > 0 ? ' Referensi harganya ikut terhapus — item ini belum diproses, jadi belum jadi catatan pembelian.' : '';
    if (!(await confirmDialog({ title: 'Hapus Item', message: `Hapus "${row.uraian}" (${row.canonical_id})?${ikut}`, confirmLabel: 'Hapus' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${row.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Dihapus'); muatUlang(); } else toast.error(d.message || 'Gagal hapus');
  }

  const bukaRealisasi = (r: BbaRow) => setRealForm({
    row: r, nilai: r.nilai_realisasi, vol: r.vol_realisasi, tgl: r.tgl_realisasi || '', tglProses: r.tgl_proses || '',
    status: statusSebelumTerima(r.status) ? 'REALISASI_PENUH' : r.status,
  });
  // Item tahun ini (yang dimuat) tanpa barang — usulan ditolak tidak dihitung, seperti KPI & Per Barang.
  const belumBarang = rows.filter(r => r.barang_id === null && r.usulan_keputusan !== 'DITOLAK').length;

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
  const num: React.CSSProperties = { ...inp, fontFamily: MONO, textAlign: 'right' };
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: c.text, borderBottom: `1px solid ${c.border}` };
  const tdNum: React.CSSProperties = { ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div style={{ minHeight: '100vh', background: c.canvas, color: c.text }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', minHeight: 52, background: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ fontSize: 13, color: c.sub }}>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Buku Besar Aset</span>
          <span style={{ margin: '0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>Rencana {tahun}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <div style={{ padding: '24px 28px 100px' }}>
      <BbaNav aktif="rencana" peta={izin} c={c} />
      <SpandukBeku {...beku}/>
      {!bolehBukti && <SpandukLihat label="Rencana" />}
      {!bolehRencana && bolehPengadaan && (
        <div style={{ fontSize: 12.5, color: c.sub, margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, border: `1px solid ${c.border}` }}>
          Anda memegang bagian <b style={{ color: c.text }}>Pengadaan</b>: Proses &amp; Realisasi dan bukti dukung bisa diisi; data rencana dan referensi harga hanya bisa dilihat.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📦 Buku Besar Aset</h1>
          <div style={{ fontSize: 12.5, color: c.sub }}>Register belanja modal lintas-tahun · {total} item{rows.length < total ? ` (menampilkan ${rows.length} — KPI tetap dihitung dari seluruh data)` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {bolehRencana && <PrimaButton variant="purple" data-rima="bba.tarik-usulan" onClick={openImportPreview} disabled={saving}><Download size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Tarik dari Usulan Kebutuhan</PrimaButton>}
          {bolehRencana && <PrimaButton variant="warning" onClick={bukaLengkapi} disabled={perluRef.length === 0}
            data-tooltip={perluRef.length === 0 ? 'Semua item yang dimuat sudah punya 3 referensi harga sah' : 'Buka item yang referensi harganya belum lengkap satu per satu'}>
            <ListChecks size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Lengkapi referensi ({perluRef.length})
          </PrimaButton>}
          {bolehRencana && <PrimaButton variant="purple" data-rima="bba.tambah-item" onClick={bukaBaru}>+ Tambah Item</PrimaButton>}
        </div>
      </div>

      {/* KPI */}
      <div data-rima="bba.kpi-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Total Rencana', v: fmtRp(kpi.rencana), col: c.text },
          { l: 'Total Realisasi', v: fmtRp(kpi.realisasi), col: '#1D9E75' },
          { l: '% Terakomodir', v: kpi.pct + '%', col: '#EF9F27' },
          { l: 'Belum Terealisasi (item)', v: String(kpi.backlog), col: '#BA7517' },
          { l: 'Unit Terealisasi', v: `${kpi.volReal} / ${kpi.volRencana}`, col: '#7C5CFC' },
        ].map(k => (
          <div key={k.l} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: c.sub, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: MONO, color: k.col }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tab keputusan usulan (Semua | Disetujui | Ditolak) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div data-rima="bba.tab-keputusan" style={{ display: 'flex', gap: 6 }}>
          {([['', 'Semua'], ['DISETUJUI', 'Disetujui'], ['DITOLAK', 'Ditolak']] as const).map(([val, label]) => (
            <button key={label} onClick={() => setTab(val)}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${tab === val ? (val === 'DITOLAK' ? '#E24B4A' : val === 'DISETUJUI' ? '#1D9E75' : '#EF9F27') : c.border}`,
                background: tab === val ? (val === 'DITOLAK' ? 'rgba(226,75,74,.15)' : val === 'DISETUJUI' ? 'rgba(29,158,117,.15)' : 'rgba(239,159,39,.15)') : 'transparent',
                color: tab === val ? (val === 'DITOLAK' ? '#E24B4A' : val === 'DISETUJUI' ? '#1D9E75' : '#EF9F27') : c.sub }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {/* §5.3: Per Item | Per Barang */}
        <div style={{ display: 'inline-flex', border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden' }}>
          {([['ITEM', 'Per Item'], ['BARANG', 'Per Barang']] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setTampilan(val)}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tampilan === val ? 'rgba(239,159,39,.15)' : 'transparent', color: tampilan === val ? '#EF9F27' : c.sub }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <PrimaNumberField value={tahun} onChange={e => setTahun(Number(e.target.value))} style={{ width: 90 }} title="Tahun" />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inp}><option value="">Semua status</option>{BBA_STATUSES.map(s => <option key={s} value={s}>{LABEL_STATUS[s]}</option>)}</select>
        <select value={fSumber} onChange={e => setFSumber(e.target.value)} style={inp}><option value="">Semua sumber</option>{SUMBER.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fOrigin} onChange={e => setFOrigin(e.target.value)} style={inp}><option value="">Semua asal</option><option value="MANUAL">Manual</option><option value="USULAN">Dari Usulan</option></select>
        <select value={fJenis} onChange={e => setFJenis(e.target.value)} style={inp} aria-label="Jenis rencana"><option value="">Semua jenis</option>{JENIS_RENCANA.map(j => <option key={j} value={j}>{LABEL_JENIS[j]}</option>)}<option value="KOSONG">Belum digolongkan</option></select>
        <select value={fAnggaran} onChange={e => setFAnggaran(e.target.value)} style={inp} aria-label="Anggaran"><option value="">Semua anggaran</option>{ANGGARAN.map(a => <option key={a} value={a}>{LABEL_ANGGARAN[a]}</option>)}</select>
        <input data-rima="bba.filter-cari" ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="Cari uraian/kode/no. usulan…" style={{ ...inp, flex: 1, minWidth: 160 }} />
        <PrimaButton variant="primary" onClick={load} disabled={loading}>{loading ? 'Memuat…' : 'Terapkan'}</PrimaButton>
      </div>

      {tampilan === 'BARANG' ? (
        <PerBarang tahun={tahun} c={c} segarkan={segarkanBarang} onTautkan={bolehRencana ? () => setTautkanBuka(true) : undefined} />
      ) : (<>
      {/* §5.1: item tanpa barang → riwayat beli tidak bisa dijawab untuknya */}
      {belumBarang > 0 && bolehRencana && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(186,117,23,.45)', background: 'rgba(186,117,23,.08)', fontSize: 12.5 }}>
          <span style={{ color: '#BA7517', fontWeight: 600 }}>{belumBarang} item {tahun} belum ditautkan ke barang</span>
          <span style={{ color: c.sub, flex: 1, minWidth: 200 }}>— tanpa barang, riwayat beli dan yang sedang diproses tidak terlihat saat merencanakan.</span>
          <PrimaButton variant="warning" size="sm" onClick={() => setTautkanBuka(true)}>Tautkan</PrimaButton>
        </div>
      )}

      <SaranTahunLalu tahun={tahun} c={c} bolehUbah={bolehRencana} segarkan={segarkanBarang} onDisalin={muatUlang} />

      {bolehRencana && pilih.size > 0 && (
        <div style={{ position: 'sticky', top: 56, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', background: c.card, border: '1px solid #EF9F27', borderRadius: 10 }}>
          <b style={{ fontSize: 12.5 }}>{pilih.size} rencana dipilih</b>
          <span style={{ flex: 1 }} />
          <PrimaButton menulis variant="success" size="sm" disabled={menandai} onClick={() => void tandai('DIDANAI')}>Tandai didanai</PrimaButton>
          <PrimaButton menulis variant="danger" size="sm" disabled={menandai} onClick={() => void tandai('TIDAK_DIDANAI')}>Tidak didanai</PrimaButton>
          <PrimaButton menulis variant="ghost" size="sm" disabled={menandai} onClick={() => void tandai('BELUM')}>Belum ditandai</PrimaButton>
          <PrimaButton variant="ghost" size="sm" onClick={() => setPilih(new Set())}>Batal pilih</PrimaButton>
        </div>
      )}

      {/* Saringan kelengkapan (CONCEPT-bba-perencanaan §4.4) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {([['', 'Semua'], ['REF', 'Referensi belum lengkap'], ['BUKTI', 'Bukti belum lengkap']] as const).map(([val, label]) => (
          <button key={label} type="button" onClick={() => setFKelengkapan(val)}
            style={{ padding: '4px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${fKelengkapan === val ? '#EF9F27' : c.border}`, background: fKelengkapan === val ? 'rgba(239,159,39,.15)' : 'transparent', color: fKelengkapan === val ? '#EF9F27' : c.sub }}>
            {label}{val === 'REF' ? ` (${perluRef.length})` : val === 'BUKTI' ? ` (${rows.filter(r => buktiBelumLengkap(r.bukti)).length})` : ''}
          </button>
        ))}
        {fKelengkapan && rows.length < total && <span style={{ fontSize: 11, color: c.sub }}>dihitung dari {rows.length} item yang dimuat</span>}
      </div>

      {/* Tabel */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {bolehRencana && <th style={{ ...th, width: 1 }}>
              <input type="checkbox" aria-label="Pilih semua rencana yang tampil" checked={rowsTampil.length > 0 && rowsTampil.every(r => pilih.has(r.id))}
                onChange={e => setPilih(e.target.checked ? new Set(rowsTampil.filter(bolehDitandai).map(r => r.id)) : new Set())} />
            </th>}
            <th style={th}>Kode</th><th style={th}>Asal</th><th style={th}>Kode Rek</th><th style={th}>Uraian</th><th style={th}>Jenis</th><th style={th}>Anggaran</th><th style={th}>Sumber</th>
            <th style={{ ...th, textAlign: 'right' }}>Rencana</th><th style={{ ...th, textAlign: 'right' }}>Realisasi</th>
            <th style={{ ...th, textAlign: 'right' }}>Sisa</th><th style={{ ...th, textAlign: 'center' }}>Unit Real.</th>
            <th style={th}>Status</th><th style={{ ...th, textAlign: 'center' }}>Ref</th><th style={{ ...th, textAlign: 'center' }}>Bukti</th>
            <th style={th}>PJ</th><th style={{ ...th, textAlign: 'center' }}>Aksi</th>
          </tr></thead>
          <tbody>
            {rowsTampil.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={bolehRencana ? 17 : 16}>{rows.length === 0 ? 'Tidak ada data.' : 'Tidak ada item yang cocok dengan saringan ini.'}</td></tr>}
            {rowsTampil.map((r, i) => {
              const isRejected = r.usulan_keputusan === 'DITOLAK';
              return (
              <tr key={r.id} onClick={() => bukaItem(r, 'data')} style={{ background: pilih.has(r.id) ? 'rgba(239,159,39,.08)' : i % 2 ? c.rowOdd : 'transparent', opacity: isRejected ? .75 : 1, cursor: 'pointer' }}>
                {bolehRencana && <td style={td} onClick={e => e.stopPropagation()}>
                  {!isRejected && <input type="checkbox" aria-label={`Pilih ${r.canonical_id}`} checked={pilih.has(r.id)}
                    onChange={e => setPilih(p => { const x = new Set(p); if (e.target.checked) x.add(r.id); else x.delete(r.id); return x; })} />}
                </td>}
                <td style={{ ...td, fontFamily: MONO, fontSize: 11 }}>{r.canonical_id}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                  {r.origin === 'USULAN'
                    ? <Tip label="Lihat detail usulan"><button onClick={() => setDetailRow(r)} style={{ background: 'rgba(124,92,252,.15)', border: '1px solid #7C5CFC', color: '#7C5CFC', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, cursor: 'pointer', fontFamily: MONO }}>{r.usulan_no}</button></Tip>
                    : <span style={{ border: `1px solid ${c.border}`, color: c.sub, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>Manual</span>}
                </td>
                <td style={{ ...td, fontFamily: MONO, fontSize: 11 }}>{r.kode_rekening || '—'}</td>
                <td style={td}>{r.uraian}{r.jumlah_sasaran > 0 && <span style={{ display: 'block', fontSize: 10.5, color: c.sub }}>{r.jumlah_sasaran} aset sasaran</span>}</td>
                <td style={{ ...td, fontSize: 11.5, whiteSpace: 'nowrap', color: r.jenis_rencana ? c.text : '#BA7517' }}>{r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : 'belum digolongkan'}</td>
                <td style={{ ...td, fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: 600, color: r.anggaran === 'DIDANAI' ? '#1D9E75' : r.anggaran === 'TIDAK_DIDANAI' ? '#E24B4A' : c.sub }}>
                  {isRejected ? '—' : LABEL_ANGGARAN[r.anggaran]}
                </td>
                <td style={td}>{r.sumber_anggaran}</td>
                <td style={tdNum}>{fmtRp(r.nilai_rencana)}</td>
                <td style={tdNum}>{fmtRp(r.nilai_realisasi)}</td>
                <td style={r.sisa < 0 ? { ...tdNum, color: '#E24B4A' } : tdNum}>{fmtRp(r.sisa)}</td>
                <td style={{ ...td, fontFamily: MONO, textAlign: 'center', whiteSpace: 'nowrap' }}>{isRejected ? '—' : `${r.vol_realisasi} / ${r.vol}`}</td>
                <td style={td}>
                  {isRejected
                    ? <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{DITOLAK_LABEL[r.ditolak_oleh ?? ''] ?? 'Ditolak'}</span>
                    : <span style={{ background: STATUS_COLOR[r.status], color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{r.status}</span>}
                </td>
                <td style={{ ...td, textAlign: 'center' }}><LencanaRef row={r} /></td>
                <td style={{ ...td, textAlign: 'center' }}><LencanaBukti bukti={r.bukti} /></td>
                <td style={{ ...td, fontSize: 11 }}>{r.penanggung_jawab || '—'}</td>
                <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Tip label={bolehRencana ? 'Edit' : 'Lihat'}><EditButton onClick={() => bukaItem(r, 'data')} /></Tip>
                    <Tip label={r.jumlah_bukti ? `Bukti dukung (${r.jumlah_bukti})` : 'Bukti dukung'}>
                      <button type="button" aria-label="Bukti dukung" onClick={() => bukaItem(r, 'bukti')}
                        style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', border: `1px solid ${c.border}`, background: 'transparent', color: r.jumlah_bukti ? '#1D9E75' : c.sub, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Paperclip size={13} />
                        {r.jumlah_bukti > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#1D9E75', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 10, padding: '0 4px', fontFamily: MONO }}>{r.jumlah_bukti}</span>}
                      </button>
                    </Tip>
                    {!isRejected && bolehPengadaan && <span data-rima="bba.row-realisasi"><Tip label="Proses & realisasi"><RealisasiButton onClick={() => bukaRealisasi(r)} /></Tip></span>}
                    {bolehRencana && (() => {
                      const alasan = alasanTakBisaHapus(r.status, r.jumlah_bukti);
                      return alasan
                        ? <Tip label={alasan}><span style={{ display: 'inline-flex', opacity: .35 }}><DeleteButton disabled iconSize={12} /></span></Tip>
                        : <Tip label="Hapus"><DeleteButton onClick={() => del(r)} iconSize={12} /></Tip>;
                    })()}
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      </>)}

      {/* Modal item — Data item / Referensi harga / Bukti dukung (CONCEPT-bba-perencanaan §4.4) */}
      {modal && (
        <ModalItem c={c} daftar={modal.daftar} awalId={modal.id} tabAwal={modal.tab} saringanAwal={modal.saringan}
          tahun={tahun} kategori={kategori} bolehUbah={bolehRencana} bolehBukti={bolehBukti} onTutup={() => setModal(null)} onTersimpan={muatUlang} />
      )}

      {tautkanBuka && <ModalTautkan tahun={tahun} c={c} onTutup={() => setTautkanBuka(false)} onSelesai={() => { setTautkanBuka(false); muatUlang(); }} />}

      {/* Modal Proses & Realisasi — satu-satunya pintu ubah status (§5.2) */}
      {realForm && (() => {
        const sebelumTerima = statusSebelumTerima(realForm.status);
        return (
        <Modal title={`Proses & Realisasi — ${realForm.row.canonical_id}`} c={c} onClose={() => setRealForm(null)}>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 10 }}>{realForm.row.uraian} · Rencana <b style={{ fontFamily: MONO }}>{fmtRp(realForm.row.nilai_rencana)}</b> · Vol <b style={{ fontFamily: MONO }}>{realForm.row.vol} {realForm.row.satuan || ''}</b></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Status" full><select value={realForm.status} onChange={e => setRealForm({ ...realForm, status: e.target.value as BbaStatus })} style={inp}>
              {pilihanStatusRealisasi(realForm.row.status, bolehBatalkanFinal(role)).map(s => <option key={s} value={s}>{LABEL_STATUS[s]}{s === realForm.row.status ? ' (sekarang)' : ''}</option>)}
            </select></Field>
            {sebelumTerima ? <>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: c.sub }}>
                {realForm.status === 'DIPROSES'
                  ? 'Sudah dipesan/dikontrak, barang belum diterima. Unit & nilai realisasi tetap 0 sampai barangnya datang.'
                  : 'Kembali direncanakan (pesanan batal). Unit & nilai realisasi 0, tanggal proses dikosongkan.'}
              </div>
              {realForm.status === 'DIPROSES' && <Field label="Tanggal proses (pesan/kontrak)"><input type="date" value={realForm.tglProses} onChange={e => setRealForm({ ...realForm, tglProses: e.target.value })} style={inp} /></Field>}
            </> : <>
              <Field label="Nilai Realisasi"><InputNominal value={realForm.nilai} onChange={v => setRealForm({ ...realForm, nilai: v, status: suggestStatus(realForm.vol, v, realForm.row) })} style={num} /></Field>
              <Field label={`Unit Realisasi (0 – ${realForm.row.vol})`}><PrimaNumberField value={realForm.vol} onChange={e => { const v = Number(e.target.value); setRealForm({ ...realForm, vol: v, status: suggestStatus(v, realForm.nilai, realForm.row) }); }} /></Field>
              <Field label="Tgl Realisasi"><input type="date" value={realForm.tgl} onChange={e => setRealForm({ ...realForm, tgl: e.target.value })} style={inp} /></Field>
              {realForm.row.tgl_proses && <Field label="Diproses sejak"><input type="text" readOnly value={realForm.row.tgl_proses} style={{ ...inp, opacity: .7, fontFamily: MONO }} /></Field>}
            </>}
          </div>
          {/* §4.2: realisasi tanpa bukti = peringatan, tidak memblokir */}
          {!sebelumTerima && realForm.status !== 'TIDAK_TEREALISASI' && realForm.row.jumlah_bukti === 0 && (
            <div style={{ fontSize: 12, color: '#BA7517', marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Item ini belum punya bukti dukung (bukti beli, BAST, foto).</span>
              <button type="button" onClick={() => { const r = realForm.row; setRealForm(null); bukaItem(r, 'bukti'); }}
                style={{ background: 'none', border: 'none', padding: 0, color: '#7C5CFC', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                Buka bukti dukung
              </button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setRealForm(null)}>Batal</PrimaButton>
            <PrimaButton variant="success" data-rima="bba.realisasi-simpan" onClick={saveRealisasi} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
          </div>
        </Modal>
        );
      })()}

      {/* Modal Tarik dari Usulan — kosong (notif bertema, bukan alert native — L58) */}
      {importPreview === 'EMPTY' && (
        <Modal title="Tarik dari Usulan Kebutuhan" c={c} onClose={() => setImportPreview(null)}>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
            Tidak ada usulan belanja modal final (Disetujui/Ditolak) untuk tahun <b style={{ color: c.text, fontFamily: MONO }}>{tahun}</b> yang belum ditarik.
            Pastikan tahun register sesuai, atau item usulan sudah mencapai putusan final.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setImportPreview(null)}>Tutup</PrimaButton>
          </div>
        </Modal>
      )}

      {/* Modal Tarik dari Usulan — preview Disetujui | Ditolak */}
      {importPreview && importPreview !== 'EMPTY' && (
        <Modal title={`Tarik dari Usulan Kebutuhan — ${tahun}`} c={c} onClose={() => setImportPreview(null)}>
          {([['DISETUJUI', importPreview.disetujui, '#1D9E75'], ['DITOLAK', importPreview.ditolak, '#E24B4A']] as const).map(([label, grp, col]) => grp.count > 0 && (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: col, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{label}</span>
                <span style={{ fontSize: 12, color: c.sub }}>{grp.count} item · <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(grp.total)}</b></span>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {grp.items.map(it => (
                      <tr key={it.usulan_item_id}>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 10.5, whiteSpace: 'nowrap' }}>{it.usulan_no}</td>
                        <td style={{ ...td, fontSize: 11.5 }}>{it.uraian}{it.ditolak_oleh ? <span style={{ color: '#E24B4A', fontSize: 10, marginLeft: 6 }}>({DITOLAK_LABEL[it.ditolak_oleh]})</span> : null}</td>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>{it.vol} {it.satuan}</td>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRp(it.nilai_rencana)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: c.sub, marginBottom: 12 }}>Item yang sudah pernah ditarik dilewati otomatis. Sumber anggaran default BLUD (bisa diedit setelah tarik).</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <PrimaButton variant="ghost" onClick={() => setImportPreview(null)}>Batal</PrimaButton>
            <PrimaButton variant="purple" data-rima="bba.tarik-cmt" onClick={commitImport} disabled={saving}>{saving ? 'Menarik…' : `Tarik ${importPreview.disetujui.count + importPreview.ditolak.count} Item`}</PrimaButton>
          </div>
        </Modal>
      )}

      {/* Modal Detail provenance baris asal-usulan */}
      {detailRow && (
        <Modal title={`Detail Usulan — ${detailRow.usulan_no ?? ''}`} c={c} onClose={() => setDetailRow(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: 12.5 }}>
            <span style={{ color: c.sub }}>No. Usulan</span><span style={{ fontFamily: MONO }}>{detailRow.usulan_no || '—'}</span>
            <span style={{ color: c.sub }}>Sub Bidang</span><span>{detailRow.sub_bidang || '—'}</span>
            <span style={{ color: c.sub }}>Pengusul</span><span>{detailRow.pengusul || '—'}</span>
            <span style={{ color: c.sub }}>Uraian</span><span>{detailRow.uraian}</span>
            <span style={{ color: c.sub }}>Vol × Harga</span><span style={{ fontFamily: MONO }}>{detailRow.vol} {detailRow.satuan || ''} × {fmtRp(detailRow.harga)}</span>
            <span style={{ color: c.sub }}>Nilai</span><span style={{ fontFamily: MONO }}>{fmtRp(detailRow.nilai_rencana)}</span>
            <span style={{ color: c.sub }}>Keputusan</span>
            <span>{detailRow.usulan_keputusan === 'DITOLAK'
              ? <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{DITOLAK_LABEL[detailRow.ditolak_oleh ?? ''] ?? 'Ditolak'}</span>
              : <span style={{ background: '#1D9E75', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>Disetujui</span>}</span>
            {detailRow.usulan_keputusan === 'DITOLAK' && (<>
              <span style={{ color: c.sub }}>Catatan Penolakan</span><span>{detailRow.catatan_penolakan || '—'}</span>
            </>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setDetailRow(null)}>Tutup</PrimaButton>
          </div>
        </Modal>
      )}
      </div>

      <FloatingDock isLight={isLight} limelight
        nav={navDockBba(izin, 'rencana', href => router.push(href))}
        actions={[
          ...(bolehRencana ? [{ icon: <Plus size={17} />, label: 'Tambah', onClick: bukaBaru }] : []),
          { icon: <Search size={17} />, label: 'Filter', onClick: () => searchRef.current?.focus() },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: muatUlang },
        ]}
      />
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
    <span style={{ fontSize: 11, opacity: .8 }}>{label}</span>{children}
  </label>;
}

function Modal({ title, children, c, onClose }: { title: string; children: React.ReactNode; c: { card: string; text: string; border: string }; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, width: 'min(620px,96vw)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.text, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
