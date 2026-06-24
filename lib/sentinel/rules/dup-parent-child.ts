// lib/sentinel/rules/dup-parent-child.ts — rule BARU `dup-parent-child` (F1).
// Kasus "RAM — 1 tera": induk & anak ber-uraian ternormalisasi sama. Lolos dari
// dup-heuristic karena heuristik skip aggregator (leaf-only) — di sini ditangkap.
// Severity info + dismissible: pola induk=anak kadang legitimate (sub-rincian 1 item).

import { normUraian } from '@/lib/blud/dup-guard'
import type { SentinelFinding, SentinelRule } from '../types'

export const dupParentChildRule: SentinelRule = {
  id: 'dup-parent-child',
  scope: ['blud/dpa', 'blud/pergeseran'],
  evaluate(rows): SentinelFinding[] {
    const findings: SentinelFinding[] = []
    const byId = new Map(rows.map(r => [r.row_id, r]))
    for (const r of rows) {
      if (!r.parent_id) continue
      const parent = byId.get(r.parent_id)
      if (!parent) continue
      const u = normUraian(r.uraian)
      if (!u || u !== normUraian(parent.uraian)) continue
      findings.push({
        ruleId:   'dup-parent-child',
        severity: 'info',
        message:  `Ada uraian sama di induk dan anaknya: "${r.uraian}". Sengaja, atau salah satu harusnya beda?`,
        targets: [
          { rowId: parent.row_id, label: `Induk: ${(parent.uraian || '?').slice(0, 36)}` },
          { rowId: r.row_id,      label: `Anak: ${(r.uraian || '?').slice(0, 36)}` },
        ],
        dismissKey: `dup-parent-child:${[parent.row_id, r.row_id].sort().join('+')}`,
      })
    }
    return findings
  },
}
