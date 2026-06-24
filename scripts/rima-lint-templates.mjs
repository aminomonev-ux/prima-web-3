// scripts/rima-lint-templates.mjs — profanity-lint template RIMA (F2, PERSONA §3).
// Memindai semua teks SUARA BOT (jawaban + label chips KB, fallback, greeting)
// terhadap lib/sentinel/banned-words.json (mirror PERSONA §3). chips.q TIDAK
// dilint — itu suara user verbatim dari GOLDEN-QUESTIONS.md (boleh "lemot" dkk).
// Kata & frasa: word-boundary atas lowercase (anti false-positive "tai" di
// "detail", "salahmu" di "masalahmu"). Ada temuan → exit 1 (CI gate C, G14).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { RIMA_KB, MODULE_FALLBACK, RIMA_FALLBACK, RIMA_GREETING, RIMA_CONFUSED, RIMA_WHATS_NEW, AMBIENT_GREETINGS } from '../lib/sentinel/knowledge.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const banned = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'sentinel', 'banned-words.json'), 'utf8'))

const bound = t => new RegExp(`(^|[^a-zà-ÿ])${t}([^a-zà-ÿ]|$)`, 'i')
const wordRes = (banned.words ?? []).map(w => ({ w, re: bound(w) }))
const phraseRes = (banned.phrases ?? []).map(p => ({ p, re: bound(p.toLowerCase()) }))

const texts = []
function collect(src, set) {
  for (const a of set.answers ?? []) texts.push({ src, text: a })
  for (const c of set.chips ?? []) {
    texts.push({ src: `${src} (chip label)`, text: c.l })
  }
}
for (const [intent, entry] of Object.entries(RIMA_KB)) collect(`RIMA_KB.${intent}`, entry)
for (const [mod, entry] of Object.entries(MODULE_FALLBACK)) collect(`MODULE_FALLBACK.${mod}`, entry)
collect('RIMA_FALLBACK', RIMA_FALLBACK)
collect('RIMA_GREETING', RIMA_GREETING)
collect('RIMA_CONFUSED', RIMA_CONFUSED)
collect('RIMA_WHATS_NEW', RIMA_WHATS_NEW)
for (const g of AMBIENT_GREETINGS) texts.push({ src: `AMBIENT.${g.id}`, text: g.text })

const hits = []
for (const { src, text } of texts) {
  const low = text.toLowerCase()
  for (const { w, re } of wordRes) {
    if (re.test(low)) hits.push({ src, kind: `kata "${w}"`, text })
  }
  for (const { p, re } of phraseRes) {
    if (re.test(low)) hits.push({ src, kind: `frasa "${p}"`, text })
  }
}

if (hits.length) {
  console.error(`GAGAL lint PERSONA §3: ${hits.length} template mengandung kata/frasa terlarang:`)
  for (const h of hits.slice(0, 20)) {
    console.error(`  [${h.src}] ${h.kind}: "${h.text.slice(0, 90)}"`)
  }
  process.exit(1)
}
console.log(`OK: ${texts.length} template bersih dari ${wordRes.length} kata + ${phraseRes.length} frasa terlarang.`)
