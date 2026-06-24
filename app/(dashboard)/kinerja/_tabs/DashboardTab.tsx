'use client';
// ─── PRIMA E-Anggaran — Dashboard Tab ──────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderDashboardPanel (line 1022-1226).
// State `kpi` + `loadingKpi` + `fetchKpi` hanya dipakai panel ini → dipindah
// ke lokal (no shared lift). Props minimal: hanya `tahun` dari shell.

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Wallet, Coins, Percent, List, Database, CalendarDays, RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { useAbortableEffect } from '@/lib/shared/hooks';
import { KpiSkeleton } from '@/components/ui/table-skeleton';
import { fmtRp } from '@/lib/shared/utils';
import type { KpiData } from '../_types';
import { SUMBER_LIST, SSK_THEME } from '../_utils';
import BerandaCharts from '@/components/kinerja/BerandaCharts';
import { uiTheme } from '@/lib/theme';

interface Props {
  tahun: string;
  isLight?: boolean;
}

export default function DashboardTab({ tahun, isLight = false }: Props) {
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceAlt  = isLight ? 'linear-gradient(135deg, #FAFAFA 0%, #F3F4F6 100%)' : 'linear-gradient(135deg, #042C53 0%, #06376B 100%)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cAccent      = isLight ? '#7C3AED' : '#A78BFA';
  const cLegendBg    = isLight ? 'rgba(139,92,246,.04)' : 'rgba(4,44,83,.6)';
  const cLegendBorder= isLight ? 'rgba(139,92,246,.15)' : 'rgba(12,68,124,.6)';
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);

  // NEW-1 (BUG-W3 follow-up): fetchJson untuk dapat error handling
  // (network/HTTP/JSON parse) + surface server message.
  const fetchKpi = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/dashboard?tahun=${tahun}`);
      if (d.ok) setKpi((d as unknown as { kpi: KpiData }).kpi);
      else toast.error(d.message || 'Gagal memuat dashboard');
    } finally { setLoadingKpi(false); }
  }, [tahun]);

  // O8: useAbortableEffect cegah stale data saat user ganti tahun cepat.
  // fetchKpi callback tetap untuk tombol Refresh manual.
  useAbortableEffect(async (signal) => {
    setLoadingKpi(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/dashboard?tahun=${tahun}`, { signal });
      if (signal.aborted) return;
      if (d.ok) setKpi((d as unknown as { kpi: KpiData }).kpi);
      else toast.error(d.message || 'Gagal memuat dashboard');
    } finally { if (!signal.aborted) setLoadingKpi(false); }
  }, [tahun]);
  void fetchKpi; // tetap di-export untuk tombol Refresh manual

  const pct = kpi?.pct_serapan??0;
  const kpiCards = [
    { label:'Total Pagu',          value: fmtRp(kpi?.total_pagu??0),                     sub:'Anggaran',     Icon: Wallet,
      bg:    isLight ? 'linear-gradient(135deg,#DBEAFE,#BFDBFE)' : 'linear-gradient(135deg,rgba(59,130,246,.22),rgba(37,99,235,.12))',
      color: isLight ? '#1E40AF' : '#93C5FD',
      iconBg: isLight ? '#3B82F6' : 'rgba(59,130,246,.35)' },
    { label:'Realisasi Keuangan',  value: fmtRp(kpi?.total_real_keuangan??0),            sub:'Total Diserap',Icon: Coins,
      bg:    isLight ? 'linear-gradient(135deg,#D1FAE5,#A7F3D0)' : 'linear-gradient(135deg,rgba(16,185,129,.22),rgba(5,150,105,.12))',
      color: isLight ? '#065F46' : '#6EE7B7',
      iconBg: isLight ? '#10B981' : 'rgba(16,185,129,.35)' },
    { label:'Serapan Anggaran',    value: pct.toFixed(2)+'%',                            sub:'Keuangan',     Icon: Percent,
      bg:    pct>=80 ? (isLight?'linear-gradient(135deg,#D1FAE5,#A7F3D0)':'linear-gradient(135deg,rgba(16,185,129,.22),rgba(5,150,105,.12))')
           : pct>=50 ? (isLight?'linear-gradient(135deg,#FEF3C7,#FDE68A)':'linear-gradient(135deg,rgba(245,158,11,.22),rgba(217,119,6,.12))')
                     : (isLight?'linear-gradient(135deg,#FEE2E2,#FECACA)':'linear-gradient(135deg,rgba(239,68,68,.22),rgba(220,38,38,.12))'),
      color: pct>=80 ? (isLight?'#065F46':'#6EE7B7')
           : pct>=50 ? (isLight?'#92400E':'#FCD34D')
                     : (isLight?'#991B1B':'#FCA5A5'),
      iconBg: pct>=80 ? (isLight?'#10B981':'rgba(16,185,129,.35)')
            : pct>=50 ? (isLight?'#F59E0B':'rgba(245,158,11,.35)')
                      : (isLight?'#EF4444':'rgba(239,68,68,.35)') },
    { label:'Item SSK',            value: String(kpi?.total_ssk_rows??0),                sub:'Baris RKO',    Icon: List,
      bg:    isLight ? 'linear-gradient(135deg,#EDE9FE,#DDD6FE)' : 'linear-gradient(135deg,rgba(139,92,246,.22),rgba(124,58,237,.12))',
      color: isLight ? '#5B21B6' : '#C4B5FD',
      iconBg: isLight ? '#8B5CF6' : 'rgba(139,92,246,.35)' },
    { label:'Rekening',            value: String(kpi?.total_rekening??0),                sub:'Terdaftar',    Icon: Database,
      bg:    isLight ? 'linear-gradient(135deg,#FCE7F3,#FBCFE8)' : 'linear-gradient(135deg,rgba(236,72,153,.22),rgba(219,39,119,.12))',
      color: isLight ? '#9D174D' : '#F9A8D4',
      iconBg: isLight ? '#EC4899' : 'rgba(236,72,153,.35)' },
    { label:'Tahun Aktif',         value: tahun,                                          sub:'Periode',      Icon: CalendarDays,
      bg:    isLight ? 'linear-gradient(135deg,#CFFAFE,#A5F3FC)' : 'linear-gradient(135deg,rgba(6,182,212,.22),rgba(8,145,178,.12))',
      color: isLight ? '#155E75' : '#67E8F9',
      iconBg: isLight ? '#06B6D4' : 'rgba(6,182,212,.35)' },
  ];

  const maxPagu = Math.max(...SUMBER_LIST.map(s => kpi?.pagu_per_sumber?.[s] ?? 0), 1);

  // ─── Pie/Donut chart per Sumber Anggaran ───
  const totalPaguAll = SUMBER_LIST.reduce((sum, s) => sum + (kpi?.pagu_per_sumber?.[s] ?? 0), 0);
  const pieSegments = SUMBER_LIST
    .map(s => ({
      sumber: s,
      label:  SSK_THEME[s].label,
      color:  SSK_THEME[s].color,
      grad:   SSK_THEME[s].grad,
      value:  kpi?.pagu_per_sumber?.[s] ?? 0,
      pct:    totalPaguAll > 0 ? ((kpi?.pagu_per_sumber?.[s] ?? 0) / totalPaguAll) * 100 : 0,
    }))
    .filter(seg => seg.value > 0)
    .sort((a, b) => b.value - a.value);

  const PIE_SIZE   = 220;
  const PIE_R      = 80;
  const PIE_STROKE = 32;
  const PIE_CIRC   = 2 * Math.PI * PIE_R;
  // Pre-compute cumulative offset per segment (avoid mutation during render).
  const pieSegmentsWithOffset = pieSegments.reduce<Array<typeof pieSegments[number] & { offset: number; dash: number; gap: number }>>((acc, seg) => {
    const dash = (seg.pct / 100) * PIE_CIRC;
    const gap  = PIE_CIRC - dash;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    acc.push({ ...seg, offset, dash, gap });
    return acc;
  }, []);

  return (
    <div style={{ padding:'20px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'18px', fontWeight:800, color:cTextPrimary }}>
            <i className="fas fa-th-large" style={{ color:cTextSub, marginRight:'8px' }} />Dashboard E-Anggaran
          </div>
          <div style={{ fontSize:'12px', color:cTextSub, fontWeight:600 }}>RSJD dr. Amino Gondohutomo</div>
        </div>
        <PrimaButton variant="purple" iconLeft={<RefreshCw size={14} className={loadingKpi ? 'animate-spin' : ''} />}
          onClick={fetchKpi} disabled={loadingKpi}>
          Refresh
        </PrimaButton>
      </div>

      {/* KPI Cards — O9 skeleton saat loading initial */}
      {loadingKpi && !kpi ? (
        <div style={{ marginBottom:'20px' }}><KpiSkeleton count={6} /></div>
      ) : (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'20px' }}>
        {kpiCards.map(c => (
          <div key={c.label} style={{ borderRadius:'14px', padding:'16px 18px', backgroundImage:c.bg, border: isLight ? '1px solid rgba(0,0,0,.05)' : '1px solid rgba(255,255,255,.08)', boxShadow: isLight ? '0 6px 18px rgba(0,0,0,.08)' : '0 6px 18px rgba(0,0,0,.25)', color:c.color }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', opacity: isLight ? 1 : .9 }}>{c.label}</div>
                <div style={{ fontSize:'20px', fontWeight:800, margin:'4px 0', lineHeight:1.2 }}>{c.value}</div>
                <div style={{ fontSize:'11px', opacity: isLight ? .85 : .75 }}>{c.sub}</div>
              </div>
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', backgroundColor: c.iconBg, display:'flex', alignItems:'center', justifyContent:'center', boxShadow: isLight ? '0 4px 12px rgba(0,0,0,.15)' : 'none' }}>
                <c.Icon size={20} color={isLight ? '#FFFFFF' : c.color} strokeWidth={2.2} />
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Donut + Gauge side-by-side */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'14px', marginBottom:'14px' }}>
      {/* Donut Chart — Distribusi Pagu per Sumber Anggaran */}
      <div style={{
        background:cSurfaceAlt,
        border:`1px solid ${cBorder}`, borderRadius:'14px', padding:'20px 22px',
        boxShadow: isLight ? '0 8px 24px rgba(0,0,0,.06)' : '0 8px 24px rgba(0,0,0,.35)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <div style={{ fontWeight:800, fontSize:'14px', color:cTextPrimary, letterSpacing:'.02em' }}>
            <i className="fas fa-chart-pie" style={{ marginRight:'8px', color:cAccent }} />
            Distribusi Pagu per Sumber Anggaran
          </div>
          <div style={{ fontSize:'11px', fontWeight:600, color:cTextSub }}>
            Tahun {tahun}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:`${PIE_SIZE + 40}px 1fr`, gap:'24px', alignItems:'center' }}>
          {/* SVG Donut */}
          <div style={{ position:'relative', width:PIE_SIZE, height:PIE_SIZE, margin:'0 auto' }}>
            {totalPaguAll > 0 ? (
              <>
                <svg width={PIE_SIZE} height={PIE_SIZE} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} style={{ filter:'drop-shadow(0 4px 12px rgba(0,0,0,.4))' }}>
                  <circle cx={PIE_SIZE/2} cy={PIE_SIZE/2} r={PIE_R} fill="none"
                    stroke="rgba(12,68,124,.4)" strokeWidth={PIE_STROKE} />
                  {pieSegmentsWithOffset.map((seg) => (
                    <circle
                      key={seg.sumber}
                      cx={PIE_SIZE/2} cy={PIE_SIZE/2} r={PIE_R}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={PIE_STROKE}
                      strokeDasharray={`${seg.dash} ${seg.gap}`}
                      strokeDashoffset={-seg.offset}
                      strokeLinecap="butt"
                      transform={`rotate(-90 ${PIE_SIZE/2} ${PIE_SIZE/2})`}
                      style={{ transition:'stroke-dasharray .6s ease, stroke-dashoffset .6s ease' }}
                    >
                      <title>{`${seg.label}: ${fmtRp(seg.value)} (${seg.pct.toFixed(1)}%)`}</title>
                    </circle>
                  ))}
                </svg>
                <div style={{
                  position:'absolute', inset:0, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', pointerEvents:'none',
                }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:cTextSub, textTransform:'uppercase', letterSpacing:'.08em' }}>
                    Total Pagu
                  </div>
                  <div style={{ fontSize:'15px', fontWeight:800, color:cTextPrimary, marginTop:'4px', textAlign:'center', lineHeight:1.2 }}>
                    {fmtRp(totalPaguAll)}
                  </div>
                  <div style={{ fontSize:'10px', fontWeight:600, color:cAccent, marginTop:'4px' }}>
                    {pieSegments.length} sumber
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                width:PIE_SIZE, height:PIE_SIZE, borderRadius:'50%',
                border:`${PIE_STROKE}px solid rgba(12,68,124,.4)`,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                boxSizing:'border-box',
              }}>
                <i className="fas fa-chart-pie" style={{ fontSize:'28px', color:'#475569', marginBottom:'6px' }} />
                <div style={{ fontSize:'11px', color:'#85B7EB', fontWeight:600 }}>Belum ada data pagu</div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {(pieSegments.length > 0 ? pieSegments : SUMBER_LIST.map(s => ({
              sumber: s, label: SSK_THEME[s].label, color: SSK_THEME[s].color, grad: SSK_THEME[s].grad, value: 0, pct: 0,
            }))).map(seg => (
              <div key={seg.sumber} style={{
                display:'grid', gridTemplateColumns:'14px 1fr auto auto', gap:'10px', alignItems:'center',
                padding:'8px 12px', borderRadius:'10px',
                background:cLegendBg, border:`1px solid ${cLegendBorder}`,
                transition:'background .18s, border-color .18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(139,92,246,.10)' : 'rgba(6,55,107,.85)'; e.currentTarget.style.borderColor = seg.color; }}
              onMouseLeave={e => { e.currentTarget.style.background = cLegendBg; e.currentTarget.style.borderColor = cLegendBorder; }}
              >
                <div style={{ width:'14px', height:'14px', borderRadius:'4px', background:seg.grad, boxShadow:`0 0 8px ${seg.color}66` }} />
                <div style={{ fontSize:'12px', fontWeight:700, color:cTextPrimary }}>{seg.label}</div>
                <div style={{ fontSize:'12px', fontWeight:600, color:cTextSubAlt, textAlign:'right' }}>{fmtRp(seg.value)}</div>
                <div style={{
                  fontSize:'11px', fontWeight:800, color:seg.color,
                  background:`${seg.color}22`, padding:'3px 8px', borderRadius:'6px', minWidth:'48px', textAlign:'center',
                }}>
                  {seg.pct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gauge Capaian Serapan — sejajar donut */}
      {(() => {
        const totalPaguGauge = kpi?.total_pagu ?? 0;
        const totalRealGauge = kpi?.total_real_keuangan ?? 0;
        const pct = totalPaguGauge > 0 ? Math.round((totalRealGauge / totalPaguGauge) * 1000) / 10 : 0;
        const gaugeColor = pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';
        const cTextPrim = cTextPrimary;
        const GAUGE_SIZE = 180;
        const GAUGE_STROKE = 22;
        const GAUGE_R = (GAUGE_SIZE - GAUGE_STROKE) / 2;
        const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;
        const dash = Math.min(pct, 100) / 100 * GAUGE_CIRC;
        return (
          <div style={{
            background:cSurfaceAlt,
            border:`1px solid ${cBorder}`, borderRadius:'14px', padding:'20px 22px',
            boxShadow: isLight ? '0 8px 24px rgba(0,0,0,.06)' : '0 8px 24px rgba(0,0,0,.35)',
            display:'flex', flexDirection:'column',
          }}>
            <div style={{ fontWeight:800, fontSize:'14px', color:cTextPrim, letterSpacing:'.02em', marginBottom:'12px' }}>
              <i className="fas fa-bullseye" style={{ marginRight:'8px', color:gaugeColor }} />
              Capaian Serapan Total
            </div>
            <div style={{ position:'relative', width:GAUGE_SIZE, height:GAUGE_SIZE, margin:'0 auto' }}>
              <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
                <circle cx={GAUGE_SIZE/2} cy={GAUGE_SIZE/2} r={GAUGE_R} fill="none"
                  stroke={isLight ? 'rgba(0,0,0,.08)' : 'rgba(12,68,124,.4)'} strokeWidth={GAUGE_STROKE} />
                <circle cx={GAUGE_SIZE/2} cy={GAUGE_SIZE/2} r={GAUGE_R} fill="none"
                  stroke={gaugeColor} strokeWidth={GAUGE_STROKE}
                  strokeDasharray={`${dash} ${GAUGE_CIRC - dash}`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${GAUGE_SIZE/2} ${GAUGE_SIZE/2})`}
                  style={{ transition:'stroke-dasharray .6s ease' }} />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontSize:'28px', fontWeight:800, color:gaugeColor, lineHeight:1 }}>{pct.toFixed(1)}%</div>
                <div style={{ fontSize:'9px', fontWeight:700, color:cTextSub, marginTop:'4px', textTransform:'uppercase', letterSpacing:'.06em' }}>
                  Realisasi vs Pagu
                </div>
              </div>
            </div>
            <div style={{ marginTop:'12px', textAlign:'center', fontSize:'11px', color:cTextSub, lineHeight:1.7 }}>
              <div>Pagu: <strong style={{ color:cTextPrim }}>{fmtRp(totalPaguGauge)}</strong></div>
              <div>Realisasi: <strong style={{ color:gaugeColor }}>{fmtRp(totalRealGauge)}</strong></div>
            </div>
          </div>
        );
      })()}
      </div>

      {/* ─── Charts Beranda — di bawah KPI + Donut ──────────────────────────── */}
      <BerandaCharts tahun={tahun} isLight={isLight} />

      {/* Pagu per Sumber + Ringkasan — selalu di paling bawah */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginTop:'14px' }}>
        <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'16px 18px', boxShadow: isLight ? '0 4px 16px rgba(0,0,0,.06)' : '0 4px 16px rgba(0,0,0,.3)' }}>
          <div style={{ fontWeight:700, fontSize:'13px', color:cTextPrimary, marginBottom:'14px' }}>
            <i className="fas fa-chart-bar" style={{ marginRight:'6px', color:cTextSubAlt }} />Pagu per Sumber
          </div>
          {SUMBER_LIST.map(s => {
            const pagu = kpi?.pagu_per_sumber?.[s] ?? 0;
            const pct  = maxPagu ? (pagu / maxPagu) * 100 : 0;
            return (
              <div key={s} style={{ marginBottom:'10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', marginBottom:'3px' }}>
                  <span style={{ fontWeight:700, color:SSK_THEME[s].color }}>{s}</span>
                  <span style={{ fontWeight:600, color:cTextSub }}>{fmtRp(pagu)}</span>
                </div>
                <div style={{ height:'7px', background: isLight ? 'rgba(139,92,246,.10)' : 'rgba(12,68,124,.3)', borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:SSK_THEME[s].grad, borderRadius:'99px', transition:'width .5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'16px 18px', boxShadow: isLight ? '0 4px 16px rgba(0,0,0,.06)' : '0 4px 16px rgba(0,0,0,.3)' }}>
          <div style={{ fontWeight:700, fontSize:'13px', color:cTextPrimary, marginBottom:'14px' }}>
            <i className="fas fa-info-circle" style={{ marginRight:'6px', color:cTextSubAlt }} />Ringkasan
          </div>
          <div style={{ fontSize:'12px', color:cTextSub, lineHeight:1.8 }}>
            <div>Tahun Anggaran: <strong style={{ color:cTextPrimary }}>{tahun}</strong></div>
            <div>Total Pagu: <strong style={{ color:cTextPrimary }}>{fmtRp(kpi?.total_pagu??0)}</strong></div>
            <div>Total Item SSK: <strong style={{ color:cTextPrimary }}>{kpi?.total_ssk_rows??0} baris</strong></div>
            <div>Total Rekening: <strong style={{ color:cTextPrimary }}>{kpi?.total_rekening??0} rekening</strong></div>
            <div style={{ marginTop:'10px', padding:'8px 10px', background: isLight ? 'rgba(16,185,129,.10)' : 'rgba(29,158,117,.1)', borderRadius:'8px', border: isLight ? '1px solid rgba(16,185,129,.3)' : '1px solid rgba(29,158,117,.3)', color: isLight ? '#047857' : '#6EE7B7', fontSize:'11px' }}>
              <i className="fas fa-check-circle" style={{ marginRight:'4px' }} />
              Realisasi, CRR & Pendapatan tersedia di sidebar kiri.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
