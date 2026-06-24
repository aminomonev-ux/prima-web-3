'use client'
// components/blud/MasterAkunCombobox.tsx
// Searchable combobox input untuk kolom Uraian di DPA & Pergeseran.
// On pick: fires onSelect({kode, uraian}) — parent update kedua kolom sekaligus.
// On free typing: fires onChange(uraian) — parent boleh menerima sebagai input bebas.

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

export interface AkunOption { kode: string; uraian: string }

interface Props {
  value:    string
  options:  AkunOption[]
  onChange: (uraian: string) => void
  onSelect: (akun: AkunOption) => void
  style?:   React.CSSProperties
  className?: string
  placeholder?: string
}

// Tinggi item dropdown (px) — dipakai untuk hitung tinggi panel
const ITEM_HEIGHT  = 30
const DROPDOWN_MAX = 240  // cap height
const MIN_FIT      = 120  // minimum space dianggap "cukup" buat dropdown

export default function MasterAkunCombobox({
  value, options, onChange, onSelect, style, className, placeholder,
}: Props) {
  const [open, setOpen]               = useState(false)
  const [highlight, setHighlight]     = useState(0)
  const [flipUp, setFlipUp]           = useState(false)
  // Posisi absolute viewport untuk Portal (lepas dari clipping table-wrapper)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // true = highlight berubah via keyboard/ketik → boleh auto-scroll.
  // false = via hover — JANGAN scroll: scrollToIndex menggeser item baru ke
  // bawah kursor → mouseenter lagi → loop auto-scroll cepat (bug DPA/Pergeseran).
  const kbNavRef = useRef(true)

  // Filter — match by uraian atau kode (substring, case-insensitive).
  // TANPA slice cap: pakai virtual scroll (react-virtuoso) — render hanya row visible,
  // smooth scroll meskipun data ratusan/ribu.
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      o.uraian.toLowerCase().includes(q) || o.kode.toLowerCase().includes(q),
    )
  }, [value, options])

  // Close on outside click. Dropdown di-portal ke body, jadi cek juga
  // apakah target ada di dalam `.ma-combo-dropdown` (portal). Kalau ya → bukan outside.
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node | null
      if (wrapRef.current && wrapRef.current.contains(target)) return
      if (target && (target as HTMLElement).closest?.('.ma-combo-dropdown')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Hitung posisi viewport + flip-up direction.
  // Dropdown di-render via Portal ke document.body dengan position:fixed —
  // jadi LOLOS dari clipping `.table-wrapper` (yang overflow:auto).
  // User request: dropdown boleh overlay keluar tabel saat data sparse.
  const recalcPosition = () => {
    if (!inputRef.current) return
    const rect    = inputRef.current.getBoundingClientRect()
    const desired = Math.min(filtered.length * ITEM_HEIGHT + 8, DROPDOWN_MAX)

    // Ruang bawah/atas relatif viewport
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    // Flip up kalau bawah tidak cukup tapi atas lebih lapang (viewport-only,
    // tidak lagi ngecek .table-wrapper karena Portal sudah lolos clipping).
    const shouldFlipUp = spaceBelow < Math.min(desired, MIN_FIT) && spaceAbove > spaceBelow
    setFlipUp(shouldFlipUp)
    setPos({
      top:    rect.bottom + 2,                    // dipakai saat flipUp=false
      bottom: window.innerHeight - rect.top + 2,  // dipakai saat flipUp=true
      left:   rect.left,
      width:  rect.width,
    })
  }

  useEffect(() => {
    // Defer setState ke microtask supaya tidak sync di effect body
    // (react-hooks/set-state-in-effect). Effect body sendiri cuma subscribe
    // ke scroll/resize — sesuai intent rule.
    if (!open) { queueMicrotask(() => setPos(null)); return }
    queueMicrotask(recalcPosition)
    const onUpdate = () => recalcPosition()
    window.addEventListener('scroll', onUpdate, true)  // capture phase = catch semua scroll container
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('scroll', onUpdate, true)
      window.removeEventListener('resize', onUpdate)
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, filtered.length])

  function pick(akun: AkunOption) {
    onSelect(akun)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); kbNavRef.current = true; setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); kbNavRef.current = true; setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} className={className}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); kbNavRef.current = true; setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {open && pos && filtered.length > 0 && typeof document !== 'undefined' && createPortal(
        <VirtualDropdown
          items={filtered}
          highlight={highlight}
          onPick={pick}
          onHover={i => { kbNavRef.current = false; setHighlight(i) }}
          kbNav={kbNavRef}
          pos={pos}
          flipUp={flipUp}
        />,
        document.body,
      )}
      {open && pos && filtered.length === 0 && value.trim() && typeof document !== 'undefined' && createPortal(
        <div className="ma-combo-dropdown" style={{
          position: 'fixed',
          left:  pos.left,
          width: pos.width,
          ...(flipUp ? { bottom: pos.bottom } : { top: pos.top }),
          padding: '8px 10px', zIndex: 9999, fontSize: 11,
          background: '#042C53', border: '1px solid #185FA5', borderRadius: 6,
          color: '#85B7EB', fontStyle: 'italic',
        }}>
          Tidak ada di Master Akun — input bebas tersimpan apa adanya
        </div>,
        document.body,
      )}
    </div>
  )
}

// Virtual scrolling dropdown — render hanya row visible via react-virtuoso.
// Auto-scroll ke highlight saat keyboard nav (↑↓). Fixed item height 30px.
// Note: swap dari @tanstack/react-virtual karena React Compiler 19 incompatible-library warning.
function VirtualDropdown({
  items, highlight, onPick, onHover, kbNav, pos, flipUp,
}: {
  items: AkunOption[]
  highlight: number
  onPick: (a: AkunOption) => void
  onHover: (i: number) => void
  kbNav: React.RefObject<boolean>
  pos: { top: number; left: number; width: number; bottom: number }
  flipUp: boolean
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Sync scroll → highlight HANYA saat keyboard nav (↑↓/ketik). Highlight dari
  // hover dilewati — scroll saat hover memicu mouseenter berantai = auto-scroll liar.
  useEffect(() => {
    if (!kbNav.current) return
    if (highlight >= 0 && highlight < items.length) {
      virtuosoRef.current?.scrollToIndex({ index: highlight, align: 'center', behavior: 'auto' })
    }
  }, [highlight, items.length, kbNav])

  // Hitung tinggi aktual (capped at DROPDOWN_MAX) supaya container tidak terlalu besar saat data sedikit
  const height = Math.min(items.length * ITEM_HEIGHT + 4, DROPDOWN_MAX)

  return (
    <Virtuoso
      ref={virtuosoRef}
      className="ma-combo-dropdown"
      style={{
        position: 'fixed',
        left:  pos.left,
        width: pos.width,
        ...(flipUp ? { bottom: pos.bottom } : { top: pos.top }),
        height, zIndex: 9999,
        background: '#042C53', border: '1px solid #185FA5', borderRadius: 6,
        boxShadow: flipUp ? '0 -8px 24px rgba(0,0,0,.5)' : '0 8px 24px rgba(0,0,0,.5)',
      }}
      data={items}
      defaultItemHeight={ITEM_HEIGHT}
      increaseViewportBy={150}
      itemContent={(idx, o) => {
        const active = idx === highlight
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onPick(o) }}
            onMouseEnter={() => onHover(idx)}
            className="ma-combo-item"
            data-active={active ? '1' : '0'}
            title={`${o.kode}  ${o.uraian}`}  /* full text via native tooltip saat hover */
            style={{
              height: ITEM_HEIGHT, width: '100%',
              display: 'flex', alignItems: 'center', textAlign: 'left',
              padding: '6px 10px', gap: 8,
              background: active ? 'rgba(239,159,39,.18)' : 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: '#E6F1FB', fontSize: 12,
              borderBottom: '1px solid rgba(255,255,255,.04)',
              overflow: 'hidden',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              color: active ? '#FAC775' : '#85B7EB',
              fontWeight: 600, minWidth: 110, flexShrink: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{o.kode || '—'}</span>
            <span style={{
              color: active ? '#FFFFFF' : '#E6F1FB', flex: 1, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{o.uraian}</span>
          </button>
        )
      }}
    />
  )
}
