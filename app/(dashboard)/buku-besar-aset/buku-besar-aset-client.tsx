'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Package, Layers, LayoutGrid, Plus, Search, RefreshCw, Download } from 'lucide-react';
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
import SatuanCombobox from '@/components/shared/SatuanCombobox';
import { fetchJson } from '@/lib/shared/api';
import type { BbaRow, BbaListResult, BbaImportCandidate } from '@/lib/data/buku-besar-aset';
import type { BbaStatus } from '@/lib/data/buku-besar-aset-schemas';

const STATUSES: BbaStatus[] = ['DIRENCANAKAN', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI'];
const SUMBER = ['BLUD', 'APBD', 'DAK', 'LAINNYA'] as const;
const STATUS_COLOR: Record<BbaStatus, string> = {
  DIRENCANAKAN: '#7C5CFC', REALISASI_PENUH: '#1D9E75', REALISASI_SEBAGIAN: '#BA7517',
  TIDAK_TEREALISASI: '#E24B4A',
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; initialTahun: number; initialResult: BbaListResult; kategori: string[] };

type FormState = {
  id?: number; expected_version?: number;
  tahun_anggaran: number; uraian: string; kode_rekening: string; kategori_aset: string;
  sumber_anggaran: string; vol: number; satuan: string; harga: number;
  penanggung_jawab: string; keterangan: string; status?: BbaStatus;
  origin?: BbaRow['origin']; usulan_keputusan?: BbaRow['usulan_keputusan']; nilai_rencana?: number;
};

type ImportGroup   = { count: number; total: number; items: BbaImportCandidate[] };
type ImportPreview = { tahun: number; disetujui: ImportGroup; ditolak: ImportGroup };

const DITOLAK_LABEL: Record<string, string> = { ADMIN: 'Ditolak Admin', KASUBAG: 'Ditolak Kasubag', KABAG: 'Ditolak Kabag' };

const emptyForm = (tahun: number): FormState => ({
  tahun_anggaran: tahun, uraian: '', kode_rekening: '', kategori_aset: '', sumber_anggaran: 'BLUD',
  vol: 0, satuan: '', harga: 0, penanggung_jawab: '', keterangan: '',
});

export default function BukuBesarAsetClient({ username, role, themePreference, initialTahun, initialResult, kategori }: Props) {
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
  const [loading, setLoading] = useState(false);
  const [tahun, setTahun] = useState(initialTahun);
  const [fStatus, setFStatus] = useState('');
  const [fSumber, setFSumber] = useState('');
  const [fOrigin, setFOrigin] = useState('');
  const [tab, setTab] = useState<'' | 'DISETUJUI' | 'DITOLAK'>('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [realForm, setRealForm] = useState<{ row: BbaRow; nilai: number; vol: number; tgl: string; status: BbaStatus } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | 'EMPTY' | null>(null);
  const [detailRow, setDetailRow] = useState<BbaRow | null>(null);
  const [saving, setSaving] = useState(false);
  const canImport = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tahun: String(tahun), page: '1', limit: '200' });
      if (fStatus) params.set('status', fStatus);
      if (fSumber) params.set('sumber', fSumber);
      if (fOrigin) params.set('origin', fOrigin);
      if (tab)     params.set('keputusan', tab);
      if (q.trim()) params.set('q', q.trim());
      const d = await fetchJson<unknown>(`/api/buku-besar-aset?${params}`);
      if (d.ok) {
        const r = d as unknown as BbaListResult;
        setRows(r.rows); setTotal(r.total);
      } else toast.error(d.message || 'Gagal memuat');
    } finally { setLoading(false); }
  }, [tahun, fStatus, fSumber, fOrigin, tab, q]);

  // Auto-refresh saat ganti tahun/status/sumber (debounce supaya ketik tahun tak spam).
  // Skip mount awal (initialResult sudah dimuat server). Pencarian teks (q) tetap manual.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const t = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun, fStatus, fSumber, fOrigin, tab]);

  const kpi = useMemo(() => {
    // Baris usulan DITOLAK = catatan sejarah, dikecualikan dari KPI rencana/realisasi/backlog.
    const active = rows.filter(r => r.usulan_keputusan !== 'DITOLAK');
    const rencana = active.reduce((s, r) => s + r.nilai_rencana, 0);
    const realisasi = active.reduce((s, r) => s + r.nilai_realisasi, 0);
    const backlog = active.filter(r => r.status === 'DIRENCANAKAN' || r.status === 'TIDAK_TEREALISASI').length;
    const volRencana = active.reduce((s, r) => s + r.vol, 0);
    const volReal    = active.reduce((s, r) => s + r.vol_realisasi, 0);
    return { rencana, realisasi, pct: rencana > 0 ? Math.round((realisasi / rencana) * 1000) / 10 : 0, backlog, volRencana, volReal };
  }, [rows]);

  async function saveForm() {
    if (!form) return;
    if (!form.uraian.trim()) { toast.error('Uraian wajib diisi'); return; }
    setSaving(true);
    try {
      const isEdit = !!form.id;
      const isUsulan = form.origin === 'USULAN';
      // Baris asal-usulan: uraian/vol/harga terkunci server-side → tidak dikirim.
      const body = isEdit
        ? { id: form.id, expected_version: form.expected_version ?? 0, kode_rekening: form.kode_rekening || null, kategori_aset: form.kategori_aset || null, sumber_anggaran: form.sumber_anggaran, satuan: form.satuan || null, penanggung_jawab: form.penanggung_jawab || null, keterangan: form.keterangan || null, ...(isUsulan ? {} : { uraian: form.uraian, vol: form.vol, harga: form.harga, status: form.status }) }
        : { tahun_anggaran: form.tahun_anggaran, uraian: form.uraian, kode_rekening: form.kode_rekening || null, kategori_aset: form.kategori_aset || null, sumber_anggaran: form.sumber_anggaran, vol: form.vol, satuan: form.satuan || null, harga: form.harga, penanggung_jawab: form.penanggung_jawab || null, keterangan: form.keterangan || null };
      const d = await fetchJson<unknown>('/api/buku-besar-aset', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (d.ok) { toast.success(isEdit ? 'Tersimpan' : 'Item ditambahkan'); setForm(null); load(); }
      else if ((d as { code?: string }).code === 'VERSION_CONFLICT') { toast.error('Data sudah diubah pengguna lain — memuat ulang.'); setForm(null); load(); }
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  async function saveRealisasi() {
    if (!realForm) return;
    if (realForm.vol < 0 || realForm.vol > realForm.row.vol) { toast.error(`Unit realisasi harus 0 – ${realForm.row.vol}`); return; }
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/realisasi', {
        method: 'PATCH',
        body: JSON.stringify({ id: realForm.row.id, expected_version: realForm.row.version, nilai_realisasi: realForm.nilai, vol_realisasi: realForm.vol, tgl_realisasi: realForm.tgl || null, status: realForm.status }),
      });
      if (d.ok) { toast.success('Realisasi tersimpan'); setRealForm(null); load(); }
      else if ((d as { code?: string }).code === 'VERSION_CONFLICT') { toast.error('Data sudah diubah pengguna lain — memuat ulang.'); setRealForm(null); load(); }
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
        toast.success(`${(d as unknown as { inserted: number }).inserted} item ditarik dari Usulan Kebutuhan`);
        setImportPreview(null); load();
      } else toast.error(d.message || 'Gagal menarik data');
    } finally { setSaving(false); }
  }

  async function del(row: BbaRow) {
    if (!(await confirmDialog({ title: 'Hapus Item', message: `Hapus "${row.uraian}" (${row.canonical_id})?`, confirmLabel: 'Hapus' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${row.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Dihapus'); load(); } else toast.error(d.message || 'Gagal hapus');
  }

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
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>Register {tahun}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <div style={{ padding: '24px 28px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📦 Buku Besar Aset</h1>
          <div style={{ fontSize: 12.5, color: c.sub }}>Register belanja modal lintas-tahun · {total} item</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canImport && <PrimaButton variant="purple" data-rima="bba.tarik-usulan" onClick={openImportPreview} disabled={saving}><Download size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Tarik dari Usulan Kebutuhan</PrimaButton>}
          <PrimaButton variant="purple" data-rima="bba.tambah-item" onClick={() => setForm(emptyForm(tahun))}>+ Tambah Item</PrimaButton>
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
      <div data-rima="bba.tab-keputusan" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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

      {/* Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <PrimaNumberField value={tahun} onChange={e => setTahun(Number(e.target.value))} style={{ width: 90 }} title="Tahun" />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inp}><option value="">Semua status</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fSumber} onChange={e => setFSumber(e.target.value)} style={inp}><option value="">Semua sumber</option>{SUMBER.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fOrigin} onChange={e => setFOrigin(e.target.value)} style={inp}><option value="">Semua asal</option><option value="MANUAL">Manual</option><option value="USULAN">Dari Usulan</option></select>
        <input data-rima="bba.filter-cari" ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="Cari uraian/kode/no. usulan…" style={{ ...inp, flex: 1, minWidth: 160 }} />
        <PrimaButton variant="primary" onClick={load} disabled={loading}>{loading ? 'Memuat…' : 'Terapkan'}</PrimaButton>
      </div>

      {/* Tabel */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Kode</th><th style={th}>Asal</th><th style={th}>Kode Rek</th><th style={th}>Uraian</th><th style={th}>Sumber</th>
            <th style={{ ...th, textAlign: 'right' }}>Rencana</th><th style={{ ...th, textAlign: 'right' }}>Realisasi</th>
            <th style={{ ...th, textAlign: 'right' }}>Sisa</th><th style={{ ...th, textAlign: 'center' }}>Unit Real.</th>
            <th style={th}>Status</th><th style={th}>PJ</th><th style={{ ...th, textAlign: 'center' }}>Aksi</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={12}>Tidak ada data.</td></tr>}
            {rows.map((r, i) => {
              const isRejected = r.usulan_keputusan === 'DITOLAK';
              return (
              <tr key={r.id} style={{ background: i % 2 ? c.rowOdd : 'transparent', opacity: isRejected ? .75 : 1 }}>
                <td style={{ ...td, fontFamily: MONO, fontSize: 11 }}>{r.canonical_id}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.origin === 'USULAN'
                    ? <Tip label="Lihat detail usulan"><button onClick={() => setDetailRow(r)} style={{ background: 'rgba(124,92,252,.15)', border: '1px solid #7C5CFC', color: '#7C5CFC', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, cursor: 'pointer', fontFamily: MONO }}>{r.usulan_no}</button></Tip>
                    : <span style={{ border: `1px solid ${c.border}`, color: c.sub, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>Manual</span>}
                </td>
                <td style={{ ...td, fontFamily: MONO, fontSize: 11 }}>{r.kode_rekening || '—'}</td>
                <td style={td}>{r.uraian}</td>
                <td style={td}>{r.sumber_anggaran}</td>
                <td style={tdNum}>{fmtRp(r.nilai_rencana)}</td>
                <td style={tdNum}>{fmtRp(r.nilai_realisasi)}</td>
                <td style={tdNum}>{fmtRp(r.sisa)}</td>
                <td style={{ ...td, fontFamily: MONO, textAlign: 'center', whiteSpace: 'nowrap' }}>{isRejected ? '—' : `${r.vol_realisasi} / ${r.vol}`}</td>
                <td style={td}>
                  {isRejected
                    ? <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{DITOLAK_LABEL[r.ditolak_oleh ?? ''] ?? 'Ditolak'}</span>
                    : <span style={{ background: STATUS_COLOR[r.status], color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{r.status}</span>}
                </td>
                <td style={{ ...td, fontSize: 11 }}>{r.penanggung_jawab || '—'}</td>
                <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Tip label="Edit"><EditButton onClick={() => setForm({ id: r.id, expected_version: r.version, tahun_anggaran: r.tahun_anggaran, uraian: r.uraian, kode_rekening: r.kode_rekening || '', kategori_aset: r.kategori_aset || '', sumber_anggaran: r.sumber_anggaran, vol: r.vol, satuan: r.satuan || '', harga: r.harga, penanggung_jawab: r.penanggung_jawab || '', keterangan: r.keterangan || '', status: r.status, origin: r.origin, usulan_keputusan: r.usulan_keputusan, nilai_rencana: r.nilai_rencana })} /></Tip>
                    {!isRejected && <span data-rima="bba.row-realisasi"><Tip label="Set realisasi"><RealisasiButton onClick={() => setRealForm({ row: r, nilai: r.nilai_realisasi, vol: r.vol_realisasi, tgl: r.tgl_realisasi || '', status: r.status === 'DIRENCANAKAN' ? 'REALISASI_PENUH' : r.status })} /></Tip></span>}
                    <Tip label="Hapus"><DeleteButton onClick={() => del(r)} iconSize={12} /></Tip>
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      {/* Modal Entry */}
      {form && (
        <Modal title={form.id ? 'Edit Item' : 'Tambah Item'} c={c} onClose={() => setForm(null)}>
          {form.origin === 'USULAN' && (
            <div style={{ fontSize: 12, color: '#7C5CFC', background: 'rgba(124,92,252,.12)', border: '1px solid rgba(124,92,252,.4)', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
              Baris asal Usulan Kebutuhan — uraian, vol, dan harga terkunci (sumber kebenaran: usulan).
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Tahun"><PrimaNumberField value={form.tahun_anggaran} disabled={!!form.id} onChange={e => setForm({ ...form, tahun_anggaran: Number(e.target.value) })} /></Field>
            <Field label="Sumber"><select value={form.sumber_anggaran} onChange={e => setForm({ ...form, sumber_anggaran: e.target.value })} style={inp}>{SUMBER.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Uraian *" full><input value={form.uraian} readOnly={form.origin === 'USULAN'} onChange={e => setForm({ ...form, uraian: e.target.value })} style={form.origin === 'USULAN' ? { ...inp, opacity: .7, cursor: 'not-allowed' } : inp} /></Field>
            <Field label="Kode Rekening"><input value={form.kode_rekening} onChange={e => setForm({ ...form, kode_rekening: e.target.value })} style={{ ...inp, fontFamily: MONO }} /></Field>
            <Field label="Kategori Aset"><SatuanCombobox value={form.kategori_aset} onChange={v => setForm({ ...form, kategori_aset: v })} options={kategori} style={inp} placeholder="Pilih / ketik kategori…" /></Field>
            <Field label="Vol"><PrimaNumberField value={form.vol} disabled={form.origin === 'USULAN'} onChange={e => setForm({ ...form, vol: Number(e.target.value) })} /></Field>
            <Field label="Satuan"><SatuanCombobox value={form.satuan} onChange={v => setForm({ ...form, satuan: v })} style={inp} placeholder="Pilih / ketik satuan…" /></Field>
            <Field label="Harga">{form.origin === 'USULAN'
              ? <input type="text" readOnly value={fmtRp(form.harga)} style={{ ...num, opacity: .7, cursor: 'not-allowed' }} />
              : <InputNominal value={form.harga} onChange={v => setForm({ ...form, harga: v })} style={num} />}</Field>
            <Field label={form.origin === 'USULAN' ? 'Nilai Rencana (dari putusan usulan)' : 'Nilai Rencana (vol × harga)'}><input type="text" readOnly value={fmtRp(form.origin === 'USULAN' ? (form.nilai_rencana ?? 0) : form.vol * form.harga)} style={{ ...num, opacity: .7, cursor: 'not-allowed' }} /></Field>
            <Field label="Penanggung Jawab" full><input value={form.penanggung_jawab} onChange={e => setForm({ ...form, penanggung_jawab: e.target.value })} style={inp} /></Field>
            {form.id && form.origin !== 'USULAN' && <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as BbaStatus })} style={inp}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>}
            <Field label="Keterangan" full><textarea value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} style={{ ...inp, minHeight: 54 }} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setForm(null)}>Batal</PrimaButton>
            <PrimaButton variant="primary" onClick={saveForm} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
          </div>
        </Modal>
      )}

      {/* Modal Realisasi */}
      {realForm && (
        <Modal title={`Realisasi — ${realForm.row.canonical_id}`} c={c} onClose={() => setRealForm(null)}>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 10 }}>{realForm.row.uraian} · Rencana <b style={{ fontFamily: MONO }}>{fmtRp(realForm.row.nilai_rencana)}</b> · Vol <b style={{ fontFamily: MONO }}>{realForm.row.vol} {realForm.row.satuan || ''}</b></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Nilai Realisasi"><InputNominal value={realForm.nilai} onChange={v => setRealForm({ ...realForm, nilai: v, status: suggestStatus(realForm.vol, v, realForm.row) })} style={num} /></Field>
            <Field label={`Unit Realisasi (0 – ${realForm.row.vol})`}><PrimaNumberField value={realForm.vol} onChange={e => { const v = Number(e.target.value); setRealForm({ ...realForm, vol: v, status: suggestStatus(v, realForm.nilai, realForm.row) }); }} /></Field>
            <Field label="Tgl Realisasi"><input type="date" value={realForm.tgl} onChange={e => setRealForm({ ...realForm, tgl: e.target.value })} style={inp} /></Field>
            <Field label="Status"><select value={realForm.status} onChange={e => setRealForm({ ...realForm, status: e.target.value as BbaStatus })} style={inp}>
              {(['REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI'] as BbaStatus[]).map(s => <option key={s}>{s}</option>)}
            </select></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setRealForm(null)}>Batal</PrimaButton>
            <PrimaButton variant="success" data-rima="bba.realisasi-simpan" onClick={saveRealisasi} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Realisasi'}</PrimaButton>
          </div>
        </Modal>
      )}

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
        nav={[
          { icon: <Package size={17} />, label: 'Aset', onClick: () => {}, current: true },
          { icon: <Layers size={17} />, label: 'Master', onClick: () => { window.location.href = '/buku-besar-aset/master'; } },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => { window.location.href = '/menu'; } },
        ]}
        actions={[
          { icon: <Plus size={17} />, label: 'Tambah', onClick: () => setForm(emptyForm(tahun)) },
          { icon: <Search size={17} />, label: 'Filter', onClick: () => searchRef.current?.focus() },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => load() },
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
