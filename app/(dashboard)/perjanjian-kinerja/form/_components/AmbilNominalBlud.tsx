'use client'
// Dialog "Ambil nominal BLUD" di panel Anggaran Form PK: pilih DPA / Pergeseran + versinya,
// lihat rincian per label PJ, baru dipakai. Hanya mengisi isian nominal (berhenti di form, L78).
// Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { temaTerang } from '@/components/renaksi/SelarasRenaksi'
import { fetchJson } from '@/lib/shared/api'
import type { HasilNominalBlud } from '@/lib/data/pk-blud-nominal'
import {
  NAMA_SUMBER_BLUD as NAMA_SUMBER, kalimatSumberBlud, labelVersiBlud as label, versiAwal, type VersiBlud,
} from '@/lib/pk/nominal-blud'
import { fmtRp } from '../../_utils/pk-format'

const kunciVersi = (v: Pick<VersiBlud, 'sumber' | 'versi'>) => `${v.sumber}|${v.versi}`

export default function AmbilNominalBlud({ unit, tahun, tambahKe, onPakai, onTutup }: {
  unit: string
  tahun: string
  /** Isi nominal & keterangannya bila nominal BLUD DITAMBAHKAN ke isian lain; null = mengisi. */
  tambahKe: { nominal: number; keterangan: string } | null
  onPakai: (nominal: number, sumber: string) => void
  onTutup: () => void
}) {
  const [daftar, setDaftar] = useState<VersiBlud[] | null>(null)
  const [pilih, setPilih] = useState('')
  const [hasil, setHasil] = useState<{ kunci: string; isi: HasilNominalBlud } | null>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    let batal = false
    ;(async () => {
      const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/blud-nominal?mode=versi&tahun=${encodeURIComponent(tahun)}`)
      if (batal) return
      if (!d.ok) { setGalat(d.message); setDaftar([]); return }
      const list = (d as unknown as { versi: VersiBlud[] }).versi ?? []
      setDaftar(list)
      const awal = versiAwal(list)
      if (awal) setPilih(kunciVersi(awal))
    })()
    return () => { batal = true }
  }, [tahun])

  useEffect(() => {
    if (!pilih) return
    let batal = false
    const [sumber, versi] = pilih.split('|')
    ;(async () => {
      const qs = new URLSearchParams({ unit, tahun, sumber, versi })
      const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/blud-nominal?${qs}`)
      if (batal) return
      if (!d.ok) { setGalat(d.message); return }
      setGalat('')
      setHasil({ kunci: pilih, isi: (d as unknown as { hasil: HasilNominalBlud }).hasil })
    })()
    return () => { batal = true }
  }, [pilih, unit, tahun])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onTutup])

  // Hasil milik pilihan LAIN (jawaban yang belum pulang) tidak boleh dipakai.
  const isi = hasil && hasil.kunci === pilih ? hasil.isi : null
  const memuat = daftar === null || (!!pilih && !isi && !galat)
  const ok = isi?.status === 'OK' ? isi : null
  const terpilih = daftar?.find(v => kunciVersi(v) === pilih) ?? null

  function pakai() {
    if (!ok || !terpilih) return
    const nominal = (tambahKe?.nominal ?? 0) + ok.total
    onPakai(nominal, kalimatSumberBlud(terpilih.sumber, terpilih.versi, ok.perubahan_ke))
  }

  const terang = temaTerang()
  const c = {
    surface: terang ? '#FFFFFF' : '#042C53',
    border: terang ? 'rgba(139,92,246,.18)' : '#0C447C',
    text: terang ? '#1F2937' : '#E6F1FB',
    sub: terang ? '#6B7280' : '#85B7EB',
    head: terang ? '#5B21B6' : '#FAC775',
    input: terang ? '#FFFFFF' : 'rgba(2,15,28,.45)',
    warnBg: terang ? '#FEF3C7' : 'rgba(186,117,23,.14)',
    warnText: terang ? '#854F0B' : '#FAC775',
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Ambil nominal BLUD"
      onClick={e => { if (e.target === e.currentTarget) onTutup() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: c.text }}>Ambil nominal BLUD — {unit}</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '12px 18px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: c.head }}>AMBIL DARI</span>
            <select value={pilih} onChange={e => setPilih(e.target.value)} disabled={!daftar?.length}
              style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.input, color: c.text, fontSize: 13 }}>
              {daftar && !daftar.length && <option value="">— TA {tahun} belum punya DPA BLUD —</option>}
              {(['pergeseran', 'dpa'] as const).map(s => {
                const xs = (daftar ?? []).filter(v => v.sumber === s)
                if (!xs.length) return null
                return (
                  <optgroup key={s} label={s === 'pergeseran' ? 'Pergeseran (pagu pasca-geser)' : 'DPA'}>
                    {xs.map(v => <option key={kunciVersi(v)} value={kunciVersi(v)}>{label(v)}</option>)}
                  </optgroup>
                )
              })}
            </select>
            <span style={{ fontSize: 11.5, color: c.sub }}>
              Angkanya sama dengan BLUD → Cetak → {terpilih?.sumber === 'dpa' ? 'DPA' : 'Pergeseran'} · Penanggung Jawab untuk versi ini. BERLAKU = versi yang sedang jadi pagu.
            </span>
          </label>

          {memuat && <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: c.sub }}><Loader2 size={14} style={{ animation: 'pk-spin 1s linear infinite' }} /> Menghitung…</div>}
          {galat && <div style={{ fontSize: 12.5, color: '#E24B4A' }}>{galat}</div>}

          {isi?.status === 'BELUM_DIPETAKAN' && (
            <Kotak c={c}>
              <b>{unit}</b> belum dipetakan ke Penanggung Jawab BLUD, jadi tidak ada yang bisa dijumlah.
              Atur di <b>Perjanjian Kinerja → Master Unit Kerja → kolom BLUD PJ</b>: pilih label PJ yang menjadi bagian unit ini.
            </Kotak>
          )}
          {isi?.status === 'UNIT_TIDAK_DIKENAL' && <Kotak c={c}><b>{unit}</b> tidak ada di Master Unit Kerja.</Kotak>}
          {isi?.status === 'VERSI_TIDAK_ADA' && <Kotak c={c}>Versi ini sudah tidak ada. Pilih versi lain.</Kotak>}

          {ok && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, color: c.text }}>
                <thead>
                  <tr style={{ color: c.sub, textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', borderBottom: `1px solid ${c.border}` }}>Penanggung Jawab</th>
                    <th style={{ padding: '4px 6px', borderBottom: `1px solid ${c.border}`, textAlign: 'right' }}>Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {ok.per.map(p => (
                    <tr key={p.label}>
                      <td style={{ padding: '4px 6px', borderBottom: `1px solid ${c.border}` }}>
                        {p.label}
                        {!p.ada && <span style={{ display: 'block', fontSize: 11, color: c.warnText }}>Tidak ada baris ber-PJ ini di versi ini.</span>}
                      </td>
                      <td style={{ padding: '4px 6px', borderBottom: `1px solid ${c.border}`, textAlign: 'right', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{fmtRp(p.nominal)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ padding: '6px' }}>Jumlah {unit}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{fmtRp(ok.total)}</td>
                  </tr>
                </tbody>
              </table>

              {ok.dobel.length > 0 && (
                <Kotak c={c}>
                  {ok.dobel.length} baris terhitung dua kali karena induk dan anaknya sama-sama diisi PJ — sama seperti subtotal di Cetak. Cukup isi PJ di salah satunya, lewat {terpilih ? NAMA_SUMBER[terpilih.sumber] : 'BLUD'}:
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {ok.dobel.slice(0, 5).map(d => (
                      <li key={d.rowId}>{d.uraian} ({d.pj}, {fmtRp(d.jumlah)}) — induknya {d.konflik.uraian} ({d.konflik.pj})</li>
                    ))}
                    {ok.dobel.length > 5 && <li>… {ok.dobel.length - 5} lagi</li>}
                  </ul>
                </Kotak>
              )}
              {ok.belumPj.baris > 0 && (
                <div style={{ fontSize: 11.5, color: c.sub }}>
                  Di versi ini {ok.belumPj.baris} baris ({fmtRp(ok.belumPj.nominal)}) belum ber-PJ — uangnya tidak masuk unit PK mana pun sampai PJ-nya diisi.
                </div>
              )}
              {tambahKe && (
                <div style={{ fontSize: 12.5, color: c.text }}>
                  {fmtRp(tambahKe.nominal)} ({tambahKe.keterangan}) + {fmtRp(ok.total)} (BLUD) = <b>{fmtRp(tambahKe.nominal + ok.total)}</b>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={pakai} disabled={!ok}>
            {ok ? (tambahKe ? `Tambahkan ${fmtRp(ok.total)}` : `Pakai ${fmtRp(ok.total)}`) : 'Pakai'}
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}

function Kotak({ c, children }: { c: { warnBg: string; warnText: string }; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: c.warnBg, color: c.warnText, fontSize: 12.5, lineHeight: 1.5 }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  )
}
