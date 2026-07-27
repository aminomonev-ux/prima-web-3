// Cek khusus: apakah modul IKI (migration-iki.sql) sudah ada di DB.
// Jalankan: node scripts/check-iki.mjs   (read-only, tidak mengubah DB)
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
dotenv.config({ path: ['.env.local', '.env'] })

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MYSQL_PORT ?? '3306'),
  user: process.env.MYSQL_USER ?? '',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? '',
})

const [[{ db }]] = await conn.query('SELECT DATABASE() AS db')
const want = ['iki_dokumen', 'iki_rhk', 'iki_rhk_triwulan']

const [rows] = await conn.query(
  `SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?)`,
  want,
)
const have = new Set(rows.map((r) => String(r.t)))

console.log(`DB: ${db}\n`)
let missing = 0
for (const t of want) {
  const ok = have.has(t)
  if (!ok) missing++
  console.log(`  ${ok ? '✅' : '❌'} ${t}`)
}

// Cek flag app_status_iki (app_config / system_settings — coba dua-duanya)
try {
  const [f] = await conn.query(
    `SELECT * FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('app_config','system_settings')`,
  )
  // tampilkan sekadar info tabel config yang ada
} catch {}

console.log(
  missing === 0
    ? '\n✅ Modul IKI SUDAH ada di database (3/3 tabel).'
    : `\n❌ Modul IKI BELUM lengkap — ${missing} tabel hilang. Jalankan migration-iki.sql.`,
)
await conn.end()
