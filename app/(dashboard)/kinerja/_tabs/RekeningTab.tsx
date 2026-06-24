'use client';
// ─── PRIMA E-Anggaran — Rekening Tab ───────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderRekeningPanel (line 1235-1429).
// CRUD sederhana — form 4 dropdown hierarki (program/kegiatan/sub/uraian SSK)
// + input uraian + sumber. State lokal: rekForm + rekEditIdx.
//
// rekeningRows TIDAK di-lokalisasi karena di-share dengan SSK tab (Inject
// dari Rekening) — tetap di shell, di-pass via props.

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { Pencil, Plus, Save } from 'lucide-react';
import DeleteButton from '@/components/ui/DeleteButton';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import type { SumberSSK, RekeningRow, RekForm, MasterOpts } from '../_types';
import { SUMBER_LIST, emptyRekForm } from '../_utils';
import { exportRekeningExcel } from '../_exports';
import { uiTheme } from '@/lib/theme';

interface Props {
  rekeningRows: RekeningRow[];
  setRekeningRows: React.Dispatch<React.SetStateAction<RekeningRow[]>>;
  activeSumber: SumberSSK;
  setActiveSumber: (s: SumberSSK) => void;
  masterOpts: MasterOpts;
  tahun: string;
  canEdit: boolean;
  loadingData: boolean;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isLight?: boolean;
}

export default function RekeningTab({
  rekeningRows, setRekeningRows, activeSumber, setActiveSumber,
  masterOpts, tahun, canEdit, loadingData, saving, setSaving,
  isLight = false,
}: Props) {
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceForm = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cInputBorder = isLight ? 'rgba(139,92,246,.25)' : '#185FA5';
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)';
  const cTabActiveBg = isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#1855bb,#0C447C)';
  const cTabActiveBor= isLight ? '#8B5CF6' : '#0C447C';
  const cTabInactiveBg = t.card;
  const cTabInactiveBor= isLight ? 'rgba(139,92,246,.25)' : 'rgba(12,68,124,.5)';
  const cTabInactiveTxt= isLight ? '#5B21B6' : '#B5D4F4';

  const [rekForm,    setRekForm]    = useState<RekForm>(emptyRekForm());
  const [rekEditIdx, setRekEditIdx] = useState<number | null>(null);

  const selStyle: React.CSSProperties = {
    width:'100%', border:`1.5px solid ${cInputBorder}`, borderRadius:'9px',
    padding:'7px 12px', fontSize:'13px', color:cTextPrimary, background:cSurface,
    boxSizing:'border-box', cursor:'pointer', WebkitAppearance:'none',
  };
  const lblStyle: React.CSSProperties = {
    display:'block', fontSize:'11px', fontWeight:700, color:cTextSubAlt,
    textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px',
  };

  function addRekRow() {
    if (!rekForm.uraian.trim()) { toast.error('Uraian wajib diisi'); return; }
    if (rekEditIdx !== null) {
      setRekeningRows(p => p.map((r,i) => i === rekEditIdx ? { ...r, ...rekForm } : r));
      setRekEditIdx(null);
    } else {
      setRekeningRows(p => [...p, { id: 0, ...rekForm }]);
    }
    // Pertahankan pilihan program/kegiatan/subkegiatan/uraian_ssk agar tidak perlu pilih ulang
    setRekForm(p => ({ ...p, uraian: '', sumber_anggaran: '' }));
  }

  function editRekRow(idx: number) {
    const r = rekeningRows[idx];
    setRekForm({ uraian: r.uraian, uraian_ssk: r.uraian_ssk??'', sumber_anggaran: r.sumber_anggaran??'', program: r.program??'', kegiatan: r.kegiatan??'', subkegiatan: r.subkegiatan??'' });
    setRekEditIdx(idx);
  }

  function deleteRekRow(idx: number) {
    setRekeningRows(p => p.filter((_,i) => i !== idx));
  }

  async function saveRekening() {
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/rekening', {
        method: 'PUT',
        body: JSON.stringify({ tahun, sumber: activeSumber, rows: rekeningRows }),
      });
      if (d.ok) toast.success(`Tersimpan ${(d as unknown as { saved: number }).saved} rekening`);
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  const doExportRekeningExcel = () => exportRekeningExcel({ rows: rekeningRows, sumber: activeSumber, tahun });

  return (
    <div style={{ padding:'20px' }}>
      {/* Sumber tabs — style sama dengan Master */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
        {SUMBER_LIST.map(s => {
          const active = activeSumber === s;
          return (
            <button key={s}
              onClick={() => { setActiveSumber(s); setRekForm(emptyRekForm()); setRekEditIdx(null); }}
              style={{ padding:'6px 20px', borderRadius:'50px', border:`1.5px solid ${active ? cTabActiveBor : cTabInactiveBor}`, fontSize:'12px', fontWeight:700, cursor:'pointer', letterSpacing:'.05em', background: active ? cTabActiveBg : cTabInactiveBg, color: active ? 'white' : cTabInactiveTxt, transition:'all .18s', boxShadow: active && isLight ? '0 3px 10px rgba(139,92,246,.35)' : undefined }}>
              {s}
            </button>
          );
        })}
      </div>

      {/* Form card */}
      {canEdit && (
        <div style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'14px', padding:'18px 20px', marginBottom:'16px', boxShadow:cBoxShadow }}>

          {/* Row 1: Program | Kegiatan | Sub Kegiatan */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label style={lblStyle}>Program</label>
              <select value={rekForm.program} onChange={e => setRekForm(p => ({ ...p, program: e.target.value, kegiatan: '', subkegiatan: '', uraian_ssk: '' }))} style={selStyle}>
                <option value="">-- Pilih Program --</option>
                {masterOpts.program.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Kegiatan</label>
              <select
                value={rekForm.kegiatan}
                onChange={e => setRekForm(p => ({ ...p, kegiatan: e.target.value, subkegiatan: '', uraian_ssk: '' }))}
                disabled={!rekForm.program}
                style={{ ...selStyle, opacity: rekForm.program ? 1 : 0.5, cursor: rekForm.program ? 'pointer' : 'not-allowed' }}
              >
                <option value="">{rekForm.program ? '-- Pilih Kegiatan --' : '-- Pilih Program dulu --'}</option>
                {masterOpts.kegiatan
                  .filter(v => {
                    const found = masterOpts.kegiatanRows.find(r => r.nama === v);
                    if (found && found.program_ref) return found.program_ref === rekForm.program;
                    return true;
                  })
                  .map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Sub Kegiatan</label>
              <select
                value={rekForm.subkegiatan}
                onChange={e => setRekForm(p => ({ ...p, subkegiatan: e.target.value, uraian_ssk: '' }))}
                disabled={!rekForm.kegiatan}
                style={{ ...selStyle, opacity: rekForm.kegiatan ? 1 : 0.5, cursor: rekForm.kegiatan ? 'pointer' : 'not-allowed' }}
              >
                <option value="">{rekForm.kegiatan ? '-- Pilih Sub Kegiatan --' : '-- Pilih Kegiatan dulu --'}</option>
                {masterOpts.subkegiatanRows
                  .filter(r => {
                    if (r.kegiatan_ref && r.program_ref) return r.kegiatan_ref === rekForm.kegiatan && r.program_ref === rekForm.program;
                    if (r.kegiatan_ref) return r.kegiatan_ref === rekForm.kegiatan;
                    return true;
                  })
                  .map(r => <option key={r.nama} value={r.nama}>{r.nama}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Uraian SSK full width */}
          <div style={{ marginBottom:'12px' }}>
            <label style={lblStyle}>Uraian SSK</label>
            <select
              value={rekForm.uraian_ssk}
              onChange={e => setRekForm(p => ({ ...p, uraian_ssk: e.target.value }))}
              disabled={!rekForm.subkegiatan}
              style={{ ...selStyle, opacity: rekForm.subkegiatan ? 1 : 0.5, cursor: rekForm.subkegiatan ? 'pointer' : 'not-allowed' }}
            >
              <option value="">{rekForm.subkegiatan ? '-- Pilih Uraian SSK --' : '-- Pilih Sub Kegiatan dulu --'}</option>
              {masterOpts.sskRows
                .filter(r => {
                  if (r.subkegiatan_ref && r.kegiatan_ref && r.program_ref)
                    return r.subkegiatan_ref === rekForm.subkegiatan && r.kegiatan_ref === rekForm.kegiatan && r.program_ref === rekForm.program;
                  if (r.subkegiatan_ref) return r.subkegiatan_ref === rekForm.subkegiatan;
                  return true;
                })
                .map(r => <option key={r.nama} value={r.nama}>{r.nama}</option>)}
            </select>
          </div>

          {/* Row 3: Uraian (text bebas) */}
          <div style={{ marginBottom:'12px' }}>
            <label style={{ ...lblStyle, color: isLight?'#0369A1':'#7DD3FC' }}>Rekening Belanja</label>
            <input value={rekForm.uraian} onChange={e => setRekForm(p => ({ ...p, uraian: e.target.value }))}
              placeholder="Contoh: Belanja Gaji Pegawai"
              style={{ width:'100%', border:`1.5px solid ${cInputBorder}`, borderRadius:'9px', padding:'9px 14px', fontSize:'14px', color:cTextPrimary, background:cSurface, boxSizing:'border-box', outline:'none' }} />
          </div>

          {/* Row 4: Sumber Anggaran */}
          <div style={{ marginBottom:'16px' }}>
            <label style={lblStyle}>Sumber Anggaran</label>
            <select value={rekForm.sumber_anggaran} onChange={e => setRekForm(p => ({ ...p, sumber_anggaran: e.target.value }))} style={selStyle}>
              <option value="">-- Pilih Sumber --</option>
              {masterOpts.sumber_anggaran.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Buttons */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', flexWrap:'wrap' }}>
            {rekEditIdx !== null && (
              <PrimaButton variant="ghost" onClick={() => { setRekForm(emptyRekForm()); setRekEditIdx(null); }}>
                Batal Edit
              </PrimaButton>
            )}
            <PrimaButton variant="purple" iconLeft={<Plus size={14} />}
              onClick={addRekRow} disabled={!rekForm.uraian.trim()}>
              {rekEditIdx !== null ? 'Update' : 'Tambah'}
            </PrimaButton>
            <PrimaButton variant="success" iconLeft={<Save size={14} />}
              onClick={saveRekening} disabled={saving || rekeningRows.length === 0}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </PrimaButton>
            <DownloadButton variant="excel" label="Excel" onClick={doExportRekeningExcel} />
          </div>
        </div>
      )}

      {/* Tabel */}
      <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflowX:'auto', boxShadow:cBoxShadow }}>
        {loadingData ? (
          <TableSkeleton rows={6} cols={canEdit ? 8 : 7} />
        ) : (
          <table style={{ minWidth:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr style={{ background:cTableHeadBg }}>
                {['No','Program','Kegiatan','Sub Kegiatan','Uraian SSK','Rekening Belanja','Sumber'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.05em', color: isLight?'#5B21B6':'#E6F1FB', whiteSpace:'nowrap', textAlign:'left' }}>{h}</th>
                ))}
                {canEdit && <th style={{ padding:'10px 12px', borderBottom:`2px solid ${cBorder}`, width:'90px', textAlign:'center', fontWeight:700, fontSize:'11px', color: isLight?'#5B21B6':'#E6F1FB', textTransform:'uppercase', letterSpacing:'.05em' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {rekeningRows.length === 0 && (
                <tr><td colSpan={canEdit?8:7} style={{ padding:'36px', textAlign:'center', color:cTextSub, fontSize:'13px' }}>Belum ada rekening.</td></tr>
              )}
              {rekeningRows.map((r, i) => (
                <tr key={i} style={{ background: i%2===0 ? cRowEven : cRowOdd }}>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub, textAlign:'center', fontWeight:600 }}>{i+1}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub, maxWidth:'200px' }}>{r.program||'-'}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub, maxWidth:'180px' }}>{r.kegiatan||'-'}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub, maxWidth:'180px' }}>{r.subkegiatan||'-'}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub }}>{r.uraian_ssk||'-'}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextPrimary, fontWeight:500, maxWidth:'240px' }}>{r.uraian}</td>
                  <td style={{ padding:'8px 12px', borderBottom:cBorderHair, color:cTextSub }}>{r.sumber_anggaran||'-'}</td>
                  {canEdit && (
                    <td style={{ padding:'7px 12px', borderBottom:cBorderHair, textAlign:'center' }}>
                      <button onClick={() => editRekRow(i)}
                        style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', borderRadius:'7px', border:`1.5px solid ${isLight?'rgba(125,211,252,.4)':'#185FA5'}`, background: isLight?'rgba(125,211,252,.10)':'rgba(4,44,83,.5)', cursor:'pointer', fontSize:'11px', fontWeight:700, color: isLight?'#0369A1':'#7DD3FC', marginRight:'4px' }}>
                        <Pencil size={11} /> Edit
                      </button>
                      <DeleteButton onClick={() => deleteRekRow(i)} data-tooltip="Hapus" iconSize={12} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
