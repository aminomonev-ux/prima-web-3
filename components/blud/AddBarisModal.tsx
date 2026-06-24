'use client'
// components/blud/AddBarisModal.tsx
// Modal pilih tipe baris anak saat user klik "+ Tambah Sub Level" di RowActionsMenu.
// Extract dari dpa-client.tsx (BLUD-OPT-1 follow-up).
//
// Options disesuaikan dgn TIPE_CHILD_OPTIONS chain rule (1 anak per level,
// strict L1→L8.1). Sebagian besar parent type spawn 1 option saja.

import { X } from 'lucide-react'
import { TIPE_LABEL } from '@/lib/blud/format'
import type { DpaBarisInput, PergeseranBarisInput, TipeBaris } from '@/types'

interface Props<T extends DpaBarisInput | PergeseranBarisInput> {
  parentRow: T
  options:   TipeBaris[]  // dari TIPE_CHILD_OPTIONS[parentRow.tipe_baris] di caller
  onAdd:     (tipe: TipeBaris, parentRowId: string) => void
  onClose:   () => void
}

export default function AddBarisModal<T extends DpaBarisInput | PergeseranBarisInput>({
  parentRow, options, onAdd, onClose,
}: Props<T>) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="blud-modal-card rounded-xl w-80">
        <div className="blud-modal-header flex items-center justify-between px-5 py-4">
          <span className="blud-modal-title font-semibold">Tambah Sub Level</span>
          <button onClick={onClose} className="blud-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          <p className="blud-modal-subtitle text-sm mb-3">
            Tambah di bawah <strong>{parentRow.uraian || TIPE_LABEL[parentRow.tipe_baris]}</strong>:
          </p>
          {options.map(tipe => (
            <button
              key={tipe}
              onClick={() => { onAdd(tipe, parentRow.row_id); onClose() }}
              className="blud-modal-option w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              + {TIPE_LABEL[tipe]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
