// lib/sentinel/rules/dup.ts — rule `dup-hard` + `dup-heuristic`.
// Refactor dari banner Sentinel Guard (lib/blud/dup-guard.ts tetap single source
// of truth) — bot RIMA jadi UI tambahan, banner lama tetap berdampingan di F1.

import { validateDupRules, type DupFinding } from '@/lib/blud/dup-guard'
import type { SentinelFinding, SentinelRule } from '../types'

const pairKey = (f: DupFinding) => [f.a.row_id, f.b.row_id].sort().join('+')

const label = (uraian: string, kode: string) =>
  (uraian || kode || '(tanpa uraian)').slice(0, 40)

export const dupHardRule: SentinelRule = {
  id: 'dup-hard',
  scope: ['blud/dpa'],
  evaluate(rows): SentinelFinding[] {
    return validateDupRules(rows)
      .filter(f => f.kind === 'hard')
      .map(f => ({
        ruleId:   'dup-hard',
        severity: 'critical',
        message:  `Entri ganda PASTI: "${f.a.uraian}" — ${f.reason}. Hapus salah satunya sebelum simpan.`,
        targets: [
          { rowId: f.a.row_id, label: label(f.a.uraian, f.a.kode_rekening) },
          { rowId: f.b.row_id, label: label(f.b.uraian, f.b.kode_rekening) },
        ],
        // critical: tanpa dismissKey — tidak bisa di-Abaikan (CONCEPT §2)
      }))
  },
}

export const dupHeuristicRule: SentinelRule = {
  id: 'dup-heuristic',
  scope: ['blud/dpa', 'blud/pergeseran'],
  evaluate(rows): SentinelFinding[] {
    return validateDupRules(rows)
      .filter(f => f.kind === 'heuristic')
      .map(f => ({
        ruleId:   'dup-heuristic',
        severity: 'warning',
        message:  `Ada 2 baris kembar: "${f.a.uraian}" — uraian, satuan, dan harga identik. Dobel entri, atau memang sengaja?`,
        targets: [
          { rowId: f.a.row_id, label: label(f.a.uraian, f.a.kode_rekening) },
          { rowId: f.b.row_id, label: label(f.b.uraian, f.b.kode_rekening) },
        ],
        dismissKey: `dup-heuristic:${pairKey(f)}`,
      }))
  },
}
