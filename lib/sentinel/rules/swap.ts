// lib/sentinel/rules/swap.ts — rule `swap`.
// Refactor dari Sentinel Swap (use-sentinel-swap.ts / geserBlock di recalc.ts):
// penjaga invariant blok DFS — subtree harus utuh & berurutan tepat di bawah
// induknya, dan tiap baris harus punya induk yang ada. Normalnya 0 temuan;
// muncul hanya bila urutan rows korup (mirror ringan validateTreeIntegrity server).

import { buildChildMap, getDescendants } from '@/lib/blud/pj-conflict'
import type { SentinelFinding, SentinelRule } from '../types'

export const swapRule: SentinelRule = {
  id: 'swap',
  scope: ['blud/dpa', 'blud/pergeseran'],
  evaluate(rows): SentinelFinding[] {
    const findings: SentinelFinding[] = []
    const idx = new Map(rows.map((r, i) => [r.row_id, i]))

    for (const r of rows) {
      if (r.parent_id && !idx.has(r.parent_id)) {
        findings.push({
          ruleId:   'swap',
          severity: 'warning',
          message:  `Baris "${r.uraian || r.kode_rekening || '?'}" yatim — induknya tidak ditemukan. Simpan bakal ditolak server; hapus atau pindahkan baris ini.`,
          targets:  [{ rowId: r.row_id, label: (r.uraian || r.kode_rekening || '?').slice(0, 40) }],
          dismissKey: `swap:orphan:${r.row_id}`,
        })
      }
    }

    const childMap = buildChildMap([...rows])
    for (const r of rows) {
      const desc = getDescendants(r.row_id, childMap)
      if (desc.length === 0) continue
      const i = idx.get(r.row_id)!
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (const d of desc) {
        const j = idx.get(d.row_id)
        if (j === undefined) continue
        if (j < min) min = j
        if (j > max) max = j
      }
      if (min !== i + 1 || max - min + 1 !== desc.length) {
        findings.push({
          ruleId:   'swap',
          severity: 'warning',
          message:  `Blok "${r.uraian || r.kode_rekening || '?'}" tercerai — anak-anaknya tidak berurutan tepat di bawah induk. Geser blok bisa kacau; rapikan urutannya.`,
          targets:  [{ rowId: r.row_id, label: (r.uraian || r.kode_rekening || '?').slice(0, 40) }],
          dismissKey: `swap:block:${r.row_id}`,
        })
      }
    }
    return findings
  },
}
