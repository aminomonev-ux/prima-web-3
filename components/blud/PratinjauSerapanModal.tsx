'use client'
// components/blud/PratinjauSerapanModal.tsx — Pratinjau Serapan (Tahap 2).
//
// Bendahara mengisi realisasi Januari–Agustus dengan MENGETIK satu per satu —
// tidak ada jalur impor untuk transaksi. Pagar pagu (`kunciDanPeriksaPagu`)
// menolak per transaksi, jadi rekening yang plafonnya kurang baru ketahuan di
// transaksi ke sekian, sesudah puluhan lainnya terlanjur masuk. Layar ini
// memindahkan kesadaran itu ke DEPAN: rekening mana yang akan menembus, dan
// kurang berapa — supaya pergeserannya diurus lebih dulu.
//
// MURNI PEMBACAAN. Nol endpoint baru, nol kolom, nol tulisan. Barisnya dipinjam
// dari layar Realisasi yang sudah memuatnya, jadi tidak ada pagar akses atau
// sakelar maintenance baru yang harus dijaga (L72).

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Calculator, AlertTriangle, Copy } from 'lucide-react'
import { toast } from 'sonner'
import PrimaButton from '@/components/ui/PrimaButton'
import { InputNominal } from '@/components/ui/input-nominal'
import { formatTanggalId } from '@/lib/blud/tanggal'
import {
  hitungPratinjau, bandingMepet, akanMenembus, mepetSetahun, daftarPerluGeser, AMBANG_MEPET,
  type BarisPratinjau,
} from '@/lib/blud/pratinjau-serapan'

/**
 * `BarisPratinjau` sengaja tipe struktural minimal, bukan impor `BarisRealisasi`
 * dari layarnya: `components/` tidak boleh bergantung pada `app/`. Pola yang
 * sama dipakai `AuditPjRow` di menu Cetak. `sisa` tidak ikut — lihat alasannya
 * di `lib/blud/pratinjau-serapan.ts`.
 */
interface Props {
  tahun:       number
  rows:        BarisPratinjau[]
  sumberVersi: string | null
  onTutup:     () => void
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

type Saring = 'semua' | 'jebol' | 'mepet' | 'terisi'

const SARING_LABEL: Record<Saring, string> = {
  semua:  'Semua rekening',
  jebol:  'Akan menembus',
  mepet:  `Sisa di bawah ${Math.round(AMBANG_MEPET * 100)}%`,
  terisi: 'Yang saya isi',
}

export default function PratinjauSerapanModal({ tahun, rows, sumberVersi, onTutup }: Props) {
  // Rencana belanja yang sedang diketik. Tidak disimpan ke mana pun — hilang
  // begitu modal ditutup, dan itu memang maksudnya: ini kertas coretan.
  const [rencana, setRencana] = useState<Record<string, number>>({})
  const [saring, setSaring]   = useState<Saring>('semua')
  const [cari, setCari]       = useState('')
  const [urutKode, setUrutKode] = useState(false)
  /** Jalan cadangan kalau peramban menolak Clipboard API — lihat `salinDaftar`. */
  const [teksSalin, setTeksSalin] = useState<string | null>(null)
  const salinRef = useRef<HTMLTextAreaElement>(null)

  // Menyorot lewat efek, BUKAN di dalam `ref` callback: callback-nya jalan tiap
  // render, jadi mengetik satu angka di tabel akan merebut fokus balik ke kotak
  // ini terus-menerus.
  useEffect(() => {
    if (teksSalin === null) return
    salinRef.current?.focus()
    salinRef.current?.select()
  }, [teksSalin])

  const dihitung = useMemo(() => hitungPratinjau(rows, rencana), [rows, rencana])

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    let hasil = dihitung.filter((r) => {
      if (q && !r.kode_rekening.toLowerCase().includes(q) && !r.uraian.toLowerCase().includes(q)) return false
      if (saring === 'jebol')  return akanMenembus(r)
      if (saring === 'mepet')  return mepetSetahun(r.pagu, r.sisaSetelah)
      if (saring === 'terisi') return r.tambah > 0
      return true
    })
    hasil = [...hasil]
    hasil.sort((a, b) => urutKode
      ? a.kode_rekening.localeCompare(b.kode_rekening)
      : bandingMepet(a, b))
    return hasil
  }, [dihitung, cari, saring, urutKode])

  const jebol = useMemo(() => dihitung.filter(akanMenembus), [dihitung])
  const totalKurang = jebol.reduce((s, r) => s + r.kurang, 0)
  const adaIsian = dihitung.some(r => r.tambah > 0)

  async function salinDaftar() {
    if (!jebol.length) return
    setTeksSalin(null)
    const teks = daftarPerluGeser(tahun, sumberVersi, jebol)
    try {
      await navigator.clipboard.writeText(teks)
      toast.success(`${jebol.length} rekening disalin — tinggal ditempel ke pesan atau catatan.`)
    } catch {
      // Clipboard API bisa ditolak peramban (bukan HTTPS, izin dicabut, dokumen
      // tidak fokus). Menyuruh "blok daftarnya lalu Ctrl+C" percuma — yang di
      // layar tabel, bukan teks yang bisa diblok. Jadi teksnya dimunculkan
      // sendiri dalam kotak, sudah tersorot, tinggal ditekan Ctrl+C.
      setTeksSalin(teks)
    }
  }

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(1180px, 97vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <Calculator size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Pratinjau Serapan {tahun}</div>
          {sumberVersi && (
            <span className="blud-imp-pill on-purple">Pagu dari versi {formatTanggalId(sumberVersi)}</span>
          )}
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="blud-imp-muted" style={{ fontSize: 11.5, lineHeight: 1.65, margin: 0 }}>
            Isi kolom <b>Rencana belanja</b> dengan angka yang belum Anda masukkan ke Buku Kas —
            misalnya total Januari–Agustus dari catatan manual. Tidak ada yang disimpan; ini kertas
            coretan untuk tahu <b>sebelum mengetik</b> rekening mana yang plafonnya kurang.
            Pagu berlaku <b>setahun penuh</b>, bukan per bulan — mengisi DPA Januari tidak membuat
            belanja Januari diukur terhadap pagu Januari.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {(Object.keys(SARING_LABEL) as Saring[]).map(s => (
              <button key={s} type="button" onClick={() => setSaring(s)}
                className={`blud-imp-pill${saring === s ? ' on-purple' : ''}`}
                style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
                {SARING_LABEL[s]}
                {s === 'jebol' && jebol.length > 0 ? ` (${jebol.length})` : ''}
              </button>
            ))}
            <input className="blud-imp-input" placeholder="Cari kode / uraian…"
              value={cari} onChange={e => setCari(e.target.value)}
              style={{ width: 200, marginLeft: 4 }} />
            <button type="button" onClick={() => setUrutKode(u => !u)}
              className="blud-imp-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}>
              Urut: {urutKode ? 'kode rekening' : 'paling mepet dulu'}
            </button>
          </div>

          {jebol.length > 0 && (
            <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <b>{jebol.length} rekening</b> akan ditolak saat transaksinya dimasukkan — total
                kekurangan <b className="bk-num-inline">Rp {rp(totalKurang)}</b>. Uruskan
                pergeserannya dulu, atau kurangi belanjanya.
              </span>
            </div>
          )}
        </div>

        {teksSalin !== null && (
          <div style={{ padding: '12px 20px 0' }}>
            <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, marginBottom: 8 }}>
              Peramban menolak menyalin sendiri. Daftarnya sudah tersorot di bawah — tekan Ctrl+C.
            </div>
            <textarea
              readOnly
              value={teksSalin}
              rows={Math.min(10, teksSalin.split('\n').length)}
              ref={salinRef}
              className="blud-imp-input"
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, lineHeight: 1.6, resize: 'vertical' }}
            />
          </div>
        )}

        <div style={{ padding: '12px 20px 0', overflowY: 'auto', flex: 1 }}>
          <div style={{ overflowX: 'auto' }}>
            {/* Lebar dipatok supaya kolom isian tidak terdorong ke luar layar
                oleh uraian yang panjang — itu satu-satunya kolom yang harus
                dijangkau, dan menyembunyikannya membuat layar ini tak berguna. */}
            <table className="bk-table" style={{ width: '100%', minWidth: 980, fontSize: 11.5, tableLayout: 'fixed' }}>
              <colgroup>
                {/* Kode rekening BLUD bisa 26 karakter monospace — dipatok selebar
                    itu supaya tidak patah jadi dua baris di tengah angkanya. */}
                <col style={{ width: 215 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>KODE</th>
                  <th style={{ textAlign: 'left' }}>URAIAN</th>
                  <th style={{ textAlign: 'right' }}>PAGU</th>
                  <th style={{ textAlign: 'right' }}>SUDAH TERSERAP</th>
                  <th style={{ textAlign: 'right' }}>SISA</th>
                  <th style={{ textAlign: 'right' }}>RENCANA BELANJA</th>
                  <th style={{ textAlign: 'right' }}>SESUDAHNYA</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((r) => {
                  const menembus = akanMenembus(r)
                  return (
                    <tr key={r.anggaran_key} className={menembus ? 'rl-row-minus' : ''}>
                      <td className="bk-num-inline" style={{ wordBreak: 'break-all' }}>{r.kode_rekening}</td>
                      <td>{r.uraian}</td>
                      <td className="bk-r bk-num-inline">{rp(r.pagu)}</td>
                      <td className="bk-r bk-num-inline">{rp(r.terserap)}</td>
                      <td className="bk-r bk-num-inline">{rp(r.sisaSekarang)}</td>
                      <td className="bk-r">
                        <InputNominal
                          value={r.tambah}
                          onChange={v => setRencana(prev => ({ ...prev, [r.anggaran_key]: v }))}
                          className="blud-imp-input"
                          style={{ width: '100%', textAlign: 'right' }}
                        />
                      </td>
                      <td className="bk-r bk-num-inline" style={{ fontWeight: 700 }}>
                        {menembus
                          ? <span style={{ color: '#E24B4A' }}>kurang {rp(r.kurang)}</span>
                          : <span>sisa {rp(r.sisaSetelah)}</span>}
                      </td>
                    </tr>
                  )
                })}
                {tampil.length === 0 && (
                  <tr>
                    <td colSpan={7} className="blud-imp-muted" style={{ padding: 20, textAlign: 'center' }}>
                      Tidak ada rekening yang cocok dengan saringan ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5 }}>
            {dihitung.length} rekening bisa menerima realisasi · {tampil.length} ditampilkan
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {adaIsian && (
              <PrimaButton variant="ghost" size="sm" onClick={() => setRencana({})}>
                Kosongkan isian
              </PrimaButton>
            )}
            <PrimaButton variant="success" size="sm" iconLeft={<Copy className="w-3.5 h-3.5" />}
              disabled={jebol.length === 0} onClick={salinDaftar}
              data-tooltip={jebol.length === 0 ? 'Belum ada rekening yang menembus pagu' : ''}>
              Salin daftar yang perlu digeser
            </PrimaButton>
            <PrimaButton variant="ghost" size="sm" onClick={onTutup}>Tutup</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
