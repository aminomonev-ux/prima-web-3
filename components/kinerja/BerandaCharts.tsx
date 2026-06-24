'use client'
// components/kinerja/BerandaCharts.tsx
// Chart Beranda E-Anggaran — di bawah KPI cards + donut existing.
//   1. Pendapatan per Uraian (horizontal bar: Target vs Realisasi).
//   2. Per Sumber Anggaran (5 chart) — Target SSK (Rp) vs Realisasi (Rp) per bulan.

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  tahun:    string
  isLight:  boolean
}

interface PendRow { keterangan: string; target: number; realisasi: number; capaian_pct: number }
interface LaporanTrend { bulan: number; real_keuangan: number; akum_keuangan: number }
interface LaporanSumber { sumber: string; total_pagu: number; total_real_keuangan: number; trend: LaporanTrend[] }
interface SskRowApi { months?: Record<string, number> | null }

type Sumber = 'GAJI' | 'BLUD' | 'HARLEP' | 'PROMKES' | 'SARPRAS' | 'OBAT' | 'PEMELIHARAAN' | 'PEMBANGUNAN'
const SUMBER_LIST: Sumber[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']
const MONTH_KEYS = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const
const BULAN_LABEL = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

// Target & Realisasi pakai HUE BEDA total (complementary), bukan light/dark shade dari hue sama
const SUMBER_COLOR: Record<Sumber, { target: string; real: string }> = {
  GAJI:    { target: '#F59E0B', real: '#7C3AED' }, // amber  vs violet
  BLUD:    { target: '#F43F5E', real: '#10B981' }, // rose   vs emerald
  HARLEP:  { target: '#3B82F6', real: '#F59E0B' }, // blue   vs amber
  PROMKES: { target: '#14B8A6', real: '#EC4899' }, // teal   vs pink
  SARPRAS: { target: '#F43F5E', real: '#06B6D4' }, // rose   vs cyan
  // 3 sumber baru — pasangan target/real complementary, ambil dari design token + komplemen
  OBAT:         { target: '#EF9F27', real: '#1D9E75' }, // primary amber  vs teal-green
  PEMELIHARAAN: { target: '#BA7517', real: '#3B82F6' }, // warning brown  vs blue
  PEMBANGUNAN:  { target: '#7C5CFC', real: '#F59E0B' }, // purple         vs amber
}

const fmtRpShort = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} jt`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)} rb`
  return n.toString()
}
const fmtRpFull = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))

export default function BerandaCharts({ tahun, isLight }: Props) {
  const [pendRows,    setPendRows]    = useState<PendRow[]>([])
  const [laporanData, setLaporanData] = useState<LaporanSumber[]>([])
  const [sskBySumber, setSskBySumber] = useState<Record<Sumber, number[]>>({
    GAJI: [], BLUD: [], HARLEP: [], PROMKES: [], SARPRAS: [], OBAT: [], PEMELIHARAAN: [], PEMBANGUNAN: [],
  })
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let alive = true
    queueMicrotask(() => { if (alive) setLoading(true) })
    Promise.all([
      fetch(`/api/kinerja/pendapatan?type=pendapatan&tahun=${tahun}`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`/api/kinerja/laporan?tahun=${tahun}`).then(r => r.json()).catch(() => ({ data: [] })),
      ...SUMBER_LIST.map(s =>
        fetch(`/api/kinerja/ssk?tahun=${tahun}&sumber=${s}`).then(r => r.json()).catch(() => ({ rows: [] }))
      ),
    ]).then(results => {
      if (!alive) return
      const [pendJson, lapJson, ...sskJsons] = results as [
        { rows?: PendRow[] }, { data?: LaporanSumber[] }, ...{ rows?: SskRowApi[] }[]
      ]
      setPendRows(pendJson?.rows ?? [])
      setLaporanData(lapJson?.data ?? [])
      const next = { GAJI: [], BLUD: [], HARLEP: [], PROMKES: [], SARPRAS: [], OBAT: [], PEMELIHARAAN: [], PEMBANGUNAN: [] } as Record<Sumber, number[]>
      SUMBER_LIST.forEach((s, i) => {
        const rows = sskJsons[i]?.rows ?? []
        const monthlyTotals = MONTH_KEYS.map(mk =>
          rows.reduce((sum, r) => sum + Number(r.months?.[mk] ?? 0), 0)
        )
        next[s] = monthlyTotals
      })
      setSskBySumber(next)
      setLoading(false)
    })
    return () => { alive = false }
  }, [tahun])

  // ─── Theme tokens ──────────────────────────────────────────────────────────
  const cSurface     = isLight ? '#FFFFFF' : '#042C53'
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C'
  const cText        = isLight ? '#0F0F12' : '#E6F1FB'
  const cTextSub     = isLight ? '#6B7280' : '#85B7EB'
  const cGrid        = isLight ? '#E5E7EB' : 'rgba(133,183,235,.15)'
  const cTooltipBg   = isLight ? '#FFFFFF' : '#0B1F3D'
  const cTooltipBd   = isLight ? '#E5E7EB' : '#185FA5'
  const cardSx: React.CSSProperties = {
    background: cSurface,
    border: `1px solid ${cBorder}`,
    borderRadius: '12px',
    padding: '16px 18px',
    boxShadow: isLight ? '0 4px 16px rgba(0,0,0,.06)' : '0 4px 16px rgba(0,0,0,.3)',
  }
  const titleSx: React.CSSProperties = {
    fontWeight: 800,
    fontSize: '13px',
    color: cText,
    marginBottom: '12px',
    letterSpacing: '.02em',
  }
  const tooltipStyle: React.CSSProperties = {
    background: cTooltipBg, border: `1px solid ${cTooltipBd}`,
    borderRadius: '8px', fontSize: '12px',
  }

  // ─── Data Chart 1: Pendapatan per Uraian ────────────────────────────────────
  const chart1Data = pendRows
    .filter(r => r.target > 0 || r.realisasi > 0)
    .slice(0, 12)
    .map(r => ({
      keterangan: r.keterangan.length > 28 ? r.keterangan.slice(0, 25) + '…' : r.keterangan,
      Target: r.target,
      Realisasi: r.realisasi,
    }))

  // ─── Data Chart per Sumber: Target SSK vs Realisasi per Bulan ─────────────
  const realBySumber = (() => {
    const m: Record<string, number[]> = {}
    for (const s of laporanData) {
      const arr = new Array(12).fill(0)
      for (const t of s.trend ?? []) {
        if (t.bulan >= 1 && t.bulan <= 12) arr[t.bulan - 1] = t.real_keuangan ?? 0
      }
      m[s.sumber] = arr
    }
    return m
  })()

  if (loading) {
    return (
      <div style={{ ...cardSx, marginTop: '14px', textAlign: 'center', padding: '40px', color: cTextSub }}>
        <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }} />
        Memuat chart...
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', marginTop: '14px' }}>

      {/* ─── Chart 1: Pendapatan per Uraian ─────────────────────────────────── */}
      <div style={cardSx}>
        <div style={titleSx}>
          <i className="fas fa-chart-bar" style={{ marginRight: '8px', color: '#7C3AED' }} />
          Pendapatan per Uraian — Target vs Realisasi
        </div>
        {chart1Data.length === 0 ? (
          <div style={{ color: cTextSub, fontSize: '12px', padding: '24px', textAlign: 'center' }}>
            Belum ada data pendapatan untuk tahun {tahun}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, chart1Data.length * 36)}>
            <BarChart data={chart1Data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cGrid} />
              <XAxis type="number" tickFormatter={fmtRpShort} tick={{ fill: cTextSub, fontSize: 11 }} />
              <YAxis type="category" dataKey="keterangan" tick={{ fill: cText, fontSize: 11 }} width={180} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: cText, fontWeight: 700 }}
                formatter={(v) => fmtRpFull(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Target"    fill="#06B6D4" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Realisasi" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ─── Chart per Sumber — Target SSK vs Realisasi per Bulan ──────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '14px' }}>
        {SUMBER_LIST.map(s => {
          const targetArr = sskBySumber[s] ?? new Array(12).fill(0)
          const realArr   = realBySumber[s]  ?? new Array(12).fill(0)
          const data = BULAN_LABEL.map((bln, i) => ({
            bulan: bln,
            Target:    targetArr[i] || 0,
            Realisasi: realArr[i]   || 0,
          }))
          const hasData = data.some(d => d.Target > 0 || d.Realisasi > 0)
          const color = SUMBER_COLOR[s]
          return (
            <div key={s} style={cardSx}>
              <div style={titleSx}>
                <i className="fas fa-chart-column" style={{ marginRight: '8px', color: color.real }} />
                {s} — Target vs Realisasi per Bulan
              </div>
              {!hasData ? (
                <div style={{ color: cTextSub, fontSize: '12px', padding: '24px', textAlign: 'center' }}>
                  Belum ada data untuk {s} tahun {tahun}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cGrid} />
                    <XAxis dataKey="bulan" tick={{ fill: cTextSub, fontSize: 10 }} />
                    <YAxis tickFormatter={fmtRpShort} tick={{ fill: cTextSub, fontSize: 10 }} width={60} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: cText, fontWeight: 700 }}
                      formatter={(v) => fmtRpFull(Number(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Target"    fill={color.target} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Realisasi" fill={color.real}   radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
