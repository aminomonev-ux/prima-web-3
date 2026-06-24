'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  FileText, BarChart3, Building2, ClipboardList, Target,
  ArrowLeft, RefreshCw, Home, LayoutDashboard,
} from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { fetchJson } from '@/lib/shared/api';
import type { ModuleDetailData, DashModule } from '@/lib/data/dashboard';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialTahun: string;
  payload: ModuleDetailData;
}

const META: Record<DashModule, { title: string; tag: string; accent: string; icon: typeof FileText }> = {
  'usulan':            { title: 'Usulan Kebutuhan',  tag: 'Pengajuan & persetujuan',     accent: '#EF9F27', icon: FileText },
  'eanggaran':         { title: 'E-Anggaran',        tag: 'E-Controlling anggaran',       accent: '#378ADD', icon: BarChart3 },
  'blud':              { title: 'BLUD',              tag: 'DPA & rincian belanja',        accent: '#1D9E75', icon: Building2 },
  'renaksi':           { title: 'Rencana Aksi',      tag: 'Indikator kinerja per level',  accent: '#7C5CFC', icon: ClipboardList },
  'realisasi-kinerja': { title: 'Realisasi Kinerja', tag: 'Capaian target vs realisasi',  accent: '#1D9E75', icon: Target },
};

const RA_LEVEL_LABEL: Record<string, string> = {
  tujuan: 'Tujuan', sasaran: 'Sasaran', program: 'Program', kegiatan: 'Kegiatan', 'sub-kegiatan': 'Sub Kegiatan',
};
const PIE_COLORS = ['#378ADD', '#EF9F27', '#1D9E75', '#7C5CFC', '#E24B4A', '#EC4899', '#F59E0B', '#10B981'];

function fmtNum(n: number): string { return new Intl.NumberFormat('id-ID').format(n); }
function fmtRpCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `Rp ${(n / 1e12).toFixed(2)} T`;
  if (abs >= 1e9)  return `Rp ${(n / 1e9).toFixed(2)} M`;
  if (abs >= 1e6)  return `Rp ${(n / 1e6).toFixed(1)} jt`;
  if (abs >= 1e3)  return `Rp ${(n / 1e3).toFixed(0)} rb`;
  return `Rp ${fmtNum(n)}`;
}

export default function DashboardDetailClient({ username, role, themePreference, initialTahun, payload }: Props) {
  const router = useRouter();
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2].map(String);

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  const [tahun, setTahun] = useState(initialTahun);
  const [pd, setPd] = useState<ModuleDetailData>(payload);
  const [loading, setLoading] = useState(false);
  const isLight = currentTheme === 'light';
  const modul = pd.modul;
  const meta = META[modul];
  const Icon = meta.icon;

  useEffect(() => {
    if (themePreference === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    document.cookie = `prima_theme=${themePreference};path=/;max-age=31536000;SameSite=Lax`;
  }, [themePreference]);

  const load = useCallback(async (th: string) => {
    setLoading(true);
    try {
      const json = await fetchJson<ModuleDetailData>(`/api/dashboard/${modul}?tahun=${th}`);
      if (json.ok && json.data) setPd(json.data);
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [modul]);

  function changeYear(th: string) { setTahun(th); void load(th); }

  const open = (href: string) => router.push(href);
  const axisTick = { fontSize: 10, fill: isLight ? '#6B7280' : '#85B7EB' };

  const navItems = [
    { icon: <Home size={18} />,          label: 'Menu',      onClick: () => open('/menu') },
    { icon: <LayoutDashboard size={18} />, label: 'Overview', onClick: () => open('/dashboard') },
    { icon: <FileText size={18} />,       label: 'Usulan',    onClick: () => open('/dashboard/usulan'),    current: modul === 'usulan' },
    { icon: <BarChart3 size={18} />,      label: 'Anggaran',  onClick: () => open('/dashboard/eanggaran'), current: modul === 'eanggaran' },
    { icon: <Building2 size={18} />,      label: 'BLUD',      onClick: () => open('/dashboard/blud'),      current: modul === 'blud' },
    { icon: <ClipboardList size={18} />,  label: 'Renaksi',   onClick: () => open('/dashboard/renaksi'),   current: modul === 'renaksi' },
    { icon: <Target size={18} />,         label: 'Realisasi', onClick: () => open('/dashboard/realisasi-kinerja'), current: modul === 'realisasi-kinerja' },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fade-up .4s ease both; }

        .recharts-wrapper text, .recharts-legend-item-text, .recharts-pie-label-text {
          font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif !important;
        }
        .recharts-pie-label-text { font-size: 12px; font-weight: 600; }

        .dd-body { min-height:100vh; background:#020F1C; color:#E6F1FB; padding-bottom:96px;
          font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif;
          background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size:48px 48px; }
        .dd-header { position:sticky; top:0; z-index:100; height:60px; display:flex; align-items:center; justify-content:space-between; padding:0 24px;
          background:rgba(4,44,83,.92); backdrop-filter:blur(20px); border-bottom:1px solid #0C447C; }
        .dd-brand { display:flex; align-items:center; gap:10px; }
        .dd-brand-ico { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; }
        .dd-word { font-size:15px; font-weight:900; letter-spacing:-.3px; }
        .dd-sub { font-size:9.5px; font-weight:500; color:#85B7EB; }
        .dd-main { max-width:1180px; margin:0 auto; padding:22px 24px; }

        .dd-top { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:20px; flex-wrap:wrap; }
        .dd-back { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:#85B7EB; background:#042C53;
          border:1.5px solid #0C447C; border-radius:8px; padding:7px 13px; cursor:pointer; transition:all .15s; }
        .dd-back:hover { border-color:var(--ac); color:#E6F1FB; }
        .dd-title { font-size:21px; font-weight:900; letter-spacing:-.4px; }
        .dd-tag { font-size:12px; color:#85B7EB; }

        .yb { display:flex; align-items:center; gap:7px; }
        .yp { font-size:12px; font-weight:700; padding:6px 13px; border-radius:8px; cursor:pointer; border:1.5px solid #0C447C; background:#042C53; color:#B5D4F4; font-family:'JetBrains Mono',monospace; transition:all .15s; }
        .yp:hover { border-color:var(--ac); color:#E6F1FB; }
        .yp.active { background:var(--ac); border-color:var(--ac); color:#fff; }

        .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-bottom:18px; }
        .kc { background:#042C53; border:1px solid #0C447C; border-left:4px solid var(--ac); border-radius:10px; padding:13px 15px; }
        .kc-val { font-size:21px; font-weight:900; color:#E6F1FB; font-family:'JetBrains Mono',monospace; line-height:1.05; }
        .kc-val.sm { font-size:15px; }
        .kc-lbl { font-size:10.5px; color:#85B7EB; font-weight:600; margin-top:4px; text-transform:uppercase; letter-spacing:.04em; }

        .panel-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
        @media (max-width:840px){ .panel-row { grid-template-columns:1fr; } }
        .panel { background:#042C53; border:1px solid #0C447C; border-radius:12px; padding:14px 16px; }
        .panel-h { font-size:12px; font-weight:800; color:#E6F1FB; text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px; }
        .chart-box { height:230px; }

        table.dd-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
        .dd-tbl th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:#85B7EB; font-weight:700; padding:8px 10px; border-bottom:1px solid #0C447C; }
        .dd-tbl td { padding:8px 10px; border-bottom:1px solid rgba(12,68,124,.5); color:#D4E6F8; }
        .dd-tbl td.num, .dd-tbl th.num { text-align:right; font-family:'JetBrains Mono',monospace; }
        .dd-tbl tr:hover td { background:rgba(12,68,124,.25); }

        [data-theme="light"] .dd-body { background-color:#FAFAFB; color:#0F0F12;
          background-image: linear-gradient(rgba(15,15,18,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,15,18,0.025) 1px, transparent 1px); }
        [data-theme="light"] .dd-header { background:rgba(250,250,250,.93); border-bottom-color:#E5E5EA; }
        [data-theme="light"] .dd-sub, [data-theme="light"] .dd-tag, [data-theme="light"] .kc-lbl, [data-theme="light"] .dd-tbl th { color:#6B7280; }
        [data-theme="light"] .dd-back { background:#fff; border-color:#E5E5EA; color:#6B7280; }
        [data-theme="light"] .yp { background:#fff; border-color:#E5E5EA; color:#374151; }
        [data-theme="light"] .kc, [data-theme="light"] .panel { background:#fff; border-color:#E5E5EA; }
        [data-theme="light"] .kc-val, [data-theme="light"] .panel-h, [data-theme="light"] .dd-title, [data-theme="light"] .dd-word { color:#0F0F12; }
        [data-theme="light"] .dd-tbl td { color:#374151; border-bottom-color:#EEF1F5; }
        [data-theme="light"] .dd-tbl tr:hover td { background:#F5F7FA; }
      `}</style>

      <div className="dd-body" style={{ '--ac': meta.accent } as React.CSSProperties}>
        <header className="dd-header">
          <div className="dd-brand">
            <div className="dd-brand-ico" style={{ background: `color-mix(in srgb, ${meta.accent} 22%, #042C53)`, border: `1.5px solid ${meta.accent}` }}>
              <Icon size={18} color={meta.accent} />
            </div>
            <div>
              <div className="dd-word">PRIMA · Dashboard</div>
              <div className="dd-sub">Detail {meta.title}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />
          </div>
          <UserBadge username={username} role={role} isLight={isLight} />
        </header>

        <main className="dd-main">
          <div className="dd-top fade-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button className="dd-back" onClick={() => open('/dashboard')}><ArrowLeft size={15} /> Overview</button>
              <div>
                <div className="dd-title">{meta.title}</div>
                <div className="dd-tag">{meta.tag} · TA {tahun}</div>
              </div>
            </div>
            <div className="yb">
              {loading && <RefreshCw size={15} color={meta.accent} style={{ animation: 'spin 1s linear infinite' }} />}
              {years.map(y => <button key={y} className={`yp${y === tahun ? ' active' : ''}`} onClick={() => changeYear(y)}>{y}</button>)}
            </div>
          </div>

          {pd.modul === 'usulan' && (() => {
            const d = pd.data;
            return (
              <>
                <div className="kpi-grid fade-up">
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.total)}</div><div className="kc-lbl">Total Item</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.disetujui)}</div><div className="kc-lbl">Disetujui</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.proses)}</div><div className="kc-lbl">Proses</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.menunggu_admin)}</div><div className="kc-lbl">Menunggu</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.ditolak)}</div><div className="kc-lbl">Ditolak</div></div>
                  <div className="kc"><div className="kc-val sm">{fmtRpCompact(d.kpi.nilai_disetujui)}</div><div className="kc-lbl">Nilai Disetujui</div></div>
                  <div className="kc"><div className="kc-val sm">{fmtRpCompact(d.kpi.nilai_aktif)}</div><div className="kc-lbl">Nilai Aktif</div></div>
                </div>
                <div className="panel-row fade-up">
                  <div className="panel">
                    <div className="panel-h">Komposisi Status</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={d.statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(p: { name?: string; value?: number }) => `${p.name} ${p.value}`}>
                            {d.statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-h">Jumlah per Sub-Bidang</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={d.table.slice(0, 10).map(t => ({ name: t.sub_bidang, value: t.total }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                          <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={56} />
                          <Tooltip cursor={{ fill: 'rgba(239,159,39,.1)' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={meta.accent} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="panel fade-up">
                  <div className="panel-h">Rekap per Sub-Bidang</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dd-tbl">
                      <thead><tr><th>Sub-Bidang</th><th className="num">Total</th><th className="num">Disetujui</th><th className="num">Proses</th><th className="num">Ditolak</th><th className="num">Nilai Disetujui</th></tr></thead>
                      <tbody>
                        {d.table.map((r, i) => (
                          <tr key={i}><td>{r.sub_bidang}</td><td className="num">{fmtNum(r.total)}</td><td className="num">{fmtNum(r.disetujui)}</td><td className="num">{fmtNum(r.proses)}</td><td className="num">{fmtNum(r.ditolak)}</td><td className="num">{fmtRpCompact(r.nominal)}</td></tr>
                        ))}
                        {d.table.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#85B7EB' }}>Tidak ada data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {pd.modul === 'eanggaran' && (() => {
            const d = pd.data;
            return (
              <>
                <div className="kpi-grid fade-up">
                  <div className="kc"><div className="kc-val sm">{fmtRpCompact(d.kpi.total_pagu)}</div><div className="kc-lbl">Total Pagu</div></div>
                  <div className="kc"><div className="kc-val sm">{fmtRpCompact(d.kpi.total_real_keuangan)}</div><div className="kc-lbl">Realisasi</div></div>
                  <div className="kc"><div className="kc-val">{d.kpi.pct_serapan}%</div><div className="kc-lbl">Serapan</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.total_ssk_rows)}</div><div className="kc-lbl">Baris SSK</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.total_rekening)}</div><div className="kc-lbl">Rekening</div></div>
                </div>
                <div className="panel-row fade-up">
                  <div className="panel">
                    <div className="panel-h">Pagu per Sumber</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={d.sumberPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                            {d.sumberPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtRpCompact(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-h">Serapan per Sumber (%)</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={d.table.map(t => ({ name: t.sumber, value: t.pct }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                          <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={50} />
                          <Tooltip cursor={{ fill: 'rgba(55,138,221,.1)' }} formatter={(v) => `${Number(v)}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {d.table.map((t, i) => <Cell key={i} fill={t.pct >= 90 ? '#1D9E75' : t.pct >= 60 ? '#EF9F27' : '#E24B4A'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="panel fade-up">
                  <div className="panel-h">Rekap per Sumber Anggaran</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dd-tbl">
                      <thead><tr><th>Sumber</th><th className="num">Pagu</th><th className="num">Realisasi</th><th className="num">Serapan</th></tr></thead>
                      <tbody>
                        {d.table.map((r, i) => (
                          <tr key={i}><td>{r.sumber}</td><td className="num">{fmtRpCompact(r.pagu)}</td><td className="num">{fmtRpCompact(r.realisasi)}</td><td className="num">{r.pct}%</td></tr>
                        ))}
                        {d.table.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#85B7EB' }}>Tidak ada data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {pd.modul === 'blud' && (() => {
            const d = pd.data;
            return (
              <>
                <div className="kpi-grid fade-up">
                  <div className="kc"><div className="kc-val sm">{fmtRpCompact(d.kpi.total_pagu)}</div><div className="kc-lbl">Total Pagu</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.leaf_baris)}</div><div className="kc-lbl">Rincian Belanja</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.total_baris)}</div><div className="kc-lbl">Total Baris</div></div>
                  <div className="kc"><div className="kc-val sm">{d.kpi.versi_tanggal ?? '—'}</div><div className="kc-lbl">Versi DPA</div></div>
                </div>
                <div className="panel-row fade-up">
                  <div className="panel">
                    <div className="panel-h">Komposisi Belanja per Kelompok</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={d.kelompokPie.slice(0, 8)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                            {d.kelompokPie.slice(0, 8).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtRpCompact(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-h">Nilai per Kelompok</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={d.table.slice(0, 10).map(t => ({ name: t.kode, value: t.jumlah }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                          <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={48} />
                          <Tooltip cursor={{ fill: 'rgba(29,158,117,.1)' }} formatter={(v) => fmtRpCompact(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={meta.accent} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="panel fade-up">
                  <div className="panel-h">Rincian per Kelompok Rekening</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dd-tbl">
                      <thead><tr><th>Kode</th><th>Uraian</th><th className="num">Jumlah Rincian</th><th className="num">Nilai</th></tr></thead>
                      <tbody>
                        {d.table.map((r, i) => (
                          <tr key={i}><td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{r.kode}</td><td>{r.uraian}</td><td className="num">{fmtNum(r.count)}</td><td className="num">{fmtRpCompact(r.jumlah)}</td></tr>
                        ))}
                        {d.table.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#85B7EB' }}>Belum ada DPA</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {pd.modul === 'renaksi' && (() => {
            const d = pd.data;
            return (
              <>
                <div className="kpi-grid fade-up">
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.total_indikator)}</div><div className="kc-lbl">Total Indikator</div></div>
                  <div className="kc"><div className="kc-val">{fmtNum(d.kpi.target_terisi)}</div><div className="kc-lbl">Target Terisi</div></div>
                </div>
                <div className="panel fade-up" style={{ marginBottom: 18 }}>
                  <div className="panel-h">Jumlah Indikator per Level</div>
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.table.map(t => ({ name: RA_LEVEL_LABEL[t.level] ?? t.level, value: t.count }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                        <XAxis dataKey="name" tick={axisTick} interval={0} height={22} />
                        <Tooltip cursor={{ fill: 'rgba(124,92,252,.1)' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                        <Bar dataKey="value" radius={[5, 5, 0, 0]} fill={meta.accent} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="panel fade-up">
                  <div className="panel-h">Rekap per Level</div>
                  <table className="dd-tbl">
                    <thead><tr><th>Level</th><th className="num">Jumlah Indikator</th><th className="num">Target Terisi</th></tr></thead>
                    <tbody>
                      {d.table.map((r, i) => (
                        <tr key={i}><td>{RA_LEVEL_LABEL[r.level] ?? r.level}</td><td className="num">{fmtNum(r.count)}</td><td className="num">{fmtNum(r.target_terisi)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {pd.modul === 'realisasi-kinerja' && (() => {
            const d = pd.data;
            return (
              <>
                <div className="kpi-grid fade-up">
                  <div className="kc"><div className="kc-val">{d.kpi.pct_capaian_total}%</div><div className="kc-lbl">Capaian Total</div></div>
                  <div className="kc"><div className="kc-val" style={{ color: '#2BD46A' }}>{fmtNum(d.kpi.on_track)}</div><div className="kc-lbl">Tercapai</div></div>
                  <div className="kc"><div className="kc-val" style={{ color: '#E24B4A' }}>{fmtNum(d.kpi.lagging)}</div><div className="kc-lbl">Belum Tercapai</div></div>
                </div>
                <div className="panel-row fade-up">
                  <div className="panel">
                    <div className="panel-h">Tercapai vs Belum Tercapai</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={d.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(p: { name?: string; value?: number }) => `${p.name} ${p.value}`}>
                            {d.pie.map((e, i) => <Cell key={i} fill={e.name === 'Tercapai' ? '#1D9E75' : '#E24B4A'} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-h">Capaian (%) per Level</div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={d.table.map(t => ({ name: RA_LEVEL_LABEL[t.level] ?? t.level, value: t.pct }))} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                          <XAxis dataKey="name" tick={axisTick} interval={0} height={22} />
                          <Tooltip cursor={{ fill: 'rgba(29,158,117,.1)' }} formatter={(v) => `${Number(v)}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                            {d.table.map((t, i) => <Cell key={i} fill={t.pct >= 90 ? '#1D9E75' : t.pct >= 60 ? '#EF9F27' : '#E24B4A'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="panel fade-up">
                  <div className="panel-h">Rekap Capaian per Level</div>
                  <table className="dd-tbl">
                    <thead><tr><th>Level</th><th className="num">Indikator</th><th className="num">Σ Target</th><th className="num">Σ Realisasi</th><th className="num">Capaian</th></tr></thead>
                    <tbody>
                      {d.table.map((r, i) => (
                        <tr key={i}><td>{RA_LEVEL_LABEL[r.level] ?? r.level}</td><td className="num">{fmtNum(r.total)}</td><td className="num">{fmtNum(r.sum_target)}</td><td className="num">{fmtNum(r.sum_real)}</td><td className="num">{r.pct}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </main>

        <FloatingDock nav={navItems} isLight={isLight} limelight />
      </div>
    </>
  );
}
