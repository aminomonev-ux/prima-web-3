// scripts/rima-mine-faillog.mjs — alur C "fail-log → golden" (CONCEPT §9e, #2).
// Tambang pertanyaan user yang RIMA gagal jawab (tabel rima_unanswered) →
// klasifikasi pakai model.json YANG SAMA dgn runtime → sarankan baris golden
// siap-review. HUMAN-IN-THE-LOOP: tool TIDAK menulis GOLDEN-QUESTIONS.md sendiri
// (KB = kode, wajib lewat review/PR — G14). Dev review label → tempel ke
// GOLDEN-QUESTIONS.md → `npm run rima:train` → commit.
//
// USAGE:
//   node scripts/rima-mine-faillog.mjs                 # baca DB (rima_unanswered)
//   node scripts/rima-mine-faillog.mjs --limit 120     # ambil lebih banyak
//   node scripts/rima-mine-faillog.mjs --file dump.json # offline: array [{question,jumlah}]
// READ-ONLY: hanya SELECT tabel telemetri sendiri; nol tulis ke DB/KB.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { classify } from '../lib/sentinel/nlu/engine.mjs'
import { normalize } from '../lib/sentinel/nlu/normalize.mjs'
import { RIMA_KB } from '../lib/sentinel/knowledge.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const getArg = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def }
const LIMIT = parseInt(getArg('--limit', '80'), 10)
const FILE = getArg('--file', null)

function loadEnv() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

// ─── model + KB keywords (sama persis dgn runtime) ───────────────────────────
const model = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'sentinel', 'model.json'), 'utf8'))
const kbKeywords = Object.fromEntries(Object.entries(RIMA_KB).map(([id, e]) => [id, e.keywords ?? []]))
const KNOWN_INTENTS = new Set(Object.keys(RIMA_KB))

// ─── golden existing (dedupe: jangan sarankan yg sudah ada) ───────────────────
const goldenRaw = readFileSync(path.join(ROOT, 'docs', 'session', 'sentinel', 'GOLDEN-QUESTIONS.md'), 'utf8')
const GLINE = /^-\s*[★◇]?\s*"(.+?)"\s*(?:→|->)\s*`([a-z0-9.\-*]+)`/u
const seenGolden = new Set()
for (const ln of goldenRaw.split('\n')) {
  const m = GLINE.exec(ln.trim())
  if (m) seenGolden.add(normalize(m[1]))
}

// ─── ambil fail-log: DB (default) atau --file ────────────────────────────────
async function fetchRows() {
  if (FILE) {
    const arr = JSON.parse(readFileSync(path.resolve(FILE), 'utf8'))
    return arr.map(r => ({ question: r.question, jumlah: Number(r.jumlah ?? r.count ?? 1) }))
  }
  loadEnv()
  const mysql = (await import('mysql2/promise')).default
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'prima_db',
  })
  try {
    const [rows] = await conn.query(
      `SELECT question, COUNT(*) AS jumlah, MAX(created_at) AS terakhir
         FROM rima_unanswered GROUP BY question
        ORDER BY jumlah DESC, terakhir DESC LIMIT ?`, [LIMIT])
    return rows.map(r => ({ question: r.question, jumlah: Number(r.jumlah) }))
  } finally {
    await conn.end()
  }
}

function run() {
  return fetchRows().then(rows => {
    const covered = []   // sudah terjawab model sekarang (model sudah tumbuh)
    const suggest = []   // ada kandidat → saran baris golden (REVIEW labelnya!)
    const baru = []      // tak ada kandidat → butuh intent manual / intent baru
    const dup = []       // sudah ada di golden

    for (const r of rows) {
      const q = String(r.question || '').trim()
      if (!q) continue
      if (seenGolden.has(normalize(q))) { dup.push(r); continue }
      const res = classify(q, model, kbKeywords)
      if (res.intent && res.source !== 'fallback') {
        covered.push({ ...r, intent: res.intent, score: res.score, source: res.source })
      } else if (res.candidates && res.candidates.length) {
        suggest.push({ ...r, cand: res.candidates })
      } else {
        baru.push(r)
      }
    }

    const pct = n => rows.length ? ((n / rows.length) * 100).toFixed(0) : '0'
    console.log(`\n=== RIMA fail-log mining — ${rows.length} pertanyaan unik (${FILE ? 'file' : 'DB'}) ===`)
    console.log(`  ✅ sudah terjawab model sekarang : ${covered.length} (${pct(covered.length)}%)`)
    console.log(`  ✍️  ada kandidat (saran golden)  : ${suggest.length} (${pct(suggest.length)}%)`)
    console.log(`  🆕 tanpa kandidat (label manual) : ${baru.length} (${pct(baru.length)}%)`)
    console.log(`  ⏭️  sudah ada di golden           : ${dup.length}`)

    if (suggest.length) {
      console.log(`\n--- SARAN (review label dulu, lalu tempel ke GOLDEN-QUESTIONS.md) ---`)
      console.log(`>   tag confidence: [tinggi]=skor≥.40  [cek]=skor<.40 (rawan salah label)`)
      for (const s of suggest) {
        const top = s.cand[0]
        const tag = top.score >= 0.40 ? 'tinggi' : 'cek'
        const alts = s.cand.slice(1).map(c => `${c.intent}(${c.score.toFixed(2)})`).join(' / ')
        console.log(`- ◇ "${s.question}" → \`${top.intent}\`   # ${s.jumlah}×  [${tag} ${top.score.toFixed(2)}]${alts ? '  alt: ' + alts : ''}`)
      }
    }
    if (baru.length) {
      console.log(`\n--- BARU (model tak punya kandidat — tentukan intent manual / intent baru) ---`)
      for (const b of baru) console.log(`- ◇ "${b.question}" → \`???\`   # ${b.jumlah}×`)
    }

    console.log(`\nLangkah: review label di atas → tempel baris benar ke seksi fail-log GOLDEN-QUESTIONS.md`)
    console.log(`→ \`npm run rima:train\` (cek gate ★≥90% / total≥75%) → commit GOLDEN + model.json.`)
    console.log(`Intent valid hanya yang terdaftar di knowledge.mjs (${KNOWN_INTENTS.size} intent).\n`)
  })
}

run().catch(e => {
  console.error('\n[GAGAL]', e.message)
  console.error('Tip: pastikan .env.local ada (MYSQL_*) untuk mode DB, atau pakai --file dump.json')
  console.error('     (dump.json = output GET /api/rima/feedback: array [{question, jumlah}]).')
  process.exit(1)
})
