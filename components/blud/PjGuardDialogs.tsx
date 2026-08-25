'use client'
// components/blud/PjGuardDialogs.tsx
// Modal dialog set untuk "Sentinel PJ" — detector konflik Penanggung Jawab DPA.
//
// 2 dialog:
//   1. PjConflictDialog  — saat user assign PJ ke row yg chain-nya sudah ber-PJ
//   2. PjMutationDialog  — saat user add child/sibling di bawah row yg ber-PJ
//
// Pattern style mirror `delGuard` modal di dpa-client.tsx (blud-modal-* classes).

import { AlertTriangle, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import type { PjConflictRow } from '@/lib/blud/pj-conflict'

// ──────────────────────────────────────────────────────────────────────────
// 1. PjConflictDialog — warning saat assign PJ baru
// ──────────────────────────────────────────────────────────────────────────

export interface PjConflictDialogProps {
  open:        boolean
  newPj:       string
  targetUraian: string
  ancestors:   PjConflictRow[]
  descendants: PjConflictRow[]
  onConfirm:   () => void  // Tetap Lanjutkan (PJ di-set walau konflik)
  onCancel:    () => void  // Batal (PJ direvert)
}

export function PjConflictDialog({
  open, newPj, targetUraian, ancestors, descendants, onConfirm, onCancel,
}: PjConflictDialogProps) {
  if (!open) return null
  const total = ancestors.length + descendants.length

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="blud-modal-card rounded-xl" style={{ width: 560, maxWidth: '92vw' }}>
        <div className="blud-modal-header flex items-center justify-between px-5 py-4">
          <span className="blud-modal-title font-semibold flex items-center gap-2"
                style={{ color: '#BA7517' }}>
            <AlertTriangle className="w-4 h-4" /> Uangnya bisa terhitung dua kali
          </span>
          <button onClick={onCancel} className="blud-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="blud-modal-subtitle text-sm">
            Anda mengisi penanggung jawab <strong>{newPj}</strong> di baris{' '}
            <strong>{targetUraian || '(tanpa uraian)'}</strong>. Padahal <strong>{total}</strong> baris
            lain yang segaris dengannya — induk atau turunannya — sudah punya penanggung jawab.
            Kalau diteruskan, uang yang sama terhitung dua kali di Rekap Penanggung Jawab:
            sekali di baris induk, sekali lagi di baris ini.
          </p>

          <div style={{
            background: 'rgba(186,117,23,.10)',
            border: '1px solid rgba(186,117,23,.35)',
            borderRadius: 8,
            padding: '8px 12px',
            maxHeight: 220, overflowY: 'auto',
          }}>
            {ancestors.length > 0 && (
              <div style={{ marginBottom: descendants.length > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 11, opacity: .7, marginBottom: 4 }}>
                  ↑ Baris induk di atasnya:
                </div>
                {ancestors.map(a => (
                  <div key={a.row_id} style={{ fontSize: 12, padding: '2px 0' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', opacity: .8 }}>
                      {a.kode_rekening || '—'}
                    </span>
                    {' · '}{a.uraian || '(tanpa uraian)'}{' '}
                    <strong style={{ color: '#BA7517' }}>→ {a.pj}</strong>
                  </div>
                ))}
              </div>
            )}
            {descendants.length > 0 && (
              <div>
                <div style={{ fontSize: 11, opacity: .7, marginBottom: 4 }}>
                  ↓ Baris turunan di bawahnya:
                </div>
                {descendants.map(d => (
                  <div key={d.row_id} style={{ fontSize: 12, padding: '2px 0' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', opacity: .8 }}>
                      {d.kode_rekening || '—'}
                    </span>
                    {' · '}{d.uraian || '(tanpa uraian)'}{' '}
                    <strong style={{ color: '#BA7517' }}>→ {d.pj}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <PrimaButton variant="ghost" size="sm" onClick={onCancel}>Batal (kosongkan)</PrimaButton>
            <PrimaButton variant="warning" size="sm" onClick={onConfirm}>Tetap Lanjutkan</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 2. PjMutationDialog — saat add child/sibling, parent chain sudah ber-PJ
// ──────────────────────────────────────────────────────────────────────────

export interface PjMutationDialogProps {
  open:          boolean
  ancestorsPj:   PjConflictRow[]  // ancestor (incl. parent immediate) yang ber-PJ
  onKeep:        () => void  // Tetap: lanjut tambah baris, PJ ancestor tidak diubah
  onClear:       () => void  // Hapus: clear PJ ancestor lalu lanjut tambah baris
  onCancel:      () => void  // Batalkan tambah baris
}

export function PjMutationDialog({
  open, ancestorsPj, onKeep, onClear, onCancel,
}: PjMutationDialogProps) {
  if (!open || ancestorsPj.length === 0) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="blud-modal-card rounded-xl" style={{ width: 540, maxWidth: '92vw' }}>
        <div className="blud-modal-header flex items-center justify-between px-5 py-4">
          <span className="blud-modal-title font-semibold flex items-center gap-2"
                style={{ color: '#BA7517' }}>
            <AlertTriangle className="w-4 h-4" /> Baris induknya sudah punya penanggung jawab
          </span>
          <button onClick={onCancel} className="blud-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="blud-modal-subtitle text-sm">
            Baris baru ini akan berada di bawah baris yang sudah punya penanggung jawab.
            Satu orang boleh menanggung banyak baris sekaligus — asalkan baris baru ini
            dan turunannya <strong>tidak</strong> diisi penanggung jawab lagi, supaya uangnya
            tidak terhitung dua kali di rekap.
          </p>

          <div style={{
            background: 'rgba(186,117,23,.10)',
            border: '1px solid rgba(186,117,23,.35)',
            borderRadius: 8,
            padding: '8px 12px',
            maxHeight: 180, overflowY: 'auto',
          }}>
            {ancestorsPj.map(a => (
              <div key={a.row_id} style={{ fontSize: 12, padding: '2px 0' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', opacity: .8 }}>
                  {a.kode_rekening || '—'}
                </span>
                {' · '}{a.uraian || '(tanpa uraian)'}{' '}
                <strong style={{ color: '#BA7517' }}>→ {a.pj}</strong>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <PrimaButton variant="ghost" size="sm" onClick={onCancel}>Batal</PrimaButton>
            <PrimaButton variant="danger" size="sm" onClick={onClear}>Kosongkan PJ induknya</PrimaButton>
            <PrimaButton variant="success" size="sm" onClick={onKeep}>Biarkan PJ induknya</PrimaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
