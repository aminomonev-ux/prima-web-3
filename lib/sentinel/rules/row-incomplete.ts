// lib/sentinel/rules/row-incomplete.ts — rule BARU `row-incomplete` (F4).
// Leaf yg SUDAH diisi uraian tapi belum lengkap: tanpa kode rekening / penanggung
// jawab, atau vol×harga = 0. Pristine (uraian kosong) & aggregator (punya anak)
// dilewati supaya tak berisik. Severity warning + dismissible — ringkasan
// kelengkapan pre-save (CONCEPT §2).
import { normUraian } from '@/lib/blud/dup-guard'
import type { SentinelFinding, SentinelRow, SentinelRule } from '../types'

const missing = (r: SentinelRow): string | null => {
  const reasons: string[] = []
  if (!r.kode_rekening?.trim()) reasons.push('kode rekening')
  if (!r.penanggung_jawab?.trim()) reasons.push('penanggung jawab')
  if (!(Number(r.vol) > 0) || !(Number(r.harga) > 0)) reasons.push('volume × harga')
  return reasons.length ? reasons.join(', ') : null
}

export const rowIncompleteRule: SentinelRule = {
  id: 'row-incomplete',
  scope: ['blud/dpa'],
  evaluate(rows): SentinelFinding[] {
    const hasChild = new Set<string>()
    for (const r of rows) if (r.parent_id) hasChild.add(r.parent_id)
    const findings: SentinelFinding[] = []
    for (const r of rows) {
      if (hasChild.has(r.row_id)) continue   // aggregator skip
      if (!normUraian(r.uraian)) continue    // baris pristine skip
      const miss = missing(r)
      if (!miss) continue
      findings.push({
        ruleId:   'row-incomplete',
        severity: 'warning',
        message:  `Baris "${r.uraian.slice(0, 40)}" belum lengkap — ${miss} masih kosong.`,
        targets:  [{ rowId: r.row_id, label: (r.uraian || '(tanpa uraian)').slice(0, 40) }],
        dismissKey: `row-incomplete:${r.row_id}`,
      })
    }
    return findings
  },
}
