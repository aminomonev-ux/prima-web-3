'use client'
// components/blud/RowActionsMenu.tsx
// Kebab menu (⋮) — popup horizontal via createPortal supaya escape clipping
// dari scroll-wrapper. Position fixed dihitung dari trigger rect.
//
// Extract dari dpa-client.tsx (BLUD-OPT-1 follow-up). Dipakai di:
//   - dpa-client.tsx
//   - pergeseran-client.tsx
//
// Tooltip pakai data-tooltip attribute + ::after pseudo (styled, theme-aware
// — ribbon-pattern). Tooltip kebab sendiri pakai portal supaya tidak ke-clip
// scroll-wrapper.

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Plus, Download } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'

interface Props {
  canAdd:        boolean
  canSibling:    boolean
  locked:        boolean
  onAddChild?:   () => void
  onAddSibling?: () => void
  /** Import dari Usulan Kebutuhan (DPA) — CONCEPT-import-usulan-dpa. */
  onImport?:     () => void
  onDelete?:     () => void
  /** Override tooltip tombol hapus (mis. Pergeseran: "hanya untuk baris baru"). */
  title?:        string
}

export default function RowActionsMenu({
  canAdd, canSibling, locked, onAddChild, onAddSibling, onImport, onDelete, title,
}: Props) {
  const [open, setOpen]    = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [hover, setHover]   = useState(false)
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef    = useRef<HTMLDivElement>(null)

  // Update position dari trigger rect saat open.
  // Flip ke atas kalau tidak cukup ruang di bawah (mis. baris paling bawah viewport).
  function updateCoords() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const MENU_H = 44  // approx tinggi popup: 22 button + 5×2 padding + margin
    const spaceBelow = window.innerHeight - r.bottom
    const flipUp = spaceBelow < MENU_H + 12
    setCoords({
      top: flipUp ? r.top - 4 - MENU_H : r.bottom + 4,
      right: window.innerWidth - r.right,
    })
  }

  function toggle() {
    if (!open) updateCoords()
    setOpen(o => !o)
  }

  // Tooltip via portal (kebab inside scroll-wrapper → CSS ::after ke-clip)
  function handleEnter() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setTipPos({ top: r.top - 6, left: r.left + r.width / 2 })
    setHover(true)
  }
  function handleLeave() { setHover(false) }

  // Close on outside click + scroll (popup fixed-pos akan loose sync kalau user scroll)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t))    return
      setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeOnScroll)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', closeOnScroll)
    }
  }, [open])

  const total = (canAdd ? 1 : 0) + (canSibling ? 1 : 0) + (onImport ? 1 : 0) + (!locked ? 1 : 0)
  if (total === 0) return null

  return (
    <div className="blud-act-kebab-wrap">
      <button ref={triggerRef} type="button" onClick={toggle} data-rima="dpa.kebab-aksi"
        onMouseEnter={handleEnter} onMouseLeave={handleLeave}
        className="blud-act-kebab" aria-label="Aksi baris" aria-haspopup="menu" aria-expanded={open}>
        <MoreVertical size={14} />
      </button>
      {hover && !open && tipPos && typeof window !== 'undefined' && createPortal(
        <div className="blud-tip-portal" style={{ position: 'fixed', top: tipPos.top, left: tipPos.left }}>
          Aksi baris
        </div>,
        document.body,
      )}
      {open && coords && typeof window !== 'undefined' && createPortal(
        <div ref={menuRef} className="blud-act-menu" role="menu"
             style={{ position: 'fixed', top: coords.top, right: coords.right }}>
          {canAdd && onAddChild && (
            <button type="button" onClick={() => { setOpen(false); onAddChild() }} className="blud-act blud-act-add" data-tooltip="Tambah Sub Level" role="menuitem">
              <Plus size={14} strokeWidth={2.5} />
            </button>
          )}
          {canSibling && onAddSibling && (
            <button type="button" onClick={() => { setOpen(false); onAddSibling() }} className="blud-act blud-act-sibling" data-tooltip="Tambah Level Sama" role="menuitem"
              style={{ fontSize: 13, fontWeight: 800 }}>
              =
            </button>
          )}
          {onImport && (
            <button type="button" onClick={() => { setOpen(false); onImport() }} className="blud-act blud-act-add" data-tooltip="Import dari Usulan" data-rima="dpa.kebab-import" role="menuitem">
              <Download size={14} strokeWidth={2.5} />
            </button>
          )}
          {!locked && onDelete && (
            <button type="button" onClick={() => { setOpen(false); onDelete() }} className="blud-act blud-act-del" data-tooltip={title ?? 'Hapus Baris'} role="menuitem">
              <DeleteIcon size={13} />
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
