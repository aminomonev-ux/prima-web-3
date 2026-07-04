// scripts/rima-train.mjs — pipeline latih "Rima Belajar" (F2, CONCEPT §9e).
// Parse GOLDEN-QUESTIONS.md → augmentasi sinonim+typo (M1, ≥10 contoh/intent M2)
// → split 80/20 → latih Naive Bayes Laplace → akurasi + confusion report →
// tulis lib/sentinel/model.json (NB + idf + dok TF-IDF dari pertanyaan asli).
//
// Jalan: `npm run rima:train` (tulis model) · `npm run rima:train -- --check`
// (CI: latih ulang in-memory, gagal bila gate tak lolos ATAU model.json basi).
// Deterministik penuh (PRNG seeded) supaya --check bisa byte-compare.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { tokenize, normalize, SYNONYMS } from '../lib/sentinel/nlu/normalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'docs', 'session', 'sentinel', 'GOLDEN-QUESTIONS.md')
const OUT = path.join(ROOT, 'lib', 'sentinel', 'model.json')
const CHECK = process.argv.includes('--check')

// Gate selaras K2/§9e — di bawah ini build GAGAL
const GATE_STAR = 0.90
const GATE_TOTAL = 0.75
const MIN_EXAMPLES = 10

// ─── PRNG deterministik (mulberry32) ─────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ─── 1. Parse GOLDEN-QUESTIONS.md ────────────────────────────────────────────
if (!existsSync(SRC)) {
  console.error(`GAGAL: sumber latih tidak ada: ${SRC}\n` +
    'Workspace ini tidak menyertakan docs/session/sentinel/ — copy dari repo prima-web asli dulu.')
  process.exit(1)
}
const raw = readFileSync(SRC, 'utf8')
const LINE_RE = /^-\s*([★◇])?\s*"(.+?)"\s*(?:→|->)\s*`([a-z0-9.\-*]+)`/u
const originals = []
const seenQ = new Set()
for (const line of raw.split('\n')) {
  const m = LINE_RE.exec(line.trim())
  if (!m) continue
  const [, mark, q, intent] = m
  if (intent.includes('*')) continue // pola wildcard (locate.*) — bukan kelas latih
  const key = `${q}||${intent}`
  if (seenQ.has(key)) continue
  seenQ.add(key)
  originals.push({ q, intent, star: mark === '★' ? 1 : 0 })
}
if (originals.length < 100) {
  console.error(`GAGAL: cuma ${originals.length} pertanyaan terparse — format GOLDEN-QUESTIONS.md berubah?`)
  process.exit(1)
}

// ─── 1b. RAL-4 — dataset berlabel dari workbench admin (CONCEPT-rima-v4-learning.md)
// Export JSONL panel "Rima Feedback" ({text,intent,weak}) ikut dilatih: label admin
// (weak:false) diaugmentasi penuh seperti pertanyaan golden; label lemah dari klik
// kandidat user (weak:true) masuk 1 contoh polos tanpa augmentasi (bobot rendah,
// anti label berisik). Intent harus sudah ada di GOLDEN-QUESTIONS.md — intent asing
// dilewati (KB belum punya jawabannya; tambah dulu lewat PR KB).
const labArgIdx = process.argv.indexOf('--labeled')
const LABELED = labArgIdx > -1
  ? process.argv[labArgIdx + 1]
  : path.join(ROOT, 'docs', 'session', 'sentinel', 'rima-labeled.jsonl')
let labeledRaw = ''
if (LABELED && existsSync(LABELED)) {
  labeledRaw = readFileSync(LABELED, 'utf8')
  const knownIntents = new Set(originals.map(o => o.intent))
  let addedL = 0
  let skippedL = 0
  for (const line of labeledRaw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let row
    try { row = JSON.parse(t) } catch { skippedL++; continue }
    const { text, intent, weak } = row ?? {}
    if (typeof text !== 'string' || typeof intent !== 'string') { skippedL++; continue }
    if (!knownIntents.has(intent)) {
      console.warn(`  lewati label (intent belum ada di golden): ${intent} — "${text}"`)
      skippedL++; continue
    }
    const key = `${text}||${intent}`
    if (seenQ.has(key)) { skippedL++; continue }
    seenQ.add(key)
    originals.push({ q: text, intent, star: 0, weak: !!weak })
    addedL++
  }
  console.log(`Label workbench: +${addedL} contoh (${skippedL} dilewati) ← ${LABELED}`)
}

// ─── 2+3. Normalisasi + augmentasi (M1): sinonim balik + typo deterministik ──
const REV_SYN = {}
for (const [surface, canon] of Object.entries(SYNONYMS)) {
  if (canon.includes(' ')) continue
  if (!REV_SYN[canon]) REV_SYN[canon] = []
  if (REV_SYN[canon].length < 3) REV_SYN[canon].push(surface)
}

function typoVariants(normText, rand, cap) {
  const words = normText.split(' ')
  const out = []
  const idxs = words.map((w, i) => [w, i]).filter(([w]) => w.length >= 5).map(([, i]) => i)
  for (const i of idxs) {
    const w = words[i]
    const p = 1 + Math.floor(rand() * (w.length - 2))
    out.push(words.map((x, j) => (j === i ? x.slice(0, p) + x.slice(p + 1) : x)).join(' '))       // omisi
    out.push(words.map((x, j) => (j === i ? x.slice(0, p - 1) + x[p] + x[p - 1] + x.slice(p + 1) : x)).join(' ')) // transposisi
    if (out.length >= cap) break
  }
  return out.slice(0, cap)
}

function synVariants(normText, cap) {
  const words = normText.split(' ')
  const out = []
  for (let i = 0; i < words.length && out.length < cap; i++) {
    const alts = REV_SYN[words[i]]
    if (!alts) continue
    for (const a of alts) {
      out.push(words.map((x, j) => (j === i ? a : x)).join(' '))
      if (out.length >= cap) break
    }
  }
  return out
}

const byIntent = new Map()
for (const o of originals) {
  if (!byIntent.has(o.intent)) byIntent.set(o.intent, [])
  byIntent.get(o.intent).push(o)
}

const dataset = new Map() // intent → [{tokens, star}]
let padded = 0
for (const [intent, items] of byIntent) {
  const rand = mulberry32(items.length * 7919 + intent.length)
  const variants = new Map() // tokenJoin → star
  for (const o of items) {
    const norm = normalize(o.q)
    // RAL-4: label lemah (weak) TANPA augmentasi — 1 contoh polos, bobot kecil
    const texts = o.weak ? [norm] : [norm, ...synVariants(norm, 4), ...typoVariants(norm, rand, 6)]
    for (const t of texts) {
      const toks = tokenize(t)
      if (toks.length === 0) continue
      const key = toks.join(' ')
      if (!variants.has(key)) variants.set(key, o.star)
    }
  }
  let list = [...variants.entries()].map(([t, star]) => ({ tokens: t.split(' '), star }))
  // M2: pad oversample sampai ≥10 (duplikasi = pembobotan, dilaporkan jujur)
  if (list.length < MIN_EXAMPLES) {
    padded++
    const base = [...list]
    let i = 0
    while (list.length < MIN_EXAMPLES) { list.push(base[i % base.length]); i++ }
  }
  dataset.set(intent, list)
}

// ─── 4. Split 80/20 per intent + latih NB Laplace ────────────────────────────
const train = []
const test = []
for (const [intent, list] of dataset) {
  const rand = mulberry32(hashStr(intent).length * 31 + list.length)
  const shuffled = [...list].sort(() => rand() - 0.5)
  const nTest = Math.max(1, Math.floor(shuffled.length * 0.2))
  for (let i = 0; i < shuffled.length; i++) {
    (i < nTest ? test : train).push({ intent, ...shuffled[i] })
  }
}

function trainNB(rows) {
  const classes = {}
  const vocab = new Set()
  for (const r of rows) {
    if (!classes[r.intent]) classes[r.intent] = { d: 0, n: 0, tf: {} }
    const c = classes[r.intent]
    c.d++
    for (const t of r.tokens) {
      c.tf[t] = (c.tf[t] ?? 0) + 1
      c.n++
      vocab.add(t)
    }
  }
  return { classes, totalDocs: rows.length, vocabSize: vocab.size }
}
const nb = trainNB(train)

function nbPredict(tokens, model) {
  let best = null
  let bestLp = -Infinity
  for (const [intent, c] of Object.entries(model.classes)) {
    let lp = Math.log(c.d / model.totalDocs)
    for (const t of tokens) lp += Math.log(((c.tf[t] ?? 0) + 1) / (c.n + model.vocabSize))
    if (lp > bestLp) { bestLp = lp; best = intent }
  }
  return best
}

// ─── idf + dok TF-IDF dari pertanyaan ASLI (lapis 3 runtime) ─────────────────
const docTokens = originals.map(o => ({ toks: tokenize(o.q), intent: o.intent, star: o.star }))
const df = new Map()
for (const d of docTokens) {
  for (const t of new Set(d.toks)) df.set(t, (df.get(t) ?? 0) + 1)
}
const idf = {}
for (const [t, n] of [...df.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  idf[t] = Math.round((Math.log((docTokens.length + 1) / (n + 1)) + 1) * 1000) / 1000
}

function tfidfPredict(tokens) {
  const q = new Map()
  for (const t of tokens) q.set(t, (q.get(t) ?? 0) + 1)
  let qNorm = 0
  for (const [t, tf] of q) { const w = tf * (idf[t] ?? 0); q.set(t, w); qNorm += w * w }
  qNorm = Math.sqrt(qNorm) || 1
  let best = null
  let bestS = 0
  for (const d of docTokens) {
    const vec = new Map()
    for (const t of d.toks) vec.set(t, (vec.get(t) ?? 0) + 1)
    let dNorm = 0
    let dot = 0
    for (const [t, tf] of vec) {
      const w = tf * (idf[t] ?? 0)
      dNorm += w * w
      const qw = q.get(t)
      if (qw) dot += qw * w
    }
    const s = dot / (qNorm * (Math.sqrt(dNorm) || 1))
    if (s > bestS) { bestS = s; best = d.intent }
  }
  return { intent: best, score: bestS }
}

// ─── 5. Evaluasi test-set: NB sendiri + ensemble (NB ∨ TF-IDF) + confusion ───
let okNB = 0
let okEns = 0
let okStar = 0
let totalStar = 0
const confusion = new Map()
for (const r of test) {
  const pNB = nbPredict(r.tokens, nb)
  const pTF = tfidfPredict(r.tokens)
  const pEns = pTF.score >= 0.4 ? pTF.intent : pNB
  if (pNB === r.intent) okNB++
  if (pEns === r.intent) okEns++
  else {
    const key = `${r.intent} ↔ ${pEns}`
    confusion.set(key, (confusion.get(key) ?? 0) + 1)
  }
  if (r.star) { totalStar++; if (pEns === r.intent) okStar++ }
}
const accNB = okNB / test.length
const accEns = okEns / test.length
const accStar = totalStar ? okStar / totalStar : 1

console.log(`Dataset : ${originals.length} pertanyaan asli → ${train.length} train / ${test.length} test (augmented) · ${dataset.size} intent (${padded} di-pad ke ${MIN_EXAMPLES})`)
console.log(`Akurasi : NB ${(accNB * 100).toFixed(1)}% · Ensemble ${(accEns * 100).toFixed(1)}% · ★ ${(accStar * 100).toFixed(1)}% (${totalStar} item)`)
const topConf = [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
if (topConf.length) {
  console.log('Confusion teratas:')
  for (const [pair, n] of topConf) console.log(`  ${n}× ${pair}`)
}

if (accEns < GATE_TOTAL || accStar < GATE_STAR) {
  console.error(`GAGAL gate M2/K2: ensemble ${(accEns * 100).toFixed(1)}% (min ${GATE_TOTAL * 100}%) · ★ ${(accStar * 100).toFixed(1)}% (min ${GATE_STAR * 100}%)`)
  console.error('Tambah contoh/sinonim untuk intent yang tertukar di confusion report.')
  process.exit(1)
}

// ─── 6. Latih ULANG NB di SELURUH data (train+test) untuk model produksi ─────
const nbFull = trainNB([...train, ...test])
const model = {
  v: 1,
  // srcHash mencakup dataset label (RAL-4) supaya --check mendeteksi model basi
  srcHash: hashStr(raw + ' ' + labeledRaw),
  nb: nbFull,
  idf,
  docs: docTokens.filter(d => d.toks.length > 0).map(d => [d.toks.join(' '), d.intent, d.star]),
}
const json = JSON.stringify(model)

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error('GAGAL --check: lib/sentinel/model.json belum ada — jalankan `npm run rima:train`.')
    process.exit(1)
  }
  const existing = readFileSync(OUT, 'utf8')
  if (existing !== json) {
    console.error('GAGAL --check: model.json basi (GOLDEN-QUESTIONS.md / normalisasi berubah) — jalankan `npm run rima:train` dan commit hasilnya.')
    process.exit(1)
  }
  console.log('OK --check: gate akurasi lolos + model.json sinkron dengan sumber.')
} else {
  writeFileSync(OUT, json)
  console.log(`model.json ditulis: ${(json.length / 1024).toFixed(1)} KB · ${Object.keys(nbFull.classes).length} kelas · vocab ${nbFull.vocabSize}`)
}
