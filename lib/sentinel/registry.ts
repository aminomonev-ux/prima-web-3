// lib/sentinel/registry.ts — daftar rule per scope + evaluator tunggal RIMA (F1).
// Ref: docs/session/sentinel/CONCEPT-sentinel-bot.md §2.

import { dupHardRule, dupHeuristicRule } from './rules/dup'
import { dupFuzzyRule } from './rules/dup-fuzzy'
import { dupParentChildRule } from './rules/dup-parent-child'
import { pjConflictRule } from './rules/pj-conflict'
import { rowIncompleteRule } from './rules/row-incomplete'
import { swapRule } from './rules/swap'
import type { SentinelFinding, SentinelRow, SentinelRule, SentinelScope } from './types'

// Urutan = urutan tampil di panel (critical duluan secara natural: dup-hard pertama)
export const SENTINEL_RULES: SentinelRule[] = [
  dupHardRule,
  pjConflictRule,
  dupHeuristicRule,
  dupFuzzyRule,
  rowIncompleteRule,
  swapRule,
  dupParentChildRule,
]

export function evaluateSentinel(scope: SentinelScope, rows: readonly SentinelRow[]): SentinelFinding[] {
  const findings: SentinelFinding[] = []
  for (const rule of SENTINEL_RULES) {
    if (!rule.scope.includes(scope)) continue
    // Rule rusak tidak boleh merobohkan form host — silent fail (pola auditlog.ts)
    try {
      findings.push(...rule.evaluate(rows, { scope }))
    } catch {
      /* skip rule bermasalah */
    }
  }
  return findings
}

/** Identitas stabil temuan — dipakai diff anti-spam bubble + jump cycling. */
export const findingKey = (f: SentinelFinding): string =>
  f.dismissKey ?? `${f.ruleId}:${f.targets.map(t => t.rowId).sort().join('+')}`

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

export const sortBySeverity = (a: SentinelFinding, b: SentinelFinding): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
