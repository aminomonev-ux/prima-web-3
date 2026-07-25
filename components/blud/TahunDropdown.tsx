'use client'
// components/blud/TahunDropdown.tsx
// Pill dropdown pilih Tahun Anggaran — dimensi di atas VersiDropdown.
// Reuse kelas .versi-* (globals.css) supaya visual konsisten dgn VersiDropdown.
// CONCEPT-blud-tahun-anggaran §7.

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, Check, Plus } from 'lucide-react'

interface Props {
  value:    number | null            // tahun terpilih
  items:    number[]                 // daftar tahun (urut desc)
  current:  number                   // tahun berjalan (default saran "Tahun Baru")
  onChange: (tahun: number) => void
  placeholder?: string
}

export default function TahunDropdown({ value, items, current, onChange, placeholder = '— Pilih Tahun —' }: Props) {
  const [open, setOpen]     = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft]   = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setAdding(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function commitNew() {
    const n = Number(draft)
    if (!Number.isInteger(n) || n < 2000 || n > 2100) return
    onChange(n)
    setAdding(false); setDraft(''); setOpen(false)
  }

  return (
    <div ref={wrapRef} className="versi-dropdown versi-dropdown--brutalist">
      <button
        type="button"
        className="versi-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Calendar className="w-3.5 h-3.5 versi-icon" />
        <span className="versi-label">
          {value != null
            ? <>Tahun <b>{value}</b></>
            : <span className="versi-placeholder">{placeholder}</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          {items.map(tahun => {
            const active = tahun === value
            return (
              <button
                type="button"
                key={tahun}
                role="option"
                aria-selected={active}
                className={`versi-item ${active ? 'active' : ''}`}
                onClick={() => { onChange(tahun); setOpen(false) }}
              >
                <Calendar className="w-3 h-3 versi-item-icon" />
                <span className="versi-item-date">Tahun {tahun}</span>
                {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
              </button>
            )
          })}

          {adding ? (
            <div className="versi-item" style={{ gap: 6 }}>
              <input
                type="number"
                autoFocus
                className="versi-add-input"
                min={2000}
                max={2100}
                placeholder={String(current)}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitNew(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
              />
              <button type="button" className="versi-add-ok" onClick={commitNew} aria-label="Tambah tahun">
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="versi-item versi-item-create"
              onClick={() => { setAdding(true); setDraft('') }}
            >
              <Plus className="w-3 h-3 versi-item-icon" />
              <span className="versi-item-date">Tahun Baru…</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
