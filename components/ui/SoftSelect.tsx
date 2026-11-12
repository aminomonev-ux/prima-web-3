'use client'
// components/ui/SoftSelect.tsx
// Custom dropdown menggantikan native <select> untuk konteks yang butuh
// styling konsisten dengan dark theme PRIMA (native <option> tidak bisa di-style).
// Pair dengan CSS class .select-brutalist-soft + .soft-select-menu di globals.css.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SoftSelectOption<T extends string | number> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  value:    T
  options:  SoftSelectOption<T>[]
  onChange: (v: T) => void
  /** Label fallback kalau value tidak match options (jarang terjadi). */
  placeholder?: string
  /** Min-width trigger (default 160px). */
  minWidth?: number
  /** Disabled state. */
  disabled?: boolean
}

export default function SoftSelect<T extends string | number>({
  value, options, onChange, placeholder = '—', minWidth = 160, disabled = false,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    // Esc menutup daftar: fokus tetap di trigger, jadi didengar di dokumen seperti klik-luar.
    // Fase capture + stopPropagation: Esc yang menutup daftar tidak boleh ikut menutup modal
    // di belakangnya (pendengar Esc modal memakai fase bubble) — isian modal bisa hilang.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      // Seperti <select> bawaan: Esc menutup dan fokus balik ke trigger.
      wrapRef.current?.querySelector<HTMLButtonElement>('.soft-select-trigger')?.focus()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const label    = selected?.label ?? placeholder

  return (
    <div ref={wrapRef} className="soft-select" style={{ minWidth }}>
      <button
        type="button"
        className="select-brutalist-soft soft-select-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="soft-select-label">{label}</span>
        <ChevronDown className={`soft-select-chevron ${open ? 'open' : ''}`} size={12} />
      </button>
      {open && (
        <div className="soft-select-menu" role="listbox">
          {options.map(opt => {
            const active = opt.value === value
            // Trigger memotong nama panjang dengan elipsis; di daftar teksnya dibungkus utuh
            // (.soft-select-item-label) — `title=` bawaan browser dilarang (Gate J).
            return (
              <button
                type="button"
                key={String(opt.value)}
                role="option"
                aria-selected={active}
                className={`soft-select-item${active ? ' active' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false) }}
              >
                <span className="soft-select-item-label">{opt.label}</span>
                {active && <Check size={12} className="soft-select-item-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
