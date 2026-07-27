'use client'
// components/blud/OpsiDropdown.tsx
// Dropdown pilihan bertema PRIMA — pengganti <select> bawaan browser.
//
// <select> asli TIDAK BISA ditemakan: daftar opsinya digambar OS, bukan CSS,
// jadi di tema gelap tulisannya ikut warna sistem dan hilang. Komponen ini
// reuse kelas .versi-* + --brutalist supaya sebentuk persis dengan TahunDropdown.
//
// `portal` dipakai kalau dropdown berada di dalam wadah ber-`overflow:auto`
// (mis. .bk-modal-body): menu absolut akan terpotong wadahnya. Pola yang sama
// dengan RowActionsMenu di dpa-client.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface Opsi<T extends string | number> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  value: T
  items: Opsi<T>[]
  onChange: (v: T) => void
  icon?: ReactNode
  /** Kata di depan label pada tombol, mis. "Bulan". Kosong = label saja. */
  prefix?: string
  minWidth?: number
  /** Lebarkan penuh mengikuti kolom induk (untuk dalam form). */
  block?: boolean
  /** Cetak menu ke <body> — wajib kalau induknya ber-overflow:auto. */
  portal?: boolean
  disabled?: boolean
  ariaLabel?: string
}

export default function OpsiDropdown<T extends string | number>({
  value, items, onChange, icon, prefix, minWidth = 168,
  block = false, portal = false, disabled = false, ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  // Posisi menu portal diukur SETELAH layout supaya tidak berkedip di posisi lama.
  useLayoutEffect(() => {
    if (!open || !portal || !wrapRef.current) return
    const ukur = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) setRect({ top: r.bottom + 5, left: r.left, width: r.width })
    }
    ukur()
    window.addEventListener('scroll', ukur, true)
    window.addEventListener('resize', ukur)
    return () => {
      window.removeEventListener('scroll', ukur, true)
      window.removeEventListener('resize', ukur)
    }
  }, [open, portal])

  const terpilih = items.find(o => o.value === value)

  const menu = (
    <div
      ref={menuRef}
      className="versi-menu"
      role="listbox"
      style={portal
        ? { position: 'static', minWidth: Math.max(rect?.width ?? minWidth, 180) }
        : { minWidth: Math.max(minWidth, 180) }}
    >
      {items.map(o => {
        const active = o.value === value
        return (
          <button
            type="button"
            key={String(o.value)}
            role="option"
            aria-selected={active}
            className={`versi-item ${active ? 'active' : ''}`}
            onClick={() => { onChange(o.value); setOpen(false) }}
          >
            <span className="versi-item-date">{o.label}</span>
            {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      ref={wrapRef}
      className={`versi-dropdown versi-dropdown--brutalist${block ? ' versi-dropdown--block' : ''}`}
    >
      <button
        type="button"
        className="versi-trigger"
        style={{ minWidth: block ? 0 : minWidth }}
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon}
        <span className="versi-label">
          {prefix ? <>{prefix} <b>{terpilih?.label ?? '—'}</b></> : <b>{terpilih?.label ?? '—'}</b>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (portal
        // Menu dicetak ke <body>, jadi kelas --brutalist harus ikut dibawa —
        // kalau tidak, gaya kartunya hilang karena selektornya turunan.
        ? createPortal(
            <div
              className="versi-dropdown versi-dropdown--brutalist"
              style={{ position: 'fixed', top: rect?.top ?? 0, left: rect?.left ?? 0, zIndex: 9999 }}
            >
              {menu}
            </div>,
            document.body,
          )
        : menu)}
    </div>
  )
}
