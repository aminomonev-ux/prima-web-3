// lib/sentinel/fuzzy.ts — kemiripan uraian (Levenshtein ternormalisasi) + scan
// pasangan leaf untuk rule `dup-fuzzy` (CONCEPT §2). Modul PURE (tanpa DOM/React)
// supaya bisa dijalankan di Web Worker — Block C meng-offload scan O(n²) ini saat
// baris > ambang, lalu impor helper yang sama di main-thread sebagai fallback.
import { normUraian } from '@/lib/blud/dup-guard'

export interface FuzzyRow {
  row_id: string
  uraian: string
  satuan?: string | null
  harga?:  number | null
}

export interface FuzzyPair {
  a:   string // row_id
  b:   string // row_id
  sim: number
}

export const FUZZY_THRESHOLD = 0.85

/** Levenshtein iteratif 2-baris — O(m·n), cukup untuk uraian pendek. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = curr; curr = tmp
  }
  return prev[n]
}

/** Kemiripan 0..1 (1 = identik) atas uraian ternormalisasi. */
export function similarity(a: string, b: string): number {
  const x = normUraian(a), y = normUraian(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const max = Math.max(x.length, y.length)
  return max === 0 ? 0 : 1 - levenshtein(x, y) / max
}

const sameHargaSatuan = (a: FuzzyRow, b: FuzzyRow): boolean =>
  a.harga != null && b.harga != null && a.harga === b.harga &&
  (a.satuan ?? '').toLowerCase().trim() === (b.satuan ?? '').toLowerCase().trim()

/**
 * Pasangan leaf yg uraiannya MIRIP (threshold ≤ sim < 1) + satuan & harga sama.
 * Exact (sim = 1) sengaja dikecualikan — sudah ditangani dup-heuristic. Gate
 * satuan+harga (O(1)) memangkas mayoritas pasangan sebelum Levenshtein dipanggil.
 */
export function findFuzzyDupPairs(rows: readonly FuzzyRow[], threshold = FUZZY_THRESHOLD): FuzzyPair[] {
  const pairs: FuzzyPair[] = []
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]
    if (a.harga == null || !normUraian(a.uraian)) continue
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j]
      if (!sameHargaSatuan(a, b)) continue
      const sim = similarity(a.uraian, b.uraian)
      if (sim >= threshold && sim < 1) pairs.push({ a: a.row_id, b: b.row_id, sim })
    }
  }
  return pairs
}
