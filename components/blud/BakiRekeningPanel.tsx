'use client'
// components/blud/BakiRekeningPanel.tsx — baki "Perlu Rekening" (§4.2).
// Konsep: docs/CONCEPT-blud-realisasi.md §4.2, §4.1
//
// Transaksi yang diparkir tetap menghitung saldo kas — angka kasnya benar — tapi
// belum menunjuk baris anggaran mana pun. Baki ini yang membuat kegagalan itu
// BERISIK: selama masih terisi, Tutup Kas tidak bisa dijalankan.
//
// Dua jalan keluar dari sini: sambungkan ke baris yang sudah ada (kalau rekeningnya
// ternyata sudah ada), atau minta rekening baru ditambahkan lewat menu Pergeseran.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Inbox, Send } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import type { TransaksiAwal } from './TransaksiModal'

interface TxParkir {
  id: number
  bulan: number
  tanggal: string
  no_kwt: number | null
  jenis: string
  uraian: string
  kas_masuk: number
  kas_keluar: number
  bank_masuk: number
  bank_keluar: number
  status: string
  version: number
}

interface Permintaan {
  id: number
  jenis: string
  kode_rekening: string | null
  uraian: string
  kekurangan: number
  status: string
  tx_id: number | null
  diminta_username: string | null
}

interface Props {
  tahun: number
  onClose: () => void
  /** Buka TransaksiModal dalam mode ubah supaya bendahara memilih barisnya. */
  onSambungkan: (awal: TransaksiAwal) => void
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']

export default function BakiRekeningPanel({ tahun, onClose, onSambungkan }: Props) {
  const [parkir, setParkir] = useState<TxParkir[]>([])
  const [permintaan, setPermintaan] = useState<Permintaan[]>([])
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [mengirim, setMengirim] = useState<number | null>(null)

  const muat = useCallback(async () => {
    try {
      const [rp1, rp2] = await Promise.all([
        fetch(`/api/blud/realisasi/tx?tahun=${tahun}&mode=parkir`),
        fetch(`/api/blud/realisasi/permintaan?tahun=${tahun}&status=MENUNGGU`),
      ])
      const [j1, j2] = await Promise.all([rp1.json(), rp2.json()])
      if (!rp1.ok || !j1.ok) { setGalat(j1.error ?? 'Saldo rekening tidak bisa dimuat. Coba lagi sebentar lagi.'); return }
      setParkir(j1.data ?? [])
      if (rp2.ok && j2.ok) setPermintaan(j2.data ?? [])
    } catch {
      setGalat('Tidak bisa menghubungi server')
    } finally {
      setMemuat(false)
    }
  }, [tahun])

  useEffect(() => { void (async () => { await muat() })() }, [muat])

  async function mintaRekening(t: TxParkir) {
    setMengirim(t.id)
    try {
      const res = await fetch('/api/blud/realisasi/permintaan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun,
          jenis: 'REKENING_BARU',
          uraian: t.uraian,
          kekurangan: t.kas_keluar + t.bank_keluar,
          tx_id: t.id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setGalat(json.error ?? 'Permintaan belum terkirim. Coba lagi sebentar lagi.'); return }
      await muat()
    } catch {
      setGalat('Tidak bisa menghubungi server')
    } finally {
      setMengirim(null)
    }
  }

  const sudahDiminta = (txId: number) =>
    permintaan.some(p => p.jenis === 'REKENING_BARU' && p.tx_id === txId)

  return createPortal(
    <div className="blud-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="blud-modal-card rl-reg" role="dialog" aria-modal="true">
        <div className="blud-modal-header">
          <div>
            <div className="blud-modal-title">Perlu Rekening — {parkir.length} transaksi</div>
            <div className="blud-modal-subtitle">
              Tahun {tahun} · Tutup Kas terkunci selama baki ini masih terisi
            </div>
          </div>
          <button className="blud-modal-close" onClick={onClose} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>

        <div className="rl-reg-body">
          {galat && <div className="bk-galat">{galat}</div>}
          {memuat && <div className="bk-kosong">Memuat…</div>}

          {!memuat && !parkir.length && (
            <div className="bk-kosong">
              <Inbox className="w-4 h-4" style={{ display: 'inline', marginRight: 6 }} />
              Baki kosong — semua transaksi sudah menunjuk baris anggaran. Tutup Kas terbuka.
            </div>
          )}

          {!memuat && !!parkir.length && (
            <table className="dpa-table rl-reg-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Tanggal</th>
                  <th>Uraian</th>
                  <th style={{ width: 130 }}>Nilai</th>
                  <th style={{ width: 210 }}>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {parkir.map(t => (
                  <tr key={t.id}>
                    <td className="bk-c bk-num-inline">
                      {t.tanggal.slice(8, 10)} {NAMA_BULAN[t.bulan - 1]}
                    </td>
                    <td>{t.uraian}</td>
                    <td className="bk-r bk-num-inline">
                      {rp(t.kas_keluar + t.bank_keluar || t.kas_masuk + t.bank_masuk)}
                    </td>
                    <td>
                      <div className="bk-aksi" style={{ justifyContent: 'flex-start' }}>
                        <PrimaButton variant="success" size="sm" onClick={() => onSambungkan({
                          id: t.id, version: t.version, tanggal: t.tanggal, jenis: t.jenis, uraian: t.uraian,
                          kas_masuk: t.kas_masuk, kas_keluar: t.kas_keluar,
                          bank_masuk: t.bank_masuk, bank_keluar: t.bank_keluar,
                          status: t.status, alokasi: [], potongan: [],
                        })}>
                          Sambungkan
                        </PrimaButton>
                        <PrimaButton variant="purple" size="sm" disabled={mengirim === t.id || sudahDiminta(t.id)}
                          iconLeft={<Send className="w-3 h-3" />} onClick={() => mintaRekening(t)}>
                          {sudahDiminta(t.id) ? 'Sudah diminta' : mengirim === t.id ? 'Mengirim…' : 'Minta rekening'}
                        </PrimaButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!!permintaan.length && (
            <div className="rl-diff-grup">
              <div className="rl-diff-judul">Permintaan menunggu ({permintaan.length})</div>
              {permintaan.map(p => (
                <div key={p.id} className="rl-diff-baris">
                  <span className="bk-kode">{p.kode_rekening ?? p.jenis}</span>
                  <span className="rl-diff-uraian">{p.uraian}</span>
                  <span className="bk-num-inline">{p.kekurangan > 0 ? `Rp ${rp(p.kekurangan)}` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
