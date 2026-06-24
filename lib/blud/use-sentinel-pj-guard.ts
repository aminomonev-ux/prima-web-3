// lib/blud/use-sentinel-pj-guard.ts
// Custom hook untuk Sentinel PJ (chain conflict detector + visual indicators).
// Extract dari dpa-client.tsx — closes BLUD-OPT-1 god component finding.
//
// Reference: docs/audit/AUDIT_ROADMAP.md Tahap 13 (Sentinel PJ deployed 8c13c47, d72ec1c)
//            docs/session/SESSION-NOTES-2026-05-21-pj-trigger.md
//
// Hook menyediakan:
//   - State pjConflict + pjMutation (untuk modal dialogs)
//   - handlePjChange: intercept PJ assignment dgn conflict detection
//   - jumpToRow: scroll-to + flash animation untuk banner click
//   - Computed pjConflictPairs (banner data) + pjConflictPartners (icon click map)
//
// Caller (dpa-client.tsx) tinggal:
//   - Wire hook return values ke PJ combobox + banner + dialog rendering
//   - addChild/addSibling wrappers tetap di caller (depend on local addChildCore)
//     dengan menggunakan setPjMutation dari hook
//
// Hook generic untuk row type yang punya field PJ + tree structure.

'use client'

import { useState, useCallback } from 'react'
import {
  detectPjConflict, validateAllPj,
  type PjConflictRow, type PjGlobalConflict,
} from '@/lib/blud/pj-conflict'
import type { DpaBarisInput } from '@/types'

export interface PjConflictState {
  rowId:        string
  newPj:        string
  targetUraian: string
  ancestors:    PjConflictRow[]
  descendants:  PjConflictRow[]
}

export interface PjMutationState {
  ancestorsPj: PjConflictRow[]
  proceed:     (clearAncestor: boolean) => void
}

export interface PjConflictPartner {
  row_id: string
  kode:   string
  uraian: string
  pj:     string
}

interface UseSentinelPjGuardParams {
  rows:     DpaBarisInput[]
  updateRow: (rowId: string, field: keyof DpaBarisInput, value: unknown) => void
}

interface UseSentinelPjGuardReturn {
  pjConflict:         PjConflictState | null
  setPjConflict:      (s: PjConflictState | null) => void
  pjMutation:         PjMutationState | null
  setPjMutation:      (s: PjMutationState | null) => void
  handlePjChange:     (row: DpaBarisInput, raw: string) => void
  jumpToRow:          (rowId: string) => void
  pjConflictPairs:    PjGlobalConflict[]
  pjConflictPartners: Map<string, PjConflictPartner[]>
}

export function useSentinelPjGuard({
  rows, updateRow,
}: UseSentinelPjGuardParams): UseSentinelPjGuardReturn {
  const [pjConflict, setPjConflict] = useState<PjConflictState | null>(null)
  const [pjMutation, setPjMutation] = useState<PjMutationState | null>(null)

  // Sentinel PJ — scan konflik chain vertikal tiap render.
  // pjConflictPairs:    untuk banner overview (list pasangan + tombol Lompat)
  // pjConflictPartners: rowId → list partner konflik (untuk icon ⚠ click & tooltip)
  const pjConflictPairs = validateAllPj(rows)
  const pjConflictPartners = new Map<string, PjConflictPartner[]>()
  for (const pair of pjConflictPairs) {
    if (!pjConflictPartners.has(pair.row.row_id)) pjConflictPartners.set(pair.row.row_id, [])
    pjConflictPartners.get(pair.row.row_id)!.push({
      row_id: pair.conflict.row_id, kode: pair.conflict.kode_rekening,
      uraian: pair.conflict.uraian,  pj:   pair.conflict.pj,
    })
    if (!pjConflictPartners.has(pair.conflict.row_id)) pjConflictPartners.set(pair.conflict.row_id, [])
    pjConflictPartners.get(pair.conflict.row_id)!.push({
      row_id: pair.row.row_id, kode: pair.row.kode_rekening,
      uraian: pair.row.uraian,  pj:   pair.row.pj,
    })
  }

  // Jump-to-row + flash animation untuk tombol Lompat di banner Sentinel PJ.
  const jumpToRow = useCallback((rowId: string) => {
    const el = document.getElementById(`dpa-row-${rowId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('pj-sentinel-row-flash')
    // restart animation (force reflow)
    void (el as HTMLElement).offsetWidth
    el.classList.add('pj-sentinel-row-flash')
    window.setTimeout(() => el.classList.remove('pj-sentinel-row-flash'), 1700)
  }, [])

  // Sentinel PJ — intercept saat user assign PJ baru.
  // Skip check kalau:
  //   - value kosong/null (clear PJ → no conflict possible)
  //   - row sudah punya PJ + value baru juga PJ (edit, bukan tambah) — keputusan #2
  // Cek konflik kalau: row sebelumnya kosong → user isi PJ baru.
  const handlePjChange = useCallback((row: DpaBarisInput, raw: string) => {
    const newPj   = raw.trim()
    const prevPj  = (row.penanggung_jawab ?? '').trim()
    const isClear = newPj === ''
    const isEdit  = prevPj !== '' && newPj !== ''
    if (isClear || isEdit) {
      updateRow(row.row_id, 'penanggung_jawab', isClear ? null : newPj)
      return
    }
    const result = detectPjConflict(rows, row.row_id)
    if (!result.hasConflict) {
      updateRow(row.row_id, 'penanggung_jawab', newPj)
      return
    }
    setPjConflict({
      rowId:        row.row_id,
      newPj,
      targetUraian: row.uraian,
      ancestors:    result.ancestors,
      descendants:  result.descendants,
    })
  }, [rows, updateRow])

  return {
    pjConflict, setPjConflict,
    pjMutation, setPjMutation,
    handlePjChange, jumpToRow,
    pjConflictPairs, pjConflictPartners,
  }
}
