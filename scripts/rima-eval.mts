// scripts/rima-eval.mts — RAL-1 harness evaluasi Rima (CONCEPT-rima-v4-learning.md).
// Jalankan golden set lewat pipeline yang SAMA dengan runtime chat:
// detectRimaDataQuery → classify (deny → keyword → NB+TF-IDF → kandidat).
// Metrik per-kind + gate no-regression vs golden-baseline.json.
//   npm run rima:eval             → evaluasi + banding baseline (exit 1 bila turun)
//   npm run rima:eval -- --update → tulis baseline baru (setelah di-review)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detectRimaDataQuery } from '../lib/sentinel/data-query'
import { classify } from '../lib/sentinel/nlu/engine.mjs'
import { kbKeywords } from '../lib/sentinel/knowledge.mjs'
import type { RimaModel } from '../lib/sentinel/nlu/engine.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GOLDEN_PATH = join(ROOT, 'lib/sentinel/nlu/golden-set.json')
const BASELINE_PATH = join(ROOT, 'lib/sentinel/nlu/golden-baseline.json')
const MODEL_PATH = join(ROOT, 'lib/sentinel/model.json')

interface Expect { kind: 'data' | 'kb' | 'deny' | 'none'; app?: string; intent?: string; tahun?: string; status?: string }
interface Case { q: string; expect: Expect }
type PerKind = Record<string, { pass: number; total: number }>

const model = JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as RimaModel
const keywords = kbKeywords()
const { cases } = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as { cases: Case[] }

const Y = new Date().getFullYear()
const resolveTahun = (t?: string) => t === 'Y' ? String(Y) : t === 'Y-1' ? String(Y - 1) : t

function evalCase(c: Case): { pass: boolean; got: string } {
  const exp = c.expect
  // Lapis 1 — data-query (urutan sama dgn RimaChat.ask)
  const dq = detectRimaDataQuery(c.q)
  if (dq) {
    if (exp.kind !== 'data') return { pass: false, got: `data:${dq.app}.${dq.intent} (false-positive)` }
    const tahunOk = exp.tahun === undefined || dq.tahun === resolveTahun(exp.tahun)
    const statusOk = exp.status === undefined || dq.status === exp.status
    const ok = dq.app === exp.app && dq.intent === exp.intent && tahunOk && statusOk
    return { pass: ok, got: `data:${dq.app}.${dq.intent} tahun=${dq.tahun ?? '-'} status=${dq.status ?? '-'}` }
  }
  // Lapis 2 — classifier KB (deny ditangani di dalam classify)
  const r = classify(c.q, model, keywords)
  if (r.intent) {
    if (r.intent.startsWith('deny.'))
      return { pass: exp.kind === 'deny', got: `deny:${r.intent}` }
    if (exp.kind !== 'kb') return { pass: false, got: `kb:${r.intent}` }
    return { pass: r.intent === exp.intent, got: `kb:${r.intent}` }
  }
  // Lapis 3 — fallback/kandidat (tidak menjawab pasti)
  return { pass: exp.kind === 'none', got: r.candidates.length ? `candidates:${r.candidates.map(x => x.intent).join(',')}` : 'fallback' }
}

const perKind: PerKind = {}
const failures: string[] = []
for (const c of cases) {
  const { pass, got } = evalCase(c)
  const k = c.expect.kind
  perKind[k] = perKind[k] ?? { pass: 0, total: 0 }
  perKind[k].total += 1
  if (pass) perKind[k].pass += 1
  else failures.push(`  [${k}] "${c.q}"\n     exp=${JSON.stringify(c.expect)} got=${got}`)
}

const pct = (p: number, t: number) => t ? Math.round((p / t) * 1000) / 10 : 100
const totalPass = Object.values(perKind).reduce((a, k) => a + k.pass, 0)
const totalAll = Object.values(perKind).reduce((a, k) => a + k.total, 0)

console.log('── Rima eval (golden set) ──')
for (const [k, v] of Object.entries(perKind))
  console.log(`  ${k.padEnd(5)} ${String(v.pass).padStart(3)}/${String(v.total).padEnd(3)} (${pct(v.pass, v.total)}%)`)
console.log(`  TOTAL ${totalPass}/${totalAll} (${pct(totalPass, totalAll)}%)`)
if (failures.length) console.log(`\nGagal (${failures.length}):\n${failures.join('\n')}`)

interface Baseline { perKind: Record<string, number>; total: number }
const current: Baseline = {
  perKind: Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, pct(v.pass, v.total)])),
  total: pct(totalPass, totalAll),
}

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(`\nBaseline diperbarui → ${BASELINE_PATH}`)
  process.exit(0)
}

if (!existsSync(BASELINE_PATH)) {
  console.log('\nBaseline belum ada — jalankan dengan --update untuk membuatnya.')
  process.exit(0)
}

// Gate no-regression: per-kind DAN total tidak boleh turun vs baseline.
const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
const regressions: string[] = []
for (const [k, v] of Object.entries(base.perKind)) {
  const cur = current.perKind[k] ?? 0
  if (cur < v) regressions.push(`  ${k}: ${v}% → ${cur}%`)
}
if (current.total < base.total) regressions.push(`  TOTAL: ${base.total}% → ${current.total}%`)

if (regressions.length) {
  console.error(`\n❌ REGRESI vs baseline:\n${regressions.join('\n')}`)
  process.exit(1)
}
console.log('\n✅ Tidak ada regresi vs baseline.')
