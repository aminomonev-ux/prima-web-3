'use client'
// components/blud/VersiDropdown.tsx
// Custom pill-shaped dropdown untuk pilih versi DPA / Pergeseran.
// Theme-aware (dark default + light override via [data-theme="light"]).
//
// Tiap tanggal bisa dibuka untuk melihat RIWAYAT SIMPAN-nya (per jam-menit).
// Memilih versi dan memilih satu simpanan itu tindakan yang sama di kedalaman
// berbeda — dua-duanya memuat isi ke form — jadi tempatnya juga sama. Anak
// barisnya tertutup secara default supaya dropdown tidak meledak jadi 50 baris.

import { useEffect, useRef, useState } from 'react'
import { History, ChevronDown, ChevronRight, Check, RotateCcw } from 'lucide-react'
import { formatTanggalId } from '@/lib/blud/tanggal'

export interface VersiItem {
  versi_tanggal: string         // YYYY-MM-DD
  jumlah_baris?: number         // opsional (DPA pakai, Pergeseran tidak)
}

/** Satu klik Simpan. Bentuknya sengaja sama dengan `RiwayatSimpanItem` di server. */
export interface SimpananItem {
  id:                 number
  versi_tanggal:      string
  disimpan_pada:      string   // 'YYYY-MM-DD HH:MM:SS'
  versi_ke:           number
  jumlah_baris:       number
  disimpan_oleh_nama: string | null
}

interface Props {
  value:    string                   // tanggal terpilih (kosong = belum pilih)
  items:    VersiItem[]              // daftar versi (urut desc dari terbaru)
  onChange: (versi: string) => void
  placeholder?: string
  /** Riwayat simpan seluruh tahun; dikelompokkan per tanggal di dalam. */
  riwayat?: SimpananItem[]
  /** Dipanggil saat satu simpanan lama dipilih untuk dimuat ke form. */
  onPulihkan?: (s: SimpananItem) => void
}

const formatTanggal = formatTanggalId

/** '2026-08-26 14:32:05' → '14:32'. Nilai tak dikenal dikembalikan apa adanya. */
function jamMenit(waktu: string): string {
  const m = /\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/.exec(waktu)
  return m ? m[1] : waktu
}

export default function VersiDropdown({
  value, items, onChange, placeholder = '— Pilih Versi —', riwayat, onPulihkan,
}: Props) {
  const [open, setOpen] = useState(false)
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click outside → close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = items.find(i => i.versi_tanggal === value)
  // Asumsi item[0] = terbaru karena API sudah ORDER BY versi_tanggal DESC
  const berlakuTanggal = items[0]?.versi_tanggal

  const simpananUntuk = (tgl: string) => (riwayat ?? []).filter(s => s.versi_tanggal === tgl)

  return (
    <div ref={wrapRef} className="versi-dropdown versi-dropdown--brutalist">
      <button
        type="button"
        className="versi-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <History className="w-3.5 h-3.5 versi-icon" />
        <span className="versi-label">
          {selected
            ? <>
                {formatTanggal(selected.versi_tanggal)}
                {typeof selected.jumlah_baris === 'number' &&
                  <span className="versi-meta"> · {selected.jumlah_baris} baris</span>}
              </>
            : <span className="versi-placeholder">{placeholder}</span>}
        </span>
        {selected && selected.versi_tanggal === berlakuTanggal && (
          <span className="versi-badge-latest versi-badge-latest--trigger">BERLAKU</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          {items.length === 0 ? (
            <div className="versi-empty">Belum ada versi tersimpan</div>
          ) : (
            items.map(item => {
              const active    = item.versi_tanggal === value
              const isBerlaku = item.versi_tanggal === berlakuTanggal
              const simpanan  = simpananUntuk(item.versi_tanggal)
              const mekar     = terbuka === item.versi_tanggal
              return (
                <div key={item.versi_tanggal}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`versi-item ${active ? 'active' : ''}`}
                    onClick={() => { onChange(item.versi_tanggal); setOpen(false) }}
                  >
                    {simpanan.length > 1 ? (
                      // Panah punya onClick sendiri + stopPropagation: membuka
                      // riwayat tidak boleh sekalian mengganti versi yang dimuat.
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={mekar ? 'Tutup riwayat simpan' : 'Lihat riwayat simpan'}
                        className={`versi-riwayat-toggle ${mekar ? 'open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setTerbuka(t => t === item.versi_tanggal ? null : item.versi_tanggal)
                        }}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    ) : (
                      <History className="w-3 h-3 versi-item-icon" />
                    )}
                    <span className="versi-item-date">{formatTanggal(item.versi_tanggal)}</span>
                    {typeof item.jumlah_baris === 'number' && (
                      <span className="versi-item-meta">· {item.jumlah_baris} baris</span>
                    )}
                    {simpanan.length > 1 && (
                      <span className="versi-item-meta">· {simpanan.length}× simpan</span>
                    )}
                    {isBerlaku && <span className="versi-badge-latest">BERLAKU</span>}
                    {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
                  </button>

                  {mekar && simpanan.map((s, i) => (
                    <div key={s.id} className="versi-simpanan">
                      <span className="versi-simpanan-jam">{jamMenit(s.disimpan_pada)}</span>
                      <span className="versi-simpanan-teks">
                        Simpan ke-{s.versi_ke} · {s.jumlah_baris} baris
                        {s.disimpan_oleh_nama && ` · ${s.disimpan_oleh_nama}`}
                      </span>
                      {i === 0 ? (
                        // Simpanan terbaru = isi yang sedang tampil. Tombol
                        // pulihkan di sini tidak melakukan apa pun, jadi tidak ada.
                        <span className="versi-simpanan-kini">tampil sekarang</span>
                      ) : onPulihkan && (
                        <button
                          type="button"
                          className="versi-simpanan-pulih"
                          onClick={(e) => { e.stopPropagation(); setOpen(false); onPulihkan(s) }}
                        >
                          <RotateCcw className="w-3 h-3" /> Pulihkan
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
