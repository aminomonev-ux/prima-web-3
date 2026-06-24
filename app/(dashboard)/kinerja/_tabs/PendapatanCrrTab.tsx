'use client';
// ─── PRIMA E-Anggaran — Pendapatan + CRR Tab ───────────────────────────────────
// O2: extract dari kinerja-client.tsx renderPendapatanCrrPanel.
// Gabungan 2 section di 1 tab 'pend-crr':
//   • Section 1: Pendapatan Target vs Realisasi (12 bulan)
//   • Section 2: CRR (Cost Recovery Rate) — pendapatan AUTO dari Sec.1
//
// Cross-section flow: Realisasi Sec.1 → di-derived sebagai Pendapatan Sec.2
// via getDisplayCrrRows() yang me-recalcCrr() saat render.

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { useAbortableEffect } from '@/lib/shared/hooks';
import { fmtRp } from '@/lib/shared/utils';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import Tip from '@/components/ui/Tip';
import { Save } from 'lucide-react';
import { Pencil } from 'lucide-react';
import { Upload } from 'lucide-react';
import { InputNominal } from '@/components/ui/input-nominal';
import type { CrrRow, PendRow, CrrInputField } from '../_types';
import { CRR_BULAN_LABELS, initCrrRows, initPendapatanRows, recalcCrr } from '../_utils';
import { exportCrrExcel, exportPendapatanExcel } from '../_exports';
import { uiTheme } from '@/lib/theme';
import ImportPendapatanModal from '@/components/kinerja/ImportPendapatanModal';
import { useLampir, type LampirPendapatanData } from '@/lib/sentinel/lampir-store';
import type { ParsedPendMonth } from '@/lib/data/kinerja-import';

interface Props {
  tahun: string;
  canEdit: boolean;
  isLight?: boolean;
  /** IK-2: dipicu Rima lewat /kinerja?import=pendapatan → buka modal Import sekali. */
  autoOpenImport?: boolean;
  onImportConsumed?: () => void;
}

export default function PendapatanCrrTab({ tahun, canEdit, isLight = false, autoOpenImport = false, onImportConsumed }: Props) {
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  // const cTextSubAlt  = isLight ? '#374151' : '#B5D4F4'; // unused
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)';
  const cAutoBg      = isLight ? 'rgba(139,92,246,.05)' : 'rgba(12,68,124,.2)';

  const [crrRows,         setCrrRows]         = useState<CrrRow[]>([]);
  const [pendapatanRows,  setPendapatanRows]  = useState<PendRow[]>([]);
  const [crrAutoFilling,  setCrrAutoFilling]  = useState<boolean[]>(Array(12).fill(false));
  const [loading,         setLoading]         = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [showImport,      setShowImport]      = useState(false);
  // §23 Lampirkan: hasil parse dari chat Rima (RAM store) → preload modal tanpa unggah ulang.
  const lampir = useLampir();
  const [preload, setPreload] = useState<{ data: LampirPendapatanData; name: string } | null>(null);

  // IK-2: Rima pemicu — buka modal Import sekali saat datang via ?import=pendapatan,
  // lalu beritahu parent agar flag dikonsumsi (tidak membuka berulang). Bila ada
  // lampiran dari chat Rima (§23), konsumsi (take) → modal langsung terisi previewnya.
  useEffect(() => {
    if (!autoOpenImport) return;
    if (canEdit) {
      // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
      queueMicrotask(() => {
        const st = lampir.take();
        if (st?.kind === 'pendapatan') setPreload({ data: st.data, name: st.fileName });
        setShowImport(true);
      });
    }
    onImportConsumed?.();
  }, [autoOpenImport, canEdit, onImportConsumed, lampir]);

  // ─── Fetchers ────────────────────────────────────────────────────────────
  const fetchCrr = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/pendapatan?tahun=${tahun}&type=crr`);
      if (d.ok) setCrrRows((d as unknown as { rows: CrrRow[] }).rows);
      else toast.error(d.message || 'Gagal memuat CRR');
    } finally { setLoading(false); }
  }, [tahun]);

  const fetchPendapatan = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/pendapatan?tahun=${tahun}&type=pendapatan`);
      if (d.ok) setPendapatanRows((d as unknown as { rows: PendRow[] }).rows);
      else toast.error(d.message || 'Gagal memuat pendapatan');
    } finally { setLoading(false); }
  }, [tahun]);

  // O8: useAbortableEffect cegah stale data saat user ganti tahun.
  // fetchPendapatan + fetchCrr callback tetap untuk save handler.
  useAbortableEffect(async (signal) => {
    setLoading(true);
    try {
      const [dPend, dCrr] = await Promise.all([
        fetchJson<unknown>(`/api/kinerja/pendapatan?tahun=${tahun}&type=pendapatan`, { signal }),
        fetchJson<unknown>(`/api/kinerja/pendapatan?tahun=${tahun}&type=crr`, { signal }),
      ]);
      if (signal.aborted) return;
      if (dPend.ok) setPendapatanRows((dPend as unknown as { rows: PendRow[] }).rows);
      else toast.error(dPend.message || 'Gagal memuat pendapatan');
      if (dCrr.ok) setCrrRows((dCrr as unknown as { rows: CrrRow[] }).rows);
      else toast.error(dCrr.message || 'Gagal memuat CRR');
    } finally { if (!signal.aborted) setLoading(false); }
  }, [tahun]);
  void fetchPendapatan; void fetchCrr;

  // ─── Derive CRR display rows (pendapatan override dari Sec.1) ────────────
  function getDisplayCrrRows(): CrrRow[] {
    const base = crrRows.length === 12 ? crrRows : initCrrRows();
    const withPend = base.map((r, i) => ({
      ...r,
      pendapatan: pendapatanRows[i]?.realisasi ?? 0,
    }));
    return recalcCrr(withPend);
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
  function updateCrrInput(idx: number, field: CrrInputField, val: number) {
    setCrrRows((p: CrrRow[]) => {
      const base = p.length === 12 ? p : initCrrRows();
      return base.map((r: CrrRow, i: number) => i === idx ? { ...r, [field]: val } : r);
    });
  }

  async function saveCrr() {
    const rows = getDisplayCrrRows();
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/pendapatan', {
        method: 'PUT',
        body: JSON.stringify({ tahun, type: 'crr', rows }),
      });
      if (d.ok) toast.success(`Tersimpan ${(d as unknown as { saved: number }).saved} baris CRR`);
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  async function autoFillBelanja(idx: number) {
    const bulanKe = idx + 1;
    setCrrAutoFilling((p: boolean[]) => p.map((v, i) => i === idx ? true : v));
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/pendapatan/belanja-auto?tahun=${tahun}&bulan=${bulanKe}`);
      if (d.ok) {
        const body = d as unknown as { blud: number; daerah: number };
        if (body.blud === 0 && body.daerah === 0) {
          toast.error(`Belum ada data Realisasi ${CRR_BULAN_LABELS[idx]} — isi dulu di tab Realisasi`);
        } else {
          setCrrRows((p: CrrRow[]) => {
            const base = p.length === 12 ? p : initCrrRows();
            return base.map((row: CrrRow, i: number) => i === idx ? { ...row, belanja_blud: body.blud, belanja_daerah: body.daerah } : row);
          });
          toast.success(`${CRR_BULAN_LABELS[idx]}: BLUD ${fmtRp(body.blud)} · Daerah ${fmtRp(body.daerah)}`);
        }
      } else toast.error(d.message || 'Gagal mengambil data realisasi');
    } finally { setCrrAutoFilling((p: boolean[]) => p.map((v, i) => i === idx ? false : v)); }
  }

  function updatePendField<K extends keyof PendRow>(idx: number, field: K, val: PendRow[K]) {
    setPendapatanRows((p: PendRow[]) => {
      const base = p.length === 12 ? p : initPendapatanRows();
      return base.map((r: PendRow, i: number) => {
        if (i !== idx) return r;
        const updated = { ...r, [field]: val };
        if (field === 'target' || field === 'realisasi') {
          const t  = field === 'target'    ? (val as number) : r.target;
          const rv = field === 'realisasi' ? (val as number) : r.realisasi;
          updated.capaian_pct = t > 0 ? Math.round((rv / t) * 10000) / 100 : 0;
        }
        return updated;
      });
    });
  }

  async function savePendapatan() {
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/kinerja/pendapatan', {
        method: 'PUT',
        body: JSON.stringify({ tahun, type: 'pendapatan', rows: pendapatanRows.length === 12 ? pendapatanRows : initPendapatanRows() }),
      });
      if (d.ok) toast.success(`Tersimpan ${(d as unknown as { saved: number }).saved} item pendapatan`);
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  // IK-1: terapkan hasil Import Excel ke DRAFT Section 1 (realisasi bulanan saja).
  // TIDAK menyimpan — user klik "Simpan Pendapatan" sesudah memeriksa (Model A′).
  function applyImport(months: ParsedPendMonth[]) {
    setPendapatanRows((prev: PendRow[]) => {
      const base = prev.length === 12 ? [...prev] : initPendapatanRows();
      for (const m of months) {
        const i = m.bulan_ke - 1;
        if (i < 0 || i > 11) continue;
        const target = base[i].target;
        const capaian_pct = target > 0 ? Math.round((m.realisasi / target) * 10000) / 100 : 0;
        base[i] = { ...base[i], realisasi: m.realisasi, capaian_pct };
      }
      return base;
    });
  }

  const doExportPendapatanExcel = () => exportPendapatanExcel({ rows: pendapatanRows, tahun });
  const doExportCrrExcel        = () => exportCrrExcel({ rows: crrRows, tahun });

  // ─── Compute display data ────────────────────────────────────────────────
  const pendRows = pendapatanRows.length === 12
    ? pendapatanRows
    : CRR_BULAN_LABELS.map((b, i) => ({
        keterangan: b, target: pendapatanRows[i]?.target ?? 0,
        realisasi: pendapatanRows[i]?.realisasi ?? 0,
        capaian_pct: pendapatanRows[i]?.capaian_pct ?? 0,
      }));
  const crrDisplay = getDisplayCrrRows();
  const totalTarget  = pendRows.reduce((s, r) => s + r.target, 0);
  const totalReal    = pendRows.reduce((s, r) => s + r.realisasi, 0);
  const totalCapaian = totalTarget > 0 ? Math.round((totalReal / totalTarget) * 10000) / 100 : 0;

  const inpStyle: React.CSSProperties = { border:`1px solid ${cBorder}`, borderRadius:'5px', padding:'3px 6px', fontSize:'11px', color:cTextPrimary, background:cSurface, textAlign:'right' };
  const roStyle:  React.CSSProperties = { padding:'5px 10px', borderBottom:cBorderHair, textAlign:'right', background:cAutoBg, color:cTextSub, fontSize:'11px' };
  const thBase:   React.CSSProperties = { padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', whiteSpace:'nowrap', background:cTableHeadBg };
  const thAuto:   React.CSSProperties = { ...thBase, color:cTextSub, background:cAutoBg, borderBottomColor:cBorder, textAlign:'right' };

  return (
    <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'24px' }}>

      {/* ══ SECTION 1 — Pendapatan Target vs Realisasi ══ */}
      <div>
        <div style={{ background: isLight?'rgba(55,138,221,.14)':'rgba(55,138,221,.12)', border:'1px solid rgba(55,138,221,.3)', borderRadius:'12px', padding:'12px 16px', marginBottom:'12px', display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary }}>
            <i className="fas fa-money-bill-wave" style={{ marginRight:'6px', color: isLight?'#0369A1':'#7DD3FC' }} />
            Section 1 — Pendapatan (Target vs Realisasi) — {tahun}
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ padding:'4px 10px', borderRadius:'20px', background: isLight?'rgba(29,158,117,.16)':'rgba(29,158,117,.15)', color: isLight?'#047857':'#6EE7B7', fontSize:'11px', fontWeight:700 }}>
              Target: {fmtRp(totalTarget)}
            </span>
            <span style={{ padding:'4px 10px', borderRadius:'20px', background: isLight?'rgba(55,138,221,.16)':'rgba(55,138,221,.15)', color: isLight?'#0369A1':'#7DD3FC', fontSize:'11px', fontWeight:700 }}>
              Realisasi: {fmtRp(totalReal)}
            </span>
            <span style={{ padding:'4px 10px', borderRadius:'20px', background: totalCapaian>=100?(isLight?'rgba(29,158,117,.16)':'rgba(29,158,117,.15)'):totalCapaian>=80?(isLight?'rgba(186,117,23,.16)':'rgba(186,117,23,.15)'):(isLight?'rgba(226,75,74,.16)':'rgba(226,75,74,.15)'), color: totalCapaian>=100?(isLight?'#047857':'#6EE7B7'):totalCapaian>=80?(isLight?'#B45309':'#FAC775'):(isLight?'#B91C1C':'#FCA5A5'), fontSize:'11px', fontWeight:700 }}>
              {totalCapaian.toFixed(1)}%
            </span>
            {canEdit && (
              <PrimaButton variant="purple" iconLeft={<Upload size={14} />}
                onClick={() => setShowImport(true)} disabled={saving}>
                Import Excel
              </PrimaButton>
            )}
            {canEdit && (
              <PrimaButton variant="success" iconLeft={<Save size={14} />}
                onClick={savePendapatan} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Pendapatan'}
              </PrimaButton>
            )}
            <DownloadButton variant="excel" label="Excel" onClick={doExportPendapatanExcel} />
          </div>
        </div>

        {loading ? (
          <div style={{ padding:'30px', textAlign:'center', color:cTextSub }}><i className="fas fa-spinner fa-spin" style={{ marginRight:'8px' }} />Memuat...</div>
        ) : (
          <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflow:'hidden', boxShadow:cBoxShadow }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'center', width:'40px' }}>No</th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'left', width:'140px' }}>Bulan</th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'right' }}>Target (Rp)</th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'right' }}>Realisasi (Rp)</th>
                  <th style={{ ...thAuto, width:'100px' }}>Capaian %<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                </tr>
              </thead>
              <tbody>
                {pendRows.map((row, idx) => (
                  <tr key={idx} style={{ background: idx%2===0 ? cRowEven : cRowOdd }}>
                    <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', color:cTextSub }}>{idx+1}</td>
                    <td style={{ padding:'5px 8px', borderBottom:cBorderHair, fontWeight:700, color:cTextPrimary }}>{CRR_BULAN_LABELS[idx]}</td>
                    <td style={{ padding:'3px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                      {canEdit
                        ? <InputNominal value={row.target} onChange={v => updatePendField(idx,'target', v)} style={{ ...inpStyle, width:'130px' }} />
                        : <span style={{ color: isLight?'#0369A1':'#7DD3FC', fontWeight:600 }}>{fmtRp(row.target)}</span>}
                    </td>
                    <td style={{ padding:'3px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                      {canEdit
                        ? <InputNominal value={row.realisasi} onChange={v => updatePendField(idx,'realisasi', v)} style={{ ...inpStyle, width:'130px' }} />
                        : <span style={{ color: isLight?'#047857':'#6EE7B7', fontWeight:600 }}>{fmtRp(row.realisasi)}</span>}
                    </td>
                    <td style={{ ...roStyle }}>
                      <span style={{ fontWeight:800, color: row.capaian_pct>=100?'#16a34a':row.capaian_pct>=80?'#f59e0b':'#dc2626' }}>
                        {row.capaian_pct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop:'10px', padding:'8px 14px', borderRadius:'8px', background: isLight?'rgba(124,92,252,.10)':'rgba(124,92,252,.1)', border:'1px solid rgba(124,92,252,.25)', fontSize:'11px', color: isLight?'#5B21B6':'#C4B5FD', display:'flex', alignItems:'center', gap:'8px' }}>
          <i className="fas fa-arrow-down" />
          Kolom <strong>Realisasi</strong> Section 1 di atas otomatis mengisi kolom <strong>Pendapatan</strong> di Section 2 (CRR) di bawah.
        </div>
      </div>

      {/* ══ SECTION 2 — CRR ══ */}
      <div>
        <div style={{ background: isLight?'rgba(186,117,23,.12)':'rgba(186,117,23,.1)', border:'1px solid rgba(186,117,23,.3)', borderRadius:'12px', padding:'12px 16px', marginBottom:'12px', display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary }}>
            <i className="fas fa-percentage" style={{ marginRight:'6px', color:'#f59e0b' }} />
            Section 2 — CRR (Cost Recovery Rate) — {tahun}
            <span style={{ marginLeft:'10px', fontSize:'11px', fontWeight:500, color:cTextSub }}>Belanja BLUD & Daerah input · Pendapatan &amp; CRR otomatis</span>
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {canEdit && (
              <PrimaButton variant="success" iconLeft={<Save size={14} />}
                onClick={saveCrr} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan CRR'}
              </PrimaButton>
            )}
            <DownloadButton variant="excel" label="Excel" onClick={doExportCrrExcel} />
          </div>
        </div>

        {loading ? (
          <div style={{ padding:'30px', textAlign:'center', color:cTextSub }}><i className="fas fa-spinner fa-spin" style={{ marginRight:'8px' }} />Memuat CRR...</div>
        ) : (
          <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflowX:'auto', boxShadow:cBoxShadow }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px', tableLayout:'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'center', width:'36px' }}>No</th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'left', width:'90px' }}>Bulan</th>
                  <th style={{ ...thAuto, width:'12%' }}>Pendapatan (Rp)<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>dari Sec.1</span></th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'right', width:'12%' }}>Belanja BLUD (Rp)</th>
                  <th style={{ ...thBase, color: isLight?'#5B21B6':'#E6F1FB', textAlign:'right', width:'13%' }}>Belanja Daerah (Rp)</th>
                  <th style={{ ...thAuto, width:'11%' }}>Pend. s/d<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                  <th style={{ ...thAuto, width:'11%' }}>BLUD s/d<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                  <th style={{ ...thAuto, width:'11%' }}>Daerah s/d<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                  <th style={{ ...thAuto, width:'8%' }}>CRR Parsial %<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                  <th style={{ ...thAuto, width:'8%' }}>CRR Total %<span style={{ display:'block', fontSize:'8px', fontWeight:500 }}>otomatis</span></th>
                </tr>
              </thead>
              <tbody>
                {crrDisplay.map((row, idx) => {
                  const hasData = row.pendapatan > 0 || row.belanja_blud > 0 || row.belanja_daerah > 0;
                  const filling = crrAutoFilling[idx];
                  return (
                    <tr key={idx} style={{ background: idx%2===0 ? cRowEven : cRowOdd }}>
                      <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', color:cTextSub }}>{idx+1}</td>
                      <td style={{ padding:'5px 8px', borderBottom:cBorderHair, fontWeight:700, color:cTextPrimary }}>{row.bulan}</td>

                      <td style={{ ...roStyle, color: row.pendapatan > 0 ? (isLight?'#047857':'#6EE7B7') : cTextSub }}>
                        {row.pendapatan > 0 ? fmtRp(row.pendapatan) : <span style={{ opacity:.5 }}>—</span>}
                      </td>

                      <td style={{ padding:'3px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                        {canEdit
                          ? <InputNominal value={row.belanja_blud} onChange={v => updateCrrInput(idx,'belanja_blud', v)} style={{ ...inpStyle, width:'100%' }} />
                          : <span style={{ color: isLight?'#B45309':'#FAC775', fontWeight:600 }}>{fmtRp(row.belanja_blud)}</span>}
                      </td>

                      <td style={{ padding:'3px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', justifyContent:'flex-end' }}>
                          {canEdit
                            ? <InputNominal value={row.belanja_daerah} onChange={v => updateCrrInput(idx,'belanja_daerah', v)} style={{ ...inpStyle, width:'100%' }} />
                            : <span style={{ color: isLight?'#B91C1C':'#FCA5A5', fontWeight:600 }}>{fmtRp(row.belanja_daerah)}</span>}
                          {canEdit && (
                            <Tip label={`Auto-isi BLUD & Daerah dari Realisasi ${row.bulan}`}><button
                              onClick={() => autoFillBelanja(idx)}
                              disabled={filling}
                              style={{ width:'30px', height:'30px', borderRadius:'6px', border:`1.5px solid ${isLight?'#D97706':'#F59E0B'}`, background: filling ? (isLight?'#FBBF24':'rgba(245,158,11,.2)') : (isLight?'#F59E0B':'rgba(245,158,11,.3)'), cursor: filling ? 'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .18s', opacity: filling ? 0.6 : 1, boxShadow: isLight?'0 1px 3px rgba(217,119,6,.45)':'0 0 8px rgba(245,158,11,.4)' }}>
                              {filling
                                ? <i className="fas fa-spinner fa-spin" style={{ fontSize:'12px', color: isLight?'#FFFFFF':'#FCD34D' }} />
                                : <Pencil size={13} color={isLight?'#FFFFFF':'#FCD34D'} />}
                            </button></Tip>
                          )}
                        </div>
                      </td>

                      <td style={roStyle}>{hasData ? fmtRp(row.pendapatan_sd) : <span style={{ opacity:.4 }}>—</span>}</td>
                      <td style={roStyle}>{hasData ? fmtRp(row.belanja_blud_sd) : <span style={{ opacity:.4 }}>—</span>}</td>
                      <td style={roStyle}>{hasData ? fmtRp(row.belanja_daerah_sd) : <span style={{ opacity:.4 }}>—</span>}</td>

                      <td style={{ ...roStyle, fontWeight:700, color: !hasData ? cTextSub : row.crr_parsial_pct >= 100 ? '#16a34a' : row.crr_parsial_pct >= 80 ? '#f59e0b' : '#dc2626' }}>
                        {hasData ? row.crr_parsial_pct.toFixed(2) + '%' : '—'}
                      </td>
                      <td style={{ ...roStyle, fontWeight:700, color: !hasData ? cTextSub : row.crr_total_pct >= 100 ? '#16a34a' : row.crr_total_pct >= 80 ? '#f59e0b' : '#dc2626' }}>
                        {hasData ? row.crr_total_pct.toFixed(2) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <ImportPendapatanModal isLight={isLight} preload={preload?.data} preloadName={preload?.name}
          onApply={applyImport} onClose={() => { setShowImport(false); setPreload(null); }} />
      )}
    </div>
  );
}
