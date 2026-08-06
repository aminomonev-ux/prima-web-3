// Uji regresi skema Bukti Setor BLUD.
//   node scripts/test-blud-bukti-setor.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Yang diuji SKEMA ASLI yang dipakai route /api/blud/bukti-setor. Lembar ini
// satu-satunya di modul BLUD yang menerima baris ketikan lepas, jadi pagarnya
// justru yang paling perlu dijaga: baris ber-penunjuk tidak boleh membawa nilai
// sendiri (nilainya dibaca hidup dari sumbernya), dan penunjuk yang sama tidak
// boleh muncul dua kali di satu slip.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-bukti-setor-test')

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'stub-ratelimit.js'),
  'exports.checkRateLimit = async () => ({ success: true });\n')
fs.writeFileSync(path.join(outDir, 'stub-next-server.js'),
  'exports.NextResponse = { json: (b, i) => ({ body: b, init: i }) };\n')
// Rantai impor sampai ke `format.ts` → `@/lib/shared/uuid` sejak `schemas.ts`
// meneruskan batas baris impor DPA. Pembuat id bukan yang diuji di sini.
fs.writeFileSync(path.join(outDir, 'stub-uuid.js'),
  'exports.safeRandomUUID = () => "00000000-0000-4000-8000-000000000000";\n')

try {
  execSync(
    `npx tsc "${path.join(repo, 'lib/blud/bukti-setor-schemas.ts')}"`
    + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node`,
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* impor `@/...` tak bisa di-resolve → keluar bukan-nol, tapi .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan === 'next/server') return path.join(outDir, 'stub-next-server.js')
  if (permintaan.startsWith('@/lib/security/ratelimit')) return path.join(outDir, 'stub-ratelimit.js')
  if (permintaan.startsWith('@/lib/shared/uuid')) return path.join(outDir, 'stub-uuid.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { SimpanBuktiSetorSchema } = require(path.join(outDir, 'bukti-setor-schemas.js'))

const dasar = { tahun_anggaran: 2026, bulan: 7, tanggal: '2026-07-20' }
const BKU = (id) => ({ asal: 'BKU', tx_id: id })
const POT = (id) => ({ asal: 'POTONGAN', potongan_id: id })
const KETIK = (uraian, nilai) => ({ asal: 'KETIK', uraian, nilai })

/** [nama, body, apakah skema harus MENERIMA] */
const KASUS = [
  ['Slip campuran BKU + potongan + ketikan',
    { ...dasar, ambil_tx_id: 18, baris: [BKU(16), POT(1), KETIK('Transfer koperasi', 3241778)] }, true],
  ['Slip tanpa Ambil Uang tetap sah',
    { ...dasar, baris: [BKU(16)] }, true],
  ['Ambil Uang diketik lepas sah',
    { ...dasar, ambil_manual: 1437000000, baris: [BKU(16)] }, true],

  ['Transaksi kembar di satu slip ditolak',
    { ...dasar, baris: [BKU(16), BKU(16)] }, false],
  ['Potongan kembar di satu slip ditolak',
    { ...dasar, baris: [POT(1), POT(1)] }, false],
  ['Ambil Uang dari BKU + ketikan sekaligus ditolak',
    { ...dasar, ambil_tx_id: 18, ambil_manual: 1000, baris: [BKU(16)] }, false],
  ['Tanggal di luar bulan yang dipilih ditolak',
    { ...dasar, tanggal: '2026-08-03', baris: [BKU(16)] }, false],

  ['Baris BKU tanpa penunjuk ditolak',
    { ...dasar, baris: [{ asal: 'BKU' }] }, false],
  ['Baris potongan tanpa penunjuk ditolak',
    { ...dasar, baris: [{ asal: 'POTONGAN' }] }, false],
  ['Baris ketikan tanpa uraian ditolak',
    { ...dasar, baris: [KETIK('', 1000)] }, false],
  ['Baris ketikan bernilai nol ditolak',
    { ...dasar, baris: [KETIK('Transfer koperasi', 0)] }, false],
]

let gagal = 0
for (const [nama, body, harapLolos] of KASUS) {
  const hasil = SimpanBuktiSetorSchema.safeParse(body)
  const benar = hasil.success === harapLolos
  if (!benar) gagal++
  const pesan = hasil.success ? 'diterima' : `ditolak: ${hasil.error.issues[0]?.message?.slice(0, 52) ?? ''}`
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(48)} ${pesan}`)
}

console.log(gagal === 0 ? `\n${KASUS.length} pemeriksaan LULUS` : `\n${gagal} dari ${KASUS.length} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
