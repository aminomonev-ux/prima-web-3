// Bandingkan skema aktual DB (Laragon MySQL) dengan referensi docs/schema-mysql.sql.
// Tujuan: deteksi migrasi yang lupa dijalankan (tabel/kolom/indeks bernama hilang di DB,
// atau kolom yang TIPENYA tertinggal).
// Jalankan: node scripts/check-schema.mjs
// Read-only: TIDAK mengubah database sama sekali.
import mysql from 'mysql2/promise'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// Tanpa dotenv: paket itu tidak ada di package.json, jadi di server yang dipasang
// lewat `npm ci` skrip ini dulu mati "Cannot find package 'dotenv'" (2026-09-15).
// Urutan menang: environment proses > .env.local > .env (sama dgn dotenv lama).
function muatEnv() {
  for (const berkas of ['.env.local', '.env']) {
    const p = join(process.cwd(), berkas)
    if (!existsSync(p)) continue
    for (const baris of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = baris.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const kunci = t.slice(0, i).trim()
      if (process.env[kunci] !== undefined) continue
      process.env[kunci] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '..', 'docs', 'schema-mysql.sql')

const buangKomentar = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

/**
 * Tipe kolom ke bentuk yang dipakai `information_schema.COLUMNS.COLUMN_TYPE` MySQL 8.
 * U4 (audit 2026-09-29): dulu hanya NAMA yang dibandingkan — bug "765.00" (d643d50)
 * tersembunyi justru karena DB pengembang tertinggal migrasi INT → DECIMAL sementara
 * pemeriksa ini berbunyi SINKRON.
 */
export function normTipe(raw) {
  let t = String(raw).trim().replace(/\s+/g, ' ').toLowerCase()
  const e = /^(enum|set)\s*\((.*)\)$/.exec(t)
  if (e) {
    const nilai = [...e[2].matchAll(/'((?:[^']|'')*)'/g)].map((m) => `'${m[1]}'`)
    return `${e[1]}(${nilai.join(',')})`
  }
  t = t.replace(/\s*\(\s*/g, '(').replace(/\s*,\s*/g, ',').replace(/\s*\)/g, ')')
  t = t.replace(/^(boolean|bool)$/, 'tinyint(1)')
  t = t.replace(/^integer\b/, 'int').replace(/^numeric\b/, 'decimal')
  // MySQL 8.0.19+ tidak lagi menulis lebar tampilan bilangan bulat — kecuali tinyint(1).
  t = t.replace(/^(tinyint|smallint|mediumint|int|bigint)\((\d+)\)/, (m, jenis, n) => (jenis === 'tinyint' && n === '1' ? m : jenis))
  if (t === 'decimal') t = 'decimal(10,0)'
  return t.replace(/ zerofill$/, '')
}

/** Tipe dari satu definisi kolom DDL (`nama TIPE(…) [UNSIGNED] …`), atau null. */
export function tipeDariDefinisi(baris) {
  const m = /^`?\w+`?\s+(\w+(?:\s*\((?:[^()']|'(?:[^']|'')*')*\))?(?:\s+unsigned)?(?:\s+zerofill)?)/i.exec(baris.trim())
  return m ? m[1] : null
}

/**
 * Isi CREATE TABLE dipecah per definisi: koma di kedalaman kurung 0 dan di luar tanda
 * kutip. Per baris tidak cukup untuk tipe — ENUM panjang ditulis lintas baris
 * (`sumber ENUM('GAJI', …,\n 'OBAT', …)`), dan baris pertamanya saja cuma berbunyi "enum".
 */
export function definisiLogis(body) {
  const teks = body.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ')
  const out = []
  let kini = ''
  let dalam = 0
  let kutip = false
  for (const ch of teks) {
    if (ch === "'") kutip = !kutip
    if (!kutip) {
      if (ch === '(') dalam++
      else if (ch === ')') dalam--
      else if (ch === ',' && dalam === 0) { out.push(kini.trim().replace(/\s+/g, ' ')); kini = ''; continue }
    }
    kini += ch
  }
  if (kini.trim()) out.push(kini.trim().replace(/\s+/g, ' '))
  return out
}

// ── 1. Parse schema-mysql.sql → { tables: { table: Set<column> }, tipe: Map<"t.c", tipe> } ──
export function parseSchema(sql) {
  const tables = {}
  const tipe = new Map()
  // Buang komentar baris (-- ...) agar tidak mengganggu deteksi kolom
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*ENGINE/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toLowerCase()
    const body = m[2]
    const cols = new Set()
    // Definisi baru hanya dimulai sesudah koma. Tanpa ini baris sambungan
    // (`NOT NULL DEFAULT …`, `REFERENCES users(id)`, `COMMENT='…'` penutup tabel)
    // terbaca sebagai kolom bernama not/references/comment lalu dilaporkan HILANG.
    let awalDefinisi = true
    for (let raw of body.split('\n')) {
      let line = raw.replace(/--.*$/, '').trim()
      if (!line) continue
      const bolehKolom = awalDefinisi
      awalDefinisi = line.endsWith(',')
      if (!bolehKolom) continue
      // Lewati definisi constraint/key/index, bukan kolom
      if (/^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|CHECK|FULLTEXT|SPATIAL)\b/i.test(line)) continue
      const cm = line.match(/^`?(\w+)`?\s/)
      if (cm) cols.add(cm[1].toLowerCase())
    }
    for (const d of definisiLogis(body)) {
      if (/^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|CHECK|FULLTEXT|SPATIAL)\b/i.test(d)) continue
      const cm = d.match(/^`?(\w+)`?\s/)
      const t = tipeDariDefinisi(d)
      if (cm && t && cols.has(cm[1].toLowerCase())) tipe.set(`${name}.${cm[1].toLowerCase()}`, normTipe(t))
    }
    if (cols.size) tables[name] = cols
  }
  return { tables, tipe }
}

/**
 * Kolom yang ada di kedua sisi tapi tipenya berbeda. `aktualTipe`: "t.c" → { asli, norm }.
 * Kolom/tabel yang hilang tidak dilaporkan di sini — itu tugas pemeriksaan nama.
 */
export function bedaTipeKolom(expected, expectedTipe, aktualTipe) {
  const out = []
  for (const [t, cols] of Object.entries(expected)) {
    for (const c of cols) {
      const acuan = expectedTipe.get(`${t}.${c}`)
      const ada = aktualTipe.get(`${t}.${c}`)
      if (acuan && ada && acuan !== ada.norm) out.push(`${t}.${c}: DB ${ada.asli} · acuan ${acuan}`)
    }
  }
  return out
}

// Indeks BERNAMA saja: `CREATE [UNIQUE] INDEX x ON t` di luar tabel, dan
// `[UNIQUE] KEY|INDEX x (...)` di dalam CREATE TABLE. Kolom `... UNIQUE` sebaris
// & FOREIGN KEY tanpa nama sengaja dilewati — namanya dikarang MySQL, tak bisa dicocokkan.
// Pemeriksaan kolom buta pada indeks yang hilang (A6: uq_ks_canonical_versi).
export function parseIndexes(sql) {
  const bersih = buangKomentar(sql)
  const out = new Map() // "tabel.indeks" → { table, index, unique }
  const tambah = (table, index, unique) => {
    const t = table.toLowerCase()
    const i = index.toLowerCase()
    out.set(`${t}.${i}`, { table: t, index: i, unique })
  }

  const reCreate = /CREATE\s+(UNIQUE\s+)?INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?/gi
  let m
  while ((m = reCreate.exec(bersih)) !== null) tambah(m[3], m[2], Boolean(m[1]))

  const reTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*ENGINE/gi
  while ((m = reTable.exec(bersih)) !== null) {
    for (const raw of m[2].split('\n')) {
      const km = raw.trim().match(/^(UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)`?\s*\(/i)
      if (km) tambah(m[1], km[2], Boolean(km[1]))
    }
  }
  return out
}

// ── 2. Ambil skema aktual dari information_schema ──
async function actualSchema(conn) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  )
  const tables = {}
  const tipe = new Map()
  for (const r of rows) {
    const t = String(r.t).toLowerCase()
    const c = String(r.c).toLowerCase()
    ;(tables[t] ??= new Set()).add(c)
    tipe.set(`${t}.${c}`, { asli: String(r.ty), norm: normTipe(r.ty) })
  }
  return { tables, tipe }
}

async function actualIndexes(conn) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, MIN(NON_UNIQUE) AS nu
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME`,
  )
  const out = new Map()
  for (const r of rows) {
    const t = String(r.t).toLowerCase()
    const i = String(r.i).toLowerCase()
    out.set(`${t}.${i}`, { unique: Number(r.nu) === 0 })
  }
  return out
}

async function main() {
  muatEnv()
  const schemaSql = readFileSync(schemaPath, 'utf8')
  const { tables: expected, tipe: expectedTipe } = parseSchema(schemaSql)
  const expectedIdx = parseIndexes(schemaSql)

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: parseInt(process.env.MYSQL_PORT ?? '3306'),
    user: process.env.MYSQL_USER ?? '',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? '',
  })

  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db')
  const { tables: actual, tipe: actualTipe } = await actualSchema(conn)
  const actualIdx = await actualIndexes(conn)
  await conn.end()

  // ── 3. Bandingkan ──
  const missingTables = []
  const missingCols = []
  const extraTables = []
  const extraCols = []
  const missingIdx = []
  const notUniqueIdx = []
  const bedaTipe = bedaTipeKolom(expected, expectedTipe, actualTipe)

  for (const [t, cols] of Object.entries(expected)) {
    if (!actual[t]) {
      missingTables.push(t)
      continue
    }
    const miss = [...cols].filter((c) => !actual[t].has(c))
    if (miss.length) missingCols.push([t, miss])
    const extra = [...actual[t]].filter((c) => !cols.has(c))
    if (extra.length) extraCols.push([t, extra])
  }
  for (const t of Object.keys(actual)) {
    if (!expected[t]) extraTables.push(t)
  }
  for (const [key, { table, index, unique }] of expectedIdx) {
    // Tabelnya sendiri tidak ada → sudah dilaporkan sebagai TABEL HILANG.
    if (!actual[table]) continue
    const ada = actualIdx.get(key)
    if (!ada) missingIdx.push(`${table}.${index}${unique ? ' (UNIQUE)' : ''}`)
    else if (unique && !ada.unique) notUniqueIdx.push(`${table}.${index}`)
  }

  // ── 4. Laporan ──
  const line = '─'.repeat(64)
  console.log(line)
  console.log(`  CEK SKEMA — DB: ${db}`)
  console.log(`  Referensi   : docs/schema-mysql.sql`)
  console.log(`  Tabel di schema: ${Object.keys(expected).length}  |  Tabel di DB: ${Object.keys(actual).length}`)
  console.log(`  Indeks bernama di schema: ${expectedIdx.size}  |  Kolom bertipe diperiksa: ${expectedTipe.size}`)
  console.log(line)

  if (!missingTables.length && !missingCols.length && !missingIdx.length && !notUniqueIdx.length && !bedaTipe.length) {
    console.log('\n✅ SINKRON — semua tabel, kolom (beserta tipenya) & indeks bernama di schema-mysql.sql ada di DB.')
    console.log('   Tidak terdeteksi migrasi yang terlewat.\n')
  } else {
    if (missingTables.length) {
      console.log(`\n❌ TABEL HILANG (${missingTables.length}) — kemungkinan migrasi CREATE belum dijalankan:`)
      for (const t of missingTables) console.log(`   • ${t}`)
    }
    if (missingCols.length) {
      console.log(`\n⚠️  KOLOM HILANG (${missingCols.length} tabel) — kemungkinan migrasi ALTER belum dijalankan:`)
      for (const [t, cols] of missingCols) console.log(`   • ${t}: ${cols.join(', ')}`)
    }
    if (bedaTipe.length) {
      console.log(`\n⚠️  TIPE KOLOM BERBEDA (${bedaTipe.length}) — migrasi MODIFY belum dijalankan, atau skema acuan belum diperbarui:`)
      for (const b of bedaTipe) console.log(`   • ${b}`)
    }
    if (missingIdx.length) {
      console.log(`\n⚠️  INDEKS HILANG (${missingIdx.length}) — migrasi CREATE INDEX/ALTER belum dijalankan, atau namanya beda di DB:`)
      for (const i of missingIdx) console.log(`   • ${i}`)
    }
    if (notUniqueIdx.length) {
      console.log(`\n⚠️  INDEKS ADA TAPI BUKAN UNIQUE (${notUniqueIdx.length}) — penjaga duplikatnya tidak berlaku:`)
      for (const i of notUniqueIdx) console.log(`   • ${i}`)
    }
    console.log('\n→ Cek folder docs/migrations/ untuk file yang membuat tabel/kolom/indeks di atas, lalu jalankan.\n')
  }

  if (extraTables.length) {
    console.log(`ℹ️  Tabel di DB tapi tidak di schema (${extraTables.length}) — biasanya aman (dibuat manual / belum didokumentasikan):`)
    console.log(`   ${extraTables.join(', ')}\n`)
  }
  if (extraCols.length) {
    console.log(`ℹ️  Kolom di DB tapi tidak di schema (${extraCols.length} tabel) — migrasi DROP belum dijalankan, atau kolomnya belum didokumentasikan:`)
    for (const [t, cols] of extraCols) console.log(`   • ${t}: ${cols.join(', ')}`)
    console.log('')
  }
}

// Fungsi di atas diekspor untuk uji (scripts/test-check-schema.mts); pemeriksaan hanya
// berjalan kalau berkas ini dijalankan langsung.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
