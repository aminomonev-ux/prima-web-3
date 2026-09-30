// scripts/test-retensi-audit.mts — regresi retensi audit_log per jenis peristiwa (audit I1)
//
//   npx tsx scripts/test-retensi-audit.mts
//
// Dulu cron menghapus SEMUA baris audit_log yang lebih tua dari 12 bulan — jejak "siapa
// mengubah DPA" sudah hilang saat BPK/Inspektorat memeriksa tahun anggaran itu. Keputusan
// pemilik aplikasi (30 Sep, pilihan B): perubahan data & akses 5 tahun (IP/peramban
// dikosongkan sesudah 12 bulan), masuk/keluar/lihat/unduh/RIMA tetap 12 bulan.
//
// Bagian DB menulis baris ber-username `uji.retensi` lalu menjalankan pemangkas ASLI.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { RETENSI_PERISTIWA, PERISTIWA_PENDEK, RETENSI_AUDIT } from '../lib/security/retensi-audit'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const kelas = (j: string) => (RETENSI_PERISTIWA as Record<string, string>)[j]

// ── A. Penggolongan ──────────────────────────────────────────────────────────
const SUMBER_AUDIT = baca('lib/security/auditlog.ts')
const blok = SUMBER_AUDIT.slice(SUMBER_AUDIT.indexOf('export type AuditEventType'), SUMBER_AUDIT.indexOf("'PROMOTION_RECOVERY_DENIED';") + 30)
const semuaJenis = [...blok.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').matchAll(/'([A-Z0-9_]+)'/g)].map(m => m[1])
sama('A1 tiap jenis peristiwa punya golongan', semuaJenis.filter(j => !kelas(j)).join(','), '')
sama('A2 tak ada golongan untuk jenis yang tidak ada', Object.keys(RETENSI_PERISTIWA).filter(j => !semuaJenis.includes(j)).join(','), '')
for (const j of ['BLUD_SAVE_DPA', 'BLUD_REALISASI_TX_UPDATE', 'BLUD_PERIODE_BUKA', 'KINERJA_SAVE_REALISASI', 'PUTUSAN_KABAG',
  'PK_DOKUMEN_FINALIZE', 'LKJIP_FINALIZE', 'IKI_FINALIZE', 'RA_UPDATE_TARGETS', 'BBA_REALISASI', 'CONFIG_UPDATE']) {
  sama(`A3 ${j} disimpan lama`, kelas(j), 'PANJANG')
}
for (const j of ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'FILE_DOWNLOAD', 'BLUD_EXPORT_XLSX', 'BLUD_VIEW_DPA',
  'USULAN_EXPORT', 'PK_DOKUMEN_DOWNLOAD', 'RIMA_QUERY', 'CRON_PURGE_RETENTION']) {
  sama(`A4 ${j} tetap 12 bulan`, kelas(j), 'PENDEK')
}
// Garis waktu per orang di Pusat Akses hanya memuat peristiwa ber-`targetUserId` — semuanya
// perubahan akun & akses. Kalau salah satu jadi PENDEK, layar yang menyebut "5 tahun" berbohong.
for (const j of ['ACCESS_GRANT', 'ACCESS_REVOKE', 'ROLE_CHANGE', 'ACCESS_REQUEST', 'ACCESS_REQUEST_APPROVED',
  'ACCESS_REQUEST_REJECTED', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_ARCHIVE']) {
  sama(`A5 ${j} (garis waktu akses) disimpan lama`, kelas(j), 'PANJANG')
}
cek('A6 daftar PENDEK tidak memuat jenis PANJANG', PERISTIWA_PENDEK.every(j => kelas(j) === 'PENDEK'))
sama('A7 angka retensi', `${RETENSI_AUDIT.pendekBulan} bulan / ${RETENSI_AUDIT.panjangTahun} tahun`, '12 bulan / 5 tahun')

// ── B. Sumber ────────────────────────────────────────────────────────────────
const CRON = kode('app/api/cron/purge-retention/route.ts')
cek('B1 cron memakai pemangkas per jenis', CRON.includes('const audit = await pangkasAuditLog(tx);'))
cek('B2 hapus-semua-12-bulan yang lama sudah tidak ada', !/DELETE FROM audit_log WHERE created_at/.test(CRON))
cek('B3 garis waktu Pusat Akses mengikuti retensi akses',
  kode('lib/admin/pusat-akses.ts').includes('export const BULAN_GARIS_WAKTU = RETENSI_AUDIT.panjangTahun * 12'))
cek('B4 layar menyebut umurnya dalam tahun kalau bulat',
  kode('app/(dashboard)/admin/_panels/TabPusatAkses.tsx').includes("{garisBulan % 12 === 0 ? `${garisBulan / 12} tahun` : `${garisBulan} bulan`}"))

// ── C. Basis data sungguhan ─────────────────────────────────────────────────
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    timezone: '+07:00',
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}

if (c) {
  const k = c
  const { withTransaction } = await import('../lib/data/db')
  const { pangkasAuditLog } = await import('../lib/security/retensi-audit')
  const U = 'uji.retensi'
  const bersih = () => k.query('DELETE FROM audit_log WHERE username = ?', [U])
  await bersih()
  try {
    const tulis = async (jenis: string, umur: string, detail: string) => {
      await k.query(`INSERT INTO audit_log (username, event_type, ip_address, user_agent, detail, created_at)
        VALUES (?, ?, '10.0.0.9', 'PerambanUji/1.0', ?, NOW() - INTERVAL ${umur})`, [U, jenis, detail])
    }
    await tulis('LOGIN_SUCCESS', '2 YEAR', 'masuk-lama')
    await tulis('LOGIN_SUCCESS', '6 MONTH', 'masuk-baru')
    await tulis('BLUD_SAVE_DPA', '2 YEAR', 'dpa-2-tahun')
    await tulis('BLUD_SAVE_DPA', '6 YEAR', 'dpa-6-tahun')
    await tulis('BLUD_SAVE_DPA', '6 MONTH', 'dpa-baru')
    await tulis('JENIS_LAMA_UJI', '2 YEAR', 'jenis-tak-dikenal')

    await withTransaction(async ({ tx }) => { await pangkasAuditLog(tx) })

    const [rows] = await k.query('SELECT detail, ip_address, user_agent FROM audit_log WHERE username = ?', [U]) as [Array<{ detail: string; ip_address: string | null; user_agent: string | null }>, unknown]
    const ada = (d: string) => rows.find(r => r.detail === d)
    sama('C1 login > 12 bulan dihapus', !!ada('masuk-lama'), false)
    sama('C2 login < 12 bulan tetap', !!ada('masuk-baru'), true)
    sama('C3 simpan DPA 2 tahun lalu TETAP ADA (dulu terhapus)', !!ada('dpa-2-tahun'), true)
    sama('C4 ... tapi IP-nya dikosongkan', ada('dpa-2-tahun')?.ip_address ?? null, null)
    sama('C5 ... dan jenis perambannya dikosongkan', ada('dpa-2-tahun')?.user_agent ?? null, null)
    sama('C6 simpan DPA > 5 tahun dihapus', !!ada('dpa-6-tahun'), false)
    sama('C7 simpan DPA < 12 bulan: IP utuh', ada('dpa-baru')?.ip_address ?? null, '10.0.0.9')
    sama('C8 jenis tak dikenal tidak dihapus di 12 bulan (salah simpan > salah hapus)', !!ada('jenis-tak-dikenal'), true)
  } finally {
    await bersih()
  }
  const [sisa] = await k.query('SELECT COUNT(*) AS n FROM audit_log WHERE username = ?', [U]) as [Array<{ n: number }>, unknown]
  sama('C9 data uji dibersihkan', Number(sisa[0].n), 0)
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
