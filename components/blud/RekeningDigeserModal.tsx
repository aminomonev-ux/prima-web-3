'use client'
// components/blud/RekeningDigeserModal.tsx — rincian satu versi di panel "Rekening yang
// Digeser" Beranda BLUD: semua rekening, dipisah Bertambah / Berkurang dengan totalnya.
//
// Murni pembacaan — datanya dimuat Beranda bersama panelnya (`VersiPergeseran.semua`),
// jadi nol endpoint & nol pagar baru. Tautan ke layar Pergeseran hanya bagi yang boleh
// membuka menu itu (`bolehBuka`), sama dgn kartu KPI-nya.
// Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md §11

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, Shuffle } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { formatTanggalId } from '@/lib/blud/tanggal'
import {
  pisahDigeser, cocokCari, tautanPergeseran, type RekeningGeser, type VersiPergeseran,
} from '@/lib/blud/rekening-digeser'

const rp = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(n))}`

interface Props {
  tahun:     number
  versi:     VersiPergeseran
  bolehBuka: boolean
  onTutup:   () => void
}

export default function RekeningDigeserModal({ tahun, versi, bolehBuka, onTutup }: Props) {
  const router = useRouter()
  const [cari, setCari] = useState('')
  const rincian = useMemo(() => pisahDigeser(versi.semua), [versi.semua])
  const berimbang = Math.abs(rincian.totalBertambah - rincian.totalBerkurang) < 0.005

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onTutup])

  // Warna lewat kelas (`.blud-digeser-naik/-turun`): hijau terang tak terbaca di tema terang.
  const kolom = (judul: string, daftar: RekeningGeser[], total: number, kelasWarna: string, tanda: string) => {
    const tampil = daftar.filter(r => cocokCari(r, cari))
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>{judul}</span>
          <span className="blud-imp-muted" style={{ fontSize: 11 }}>{daftar.length} rekening</span>
          <span className={`bk-num-inline ${kelasWarna}`} style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800 }}>
            {tanda}{rp(total)}
          </span>
        </div>
        <div style={{ borderTop: '1px solid rgba(127,127,127,.25)' }}>
          {tampil.length === 0 ? (
            <div className="blud-imp-muted" style={{ fontSize: 11.5, fontStyle: 'italic', padding: '10px 0' }}>
              {daftar.length === 0 ? 'Tidak ada.' : 'Tidak ada yang cocok dengan pencarian.'}
            </div>
          ) : tampil.map((r, i) => {
            const isi = (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.uraian || r.kode_rekening}
                  </div>
                  {r.uraian && r.kode_rekening && (
                    <div className="blud-imp-muted bk-num-inline" style={{ fontSize: 10.5 }}>{r.kode_rekening}</div>
                  )}
                </div>
                <div className={`bk-num-inline ${kelasWarna}`} style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {tanda}{rp(Math.abs(r.nominal))}
                </div>
              </>
            )
            const gaya = {
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center',
              padding: '7px 4px', borderBottom: '1px solid rgba(127,127,127,.15)', color: 'inherit', textDecoration: 'none',
            } as const
            // Baris tanpa jangkar tidak bisa dituju `?fokus=` — tampil, tapi bukan tautan.
            return bolehBuka && r.anggaran_key ? (
              <Link key={`${r.anggaran_key}-${i}`} href={tautanPergeseran({ tahun, versi: versi.versi_tanggal, anggaran_key: r.anggaran_key })}
                className="blud-digeser-baris" style={gaya}>
                {isi}
              </Link>
            ) : (
              <div key={`${r.kode_rekening}-${i}`} style={gaya}>{isi}</div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Rekening yang digeser ${formatTanggalId(versi.versi_tanggal)}`}
        className="blud-imp-text blud-digeser-modal"
        style={{ borderRadius: 14, width: 'min(980px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid rgba(127,127,127,.2)', flexWrap: 'wrap' }}>
          <Shuffle size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Rekening yang digeser — {formatTanggalId(versi.versi_tanggal)}</div>
          {versi.catatan && <span className="blud-imp-pill on-purple">{versi.catatan}</span>}
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="blud-imp-muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>
            {versi.semua.length} rekening berubah pagu di versi ini — selisih bersih per rekening terhadap DPA acuannya.
            {bolehBuka && ' Klik rekening untuk membukanya di layar Pergeseran.'}
          </p>
          <input className="blud-imp-input" placeholder="Cari kode / uraian…" value={cari}
            onChange={e => setCari(e.target.value)} style={{ width: 'min(320px, 100%)' }} />
        </div>

        <div className="blud-digeser-grid" style={{ padding: '12px 18px', overflowY: 'auto', flex: 1 }}>
          {kolom('Bertambah', rincian.bertambah, rincian.totalBertambah, 'blud-digeser-naik', '+')}
          {kolom('Berkurang', rincian.berkurang, rincian.totalBerkurang, 'blud-digeser-turun', '−')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: '1px solid rgba(127,127,127,.2)', flexWrap: 'wrap' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5 }}>
            {berimbang
              ? 'Berimbang — total bertambah sama dengan total berkurang.'
              : `Belum berimbang (draf) — selisih ${rp(Math.abs(rincian.totalBertambah - rincian.totalBerkurang))}.`}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {bolehBuka && (
              <PrimaButton variant="purple" size="sm"
                onClick={() => router.push(tautanPergeseran({ tahun, versi: versi.versi_tanggal }))}>
                Buka versi ini
              </PrimaButton>
            )}
            <PrimaButton variant="ghost" size="sm" onClick={onTutup}>Tutup</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
