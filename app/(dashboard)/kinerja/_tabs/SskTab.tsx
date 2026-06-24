'use client';
// ─── PRIMA E-Anggaran — SSK Tab ────────────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderSskPanel + 5 handler.
// Refactor Versi (Checkpoint C Task #19): integrate VersiPicker + handle save versi-aware.

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { InputNominal } from '@/components/ui/input-nominal';
import type { SumberSSK, SskRow, RekeningRow, MonthKey, SskMonths } from '../_types';
import { SUMBER_LIST, SSK_THEME, MONTHS_KEYS, MONTH_SHORT, emptyMonths, calcTotal, calcTotalPct } from '../_utils';
import { exportSskExcel, exportSskPdf } from '../_exports';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import VersiPickerKinerja, { type VersiKinerja, type VersiValue } from '@/components/kinerja/VersiPickerKinerja';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import DeleteIcon from '@/components/ui/DeleteIcon';
import Tip from '@/components/ui/Tip';
import { Download, Save, Check } from 'lucide-react';
import { uiTheme } from '@/lib/theme';

interface Props {
  sskRows: SskRow[];
  setSskRows: React.Dispatch<React.SetStateAction<SskRow[]>>;
  activeSumber: SumberSSK;
  setActiveSumber: (s: SumberSSK) => void;
  rekeningRows: RekeningRow[];
  tahun: string;
  canEdit: boolean;
  loadingData: boolean;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isLight?: boolean;
  // Refactor Versi (Checkpoint C):
  sskVersi: VersiValue;
  setSskVersi: React.Dispatch<React.SetStateAction<VersiValue>>;
  sskVersion: number; // V3-6 optimistic lock baseline
  refetchSsk: () => void;
}

export default function SskTab({
  sskRows, setSskRows, activeSumber, setActiveSumber,
  rekeningRows, tahun, canEdit, loadingData, saving, setSaving,
  isLight = false, sskVersi, setSskVersi, sskVersion, refetchSsk,
}: Props) {
  // ─── Versi list + locked detect ─────────────────────────────────────────
  const [versiItems,    setVersiItems]    = useState<VersiKinerja[]>([]);
  const [versiLoading,  setVersiLoading]  = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const fetchVersiList = useCallback(async () => {
    setVersiLoading(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${activeSumber}`);
      if (d.ok) setVersiItems(((d as unknown as { items: VersiKinerja[] }).items) ?? []);
    } finally { setVersiLoading(false); }
  }, [tahun, activeSumber]);

  useEffect(() => { queueMicrotask(() => fetchVersiList()); }, [fetchVersiList]);

  const activeVersiItem = versiItems.find(i => i.versi_tipe === sskVersi.tipe && i.versi_seq === sskVersi.seq);
  const versiLocked     = !!activeVersiItem?.locked_at;
  const versiLabel      = sskVersi.tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${sskVersi.seq}`;
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceForm = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cInputBorder = isLight ? 'rgba(139,92,246,.25)' : '#0C447C';
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cTableSubBg  = isLight ? 'rgba(139,92,246,.06)' : 'rgba(12,68,124,.5)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.08)' : '1px solid rgba(12,68,124,.2)';
  const cPctBg       = isLight ? 'rgba(139,92,246,.04)' : 'rgba(12,68,124,.2)';
  const theme = SSK_THEME[activeSumber];

  // ─── Handlers ────────────────────────────────────────────────────────────

  function injectRekening() {
    const existingKeys = new Set(sskRows.map(r => `${r.uraian_ssk}||${r.uraian}`));
    const toInject = rekeningRows
      .filter(r => r.uraian.trim())
      .filter(r => !existingKeys.has(`${r.uraian_ssk||''}||${r.uraian}`))
      .map(r => ({
        uraian_ssk:   r.uraian_ssk  || '',
        uraian:       r.uraian,
        program:      r.program     || '',
        kegiatan:     r.kegiatan    || '',
        subkegiatan:  r.subkegiatan || '',
        pagu:         0,
        months:       emptyMonths(), months_pct: emptyMonths(), total: 0, total_pct: 0,
      }));
    if (toInject.length === 0) {
      toast.error('Semua rekening sudah ada di tabel SSK ini');
      return;
    }
    setSskRows(p => [...p, ...toInject]);
    toast.success(`${toInject.length} rekening berhasil diinjeksi`);
  }

  function deleteSskRow(idx: number) {
    setSskRows(p => p.filter((_,i) => i !== idx));
  }

  function updateSskPagu(idx: number, val: number) {
    setSskRows(p => p.map((r,i) => {
      if (i !== idx) return r;
      const total = calcTotal(r.months);
      const months_pct = MONTHS_KEYS.reduce((acc, mk) => {
        acc[mk] = val > 0 ? Math.round(((r.months[mk] || 0) / val) * 10000) / 100 : 0;
        return acc;
      }, {} as SskMonths);
      return { ...r, pagu: val, months_pct, total, total_pct: calcTotalPct(total, val) };
    }));
  }

  function updateSskMonth(idx: number, m: MonthKey, val: number) {
    setSskRows(p => p.map((r,i) => {
      if (i !== idx) return r;
      const months     = { ...r.months, [m]: val };
      const total      = calcTotal(months);
      const pct_m      = r.pagu > 0 ? Math.round((val / r.pagu) * 10000) / 100 : 0;
      const months_pct = { ...r.months_pct, [m]: pct_m };
      return { ...r, months, months_pct, total, total_pct: calcTotalPct(total, r.pagu) };
    }));
  }

  async function saveSsk() {
    if (versiLocked) { toast.error(`Versi ${versiLabel} sudah dikunci, tidak bisa diubah.`); return; }
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/ssk', {
        method: 'PUT',
        body: JSON.stringify({
          tahun, sumber: activeSumber, rows: sskRows,
          versi_tipe: sskVersi.tipe, versi_seq: sskVersi.seq,
          expected_version: sskVersion, // V3-6 optimistic lock
        }),
      });
      if (d.ok) {
        toast.success(`Tersimpan ${(d as unknown as { saved: number }).saved} baris SSK ${versiLabel}`);
        // Refetch versi-list + rows (sinkron baseline version terbaru)
        fetchVersiList();
        refetchSsk();
      } else if ((d as unknown as { code?: string }).code === 'VERSION_CONFLICT') {
        // V3-6: edit barengan → muat ulang versi terbaru (mirror RA L49).
        toast.error('Data SSK sudah diubah pengguna lain — memuat versi terbaru.');
        refetchSsk();
      } else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  async function createPerubahan() {
    setConfirmCreate(false);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/ssk/perubahan', {
        method: 'POST',
        body: JSON.stringify({
          tahun, sumber: activeSumber,
          from_versi_tipe: sskVersi.tipe, from_versi_seq: sskVersi.seq,
        }),
      });
      if (d.ok) {
        const newSeq = (d as unknown as { new_versi_seq: number }).new_versi_seq;
        toast.success(`PERUBAHAN-${newSeq} dibuat. ${versiLabel} dikunci.`);
        setSskVersi({ tipe: 'PERUBAHAN', seq: newSeq });
        await fetchVersiList();
        refetchSsk();
      } else toast.error(d.message || 'Gagal membuat versi baru');
    } catch { toast.error('Gagal membuat versi baru'); }
  }

  const doExportSskExcel = () => exportSskExcel({ rows: sskRows, sumber: activeSumber, tahun });
  const doExportSskPdf   = () => exportSskPdf  ({ rows: sskRows, sumber: activeSumber, tahun });

  // ─── Render ──────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'.04em', color: isLight?'#5B21B6':'#E6F1FB', whiteSpace:'nowrap', verticalAlign:'bottom' };
  const thSub:   React.CSSProperties = { padding:'5px 6px', borderBottom:`2px solid ${cBorder}`, borderTop:`1px solid ${cBorder}`, fontWeight:700, fontSize:'9px', color:cTextSub, whiteSpace:'nowrap', textAlign:'center' };
  const tdBase:  React.CSSProperties = { padding:'5px 8px', borderBottom:cBorderHair, color:cTextPrimary, verticalAlign:'middle' };
  const tdRight: React.CSSProperties = { ...tdBase, textAlign:'right' };
  const tdCenter:React.CSSProperties = { ...tdBase, textAlign:'center', color:cTextSub };
  const inputNum:React.CSSProperties = { border:`1px solid ${cInputBorder}`, borderRadius:'6px', padding:'3px 6px', fontSize:'11px', color:cTextPrimary, background:cSurface, outline:'none', width:'90px', textAlign:'right' };

  return (
    <div style={{ padding:'20px' }}>
      {/* Sumber tabs */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
        {SUMBER_LIST.map(s => {
          const active = activeSumber === s;
          return (
            <button key={s} onClick={() => setActiveSumber(s)}
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white' : SSK_THEME[s].color, boxShadow: active ? `0 3px 10px ${SSK_THEME[s].color}44`:undefined, transition:'all .18s' }}>
              {SSK_THEME[s].label}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      {canEdit && (
        <div style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'12px 16px', marginBottom:'14px', display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary, display:'flex', flexWrap:'wrap', alignItems:'center', gap:'10px' }}>
            <span>
              <i className="fas fa-table" style={{ marginRight:'6px', color:theme.color }} />
              {theme.label} — {tahun}
            </span>
            <VersiPickerKinerja
              value={sskVersi}
              items={versiItems}
              loading={versiLoading}
              onChange={v => { setSskVersi(v); refetchSsk(); }}
              onCreatePerubahan={() => setConfirmCreate(true)}
            />
            <span style={{ fontSize:'11px', fontWeight:500, color:cTextSub }}>{sskRows.length} baris</span>
            {versiLocked && (
              <span style={{ fontSize:'10px', fontWeight:700, color:'#B45309', background:'rgba(245,158,11,.15)', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(245,158,11,.4)' }}>
                <i className="fas fa-lock" style={{ marginRight:'4px' }} /> TERKUNCI (read-only)
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            <Tip label={versiLocked ? 'Versi terkunci' : 'Inject dari Master Rekening'}><PrimaButton variant="primary" iconLeft={<Download size={14} />}
              onClick={injectRekening} disabled={versiLocked}>
              Inject Rekening
            </PrimaButton></Tip>
            <Tip label={versiLocked ? 'Versi terkunci, tidak bisa disimpan' : ''}><PrimaButton variant="success" iconLeft={<Save size={14} />}
              onClick={saveSsk} disabled={saving || versiLocked}>
              {saving ? 'Menyimpan...' : 'Simpan Semua'}
            </PrimaButton></Tip>
            <DownloadButton variant="excel" label="Excel" onClick={doExportSskExcel} />
            <DownloadButton variant="pdf" label="PDF" onClick={doExportSskPdf} />
          </div>
        </div>
      )}

      {/* Tabel SSK — wide, horizontal scroll */}
      {loadingData ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflowX:'auto', boxShadow:cBoxShadow }}>
          <table style={{ minWidth:'max-content', borderCollapse:'collapse', fontSize:'11px' }}>
            <thead>
              <tr style={{ background:cTableHeadBg }}>
                <th rowSpan={2} style={thStyle}>No</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth:'220px' }}>Program / Kegiatan / Sub Kegiatan</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth:'150px' }}>Uraian SSK</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth:'200px' }}>Rekening Belanja</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth:'160px', textAlign:'right' }}>Pagu (Rp)</th>
                {MONTH_SHORT.map(m => (
                  <th key={m} colSpan={2} style={{ ...thStyle, textAlign:'center', color:theme.color }}>{m}</th>
                ))}
                <th rowSpan={2} style={{ ...thStyle, minWidth:'150px', textAlign:'right' }}>Total (Rp)</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth:'70px' }}>Total %</th>
                {canEdit && <th rowSpan={2} style={{ ...thStyle, minWidth:'60px', position:'sticky', right:0, background: isLight?'rgba(255,255,255,.95)':'rgba(4,44,83,.95)', zIndex:2 }}>Aksi</th>}
              </tr>
              <tr style={{ background:cTableSubBg }}>
                {MONTH_SHORT.map(m => [
                  <th key={`${m}-f`} style={{ ...thSub, borderColor: theme.color }}>Fisik (Rp)</th>,
                  <th key={`${m}-p`} style={{ ...thSub, borderColor: theme.color, color:cTextSub, background:cPctBg }}>% <span style={{ fontSize:'8px', fontWeight:500 }}>otomatis</span></th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {sskRows.length === 0 && (
                <tr><td colSpan={canEdit?32:31} style={{ padding:'32px', textAlign:'center', color:cTextSub }}>
                  Belum ada data SSK. {canEdit && 'Klik "Inject Rekening" untuk tarik item dari Master Rekening.'}
                </td></tr>
              )}
              {sskRows.map((row, idx) => (
                <tr key={idx} style={{ background: idx%2===0 ? cRowEven : cRowOdd }}>
                  <td style={tdCenter}>{idx+1}</td>
                  <td style={{ ...tdBase, minWidth:'220px' }}>
                    <div style={{ fontSize:'10px', color: isLight?'#B45309':'#FAC775', fontWeight:600, lineHeight:'1.5' }}>{row.program||'-'}</div>
                    <div style={{ fontSize:'10px', color: isLight?'#0369A1':'#7DD3FC', lineHeight:'1.5' }}>{row.kegiatan||'-'}</div>
                    <div style={{ fontSize:'10px', color: isLight?'#047857':'#86EFAC', lineHeight:'1.5' }}>{row.subkegiatan||'-'}</div>
                  </td>
                  <td style={{ ...tdBase, minWidth:'150px', fontSize:'11px', color:cTextSubAlt }}>{row.uraian_ssk||'-'}</td>
                  <td style={{ ...tdBase, minWidth:'200px', fontSize:'11px', color:cTextPrimary, fontWeight:500 }}>{row.uraian||'-'}</td>
                  <td style={tdRight}>
                    {canEdit
                      ? <InputNominal value={row.pagu} onChange={v => updateSskPagu(idx, v)} style={inputNum} className="text-right" />
                      : fmtNum(row.pagu)}
                  </td>
                  {MONTHS_KEYS.map(m => [
                    <td key={`${m}-f`} style={tdRight}>
                      {canEdit
                        ? <InputNominal value={row.months[m]||0} onChange={v => updateSskMonth(idx, m, v)} style={inputNum} className="text-right" />
                        : fmtNum(row.months[m]||0)}
                    </td>,
                    <td key={`${m}-p`} style={{ ...tdRight, color:cTextSub, background:cPctBg, fontSize:'11px' }}>
                      {(row.months_pct[m]||0).toFixed(2)}%
                    </td>,
                  ])}
                  <td style={{ ...tdRight, fontWeight:700, color:cTextPrimary }}>{fmtNum(row.total)}</td>
                  <td style={{ ...tdRight, fontWeight:700, color: row.total_pct >= 100 ? '#16a34a' : row.total_pct >= 50 ? '#f59e0b':'#dc3545' }}>
                    {row.total_pct.toFixed(2)}%
                  </td>
                  {canEdit && (
                    <td style={{ ...tdCenter, position:'sticky', right:0, zIndex:1, background: idx%2===0 ? cRowEven : cRowOdd }}>
                      <Tip label={versiLocked ? 'Versi terkunci, gunakan Nol-kan di Perubahan' : 'Hapus baris'}><button onClick={() => !versiLocked && deleteSskRow(idx)} disabled={versiLocked}
                        style={{ padding:'3px 10px', borderRadius:'6px', border:'1.5px solid rgba(226,75,74,.5)', background:'rgba(226,75,74,.1)', cursor: versiLocked?'not-allowed':'pointer', fontSize:'12px', fontWeight:700, color: isLight?'#B91C1C':'#FCA5A5', opacity: versiLocked?.35:1 }}>
                        <DeleteIcon size={13} />
                      </button></Tip>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {sskRows.length > 0 && (() => {
              const totalPagu = sskRows.reduce((s, r) => s + (r.pagu || 0), 0);
              const totalPerMonth = MONTHS_KEYS.map(m => sskRows.reduce((s, r) => s + (r.months[m] || 0), 0));
              const totalGrand    = sskRows.reduce((s, r) => s + (r.total || 0), 0);
              const totalGrandPct = totalPagu > 0 ? (totalGrand / totalPagu) * 100 : 0;
              const tfBase: React.CSSProperties = {
                padding:'8px 10px', borderTop:`2px solid ${cBorder}`,
                background: isLight ? 'rgba(139,92,246,.08)' : 'rgba(12,68,124,.45)',
                fontWeight:800, fontSize:'11px', color:cTextPrimary, whiteSpace:'nowrap',
              };
              const tfRight: React.CSSProperties = { ...tfBase, textAlign:'right', fontFamily:'JetBrains Mono, monospace' };
              return (
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ ...tfBase, textAlign:'right', textTransform:'uppercase', letterSpacing:'.04em', color: isLight?'#5B21B6':theme.color }}>
                      <i className="fas fa-calculator" style={{ marginRight:'6px' }} />
                      Grand Total
                    </td>
                    <td style={tfRight}>{fmtNum(totalPagu)}</td>
                    {totalPerMonth.map((v, i) => [
                      <td key={`gt-${i}-f`} style={{ ...tfRight, color:theme.color }}>{fmtNum(v)}</td>,
                      <td key={`gt-${i}-p`} style={{ ...tfBase, background:cPctBg }} />,
                    ])}
                    <td style={{ ...tfRight, color:theme.color }}>{fmtNum(totalGrand)}</td>
                    <td style={{ ...tfRight, color: totalGrandPct >= 100 ? '#16a34a' : totalGrandPct >= 50 ? '#f59e0b' : '#dc3545' }}>
                      {totalGrandPct.toFixed(2)}%
                    </td>
                    {canEdit && <td style={{ ...tfBase, position:'sticky', right:0, background: isLight?'rgba(139,92,246,.12)':'rgba(12,68,124,.6)' }} />}
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}

      {/* Modal konfirmasi buat PERUBAHAN baru */}
      {confirmCreate && (
        <div onClick={() => setConfirmCreate(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'14px', padding:'24px', maxWidth:'440px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:cTextPrimary, marginBottom:'10px' }}>
              <i className="fas fa-code-branch" style={{ marginRight:'8px', color:'#7C5CFC' }} />
              Buat Perubahan Baru
            </div>
            <div style={{ fontSize:'12px', color:cTextSub, lineHeight:1.7, marginBottom:'18px' }}>
              Akan dibuat versi <strong style={{ color:cTextPrimary }}>PERUBAHAN baru</strong> dengan menyalin semua data dari <strong style={{ color:cTextPrimary }}>{versiLabel}</strong>.
              <br /><br />
              Versi <strong style={{ color:cTextPrimary }}>{versiLabel}</strong> akan <strong style={{ color:'#B45309' }}>otomatis dikunci</strong> (tidak bisa diedit lagi).
              <br /><br />
              Lanjutkan?
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setConfirmCreate(false)}>
                Batal
              </PrimaButton>
              <PrimaButton variant="purple" iconLeft={<Check size={14} />} onClick={createPerubahan}>
                Ya, Buat Perubahan
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
