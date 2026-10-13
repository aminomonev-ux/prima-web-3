'use client'
// components/blud/RealisasiPjModal.tsx — rincian satu Penanggung Jawab di layar Realisasi:
// rekening yang ditanggungnya, dan transaksi yang membebani rekening-rekening itu.
//
// Rekeningnya dipinjam dari baris layar (`daunMilikPj`, aturan yang sama dgn rekapnya);
// transaksinya dari `GET /api/blud/realisasi/register?pj=` — pagar & batas laju register.
// Murni pembacaan. Konsep: docs/CONCEPT-blud-realisasi-pj.md

import { useEffect, useMemo, useState } from 'react'
import { X, UserRound } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { formatTanggalId } from '@/lib/blud/tanggal'
import { daunMilikPj, LABEL_TANPA_PJ, type BarisPj, type RekapPj } from '@/lib/blud/realisasi-pj'

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

interface TxPj {
  id: number; tanggal: string; no_kwt: number | null; uraian: string
  anggaran_key: string; kode_rekening: string; uraian_rekening: string
  nilai: number; total_kuitansi: number
}

interface Props<T extends BarisPj> {
  tahun:     number
  bulan:     number
  namaBulan: string
  rekap:     RekapPj
  rows:      readonly T[]
  /** Membuka register satu rekening (panel yang sudah ada). */
  onBukaRekening: (row: T) => void
  onTutup:   () => void
}

export default function RealisasiPjModal<T extends BarisPj>({
  tahun, bulan, namaBulan, rekap, rows, onBukaRekening, onTutup,
}: Props<T>) {
  const [tab, setTab] = useState<'rekening' | 'transaksi'>('rekening')
  const [tx, setTx] = useState<{ rows: TxPj[]; total: number } | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const label = rekap.pj || LABEL_TANPA_PJ
  const daun = useMemo(() => daunMilikPj(rows, rekap.pj), [rows, rekap.pj])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onTutup])

  // Dimuat sekali per PJ/bulan, saat tab Transaksi pertama dibuka.
  useEffect(() => {
    if (tab !== 'transaksi' || tx || galat) return
    let hidup = true
    void (async () => {
      try {
        const qs = new URLSearchParams({ tahun: String(tahun), pj: rekap.pj, sampai_bulan: String(bulan) })
        const res = await fetch(`/api/blud/realisasi/register?${qs.toString()}`)
        const json = await res.json()
        if (!hidup) return
        if (!res.ok || !json.ok) { setGalat(json.error ?? 'Transaksi tidak bisa dimuat.'); return }
        setTx({ rows: json.data.rows, total: json.data.total })
      } catch {
        if (hidup) setGalat('Server tidak bisa dihubungi. Periksa sambungan, lalu coba lagi.')
      }
    })()
    return () => { hidup = false }
  }, [tab, tx, galat, tahun, bulan, rekap.pj])

  return (
    <div onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Realisasi ${label}`}
        className="blud-imp-text blud-digeser-modal"
        style={{ borderRadius: 14, width: 'min(1080px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid rgba(127,127,127,.2)', flexWrap: 'wrap' }}>
          <UserRound size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
          <span className="blud-imp-pill on-purple">s.d. {namaBulan} {tahun}</span>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div className="rl-pj-ringkas" style={{ padding: '12px 18px 0' }}>
          {([
            ['Pagu', rekap.pagu], [namaBulan, rekap.bulan_ini], [`s.d. ${namaBulan}`, rekap.sd_bulan], ['Sisa', rekap.sisa],
          ] as const).map(([k, v]) => (
            <div key={k}>
              <div className="blud-imp-muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{k}</div>
              <div className="bk-num-inline" style={{ fontSize: 13.5, fontWeight: 800 }}>Rp {rp(v)}</div>
            </div>
          ))}
          <div>
            <div className="blud-imp-muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Serapan</div>
            <div className="bk-num-inline" style={{ fontSize: 13.5, fontWeight: 800 }}>{rekap.pagu > 0 ? `${Math.round(rekap.persen)}%` : '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 18px 0' }}>
          {([['rekening', `Rekening (${daun.length})`], ['transaksi', 'Transaksi']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rl-saring-chip ${tab === k ? 'aktif' : ''}`}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '10px 18px', overflowY: 'auto', flex: 1 }}>
          {tab === 'rekening' ? (
            daun.length === 0 ? <div className="blud-imp-muted" style={{ fontSize: 12, padding: 16, textAlign: 'center' }}>Tidak ada rekening.</div> : (
              <table className="bk-table rl-pj-tabel" style={{ width: '100%', fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Kode</th><th style={{ textAlign: 'left' }}>Uraian</th>
                    <th className="bk-r">Pagu</th><th className="bk-r">s.d. {namaBulan}</th><th className="bk-r">Sisa</th><th className="bk-c">%</th>
                  </tr>
                </thead>
                <tbody>
                  {daun.map(r => {
                    const acuan = r.sd_bulan ?? r.terserap
                    return (
                      <tr key={r.anggaran_key}>
                        <td className="bk-num-inline" style={{ wordBreak: 'break-all' }}>{r.kode_rekening || '—'}</td>
                        <td>
                          <button type="button" className="rl-uraian" onClick={() => onBukaRekening(r)}
                            data-tooltip="Lihat transaksinya (register)">{r.uraian}</button>
                        </td>
                        <td className="bk-r bk-num-inline">{rp(r.pagu)}</td>
                        <td className="bk-r bk-num-inline">{acuan ? rp(acuan) : ''}</td>
                        <td className="bk-r bk-num-inline">{rp(r.pagu - acuan)}</td>
                        <td className="bk-c bk-num-inline">{r.pagu > 0 ? Math.round((acuan / r.pagu) * 100) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : galat ? (
            <div className="bk-warn">{galat}</div>
          ) : !tx ? (
            <div className="blud-imp-muted" style={{ fontSize: 12, padding: 16, textAlign: 'center' }}>Memuat transaksi…</div>
          ) : tx.rows.length === 0 ? (
            <div className="blud-imp-muted" style={{ fontSize: 12, padding: 16, textAlign: 'center' }}>Belum ada transaksi sampai {namaBulan}.</div>
          ) : (
            <table className="bk-table rl-pj-tabel" style={{ width: '100%', fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Tanggal</th><th className="bk-c">No. Kwt</th>
                  <th style={{ textAlign: 'left' }}>Uraian</th><th style={{ textAlign: 'left' }}>Rekening</th><th className="bk-r">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {tx.rows.map((t, i) => (
                  <tr key={`${t.id}-${t.anggaran_key}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatTanggalId(t.tanggal)}</td>
                    <td className="bk-c bk-num-inline">{t.no_kwt ?? '—'}</td>
                    <td>{t.uraian}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.uraian_rekening || '(rekening tidak ada di versi pagu)'}</div>
                      <div className="blud-imp-muted bk-num-inline" style={{ fontSize: 10.5 }}>{t.kode_rekening}</div>
                    </td>
                    <td className="bk-r bk-num-inline">
                      {rp(t.nilai)}
                      {/* Satu kuitansi bisa dibagi ke rekening PJ lain — yang ditampilkan bagian PJ ini saja. */}
                      {t.total_kuitansi - t.nilai > 0.005 && (
                        <div className="blud-imp-muted" style={{ fontSize: 10, fontWeight: 500 }}>
                          bagian dari kuitansi Rp {rp(t.total_kuitansi)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bk-total">
                  <td colSpan={4} className="bk-r">JUMLAH</td>
                  <td className="bk-r bk-num-inline">{rp(tx.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: '1px solid rgba(127,127,127,.2)', flexWrap: 'wrap' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5 }}>
            PJ rekening = PJ di baris itu atau induk terdekatnya, menurut versi pagu yang berlaku sekarang.
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <PrimaButton variant="ghost" size="sm" onClick={onTutup}>Tutup</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
