'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  LayoutDashboard, FileText, BarChart3, Building2, ClipboardList, Target,
  ArrowRight, RefreshCw, Home,
} from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { DashboardSummary } from '@/lib/data/dashboard';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialTahun: string;
  initialData: DashboardSummary;
}

const RA_LEVEL_SHORT: Record<string, string> = {
  tujuan: 'Tujuan', sasaran: 'Sasaran', program: 'Program',
  kegiatan: 'Kegiatan', 'sub-kegiatan': 'Sub Keg',
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}
function fmtRpCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `Rp ${(n / 1e12).toFixed(2)} T`;
  if (abs >= 1e9)  return `Rp ${(n / 1e9).toFixed(2)} M`;
  if (abs >= 1e6)  return `Rp ${(n / 1e6).toFixed(1)} jt`;
  if (abs >= 1e3)  return `Rp ${(n / 1e3).toFixed(0)} rb`;
  return `Rp ${fmtNum(n)}`;
}

export default function DashboardClient({ username, role, themePreference, initialTahun, initialData }: Props) {
  const router = useRouter();
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2].map(String);

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  const [tahun, setTahun]   = useState(initialTahun);
  const [data, setData]     = useState<DashboardSummary>(initialData);
  const [loading, setLoading] = useState(false);
  const isLight = currentTheme === 'light';

  useEffect(() => {
    if (themePreference === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    document.cookie = `prima_theme=${themePreference};path=/;max-age=31536000;SameSite=Lax`;
  }, [themePreference]);

  const load = useCallback(async (th: string) => {
    setLoading(true);
    try {
      const json = await fetchJson<DashboardSummary>(`/api/dashboard?tahun=${th}`);
      if (json.ok && json.data) setData(json.data);
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, []);

  function changeYear(th: string) {
    setTahun(th);
    void load(th);
  }

  const open = (href: string) => router.push(href);

  const navItems = [
    { icon: <Home size={18} />,          label: 'Menu',      onClick: () => open('/menu') },
    { icon: <FileText size={18} />,       label: 'Usulan',    onClick: () => open('/dashboard/usulan') },
    { icon: <BarChart3 size={18} />,      label: 'Anggaran',  onClick: () => open('/dashboard/eanggaran') },
    { icon: <Building2 size={18} />,      label: 'BLUD',      onClick: () => open('/dashboard/blud') },
    { icon: <ClipboardList size={18} />,  label: 'Renaksi',   onClick: () => open('/dashboard/renaksi') },
    { icon: <Target size={18} />,         label: 'Realisasi', onClick: () => open('/dashboard/realisasi-kinerja') },
  ];

  const u  = data.usulan;
  const ea = data.eanggaran;
  const bl = data.blud;
  const rn = data.renaksi;
  const rk = data.realisasiKinerja;

  const usulanChart = u.chartBidang.map(b => ({ name: b.sub_bidang, value: b.cnt }));
  const eaChart     = ea.pagu_per_sumber.map(s => ({ name: s.sumber, value: s.pagu }));
  const renaksiChart = rn.per_level.map(p => ({ name: RA_LEVEL_SHORT[p.level] ?? p.level, value: p.count }));
  const realChart    = rk.per_level.map(p => ({ name: RA_LEVEL_SHORT[p.level] ?? p.level, value: p.pct }));

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes fade-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fade-up .4s ease both; }

        .recharts-wrapper text, .recharts-legend-item-text, .recharts-pie-label-text {
          font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif !important;
        }

        .dash-body {
          min-height: 100vh; background: #020F1C;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif;
          color: #E6F1FB; padding-bottom: 96px;
        }
        .dash-header {
          position: sticky; top: 0; z-index: 100; height: 60px;
          display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
          background: rgba(4,44,83,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid #0C447C;
        }
        .dash-brand { display: flex; align-items: center; gap: 10px; }
        .dash-brand-icon {
          width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg,#185FA5,#378ADD); border: 1.5px solid rgba(55,138,221,0.5);
        }
        .dash-wordmark { font-size: 15px; font-weight: 900; letter-spacing: -.3px; color: #E6F1FB; }
        .dash-sub { font-size: 9.5px; font-weight: 500; color: #85B7EB; }

        .dash-main { max-width: 1180px; margin: 0 auto; padding: 24px; }
        .dash-toprow { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
        .dash-title { font-size: 23px; font-weight: 900; letter-spacing: -.5px; }
        .dash-title span { color: #378ADD; }
        .dash-caption { font-size: 13px; color: #85B7EB; margin-top: 2px; }

        .dash-yearbar { display: flex; align-items: center; gap: 8px; }
        .year-pill {
          font-size: 12.5px; font-weight: 700; padding: 6px 14px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid #0C447C; background: #042C53; color: #B5D4F4; transition: all .15s;
          font-family: 'JetBrains Mono', monospace;
        }
        .year-pill:hover { border-color: #378ADD; color: #E6F1FB; }
        .year-pill.active { background: #378ADD; border-color: #378ADD; color: #fff; }

        .dash-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
        @media (max-width: 880px) { .dash-grid { grid-template-columns: 1fr; } }

        .widget {
          --wc: #378ADD;
          background: #042C53; border: 1px solid #0C447C; border-radius: 12px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 4px 18px rgba(0,0,0,.28);
        }
        .widget-head {
          display: flex; align-items: center; gap: 11px; padding: 14px 16px;
          border-bottom: 1px solid #0C447C; border-left: 4px solid var(--wc);
        }
        .widget-ico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--wc) 18%, #042C53); color: var(--wc); flex-shrink: 0; }
        .widget-title { font-size: 14.5px; font-weight: 800; color: #E6F1FB; line-height: 1.1; }
        .widget-tag { font-size: 10px; font-weight: 600; color: #85B7EB; text-transform: uppercase; letter-spacing: .08em; }

        .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #0C447C; }
        .kpi { background: #042C53; padding: 11px 12px; text-align: center; }
        .kpi-val { font-size: 17px; font-weight: 900; color: #E6F1FB; font-family: 'JetBrains Mono', monospace; line-height: 1.1; }
        .kpi-val.sm { font-size: 13.5px; }
        .kpi-lbl { font-size: 9.5px; color: #85B7EB; font-weight: 600; margin-top: 3px; text-transform: uppercase; letter-spacing: .04em; }

        .widget-chart { padding: 10px 8px 4px; height: 132px; }
        .widget-foot { padding: 12px 16px 14px; margin-top: auto; }

        .serap-wrap { padding: 14px 16px 4px; }
        .serap-track { height: 12px; border-radius: 99px; background: #0C447C; overflow: hidden; }
        .serap-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg,#1D9E75,#2BD46A); transition: width .5s; }
        .serap-meta { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #85B7EB; font-family: 'JetBrains Mono', monospace; }

        /* ── Light theme ── */
        [data-theme="light"] .dash-body { background-color:#FAFAFB; color:#0F0F12;
          background-image: linear-gradient(rgba(15,15,18,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,15,18,0.025) 1px, transparent 1px); }
        [data-theme="light"] .dash-header { background: rgba(250,250,250,.93); border-bottom-color:#E5E5EA; }
        [data-theme="light"] .dash-wordmark { color:#0F0F12; }
        [data-theme="light"] .dash-sub, [data-theme="light"] .dash-caption, [data-theme="light"] .widget-tag, [data-theme="light"] .kpi-lbl { color:#6B7280; }
        [data-theme="light"] .dash-title span { color:#7C3AED; }
        [data-theme="light"] .year-pill { background:#fff; border-color:#E5E5EA; color:#374151; }
        [data-theme="light"] .year-pill:hover { border-color:#7C5CFC; color:#0F0F12; }
        [data-theme="light"] .year-pill.active { background:#7C5CFC; border-color:#7C5CFC; color:#fff; }
        [data-theme="light"] .widget { background:#fff; border-color:#E5E5EA; box-shadow:0 4px 18px rgba(15,15,18,.07); }
        [data-theme="light"] .widget-head { border-bottom-color:#E5E5EA; }
        [data-theme="light"] .widget-title, [data-theme="light"] .kpi-val { color:#0F0F12; }
        [data-theme="light"] .kpi-row { background:#E5E5EA; }
        [data-theme="light"] .kpi { background:#fff; }
        [data-theme="light"] .serap-track { background:#E5E5EA; }
        [data-theme="light"] .serap-meta { color:#6B7280; }
      `}</style>

      <div className="dash-body">
        <header className="dash-header">
          <div className="dash-brand">
            <div className="dash-brand-icon"><LayoutDashboard size={18} color="#fff" /></div>
            <div>
              <div className="dash-wordmark">PRIMA · Dashboard</div>
              <div className="dash-sub">Ringkasan lintas modul</div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />
          </div>
          <UserBadge username={username} role={role} isLight={isLight} />
        </header>

        <main className="dash-main">
          <div className="dash-toprow fade-up">
            <div>
              <h1 className="dash-title">Ringkasan <span>Lintas Modul</span></h1>
              <p className="dash-caption">Pantau Usulan, E-Anggaran, BLUD, Renaksi &amp; Realisasi Kinerja dalam satu layar · TA {tahun}</p>
            </div>
            <div className="dash-yearbar">
              {loading && <RefreshCw size={15} className="spin" color={isLight ? '#7C5CFC' : '#378ADD'} style={{ animation: 'spin 1s linear infinite' }} />}
              {years.map(y => (
                <button key={y} className={`year-pill${y === tahun ? ' active' : ''}`} onClick={() => changeYear(y)}>{y}</button>
              ))}
            </div>
          </div>

          <div className="dash-grid">
            {/* ── Usulan ── */}
            <div className="widget fade-up" style={{ '--wc': '#EF9F27' } as React.CSSProperties}>
              <div className="widget-head">
                <div className="widget-ico"><FileText size={20} /></div>
                <div><div className="widget-title">Usulan Kebutuhan</div><div className="widget-tag">Pengajuan &amp; persetujuan</div></div>
              </div>
              <div className="kpi-row">
                <div className="kpi"><div className="kpi-val">{fmtNum(u.total)}</div><div className="kpi-lbl">Total Item</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(u.disetujui)}</div><div className="kpi-lbl">Disetujui</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(u.menunggu_admin)}</div><div className="kpi-lbl">Menunggu</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(u.proses)}</div><div className="kpi-lbl">Proses</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(u.ditolak)}</div><div className="kpi-lbl">Ditolak</div></div>
                <div className="kpi"><div className="kpi-val sm">{fmtRpCompact(u.nilai_disetujui)}</div><div className="kpi-lbl">Nilai Setuju</div></div>
              </div>
              <div className="widget-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usulanChart} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: isLight ? '#6B7280' : '#85B7EB' }} interval={0} angle={-18} textAnchor="end" height={34} />
                    <Tooltip cursor={{ fill: 'rgba(239,159,39,.1)' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#EF9F27" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="widget-foot">
                <PrimaButton variant="warning" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open('/dashboard/usulan')}>Lihat Detail</PrimaButton>
              </div>
            </div>

            {/* ── E-Anggaran ── */}
            <div className="widget fade-up" style={{ '--wc': '#378ADD' } as React.CSSProperties}>
              <div className="widget-head">
                <div className="widget-ico"><BarChart3 size={20} /></div>
                <div><div className="widget-title">E-Anggaran</div><div className="widget-tag">E-Controlling anggaran</div></div>
              </div>
              <div className="kpi-row">
                <div className="kpi"><div className="kpi-val sm">{fmtRpCompact(ea.total_pagu)}</div><div className="kpi-lbl">Total Pagu</div></div>
                <div className="kpi"><div className="kpi-val sm">{fmtRpCompact(ea.total_real_keuangan)}</div><div className="kpi-lbl">Realisasi</div></div>
                <div className="kpi"><div className="kpi-val">{ea.pct_serapan}%</div><div className="kpi-lbl">Serapan</div></div>
              </div>
              <div className="serap-wrap">
                <div className="serap-track"><div className="serap-fill" style={{ width: `${Math.min(ea.pct_serapan, 100)}%` }} /></div>
                <div className="serap-meta"><span>{fmtNum(ea.total_ssk_rows)} baris SSK</span><span>{fmtNum(ea.total_rekening)} rekening</span></div>
              </div>
              <div className="widget-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eaChart} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: isLight ? '#6B7280' : '#85B7EB' }} interval={0} angle={-18} textAnchor="end" height={34} />
                    <Tooltip cursor={{ fill: 'rgba(55,138,221,.1)' }} formatter={(v) => fmtRpCompact(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#378ADD" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="widget-foot">
                <PrimaButton variant="success" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open('/dashboard/eanggaran')}>Lihat Detail</PrimaButton>
              </div>
            </div>

            {/* ── BLUD ── */}
            <div className="widget fade-up" style={{ '--wc': '#1D9E75' } as React.CSSProperties}>
              <div className="widget-head">
                <div className="widget-ico"><Building2 size={20} /></div>
                <div><div className="widget-title">BLUD</div><div className="widget-tag">DPA versi {bl.versi_tanggal ?? '—'}</div></div>
              </div>
              <div className="kpi-row">
                <div className="kpi"><div className="kpi-val sm">{fmtRpCompact(bl.total_pagu)}</div><div className="kpi-lbl">Total Pagu</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(bl.leaf_baris)}</div><div className="kpi-lbl">Rincian</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(bl.total_baris)}</div><div className="kpi-lbl">Total Baris</div></div>
              </div>
              <div className="serap-wrap">
                <div className="serap-track"><div className="serap-fill" style={{ width: `${bl.total_baris > 0 ? Math.round((bl.leaf_baris / bl.total_baris) * 100) : 0}%`, background: 'linear-gradient(90deg,#1D9E75,#2BD46A)' }} /></div>
                <div className="serap-meta"><span>Rincian belanja</span><span>{bl.total_baris > 0 ? Math.round((bl.leaf_baris / bl.total_baris) * 100) : 0}% dari struktur</span></div>
              </div>
              <div className="widget-foot" style={{ marginTop: 'auto' }}>
                <PrimaButton variant="success" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open('/dashboard/blud')}>Lihat Detail</PrimaButton>
              </div>
            </div>

            {/* ── Renaksi ── */}
            <div className="widget fade-up" style={{ '--wc': '#7C5CFC' } as React.CSSProperties}>
              <div className="widget-head">
                <div className="widget-ico"><ClipboardList size={20} /></div>
                <div><div className="widget-title">Rencana Aksi</div><div className="widget-tag">Indikator kinerja</div></div>
              </div>
              <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div className="kpi"><div className="kpi-val">{fmtNum(rn.total_indikator)}</div><div className="kpi-lbl">Total Indikator</div></div>
                <div className="kpi"><div className="kpi-val">{fmtNum(rn.per_level.reduce((s, p) => s + p.target_terisi, 0))}</div><div className="kpi-lbl">Target Terisi</div></div>
              </div>
              <div className="widget-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={renaksiChart} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: isLight ? '#6B7280' : '#85B7EB' }} interval={0} height={20} />
                    <Tooltip cursor={{ fill: 'rgba(124,92,252,.1)' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#7C5CFC" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="widget-foot">
                <PrimaButton variant="purple" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open('/dashboard/renaksi')}>Lihat Detail</PrimaButton>
              </div>
            </div>

            {/* ── Realisasi Kinerja ── */}
            <div className="widget fade-up" style={{ '--wc': '#1D9E75', gridColumn: '1 / -1' } as React.CSSProperties}>
              <div className="widget-head">
                <div className="widget-ico"><Target size={20} /></div>
                <div><div className="widget-title">Realisasi Kinerja</div><div className="widget-tag">Capaian target vs realisasi</div></div>
              </div>
              <div className="kpi-row">
                <div className="kpi"><div className="kpi-val">{rk.pct_capaian_total}%</div><div className="kpi-lbl">Capaian Total</div></div>
                <div className="kpi"><div className="kpi-val" style={{ color: '#2BD46A' }}>{fmtNum(rk.on_track)}</div><div className="kpi-lbl">Tercapai</div></div>
                <div className="kpi"><div className="kpi-val" style={{ color: '#E24B4A' }}>{fmtNum(rk.lagging)}</div><div className="kpi-lbl">Belum Tercapai</div></div>
              </div>
              <div className="widget-chart" style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={realChart} margin={{ top: 8, right: 10, bottom: 0, left: 6 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#85B7EB' }} interval={0} height={22} />
                    <Tooltip cursor={{ fill: 'rgba(29,158,117,.1)' }} formatter={(v) => `${Number(v)}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                      {realChart.map((d, i) => (
                        <Cell key={i} fill={d.value >= 90 ? '#1D9E75' : d.value >= 60 ? '#EF9F27' : '#E24B4A'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="widget-foot">
                <PrimaButton variant="success" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open('/dashboard/realisasi-kinerja')}>Lihat Detail</PrimaButton>
              </div>
            </div>
          </div>
        </main>

        <FloatingDock nav={navItems} isLight={isLight} />
      </div>
    </>
  );
}
