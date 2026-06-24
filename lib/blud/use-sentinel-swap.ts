// lib/blud/use-sentinel-swap.ts
// Custom hook untuk Sentinel Swap (block-aware geser DPA).
// Extract dari dpa-client.tsx — mengurangi god component (BLUD-OPT-1 mitigation).
//
// Reference: docs/session/SESSION-NOTES-2026-05-22-sentinel-swap.md
//
// Hook menyediakan:
//   - selectedRowIds: Set<string> — rows ter-check di UI
//   - toggleCheckbox(rowId) — cascade auto-check parent → descendants,
//     cascade reverse uncheck (uncheck anak → all related uncheck)
//   - geser(rowId, direction) — hybrid: leaf (single-row geserBaris existing) OR
//     block (geserBlock dgn selectedRowIds)
//
// Caller (dpa-client.tsx) hanya perlu render checkbox + panah ↑↓ pakai
// values dari hook. State + cascade logic + geser dispatch fully encapsulated.

'use client'

import { useState, useCallback, useEffect } from 'react'
import { geserBaris, geserBlock } from '@/lib/blud/recalc'
import { buildChildMap, getDescendants } from '@/lib/blud/pj-conflict'
import type { DpaBarisInput, PergeseranBarisInput, TipeBaris } from '@/types'

// BlockedInfo shape mirror dari dpa-client.tsx & pergeseran-client.tsx.
// Tidak di-export dari dpa-client.tsx karena private — duplicate type-only di sini.
export interface SentinelSwapBlockedInfo {
  target:    { uraian: string; tipe_baris: TipeBaris }
  neighbor:  { uraian: string; tipe_baris: TipeBaris }
  direction: 'up' | 'down'
}

// Generic row type yg compatible dgn DpaBarisInput / PergeseranBarisInput.
// Sentinel Swap tidak peduli field PJ atau finance — cuma butuh tree structure.
export type SentinelSwapRow = DpaBarisInput | PergeseranBarisInput

interface UseSentinelSwapParams<T extends SentinelSwapRow> {
  rows:      T[]
  onChange:  (rows: T[]) => void
  setBlocked: (info: SentinelSwapBlockedInfo | null) => void
}

interface UseSentinelSwapReturn {
  selectedRowIds: Set<string>
  toggleCheckbox: (rowId: string) => void
  geser:          (rowId: string, direction: 'up' | 'down') => void
  /** Helper: cek apakah row ter-check di UI. */
  isChecked:      (rowId: string) => boolean
  /** Multi-hapus/select-all: replace seleksi dgn ids. */
  selectAll:      (ids: string[]) => void
  clearSelection: () => void
}

export function useSentinelSwap<T extends SentinelSwapRow>({
  rows, onChange, setBlocked,
}: UseSentinelSwapParams<T>): UseSentinelSwapReturn {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  // Audit DPA 2026-06-11 B-2: buang id basi saat rows berganti (ganti versi /
  // generate ulang) — tanpa ini bar "Hapus Terpilih (n)" tampil dgn seleksi
  // milik dataset lama dan aksi hapus jadi no-op menyesatkan.
  useEffect(() => {
    // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
    queueMicrotask(() => setSelectedRowIds(prev => {
      if (prev.size === 0) return prev
      const ids = new Set(rows.map(r => r.row_id))
      const next = new Set<string>()
      for (const id of prev) if (ids.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    }))
  }, [rows])

  // Sentinel Swap — toggle checkbox dgn cascade behavior:
  //   - Check parent  → auto-check semua descendant (BFS)
  //   - Uncheck anak  → cascade reverse: SEMUA terkait (parent + sisa anak) auto-uncheck
  //   - Check/uncheck leaf solo → toggle dirinya saja
  // Per session notes: no indeterminate state.
  const toggleCheckbox = useCallback((rowId: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      const row = rows.find(r => r.row_id === rowId)
      if (!row) return prev
      const childMap = buildChildMap(rows as Array<{
        row_id: string; parent_id: string | null; uraian: string;
        kode_rekening: string; penanggung_jawab?: string | null
      }>)
      const descendants = getDescendants(rowId, childMap)
      const hasChildren = descendants.length > 0
      const isCurrentlyChecked = prev.has(rowId)

      if (isCurrentlyChecked) {
        // Uncheck path
        if (hasChildren) {
          // Parent uncheck → uncheck self + all descendants
          next.delete(rowId)
          for (const d of descendants) next.delete(d.row_id)
        } else {
          // Anak uncheck → cascade reverse: clear ALL related
          let cur: T | undefined = row
          let topCheckedAncestor: T | undefined
          while (cur?.parent_id) {
            const parent = rows.find(r => r.row_id === cur!.parent_id)
            if (!parent) break
            if (next.has(parent.row_id)) topCheckedAncestor = parent
            cur = parent
          }
          if (topCheckedAncestor) {
            next.delete(topCheckedAncestor.row_id)
            for (const d of getDescendants(topCheckedAncestor.row_id, childMap)) {
              next.delete(d.row_id)
            }
          } else {
            // Leaf solo → just uncheck self
            next.delete(rowId)
          }
        }
      } else {
        // Check path: self + cascade descendants
        next.add(rowId)
        for (const d of descendants) next.add(d.row_id)
      }
      return next
    })
  }, [rows])

  // Geser hybrid mode:
  //   - selectedRowIds empty / clicked row not in set → single-row geser (leaf existing)
  //   - selectedRowIds non-empty + clicked row ter-check → block geser
  const geser = useCallback((rowId: string, direction: 'up' | 'down') => {
    const inBlock = selectedRowIds.size > 0 && selectedRowIds.has(rowId)
    const result = inBlock
      ? geserBlock(rows, selectedRowIds, direction)
      : geserBaris(rows, rowId, direction)
    if (result.ok) {
      onChange(result.rows)
      if (inBlock) setSelectedRowIds(new Set())
    } else if (result.blocked) {
      setBlocked({ ...result.blocked, direction })
    }
  }, [rows, onChange, selectedRowIds, setBlocked])

  const isChecked = useCallback((rowId: string) => selectedRowIds.has(rowId), [selectedRowIds])

  const selectAll      = useCallback((ids: string[]) => setSelectedRowIds(new Set(ids)), [])
  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), [])

  return { selectedRowIds, toggleCheckbox, geser, isChecked, selectAll, clearSelection }
}
