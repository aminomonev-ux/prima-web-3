// Uji regresi jalur tulis saldo awal tahun (temuan audit R3).
//   node scripts/test-blud-saldo-awal.mjs
//
// MENYENTUH DB — hanya di TAHUN KOTAK PASIR 2099, dan seluruhnya dibersihkan di
// blok `finally` termasuk bila ada pemeriksaan yang gagal di tengah.
//
// Yang diuji bukan sekadar "angkanya tersimpan", melainkan dua sifat yang membuat
// kolom ini berbahaya kalau salah: (1) ia merambat ke saldo awal SEMUA bulan
// sesudahnya (§4.6), dan (2) ia harus membeku begitu ada berita acara yang
// ditandatangani di atasnya. Menirunya dengan tiruan berarti menguji tiruannya —
// yang menentukan justru isi `blud_periode` dan `blud_realisasi_tx` sungguhan.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-saldo-awal-test')

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
    `npx tsc "${path.join(repo, 'lib/blud/tutup-kas.ts')}" "${path.join(repo, 'lib/blud/schemas.ts')}"`
    + ` "${path.join(repo, 'lib/data/db.ts')}"`
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

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const { setSaldoAwalTahun, tutupPeriode, bukaPeriode } = require(path.join(outDir, 'lib/blud/tutup-kas.js'))
const { getSaldoAwal } = require(path.join(outDir, 'lib/blud/realisasi-data.js'))
const { SaldoAwalBodySchema } = require(path.join(outDir, 'lib/blud/realisasi-schemas.js'))

const TAHUN = 2099

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(56)} ${tambahan}`)
}

async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
async function bersihkan() {
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
}

// ─── Lapis 1: bentuk masukan ────────────────────────────────────────────────
console.log('── Lapis 1: SaldoAwalBodySchema ──')

for (const [nama, isi, harap] of [
  ['Dua angka wajar diterima', { tahun_anggaran: TAHUN, saldo_awal_kas: 1000, saldo_awal_bank: 25000 }, true],
  ['Nol diterima', { tahun_anggaran: TAHUN, saldo_awal_kas: 0, saldo_awal_bank: 0 }, true],
  ['Saldo negatif ditolak', { tahun_anggaran: TAHUN, saldo_awal_kas: -1, saldo_awal_bank: 0 }, false],
  ['Bank negatif ditolak', { tahun_anggaran: TAHUN, saldo_awal_kas: 0, saldo_awal_bank: -5 }, false],
  ['Bukan angka ditolak', { tahun_anggaran: TAHUN, saldo_awal_kas: 'x', saldo_awal_bank: 0 }, false],
  ['Tahun di luar rentang ditolak', { tahun_anggaran: 1899, saldo_awal_kas: 0, saldo_awal_bank: 0 }, false],
]) {
  periksa(nama, SaldoAwalBodySchema.safeParse(isi).success === harap)
}

// Nomor bulan sengaja tidak diterima — yang dimaksud selalu awal tahun. Kalau
// suatu saat ikut masuk, uji ini yang lebih dulu memberi tahu.
periksa('Bulan tidak ikut diterima',
  !('bulan' in (SaldoAwalBodySchema.safeParse(
    { tahun_anggaran: TAHUN, bulan: 6, saldo_awal_kas: 0, saldo_awal_bank: 0 },
  ).data ?? {})))

// ─── Lapis 2: rambatan & kunci (DB, tahun kotak pasir 2099) ─────────────────
console.log('\n── Lapis 2: rambatan & kunci (DB, tahun 2099) ──')
try {
  await bersihkan()

  const r1 = await setSaldoAwalTahun(TAHUN, { kas: 1_000_000, bank: 50_000_000 })
  periksa('Set pertama: nilai lama nol', r1.lama.kas === 0 && r1.lama.bank === 0)
  let awal = await getSaldoAwal(TAHUN, 1)
  periksa('Januari memakai angka yang baru diset',
    awal.kas === 1_000_000 && awal.bank === 50_000_000)

  const r2 = await setSaldoAwalTahun(TAHUN, { kas: 2_000_000, bank: 50_000_000 })
  periksa('Set kedua mengembalikan nilai LAMA, bukan yang baru',
    r2.lama.kas === 1_000_000, `lama=${r2.lama.kas}`)

  // Rambatan §4.6 — inilah alasan kolom ini berbahaya: satu angka di Januari
  // menggeser saldo awal tiap bulan sesudahnya, termasuk yang sudah dicetak.
  await sql`
    INSERT INTO blud_realisasi_tx
      (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_masuk, kas_keluar, bank_masuk, bank_keluar, status)
    VALUES (${TAHUN}, 1, '2099-01-10', 'BELANJA', 'uji rambatan', 0, 500000, 0, 0, 'NORMAL')
  `
  awal = await getSaldoAwal(TAHUN, 3)
  periksa('Maret = saldo awal tahun + arus Jan–Feb',
    awal.kas === 2_000_000 - 500_000, `kas=${awal.kas}`)

  await setSaldoAwalTahun(TAHUN, { kas: 3_000_000, bank: 50_000_000 })
  awal = await getSaldoAwal(TAHUN, 3)
  periksa('Mengubah saldo awal ikut menggeser Maret',
    awal.kas === 3_000_000 - 500_000, `kas=${awal.kas}`)

  // Kunci — begitu ada berita acara, angkanya beku. Sisi B dibuat seimbang dulu
  // supaya yang menahan benar-benar pagar R3, bukan pagar keseimbangan §4.7.
  const saldoBuku = 3_000_000 - 500_000 + 50_000_000
  await tutupPeriode(TAHUN, 1, { kas_fisik: saldoBuku, bank_koran: 0 }, null)
  periksa('Januari tertutup', (await sql`
    SELECT status FROM blud_periode WHERE tahun_anggaran = ${TAHUN} AND bulan = 1
  `)[0]?.status === 'TUTUP')

  periksa('Set sesudah Januari ditutup → ditolak',
    await tangkap(() => setSaldoAwalTahun(TAHUN, { kas: 9, bank: 9 })) === 'BludSaldoAwalTerkunciError')
  const tetap = await getSaldoAwal(TAHUN, 1)
  periksa('…dan angkanya tidak berubah', tetap.kas === 3_000_000, `kas=${tetap.kas}`)

  await bukaPeriode(TAHUN, 1)
  periksa('Sesudah Januari dibuka kembali → boleh lagi',
    await tangkap(() => setSaldoAwalTahun(TAHUN, { kas: 4_000_000, bank: 1 })) === null)
} finally {
  await bersihkan()
  const sisaP = await sql`SELECT COUNT(*) AS n FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
  const sisaT = await sql`SELECT COUNT(*) AS n FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  periksa('Kotak pasir bersih setelah uji',
    Number(sisaP[0]?.n ?? -1) === 0 && Number(sisaT[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
