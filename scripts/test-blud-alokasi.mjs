// Uji regresi aturan "uang keluar wajib punya rekening" (Buku Kas BLUD).
//   node scripts/test-blud-alokasi.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Yang diuji adalah SKEMA ASLI yang dipakai route /api/blud/realisasi/tx, bukan
// salinannya: `lib/blud/realisasi-schemas.ts` dikompilasi lalu di-require, sama
// seperti scripts/test-renaksi-import.mjs. Node tidak bisa memuat file .ts itu
// langsung (parameter property di kelas error tidak didukung strip-only mode).
//
// Lubang yang dijaga: dulu pagar alokasi hanya berlaku untuk jenis BELANJA,
// sehingga transaksi `LAIN` dengan kas_keluar besar dan alokasi kosong lolos
// semua pemeriksaan pagu, berstatus NORMAL (tidak menghalangi Tutup Kas), dan
// tak pernah muncul di layar Realisasi.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-alokasi-test')

fs.mkdirSync(outDir, { recursive: true })
execSync(
  `npx tsc "${path.join(repo, 'lib/blud/alokasi-rule.ts')}"`
  + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { cwd: repo, stdio: 'inherit' },
)
const { wajibBeralokasi, transferNetral } = require(path.join(outDir, 'alokasi-rule.js'))

const dasar = { kas_masuk: 0, bank_masuk: 0, kas_keluar: 0, bank_keluar: 0 }

/** [nama, transaksi, apakah wajib dibebankan ke baris anggaran] */
const KASUS = [
  ['LAIN keluar tanpa alokasi',            { ...dasar, jenis: 'LAIN', kas_keluar: 5e6 }, true],
  ['PENERIMAAN dipakai untuk keluar',      { ...dasar, jenis: 'PENERIMAAN', kas_keluar: 5e6 }, true],
  ['BELANJA keluar tunai',                 { ...dasar, jenis: 'BELANJA', kas_keluar: 1e6 }, true],
  ['BELANJA keluar lewat bank',            { ...dasar, jenis: 'BELANJA', bank_keluar: 2e6 }, true],
  ['AMBIL_BANK timpang (samaran)',         { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 5e6, kas_masuk: 1e6 }, true],
  ['SETOR_BANK timpang (samaran)',         { ...dasar, jenis: 'SETOR_BANK', kas_keluar: 5e6, bank_masuk: 0 }, true],
  ['AMBIL_BANK netral',                    { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 44e7, kas_masuk: 44e7 }, false],
  ['SETOR_BANK netral',                    { ...dasar, jenis: 'SETOR_BANK', kas_keluar: 1e6, bank_masuk: 1e6 }, false],
  ['PENERIMAAN murni masuk',               { ...dasar, jenis: 'PENERIMAAN', kas_masuk: 3e6 }, false],
  ['LAIN murni masuk',                     { ...dasar, jenis: 'LAIN', kas_masuk: 1e5 }, false],
  ['BELANJA diparkir',                     { ...dasar, jenis: 'BELANJA', kas_keluar: 9e6, belum_berrekening: true }, false],
  ['LAIN diparkir',                        { ...dasar, jenis: 'LAIN', kas_keluar: 9e6, belum_berrekening: true }, false],
  ['Selisih pembulatan 0,004 tetap netral', { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 1000.004, kas_masuk: 1000 }, false],
]

let gagal = 0
for (const [nama, tx, harap] of KASUS) {
  const hasil = wajibBeralokasi(tx)
  const ok = hasil === harap
  if (!ok) gagal++
  console.log(`${ok ? '  ok  ' : ' GAGAL'} ${nama.padEnd(40)} wajibAlokasi=${String(hasil).padEnd(5)} (harap ${harap})`)
}

if (!transferNetral({ kas_masuk: 44e7, bank_masuk: 0, kas_keluar: 0, bank_keluar: 44e7 })) {
  console.log(' GAGAL transferNetral: ambil bank 440jt seharusnya netral')
  gagal++
}

console.log(gagal === 0 ? `\n${KASUS.length + 1} pemeriksaan LULUS` : `\n${gagal} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
