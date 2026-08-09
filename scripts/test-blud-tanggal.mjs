// Uji batas pergantian hari untuk `tanggalHariIniWIB` (B4).
//   node scripts/test-blud-tanggal.mjs
//
// TIDAK menyentuh DB. Yang diuji satu hal: pukul berapa menurut UTC tanggal WIB
// berganti. Justru di situ letak salahnya sebelum ini — `versi_tanggal` dihitung
// dari `toISOString()`, jadi simpanan antara 00:00–06:59 WIB memakai tanggal
// kemarin dan menimpa versi kemarin alih-alih membuka versi baru.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-tanggal-test')

fs.mkdirSync(outDir, { recursive: true })
execSync(
  `npx tsc "${path.join(repo, 'lib/blud/tanggal.ts')}"`
  + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020 --skipLibCheck`,
  { cwd: repo, stdio: 'pipe' },
)

const { tanggalHariIniWIB } = require(path.join(outDir, 'lib/blud/tanggal.js'))

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(58)} ${tambahan}`)
}

const utc = (iso) => Date.parse(iso)

console.log('── Batas pergantian hari WIB (UTC+7) ──')

periksa('16:59 UTC = 23:59 WIB → masih hari yang sama',
  tanggalHariIniWIB(utc('2026-08-09T16:59:59Z')) === '2026-08-09',
  tanggalHariIniWIB(utc('2026-08-09T16:59:59Z')))

periksa('17:00 UTC = 00:00 WIB → sudah hari berikutnya',
  tanggalHariIniWIB(utc('2026-08-09T17:00:00Z')) === '2026-08-10',
  tanggalHariIniWIB(utc('2026-08-09T17:00:00Z')))

// Contoh persis dari dokumen audit: 23:00 UTC 9 Agustus = 06:00 WIB 10 Agustus.
periksa('23:00 UTC 9 Agu = 06:00 WIB 10 Agu → 2026-08-10',
  tanggalHariIniWIB(utc('2026-08-09T23:00:00Z')) === '2026-08-10',
  tanggalHariIniWIB(utc('2026-08-09T23:00:00Z')))

// Inti B4: idiom lama HARUS salah di jam yang sama. Kalau baris ini gagal berarti
// pengujiannya yang keliru, bukan perbaikannya.
periksa('…dan idiom lama memang menjawab tanggal kemarin',
  new Date(utc('2026-08-09T23:00:00Z')).toISOString().slice(0, 10) === '2026-08-09')

console.log('\n── Pergantian bulan & tahun ──')

periksa('16:59 UTC 31 Des → 2026-12-31',
  tanggalHariIniWIB(utc('2026-12-31T16:59:59Z')) === '2026-12-31')
periksa('17:00 UTC 31 Des → 2027-01-01',
  tanggalHariIniWIB(utc('2026-12-31T17:00:00Z')) === '2027-01-01')
periksa('17:00 UTC 31 Jan → 2026-02-01',
  tanggalHariIniWIB(utc('2026-01-31T17:00:00Z')) === '2026-02-01')

console.log('\n── Bentuk keluaran ──')

periksa('Tanpa argumen tetap YYYY-MM-DD',
  /^\d{4}-\d{2}-\d{2}$/.test(tanggalHariIniWIB()), tanggalHariIniWIB())

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
