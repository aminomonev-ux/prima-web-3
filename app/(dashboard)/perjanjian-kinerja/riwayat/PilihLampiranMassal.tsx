'use client'
// Pilih versi lampiran BLUD untuk UNDUH MASSAL (banyak dokumen sekaligus).
// Beda dengan PilihLampiranBlud: tidak ada perbandingan nominal per dokumen (yang dicetak
// banyak dokumen sekaligus, masing-masing punya nominal PK sendiri), jadi yang ditawarkan
// hanya versi BLUD tahun itu + "Tanpa lampiran".

import { useEffect, useState, type ReactNode } from 'react'
import PrimaButton from '@/components/ui/PrimaButton'
import { fetchJson } from '@/lib/shared/api'
import type { VersiBlud } from '@/lib/pk/nominal-blud'
import { NAMA_SUMBER_BLUD } from '@/lib/pk/nominal-blud'
import { BATAS_PDF_MASSAL } from '@/lib/pk/unduh-massal'

const tgl = (v: string) => v.split('-').reverse().join('-')
const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const

export default function PilihLampiranMassal({ tahun, jumlah, format, onLanjut, onBatal }: {
  tahun: number
  jumlah: number
  format: 'word' | 'pdf'
  /** `kunci` = "sumber|versi"; '' = tanpa lampiran. */
  onLanjut: (kunci: string) => void
  onBatal: () => void
}) {
  const [kunci, setKunci] = useState('')
  const [versi, setVersi] = useState<VersiBlud[] | null>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBatal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBatal])

  useEffect(() => {
    let dibatalkan = false
    void (async () => {
      const d = await fetchJson(`/api/perjanjian-kinerja/dokumen/bulk-download?tahun=${tahun}`)
      if (dibatalkan) return
      if (!d.ok) { setGalat(d.message); setVersi([]); return }
      const daftar = Array.isArray(d.versi) ? (d.versi as VersiBlud[]) : []
      setVersi(daftar)
    })()
    return () => { dibatalkan = true }
  }, [tahun])

  const opsi = (k: string, isi: ReactNode) => (
    <label key={k || 'tanpa'} style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
      background: kunci === k ? 'rgba(124,92,252,.16)' : 'transparent',
      border: `1px solid ${kunci === k ? 'rgba(124,92,252,.55)' : 'rgba(24,95,165,.35)'}`,
    }}>
      <input type="radio" name="lampiran-massal" checked={kunci === k} onChange={() => setKunci(k)} style={{ marginTop: 3 }} />
      <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0 }}>{isi}</div>
    </label>
  )

  return (
    <div onClick={onBatal} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,15,28,.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Lampiran unduh massal" style={{
        background: '#042C53', borderRadius: 14, border: '1px solid rgba(24,95,165,.5)',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)', width: 'min(560px, 100%)', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', color: '#E6F1FB',
      }}>
        <div style={{ padding: '18px 20px 10px' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Lampiran BLUD untuk {jumlah} dokumen</div>
          <div style={{ fontSize: 12.5, color: '#B5D4F4', marginTop: 6, lineHeight: 1.6 }}>
            Satu versi dipakai untuk semua dokumen terpilih. Lampiran hanya masuk ke dokumen yang
            memuat anggaran BLUD; dokumen tanpa BLUD tetap ikut, tanpa lampiran.
            {format === 'pdf' && ` PDF dibuat satu per satu — maksimal ${BATAS_PDF_MASSAL} dokumen sekali unduh.`}
          </div>
        </div>

        <div style={{ padding: '4px 20px', overflowY: 'auto', display: 'grid', gap: 6 }}>
          {opsi('', <b>Tanpa lampiran</b>)}
          {versi === null && <div style={{ fontSize: 12, color: '#85B7EB', padding: '6px 2px' }}>Memuat versi…</div>}
          {versi !== null && versi.length === 0 && (
            <div style={{ fontSize: 12, color: '#85B7EB', padding: '6px 2px' }}>
              {galat || `Belum ada DPA maupun Pergeseran BLUD tahun ${tahun}.`}
            </div>
          )}
          {versi?.map(v => {
            const k = `${v.sumber}|${v.versi}`
            const ket = [v.catatan, v.berlaku ? 'BERLAKU' : ''].filter(Boolean).join(' · ')
            return opsi(k, (
              <>
                <div><b>{NAMA_SUMBER_BLUD[v.sumber]} {tgl(v.versi)}</b>
                  {ket && <span style={{ color: '#85B7EB' }}> · {ket}</span>}</div>
                <div style={{ color: '#85B7EB' }}>
                  <span style={mono}>{v.jumlah_baris}</span> baris
                </div>
              </>
            ))
          })}
        </div>

        <div style={{ padding: '12px 20px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onBatal}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={() => onLanjut(kunci)}>
            Unduh {jumlah} dokumen
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}
