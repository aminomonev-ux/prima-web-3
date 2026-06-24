// lib/sentinel/calc.mjs — Kalkulator RIMA F5a (CONCEPT-rima-v2 §2). PURE, lokal,
// deterministik, TANPA eval/new Function (G17). Tidak menyentuh data PRIMA (G16) —
// hanya menghitung angka yang user ketik. Shared (.mjs): dipakai browser + Node.
//
// Cakupan: aritmatika + ilmiah (akar/log/trig/faktorial) + statistik + geometri
// (luas/keliling/volume) + konversi satuan + terbilang Rupiah.
// tryCalc(text) = router: kembalikan jawaban siap-tampil, atau null (bukan hitungan
// → biarkan classifier NLU yang jawab).

// ─── Format angka gaya Indonesia (1.234,56) ─────────────────────────────────
export function fmtNum(n) {
  if (!isFinite(n)) return n > 0 ? '∞' : (Number.isNaN(n) ? '—' : '-∞')
  const neg = n < 0
  let s = (Math.round(Math.abs(n) * 1e6) / 1e6).toString()
  if (s.includes('e')) s = Math.abs(n).toFixed(6)
  let [int, dec] = s.split('.')
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (dec) dec = dec.replace(/0+$/, '')
  return (neg ? '-' : '') + (dec ? `${int},${dec}` : int)
}

// ─── Parse satu angka (dukung 1.000.000 & 2,5) ──────────────────────────────
function parseNum(raw) {
  let s = String(raw).trim()
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  else s = s.replace(',', '.')
  const n = Number(s)
  return isFinite(n) ? n : NaN
}

// Ekstrak semua angka dari teks bebas (statistik/geometri)
function extractNums(text) {
  const m = text.match(/-?\d[\d.,]*/g) || []
  return m.map(parseNum).filter(x => isFinite(x))
}

// ─── Aritmatika & ilmiah: shunting-yard (no eval) ───────────────────────────
const FUNCS = {
  sqrt: Math.sqrt, akar: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  round: Math.round, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log: x => Math.log10(x), exp: Math.exp,
  sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180),
  tan: x => Math.tan(x * Math.PI / 180),
  asin: x => Math.asin(x) * 180 / Math.PI, acos: x => Math.acos(x) * 180 / Math.PI,
  atan: x => Math.atan(x) * 180 / Math.PI,
  fact: factorial, factorial,
}
const CONSTS = { pi: Math.PI, e: Math.E }
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, 'u-': 4 }
const RIGHT = { '^': true, 'u-': true }

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN
  if (n > 170) return Infinity
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function normalizeExpr(input) {
  let s = ' ' + input.toLowerCase() + ' '
  s = s.replace(/[=?]+/g, ' ')            // kebiasaan ketik "1000*900/40=" / "...?"
  s = s.replace(/[×✕]/g, '*').replace(/[÷:]/g, '/').replace(/π/g, 'pi')
  // kata operator → simbol
  s = s.replace(/\bditambah\b|\btambah\b|\bplus\b/g, '+')
       .replace(/\bdikurangi\b|\bkurang\b|\bminus\b/g, '-')
       .replace(/\bdikali(?:kan)?\b|\bkali\b/g, '*')
       .replace(/\bdibagi\b|\bbagi\b/g, '/')
       .replace(/\bpangkat\b/g, '^').replace(/\bmodulo\b|\bmod\b/g, '%')
  s = s.replace(/\bhitung(?:kan)?\b|\bberapa(?:kah)?\b|\bhasil\b|\bdari\b/g, ' ')
  // x sebagai kali di antara angka
  s = s.replace(/(\d)\s*[x]\s*(\d|\(|pi|e\b)/g, '$1*$2')
  // pisahkan ribuan & desimal koma
  s = s.replace(/(\d)\.(?=\d{3}(\D|$))/g, '$1').replace(/(\d),(\d)/g, '$1.$2')
  // faktorial postfix n! → fact(n)
  s = s.replace(/(\d+(?:\.\d+)?)\s*!/g, 'fact($1)')
  return s
}

function tokenize(s) {
  const tokens = []
  let i = 0
  const prevType = () => tokens.length ? tokens[tokens.length - 1].t : null
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++
      tokens.push({ t: 'num', v: Number(s.slice(i, j)) }); i = j; continue
    }
    if (/[a-z]/.test(c)) {
      let j = i; while (j < s.length && /[a-z]/.test(s[j])) j++
      const name = s.slice(i, j); i = j
      if (FUNCS[name]) tokens.push({ t: 'fn', v: name })
      else if (name in CONSTS) tokens.push({ t: 'num', v: CONSTS[name] })
      else throw new Error(`tak kenal "${name}"`)
      continue
    }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue }
    if ('+-*/%^'.includes(c)) {
      const p = prevType()
      const unary = c === '-' && (p === null || p === 'op' || p === 'lp')
      tokens.push({ t: 'op', v: unary ? 'u-' : c }); i++; continue
    }
    throw new Error(`simbol "${c}" tak didukung`)
  }
  return tokens
}

function toRPN(tokens) {
  const out = [], ops = []
  for (const tk of tokens) {
    if (tk.t === 'num') out.push(tk)
    else if (tk.t === 'fn') ops.push(tk)
    else if (tk.t === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1]
        if (top.t === 'fn' || (top.t === 'op' && (PREC[top.v] > PREC[tk.v] || (PREC[top.v] === PREC[tk.v] && !RIGHT[tk.v])))) out.push(ops.pop())
        else break
      }
      ops.push(tk)
    } else if (tk.t === 'lp') ops.push(tk)
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop())
      if (!ops.length) throw new Error('kurung tidak seimbang')
      ops.pop()
      if (ops.length && ops[ops.length - 1].t === 'fn') out.push(ops.pop())
    }
  }
  while (ops.length) {
    const o = ops.pop()
    if (o.t === 'lp') throw new Error('kurung tidak seimbang')
    out.push(o)
  }
  return out
}

function evalRPN(rpn) {
  const st = []
  for (const tk of rpn) {
    if (tk.t === 'num') st.push(tk.v)
    else if (tk.t === 'fn') {
      const a = st.pop(); if (a === undefined) throw new Error('argumen kurang')
      st.push(FUNCS[tk.v](a))
    } else if (tk.t === 'op') {
      if (tk.v === 'u-') { const a = st.pop(); st.push(-a); continue }
      const b = st.pop(), a = st.pop()
      if (a === undefined || b === undefined) throw new Error('ekspresi tidak lengkap')
      if (tk.v === '/' && b === 0) throw new Error('bagi nol')
      if (tk.v === '%' && b === 0) throw new Error('modulo nol')
      st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b
        : tk.v === '/' ? a / b : tk.v === '%' ? a % b : Math.pow(a, b))
    }
  }
  if (st.length !== 1) throw new Error('ekspresi tidak valid')
  return st[0]
}

export function evalArith(input) {
  try {
    const s = normalizeExpr(input)
    if (!/[0-9]/.test(s) || !/[+\-*/%^(]/.test(s)) return { ok: false, reason: 'bukan ekspresi' }
    const v = evalRPN(toRPN(tokenize(s)))
    if (!isFinite(v)) return { ok: false, reason: Number.isNaN(v) ? 'hasil bukan angka' : 'hasil tak hingga' }
    return { ok: true, value: v }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'gagal' }
  }
}

// ─── Statistik ──────────────────────────────────────────────────────────────
const STAT_ALIAS = {
  'rata-rata': 'mean', 'rata rata': 'mean', mean: 'mean', average: 'mean',
  median: 'median', 'nilai tengah': 'median', modus: 'modus', mode: 'modus',
  jumlah: 'sum', total: 'sum', sum: 'sum', min: 'min', minimum: 'min',
  max: 'max', maksimum: 'max', maksimal: 'max', rentang: 'range', range: 'range',
  variansi: 'var', variance: 'var', 'simpangan baku': 'std', 'standar deviasi': 'std',
  stdev: 'std', 'standard deviation': 'std',
}
function computeStat(kind, nums) {
  const n = nums.length, sum = nums.reduce((a, b) => a + b, 0)
  const mean = sum / n
  if (kind === 'mean') return mean
  if (kind === 'sum') return sum
  if (kind === 'min') return Math.min(...nums)
  if (kind === 'max') return Math.max(...nums)
  if (kind === 'range') return Math.max(...nums) - Math.min(...nums)
  if (kind === 'median') {
    const s = [...nums].sort((a, b) => a - b)
    const m = Math.floor(n / 2)
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  if (kind === 'modus') {
    const f = new Map(); let best = nums[0], bc = 0
    for (const x of nums) { const c = (f.get(x) || 0) + 1; f.set(x, c); if (c > bc) { bc = c; best = x } }
    return best
  }
  const v = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return kind === 'var' ? v : Math.sqrt(v)
}
const STAT_LABEL = { mean: 'Rata-rata', median: 'Median', modus: 'Modus', sum: 'Jumlah', min: 'Minimum', max: 'Maksimum', range: 'Rentang', var: 'Variansi', std: 'Simpangan baku' }

// ─── Geometri (rumus bernama) ───────────────────────────────────────────────
// spec: nama param yang dibutuhkan + label sinonim + fungsi luas/keliling/volume
const SHAPES = {
  persegi:        { params: ['sisi'], luas: ({ sisi: s }) => s * s, keliling: ({ sisi: s }) => 4 * s },
  'persegi panjang': { params: ['panjang', 'lebar'], luas: ({ panjang: p, lebar: l }) => p * l, keliling: ({ panjang: p, lebar: l }) => 2 * (p + l) },
  segitiga:       { params: ['alas', 'tinggi'], luas: ({ alas: a, tinggi: t }) => 0.5 * a * t },
  lingkaran:      { params: ['jari'], luas: ({ jari: r }) => Math.PI * r * r, keliling: ({ jari: r }) => 2 * Math.PI * r },
  trapesium:      { params: ['a', 'b', 'tinggi'], luas: ({ a, b, tinggi: t }) => 0.5 * (a + b) * t },
  'jajar genjang': { params: ['alas', 'tinggi'], luas: ({ alas: a, tinggi: t }) => a * t },
  'belah ketupat': { params: ['d1', 'd2'], luas: ({ d1, d2 }) => 0.5 * d1 * d2 },
  kubus:          { params: ['sisi'], volume: ({ sisi: s }) => s ** 3, luas: ({ sisi: s }) => 6 * s * s },
  balok:          { params: ['panjang', 'lebar', 'tinggi'], volume: ({ panjang: p, lebar: l, tinggi: t }) => p * l * t },
  tabung:         { params: ['jari', 'tinggi'], volume: ({ jari: r, tinggi: t }) => Math.PI * r * r * t },
  bola:           { params: ['jari'], volume: ({ jari: r }) => (4 / 3) * Math.PI * r ** 3, luas: ({ jari: r }) => 4 * Math.PI * r * r },
  kerucut:        { params: ['jari', 'tinggi'], volume: ({ jari: r, tinggi: t }) => (1 / 3) * Math.PI * r * r * t },
}
const PARAM_LABEL = {
  sisi: /\bsisi\b/, panjang: /\bpanjang\b|\bp\b/, lebar: /\blebar\b|\bl\b/,
  alas: /\balas\b/, tinggi: /\btinggi\b|\bt\b/, jari: /jari[-\s]?jari|\bjari\b|\br\b|radius/,
  a: /\ba\b/, b: /\bb\b/, d1: /\bd1\b|diagonal\s*1/, d2: /\bd2\b|diagonal\s*2/,
}
function parseGeometry(text) {
  const low = text.toLowerCase()
  let shape = null
  for (const name of Object.keys(SHAPES)) if (low.includes(name)) { if (!shape || name.length > shape.length) shape = name }
  if (!shape) return null
  const spec = SHAPES[shape]
  let want = /\bkeliling\b/.test(low) ? 'keliling' : /\bvolume\b|\bisi\b/.test(low) ? 'volume' : 'luas'
  if (!spec[want]) want = spec.volume ? 'volume' : spec.luas ? 'luas' : 'keliling'
  if (!spec[want]) return { shape, want, error: `rumus ${shape} belum kupunya` }
  const params = {}
  // 1) label eksplisit "jari-jari 7" — alternation dibungkus (?:...) supaya
  //    grup tangkap angka berlaku ke semua sinonim, bukan cuma yang terakhir
  for (const p of spec.params) {
    const re = PARAM_LABEL[p]
    if (re) {
      const m = low.match(new RegExp('(?:' + re.source + ')\\s*=?\\s*(-?\\d[\\d.,]*)', 'i'))
      if (m && isFinite(parseNum(m[1]))) params[p] = parseNum(m[1])
    }
  }
  // 2) sisanya positional dari angka tersisa
  const need = spec.params.filter(p => params[p] === undefined)
  if (need.length) {
    const used = new Set(Object.values(params))
    const free = extractNums(low).filter(x => !used.has(x))
    need.forEach((p, idx) => { if (free[idx] !== undefined) params[p] = free[idx] })
  }
  const missing = spec.params.filter(p => params[p] === undefined)
  if (missing.length) return { shape, want, missing }
  return { shape, want, value: spec[want](params), params }
}

// ─── Konversi satuan ────────────────────────────────────────────────────────
const UNITS = {
  panjang: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inci: 0.0254, kaki: 0.3048 },
  massa: { mg: 1e-6, g: 0.001, gram: 0.001, kg: 1, kuintal: 100, ton: 1000 },
  besaran: { ribu: 1e3, juta: 1e6, miliar: 1e9, milyar: 1e9, triliun: 1e12 },
}
function findUnit(token) {
  for (const dim of Object.keys(UNITS)) if (token in UNITS[dim]) return { dim, factor: UNITS[dim][token] }
  return null
}

// ─── Terbilang Rupiah ───────────────────────────────────────────────────────
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
function terbilang3(n) {
  if (n < 12) return SATUAN[n]
  if (n < 20) return SATUAN[n - 10] + ' belas'
  if (n < 100) return SATUAN[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + SATUAN[n % 10] : '')
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + terbilang3(n % 100) : '')
  return SATUAN[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + terbilang3(n % 100) : '')
}
export function terbilang(n) {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'nol'
  const skala = ['', ' ribu', ' juta', ' miliar', ' triliun']
  let parts = [], i = 0
  while (n > 0 && i < skala.length) {
    const grp = n % 1000
    if (grp) {
      let kata = grp === 1 && i === 1 ? 'seribu' : terbilang3(grp) + skala[i]
      parts.unshift(kata)
    }
    n = Math.floor(n / 1000); i++
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// ─── Router utama ────────────────────────────────────────────────────────────
const CALC_HINT = /\b(hitung|berapa|kalkulator|rata-rata|rata rata|median|modus|terbilang|luas|keliling|volume|akar|pangkat)\b/i

export function tryCalc(text) {
  try {
    const low = text.toLowerCase().trim()
    if (low.length > 160) return null

    // 1) Terbilang
    if (/\bterbilang\b/.test(low)) {
      const nums = extractNums(low)
      if (!nums.length) return null
      const n = nums[0]
      return { ok: true, kind: 'terbilang', reply: `${fmtNum(n)} → terbilang: ${terbilang(n)} rupiah 😊` }
    }

    // 2) Konversi satuan: "5 km ke m", "2 juta dalam ribu"
    const conv = low.match(/(-?\d[\d.,]*)\s*([a-z]+)\s*(?:ke|jadi|dalam|to)\s*([a-z]+)/i)
    if (conv) {
      const val = parseNum(conv[1]), fu = findUnit(conv[2]), tu = findUnit(conv[3])
      if (fu && tu && fu.dim === tu.dim && isFinite(val)) {
        const res = val * fu.factor / tu.factor
        return { ok: true, kind: 'konversi', reply: `${fmtNum(val)} ${conv[2]} = ${fmtNum(res)} ${conv[3]}.` }
      }
    }

    // 3) Geometri
    const geo = parseGeometry(low)
    if (geo) {
      if (geo.error) return { ok: true, kind: 'geometri', reply: `Maaf, ${geo.error} 🙏` }
      if (geo.missing) return { ok: true, kind: 'geometri', reply: `Untuk ${geo.want} ${geo.shape}, aku butuh: ${geo.missing.join(', ')}. Coba sebutkan angkanya ya 😊` }
      const sat = geo.want === 'volume' ? ' satuan³' : geo.want === 'keliling' ? ' satuan' : ' satuan²'
      return { ok: true, kind: 'geometri', reply: `${geo.want.charAt(0).toUpperCase() + geo.want.slice(1)} ${geo.shape} = ${fmtNum(geo.value)}${sat}.` }
    }

    // 4) Statistik
    for (const alias of Object.keys(STAT_ALIAS)) {
      if (low.includes(alias)) {
        const nums = extractNums(low)
        if (nums.length >= 2) {
          const kind = STAT_ALIAS[alias]
          const v = computeStat(kind, nums)
          return { ok: true, kind: 'statistik', reply: `${STAT_LABEL[kind]} dari ${nums.length} angka = ${fmtNum(v)}.` }
        }
      }
    }

    // 5) Aritmatika & ilmiah — perlu operator/fungsi atau kata pemicu
    const hasOp = /[\d)]\s*[+\-*/^%×÷]\s*[\d(]/.test(text) || /[×÷]/.test(text) || /\d\s*x\s*\d/i.test(text)
    const hasFn = /\b(sqrt|akar|sin|cos|tan|log|ln|exp|abs|fact)\s*\(/i.test(low) || /\d+\s*!/.test(low)
    const worded = /\b(kali|dibagi|ditambah|dikurangi|pangkat)\b/.test(low)
    // seluruh teks hanya karakter matematika + ada angka + ada operator → anggap hitungan
    const pureMath = /^[\s\d+\-*/^%×÷x:().,=?!]+$/i.test(text.trim()) && /\d/.test(text) && /[+\-*/^%]/.test(text)
    if (hasOp || hasFn || worded || pureMath || (CALC_HINT.test(low) && /[\d]/.test(low) && /[+\-*/^%]/.test(low))) {
      const r = evalArith(text)
      if (r.ok) return { ok: true, kind: 'aritmatika', reply: `Hasilnya ${fmtNum(r.value)} 😊` }
      if (r.reason === 'bagi nol' || r.reason === 'modulo nol') return { ok: true, kind: 'aritmatika', reply: 'Tidak bisa dibagi nol ya 🙏 Coba angka lain.' }
      // jelas-jelas ekspresi matematika tapi gagal → JANGAN lempar ke classifier
      // (biar tidak menjawab ngawur); minta perbaiki penulisannya
      if (/^[\s\d+\-*/^%×÷x:().,=?!]+$/i.test(text.trim()))
        return { ok: true, kind: 'aritmatika', reply: 'Hmm, penulisan hitungannya sepertinya kurang pas 🙏 Coba tulis ulang ya, misalnya 1000*900/40.' }
    }
    return null
  } catch {
    return null
  }
}
