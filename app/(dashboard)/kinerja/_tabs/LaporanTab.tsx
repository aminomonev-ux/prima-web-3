'use client';
// ─── PRIMA E-Anggaran — Laporan Konsolidasi Tab ────────────────────────────────
// O2: extract dari kinerja-client.tsx renderLaporanPanel (line 2000-2212).
// View-only tab: state laporan + fetcher hanya dipakai panel ini → dipindah lokal.

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { useAbortableEffect } from '@/lib/shared/hooks';
import { fmtRp, fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import type { SumberSSK, LaporanSumber } from '../_types';
import { SUMBER_LIST, SSK_THEME, CRR_BULAN_LABELS, MONTH_SHORT } from '../_utils';
import { exportLaporanExcel, exportLaporanPdf } from '../_exports';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import { RefreshCw } from 'lucide-react';
import { uiTheme } from '@/lib/theme';

interface Props {
  tahun: string;
  isLight?: boolean;
}

export default function LaporanTab({ tahun, isLight = false }: Props) {
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cAccent      = isLight ? '#7C3AED' : '#A78BFA';
  const cToolbarBg   = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cTrackBg     = isLight ? 'rgba(139,92,246,.10)' : 'rgba(12,68,124,.3)';
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cTotalRowBg  = isLight ? 'rgba(139,92,246,.10)' : 'rgba(12,68,124,.4)';
  const cAccentSoft  = isLight ? 'rgba(124,92,252,.10)' : 'rgba(124,92,252,.1)';
  const cBoxShadow   = t.shadow;
  const [laporanSumber, setLaporanSumber] = useState<SumberSSK>('GAJI');
  const [laporanData,   setLaporanData]   = useState<LaporanSumber | null>(null);
  const [laporanAll,    setLaporanAll]    = useState<LaporanSumber[]>([]);
  const [loadingData,   setLoadingData]   = useState(false);

  const fetchLaporan = useCallback(async (sumber: SumberSSK) => {
    setLoadingData(true);
    try {
      const d = await fetchJson<LaporanSumber>(`/api/kinerja/laporan?tahun=${tahun}&sumber=${sumber}`);
      if (d.ok && d.data) setLaporanData(d.data);
      else if (!d.ok) toast.error(d.message || 'Gagal memuat laporan');
    } finally { setLoadingData(false); }
  }, [tahun]);

  const fetchLaporanSemua = useCallback(async () => {
    setLoadingData(true);
    try {
      const d = await fetchJson<LaporanSumber[]>(`/api/kinerja/laporan?tahun=${tahun}`);
      if (d.ok && d.data) setLaporanAll(d.data);
      else if (!d.ok) toast.error(d.message || 'Gagal memuat laporan');
    } finally { setLoadingData(false); }
  }, [tahun]);

  // O8: useAbortableEffect cegah stale data saat user ganti laporanSumber cepat.
  // fetchLaporan + fetchLaporanSemua callback tetap untuk tombol Refresh manual.
  useAbortableEffect(async (signal) => {
    setLoadingData(true);
    try {
      const [d1, d2] = await Promise.all([
        fetchJson<LaporanSumber>(`/api/kinerja/laporan?tahun=${tahun}&sumber=${laporanSumber}`, { signal }),
        fetchJson<LaporanSumber[]>(`/api/kinerja/laporan?tahun=${tahun}`, { signal }),
      ]);
      if (signal.aborted) return;
      if (d1.ok && d1.data) setLaporanData(d1.data);
      else if (!d1.ok) toast.error(d1.message || 'Gagal memuat laporan');
      if (d2.ok && d2.data) setLaporanAll(d2.data);
    } finally { if (!signal.aborted) setLoadingData(false); }
  }, [laporanSumber, tahun]);
  // Hindari unused warning untuk callback yang tetap di-export untuk tombol Refresh
  void fetchLaporan; void fetchLaporanSemua;

  const d = laporanData;

  const doExportLaporanExcel = () => { if (d) return exportLaporanExcel({ data: d, tahun }); };
  const doExportLaporanPdf   = () => { if (d) return exportLaporanPdf  ({ data: d, tahun }); };

  return (
    <div style={{ padding:'20px' }}>
      {/* Sumber tabs */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
        {SUMBER_LIST.map(s => {
          const active = laporanSumber === s;
          return (
            <button key={s} onClick={() => setLaporanSumber(s)}
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white' : SSK_THEME[s].color, boxShadow: active ? `0 3px 10px ${SSK_THEME[s].color}44`:undefined, transition:'all .18s' }}>
              {s}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ background:cToolbarBg, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'12px 16px', marginBottom:'16px', display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary }}>
          <i className="fas fa-chart-line" style={{ marginRight:'6px', color:cAccent }} />
          Laporan Konsolidasi {laporanSumber} — {tahun}
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          <PrimaButton variant="purple" iconLeft={<RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />}
            onClick={() => { fetchLaporan(laporanSumber); fetchLaporanSemua(); }} disabled={loadingData}>
            Refresh
          </PrimaButton>
          <DownloadButton variant="excel" label="Excel" onClick={doExportLaporanExcel} disabled={!d} />
          <DownloadButton variant="pdf" label="PDF" onClick={doExportLaporanPdf} disabled={!d} />
        </div>
      </div>

      {loadingData ? (
        <div style={{ padding:'40px', textAlign:'center', color:cTextSub }}><i className="fas fa-spinner fa-spin" style={{ marginRight:'8px' }} />Memuat laporan...</div>
      ) : !d ? (
        <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
          Belum ada data untuk {laporanSumber} tahun {tahun}.
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'20px' }}>
            {[
              { label:'Total Pagu',         value: fmtRp(d.total_pagu),               icon:'fas fa-wallet',
                bg:    isLight ? 'rgba(55,138,221,.14)' : 'rgba(55,138,221,.12)',
                color: isLight ? '#0369A1' : '#7DD3FC' },
              { label:'Real Keuangan',      value: fmtRp(d.total_real_keuangan),      icon:'fas fa-coins',
                bg:    isLight ? 'rgba(29,158,117,.14)' : 'rgba(29,158,117,.12)',
                color: isLight ? '#047857' : '#6EE7B7' },
              { label:'Serapan Keuangan',   value: d.pct_serapan.toFixed(2)+'%',      icon:'fas fa-percentage',
                bg:    d.pct_serapan>=80 ? (isLight?'rgba(29,158,117,.14)':'rgba(29,158,117,.12)')
                     : d.pct_serapan>=50 ? (isLight?'rgba(186,117,23,.14)':'rgba(186,117,23,.12)')
                                         : (isLight?'rgba(226,75,74,.14)':'rgba(226,75,74,.12)'),
                color: d.pct_serapan>=80 ? (isLight?'#047857':'#6EE7B7')
                     : d.pct_serapan>=50 ? (isLight?'#B45309':'#FAC775')
                                         : (isLight?'#B91C1C':'#FCA5A5') },
              { label:'Capaian Fisik',      value: d.pct_fisik.toFixed(2)+'%',        icon:'fas fa-tasks',
                bg:    d.pct_fisik>=80 ? (isLight?'rgba(29,158,117,.14)':'rgba(29,158,117,.12)')
                     : d.pct_fisik>=50 ? (isLight?'rgba(186,117,23,.14)':'rgba(186,117,23,.12)')
                                       : (isLight?'rgba(226,75,74,.14)':'rgba(226,75,74,.12)'),
                color: d.pct_fisik>=80 ? (isLight?'#047857':'#6EE7B7')
                     : d.pct_fisik>=50 ? (isLight?'#B45309':'#FAC775')
                                       : (isLight?'#B91C1C':'#FCA5A5') },
            ].map(c => (
              <div key={c.label} style={{ borderRadius:'14px', padding:'16px 18px', background:c.bg, border: isLight ? '1px solid rgba(0,0,0,.06)' : '1px solid rgba(255,255,255,.5)', boxShadow: isLight ? '0 4px 14px rgba(0,0,0,.05)' : '0 4px 14px rgba(24,85,187,.1)', color:c.color }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', opacity: isLight ? 1 : .8 }}>{c.label}</div>
                    <div style={{ fontSize:'18px', fontWeight:800, margin:'4px 0', lineHeight:1.2 }}>{c.value}</div>
                    <div style={{ fontSize:'11px', opacity: isLight ? .8 : .65 }}>
                      {c.label==='Total Pagu' ? `Target Fisik: ${fmtRp(d.total_target_fisik)}` :
                       c.label==='Real Keuangan' ? `Real Fisik: ${fmtRp(d.total_real_fisik)}` :
                       c.label==='Serapan Keuangan' ? `Sisa: ${fmtRp(d.total_pagu - d.total_real_keuangan)}` :
                       `Bulan ke-${d.bulan_terakhir} (${CRR_BULAN_LABELS[d.bulan_terakhir-1]??'-'})`}
                    </div>
                  </div>
                  <div style={{ width:'38px', height:'38px', borderRadius:'10px', background: isLight ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>
                    <i className={c.icon} />
                  </div>
                </div>
                {(c.label==='Serapan Keuangan'||c.label==='Capaian Fisik') && (
                  <div style={{ marginTop:'8px', height:'5px', background: isLight ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)', borderRadius:'99px', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(parseFloat(c.value),100)}%`, background:c.color, borderRadius:'99px', transition:'width .6s' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Dua kolom: chart bar + ringkasan semua sumber */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'16px', marginBottom:'20px' }}>
            {/* Trend Bar Chart */}
            <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'16px 18px', boxShadow:cBoxShadow }}>
              <div style={{ fontWeight:700, fontSize:'13px', color:cTextPrimary, marginBottom:'14px' }}>
                <i className="fas fa-chart-bar" style={{ marginRight:'6px', color:SSK_THEME[laporanSumber].color }} />
                Trend Realisasi Keuangan per Bulan
              </div>
              {d.trend.length === 0 ? (
                <div style={{ padding:'24px', textAlign:'center', color:cTextSub, fontSize:'12px' }}>Belum ada data trend.</div>
              ) : (
                <div style={{ display:'flex', gap:'6px', alignItems:'flex-end', height:'140px' }}>
                  {CRR_BULAN_LABELS.map((_, i) => {
                    const t = d.trend.find(x => x.bulan === i+1);
                    const val = t?.real_keuangan ?? 0;
                    const maxVal = Math.max(...d.trend.map(x => x.real_keuangan), 1);
                    const pct = (val / maxVal) * 100;
                    return (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                        <div style={{ fontSize:'9px', color:cTextSub, fontWeight:600 }}>{val>0?fmtNum(Math.round(val/1e6))+'jt':''}</div>
                        <div style={{ width:'100%', height:`${Math.max(pct,2)}%`, background: val>0 ? SSK_THEME[laporanSumber].grad : cTrackBg, borderRadius:'4px 4px 0 0', transition:'height .4s' }} />
                        <div style={{ fontSize:'9px', color:cTextSub, fontWeight:600 }}>{MONTH_SHORT[i]}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ringkasan semua sumber */}
            <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'16px 18px', boxShadow:cBoxShadow }}>
              <div style={{ fontWeight:700, fontSize:'13px', color:cTextPrimary, marginBottom:'12px' }}>
                <i className="fas fa-layer-group" style={{ marginRight:'6px', color:cTextSubAlt }} />
                Serapan per Sumber
              </div>
              {laporanAll.length === 0 ? (
                <div style={{ fontSize:'12px', color:cTextSub }}>Memuat...</div>
              ) : (
                SUMBER_LIST.map(s => {
                  const ld = laporanAll.find(x => x.sumber === s);
                  const pct = ld?.pct_serapan ?? 0;
                  return (
                    <div key={s} style={{ marginBottom:'10px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', marginBottom:'3px' }}>
                        <span style={{ fontWeight:700, color:SSK_THEME[s].color }}>{s}</span>
                        <span style={{ fontWeight:600, color:cTextSub }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height:'7px', background:cTrackBg, borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:SSK_THEME[s].grad, borderRadius:'99px', transition:'width .5s' }} />
                      </div>
                      <div style={{ fontSize:'10px', color:cTextSub, marginTop:'2px' }}>{fmtRp(ld?.total_real_keuangan??0)} / {fmtRp(ld?.total_pagu??0)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tabel trend detail */}
          <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflow:'hidden', boxShadow:cBoxShadow }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${cBorder}`, fontWeight:700, fontSize:'13px', color:cTextPrimary }}>
              <i className="fas fa-table" style={{ marginRight:'6px', color:cTextSubAlt }} />
              Detail Trend Bulanan — {laporanSumber}
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                <thead>
                  <tr style={{ background:cTableHeadBg }}>
                    {['No','Bulan','Real Keuangan','Akum Keuangan','Akum % Keuangan','Real Fisik','Akum % Fisik'].map(h => (
                      <th key={h} style={{ padding:'9px 12px', borderBottom: isLight ? `2px solid ${cBorder}` : '2px solid #cbd5e1', fontWeight:700, fontSize:'11px', textTransform:'uppercase', color: isLight ? '#5B21B6' : '#E6F1FB', textAlign: ['No'].includes(h)?'center':'right', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRR_BULAN_LABELS.map((bulanLabel, i) => {
                    const t = d.trend.find(x => x.bulan === i+1);
                    const isEmpty = !t;
                    return (
                      <tr key={i} style={{ background: isEmpty ? (isLight?'rgba(139,92,246,.03)':'rgba(4,44,83,.3)') : i%2===0?cRowEven:cRowOdd, opacity: isEmpty?.6:1 }}>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'center', color:cTextSub }}>{i+1}</td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', fontWeight:700, color: isEmpty ? (isLight?'#9CA3AF':'#94a3b8') : SSK_THEME[laporanSumber].color }}>{bulanLabel}</td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'right', color:cTextPrimary, fontWeight:600 }}>{isEmpty?'-':fmtRp(t.real_keuangan)}</td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'right', color:cTextSub }}>{isEmpty?'-':fmtRp(t.akum_keuangan)}</td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'right' }}>
                          {isEmpty ? '-' : (
                            <span style={{ fontWeight:700, color: t.akum_pct_keuangan>=80?'#16a34a':t.akum_pct_keuangan>=50?'#f59e0b':'#dc2626' }}>
                              {t.akum_pct_keuangan.toFixed(2)}%
                            </span>
                          )}
                        </td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'right', color:cTextSub }}>{isEmpty?'-':fmtRp(t.real_fisik)}</td>
                        <td style={{ padding:'7px 12px', borderBottom: isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)', textAlign:'right' }}>
                          {isEmpty ? '-' : (
                            <span style={{ fontWeight:700, color: t.akum_pct_fisik>=80?'#16a34a':t.akum_pct_fisik>=50?'#f59e0b':'#dc2626' }}>
                              {t.akum_pct_fisik.toFixed(2)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr style={{ background:cTotalRowBg, fontWeight:700 }}>
                    <td colSpan={2} style={{ padding:'8px 12px', borderTop:`2px solid ${cBorder}`, color:cTextPrimary }}>TOTAL</td>
                    <td style={{ padding:'8px 12px', borderTop:`2px solid ${cBorder}`, textAlign:'right', color:cTextPrimary }}>{fmtRp(d.total_real_keuangan)}</td>
                    <td style={{ padding:'8px 12px', borderTop:`2px solid ${cBorder}`, textAlign:'right', color:cTextSub }}>—</td>
                    <td style={{ padding:'8px 12px', borderTop: isLight ? `2px solid ${cBorder}` : '2px solid #cbd5e1', textAlign:'right', color: d.pct_serapan>=80?'#16a34a':d.pct_serapan>=50?'#f59e0b':'#dc2626' }}>{d.pct_serapan.toFixed(2)}%</td>
                    <td style={{ padding:'8px 12px', borderTop:`2px solid ${cBorder}`, textAlign:'right', color:cTextPrimary }}>{fmtRp(d.total_real_fisik)}</td>
                    <td style={{ padding:'8px 12px', borderTop: isLight ? `2px solid ${cBorder}` : '2px solid #cbd5e1', textAlign:'right', color: d.pct_fisik>=80?'#16a34a':d.pct_fisik>=50?'#f59e0b':'#dc2626' }}>{d.pct_fisik.toFixed(2)}%</td>
                  </tr>
                  {/* Perbandingan dengan pagu */}
                  <tr style={{ background:cAccentSoft, fontWeight:700, fontSize:'11px' }}>
                    <td colSpan={2} style={{ padding:'8px 12px', color:cAccent }}>PAGU (Rencana)</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:cAccent }}>{fmtRp(d.total_pagu)}</td>
                    <td colSpan={4} style={{ padding:'8px 12px', textAlign:'right', color:cAccent }}>
                      Selisih: {fmtRp(d.total_pagu - d.total_real_keuangan)}
                      <span style={{ marginLeft:'12px', fontSize:'12px', background:d.pct_serapan>=80?'#16a34a':d.pct_serapan>=50?'#f59e0b':'#dc2626', color:'white', padding:'2px 8px', borderRadius:'20px' }}>
                        {d.pct_serapan.toFixed(2)}% terserap
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
