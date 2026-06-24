// scripts/rima-nlu-test.mjs — fixture test NLU RIMA (F2, CONCEPT K2/§9e).
// Beda dgn rima-train --check (gate NB/TF-IDF atas held-out split): ini menguji
// classify() END-TO-END (deny → keyword → NB → TF-IDF → klausa) persis seperti
// di browser, atas SELURUH pertanyaan GOLDEN-QUESTIONS.md + 3 cek tambahan:
//   1. Akurasi ★ ≥90% / total ≥75% — di bawah gate → exit 1 (ikut CI gate C)
//   2. Setiap intent GQ punya jawaban (resolveAnswer ≠ null) — anti intent yatim
//   3. Setiap chips.q di KB terklasifikasi (≠ fallback) — anti chip buntu
// Jalan: `npm run rima:check` / node scripts/rima-nlu-test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { classify } from '../lib/sentinel/nlu/engine.mjs'
import { kbKeywords, resolveAnswer, RIMA_KB, RIMA_FALLBACK, RIMA_GREETING, MODULE_FALLBACK } from '../lib/sentinel/knowledge.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'docs', 'session', 'sentinel', 'GOLDEN-QUESTIONS.md')
const MODEL = path.join(ROOT, 'lib', 'sentinel', 'model.json')

const GATE_STAR = 0.90
const GATE_TOTAL = 0.75

const model = JSON.parse(readFileSync(MODEL, 'utf8'))
const keywords = kbKeywords()

// Parser sama persis dgn rima-train.mjs — wildcard (locate.*) = F3, dilewati
const LINE_RE = /^-\s*([★◇])?\s*"(.+?)"\s*(?:→|->)\s*`([a-z0-9.\-*]+)`/u
const raw = readFileSync(SRC, 'utf8')
const fixtures = []
const seen = new Set()
for (const line of raw.split('\n')) {
  const m = LINE_RE.exec(line.trim())
  if (!m) continue
  const [, mark, q, intent] = m
  if (intent.includes('*')) continue
  const key = `${q}||${intent}`
  if (seen.has(key)) continue
  seen.add(key)
  fixtures.push({ q, intent, star: mark === '★' })
}
if (fixtures.length < 100) {
  console.error(`GAGAL: cuma ${fixtures.length} fixture terparse — format GOLDEN-QUESTIONS.md berubah?`)
  process.exit(1)
}

// ─── 1. Akurasi end-to-end ───────────────────────────────────────────────────
let ok = 0
let okStar = 0
let totalStar = 0
const misses = []
const bySource = new Map()
for (const f of fixtures) {
  const r = classify(f.q, model, keywords)
  bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1)
  const hit = r.intent === f.intent
  if (hit) ok++
  else misses.push({ q: f.q, expect: f.intent, got: r.intent ?? `(${r.source})`, star: f.star })
  if (f.star) { totalStar++; if (hit) okStar++ }
}
const accTotal = ok / fixtures.length
const accStar = totalStar ? okStar / totalStar : 1

console.log(`Fixture : ${fixtures.length} pertanyaan (★ ${totalStar})`)
console.log(`Akurasi : total ${(accTotal * 100).toFixed(1)}% · ★ ${(accStar * 100).toFixed(1)}%`)
console.log(`Sumber  : ${[...bySource.entries()].map(([s, n]) => `${s} ${n}`).join(' · ')}`)
if (misses.length) {
  console.log(`Meleset (${misses.length}, tampil maks 15):`)
  for (const m of misses.slice(0, 15)) {
    console.log(`  ${m.star ? '★' : '◇'} "${m.q}" → harap ${m.expect}, dapat ${m.got}`)
  }
}

// ─── 2. Anti intent yatim: tiap intent GQ harus punya jawaban ────────────────
const orphans = [...new Set(fixtures.map(f => f.intent))].filter(i => resolveAnswer(i) === null)
if (orphans.length) {
  console.error(`GAGAL: ${orphans.length} intent GOLDEN-QUESTIONS tanpa jawaban di KB/fallback modul:`)
  for (const o of orphans) console.error(`  ${o}`)
}

// ─── 3. Anti chip buntu: tiap chips.q harus terklasifikasi ───────────────────
const allChips = []
for (const [intent, entry] of Object.entries(RIMA_KB)) {
  for (const c of entry.chips) allChips.push({ from: intent, ...c })
}
for (const set of [RIMA_FALLBACK, RIMA_GREETING, ...Object.values(MODULE_FALLBACK)]) {
  for (const c of set.chips) allChips.push({ from: set.title ?? 'fallback', ...c })
}
const deadChips = allChips.filter(c => c.q && classify(c.q, model, keywords).intent === null)
if (deadChips.length) {
  console.error(`GAGAL: ${deadChips.length} chip KB tidak terklasifikasi (buntu):`)
  for (const c of deadChips.slice(0, 15)) console.error(`  [${c.from}] "${c.l}" → "${c.q}"`)
}

const gateFail = accTotal < GATE_TOTAL || accStar < GATE_STAR
if (gateFail) {
  console.error(`GAGAL gate K2: total ${(accTotal * 100).toFixed(1)}% (min ${GATE_TOTAL * 100}%) · ★ ${(accStar * 100).toFixed(1)}% (min ${GATE_STAR * 100}%)`)
}
if (gateFail || orphans.length || deadChips.length) process.exit(1)
console.log('OK: gate akurasi K2 lolos + semua intent berjawaban + semua chip hidup.')
