import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '..', 'docs', 'schema-mysql.sql'), 'utf8')
const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*ENGINE/gi
let m
const names = []
while ((m = re.exec(sql)) !== null) names.push(m[1].toLowerCase())
const uniq = [...new Set(names)].sort()
const rows = uniq.map((n) => `  SELECT '${n}' AS tabel`).join('\n  UNION ALL\n')
const out = [
  `-- Cek semua tabel penting PRIMA di prima_db_3 (referensi: schema-mysql.sql, ${uniq.length} tabel)`,
  `-- status: ADA = tabel ada di DB | >> HILANG << = migrasi CREATE belum dijalankan.`,
  `SELECT e.tabel,`,
  `       CASE WHEN t.TABLE_NAME IS NULL THEN '>> HILANG <<' ELSE 'ADA' END AS status`,
  `FROM (`,
  rows,
  `) e`,
  `LEFT JOIN information_schema.TABLES t`,
  `  ON t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = e.tabel`,
  `ORDER BY status DESC, e.tabel;`,
  ``,
].join('\n')
writeFileSync(join(__dirname, 'check-all-tables.sql'), out)
console.log(out)
console.log('Total tabel:', uniq.length)
