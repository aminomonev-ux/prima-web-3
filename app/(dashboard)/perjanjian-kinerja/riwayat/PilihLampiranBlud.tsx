'use client'
// Pilih sumber lampiran "Rincian anggaran BLUD per penanggung jawab" sebelum Preview / Unduh
// Word / Unduh PDF. Konsep: docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md.

import { useEffect, useState, type ReactNode } from 'react'
import PrimaButton from '@/components/ui/PrimaButton'
import type { PilihanLampiran } from '@/lib/data/pk-lampiran-blud'
import { NAMA_SUMBER_BLUD } from '@/lib/pk/nominal-blud'

export type AksiUnduh = 'preview' | 'word' | 'pdf'

const LABEL_AKSI: Record<AksiUnduh, string> = { preview: 'Tampilkan', word: 'Unduh Word', pdf: 'Unduh PDF' }
const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
const tgl = (v: string) => v.split('-').reverse().join('-')

/** `kunci` = "sumber|versi"; '' = tanpa lampiran. Pilihan awal: versi terbaru yang cocok. */
export function pilihanAwal(hasil: PilihanLampiran): string {
  if (hasil.status !== 'OK') return ''
  const v = hasil.versi.find(x => x.kecocokan === 'cocok')
  return v ? `${v.sumber}|${v.versi}` : ''
}

export function queryLampiran(kunci: string): string {
  if (!kunci) return ''
  const [sumber, versi] = kunci.split('|')
  return `&sumber=${sumber}&versi=${versi}`
}

export default function PilihLampiranBlud({ hasil, aksi, onLanjut, onBatal }: {
  hasil: PilihanLampiran
  aksi: AksiUnduh
  onLanjut: (kunci: string) => void
  onBatal: () => void
}) {
  const [kunci, setKunci] = useState(() => pilihanAwal(hasil))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBatal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBatal])

  const pk = hasil.status === 'TANPA_BLUD' ? null : hasil.pk
  const opsi = (k: string, isi: ReactNode, mati = false) => (
    <label key={k || 'tanpa'} style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8,
      cursor: mati ? 'not-allowed' : 'pointer', opacity: mati ? .55 : 1,
      background: kunci === k ? 'rgba(124,92,252,.16)' : 'transparent',
      border: `1px solid ${kunci === k ? 'rgba(124,92,252,.55)' : 'rgba(24,95,165,.35)'}`,
    }}>
      <input type="radio" name="lampiran-blud" checked={kunci === k} disabled={mati}
        onChange={() => setKunci(k)} style={{ marginTop: 3 }} />
      <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0 }}>{isi}</div>
    </label>
  )

  return (
    <div onClick={onBatal} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,15,28,.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Lampiran rincian BLUD" style={{
        background: '#042C53', borderRadius: 14, border: '1px solid rgba(24,95,165,.5)',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)', width: 'min(560px, 100%)', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', color: '#E6F1FB',
      }}>
        <div style={{ padding: '18px 20px 10px' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Lampiran rincian BLUD per penanggung jawab</div>
          <div style={{ fontSize: 12.5, color: '#B5D4F4', marginTop: 6, lineHeight: 1.6 }}>
            Pilih versi DPA atau Pergeseran BLUD yang dilampirkan di halaman terakhir. Berkas Perjanjian Kinerja
            yang tersimpan tidak berubah.
            {pk && !pk.campuran && <> Nominal BLUD di dokumen ini: <b style={mono}>{rp(pk.nominal)}</b>.</>}
            {pk?.campuran && <> Sebagian anggaran dokumen ini tercatat gabungan (mis. &quot;APBD &amp; BLUD&quot;), jadi kecocokannya tidak bisa diperiksa.</>}
          </div>
        </div>

        <div style={{ padding: '4px 20px', overflowY: 'auto', display: 'grid', gap: 6 }}>
          {opsi('', <b>Tanpa lampiran</b>)}
          {(hasil.status === 'UNIT_TIDAK_DIKENAL' || hasil.status === 'BELUM_DIPETAKAN') && (
            <div style={{ fontSize: 12, color: '#FAC775', lineHeight: 1.6, padding: '6px 2px' }}>
              {hasil.status === 'UNIT_TIDAK_DIKENAL'
                ? 'Unit pihak pertama tidak ada di Master Unit Kerja, jadi rincian per penanggung jawab tidak bisa disusun.'
                : 'Unit pihak pertama belum dipetakan ke penanggung jawab BLUD (Master Unit Kerja → kolom BLUD PJ), jadi rincian tidak bisa disusun.'}
            </div>
          )}
          {hasil.status === 'OK' && hasil.versi.length === 0 && (
            <div style={{ fontSize: 12, color: '#85B7EB', padding: '6px 2px' }}>Belum ada DPA maupun Pergeseran BLUD tahun ini.</div>
          )}
          {hasil.status === 'OK' && hasil.versi.map(v => {
            const k = `${v.sumber}|${v.versi}`
            const keterangan = [v.catatan, v.berlaku ? 'BERLAKU' : ''].filter(Boolean).join(' · ')
            return opsi(k, (
              <>
                <div><b>{NAMA_SUMBER_BLUD[v.sumber]} {tgl(v.versi)}</b>
                  {keterangan && <span style={{ color: '#85B7EB' }}> · {keterangan}</span>}</div>
                {v.total == null
                  ? <div style={{ color: '#85B7EB' }}>Versi ini kosong.</div>
                  : <div>
                      <span style={mono}>{rp(v.total)}</span>
                      {v.kecocokan === 'cocok' && <span style={{ color: '#6EE7B7', fontWeight: 700 }}> · sama dengan nominal PK</span>}
                      {v.kecocokan === 'beda' && pk && (
                        <span style={{ color: '#FCA5A5', fontWeight: 700 }}>
                          {' '}· {v.total > pk.nominal ? 'lebih' : 'kurang'} {rp(Math.abs(v.total - pk.nominal))} dari nominal PK
                        </span>
                      )}
                    </div>}
              </>
            ), v.total == null)
          })}
        </div>

        <div style={{ padding: '12px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasil.status === 'OK' && kunci && hasil.versi.find(v => `${v.sumber}|${v.versi}` === kunci)?.kecocokan === 'beda' && (
            <div style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.5 }}>
              Jumlah versi ini berbeda dari nominal BLUD di Perjanjian Kinerja. Selisihnya akan ditulis di lampiran dengan huruf merah.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <PrimaButton variant="ghost" onClick={onBatal}>Batal</PrimaButton>
            <PrimaButton variant="purple" onClick={() => onLanjut(kunci)} autoFocus>{LABEL_AKSI[aksi]}</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
