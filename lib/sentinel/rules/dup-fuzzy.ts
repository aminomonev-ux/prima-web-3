// lib/sentinel/rules/dup-fuzzy.ts — rule BARU `dup-fuzzy` (F4) + helper Block C.
// Near-duplicate: uraian MIRIP (typo/variasi tanda baca, sim ≥ .85) dgn satuan &
// harga identik — lolos dari dup-heuristic yg menuntut uraian PERSIS sama.
// Severity warning + dismissible. Scan O(n²) di fuzzy.ts.
// Block C: baris > FUZZY_SYNC_MAX → rule.evaluate skip (return []) dan worker
// (use-fuzzy-worker) yg menghitung di thread lain; ≤ cap tetap sinkron.
// `fuzzyLeafInput` (payload worker) + `pairsToFindings` dipakai BERSAMA jalur
// sinkron & worker supaya bentuk temuan identik.
import { findFuzzyDupPairs, type FuzzyPair, type FuzzyRow } from '../fuzzy'
import type { SentinelFinding, SentinelRow, SentinelRule } from '../types'

/** Di atas ambang ini scan dipindah ke Web Worker (anti-jank, CONCEPT §9c). */
export const FUZZY_SYNC_MAX = 1000

const label = (r: SentinelRow): string =>
  (r.uraian || r.kode_rekening || '(tanpa uraian)').slice(0, 40)

const leavesOf = (rows: readonly SentinelRow[]): SentinelRow[] => {
  const hasChild = new Set<string>()
  for (const r of rows) if (r.parent_id) hasChild.add(r.parent_id)
  return rows.filter(r => !hasChild.has(r.row_id))
}

/** Payload kecil utk worker: cukup field yg dibutuhkan scan. */
export const fuzzyLeafInput = (rows: readonly SentinelRow[]): FuzzyRow[] =>
  leavesOf(rows).map(r => ({ row_id: r.row_id, uraian: r.uraian, satuan: r.satuan, harga: r.harga }))

/** Pasangan (sinkron / worker) → SentinelFinding[]. byId atas SEMUA rows. */
export const pairsToFindings = (
  pairs: readonly FuzzyPair[], rows: readonly SentinelRow[],
): SentinelFinding[] => {
  const byId = new Map(rows.map(r => [r.row_id, r]))
  return pairs.flatMap((p): SentinelFinding[] => {
    const a = byId.get(p.a), b = byId.get(p.b)
    if (!a || !b) return []
    return [{
      ruleId:   'dup-fuzzy',
      severity: 'warning',
      message:  `Dua baris hampir kembar: "${a.uraian}" ↔ "${b.uraian}" — satuan & harga sama, uraian beda tipis. Mungkin salah ketik?`,
      targets: [
        { rowId: a.row_id, label: label(a) },
        { rowId: b.row_id, label: label(b) },
      ],
      dismissKey: `dup-fuzzy:${[a.row_id, b.row_id].sort().join('+')}`,
    }]
  })
}

export const dupFuzzyRule: SentinelRule = {
  id: 'dup-fuzzy',
  scope: ['blud/dpa', 'blud/pergeseran'],
  evaluate(rows): SentinelFinding[] {
    // Block C: form raksasa → diserahkan ke worker (use-fuzzy-worker), bukan di sini
    if (rows.length > FUZZY_SYNC_MAX) return []
    return pairsToFindings(findFuzzyDupPairs(fuzzyLeafInput(rows)), rows)
  },
}
