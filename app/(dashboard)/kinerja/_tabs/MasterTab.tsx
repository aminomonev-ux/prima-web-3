'use client';
// ─── PRIMA E-Anggaran — Master Rekening Tab ────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderMasterPanel + 6 handler CRUD.
// State hierarki kompleks: masterTipe (program/kegiatan/subkegiatan/uraian_ssk/sumber)
// + 3 ref state (programRef/kegiatanRef/subkegiatanRef untuk dropdown filter).
//
// masterRows + semua state master FULL ke MasterTab (tidak shared dengan tab lain).
// Shell di-notify via `onPendingChange` untuk beforeunload guard.
// Shell di-notify via `onMasterOptsRefresh` saat save/delete supaya tab lain
// (Rekening/SSK) refresh dropdown options.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { useAbortableEffect } from '@/lib/shared/hooks';
import { Pencil, Plus, Save, Download, AlertTriangle, X } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import PrimaButton from '@/components/ui/PrimaButton';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import type { MasterTipe, MasterRow, MasterOpts } from '../_types';
import { MASTER_TIPE_LIST } from '../_utils';
import { uiTheme } from '@/lib/theme';

interface Props {
  tahun: string;
  canEdit: boolean;
  masterOpts: MasterOpts;
  showConfirm: (msg: string, action: () => void) => void;
  onPendingChange: (hasPending: boolean) => void;
  onMasterOptsRefresh: () => void;
  isLight?: boolean;
}

interface InitRenaksiResp {
  ok: boolean;
  raTotal: number;
  programInserted: number;
  programSkipped: number;
  kegiatanInserted: number;
  kegiatanSkipped: number;
  subkegiatanInserted: number;
  subkegiatanSkipped: number;
  message?: string;
}

export default function MasterTab({
  tahun, canEdit, masterOpts, showConfirm, onPendingChange, onMasterOptsRefresh,
  isLight = false,
}: Props) {
  // Token surface per tema
  // Surface & teks dari token terpusat (lib/theme); aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceForm = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cInputBg     = t.input;
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cRowNew      = isLight ? 'rgba(186,117,23,.10)' : 'rgba(186,117,23,.1)';
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)';
  const cTabActiveBg = isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#1855bb,#0C447C)';
  const cTabActiveBor= isLight ? '#8B5CF6' : '#0C447C';
  const cTabInactiveBg = t.card;
  const cTabInactiveBor= isLight ? 'rgba(139,92,246,.25)' : 'rgba(12,68,124,.5)';
  const cTabInactiveTxt= isLight ? '#5B21B6' : '#B5D4F4';
  // ─── State lokal panel ───────────────────────────────────────────────────
  const [masterTipe,           setMasterTipe]           = useState<MasterTipe>('program');
  const [masterRows,           setMasterRows]           = useState<MasterRow[]>([]);
  const [masterInput,          setMasterInput]          = useState('');
  const [masterEditId,         setMasterEditId]         = useState<number|null>(null);
  const [masterProgramRef,     setMasterProgramRef]     = useState('');
  const [masterKegiatanRef,    setMasterKegiatanRef]    = useState('');
  const [masterSubkegiatanRef, setMasterSubkegiatanRef] = useState('');
  const [loading,              setLoading]              = useState(false);
  const [saving,               setSaving]               = useState(false);

  const [initOpen,     setInitOpen]     = useState(false);
  const [initLoading,  setInitLoading]  = useState(false);
  const [initPreview,  setInitPreview]  = useState<InitRenaksiResp | null>(null);

  // ─── Fetch master rows ───────────────────────────────────────────────────
  // O8: useAbortableEffect cegah stale data saat user ganti masterTipe cepat
  // (response lama datang setelah response baru → state overwrite).
  // fetchMaster (callback) untuk manual refetch setelah save/delete.
  const fetchMaster = useCallback(async (tipe: MasterTipe) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ tahun, tipe });
      const d = await fetchJson<unknown>(`/api/kinerja/master?${q}`);
      if (d.ok) setMasterRows((d as unknown as { rows: MasterRow[] }).rows);
      else toast.error(d.message || 'Gagal memuat master');
    } finally { setLoading(false); }
  }, [tahun]);

  useAbortableEffect(async (signal) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ tahun, tipe: masterTipe });
      const d = await fetchJson<unknown>(`/api/kinerja/master?${q}`, { signal });
      if (signal.aborted) return;
      if (d.ok) setMasterRows((d as unknown as { rows: MasterRow[] }).rows);
      else toast.error(d.message || 'Gagal memuat master');
    } finally { if (!signal.aborted) setLoading(false); }
  }, [masterTipe, tahun]);

  // ─── Notify shell saat pending changes berubah ───────────────────────────
  useEffect(() => {
    onPendingChange(masterRows.some(r => r.id === 0));
  }, [masterRows, onPendingChange]);

  // ─── Helper guard pending sebelum switch tab ─────────────────────────────
  function guardPendingLocal(action: () => void) {
    if (masterRows.some(r => r.id === 0)) {
      showConfirm('Ada data baru di Master Rekening yang belum disimpan.\nAbaikan dan lanjutkan?', action);
    } else action();
  }

  // ─── CRUD Handlers ───────────────────────────────────────────────────────
  async function saveMaster() {
    if (!masterInput.trim() || masterEditId === null) return;
    setSaving(true);
    try {
      const d = await fetchJson(`/api/kinerja/master/${masterEditId}`, {
        method: 'PUT',
        body: JSON.stringify({ nama: masterInput.trim() }),
      });
      if (d.ok) {
        toast.success('Berhasil diperbarui');
        setMasterInput(''); setMasterEditId(null);
        fetchMaster(masterTipe);
        onMasterOptsRefresh();
      } else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  function addMasterLocal() {
    const nama = masterInput.trim();
    if (!nama) return;
    if (masterTipe === 'kegiatan' && !masterProgramRef)       { toast.error('Pilih Program terlebih dahulu'); return; }
    if (masterTipe === 'subkegiatan' && !masterProgramRef)    { toast.error('Pilih Program terlebih dahulu'); return; }
    if (masterTipe === 'subkegiatan' && !masterKegiatanRef)   { toast.error('Pilih Kegiatan terlebih dahulu'); return; }
    if (masterTipe === 'uraian_ssk' && !masterProgramRef)     { toast.error('Pilih Program terlebih dahulu'); return; }
    if (masterTipe === 'uraian_ssk' && !masterKegiatanRef)    { toast.error('Pilih Kegiatan terlebih dahulu'); return; }
    if (masterTipe === 'uraian_ssk' && !masterSubkegiatanRef) { toast.error('Pilih Sub Kegiatan terlebih dahulu'); return; }
    const pRef  = ['kegiatan','subkegiatan','uraian_ssk'].includes(masterTipe) ? masterProgramRef     : null;
    const kRef  = ['subkegiatan','uraian_ssk'].includes(masterTipe)            ? masterKegiatanRef    : null;
    const sRef  = masterTipe === 'uraian_ssk'                                  ? masterSubkegiatanRef : null;
    if (masterRows.some(r => r.nama.toLowerCase() === nama.toLowerCase() && r.program_ref === pRef && r.kegiatan_ref === kRef)) {
      toast.error('Data sudah ada di daftar'); return;
    }
    setMasterRows(p => [...p, {
      id: 0, nama, tipe: masterTipe, sumber: null,
      program_ref: pRef, kegiatan_ref: kRef, subkegiatan_ref: sRef,
      urut: p.length + 1,
    }]);
    setMasterInput('');
  }

  async function saveAllMaster() {
    const newRows = masterRows.filter(r => r.id === 0);
    if (newRows.length === 0) { toast.error('Tidak ada data baru untuk disimpan'); return; }
    setSaving(true);
    try {
      await Promise.all(newRows.map(row =>
        fetch('/api/kinerja/master', {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({
            tahun, tipe: masterTipe, nama: row.nama,
            sumber: null,
            program_ref:     row.program_ref     ?? null,
            kegiatan_ref:    row.kegiatan_ref    ?? null,
            subkegiatan_ref: row.subkegiatan_ref ?? null,
          }),
        })
      ));
      toast.success(`${newRows.length} data berhasil disimpan`);
      fetchMaster(masterTipe);
      onMasterOptsRefresh();
    } catch { toast.error('Gagal menyimpan'); }
    finally { setSaving(false); }
  }

  async function deleteMaster(id: number) {
    showConfirm('Hapus item ini?', async () => {
      const pendingRows = masterRows.filter(r => r.id === 0);
      const del = await fetchJson(`/api/kinerja/master/${id}`, { method: 'DELETE' });
      if (!del.ok) { toast.error(del.message || 'Gagal menghapus'); return; }
      toast.success('Berhasil dihapus');
      const url = `/api/kinerja/master?tahun=${tahun}&tipe=${masterTipe}`;
      const d = await fetchJson<unknown>(url);
      if (d.ok) setMasterRows([...(d as unknown as { rows: MasterRow[] }).rows, ...pendingRows]);
      onMasterOptsRefresh();
    });
  }

  function editMaster(row: MasterRow) {
    setMasterInput(row.nama);
    setMasterEditId(row.id);
    if (['kegiatan','subkegiatan','uraian_ssk'].includes(row.tipe)) setMasterProgramRef(row.program_ref ?? '');
    if (['subkegiatan','uraian_ssk'].includes(row.tipe))            setMasterKegiatanRef(row.kegiatan_ref ?? '');
    if (row.tipe === 'uraian_ssk')                                  setMasterSubkegiatanRef(row.subkegiatan_ref ?? '');
  }

  async function deleteAllMaster() {
    const savedRows   = masterRows.filter(r => r.id !== 0);
    const pendingRows = masterRows.filter(r => r.id === 0);
    if (masterRows.length === 0) { toast.error('Tidak ada data untuk dihapus'); return; }
    if (savedRows.length === 0) {
      showConfirm(`Hapus ${pendingRows.length} data baru yang belum disimpan?`, () => {
        setMasterRows([]); setMasterInput(''); setMasterEditId(null);
      });
      return;
    }
    const msg = pendingRows.length > 0
      ? `Hapus ${savedRows.length} data tersimpan?\n(${pendingRows.length} data baru yang belum disimpan akan dipertahankan)`
      : `Hapus semua ${savedRows.length} data ${masterTipe}?\nTindakan ini tidak bisa dibatalkan.`;
    showConfirm(msg, async () => {
      setSaving(true);
      try {
        await Promise.all(savedRows.map(r => fetch(`/api/kinerja/master/${r.id}`, { method: 'DELETE' })));
        toast.success(`${savedRows.length} data berhasil dihapus`);
        setMasterRows(pendingRows);
        setMasterInput(''); setMasterEditId(null);
        onMasterOptsRefresh();
      } catch { toast.error('Gagal menghapus'); }
      finally { setSaving(false); }
    });
  }

  // ─── Init Renaksi ────────────────────────────────────────────────────────
  async function openInitRenaksi() {
    setInitOpen(true);
    setInitPreview(null);
    setInitLoading(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/master/init-renaksi', {
        method: 'POST',
        body: JSON.stringify({ tahun, dry: true }),
      });
      if (d.ok) setInitPreview(d as unknown as InitRenaksiResp);
      else { toast.error(d.message || 'Gagal memuat preview'); setInitOpen(false); }
    } finally { setInitLoading(false); }
  }

  async function confirmInitRenaksi() {
    if (!initPreview) return;
    setInitLoading(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/master/init-renaksi', {
        method: 'POST',
        body: JSON.stringify({ tahun, dry: false }),
      });
      if (d.ok) {
        const r = d as unknown as InitRenaksiResp;
        const totalIns = r.programInserted + r.kegiatanInserted + r.subkegiatanInserted;
        if (totalIns === 0) toast.info('Tidak ada data baru — semua sudah ada di Master.');
        else toast.success(`Init Renaksi selesai: +${r.programInserted} program, +${r.kegiatanInserted} kegiatan, +${r.subkegiatanInserted} sub kegiatan.`);
        setInitOpen(false);
        fetchMaster(masterTipe);
        onMasterOptsRefresh();
      } else toast.error(d.message || 'Gagal init renaksi');
    } finally { setInitLoading(false); }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const activeTipeInfo = MASTER_TIPE_LIST.find(t => t.tipe === masterTipe)!;

  return (
    <div style={{ padding:'20px' }}>
      {/* Tab tipe + Init Renaksi (Opsi A: tombol global di sub-nav) */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'6px', marginBottom:'16px' }}>
        {MASTER_TIPE_LIST.map(t => {
          const active = masterTipe === t.tipe;
          return (
            <button key={t.tipe}
              onClick={() => guardPendingLocal(() => { setMasterTipe(t.tipe); setMasterInput(''); setMasterEditId(null); setMasterProgramRef(''); setMasterKegiatanRef(''); setMasterSubkegiatanRef(''); })}
              style={{ padding:'6px 20px', borderRadius:'50px', border:`1.5px solid ${active ? cTabActiveBor : cTabInactiveBor}`, fontSize:'12px', fontWeight:700, cursor:'pointer', letterSpacing:'.05em', background: active ? cTabActiveBg : cTabInactiveBg, color: active ? 'white' : cTabInactiveTxt, transition:'all .18s', boxShadow: active && isLight ? '0 3px 10px rgba(139,92,246,.35)' : undefined }}>
              {t.label.toUpperCase()}
            </button>
          );
        })}
        {canEdit && (
          <div style={{ marginLeft:'auto' }}>
            <PrimaButton variant="purple" iconLeft={<Download size={14} />} onClick={openInitRenaksi} disabled={initLoading}>
              Init Renaksi
            </PrimaButton>
          </div>
        )}
      </div>

      {/* Form tambah/edit */}
      {canEdit && (
        <div style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'14px', padding:'18px 20px', marginBottom:'16px', boxShadow:cBoxShadow }}>
          <div style={{ fontSize:'12px', fontWeight:800, color:cTextSubAlt, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'8px', textAlign:'center' }}>
            {masterEditId ? `Edit ${activeTipeInfo.label}` : activeTipeInfo.label}
            {' '}<span style={{ color:'#E24B4A' }}>*</span>
          </div>

          {/* Dropdown Program */}
          {['kegiatan','subkegiatan','uraian_ssk'].includes(masterTipe) && (
            <div style={{ marginBottom:'10px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight: isLight ? 800 : 700, color: isLight ? '#B45309' : '#FAC775', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>
                Program Induk <span style={{ color:'#E24B4A' }}>*</span>
              </label>
              <select
                value={masterProgramRef}
                onChange={e => { setMasterProgramRef(e.target.value); setMasterKegiatanRef(''); setMasterSubkegiatanRef(''); }}
                style={{ width:'100%', border:`1.5px solid ${masterProgramRef ? '#EF9F27' : '#E24B4A'}`, borderRadius:'9px', padding:'8px 12px', fontSize:'13px', color:cTextPrimary, background:cInputBg, boxSizing:'border-box', cursor:'pointer', WebkitAppearance:'none', marginBottom:'4px' }}
              >
                <option value="">-- Pilih Program --</option>
                {masterOpts.program.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {!masterProgramRef && <div style={{ fontSize:'11px', color:'#FCA5A5', marginTop:'3px' }}>Wajib pilih program</div>}
            </div>
          )}

          {/* Dropdown Kegiatan */}
          {['subkegiatan','uraian_ssk'].includes(masterTipe) && (
            <div style={{ marginBottom:'10px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight: isLight ? 800 : 700, color: isLight ? '#0C4A6E' : '#7DD3FC', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>
                Kegiatan Induk <span style={{ color:'#E24B4A' }}>*</span>
              </label>
              <select
                value={masterKegiatanRef}
                onChange={e => { setMasterKegiatanRef(e.target.value); setMasterSubkegiatanRef(''); }}
                disabled={!masterProgramRef}
                style={{ width:'100%', border:`1.5px solid ${masterKegiatanRef ? '#7DD3FC' : (masterProgramRef ? '#E24B4A' : '#0C447C')}`, borderRadius:'9px', padding:'8px 12px', fontSize:'13px', color:cTextPrimary, background:cInputBg, boxSizing:'border-box', cursor: masterProgramRef ? 'pointer':'not-allowed', WebkitAppearance:'none', marginBottom:'4px', opacity: masterProgramRef ? 1 : 0.5 }}
              >
                <option value="">{masterProgramRef ? '-- Pilih Kegiatan --' : '-- Pilih Program dulu --'}</option>
                {masterOpts.kegiatanRows
                  .filter(r => r.program_ref === masterProgramRef || !r.program_ref)
                  .map(r => <option key={r.nama} value={r.nama}>{r.nama}</option>)}
              </select>
              {masterProgramRef && !masterKegiatanRef && <div style={{ fontSize:'11px', color:'#FCA5A5', marginTop:'3px' }}>Wajib pilih kegiatan</div>}
            </div>
          )}

          {/* Dropdown Sub Kegiatan */}
          {masterTipe === 'uraian_ssk' && (
            <div style={{ marginBottom:'10px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight: isLight ? 800 : 700, color: isLight ? '#14532D' : '#86EFAC', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>
                Sub Kegiatan Induk <span style={{ color:'#E24B4A' }}>*</span>
              </label>
              <select
                value={masterSubkegiatanRef}
                onChange={e => setMasterSubkegiatanRef(e.target.value)}
                disabled={!masterKegiatanRef}
                style={{ width:'100%', border:`1.5px solid ${masterSubkegiatanRef ? '#86EFAC' : (masterKegiatanRef ? '#E24B4A' : '#0C447C')}`, borderRadius:'9px', padding:'8px 12px', fontSize:'13px', color:cTextPrimary, background:cInputBg, boxSizing:'border-box', cursor: masterKegiatanRef ? 'pointer':'not-allowed', WebkitAppearance:'none', marginBottom:'4px', opacity: masterKegiatanRef ? 1 : 0.5 }}
              >
                <option value="">{masterKegiatanRef ? '-- Pilih Sub Kegiatan --' : '-- Pilih Kegiatan dulu --'}</option>
                {masterOpts.subkegiatanRows
                  .filter(r => {
                    if (r.kegiatan_ref && r.program_ref) return r.kegiatan_ref === masterKegiatanRef && r.program_ref === masterProgramRef;
                    if (r.kegiatan_ref) return r.kegiatan_ref === masterKegiatanRef;
                    return true;
                  })
                  .map(r => <option key={r.nama} value={r.nama}>{r.nama}</option>)}
              </select>
              {masterKegiatanRef && !masterSubkegiatanRef && <div style={{ fontSize:'11px', color:'#FCA5A5', marginTop:'3px' }}>Wajib pilih sub kegiatan</div>}
            </div>
          )}

          {/* Label per-tipe — hanya muncul saat ada parent dropdown di atasnya,
              biar tidak duplikat dengan judul form (program & sumber_anggaran). */}
          {['kegiatan','subkegiatan','uraian_ssk'].includes(masterTipe) && (() => {
            const labelColorMap: Record<string, { dark: string; light: string }> = {
              kegiatan:        { dark: '#7DD3FC', light: '#0C4A6E' }, // sky
              subkegiatan:     { dark: '#86EFAC', light: '#14532D' }, // green
              uraian_ssk:      { dark: '#C4B5FD', light: '#5B21B6' }, // violet
            }
            const tone = labelColorMap[masterTipe] ?? { dark: '#B5D4F4', light: '#374151' }
            return (
              <label style={{ display:'block', fontSize:'11px', fontWeight: isLight ? 800 : 700, color: isLight ? tone.light : tone.dark, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>
                {activeTipeInfo.label} <span style={{ color:'#E24B4A' }}>*</span>
              </label>
            )
          })()}
          <input
            value={masterInput}
            onChange={e => setMasterInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveMaster()}
            placeholder={`Isi ${activeTipeInfo.label.toLowerCase()}...`}
            style={{ width:'100%', border:`1.5px solid ${cBorder}`, borderRadius:'10px', padding:'10px 14px', fontSize:'14px', color:cTextPrimary, background:cInputBg, boxSizing:'border-box', outline:'none', marginBottom:'12px' }}
          />

          {/* Tombol bawah — PrimaButton (Concept 4 Sci-Fi Engraved) */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', flexWrap:'wrap' }}>
            {masterEditId && (
              <PrimaButton variant="ghost" onClick={() => { setMasterInput(''); setMasterEditId(null); }}>
                Batal
              </PrimaButton>
            )}
            {masterEditId ? (
              <PrimaButton variant="success" iconLeft={<Save size={14} />}
                onClick={saveMaster} disabled={saving || !masterInput.trim()}>
                Simpan Perubahan
              </PrimaButton>
            ) : (
              <>
                <PrimaButton variant="purple" iconLeft={<Plus size={14} />}
                  onClick={addMasterLocal} disabled={saving || !masterInput.trim()}>
                  Tambah
                </PrimaButton>
                {(() => {
                  const hasNew = masterRows.some(r => r.id === 0);
                  return (
                    <PrimaButton variant="success" iconLeft={<Save size={14} />}
                      onClick={saveAllMaster} disabled={saving || !hasNew}>
                      Simpan
                    </PrimaButton>
                  );
                })()}
                <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />}
                  onClick={deleteAllMaster} disabled={saving || masterRows.length === 0}>
                  Hapus Semua
                </PrimaButton>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabel */}
      <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflow:'hidden', boxShadow:cBoxShadow }}>
        {loading ? (
          <TableSkeleton rows={6} cols={masterTipe === 'uraian_ssk' ? 6 : masterTipe === 'subkegiatan' ? 5 : masterTipe === 'kegiatan' ? 4 : 3} />
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ background:cTableHeadBg }}>
                <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#5B21B6':'#E6F1FB', textAlign:'center', width:'60px' }}>No</th>
                {['kegiatan','subkegiatan','uraian_ssk'].includes(masterTipe) && (
                  <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#B45309':'#FAC775', textAlign:'left', minWidth:'160px' }}>Program</th>
                )}
                {['subkegiatan','uraian_ssk'].includes(masterTipe) && (
                  <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#0369A1':'#7DD3FC', textAlign:'left', minWidth:'160px' }}>Kegiatan</th>
                )}
                {masterTipe === 'uraian_ssk' && (
                  <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#047857':'#86EFAC', textAlign:'left', minWidth:'160px' }}>Sub Kegiatan</th>
                )}
                <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#5B21B6':'#E6F1FB', textAlign:'left' }}>{activeTipeInfo.label}</th>
                {canEdit && <th style={{ padding:'10px 14px', borderBottom:`2px solid ${cBorder}`, width:'110px', textAlign:'center', fontWeight:700, fontSize:'11px', color: isLight?'#5B21B6':'#E6F1FB', textTransform:'uppercase', letterSpacing:'.05em' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {masterRows.length === 0 && (
                <tr>
                  <td colSpan={
                    masterTipe === 'uraian_ssk'  ? (canEdit?6:5) :
                    masterTipe === 'subkegiatan' ? (canEdit?5:4) :
                    masterTipe === 'kegiatan'    ? (canEdit?4:3) : (canEdit?3:2)
                  } style={{ padding:'36px', textAlign:'center', color:cTextSub, fontSize:'13px' }}>
                    Belum ada data. {canEdit && 'Tambahkan di atas.'}
                  </td>
                </tr>
              )}
              {masterRows.map((r, i) => {
                const isNew = r.id === 0;
                const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
                  background: bg, border:`1px solid ${color}40`, borderRadius:'6px',
                  padding:'3px 8px', fontSize:'11px', fontWeight:700, color,
                });
                return (
                  <tr key={`${r.id}-${i}`} style={{ background: isNew ? cRowNew : i%2===0 ? cRowEven : cRowOdd }}>
                    <td style={{ padding:'10px 14px', borderBottom:cBorderHair, textAlign:'center', color:cTextSub, fontWeight:600 }}>{i+1}</td>
                    {['kegiatan','subkegiatan','uraian_ssk'].includes(masterTipe) && (
                      <td style={{ padding:'10px 14px', borderBottom:cBorderHair }}>
                        {r.program_ref ? <span style={badgeStyle(isLight?'#B45309':'#FAC775', isLight?'rgba(239,159,39,.12)':'rgba(239,159,39,.15)')}>{r.program_ref}</span> : <span style={{ color: isLight?'#9CA3AF':'#64748b', fontSize:'11px' }}>—</span>}
                      </td>
                    )}
                    {['subkegiatan','uraian_ssk'].includes(masterTipe) && (
                      <td style={{ padding:'10px 14px', borderBottom:cBorderHair }}>
                        {r.kegiatan_ref ? <span style={badgeStyle(isLight?'#0369A1':'#7DD3FC', isLight?'rgba(125,211,252,.18)':'rgba(125,211,252,.1)')}>{r.kegiatan_ref}</span> : <span style={{ color: isLight?'#9CA3AF':'#64748b', fontSize:'11px' }}>—</span>}
                      </td>
                    )}
                    {masterTipe === 'uraian_ssk' && (
                      <td style={{ padding:'10px 14px', borderBottom:cBorderHair }}>
                        {r.subkegiatan_ref ? <span style={badgeStyle(isLight?'#047857':'#86EFAC', isLight?'rgba(134,239,172,.18)':'rgba(134,239,172,.1)')}>{r.subkegiatan_ref}</span> : <span style={{ color: isLight?'#9CA3AF':'#64748b', fontSize:'11px' }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding:'10px 14px', borderBottom:cBorderHair, color:cTextPrimary, fontWeight:500, fontSize:'14px' }}>
                      {r.nama}
                      {isNew && <span style={{ marginLeft:'8px', fontSize:'10px', fontWeight:700, background: isLight?'#B45309':'rgba(239,159,39,.8)', color: isLight?'#FFFFFF':'#020F1C', padding:'2px 7px', borderRadius:'50px', verticalAlign:'middle' }}>BARU</span>}
                    </td>
                    {canEdit && (
                      <td style={{ padding:'8px 14px', borderBottom:cBorderHair, textAlign:'center' }}>
                        {!isNew && (
                          <button onClick={() => editMaster(r)}
                            style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', borderRadius:'7px', border:`1.5px solid ${isLight?'rgba(125,211,252,.4)':'#185FA5'}`, background: isLight?'rgba(125,211,252,.10)':'rgba(4,44,83,.5)', cursor:'pointer', fontSize:'12px', fontWeight:700, color: isLight?'#0369A1':'#7DD3FC', marginRight:'5px' }}>
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        <button onClick={() => isNew
                          ? setMasterRows(p => p.filter((_, idx) => idx !== i))
                          : deleteMaster(r.id)
                        }
                          style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', borderRadius:'7px', border:`1.5px solid ${isLight?'rgba(226,75,74,.4)':'rgba(226,75,74,.5)'}`, background:'rgba(226,75,74,.1)', cursor:'pointer', fontSize:'12px', fontWeight:700, color: isLight?'#B91C1C':'#FCA5A5' }}>
                          <DeleteIcon size={12} /> Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Init Renaksi Preview Modal ──────────────────────────────────── */}
      {initOpen && (
        <div
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !initLoading) setInitOpen(false); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
        >
          <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'14px', boxShadow:'0 24px 80px rgba(0,0,0,.45)', width:'100%', maxWidth:'480px', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${cBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:cTableHeadBg }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <Download size={18} style={{ color: isLight ? '#5B21B6' : '#B8A7FE' }} />
                <div style={{ fontSize:'14px', fontWeight:700, color: isLight ? '#0F0F12' : '#E6F1FB', letterSpacing:'.02em' }}>
                  Init Master dari Renaksi & Kinerja
                </div>
              </div>
              <button onClick={() => { if (!initLoading) setInitOpen(false); }}
                style={{ background:'transparent', border:'none', cursor: initLoading ? 'not-allowed' : 'pointer', color: cTextSub, padding:'4px', borderRadius:'6px', display:'inline-flex' }}
                aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding:'20px' }}>
              {initLoading && !initPreview && (
                <div style={{ textAlign:'center', padding:'24px', color:cTextSub, fontSize:'13px' }}>
                  Memuat preview…
                </div>
              )}
              {initPreview && initPreview.raTotal === 0 && (
                <div style={{ display:'flex', gap:'12px', padding:'14px', background: isLight ? 'rgba(186,117,23,.10)' : 'rgba(186,117,23,.15)', border:`1px solid ${isLight ? 'rgba(186,117,23,.35)' : 'rgba(251,191,36,.35)'}`, borderRadius:'10px' }}>
                  <AlertTriangle size={20} style={{ color: isLight ? '#B45309' : '#FBBF24', flexShrink:0, marginTop:'2px' }} />
                  <div style={{ fontSize:'13px', color:cTextPrimary, lineHeight:1.55 }}>
                    Tidak ada data Renaksi & Kinerja untuk tahun <strong>{tahun}</strong>. Pastikan Anda sudah input data di modul <em>Renaksi & Kinerja</em> untuk tahun tersebut sebelum init.
                  </div>
                </div>
              )}
              {initPreview && initPreview.raTotal > 0 && (
                <>
                  <div style={{ fontSize:'13px', color:cTextSubAlt, marginBottom:'14px', lineHeight:1.55 }}>
                    Mengimpor struktur Program / Kegiatan / Sub Kegiatan dari Renaksi tahun <strong style={{ color:cTextPrimary }}>{tahun}</strong> ke Master Rekening. Yang sudah ada akan dilewati (skip), <strong>tidak ditimpa</strong>. Kolom <em>Sumber</em> diset NULL — assign manual setelah init.
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'14px' }}>
                    {[
                      { label:'Program', ins:initPreview.programInserted, skip:initPreview.programSkipped, accent: isLight?'#B45309':'#FAC775' },
                      { label:'Kegiatan', ins:initPreview.kegiatanInserted, skip:initPreview.kegiatanSkipped, accent: isLight?'#0369A1':'#7DD3FC' },
                      { label:'Sub Kegiatan', ins:initPreview.subkegiatanInserted, skip:initPreview.subkegiatanSkipped, accent: isLight?'#047857':'#86EFAC' },
                    ].map(c => (
                      <div key={c.label} style={{ background: cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'10px', padding:'10px 12px' }}>
                        <div style={{ fontSize:'10px', fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:c.accent, marginBottom:'6px' }}>{c.label}</div>
                        <div style={{ fontSize:'18px', fontWeight:700, color:cTextPrimary, fontFamily:'JetBrains Mono, monospace' }}>+{c.ins}</div>
                        <div style={{ fontSize:'10px', color:cTextSub, marginTop:'2px' }}>skip {c.skip}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:'11px', color:cTextSub, fontStyle:'italic' }}>
                    Total baris Renaksi terbaca: {initPreview.raTotal}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding:'12px 20px', borderTop:`1px solid ${cBorder}`, display:'flex', justifyContent:'flex-end', gap:'8px', background: isLight ? '#FAFAFA' : 'rgba(2,15,28,.4)' }}>
              <PrimaButton variant="ghost" onClick={() => setInitOpen(false)} disabled={initLoading}>
                Batal
              </PrimaButton>
              <PrimaButton
                variant="success"
                iconLeft={<Download size={14} />}
                onClick={confirmInitRenaksi}
                disabled={initLoading || !initPreview || initPreview.raTotal === 0 || (initPreview.programInserted + initPreview.kegiatanInserted + initPreview.subkegiatanInserted) === 0}
              >
                {initLoading ? 'Memproses…' : 'Lanjutkan Init'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
