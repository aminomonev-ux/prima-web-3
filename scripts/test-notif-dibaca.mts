// scripts/test-notif-dibaca.mts — regresi status baca notifikasi per orang (audit B7)
//
//   npx tsx scripts/test-notif-dibaca.mts
//
// Dulu satu kolom `notifications.dibaca` per notifikasi. Notifikasi antrean (`__KASUBAG__`,
// `__ADMIN__`, …) dibaca banyak orang, dan penerima SUPER_ADMIN mencakup antrean Kasubag &
// Kabag — jadi "Tandai semua dibaca" milik Super Admin memadamkan peringatan di akun
// mereka. Uji ini menjalankan fungsi ASLI (`bacaNotifikasi`, `tandaiSemuaDibaca`,
// `tandaiDibaca`) terhadap MySQL sungguhan, karena yang diuji justru kuerinya.
//
// AMAN: hanya menyentuh akun ber-username `uji.notif.*` dan notifikasi ber-type
// `UJI_NOTIF_B7`, bertanggal 2099 supaya tidak bercampur dengan data asli. Dibersihkan
// di awal DAN di akhir. Bagian DB dilewati kalau MySQL tidak menyala.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }
// Diimpor SESUDAH env dimuat — pool `db.ts` dibuat saat modulnya dievaluasi.
const { bacaNotifikasi, tandaiSemuaDibaca, tandaiDibaca } = await import('../lib/services/notifications')

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}
const REPO = new URL('..', import.meta.url)
const baca = (p: string) => readFileSync(new URL(p, REPO), 'utf8')
/** Komentar dibuang dulu — prosa yang menjelaskan bug lama tidak boleh ikut dicocokkan. */
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\s+\/\/ .*$/gm, '')
const kode = (p: string) => tanpaKomentar(baca(p))

// ── A. Sumber (tanpa DB) ─────────────────────────────────────────────────────
function berkasKode(dir: string, keluar: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) berkasKode(p, keluar)
    else if (/\.(ts|tsx)$/.test(n)) keluar.push(p)
  }
  return keluar
}
// Hanya berkas yang MENJALANKAN SQL ke tabel notifications: layar Usulan membaca field
// `dibaca` dari jawaban API (masih ada, kini dihitung per orang) — itu bukan kolomnya.
const SQL_NOTIF = /\b(FROM|INTO|UPDATE|JOIN)\s+notifications\b/
const POLA_KOLOM_LAMA = /\bn\.dibaca\b|SET\s+dibaca\b|\bdibaca\s*=\s*(0|1|TRUE|FALSE)\b/i
const berkasSqlNotif = ['app', 'lib', 'components']
  .flatMap((d) => berkasKode(fileURLToPath(new URL(d, REPO))))
  .map((p) => ({ p, isi: tanpaKomentar(readFileSync(p, 'utf8')) }))
  .filter((b) => SQL_NOTIF.test(b.isi))
cek(`A0 pemindai menemukan penulis SQL notifikasi (${berkasSqlNotif.length} berkas)`, berkasSqlNotif.length >= 3)
sama('A1 tak ada SQL yang masih membaca/menulis kolom notifications.dibaca',
  berkasSqlNotif.filter((b) => POLA_KOLOM_LAMA.test(b.isi)).map((b) => b.p).join(', '), '')

const RUTE_PURGE = kode('app/api/cron/purge-retention/route.ts')
cek('A2 purge-retention: satu aturan umur 12 bulan',
  RUTE_PURGE.includes('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 12 MONTH'))
cek('A3 purge-retention tidak lagi menyaring kolom dibaca', !/dibaca/i.test(RUTE_PURGE))

const RUTE_BEL = kode('app/api/notifications/route.ts')
const RUTE_SATU = kode('app/api/notifications/[id]/route.ts')
cek('A4 GET bel memakai bacaNotifikasi dengan identitas SESI',
  RUTE_BEL.includes('bacaNotifikasi(session.userId, session.role, session.username)'))
cek('A5 PATCH semua memakai tandaiSemuaDibaca dengan identitas SESI',
  RUTE_BEL.includes('tandaiSemuaDibaca(session.userId, session.role, session.username)'))
cek('A6 PATCH satu memakai tandaiDibaca dengan identitas SESI',
  RUTE_SATU.includes('tandaiDibaca(notifId, session.userId, session.role, session.username)'))

const SKEMA = baca('docs/schema-mysql.sql')
const blokNotif = SKEMA.match(/CREATE TABLE IF NOT EXISTS notifications \(([\s\S]*?)\) ENGINE/)?.[1] ?? ''
const blokDibaca = SKEMA.match(/CREATE TABLE IF NOT EXISTS notifikasi_dibaca \(([\s\S]*?)\) ENGINE/)?.[1] ?? ''
cek('A7 skema acuan: notifications tanpa kolom dibaca', blokNotif !== '' && !/\bdibaca\b/.test(blokNotif))
cek('A8 skema acuan: notifikasi_dibaca ber-PK (notif_id, user_id)', blokDibaca.includes('PRIMARY KEY (notif_id, user_id)'))
cek('A9 skema acuan: kedua FK ON DELETE CASCADE',
  /REFERENCES notifications\(id\)\s+ON DELETE CASCADE/.test(blokDibaca) && /REFERENCES users\(id\)\s+ON DELETE CASCADE/.test(blokDibaca))

// ── B–G. Basis data sungguhan ────────────────────────────────────────────────
const TIPE = 'UJI_NOTIF_B7'
const AWALAN = 'uji.notif.'
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

async function bersih(k: mysql.Connection) {
  await k.query('DELETE FROM notifications WHERE type = ?', [TIPE])
  await k.query('DELETE FROM users WHERE username LIKE ?', [`${AWALAN}%`])
}

if (c) {
  const k = c
  const [tabel] = await k.query(`SELECT COUNT(*) AS n FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifikasi_dibaca'`) as [Array<{ n: number }>, unknown]
  if (Number(tabel[0].n) === 0) {
    gagal.push('B0 tabel notifikasi_dibaca belum ada — jalankan docs/migrations/migration-notifikasi-dibaca.sql')
  } else {
    await bersih(k)
    try {
      const akun: Record<string, { id: number; role: string; username: string }> = {}
      async function buatAkun(kunci: string, role: string, dibuat: string) {
        const username = AWALAN + kunci
        const [r] = await k.query(
          `INSERT INTO users (username, email, password_hash, role, status, created_at)
           VALUES (?, ?, '!', ?, 'NONAKTIF', ?)`,
          [username, `${username}@contoh.invalid`, role, dibuat],
        ) as [{ insertId: number }, unknown]
        akun[kunci] = { id: r.insertId, role, username }
      }
      async function buatNotif(recipient: string, dibuat: string): Promise<number> {
        const [r] = await k.query(
          'INSERT INTO notifications (recipient, role, type, pesan, created_at) VALUES (?, ?, ?, ?, ?)',
          [recipient, 'UJI', TIPE, `uji ${recipient} ${dibuat}`, dibuat],
        ) as [{ insertId: number }, unknown]
        return r.insertId
      }
      const lihat = (kunci: string) => bacaNotifikasi(akun[kunci].id, akun[kunci].role, akun[kunci].username)
      const semua = (kunci: string) => tandaiSemuaDibaca(akun[kunci].id, akun[kunci].role, akun[kunci].username)
      const satu = (kunci: string, id: number) => tandaiDibaca(id, akun[kunci].id, akun[kunci].role, akun[kunci].username)
      const status = async (kunci: string, id: number) => (await lihat(kunci)).data.find((n) => n.id === id)?.dibaca
      const adaBaris = async (id: number, kunci: string) => {
        const [r] = await k.query('SELECT COUNT(*) AS n FROM notifikasi_dibaca WHERE notif_id = ? AND user_id = ?',
          [id, akun[kunci].id]) as [Array<{ n: number }>, unknown]
        return Number(r[0].n) > 0
      }

      await buatAkun('sa', 'SUPER_ADMIN', '2099-01-01 00:00:00')
      await buatAkun('ksb1', 'ADMIN_KASUBAG', '2099-01-01 00:00:00')
      await buatAkun('ksb2', 'ADMIN_KASUBAG', '2099-01-01 00:00:00')
      await buatAkun('adm', 'ADMIN', '2099-01-01 00:00:00')
      await buatAkun('baru', 'ADMIN_KASUBAG', '2099-02-01 00:00:00')
      await buatAkun('banyak', 'PROGRAM', '2099-01-01 00:00:00')

      const nKsb = await buatNotif('__KASUBAG__', '2099-01-10 10:00:00')
      const nKsbBaru = await buatNotif('__KASUBAG__', '2099-02-05 10:00:00')
      const nAdm = await buatNotif('__ADMIN__', '2099-01-11 10:00:00')
      const nPribadi = await buatNotif(akun.ksb1.username, '2099-01-12 10:00:00')

      // ── B. Keadaan awal ────────────────────────────────────────────────────
      sama('B1 SA: antrean Admin + Kasubag belum dibaca', (await lihat('sa')).unread, 3)
      sama('B2 Kasubag 1: antrean + pesan pribadi', (await lihat('ksb1')).unread, 3)
      sama('B3 Kasubag 2: antrean saja', (await lihat('ksb2')).unread, 2)
      sama('B4 Admin: antrean Admin', (await lihat('adm')).unread, 1)
      // Akun baru tidak disambut antrean lama sebagai "baru" — tapi riwayatnya tetap terlihat.
      sama('B5 akun baru: hanya yang lahir sesudah akunnya', (await lihat('baru')).unread, 1)
      sama('B6 akun baru: notifikasi lama tampil sebagai sudah dibaca', await status('baru', nKsb), true)
      sama('B7 akun baru: notifikasi sesudah akunnya belum dibaca', await status('baru', nKsbBaru), false)

      // ── C. Inti B7: "Tandai semua" Super Admin tidak memadamkan milik orang lain ──
      await semua('sa')
      sama('C1 SA sesudah tandai semua: nol', (await lihat('sa')).unread, 0)
      sama('C2 Kasubag 1 tetap 3', (await lihat('ksb1')).unread, 3)
      sama('C3 Kasubag 1 masih melihat antreannya belum dibaca', await status('ksb1', nKsb), false)
      sama('C4 Kasubag 2 tetap 2', (await lihat('ksb2')).unread, 2)
      sama('C5 Admin tetap 1 walau SA membaca antrean Admin', (await lihat('adm')).unread, 1)

      // ── D. Tandai satu = milik sendiri ─────────────────────────────────────
      await satu('ksb1', nKsb)
      sama('D1 Kasubag 1 sesudah membaca satu: 2', (await lihat('ksb1')).unread, 2)
      sama('D2 Kasubag 1: yang dibaca bertanda dibaca', await status('ksb1', nKsb), true)
      sama('D3 Kasubag 2 tidak ikut terbaca', await status('ksb2', nKsb), false)

      // ── E. SEC-C4: tak bisa menandai notifikasi yang bukan alamatnya ────────
      await satu('adm', nKsb)
      sama('E1 Admin tak bisa menandai antrean Kasubag', await adaBaris(nKsb, 'adm'), false)
      await satu('ksb2', nPribadi)
      sama('E2 Kasubag 2 tak bisa menandai pesan pribadi Kasubag 1', await adaBaris(nPribadi, 'ksb2'), false)
      await semua('adm')
      sama('E3 "Tandai semua" Admin hanya menyentuh antreannya', await adaBaris(nKsb, 'adm'), false)
      sama('E4 "Tandai semua" Admin menandai antrean Admin', await adaBaris(nAdm, 'adm'), true)

      // ── F. Lebih dari 50 ───────────────────────────────────────────────────
      const idBanyak: number[] = []
      for (let i = 0; i < 60; i++) {
        idBanyak.push(await buatNotif(akun.banyak.username, `2099-03-01 00:${String(i).padStart(2, '0')}:00`))
      }
      const hasilBanyak = await lihat('banyak')
      sama('F1 hitungan belum dibaca tidak terpotong di 50', hasilBanyak.unread, 60)
      sama('F2 daftar tetap 50 baris', hasilBanyak.data.length, 50)
      sama('F3 daftar dimulai dari yang terbaru', hasilBanyak.data[0]?.id, idBanyak[59])
      sama('F4 daftar berhenti di yang ke-50 terbaru', hasilBanyak.data[49]?.id, idBanyak[10])
      await semua('banyak')
      sama('F5 tandai semua: nol', (await lihat('banyak')).unread, 0)
      const [baris60] = await k.query('SELECT COUNT(*) AS n FROM notifikasi_dibaca WHERE user_id = ?',
        [akun.banyak.id]) as [Array<{ n: number }>, unknown]
      sama('F6 tandai semua menandai ke-60, bukan cuma 50 yang terlihat', Number(baris60[0].n), 60)

      // ── G. Diulang & dihapus ───────────────────────────────────────────────
      let galat = ''
      try { await semua('sa'); await satu('ksb1', nKsb) } catch (e) { galat = String(e) }
      sama('G1 menandai ulang tidak galat (INSERT IGNORE)', galat, '')
      await k.query('DELETE FROM notifications WHERE id = ?', [nKsb])
      const [sisaNotif] = await k.query('SELECT COUNT(*) AS n FROM notifikasi_dibaca WHERE notif_id = ?',
        [nKsb]) as [Array<{ n: number }>, unknown]
      sama('G2 notifikasi dihapus → status bacanya ikut terhapus (CASCADE)', Number(sisaNotif[0].n), 0)
      const idAkun = Object.values(akun).map((a) => a.id)
      await bersih(k)
      const [sisaAkun] = await k.query('SELECT COUNT(*) AS n FROM notifikasi_dibaca WHERE user_id IN (?)',
        [idAkun]) as [Array<{ n: number }>, unknown]
      sama('G3 akun dihapus → status bacanya ikut terhapus (CASCADE)', Number(sisaAkun[0].n), 0)
    } finally {
      await bersih(k)
    }
    const [sisa] = await k.query(`SELECT (SELECT COUNT(*) FROM notifications WHERE type = ?)
      + (SELECT COUNT(*) FROM users WHERE username LIKE ?) AS n`, [TIPE, `${AWALAN}%`]) as [Array<{ n: number }>, unknown]
    sama('G4 data uji dibersihkan', Number(sisa[0].n), 0)
  }
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
