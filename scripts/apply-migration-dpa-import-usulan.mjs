// One-off: apply migration-dpa-import-usulan.sql ke MySQL lokal (idempotent check).
// Jalankan: node scripts/apply-migration-dpa-import-usulan.mjs
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

// Next.js simpan kredensial di .env.local — dotenv default hanya baca .env
dotenv.config({ path: ['.env.local', '.env'] })

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MYSQL_PORT ?? '3306'),
  user: process.env.MYSQL_USER ?? '',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? '',
})

const [cols] = await conn.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dpa_blud' AND COLUMN_NAME = 'usulan_item_id'`,
)
if (cols.length > 0) {
  console.log('SKIP: kolom usulan_item_id sudah ada')
} else {
  await conn.query(`ALTER TABLE dpa_blud
    ADD COLUMN origin ENUM('MANUAL','USULAN') NOT NULL DEFAULT 'MANUAL' COMMENT 'Asal baris: input manual atau import usulan',
    ADD COLUMN usulan_item_id INT NULL COMMENT 'FK soft ke usulan_items.id (jejak import)',
    ADD COLUMN usulan_no VARCHAR(64) NULL COMMENT 'No usulan asal (display/trace)'`)
  await conn.query(`ALTER TABLE dpa_blud ADD INDEX idx_dpa_usulan_item (usulan_item_id)`)
  console.log('OK: 3 kolom + index ditambahkan')
}
await conn.end()
