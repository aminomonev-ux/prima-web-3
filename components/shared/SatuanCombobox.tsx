'use client'
// components/shared/SatuanCombobox.tsx
// Combobox searchable untuk kolom satuan — single source of truth dari
// SATUAN_OPTIONS di lib/constants.ts. Pattern mirror PenanggungJawabCombobox:
// className + data-active attr (per DESIGN-SYSTEM "Combobox theme-safe styling").
//
// Dipakai di:
//   - DPA BLUD kolom satuan (app/(dashboard)/blud/dpa/dpa-client.tsx)
//   - Usulan Kebutuhan BuatPanel kolom satuan
//   - Pergeseran DPA (kalau ada kolom satuan)
//
// Behavior:
//   - User bisa ketik bebas → value disimpan apa adanya (free-text)
//   - Saat ketik → dropdown filter list SATUAN_OPTIONS yang match
//   - Pilih dari dropdown → value updated
//   - Empty list saat tidak match → tampil hint "Tidak ada di list"

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { SATUAN_OPTIONS } from '@/lib/constants'

interface Props {
  value:        string
  onChange:     (label: string) => void
  options?:     readonly string[]  // override default SATUAN_OPTIONS
  style?:       React.CSSProperties
  className?:        string  // applied ke wrapper div
  inputClassName?:   string  // applied ke <input> element (mis. "form-control" di Usulan)
  placeholder?: string
}

const ITEM_HEIGHT  = 30
const DROPDOWN_MAX = 240
const MIN_FIT      = 120

export default function SatuanCombobox({
  value, onChange, options = SATUAN_OPTIONS, style, className, inputClassName, placeholder,
}: Props) {
  const [open, setOpen]           = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [flipUp, setFlipUp]       = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options.slice(0, 100)
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 100)
  }, [value, options])

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node | null
      if (wrapRef.current && wrapRef.current.contains(t)) return
      if (t && (t as HTMLElement).closest?.('.pj-combo-dropdown')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const recalcPosition = () => {
    if (!inputRef.current) return
    const rect    = inputRef.current.getBoundingClientRect()
    const desired = Math.min(filtered.length * ITEM_HEIGHT + 8, DROPDOWN_MAX)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const shouldFlipUp = spaceBelow < Math.min(desired, MIN_FIT) && spaceAbove > spaceBelow
    setFlipUp(shouldFlipUp)
    setPos({
      top:    rect.bottom + 2,
      bottom: window.innerHeight - rect.top + 2,
      left:   rect.left,
      width:  rect.width,
    })
  }

  useEffect(() => {
    // Defer setState ke microtask (react-hooks/set-state-in-effect).
    if (!open) { queueMicrotask(() => setPos(null)); return }
    queueMicrotask(recalcPosition)
    const onUpdate = () => recalcPosition()
    window.addEventListener('scroll', onUpdate, true)
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('scroll', onUpdate, true)
      window.removeEventListener('resize', onUpdate)
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, filtered.length])

  function pick(label: string) {
    onChange(label)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} className={className}>
      <input
        ref={inputRef}
        type="text"
        className={inputClassName}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {open && pos && filtered.length > 0 && typeof document !== 'undefined' && createPortal(
        <div className="pj-combo-dropdown" style={{
          position: 'fixed',
          left:  pos.left,
          width: pos.width,
          ...(flipUp ? { bottom: pos.bottom } : { top: pos.top }),
          maxHeight: DROPDOWN_MAX, overflowY: 'auto', zIndex: 9999,
          background: '#042C53', border: '1px solid #185FA5', borderRadius: 6,
          boxShadow: flipUp ? '0 -8px 24px rgba(0,0,0,.5)' : '0 8px 24px rgba(0,0,0,.5)',
        }}>
          {filtered.map((o, i) => (
            <button
              key={`${o}-${i}`}
              type="button"
              className="pj-combo-item"
              data-active={i === highlight ? '1' : '0'}
              onMouseDown={e => { e.preventDefault(); pick(o) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12,
                borderBottom: '1px solid rgba(255,255,255,.04)',
              }}
            >{o}</button>
          ))}
        </div>,
        document.body,
      )}
      {open && pos && filtered.length === 0 && value.trim() && typeof document !== 'undefined' && createPortal(
        <div className="pj-combo-dropdown" style={{
          position: 'fixed',
          left:  pos.left,
          width: pos.width,
          ...(flipUp ? { bottom: pos.bottom } : { top: pos.top }),
          padding: '8px 10px', zIndex: 9999, fontSize: 11,
          background: '#042C53', border: '1px solid #185FA5', borderRadius: 6,
          color: '#85B7EB', fontStyle: 'italic',
        }}>
          Tidak ada di list (akan disimpan apa adanya)
        </div>,
        document.body,
      )}
    </div>
  )
}
