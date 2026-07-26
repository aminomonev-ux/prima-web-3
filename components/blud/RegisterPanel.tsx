'use client'
// components/blud/RegisterPanel.tsx — isi sheet `register` untuk satu rekening.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.1, §3.2
//
// `register` di Excel adalah keluaran, bukan masukan — karena itu tidak dibuatkan
// menu sendiri. Ini panel drill-down: klik satu baris di layar Realisasi, muncul
// daftar transaksi yang membebani baris itu berikut saldo anggaran berjalan.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Baris {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
}

interface RegisterRow {
  id: number
  tanggal: string
  bulan: number
  no_kwt: number | null
  uraian: string
  jenis: string
  nilai: number
  saldo: number
}

interface RegisterData {
  kode_rekening: string
  uraian: string
  pagu: number
  rows: RegisterRow[]
  total: number
  sisa: number
}

interface Props {
  tahun: number
  bulan: number
  baris: Baris
  onClose: () => void
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export default function RegisterPanel({ tahun, bulan, baris, onClose }: Props) {
  const [data, setData] = useState<RegisterData | null>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(
          `/api/blud/realisasi/register?tahun=${tahun}&anggaran_key=${encodeURIComponent(baris.anggaran_key)}&sampai_bulan=${bulan}`,
        )
        const json = await res.json()
        if (!alive) return
        if (!res.ok || !json.ok) { setGalat(json.error ?? 'Gagal memuat register'); return }
        setData(json.data)
      } catch {
        if (alive) setGalat('Tidak bisa menghubungi server')
      }
    })()
    return () => { alive = false }
  }, [tahun, bulan, baris.anggaran_key])

  return createPortal(
    <div className="blud-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="blud-modal-card rl-reg" role="dialog" aria-modal="true">
        <div className="blud-modal-header">
          <div>
            <div className="blud-modal-title">Register — {baris.kode_rekening || 'tanpa kode'}</div>
            <div className="blud-modal-subtitle">{baris.uraian} · s.d. {NAMA_BULAN[bulan - 1]} {tahun}</div>
          </div>
          <button className="blud-modal-close" onClick={onClose} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>

        <div className="rl-reg-body">
          {galat && <div className="bk-warn">{galat}</div>}
          {!galat && !data && <div className="bk-kosong">Memuat…</div>}

          {data && (
            <>
              <div className="rl-reg-ringkas">
                <span>Jumlah anggaran <b className="bk-num-inline">Rp {rp(data.pagu)}</b></span>
                <span>Pengeluaran <b className="bk-num-inline">Rp {rp(data.total)}</b></span>
                <span>Saldo <b className={`bk-num-inline ${data.sisa < 0 ? 'rl-neg' : ''}`}>Rp {rp(data.sisa)}</b></span>
              </div>

              <table className="dpa-table rl-reg-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>No</th>
                    <th style={{ width: 92 }}>Tanggal</th>
                    <th style={{ width: 56 }}>Kwt</th>
                    <th>Uraian</th>
                    <th style={{ width: 130 }}>Pengeluaran</th>
                    <th style={{ width: 130 }}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.rows.length && (
                    <tr><td colSpan={6} className="bk-kosong">
                      Belum ada transaksi yang membebani rekening ini s.d. {NAMA_BULAN[bulan - 1]}.
                    </td></tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={`${r.id}-${i}`}>
                      <td className="bk-c">{i + 1}</td>
                      <td className="bk-c bk-num-inline">{r.tanggal.slice(8, 10)}/{r.tanggal.slice(5, 7)}</td>
                      <td className="bk-c bk-num-inline">{r.no_kwt ?? '—'}</td>
                      <td>{r.uraian}</td>
                      <td className="bk-r bk-num-inline">{rp(r.nilai)}</td>
                      <td className={`bk-r bk-num-inline ${r.saldo < 0 ? 'rl-neg' : ''}`}>{rp(r.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
