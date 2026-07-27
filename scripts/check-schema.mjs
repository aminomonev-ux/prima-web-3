// Bandingkan skema aktual DB (Laragon MySQL) dengan referensi docs/schema-mysql.sql.
// Tujuan: deteksi migrasi yang lupa dijalankan (tabel/kolom hilang di DB).
// Jalankan: node scripts/check-schema.mjs
// Read-only: TIDAK mengubah database sama sekali.
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

dotenv.config({ path: ['.env.local', '.env'] })

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '..', 'docs', 'schema-mysql.sql')

// ── 1. Parse schema-mysql.sql → { table: Set<column> } ──
function parseSchema(sql) {
  const tables = {}
  // Buang komentar baris (-- ...) agar tidak mengganggu deteksi kolom
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*ENGINE/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toLowerCase()
    const body = m[2]
    const cols = new Set()
    for (let raw of body.split('\n')) {
      let line = raw.replace(/--.*$/, '').trim()
      if (!line) continue
      // Lewati definisi constraint/key/index, bukan kolom
      if (/^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|CHECK|FULLTEXT|SPATIAL)\b/i.test(line)) continue
      const cm = line.match(/^`?(\w+)`?\s/)
      if (cm) cols.add(cm[1].toLowerCase())
    }
    if (cols.size) tables[name] = cols
  }
  return tables
}

// ── 2. Ambil skema aktual dari information_schema ──
async function actualSchema(conn) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  )
  const tables = {}
  for (const r of rows) {
    const t = String(r.t).toLowerCase()
    ;(tables[t] ??= new Set()).add(String(r.c).toLowerCase())
  }
  return tables
}

const expected = parseSchema(readFileSync(schemaPath, 'utf8'))

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MYSQL_PORT ?? '3306'),
  user: process.env.MYSQL_USER ?? '',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? '',
})

const [[{ db }]] = await conn.query('SELECT DATABASE() AS db')
const actual = await actualSchema(conn)
await conn.end()

// ── 3. Bandingkan ──
const missingTables = []
const missingCols = []
const extraTables = []

for (const [t, cols] of Object.entries(expected)) {
  if (!actual[t]) {
    missingTables.push(t)
    continue
  }
  const miss = [...cols].filter((c) => !actual[t].has(c))
  if (miss.length) missingCols.push([t, miss])
}
for (const t of Object.keys(actual)) {
  if (!expected[t]) extraTables.push(t)
}

// ── 4. Laporan ──
const line = '─'.repeat(64)
console.log(line)
console.log(`  CEK SKEMA — DB: ${db}`)
console.log(`  Referensi   : docs/schema-mysql.sql`)
console.log(`  Tabel di schema: ${Object.keys(expected).length}  |  Tabel di DB: ${Object.keys(actual).length}`)
console.log(line)

if (!missingTables.length && !missingCols.length) {
  console.log('\n✅ SINKRON — semua tabel & kolom di schema-mysql.sql ada di DB.')
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
  console.log('\n→ Cek folder docs/migrations/ untuk file yang membuat tabel/kolom di atas, lalu jalankan.\n')
}

if (extraTables.length) {
  console.log(`ℹ️  Tabel di DB tapi tidak di schema (${extraTables.length}) — biasanya aman (dibuat manual / belum didokumentasikan):`)
  console.log(`   ${extraTables.join(', ')}\n`)
}
