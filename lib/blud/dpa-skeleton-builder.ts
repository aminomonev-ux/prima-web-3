// lib/blud/dpa-skeleton-builder.ts
// Convert list kode_besar (L1 + L2 + L2.1) → DpaBarisInput[] dengan hierarki:
//   L1   → GRANDMASTER, parent_id = null (root)
//   L2   → MASTER,      parent_id = auto-detect L1 by segmen pertama (split('.')[0])
//   L2.1 → CHILD,       parent_id = parent_kode field (manual user di Kode Besar)
//
// Extract dari dpa-client.tsx (BLUD-OPT-1 follow-up). Pure function, no React/DOM dep.
// Preserve-order rule: pass 2 push ke result SESUAI items order user-arranged
// (bug fix BLUD-BUG-FIX-2 Tahap 13, mencegah grouping per-level).

import { genRowId } from '@/lib/blud/format'
import { recalcDpaJumlah } from '@/lib/blud/recalc'
import type { DpaBarisInput } from '@/types'

export type KbBuildInput = {
  kode:        string
  uraian:      string
  level:       'L1' | 'L2' | 'L2.1'
  parent_kode: string | null
}

export function buildDpaRowsFromKodeBesar(items: KbBuildInput[]): DpaBarisInput[] {
  const result: DpaBarisInput[] = []
  const kodeToRowId = new Map<string, string>()

  // Pass 1: pre-generate rowId untuk L1 + L2 supaya pass 2 bisa resolve parent_id
  // tanpa peduli urutan items (L2.1 boleh tampil sebelum L2-nya di array).
  // Kunci preserve-order: pass 2 push ke result SESUAI items order user-arranged.
  for (const it of items) {
    const kode = it.kode.trim()
    if (!kode) continue
    if (it.level === 'L1' || it.level === 'L2') {
      kodeToRowId.set(kode, genRowId())
    }
  }

  // Pass 2: walk items dalam urutan user, push DpaBarisInput dgn parent_id resolved.
  // L1 → GRANDMASTER root · L2 → MASTER (parent L1 by segmen kode) · L2.1 → CHILD (parent_kode manual).
  for (const it of items) {
    const kode = it.kode.trim()
    if (!kode) continue

    let tipe: DpaBarisInput['tipe_baris']
    let parentRowId: string | null = null

    if (it.level === 'L1') {
      tipe = 'GRANDMASTER'
      parentRowId = null
    } else if (it.level === 'L2') {
      tipe = 'MASTER'
      const seg1 = kode.split('.')[0]
      const parentL1Kode = items.find(x => x.level === 'L1' && x.kode.trim().split('.')[0] === seg1)?.kode.trim()
      parentRowId = parentL1Kode ? kodeToRowId.get(parentL1Kode) ?? null : null
      if (!parentRowId) continue  // skip L2 tanpa L1 parent
    } else if (it.level === 'L2.1') {
      tipe = 'CHILD'
      const parentKode = it.parent_kode?.trim()
      if (!parentKode) continue
      parentRowId = kodeToRowId.get(parentKode) ?? null
      if (!parentRowId) continue
    } else continue

    const rowId = kodeToRowId.get(kode) ?? genRowId()
    if (!kodeToRowId.has(kode)) kodeToRowId.set(kode, rowId)

    result.push({
      row_id: rowId, parent_id: parentRowId,
      kode_rekening: kode,
      uraian: it.uraian.trim() || (it.level === 'L1' ? 'TOTAL' : ''),
      tipe_baris: tipe,
      vol: null, satuan: null, harga: null, jumlah: 0,
      penanggung_jawab: null, keterangan: null,
      urutan: result.length,
    })
  }

  return recalcDpaJumlah(result)
}
