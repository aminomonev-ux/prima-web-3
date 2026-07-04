// lib/sentinel/nlu/engine.mjs — otak RIMA F2 (CONCEPT §9e): ensemble 3 lapis
// deny-regex → exact-keyword → Naive Bayes → TF-IDF → kandidat (A5) → fallback.
// 100% lokal-deterministik, nol dependensi, nol network (G9/G10). Dipakai
// runtime browser (via engine.d.mts), scripts/rima-nlu-test.mjs, dan kalibrasi.

import { tokenize, normalize, levenshtein } from './normalize.mjs'

// ─── Lapis 0: deny-list G10/G11 — floor deterministik, jalan SEBELUM classifier.
// Pola dicocokkan ke teks normalize() mentah (sebelum sinonim/stem) supaya
// frasa sensitif tidak terdistorsi. Intent dipilih sespesifik mungkin; semua
// deny.* bermuara ke 4 template penolakan PERSONA §5 di knowledge.mjs.
const DENY_RULES = [
  { re: /(source ?code|kode sumber|src code|repo\b|github)/, intent: 'deny.kode' },
  { re: /(api ?key|apikey|secret key|secret\b|jwt|connection ?string|kredensial|credential|env file|file env|\.env)/, intent: 'deny.kredensial' },
  { re: /(struktur (database|db)|skema (database|db)|isi tabel|tabel users|database ?nya|kolom kolomnya|tabel \w+ kolom)/, intent: 'deny.teknis' },
  { re: /password (admin|sistem|database|db|punya|si \w+|nya \w+)|reset password punya/, intent: 'deny.akun-lain' },
  { re: /(\bhack\b|\bhek\b|bobol|jebol|curi akun|ambil alih akun)/, intent: 'deny.abuse' },
  { re: /(tanpa (lewat|ketahuan)|akalin|diakalin|matikan validasi|lewati validasi|bypass|hapus semua data)/, intent: 'deny.bypass' },
  { re: /(celah keamanan|celah\b|exploit|vulnerab|keamanan apa di)/, intent: 'deny.celah' },
  { re: /(gubernur|pilkada|pilpres|capres|partai politik|bupati|walikota)/, intent: 'deny.politik' },
  { re: /(agama (mana|apa) yang|suku (itu|mana)|antar (suku|agama)|rasis)/, intent: 'deny.sara' },
  { re: /(pinteran mana|kompeten mana|bagusan mana (direktur|kabag|kasubag|kepala))/, intent: 'deny.banding-pejabat' },
  { re: /(benci .*(atasan|bos|kabag|kasubag)|stres berat|((pengen|ingin|mau) )resign)/, intent: 'deny.curhat-sensitif' },
  { re: /(gaji (pak|bu|si)? ?\w+ berapa|nomor (hp|telepon|wa) \w+|daftar semua user|tampilkan (daftar )?semua user)/, intent: 'deny.data-orang' },
]

export function checkDeny(rawText) {
  const t = normalize(rawText)
  for (const rule of DENY_RULES) {
    if (rule.re.test(t)) return rule.intent
  }
  return null
}

// ─── Threshold (M4) — dikalibrasi via scripts/rima-nlu-test.mjs, bukan karangan.
const NB_MIN = 0.50      // posterior minimum NB menang sendiri
const NB_MARGIN = 0.12   // margin top1−top2 (M4: skor mepet → kandidat, bukan jawab)
const TFIDF_MIN = 0.40   // cosine minimum TF-IDF menang
const AGREE_MIN = 0.30   // NB & TF-IDF setuju → cukup skor moderat
const CAND_MIN = 0.16    // di bawah ini bahkan tidak layak jadi kandidat A5

// ─── Cache vektor TF-IDF per model (sekali per sesi, lazy) ───────────────────
const modelCache = new WeakMap()

function getDocVectors(model) {
  let cached = modelCache.get(model)
  if (cached) return cached
  const docs = model.docs.map(([toks, intent, star]) => {
    const vec = new Map()
    for (const t of toks.split(' ')) {
      if (!t) continue
      vec.set(t, (vec.get(t) ?? 0) + 1)
    }
    let norm = 0
    for (const [t, tf] of vec) {
      const w = tf * (model.idf[t] ?? 0)
      vec.set(t, w)
      norm += w * w
    }
    return { vec, norm: Math.sqrt(norm) || 1, intent, star }
  })
  cached = { docs }
  modelCache.set(model, cached)
  return cached
}

// A1 — koreksi typo: token di luar vocab dicari padanan jarak-edit kecil
function correctTypos(tokens, model) {
  let cached = modelCache.get(model)
  if (!cached) { getDocVectors(model); cached = modelCache.get(model) }
  if (!cached.vocab) {
    // Vocab koreksi = HANYA idf (token pertanyaan asli). tf kelas NB berisi
    // token augmentasi typo (M1) — kalau ikut, typo user dianggap kata valid
    // dan tidak pernah dikoreksi (kasus "pergesran" → gagal ke "pergeseran").
    const v = new Set(Object.keys(model.idf))
    cached.vocab = v
    cached.vocabArr = [...v]
  }
  return tokens.map(tok => {
    if (cached.vocab.has(tok) || tok.length < 4) return tok
    const maxDist = tok.length >= 7 ? 2 : 1
    let best = null
    let bestD = maxDist + 1
    for (const v of cached.vocabArr) {
      const d = levenshtein(tok, v, maxDist)
      if (d < bestD) { bestD = d; best = v; if (d === 1 && tok.length < 7) break }
    }
    return best ?? tok
  })
}

function nbTop(tokens, model, k = 3) {
  const { classes, totalDocs, vocabSize } = model.nb
  const scores = []
  for (const [intent, c] of Object.entries(classes)) {
    let lp = Math.log(c.d / totalDocs)
    for (const t of tokens) {
      lp += Math.log(((c.tf[t] ?? 0) + 1) / (c.n + vocabSize))
    }
    scores.push([intent, lp])
  }
  scores.sort((a, b) => b[1] - a[1])
  // softmax atas seluruh kelas → posterior terkalibrasi kasar
  const maxLp = scores[0][1]
  let denom = 0
  for (const [, lp] of scores) denom += Math.exp(lp - maxLp)
  return scores.slice(0, k).map(([intent, lp]) => ({
    intent,
    score: Math.exp(lp - maxLp) / denom,
  }))
}

function tfidfTop(tokens, model, k = 3) {
  const { docs } = getDocVectors(model)
  const q = new Map()
  for (const t of tokens) q.set(t, (q.get(t) ?? 0) + 1)
  let qNorm = 0
  for (const [t, tf] of q) {
    const w = tf * (model.idf[t] ?? 0)
    q.set(t, w)
    qNorm += w * w
  }
  qNorm = Math.sqrt(qNorm) || 1
  const best = []
  for (const d of docs) {
    let dot = 0
    for (const [t, w] of q) {
      const dw = d.vec.get(t)
      if (dw) dot += w * dw
    }
    if (dot === 0) continue
    best.push({ intent: d.intent, score: dot / (qNorm * d.norm) })
  }
  best.sort((a, b) => b.score - a.score)
  // dedup per intent, ambil skor tertinggi
  const seen = new Set()
  const out = []
  for (const b of best) {
    if (seen.has(b.intent)) continue
    seen.add(b.intent)
    out.push(b)
    if (out.length >= k) break
  }
  return out
}

function keywordMatch(tokens, kbKeywords) {
  if (!kbKeywords) return null
  const text = ' ' + tokens.join(' ') + ' '
  let best = null
  for (const [intent, phrases] of Object.entries(kbKeywords)) {
    for (const phrase of phrases) {
      const p = tokenize(phrase).join(' ')
      if (p && text.includes(' ' + p + ' ')) {
        if (!best || p.length > best.len) best = { intent, len: p.length }
      }
    }
  }
  return best?.intent ?? null
}

function classifyCore(rawText, model, kbKeywords) {
  const rawTokens = tokenize(rawText)
  const tokens = correctTypos(rawTokens, model)
  if (tokens.length === 0) {
    return { intent: null, score: 0, source: 'fallback', candidates: [], alsoAsked: null }
  }

  // RAL-7b — guard gibberish: koreksi typo bisa memetakan kata asing ke vocab
  // terdekat, membuat kalimat ngawur ("lorem ipsum", "xyzzy foo bar baz")
  // dijawab pede. Kalimat ≥3 kata yang < 1/3 tokennya dikenal vocab pertanyaan
  // (idf) hampir pasti bukan bahasa user PRIMA → jujur fallback. Kalimat 1–2
  // kata tetap lolos supaya typo berat ("pasword lupaa") masih tertolong
  // koreksi; pertanyaan campuran Jawa tetap lolos karena kata fungsi sudah
  // dikanonikkan SYNONYMS sebelum sampai sini (rasio dikenal tinggi).
  if (rawTokens.length >= 3) {
    const known = rawTokens.filter(t => model.idf[t] !== undefined).length
    if (known / rawTokens.length < 1 / 3) {
      return { intent: null, score: 0, source: 'fallback', candidates: [], alsoAsked: null }
    }
  }

  const kw = keywordMatch(tokens, kbKeywords)
  if (kw) return { intent: kw, score: 1, source: 'keyword', candidates: [], alsoAsked: null }

  const nb = nbTop(tokens, model)
  const tf = tfidfTop(tokens, model)
  const nbBest = nb[0]
  const tfBest = tf[0]

  // setuju → menang dengan ambang moderat (ensemble agreement)
  if (nbBest && tfBest && nbBest.intent === tfBest.intent
      && (nbBest.score >= AGREE_MIN || tfBest.score >= AGREE_MIN)) {
    return { intent: nbBest.intent, score: Math.max(nbBest.score, tfBest.score), source: 'nb', candidates: [], alsoAsked: null }
  }
  if (tfBest && tfBest.score >= TFIDF_MIN) {
    return { intent: tfBest.intent, score: tfBest.score, source: 'tfidf', candidates: [], alsoAsked: null }
  }
  if (nbBest && nbBest.score >= NB_MIN && (nb.length < 2 || nbBest.score - nb[1].score >= NB_MARGIN)) {
    return { intent: nbBest.intent, score: nbBest.score, source: 'nb', candidates: [], alsoAsked: null }
  }

  // A5 — confidence rendah: kumpulkan kandidat lintas-lapis, jangan langsung nyerah
  const merged = new Map()
  for (const c of [...tf, ...nb]) {
    if (c.score < CAND_MIN) continue
    if (!merged.has(c.intent) || merged.get(c.intent) < c.score) merged.set(c.intent, c.score)
  }
  const candidates = [...merged.entries()]
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  return { intent: null, score: nbBest?.score ?? 0, source: 'fallback', candidates, alsoAsked: null }
}

/**
 * Klasifikasi utama (input dipotong 300 char — G4).
 * M3: kalimat majemuk — bila utuh gagal, pecah di konjungsi kuat dan
 * klasifikasi per klausa; klausa kedua yang kuat ditawarkan via alsoAsked.
 */
export function classify(rawText, model, kbKeywords) {
  const raw = String(rawText ?? '').slice(0, 300)

  const deny = checkDeny(raw)
  if (deny) return { intent: deny, score: 1, source: 'deny', candidates: [], alsoAsked: null }

  const whole = classifyCore(raw, model, kbKeywords)
  if (whole.intent) return whole

  // M3 — split hanya di konjungsi yang hampir selalu memisah dua maksud
  const clauses = normalize(raw)
    .split(/\b(?:tapi|terus|lalu|kemudian|habis itu|abis itu|sekalian)\b/)
    .map(c => c.trim())
    .filter(c => c.split(' ').length >= 2)
  if (clauses.length >= 2) {
    const results = clauses.map(c => classifyCore(c, model, kbKeywords))
    const strong = results.filter(r => r.intent)
    if (strong.length > 0) {
      strong.sort((a, b) => b.score - a.score)
      const second = strong.find(r => r.intent !== strong[0].intent)
      return { ...strong[0], source: 'clause', alsoAsked: second?.intent ?? null }
    }
  }
  return whole
}
