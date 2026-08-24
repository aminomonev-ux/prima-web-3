// lib/sentinel/rules/pj-conflict.ts — rule `pj-conflict`.
// Refactor dari banner Sentinel PJ — validateAllPj (lib/blud/pj-conflict.ts)
// tetap single source of truth; bot RIMA jadi UI tambahan di F1.

import { validateAllPj } from '@/lib/blud/pj-conflict'
import type { SentinelFinding, SentinelRule } from '../types'

export const pjConflictRule: SentinelRule = {
  id: 'pj-conflict',
  // DPA saja — dan sejak migration-pergeseran-pj alasannya BUKAN lagi "Pergeseran
  // tidak punya kolomnya". Pergeseran punya, tapi isinya cermin DPA: menegur di
  // sana berarti menyuruh orang membetulkan barisan yang bukan miliknya, dan
  // teguran yang sama sudah muncul di layar DPA. Chain-conflict pada angka
  // pasca-geser tetap dilaporkan panel audit menu Cetak.
  scope: ['blud/dpa'],
  evaluate(rows): SentinelFinding[] {
    return validateAllPj([...rows]).map(p => ({
      ruleId:   'pj-conflict',
      severity: 'warning',
      message:  `Penanggung Jawab dobel segaris: "${p.conflict.uraian}" (${p.conflict.pj}) dan "${p.row.uraian}" (${p.row.pj}) — rekap PJ bakal menghitung ganda.`,
      targets: [
        { rowId: p.conflict.row_id, label: p.conflict.kode_rekening || p.conflict.uraian.slice(0, 36) },
        { rowId: p.row.row_id,      label: p.row.kode_rekening || p.row.uraian.slice(0, 36) },
      ],
      dismissKey: `pj-conflict:${[p.conflict.row_id, p.row.row_id].sort().join('+')}`,
    }))
  },
}
