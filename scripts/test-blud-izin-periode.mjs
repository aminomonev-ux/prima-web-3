// Uji regresi izin hapus versi (S5) + pagar buka periode (S2).
//   node scripts/test-blud-izin-periode.mjs
//
// Lapis 1 murni (predikat izin & skema alasan) — tidak menyentuh DB.
// Lapis 2 MENYENTUH DB, tapi hanya di TAHUN KOTAK PASIR 2099 dan seluruhnya
// dibersihkan di blok `finally`, sama seperti scripts/test-blud-hapus-versi.mjs.
//
// Kenapa lapis 2 tidak boleh diganti tiruan: yang diuji urutan buka periode, dan
// urutan itu ditentukan oleh isi tabel `blud_periode` yang sesungguhnya. Menirunya
// berarti menguji tiruannya.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-izin-periode-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'stub-next-server.js'),
  'exports.NextResponse = { json: (b, i) => ({ body: b, init: i }) };\n')
fs.writeFileSync(path.join(outDir, 'stub-ratelimit.js'),
  'exports.checkRateLimit = async () => ({ allowed: true });\n')

try {
  execSync(
    `npx tsc "${path.join(repo, 'lib/blud/schemas.ts')}" "${path.join(repo, 'lib/blud/tutup-kas.ts')}"`
    + ` "${path.join(repo, 'lib/data/db.ts')}" "${path.join(repo, 'lib/data/locks.ts')}"`
    // Sejak `schemas.ts` meneruskan batas baris impor dari `import-dpa-shared`,
    // rantainya sampai ke `format.ts` → `@/lib/shared/uuid`. Alias `@/…` tidak
    // ter-resolve tsc telanjang, jadi berkasnya harus disebut eksplisit.
    + ` "${path.join(repo, 'lib/shared/uuid.ts')}"`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* impor `@/...` tak ter-resolve saat compile — .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan === 'next/server') return path.join(outDir, 'stub-next-server.js')
  if (permintaan.startsWith('@/lib/security/ratelimit')) return path.join(outDir, 'stub-ratelimit.js')
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { canHapusVersi, AlasanHapusSchema } = require(path.join(outDir, 'lib/blud/schemas.js'))
const { bolehBukaPeriode } = require(path.join(outDir, 'lib/blud/realisasi-schemas.js'))
const { bukaPeriode } = require(path.join(outDir, 'lib/blud/tutup-kas.js'))
const { sql } = require(path.join(outDir, 'lib/data/db.js'))

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(52)} ${tambahan}`)
}

// ─── Lapis 1: izin hapus versi (S5) ─────────────────────────────────────────
console.log('── Lapis 1: izin & alasan ──')

for (const [role, harap] of [
  ['SUPER_ADMIN', true], ['ADMIN', true],
  ['PERBENDAHARAAN', false], ['KEUANGAN', false], ['PROGRAM', false],
  ['ADMIN_KABAG', false], ['ADMIN_KASUBAG', false],
]) {
  periksa(`canHapusVersi(${role})`, canHapusVersi(role) === harap, harap ? 'boleh' : 'ditolak')
}

// Grant `app_access: 'blud'` membuka pintu masuk modul, BUKAN wewenang hapus —
// itu inti S5. Predikatnya memang tidak menerima app_access sama sekali.
periksa('canHapusVersi hanya menerima role', canHapusVersi.length === 1)

for (const [nama, teks, harap] of [
  ['Alasan kosong ditolak', '', false],
  ['Alasan terlalu pendek ditolak', 'salah', false],
  ['Spasi saja ditolak', '            ', false],
  ['Alasan wajar diterima', 'versi salah simpan, tertukar dgn DPA murni', true],
  ['Alasan 500 karakter diterima', 'x'.repeat(500), true],
  ['Alasan 501 karakter ditolak', 'x'.repeat(501), false],
]) {
  periksa(nama, AlasanHapusSchema.safeParse(teks).success === harap)
}

// Daftar pemegang kunci dikunci di uji supaya pelonggarannya tidak pernah terjadi
// diam-diam. PERBENDAHARAAN sengaja di luar: yang menutup dan yang membuka lagi
// tidak boleh orang yang sama — itu inti pemisahannya, bukan kelalaian.
periksa('bolehBukaPeriode: SUPER_ADMIN', bolehBukaPeriode('SUPER_ADMIN') === true)
periksa('bolehBukaPeriode: ADMIN', bolehBukaPeriode('ADMIN') === true)
periksa('bolehBukaPeriode: KEUANGAN', bolehBukaPeriode('KEUANGAN') === true)
periksa('bolehBukaPeriode: PERBENDAHARAAN ditolak', bolehBukaPeriode('PERBENDAHARAAN') === false)
periksa('bolehBukaPeriode: PROGRAM ditolak', bolehBukaPeriode('PROGRAM') === false)
periksa('bolehBukaPeriode: peran tak terdaftar ditolak', bolehBukaPeriode('AKUNTANSI') === false)

// ─── Lapis 2: pagar buka periode (S2) ───────────────────────────────────────
const TAHUN = 2099

async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
async function status(bulan) {
  const r = await sql`SELECT status FROM blud_periode WHERE tahun_anggaran = ${TAHUN} AND bulan = ${bulan}`
  return String(r[0]?.status ?? '-')
}
async function bersihkan() {
  await sql`DELETE FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
}

console.log('\n── Lapis 2: urutan buka periode (DB, tahun kotak pasir 2099) ──')
try {
  await bersihkan()
  for (let b = 1; b <= 6; b++) {
    await sql`INSERT INTO blud_periode (tahun_anggaran, bulan, status) VALUES (${TAHUN}, ${b}, 'TUTUP')`
  }

  periksa('Buka Januari sementara Feb–Jun tutup → ditolak',
    await tangkap(() => bukaPeriode(TAHUN, 1)) === 'BludBukaTerhalangError')
  periksa('…dan Januari tetap TUTUP', await status(1) === 'TUTUP')

  periksa('Buka Juni (paling belakang) → boleh',
    await tangkap(() => bukaPeriode(TAHUN, 6)) === null)
  periksa('…dan Juni jadi BUKA', await status(6) === 'BUKA')

  periksa('Buka Mei sesudah Juni terbuka → boleh',
    await tangkap(() => bukaPeriode(TAHUN, 5)) === null)

  periksa('Januari masih ditolak (Feb–Apr tutup)',
    await tangkap(() => bukaPeriode(TAHUN, 1)) === 'BludBukaTerhalangError')

  // Bulan yang tidak punya baris sama sekali dianggap belum pernah ditutup,
  // jadi tidak menghalangi — kalau tidak, tahun baru mustahil dibuka.
  await bersihkan()
  await sql`INSERT INTO blud_periode (tahun_anggaran, bulan, status) VALUES (${TAHUN}, 3, 'TUTUP')`
  periksa('Bulan tanpa baris tidak ikut menghalangi',
    await tangkap(() => bukaPeriode(TAHUN, 3)) === null)
} finally {
  await bersihkan()
  const sisa = await sql`SELECT COUNT(*) AS n FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
  periksa('Kotak pasir bersih setelah uji', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
