'use client'
// components/blud/VersiDropdown.tsx
// Custom pill-shaped dropdown untuk pilih versi DPA / Pergeseran.
// Theme-aware (dark default + light override via [data-theme="light"]).

import { useEffect, useRef, useState } from 'react'
import { History, ChevronDown, Check } from 'lucide-react'

export interface VersiItem {
  versi_tanggal: string         // YYYY-MM-DD
  jumlah_baris?: number         // opsional (DPA pakai, Pergeseran tidak)
}

interface Props {
  value:    string                   // tanggal terpilih (kosong = belum pilih)
  items:    VersiItem[]              // daftar versi (urut desc dari terbaru)
  onChange: (versi: string) => void
  placeholder?: string
}

// Format tanggal YYYY-MM-DD → "DD Mon YYYY" ID
const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function formatTanggal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]} ${ID_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

export default function VersiDropdown({ value, items, onChange, placeholder = '— Pilih Versi —' }: Props) {
  const [open, setOpen] = useState(false)
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
  const latestTanggal = items[0]?.versi_tanggal

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
        {selected && selected.versi_tanggal === latestTanggal && (
          <span className="versi-badge-latest versi-badge-latest--trigger">LATEST</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          {items.length === 0 ? (
            <div className="versi-empty">Belum ada versi tersimpan</div>
          ) : (
            items.map(item => {
              const active   = item.versi_tanggal === value
              const isLatest = item.versi_tanggal === latestTanggal
              return (
                <button
                  type="button"
                  key={item.versi_tanggal}
                  role="option"
                  aria-selected={active}
                  className={`versi-item ${active ? 'active' : ''}`}
                  onClick={() => { onChange(item.versi_tanggal); setOpen(false) }}
                >
                  <History className="w-3 h-3 versi-item-icon" />
                  <span className="versi-item-date">{formatTanggal(item.versi_tanggal)}</span>
                  {typeof item.jumlah_baris === 'number' && (
                    <span className="versi-item-meta">· {item.jumlah_baris} baris</span>
                  )}
                  {isLatest && <span className="versi-badge-latest">LATEST</span>}
                  {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
