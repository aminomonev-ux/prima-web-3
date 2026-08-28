'use client'
// components/blud/PeriodeVersiSelect.tsx
// Pilih periode versi yang akan DITULIS — bulan berjalan (bawaan) atau bulan
// lampau yang belum punya versi. Dipakai layar DPA & Pergeseran.
//
// Reuse kelas .versi-* (globals.css) seperti TahunDropdown: kelas itu sudah
// punya padanan [data-theme="light"], jadi tidak ada warna baru yang perlu
// dinyatakan sendiri per tema.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronDown, Check } from 'lucide-react'
import {
  periodeHistorisTersedia, labelPeriodeVersi, tanggalPeriodeHistoris, type PeriodeVersi,
} from '@/lib/blud/tanggal'

interface Props {
  tahun:    number
  /** `versi_tanggal` yang sudah ada di tahun itu — bulan yang terpakai tidak ditawarkan. */
  versiTerpakai: readonly string[]
  /** '' = bulan berjalan (perilaku bawaan). */
  value:    string
  onChange: (tanggal: string) => void
}

export default function PeriodeVersiSelect({ tahun, versiTerpakai, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Daftarnya memuat DUA hal yang tampak sama tapi berbeda akibatnya:
  //   • bulan kosong  → memilihnya MENYIAPKAN arsip baru (layar dikosongkan)
  //   • bulan berarsip → memilihnya MEMBUKA arsipnya    (layar dimuat)
  //
  // Kelompok kedua dulu tidak ada sama sekali: `periodeHistorisTersedia` memang
  // hanya menawarkan bulan yang masih kosong, jadi begitu Juli tersimpan ia
  // lenyap dari sini dan satu-satunya jalan kembali ke Juli lewat daftar VERSI.
  // Dua tempat untuk satu maksud, dan orang harus tahu keduanya lebih dulu.
  const { pilihan, berarsip } = useMemo(() => {
    const kosong = periodeHistorisTersedia(tahun, versiTerpakai)
    // Hanya tanggal akhir-bulan yang dihitung arsip periode. Versi bertanggal 26
    // Juli itu revisi harian yang kebetulan lahir di Juli — tempatnya di daftar
    // versi, bukan di sini, karena menyimpannya tidak mendarat di 31 Juli.
    const arsip = versiTerpakai
      .map(v => String(v))
      .filter(v => tanggalPeriodeHistoris(v))
    const dariArsip: PeriodeVersi[] = arsip.map(v => ({
      bulan:   Number(v.slice(5, 7)),
      label:   labelPeriodeVersi(v),
      tanggal: v,
    }))
    return {
      pilihan:  [...kosong, ...dariArsip].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
      berarsip: new Set(arsip),
    }
  }, [tahun, versiTerpakai])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Bulan lampaunya sudah terisi semua (atau tahunnya belum mulai) — tidak ada
  // yang bisa dipilih selain bulan berjalan. Menyembunyikannya menjaga bilah
  // tombol tetap ringkas pada pemakaian sehari-hari, yang memang mayoritas.
  if (pilihan.length === 0 && !value) return null

  const terpilih = pilihan.find(p => p.tanggal === value)

  return (
    <div ref={wrapRef} className="versi-dropdown versi-dropdown--brutalist">
      <button
        type="button"
        className="versi-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tooltip="Periode versi yang akan ditulis saat Simpan"
      >
        <CalendarClock className="w-3.5 h-3.5 versi-icon" />
        <span className="versi-label">
          {terpilih
            ? <>Periode <b>{terpilih.label}</b></>
            : <>Periode <b>bulan berjalan</b></>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`versi-item ${!value ? 'active' : ''}`}
            onClick={() => { onChange(''); setOpen(false) }}
          >
            <CalendarClock className="w-3 h-3 versi-item-icon" />
            <span className="versi-item-date">Bulan berjalan (hari ini)</span>
            {!value && <Check className="w-3.5 h-3.5 versi-item-check" />}
          </button>

          {pilihan.map(p => {
            const active = p.tanggal === value
            return (
              <button
                type="button"
                key={p.tanggal}
                role="option"
                aria-selected={active}
                className={`versi-item ${active ? 'active' : ''}`}
                onClick={() => { onChange(p.tanggal); setOpen(false) }}
              >
                <CalendarClock className="w-3 h-3 versi-item-icon" />
                <span className="versi-item-date">{p.label}</span>
                {berarsip.has(p.tanggal) &&
                  <span className="versi-item-meta">· sudah ada arsipnya</span>}
                {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
