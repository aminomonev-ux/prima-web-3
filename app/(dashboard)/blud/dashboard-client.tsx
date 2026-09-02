'use client'
// app/(dashboard)/blud/dashboard-client.tsx
// Landing dashboard BLUD — KPI cards + history list.
// Theme-aware via [data-theme="light"] CSS selectors (no isLight prop needed).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, Shuffle, Clock, TrendingUp, Layers,
  Wallet, Gauge, Coins, TriangleAlert, CalendarCheck, BarChart3, RefreshCw,
} from 'lucide-react'
import { fmtRp } from '@/lib/shared/utils'
import TahunDropdown from '@/components/blud/TahunDropdown'
import type { SerapanRingkas } from '@/lib/blud/serapan-ringkas'
import type { PanelRealisasi, StatusSerapan, VersiPergeseran } from '@/lib/blud/beranda-panel'
import { bolehSegarkan, jamPendek, JEDA_SEGARKAN_MS, PERISTIWA_AKTIF } from '@/lib/blud/segarkan'
import type { RingkasTutupKas } from '@/lib/blud/tutup-kas'

const BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

type Props = {
  tahun:          number
  tahunList:      number[]
  currentYear:    number
  dpaLatestVersi: string | null
  dpaLatestRows:  number
  dpaLatestTotal: number
  pgLatestVersi:  string | null
  pgLatestRows:   number
  pgLatestDelta:  number
  pgHistory:      VersiPergeseran[]
  /** Kartu KPI menuju menu lain. Kalau menunya tertutup bagi orang ini, kartunya
   *  tetap tampil (angkanya tetap berguna) tapi tidak bisa diklik — mengarahkannya
   *  ke pintu yang akan melemparnya balik lebih membingungkan. */
  bolehDpa:        boolean
  bolehPergeseran: boolean
  /**
   * Sisi realisasi TIDAK mengikuti aturan dua baris di atas, dan itu disengaja:
   * kartu lama memajang PAGU — angka rencana yang memang beredar di rapat, cukup
   * ditahan tautannya. Kartu realisasi memajang UANG YANG SUDAH KELUAR beserta
   * saldo kas; di sini angkanya sendiri yang tidak boleh terbaca. Karena itu
   * `null` = tidak usah dirender sama sekali, bukan "render tapi mati".
   * Jangan diseragamkan dengan kartu di atasnya.
   */
  serapan:      SerapanRingkas | null
  /** `null` mengikuti aturan `serapan` di atas — panel ini memajang uang yang sudah keluar. */
  panelRealisasi: PanelRealisasi | null
  tutupKas:     RingkasTutupKas | null
  /** Sakelar `app_status_blud_realisasi` mati — beda sebab dari "tidak berhak" (L72). */
  realisasiMati: boolean
  /** `YYYY-MM-DD HH:MM:SS` saat server menghitung halaman ini — stempel "diperbarui". */
  dimuatPada:    string
}

function fmtTgl(d: string | null): string {
  if (!d) return '—'
  // YYYY-MM-DD → DD MMM YYYY
  const [y, m, day] = d.split('-')
  const bln = ['', 'Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][parseInt(m, 10)] ?? m
  return `${day} ${bln} ${y}`
}

/** "14:32" hari ini, "28 Agu" kalau lebih lama — TIDAK PERNAH "2 jam lalu".
 *  Halaman ini biasa dibiarkan terbuka; waktu relatif yang dirender sejam lalu
 *  berubah jadi salah dengan sendirinya dan tidak ada yang membetulkannya.
 *  `hariIni` datang dari server, bukan dari `new Date()` di sini. */
function fmtWaktu(w: string, hariIni: string): string {
  const [tgl, jam] = w.split(' ')
  if (tgl === hariIni) return (jam ?? '').slice(0, 5)
  const [, m, d] = tgl.split('-')
  return `${Number(d)} ${BULAN_PENDEK[Number(m) - 1] ?? m}`
}

const WARNA_STATUS: Record<StatusSerapan, string> = {
  MENEMBUS: '#E24B4A',
  MEPET:    '#BA7517',
  AMAN:     '#34D399',
  YATIM:    '#85B7EB',
}

export default function DashboardClient(p: Props) {
  const router = useRouter()

  // Beranda itu server component `force-dynamic` — dia sudah menghitung ulang
  // tiap kali DIBUKA. Yang belum: halaman yang SUDAH terbuka tidak menengok lagi.
  //
  // Stempel jamnya WAJIB, dan lebih penting daripada tombolnya: dasbor yang tidak
  // menyegarkan diri sendiri tapi tidak menyebutkan umurnya itu diam-diam
  // berbohong — orang tidak bisa membedakan angka 5 detik lalu dari 5 jam lalu.
  // Jamnya milik SERVER (`p.dimuatPada`), jadi ia berganti sendiri tiap
  // `router.refresh()` tanpa satu pun state di sini.
  const [menyegarkan, setMenyegarkan] = useState(false)
  const aktifRef = useRef<number>(0)

  const segarkan = useCallback(() => {
    setMenyegarkan(true)
    // `router.refresh()`, bukan `location.reload()` — halaman dihitung ulang di
    // server lalu isinya ditukar; posisi gulir tetap dan layar tidak berkedip.
    router.refresh()
    setTimeout(() => setMenyegarkan(false), 600)
  }, [router])

  useEffect(() => {
    aktifRef.current = Date.now()
    const tandai = () => { aktifRef.current = Date.now() }
    PERISTIWA_AKTIF.forEach(e => window.addEventListener(e, tandai, { passive: true }))
    const t = setInterval(() => {
      if (!bolehSegarkan({
        terlihat: document.visibilityState === 'visible',
        diamMs: Date.now() - aktifRef.current,
      })) return
      router.refresh()
    }, JEDA_SEGARKAN_MS)
    return () => {
      PERISTIWA_AKTIF.forEach(e => window.removeEventListener(e, tandai))
      clearInterval(t)
    }
  }, [router])

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

  const s = p.serapan
  // Pagunya BUKAN `p.dpaLatestTotal`. Realisasi diukur terhadap kolom `pergeseran`
  // versi terbaru, dan memakai total DPA di sini membuat Beranda melaporkan %
  // serapan yang berbeda dari layar Realisasi untuk hal yang sama persis.
  const kartuSerapan: {
    label: string; value: string; sub: string; href: string; color: string
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
    /** Keterangan tambahan di bawah `sub` — hanya kartu Terserap yang memakainya. */
    nota?: string | null
    notaTip?: string
  }[] = !s ? [] : [
    {
      label: 'Terserap',
      value: fmtRp(s.terserap),
      sub:   s.tx_terakhir ? `Transaksi terakhir ${fmtTgl(s.tx_terakhir)}` : 'Belum ada transaksi',
      // Angka ini SENGAJA tidak memuat belanja yang jangkarnya sudah tidak ada di
      // versi pagu (§9.1), sementara kartu Kas di bawah tetap menghitungnya —
      // uangnya memang sudah keluar. Tanpa baris ini selisih keduanya tidak
      // terjelaskan di mana pun, dan panel "Realisasi Terbaru" hanya memuat 5
      // rekening terakhir, jadi yang lama jatuh dari daftar dan lenyap.
      nota:  s.yatim !== 0
        ? `${fmtRp(s.yatim)} di luar versi pagu${s.yatim_rekening > 1 ? ` · ${s.yatim_rekening} rekening` : ''}`
        : null,
      notaTip: 'Belanja yang kode rekeningnya sudah tidak ada di versi pagu yang berlaku, jadi tidak ikut dijumlahkan ke Terserap. Uangnya tetap terbaca di kartu Kas. Klik untuk membukanya di layar Realisasi.',
      Icon:  Wallet,
      color: '#1D9E75',
      href:  `/blud/realisasi?tahun=${p.tahun}`,
    },
    {
      label: '% Serapan',
      // "0,0%" padahal sudah ada uang keluar terbaca sebagai "belum ada apa-apa".
      // Pagu BLUD puluhan miliar, jadi transaksi awal tahun memang membulat ke nol.
      value: s.pagu <= 0 ? '—'
        : s.pct > 0 && s.pct < 0.05 ? '< 0,1%'
        : `${s.pct.toFixed(1).replace('.', ',')}%`,
      sub:   s.versi
        ? `Pagu ${s.sumber === 'PERGESERAN' ? 'Pergeseran' : 'DPA'} ${fmtTgl(s.versi)}`
        : 'Belum ada pagu',
      Icon:  Gauge,
      color: '#3B82F6',
      href:  `/blud/realisasi?tahun=${p.tahun}`,
    },
    {
      label: 'Sisa Anggaran',
      value: fmtRp(s.sisa),
      sub:   s.sisa < 0 ? 'Terserap melebihi pagu' : 'Masih bisa dibelanjakan',
      Icon:  Coins,
      color: s.sisa < 0 ? '#E24B4A' : '#7C5CFC',
      href:  `/blud/realisasi?tahun=${p.tahun}`,
    },
    {
      label: 'Perlu Perhatian',
      value: s.menembus || s.mepet
        ? [s.menembus && `${s.menembus} menembus`, s.mepet && `${s.mepet} mepet`].filter(Boolean).join(' · ')
        : 'Aman',
      sub:   s.menembus || s.mepet ? 'Klik untuk melihat rekeningnya' : 'Tidak ada rekening yang mepet',
      Icon:  TriangleAlert,
      color: s.menembus ? '#E24B4A' : s.mepet ? '#BA7517' : '#1D9E75',
      // Menembus lebih genting daripada mepet, jadi itu yang dibuka duluan.
      href:  `/blud/realisasi?tahun=${p.tahun}${s.menembus ? '&saring=menembus' : s.mepet ? '&saring=mepet' : ''}`,
    },
  ]

  const trenMaks = Math.max(1, ...(s?.tren ?? []).map(Math.abs))
  const adaTrenMinus = (s?.tren ?? []).some(v => v < 0)

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
        /* Warna sendiri, BUKAN mewarisi warna kartunya: ini keterangan yang
           mengurangi keyakinan pada angka di atasnya, dan hijau "aman" justru
           menyembunyikannya. Amber-nya sama dengan spanduk modul dimatikan. */
        .blud-kpi-nota  {
          font-size: 10.5px; font-weight: 600; margin-top: 5px; line-height: 1.35;
          color: #FAC775; cursor: help;
        }
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

        /* Baris rekening — dipakai kedua panel. Yang di panel realisasi berupa
           <a>, jadi warna & garis bawahnya wajib ditegaskan ulang. */
        .blud-rek { text-decoration: none; align-items: center; }
        a.blud-rek:hover { background: rgba(255,255,255,.04); }
        .blud-rek-nama {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: 12.5px; font-weight: 700;
        }
        .blud-rek-pct {
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 700; margin-top: 2px;
        }
        .blud-versi-blok { padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
        .blud-versi-blok:last-child { border-bottom: none; }
        .blud-versi-head {
          display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12.5px;
        }
        .blud-versi-blok .blud-history-row { border-bottom: none; padding: 5px 0 0 10px; }
        .blud-versi-nol {
          font-size: 11px; color: #85B7EB; font-style: italic; opacity: .7; padding: 5px 0 0 10px;
        }

        .blud-segar {
          display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
          padding: 7px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 700;
          font-family: Inter, sans-serif;
          background: transparent; color: #85B7EB; border: 1px solid rgba(255,255,255,.14);
          transition: all .15s;
        }
        .blud-segar:hover { color: #E6F1FB; border-color: rgba(255,255,255,.3); }
        .blud-segar .muter { animation: blud-muter .6s linear; }
        @keyframes blud-muter { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .blud-mati {
          margin-top: 14px; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
          background: rgba(239,159,39,.12); border: 1px solid #EF9F27; color: #FAC775;
        }

        .blud-strip { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; }
        .blud-strip-bulan {
          text-align: center; padding: 7px 0; border-radius: 6px; font-size: 10.5px; font-weight: 700;
          background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); color: #85B7EB;
        }
        .blud-strip-bulan.tutup { background: rgba(29,158,117,.20); border-color: rgba(29,158,117,.45); color: #34D399; }
        .blud-saldo {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px;
          padding-top: 13px; border-top: 1px solid rgba(255,255,255,.06);
        }
        .blud-saldo-label { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: #85B7EB; }
        .blud-saldo-val   { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #E6F1FB; margin-top: 3px; }

        .blud-tren { display: grid; grid-template-columns: repeat(12, 1fr); gap: 5px; align-items: end; }
        .blud-tren-kol { display: flex; flex-direction: column; }
        .blud-tren-atas   { height: 78px; display: flex; align-items: flex-end; }
        .blud-tren-bawah  { height: 26px; display: flex; align-items: flex-start; }
        .blud-tren-bar    { width: 100%; border-radius: 3px 3px 0 0; background: #3B82F6; min-height: 2px; }
        .blud-tren-bar.minus { border-radius: 0 0 3px 3px; background: #E24B4A; }
        .blud-tren-label  { text-align: center; font-size: 9.5px; font-weight: 700; color: #85B7EB; margin-top: 5px; }

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
        [data-theme="light"] .blud-mati       { background: rgba(239,159,39,.10); color: #854F0B; }
        [data-theme="light"] .blud-kpi-nota   { color: #854F0B; }
        [data-theme="light"] .blud-strip-bulan{ background: #F3F4F6; border-color: rgba(0,0,0,.07); color: #6B7280; }
        [data-theme="light"] .blud-strip-bulan.tutup { background: rgba(29,158,117,.14); border-color: rgba(29,158,117,.40); color: #0F5C44; }
        [data-theme="light"] .blud-saldo      { border-color: rgba(0,0,0,.07); }
        [data-theme="light"] .blud-saldo-label{ color: #6B7280; }
        [data-theme="light"] .blud-saldo-val  { color: #0F0F12; }
        [data-theme="light"] .blud-tren-label { color: #6B7280; }
        [data-theme="light"] a.blud-rek:hover { background: rgba(0,0,0,.03); }
        [data-theme="light"] .blud-versi-blok { border-color: rgba(0,0,0,.06); }
        [data-theme="light"] .blud-versi-nol  { color: #6B7280; }
        [data-theme="light"] .blud-segar      { color: #6B7280; border-color: rgba(0,0,0,.12); }
        [data-theme="light"] .blud-segar:hover{ color: #0F0F12; border-color: rgba(0,0,0,.28); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="blud-dash-title">Dashboard BLUD</div>
          <div className="blud-dash-sub">Ringkasan anggaran BLUD & pergeseran — Tahun {p.tahun}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="blud-segar" onClick={segarkan} data-tooltip="Ambil angka terbaru">
            <RefreshCw size={13} strokeWidth={2.4} className={menyegarkan ? 'muter' : undefined} />
            <span>diperbarui {jamPendek(p.dimuatPada)}</span>
          </button>
          <TahunDropdown
            value={p.tahun}
            items={p.tahunList}
            current={p.currentYear}
            onChange={t => router.push(`/blud?tahun=${t}`)}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="blud-kpi-grid">
        {cards.map(c => {
          const Icon = c.Icon
          const bisaKlik = c.href === '/blud/dpa' ? p.bolehDpa : p.bolehPergeseran
          const Kotak = bisaKlik
            ? ({ children }: { children: React.ReactNode }) =>
                <Link href={c.href} className="blud-kpi-card" style={{ color: c.color }}>{children}</Link>
            : ({ children }: { children: React.ReactNode }) =>
                <div className="blud-kpi-card" style={{ color: c.color, cursor: 'default' }}>{children}</div>
          return (
            <Kotak key={c.label}>
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
            </Kotak>
          )
        })}
      </div>

      {/* Sisi realisasi — hilang seluruhnya kalau tidak berhak atau sakelarnya mati.
          Yang mati diberi keterangan; yang tidak berhak diam saja, karena "Anda
          tidak berhak" di halaman yang memang boleh dibuka cuma menimbulkan tanya. */}
      {p.realisasiMati && (
        <div className="blud-mati">
          Realisasi sedang dimatikan sementara oleh admin — angka serapan, sisa
          anggaran, dan saldo kas tidak ditampilkan dulu.
        </div>
      )}

      {kartuSerapan.length > 0 && (
        <div className="blud-kpi-grid">
          {kartuSerapan.map(c => {
            const Icon = c.Icon
            return (
              <Link key={c.label} href={c.href} className="blud-kpi-card" style={{ color: c.color }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="blud-kpi-label" style={{ color: c.color }}>{c.label}</div>
                    <div className="blud-kpi-value" style={{ color: c.color, fontFamily: c.label === 'Perlu Perhatian' ? undefined : "'JetBrains Mono', monospace" }}>{c.value}</div>
                    <div className="blud-kpi-sub" style={{ color: c.color }}>{c.sub}</div>
                    {c.nota && <div className="blud-kpi-nota" data-tooltip={c.notaTip}>{c.nota}</div>}
                  </div>
                  <div className="blud-kpi-icon-box" style={{ background: c.color, color: '#FFFFFF' }}>
                    <Icon size={20} strokeWidth={2.2} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {(p.tutupKas || s) && (
        <div className="blud-row-grid">
          {p.tutupKas && (
            <div className="blud-panel">
              <div className="blud-panel-head">
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(29,158,117,.18)', color: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CalendarCheck size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="blud-panel-title">Status Tutup Kas</div>
                  <div className="blud-panel-sub">Bulan yang sudah ditandatangani</div>
                </div>
              </div>
              <div className="blud-strip">
                {p.tutupKas.status.map((st, i) => (
                  <div key={i} className={`blud-strip-bulan ${st === 'TUTUP' ? 'tutup' : ''}`}
                    data-tooltip={`${BULAN_PENDEK[i]} — ${st === 'TUTUP' ? 'sudah ditutup' : 'masih terbuka'}`}>
                    {BULAN_PENDEK[i]}
                  </div>
                ))}
              </div>
              <div className="blud-saldo">
                <div>
                  <div className="blud-saldo-label">Kas tunai</div>
                  <div className="blud-saldo-val">{fmtRp(p.tutupKas.kas)}</div>
                </div>
                <div>
                  <div className="blud-saldo-label">Bank</div>
                  <div className="blud-saldo-val">{fmtRp(p.tutupKas.bank)}</div>
                </div>
                <div>
                  <div className="blud-saldo-label">Jumlah</div>
                  <div className="blud-saldo-val">{fmtRp(p.tutupKas.kas + p.tutupKas.bank)}</div>
                </div>
              </div>
            </div>
          )}

          {s && (
            <div className="blud-panel">
              <div className="blud-panel-head">
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(59,130,246,.18)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="blud-panel-title">Tren Serapan</div>
                  <div className="blud-panel-sub">Per bulan, tahun {p.tahun}</div>
                </div>
              </div>
              {s.terserap === 0 && s.tren.every(v => v === 0) ? (
                <div className="blud-empty">Belum ada transaksi tahun ini.</div>
              ) : (
                <div className="blud-tren">
                  {s.tren.map((v, i) => (
                    <div key={i} className="blud-tren-kol"
                      data-tooltip={`${BULAN_PENDEK[i]} — Rp ${fmtRp(v)}`}>
                      <div className="blud-tren-atas">
                        {v > 0 && <div className="blud-tren-bar" style={{ height: `${(v / trenMaks) * 100}%` }} />}
                      </div>
                      {/* Batang ke bawah cuma disediakan kalau memang ada bulan minus
                          (jenis PENGEMBALIAN) — kalau tidak, ruangnya mengecilkan
                          batang yang lain tanpa alasan. */}
                      {adaTrenMinus && (
                        <div className="blud-tren-bawah">
                          {v < 0 && <div className="blud-tren-bar minus" style={{ height: `${(-v / trenMaks) * 100}%` }} />}
                        </div>
                      )}
                      <div className="blud-tren-label">{BULAN_PENDEK[i]}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Panel riwayat — dulu dua daftar versi. Panel kanan memajang Δ Net yang
          SELALU nol (pergeseran wajib berimbang), jadi ia berbunyi "+Rp 0" tiga
          kali: benar, dan tidak pernah memberi tahu apa pun. */}
      <div className="blud-row-grid">
        {/* Realisasi Terbaru — hilang seluruhnya kalau tidak berhak / sakelar mati.
            Aturan yang sama dengan kartu serapan, dan bukan kebetulan: panel ini
            memajang uang yang sudah keluar. */}
        {p.panelRealisasi && (
          <div className="blud-panel">
            <div className="blud-panel-head">
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(59,130,246,.18)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Coins size={16} strokeWidth={2.2} />
              </div>
              <div>
                <div className="blud-panel-title">Realisasi Terbaru</div>
                <div className="blud-panel-sub">
                  {p.panelRealisasi.hari_ini > 0
                    ? `${p.panelRealisasi.hari_ini} rekening dicatat hari ini`
                    : 'rekening yang terakhir dicatat'}
                </div>
              </div>
            </div>
            {p.panelRealisasi.rekening.length === 0 ? (
              <div className="blud-empty">Belum ada transaksi dicatat.</div>
            ) : p.panelRealisasi.rekening.map(r => (
              <Link key={r.anggaran_key} href="/blud/realisasi" className="blud-history-row blud-rek">
                <div style={{ minWidth: 0 }}>
                  <div className="blud-history-tgl blud-rek-nama">{r.uraian || r.kode_rekening}</div>
                  <div className="blud-history-meta">
                    {r.uraian && r.kode_rekening ? `${r.kode_rekening} · ` : ''}{r.tx} transaksi · {fmtWaktu(r.waktu, p.panelRealisasi!.tanggal_hari_ini)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="blud-history-val">{fmtRp(r.terserap)}</div>
                  <div className="blud-rek-pct" style={{ color: WARNA_STATUS[r.status] }}>
                    {r.pct === null
                      ? '— tak ada di versi pagu'
                      : `${r.pct < 0.05 && r.pct > 0 ? '< 0,1' : r.pct.toFixed(1).replace('.', ',')}%`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Rekening yang digeser — TETAP berkelompok per versi (§2.1). */}
        <div className="blud-panel">
          <div className="blud-panel-head">
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(236,72,153,.18)', color: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} strokeWidth={2.2} />
            </div>
            <div>
              <div className="blud-panel-title">Rekening yang Digeser</div>
              <div className="blud-panel-sub">5 versi Pergeseran terbaru</div>
            </div>
          </div>
          {p.pgHistory.length === 0 ? (
            <div className="blud-empty">Belum ada riwayat Pergeseran.</div>
          ) : p.pgHistory.map(v => (
            <div key={v.versi_tanggal} className="blud-versi-blok">
              <div className="blud-versi-head">
                <span className="blud-history-tgl">{fmtTgl(v.versi_tanggal)}</span>
                <span className="blud-history-meta">{v.catatan ?? `${v.jumlah_baris} baris`}</span>
              </div>
              {v.rekening.length === 0 ? (
                <div className="blud-versi-nol">belum ada rekening yang digeser</div>
              ) : (
                <>
                  {v.rekening.map((r, i) => (
                    // Kode rekening bisa KOSONG — baris rincian di bawah kelompok
                    // memang tidak bernomor. Jadi ia tidak bisa jadi `key`, dan
                    // barisnya tidak boleh menyisakan baris meta kosong.
                    <div key={`${v.versi_tanggal}-${i}`} className="blud-history-row blud-rek">
                      <div style={{ minWidth: 0 }}>
                        <div className="blud-history-tgl blud-rek-nama">{r.uraian}</div>
                        {r.kode_rekening && <div className="blud-history-meta">{r.kode_rekening}</div>}
                      </div>
                      <div className="blud-history-val" style={{ color: r.nominal >= 0 ? '#34D399' : '#E24B4A' }}>
                        {r.nominal >= 0 ? '+' : '−'}{fmtRp(Math.abs(r.nominal))}
                      </div>
                    </div>
                  ))}
                  {v.lainnya > 0 && <div className="blud-versi-nol">+{v.lainnya} rekening lainnya</div>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
