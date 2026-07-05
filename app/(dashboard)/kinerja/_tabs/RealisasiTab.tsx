'use client';
// ─── PRIMA E-Anggaran — Realisasi Tab ──────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderRealisasiPanel + 5 handler.
// State realisasi (sumber, bulan, rows) TIDAK lokal — di-share dengan CetakTab
// (rekap mode konsumsi realisasiAllRows). Tetap di shell, di-pass via props.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { InputNominal } from '@/components/ui/input-nominal';
import type { SumberSSK, RealRow, SskRow, RealInputField } from '../_types';
import { SUMBER_LIST, SSK_THEME, MONTH_SHORT, MONTH_LABELS, recalcAllRealisasi } from '../_utils';
import { exportRealisasiExcel, exportRealisasiPdf } from '../_exports';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import Tip from '@/components/ui/Tip';
import { Wand2, Save, Upload } from 'lucide-react';
import ImportRealisasiModal from '@/components/kinerja/ImportRealisasiModal';
import VersiPickerKinerja, { type VersiKinerja, type VersiValue } from '@/components/kinerja/VersiPickerKinerja';
import { useLampir, type LampirRealisasiData } from '@/lib/sentinel/lampir-store';
import { uiTheme } from '@/lib/theme';

interface Props {
  realisasiSumber: SumberSSK;
  setRealisasiSumber: (s: SumberSSK) => void;
  realisasiBulan: number;
  setRealisasiBulan: (n: number) => void;
  realisasiRows: RealRow[];
  setRealisasiRows: React.Dispatch<React.SetStateAction<RealRow[]>>;
  sskRows: SskRow[];   // untuk initRealisasiFromSSK
  tahun: string;
  canEdit: boolean;
  loadingData: boolean;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isLight?: boolean;
  // Refactor Versi (Checkpoint C):
  sskVersi: VersiValue;
  setSskVersi: React.Dispatch<React.SetStateAction<VersiValue>>;
  realVersion: number;       // V3-6 optimistic lock baseline
  refetchReal: () => void;
  // IK-4 #5: dipicu Rima lewat /kinerja?import=realisasi → buka modal Import sekali.
  autoOpenImport?: boolean;
  onImportConsumed?: () => void;
}

export default function RealisasiTab({
  realisasiSumber, setRealisasiSumber, realisasiBulan, setRealisasiBulan,
  realisasiRows, setRealisasiRows, sskRows, tahun, canEdit, loadingData, saving, setSaving,
  isLight = false, sskVersi, setSskVersi, realVersion, refetchReal,
  autoOpenImport = false, onImportConsumed,
}: Props) {
  // Refactor Versi: list versi yang ada (untuk pill chip)
  const [versiItems,   setVersiItems]   = useState<VersiKinerja[]>([]);
  const [versiLoading, setVersiLoading] = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  // §23 Lampirkan: hasil parse dari chat Rima (RAM store) → preload modal tanpa unggah ulang.
  const lampir = useLampir();
  const [preload, setPreload] = useState<{ data: LampirRealisasiData; name: string } | null>(null);

  // IK-4: terapkan hasil Import (sumber yang sedang dibuka) ke DRAFT realisasi —
  // isi real_keuangan baris SSK pada bulan yang sesuai, lalu recalc turunan.
  // TIDAK menyimpan: user klik "Simpan Semua" (Model A′).
  function applyImport(items: { ssk_canonical_id: string; bulan_ke: number; realisasi: number }[]) {
    setRealisasiRows(p => recalcAllRealisasi(p.map(r => {
      const hit = items.find(it => it.ssk_canonical_id === r.ssk_canonical_id && it.bulan_ke === r.bulan);
      return hit ? { ...r, real_keuangan: hit.realisasi } : r;
    })));
  }

  // IK-4 #5: buka modal Import sekali saat datang via ?import=realisasi. Bila ada
  // lampiran dari chat Rima (§23), konsumsi (take) → modal langsung terisi previewnya.
  useEffect(() => {
    if (!autoOpenImport) return;
    if (canEdit) {
      // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
      queueMicrotask(() => {
        const st = lampir.take();
        if (st?.kind === 'realisasi') setPreload({ data: st.data, name: st.fileName });
        setShowImport(true);
      });
    }
    onImportConsumed?.();
  }, [autoOpenImport, canEdit, onImportConsumed, lampir]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) setVersiLoading(true); });
    fetchJson<unknown>(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${realisasiSumber}`)
      .then(d => { if (alive && d.ok) setVersiItems(((d as unknown as { items: VersiKinerja[] }).items) ?? []); })
      .finally(() => alive && setVersiLoading(false));
    return () => { alive = false; };
  }, [tahun, realisasiSumber]);

  // Versi locked → realisasi yang mengacu ke versi itu jadi read-only (snapshot historis).
  // Input realisasi baru hanya boleh saat acuan = versi aktif terbaru (yg belum locked).
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
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)';
  const cAutoBg      = isLight ? 'rgba(139,92,246,.05)' : 'rgba(12,68,124,.2)';
  const cMonthBarBg  = isLight ? '#F4F5F8' : 'rgba(4,44,83,.6)';
  const theme = SSK_THEME[realisasiSumber];

  // ─── Handlers ────────────────────────────────────────────────────────────
  function updateRealInput(idx: number, field: RealInputField, val: string | number) {
    setRealisasiRows(p => recalcAllRealisasi(p.map((r,i) => i === idx ? { ...r, [field]: val } : r)));
  }

  /** Init 12 bulan dari SSK — bulan Des dibulatkan supaya total 100% tepat. */
  function initRealisasiFromSSK() {
    if (!sskRows.length) { toast.error('Data SSK kosong. Isi SSK terlebih dahulu.'); return; }
    const MONTH_IDX = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const;
    const toAdd: RealRow[] = [];
    // Hitung berapa SSK row yang di-skip karena uraian kosong → kasih warning informatif
    const skippedNoUraian = sskRows.filter(s => !s.uraian.trim()).length;
    for (let b = 1; b <= 12; b++) {
      const mk = MONTH_IDX[b - 1];
      for (const s of sskRows) {
        if (!s.uraian.trim()) continue;
        const exists = realisasiRows.some(r => r.bulan === b && r.keterangan === s.uraian && r.uraian_ssk === s.uraian_ssk);
        if (!exists) {
          toAdd.push({
            bulan: b,
            // Refactor Versi: link ke SSK canonical_id supaya hydrate work
            ssk_canonical_id: s.canonical_id || '',
            ssk_versi_tipe:   sskVersi.tipe,
            ssk_versi_seq:    sskVersi.seq,
            keterangan:   s.uraian,
            program:      s.program      || '',
            kegiatan:     s.kegiatan     || '',
            subkegiatan:  s.subkegiatan  || '',
            uraian_ssk:   s.uraian_ssk   || '',
            pagu_awal:    s.pagu         || 0,
            // #10: pakai months_pct langsung — sumber yang SAMA dgn server saat
            // hydrate reload (kinerja-calc.ts). Rumus lama memaksa Des = 100 − Σ11
            // bulan → nilai beda sebelum vs sesudah simpan (bahkan bisa negatif).
            target_fisik: s.months_pct?.[mk] ?? 0,
            real_fisik: 0, pct_fisik: 0,
            akum_target_fisik: 0, akum_real_fisik: 0, akum_pct_fisik: 0,
            real_keuangan: 0, pct_keuangan: 0, akum_keuangan: 0, akum_pct_keuangan: 0,
            deviasi_fisik: 0, deviasi_keuangan: 0,
          });
        }
      }
    }
    if (toAdd.length === 0) {
      if (skippedNoUraian > 0) {
        toast.error(`${skippedNoUraian} baris SSK belum punya uraian/rekening belanja — isi dulu di SSK ${sskVersi.tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${sskVersi.seq}`} baru klik Init ulang.`, { duration: 6000 });
      } else {
        toast.info('Semua data SSK sudah ada di realisasi');
      }
      return;
    }
    setRealisasiRows(p => recalcAllRealisasi([...p, ...toAdd]));
    const itemCount = sskRows.length - skippedNoUraian;
    const msg = `${toAdd.length} baris ditambahkan dari SSK (12 bulan × ${itemCount} item)`;
    toast.success(skippedNoUraian > 0 ? `${msg}. ${skippedNoUraian} item di-skip (uraian kosong).` : msg);
  }

  async function saveRealisasi() {
    setSaving(true);
    try {
      const rows = recalcAllRealisasi(realisasiRows);
      const d = await fetchJson<unknown>('/api/kinerja/realisasi', {
        method: 'PUT',
        body: JSON.stringify({ tahun, sumber: realisasiSumber, rows, expected_version: realVersion }),
      });
      if (d.ok) { toast.success(`Tersimpan ${(d as unknown as { saved: number }).saved} baris realisasi`); setRealisasiRows(rows); refetchReal(); }
      else if ((d as unknown as { code?: string }).code === 'VERSION_CONFLICT') {
        toast.error('Data realisasi sudah diubah pengguna lain — memuat versi terbaru.');
        refetchReal();
      } else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  const doExportRealisasiExcel = () => exportRealisasiExcel({ rows: realisasiRows, sumber: realisasiSumber, tahun });
  const doExportRealisasiPdf   = () => exportRealisasiPdf  ({ rows: realisasiRows, sumber: realisasiSumber, tahun });

  // ─── Render ──────────────────────────────────────────────────────────────
  const bulanRowsWithIdx = realisasiRows
    .map((r, i) => ({ row: r, idx: i }))
    .filter(({ row }) => row.bulan === realisasiBulan);

  const inpBase: React.CSSProperties = {
    border:`1px solid ${cInputBorder}`, borderRadius:'5px', padding:'3px 6px',
    fontSize:'12px', color:cTextPrimary, background:cSurface,
  };
  const roCell: React.CSSProperties = {
    padding:'5px 10px', borderBottom:cBorderHair,
    textAlign:'right', color:cTextSub, background:cAutoBg, fontSize:'11px',
  };

  return (
    <div style={{ padding:'20px' }}>
      {/* Sumber selector */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px' }}>
        {SUMBER_LIST.map(s => {
          const active = realisasiSumber === s;
          return (
            <button key={s} onClick={() => setRealisasiSumber(s)}
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white' : SSK_THEME[s].color, boxShadow: active ? `0 3px 10px ${SSK_THEME[s].color}44`:undefined, transition:'all .18s' }}>
              {SSK_THEME[s].label.replace('SSK ','')}
            </button>
          );
        })}
      </div>

      {/* Header bar */}
      <div style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'20px 22px', marginBottom:'18px', display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary, display:'flex', flexWrap:'wrap', alignItems:'center', gap:'12px' }}>
            <span>
              <i className="fas fa-chart-bar" style={{ marginRight:'6px', color:theme.color }} />
              Realisasi {realisasiSumber} — {tahun}
            </span>
            <VersiPickerKinerja
              value={sskVersi}
              items={versiItems}
              loading={versiLoading}
              onChange={v => setSskVersi(v)}
              /* onCreatePerubahan disengaja undefined — versi baru dibuat dari SSK, bukan Realisasi */
            />
          </div>
          <div style={{ fontSize:'11px', color:cTextSub, marginTop:'12px' }}>
            {realisasiRows.length} baris total &nbsp;·&nbsp;
            <span style={{ color:theme.color, fontWeight:600 }}>{bulanRowsWithIdx.length} baris bulan ini</span>
            &nbsp;·&nbsp; Acuan: <strong style={{ color:cTextPrimary }}>{versiLabel}</strong>
            {versiLocked && (
              <span style={{ marginLeft:'10px', fontSize:'10px', fontWeight:700, color:'#B45309', background:'rgba(245,158,11,.15)', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(245,158,11,.4)' }}>
                <i className="fas fa-lock" style={{ marginRight:'4px' }} /> ARSIP (read-only)
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            <Tip label={versiLocked ? `Acuan ${versiLabel} sudah diarsipkan, switch ke versi terbaru untuk input baru.` : 'Buat baris untuk semua bulan dari data SSK'}><PrimaButton variant="primary" iconLeft={<Wand2 size={14} />}
              onClick={initRealisasiFromSSK} disabled={versiLocked}>
              Init dari SSK
            </PrimaButton></Tip>
            <Tip label="Tarik realisasi dari file Excel — cocokkan ke keterangan SSK per sumber"><PrimaButton variant="purple" iconLeft={<Upload size={14} />}
              onClick={() => setShowImport(true)} disabled={versiLocked}>
              Import Excel
            </PrimaButton></Tip>
            <Tip label={versiLocked ? `Acuan ${versiLabel} sudah diarsipkan, tidak bisa simpan input baru.` : ''}><PrimaButton variant="success" iconLeft={<Save size={14} />}
              onClick={saveRealisasi} disabled={saving || versiLocked}>
              {saving ? 'Menyimpan...' : 'Simpan Semua'}
            </PrimaButton></Tip>
            <DownloadButton variant="excel" label="Excel" onClick={doExportRealisasiExcel} />
            <DownloadButton variant="pdf" label="PDF" onClick={doExportRealisasiPdf} />
          </div>
        )}
      </div>

      {showImport && (
        <ImportRealisasiModal tahun={tahun} currentSumber={realisasiSumber} isLight={isLight}
          preload={preload?.data} preloadName={preload?.name}
          onApply={applyImport} onClose={() => { setShowImport(false); setPreload(null); }} />
      )}

      {/* Month tabs */}
      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'6px', marginBottom:'16px', background:cMonthBarBg, borderRadius:'10px', padding:'10px 8px' }}>
        {MONTH_SHORT.map((label, i) => {
          const b = i + 1;
          const active = realisasiBulan === b;
          const count = realisasiRows.filter(r => r.bulan === b).length;
          return (
            <button key={b} onClick={() => setRealisasiBulan(b)} style={{
              flex:'1 0 auto', minWidth:'52px', padding:'5px 6px', borderRadius:'7px', border:'none',
              cursor:'pointer', fontSize:'11px', fontWeight: active ? 800 : 600,
              background: active ? theme.color : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'),
              color: active ? 'white' : cTextSubAlt,
              boxShadow: active ? `0 2px 8px ${theme.color}44` : '0 1px 3px rgba(0,0,0,.06)',
              transition:'all .15s', position:'relative',
            }}>
              {label}
              {count > 0 && (
                <span style={{
                  position:'absolute', top:'-4px', right:'-3px',
                  background: active ? 'white' : theme.color,
                  color: active ? theme.color : 'white',
                  borderRadius:'8px', fontSize:'9px', fontWeight:800,
                  padding:'0 4px', lineHeight:'14px', minWidth:'14px', textAlign:'center',
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Info: editable vs auto columns */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'10px', fontSize:'11px' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <span style={{ width:'10px', height:'10px', background:cSurface, border:`1.5px solid ${cInputBorder}`, borderRadius:'3px', display:'inline-block' }} />
          <span style={{ color:cTextSubAlt, fontWeight:600 }}>Input manual (5 kolom)</span>
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <span style={{ width:'10px', height:'10px', background:cAutoBg, border:`1px solid ${cBorder}`, borderRadius:'3px', display:'inline-block' }} />
          <span style={{ color:cTextSub }}>Otomatis dihitung (9 kolom)</span>
        </span>
      </div>

      {loadingData ? (
        <TableSkeleton rows={5} cols={canEdit ? 16 : 15} />
      ) : (
        <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflowX:'auto', boxShadow:cBoxShadow }}>
          <table style={{ minWidth:'max-content', borderCollapse:'collapse', fontSize:'11px', width:'100%' }}>
            <thead>
              <tr>
                {['No','Keterangan','Pagu','Target Fisik','Real Fisik','Real Keuangan'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'.03em', color: isLight?'#5B21B6':'#E6F1FB', whiteSpace:'nowrap', background:cTableHeadBg, textAlign: h==='No'?'center':'left' }}>{h}</th>
                ))}
                {['% Fisik','Akum Tgt Fisik','Akum Real Fisik','Akum % Fisik','% Real Keu','Akum Keu','Akum % Keu','Dev Fisik %','Dev Keuangan %'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'.03em', color:cTextSub, whiteSpace:'nowrap', background:cAutoBg, textAlign:'right' }}>
                    {h}<span style={{ display:'block', fontSize:'8px', fontWeight:500, color:cTextSub, letterSpacing:0 }}>otomatis</span>
                  </th>
                ))}
                {canEdit && <th style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, background: isLight?'rgba(255,255,255,.95)':'rgba(4,44,83,.95)', textAlign:'center', fontWeight:700, fontSize:'10px', textTransform:'uppercase', color: isLight?'#5B21B6':'#E6F1FB', position:'sticky', right:0, zIndex:2 }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {bulanRowsWithIdx.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 16 : 15} style={{ padding:'32px', textAlign:'center', color:cTextSub }}>
                    Belum ada data untuk {MONTH_LABELS[realisasiBulan-1]}.
                    {canEdit && (
                      <span> Klik <strong>&quot;Init dari SSK&quot;</strong> untuk tarik semua item × 12 bulan.</span>
                    )}
                  </td>
                </tr>
              )}
              {bulanRowsWithIdx.map(({ row, idx }, ri) => (
                <tr key={idx} style={{ background: ri%2===0 ? cRowEven : cRowOdd }}>
                  <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', color:cTextSub, fontWeight:600 }}>{ri+1}</td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair }}>
                    <span style={{ fontWeight:500, color:cTextPrimary, fontSize:'12px' }}>{row.keterangan || '-'}</span>
                  </td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                    <span style={{ color:cTextPrimary, fontSize:'12px' }}>{fmtNum(row.pagu_awal)}</span>
                  </td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                    <span style={{ color:cTextSub, fontSize:'12px' }}>{(row.target_fisik||0).toFixed(2)}%</span>
                  </td>
                  <td style={{ padding:'3px 6px', borderBottom:cBorderHair }}>
                    {canEdit
                      ? <InputNominal value={row.real_fisik||0} onChange={v => updateRealInput(idx,'real_fisik',v)}
                          style={{ ...inpBase, width:'110px', textAlign:'right', borderColor: isLight?'#10b981':'#86efac' }} />
                      : <span style={{ color: isLight?'#15803D':'#16a34a', fontWeight:700 }}>{fmtNum(row.real_fisik)}</span>}
                  </td>
                  <td style={{ padding:'3px 6px', borderBottom:cBorderHair }}>
                    {canEdit
                      ? <InputNominal value={row.real_keuangan||0} onChange={v => updateRealInput(idx,'real_keuangan',v)}
                          style={{ ...inpBase, width:'120px', textAlign:'right', borderColor: isLight?'#10b981':'#86efac' }} />
                      : <span style={{ color: isLight?'#15803D':'#16a34a', fontWeight:700 }}>{fmtNum(row.real_keuangan)}</span>}
                  </td>
                  <td style={{ ...roCell, color: row.pct_fisik>=100?'#16a34a':row.pct_fisik>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.pct_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, fontWeight:700 }}>{row.akum_target_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell }}>{fmtNum(row.akum_real_fisik)}</td>
                  <td style={{ ...roCell, color: row.akum_pct_fisik>=100?'#16a34a':row.akum_pct_fisik>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.akum_pct_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.pct_keuangan>=100?'#16a34a':row.pct_keuangan>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.pct_keuangan.toFixed(2)}%</td>
                  <td style={{ ...roCell }}>{fmtNum(row.akum_keuangan)}</td>
                  <td style={{ ...roCell, color: row.akum_pct_keuangan>=100?'#16a34a':row.akum_pct_keuangan>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.akum_pct_keuangan.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.deviasi_fisik>=0?'#16a34a':'#dc2626', fontWeight:600 }}>{row.deviasi_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.deviasi_keuangan>=0?'#16a34a':'#dc2626', fontWeight:600 }}>{row.deviasi_keuangan.toFixed(2)}%</td>
                  {canEdit && (
                    <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', position:'sticky', right:0, zIndex:1, background: ri%2===0 ? cRowEven : cRowOdd }}>
                      <Tip label="Hapus realisasi dimatikan untuk menjaga integritas histori. Untuk menonaktifkan item, Nol-kan target di SSK Perubahan."><button
                        disabled
                        onClick={() => toast.info('Hapus dimatikan. Nol-kan target SSK Perubahan kalau ingin menonaktifkan item.')}
                        style={{ padding:'3px 10px', borderRadius:'6px', border:'1.5px solid rgba(226,75,74,.35)', background:'rgba(226,75,74,.06)', cursor:'not-allowed', fontSize:'12px', fontWeight:700, color: isLight?'#B91C1C':'#FCA5A5', opacity:.4 }}>
                        🗑
                      </button></Tip>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Summary cards: Total Realisasi bulan ini + S/D ─────────────── */}
      {!loadingData && bulanRowsWithIdx.length > 0 && (() => {
        const totalBulan = bulanRowsWithIdx.reduce((s, { row }) => s + (row.real_keuangan || 0), 0);
        const totalSd    = bulanRowsWithIdx.reduce((s, { row }) => s + (row.akum_keuangan  || 0), 0);
        const cardBase: React.CSSProperties = {
          background: cSurface, border: `1px solid ${cBorder}`,
          borderRadius: '8px', padding: '8px 12px', boxShadow: cBoxShadow,
          display:'flex', alignItems:'center', gap:'10px',
        };
        return (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'10px', justifyContent:'center' }}>
            <div style={{ ...cardBase, borderLeft:`3px solid ${theme.color}` }}>
              <i className="fas fa-coins" style={{ color:theme.color, fontSize:'12px' }} />
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                <span style={{ fontSize:'9px', fontWeight:700, color:cTextSub, textTransform:'uppercase', letterSpacing:'.04em' }}>
                  Total Real. Keuangan — {MONTH_LABELS[realisasiBulan-1]}
                </span>
                <span style={{ fontSize:'13px', fontWeight:800, color:cTextPrimary, fontFamily:'JetBrains Mono, monospace', marginTop:'2px' }}>
                  Rp {new Intl.NumberFormat('id-ID').format(Math.round(totalBulan))}
                </span>
              </div>
            </div>
            <div style={{ ...cardBase, borderLeft:'3px solid #10B981' }}>
              <i className="fas fa-chart-line" style={{ color:'#10B981', fontSize:'12px' }} />
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                <span style={{ fontSize:'9px', fontWeight:700, color:cTextSub, textTransform:'uppercase', letterSpacing:'.04em' }}>
                  Total Real. Keuangan S/D {MONTH_LABELS[realisasiBulan-1]}
                </span>
                <span style={{ fontSize:'13px', fontWeight:800, color: isLight?'#047857':'#34D399', fontFamily:'JetBrains Mono, monospace', marginTop:'2px' }}>
                  Rp {new Intl.NumberFormat('id-ID').format(Math.round(totalSd))}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
