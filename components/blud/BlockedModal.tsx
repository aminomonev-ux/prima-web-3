'use client'
// components/blud/BlockedModal.tsx
// Modal "Tidak Dapat Digeser" — warning saat user coba geser baris
// melewati grup berbeda. Extract dari dpa-client.tsx (BLUD-OPT-1 follow-up).
//
// Dipakai di: dpa-client.tsx + pergeseran-client.tsx (reusable).

import { AlertTriangle, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { TIPE_LABEL } from '@/lib/blud/format'
import type { TipeBaris } from '@/types'

export interface BlockedInfo {
  target:    { uraian: string; tipe_baris: TipeBaris }
  neighbor:  { uraian: string; tipe_baris: TipeBaris }
  direction: 'up' | 'down'
}

export default function BlockedModal({ info, onClose }: { info: BlockedInfo; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="blud-modal-card rounded-xl w-120 max-w-[95vw]">
        <div className="blud-modal-header flex items-center gap-2 px-5 py-4">
          <AlertTriangle className="w-5 h-5" style={{ color: '#EF9F27' }} />
          <span className="blud-modal-title font-semibold">Tidak Dapat Digeser</span>
          <button onClick={onClose} className="blud-modal-close ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="blud-modal-subtitle text-sm">
            Baris <strong>&quot;{info.target.uraian}&quot;</strong> tidak dapat digeser{' '}
            <strong>{info.direction === 'up' ? 'ke atas' : 'ke bawah'}</strong> karena
            akan melewati baris yang berada di grup berbeda.
          </p>
          <div className="blud-modal-info-box space-y-2">
            <p className="blud-modal-info-label text-xs font-medium uppercase tracking-wide">Posisi saat ini</p>
            <div className="blud-modal-row-target flex items-center gap-2 px-3 py-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#E24B4A' }} />
              <div>
                <p className="text-sm font-semibold">{info.neighbor.uraian}</p>
                <p className="blud-modal-info-label text-xs">{TIPE_LABEL[info.neighbor.tipe_baris]} — grup berbeda</p>
              </div>
            </div>
            <div className="blud-modal-row-self flex items-center gap-2 px-3 py-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#3B82F6' }} />
              <div>
                <p className="text-sm font-semibold">{info.target.uraian}</p>
                <p className="blud-modal-info-label text-xs">{TIPE_LABEL[info.target.tipe_baris]} — baris yang digeser</p>
              </div>
            </div>
          </div>
          <div className="blud-modal-hint px-3 py-2 text-xs">
            💡 Baris hanya dapat digeser di dalam grup yang sama (sesama baris dengan induk yang sama).
          </div>
          <div className="flex justify-end">
            <PrimaButton variant="primary" size="sm" onClick={onClose}>Mengerti</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
