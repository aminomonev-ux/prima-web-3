'use client'
// app/(dashboard)/blud/dashboard-client.tsx
// Landing dashboard BLUD — KPI cards + history list.
// Theme-aware via [data-theme="light"] CSS selectors (no isLight prop needed).

import Link from 'next/link'
import { FileText, Shuffle, History, Clock, TrendingUp, Layers } from 'lucide-react'
import { fmtRp } from '@/lib/shared/utils'

type HistoryItem = { versi_tanggal: string; jumlah_baris: number; total_jumlah: number }
type Props = {
  dpaLatestVersi: string | null
  dpaLatestRows:  number
  dpaLatestTotal: number
  pgLatestVersi:  string | null
  pgLatestRows:   number
  pgLatestDelta:  number
  dpaHistory:     HistoryItem[]
  pgHistory:      HistoryItem[]
}

function fmtTgl(d: string | null): string {
  if (!d) return '—'
  // YYYY-MM-DD → DD MMM YYYY
  const [y, m, day] = d.split('-')
  const bln = ['', 'Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][parseInt(m, 10)] ?? m
  return `${day} ${bln} ${y}`
}

export default function DashboardClient(p: Props) {
  // KPI cards definition — warna fixed per metric, container theme-aware via CSS
  const cards = [
    {
      label: 'DPA BLUD — Versi Terbaru',
      value: fmtTgl(p.dpaLatestVersi),
      sub:   `${p.dpaLatestRows} baris`,
      Icon:  FileText,
      color: '#8B5CF6',
      href:  '/blud/dpa',
    },
    {
      label: 'Total Anggaran DPA',
      value: fmtRp(p.dpaLatestTotal),
      sub:   p.dpaLatestVersi ? `Per ${fmtTgl(p.dpaLatestVersi)}` : 'Belum ada data',
      Icon:  TrendingUp,
      color: '#3B82F6',
      href:  '/blud/dpa',
    },
    {
      label: 'Pergeseran DPA — Versi',
      value: fmtTgl(p.pgLatestVersi),
      sub:   `${p.pgLatestRows} baris`,
      Icon:  Shuffle,
      color: '#EC4899',
      href:  '/blud/pergeseran',
    },
    {
      label: 'Δ Pergeseran Net',
      value: fmtRp(p.pgLatestDelta),
      sub:   p.pgLatestDelta >= 0 ? 'Bertambah' : 'Berkurang',
      Icon:  Layers,
      color: p.pgLatestDelta >= 0 ? '#10B981' : '#EF4444',
      href:  '/blud/pergeseran',
    },
  ]

  return (
    <div className="blud-dash" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        .blud-dash-title { font-size: 20px; font-weight: 800; color: #E6F1FB; letter-spacing: -.2px; }
        .blud-dash-sub   { font-size: 12px; color: #85B7EB; font-weight: 500; margin-top: 2px; }
        .blud-kpi-grid   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 16px; }
        @media (max-width: 960px) { .blud-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .blud-kpi-grid { grid-template-columns: 1fr; } }

        .blud-kpi-card {
          display: block; text-decoration: none; padding: 16px 18px; border-radius: 14px;
          background: rgba(4,44,83,.6); border: 1px solid rgba(255,255,255,.08);
          transition: all .2s; cursor: pointer;
        }
        .blud-kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.4); }
        .blud-kpi-label { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; opacity: .9; }
        .blud-kpi-value { font-size: 20px; font-weight: 800; margin: 6px 0 3px; line-height: 1.15; letter-spacing: -.3px; }
        .blud-kpi-sub   { font-size: 11px; opacity: .75; font-weight: 500; }
        .blud-kpi-icon-box {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,.15);
        }

        .blud-row-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
        @media (max-width: 960px) { .blud-row-grid { grid-template-columns: 1fr; } }
        .blud-panel {
          background: rgba(4,44,83,.6); border: 1px solid rgba(255,255,255,.08); border-radius: 14px;
          padding: 18px 20px;
        }
        .blud-panel-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
        .blud-panel-title { font-size: 14px; font-weight: 800; color: #E6F1FB; letter-spacing: .1px; }
        .blud-panel-sub   { font-size: 11px; color: #85B7EB; font-weight: 500; }
        .blud-history-row {
          display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 9px 0;
          border-bottom: 1px solid rgba(255,255,255,.06);
          font-size: 12.5px;
        }
        .blud-history-row:last-child { border-bottom: none; }
        .blud-history-tgl { color: #E6F1FB; font-weight: 700; }
        .blud-history-meta { color: #85B7EB; font-weight: 500; font-size: 11px; margin-top: 1px; }
        .blud-history-val { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #B5D4F4; font-size: 12px; }
        .blud-empty { text-align: center; color: #85B7EB; font-size: 12px; padding: 18px 0; font-style: italic; opacity: .7; }

        /* ── Light theme overrides ── */
        [data-theme="light"] .blud-dash-title { color: #0F0F12; }
        [data-theme="light"] .blud-dash-sub   { color: #6B7280; }
        [data-theme="light"] .blud-kpi-card   { background: #FAFAFA; border: 1px solid rgba(0,0,0,.06); box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        [data-theme="light"] .blud-kpi-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,.10); }
        [data-theme="light"] .blud-panel      { background: #FAFAFA; border: 1px solid rgba(0,0,0,.06); box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        [data-theme="light"] .blud-panel-title{ color: #0F0F12; }
        [data-theme="light"] .blud-panel-sub  { color: #6B7280; }
        [data-theme="light"] .blud-history-row{ border-color: rgba(0,0,0,.06); }
        [data-theme="light"] .blud-history-tgl{ color: #0F0F12; }
        [data-theme="light"] .blud-history-meta{ color: #6B7280; }
        [data-theme="light"] .blud-history-val{ color: #374151; }
        [data-theme="light"] .blud-empty      { color: #6B7280; }
      `}</style>

      <div>
        <div className="blud-dash-title">Dashboard BLUD</div>
        <div className="blud-dash-sub">Ringkasan anggaran BLUD & pergeseran terkini</div>
      </div>

      {/* KPI Cards */}
      <div className="blud-kpi-grid">
        {cards.map(c => {
          const Icon = c.Icon
          return (
            <Link key={c.label} href={c.href} className="blud-kpi-card" style={{ color: c.color }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="blud-kpi-label" style={{ color: c.color }}>{c.label}</div>
                  <div className="blud-kpi-value" style={{ color: c.color, fontFamily: c.label.includes('Total') || c.label.startsWith('Δ') ? "'JetBrains Mono', monospace" : undefined }}>{c.value}</div>
                  <div className="blud-kpi-sub" style={{ color: c.color }}>{c.sub}</div>
                </div>
                <div className="blud-kpi-icon-box" style={{ background: c.color, color: '#FFFFFF' }}>
                  <Icon size={20} strokeWidth={2.2} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* History panels */}
      <div className="blud-row-grid">
        {/* DPA History */}
        <div className="blud-panel">
          <div className="blud-panel-head">
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(139,92,246,.18)', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={16} strokeWidth={2.2} />
            </div>
            <div>
              <div className="blud-panel-title">Riwayat DPA BLUD</div>
              <div className="blud-panel-sub">5 versi terbaru</div>
            </div>
          </div>
          {p.dpaHistory.length === 0 ? (
            <div className="blud-empty">Belum ada riwayat DPA.</div>
          ) : p.dpaHistory.map(h => (
            <div key={h.versi_tanggal} className="blud-history-row">
              <div>
                <div className="blud-history-tgl">{fmtTgl(h.versi_tanggal)}</div>
                <div className="blud-history-meta">{h.jumlah_baris} baris</div>
              </div>
              <div className="blud-history-val">{fmtRp(h.total_jumlah)}</div>
            </div>
          ))}
        </div>

        {/* Pergeseran History */}
        <div className="blud-panel">
          <div className="blud-panel-head">
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(236,72,153,.18)', color: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} strokeWidth={2.2} />
            </div>
            <div>
              <div className="blud-panel-title">Riwayat Pergeseran</div>
              <div className="blud-panel-sub">5 versi terbaru</div>
            </div>
          </div>
          {p.pgHistory.length === 0 ? (
            <div className="blud-empty">Belum ada riwayat Pergeseran.</div>
          ) : p.pgHistory.map(h => (
            <div key={h.versi_tanggal} className="blud-history-row">
              <div>
                <div className="blud-history-tgl">{fmtTgl(h.versi_tanggal)}</div>
                <div className="blud-history-meta">{h.jumlah_baris} baris</div>
              </div>
              <div className="blud-history-val" style={{ color: h.total_jumlah >= 0 ? '#10B981' : '#EF4444' }}>
                {h.total_jumlah >= 0 ? '+' : ''}{fmtRp(h.total_jumlah)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
