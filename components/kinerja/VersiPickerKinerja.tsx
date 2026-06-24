'use client'
// components/kinerja/VersiPickerKinerja.tsx
// Pill-shaped dropdown untuk pilih versi SSK E-Anggaran (MURNI / PERUBAHAN-n).
// Refactor Versi — Checkpoint C Task #18.
// Reuse CSS class (.versi-dropdown, .versi-trigger, .versi-menu) dari BLUD VersiDropdown.
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md

import { useEffect, useRef, useState } from 'react'
import { History, ChevronDown, Check, Plus, Lock } from 'lucide-react'

export interface VersiKinerja {
  versi_tipe:   'MURNI' | 'PERUBAHAN'
  versi_seq:    number
  jumlah_baris: number
  locked_at:    string | null
  updated_at?:  string | null
}

export interface VersiValue {
  tipe: 'MURNI' | 'PERUBAHAN'
  seq:  number
}

interface Props {
  value:    VersiValue
  items:    VersiKinerja[]
  onChange: (v: VersiValue) => void
  /** Klik "+ Buat Perubahan Baru". Undefined → tombol hidden (mis. di RealisasiTab read-only). */
  onCreatePerubahan?: () => void
  /** Loading state saat fetch items. */
  loading?: boolean
}

function labelVersi(t: 'MURNI'|'PERUBAHAN', seq: number): string {
  return t === 'MURNI' ? 'MURNI' : `PERUBAHAN-${seq}`
}

function sameVersi(a: VersiValue, b: { versi_tipe: 'MURNI'|'PERUBAHAN'; versi_seq: number }): boolean {
  return a.tipe === b.versi_tipe && a.seq === b.versi_seq
}

export default function VersiPickerKinerja({
  value, items, onChange, onCreatePerubahan, loading = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Versi terbaru = seq tertinggi (atau MURNI kalau cuma 1 versi)
  const latestItem = items.reduce<VersiKinerja | null>((acc, cur) => {
    if (!acc) return cur
    if (cur.versi_seq > acc.versi_seq) return cur
    if (cur.versi_seq === acc.versi_seq && cur.versi_tipe === 'PERUBAHAN' && acc.versi_tipe === 'MURNI') return cur
    return acc
  }, null)

  const selectedLabel    = labelVersi(value.tipe, value.seq)
  const selectedItem     = items.find(i => sameVersi(value, i))
  const isLocked         = !!selectedItem?.locked_at
  const selectedIsLatest = latestItem !== null && sameVersi(value, latestItem)

  return (
    <div ref={wrapRef} className="versi-dropdown versi-dropdown--brutalist">
      <button
        type="button"
        className="versi-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
      >
        <History className="w-3.5 h-3.5 versi-icon" />
        <span className="versi-label">
          {loading ? (
            <span className="versi-placeholder">Memuat versi...</span>
          ) : (
            <>
              {selectedLabel}
              {selectedItem && (
                <span className="versi-meta"> · {selectedItem.jumlah_baris} baris</span>
              )}
              {isLocked && <Lock className="w-3 h-3" style={{ marginLeft: 4, opacity: .7 }} />}
              {selectedIsLatest && <span className="versi-badge-latest versi-badge-latest--trigger">LATEST</span>}
            </>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          {items.length === 0 ? (
            <div className="versi-empty">Belum ada versi tersimpan</div>
          ) : (
            items.map(item => {
              const active   = sameVersi(value, item)
              const isLatest = latestItem !== null && sameVersi(
                { tipe: item.versi_tipe, seq: item.versi_seq },
                latestItem,
              )
              const itemLocked = !!item.locked_at
              return (
                <button
                  type="button"
                  key={`${item.versi_tipe}-${item.versi_seq}`}
                  role="option"
                  aria-selected={active}
                  className={`versi-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    onChange({ tipe: item.versi_tipe, seq: item.versi_seq })
                    setOpen(false)
                  }}
                >
                  <History className="w-3 h-3 versi-item-icon" />
                  <span className="versi-item-date">{labelVersi(item.versi_tipe, item.versi_seq)}</span>
                  <span className="versi-item-meta">· {item.jumlah_baris} baris</span>
                  {itemLocked && <Lock className="w-3 h-3" style={{ marginLeft: 4, opacity: .6 }} />}
                  {isLatest && <span className="versi-badge-latest">LATEST</span>}
                  {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
                </button>
              )
            })
          )}

          {onCreatePerubahan && (
            <button
              type="button"
              className="versi-item versi-item-create"
              onClick={() => { onCreatePerubahan(); setOpen(false) }}
              style={{
                borderTop: '1px solid rgba(124,92,252,.3)',
                marginTop: 4,
                paddingTop: 8,
                color: '#7C5CFC',
                fontWeight: 700,
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Perubahan Baru</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
