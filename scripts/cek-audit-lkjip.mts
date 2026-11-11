// scripts/cek-audit-lkjip.mts — BACA-SAJA: tampilkan baris audit_log untuk modul LKJIP.
// Dipakai untuk memverifikasi bahwa tindakan di layar/endpoint benar-benar berjejak.
//   npx tsx scripts/cek-audit-lkjip.mts
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim(); const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { console.log('tanpa .env.local'); process.exit(1) }

const k = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  timezone: '+07:00',
})

const [rows] = await k.query(`SELECT id, user_id, username, event_type, ip_address, user_agent, detail, created_at
  FROM audit_log WHERE event_type LIKE 'LKJIP%' ORDER BY id DESC LIMIT 40`) as [Array<Record<string, unknown>>, unknown]

for (const r of rows) {
  const w = new Date(r.created_at as string).toLocaleString('id-ID')
  console.log(`#${r.id} ${w} | ${r.username} (uid ${r.user_id}) | ${r.event_type}`)
  console.log(`    detail: ${r.detail ?? '—'}`)
  console.log(`    ip: ${r.ip_address ?? '—'} | ua: ${String(r.user_agent ?? '—').slice(0, 90)}`)
}

const [n] = await k.query(`SELECT COUNT(*) AS n FROM audit_log`) as [Array<{ n: number }>, unknown]
const [tabel] = await k.query(`SELECT COUNT(*) AS n FROM lkjip_dokumen`) as [Array<{ n: number }>, unknown]
console.log(`\ntotal audit_log=${n[0].n} · lkjip_dokumen tersisa=${tabel[0].n}`)
await k.end()
