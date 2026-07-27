// Uji regresi hubungan arus kas ↔ baris anggaran (Buku Kas BLUD).
//   node scripts/test-blud-alokasi.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Dua lapis diuji, dan keduanya perlu:
//   1. `lib/blud/alokasi-rule.ts` — predikatnya sendiri (murni, cepat).
//   2. `lib/blud/realisasi-schemas.ts` — SKEMA ASLI yang dipakai route
//      /api/blud/realisasi/tx, bukan salinannya. Predikat benar tapi tidak
//      dipasang di skema = lubang tetap terbuka, dan itu persis yang pernah
//      terjadi: aturan "wajib" dipasang, kebalikannya tidak.
//
// Node tidak bisa memuat .ts itu langsung (parameter property di kelas error tidak
// didukung strip-only mode), jadi dikompilasi dulu lalu di-require — pola yang
// sama dengan scripts/test-renaksi-import.mjs. Impor `@/...` dan `next/server`
// di rantai `./schemas` diarahkan ke stub: yang diuji aturannya, bukan guard HTTP.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-alokasi-test')

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'stub-ratelimit.js'),
  'exports.checkRateLimit = async () => ({ success: true });\n')
fs.writeFileSync(path.join(outDir, 'stub-next-server.js'),
  'exports.NextResponse = { json: (b, i) => ({ body: b, init: i }) };\n')

// tsc keluar bukan-nol untuk impor `@/...` yang tak bisa di-resolve, tapi berkas
// .js-nya tetap ditulis — itu yang dipakai. Karena itu errornya sengaja ditelan.
try {
  execSync(
    `npx tsc "${path.join(repo, 'lib/blud/realisasi-schemas.ts')}"`
    + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node`,
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* lihat komentar di atas */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan === 'next/server') return path.join(outDir, 'stub-next-server.js')
  if (permintaan.startsWith('@/lib/security/ratelimit')) return path.join(outDir, 'stub-ratelimit.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const aturan = require(path.join(outDir, 'alokasi-rule.js'))
const skema = require(path.join(outDir, 'realisasi-schemas.js'))
const { sifatAlokasi, nilaiAlokasiSeharusnya, transferNetral, bolehBerpotongan } = aturan
const { TransaksiInputSchema } = skema

const dasar = { kas_masuk: 0, bank_masuk: 0, kas_keluar: 0, bank_keluar: 0 }
let gagal = 0

function periksa(nama, benar, tambahan = '') {
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama}${tambahan}`)
}

// ─── Lapis 1: predikat ──────────────────────────────────────────────────────

/** [nama, transaksi, sifat yang diharapkan] */
const KASUS = [
  ['LAIN keluar tanpa alokasi',             { ...dasar, jenis: 'LAIN', kas_keluar: 5e6 }, 'WAJIB'],
  ['PENERIMAAN dipakai untuk keluar',       { ...dasar, jenis: 'PENERIMAAN', kas_keluar: 5e6 }, 'WAJIB'],
  ['BELANJA keluar tunai',                  { ...dasar, jenis: 'BELANJA', kas_keluar: 1e6 }, 'WAJIB'],
  ['BELANJA keluar lewat bank',             { ...dasar, jenis: 'BELANJA', bank_keluar: 2e6 }, 'WAJIB'],
  ['AMBIL_BANK timpang (samaran)',          { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 5e6, kas_masuk: 1e6 }, 'WAJIB'],
  ['SETOR_BANK timpang (samaran)',          { ...dasar, jenis: 'SETOR_BANK', kas_keluar: 5e6 }, 'WAJIB'],
  ['AMBIL_BANK netral',                     { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 44e7, kas_masuk: 44e7 }, 'DILARANG'],
  ['SETOR_BANK netral',                     { ...dasar, jenis: 'SETOR_BANK', kas_keluar: 1e6, bank_masuk: 1e6 }, 'DILARANG'],
  ['PENERIMAAN murni masuk',                { ...dasar, jenis: 'PENERIMAAN', kas_masuk: 3e6 }, 'DILARANG'],
  ['LAIN murni masuk',                      { ...dasar, jenis: 'LAIN', kas_masuk: 1e5 }, 'DILARANG'],
  ['BELANJA diparkir',                      { ...dasar, jenis: 'BELANJA', kas_keluar: 9e6, belum_berrekening: true }, 'DILARANG'],
  ['LAIN diparkir',                         { ...dasar, jenis: 'LAIN', kas_keluar: 9e6, belum_berrekening: true }, 'DILARANG'],
  ['Selisih pembulatan 0,004 tetap netral', { ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 1000.004, kas_masuk: 1000 }, 'DILARANG'],
  ['PENGEMBALIAN uang masuk',               { ...dasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5 }, 'WAJIB_KEMBALI'],
  ['PENGEMBALIAN lewat bank',               { ...dasar, jenis: 'PENGEMBALIAN', bank_masuk: 5e5 }, 'WAJIB_KEMBALI'],
  ['PENGEMBALIAN tanpa nilai',              { ...dasar, jenis: 'PENGEMBALIAN' }, 'DILARANG'],
]

console.log('── Lapis 1: predikat sifatAlokasi ──')
for (const [nama, tx, harap] of KASUS) {
  const hasil = sifatAlokasi(tx)
  periksa(nama.padEnd(42), hasil === harap, ` sifat=${String(hasil).padEnd(14)} (harap ${harap})`)
}

periksa('transferNetral: ambil bank 440jt'.padEnd(42),
  transferNetral({ kas_masuk: 44e7, bank_masuk: 0, kas_keluar: 0, bank_keluar: 44e7 }))
periksa('nilai seharusnya: belanja 1jt → +1jt'.padEnd(42),
  nilaiAlokasiSeharusnya({ ...dasar, jenis: 'BELANJA', kas_keluar: 1e6 }) === 1e6)
periksa('nilai seharusnya: kembali 500rb → −500rb'.padEnd(42),
  nilaiAlokasiSeharusnya({ ...dasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5 }) === -5e5)
periksa('potongan hanya pada belanja sungguhan'.padEnd(42),
  bolehBerpotongan({ ...dasar, jenis: 'BELANJA', bank_keluar: 1e6 })
  && !bolehBerpotongan({ ...dasar, jenis: 'AMBIL_BANK', bank_keluar: 1e6, kas_masuk: 1e6 })
  && !bolehBerpotongan({ ...dasar, jenis: 'PENGEMBALIAN', kas_masuk: 1e6 }))

// ─── Lapis 2: skema asli ────────────────────────────────────────────────────

const KEY = 'AK-uji-1'
const KEY2 = 'AK-uji-2'
const txDasar = { tanggal: '2026-06-15', uraian: 'uji', ...dasar }

/** [nama, body, apakah skema harus MENERIMA] */
const KASUS_SKEMA = [
  ['LAIN keluar tanpa alokasi ditolak',
    { ...txDasar, jenis: 'LAIN', kas_keluar: 5e6 }, false],
  ['LAIN keluar beralokasi diterima',
    { ...txDasar, jenis: 'LAIN', kas_keluar: 5e6, alokasi: [{ anggaran_key: KEY, nilai: 5e6 }] }, true],
  ['AMBIL_BANK timpang ditolak',
    { ...txDasar, jenis: 'AMBIL_BANK', bank_keluar: 5e6, kas_masuk: 1e6 }, false],
  ['AMBIL_BANK netral tanpa alokasi diterima',
    { ...txDasar, jenis: 'AMBIL_BANK', bank_keluar: 1e6, kas_masuk: 1e6 }, true],

  // Arah kebalikan — inilah yang dulu menganga: alokasi menempel pada transaksi
  // yang tidak mengeluarkan uang, pagu tergerus tanpa belanja.
  ['AMBIL_BANK netral BERALOKASI ditolak',
    { ...txDasar, jenis: 'AMBIL_BANK', bank_keluar: 1e6, kas_masuk: 1e6, alokasi: [{ anggaran_key: KEY, nilai: 1e6 }] }, false],
  ['PENERIMAAN murni BERALOKASI ditolak',
    { ...txDasar, jenis: 'PENERIMAAN', kas_masuk: 3e6, alokasi: [{ anggaran_key: KEY, nilai: 3e6 }] }, false],
  ['Transaksi diparkir BERALOKASI ditolak',
    { ...txDasar, jenis: 'BELANJA', kas_keluar: 9e6, belum_berrekening: true, alokasi: [{ anggaran_key: KEY, nilai: 9e6 }] }, false],
  ['Alokasi belanja negatif ditolak',
    { ...txDasar, jenis: 'BELANJA', kas_keluar: 1e6, alokasi: [{ anggaran_key: KEY, nilai: -1e6 }] }, false],

  ['PENGEMBALIAN beralokasi negatif diterima',
    { ...txDasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5, alokasi: [{ anggaran_key: KEY, nilai: -5e5 }] }, true],
  ['PENGEMBALIAN beralokasi positif ditolak',
    { ...txDasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5, alokasi: [{ anggaran_key: KEY, nilai: 5e5 }] }, false],
  ['PENGEMBALIAN tanpa alokasi ditolak',
    { ...txDasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5 }, false],
  // Lewat kolom bank supaya yang diuji aturan PENGEMBALIAN, bukan larangan lama
  // "kas masuk dan kas keluar sekaligus" yang kebetulan menangkap duluan.
  ['PENGEMBALIAN dengan uang keluar ditolak',
    { ...txDasar, jenis: 'PENGEMBALIAN', kas_masuk: 5e5, bank_keluar: 1e5, alokasi: [{ anggaran_key: KEY, nilai: -5e5 }] }, false],

  ['Belanja berpotongan diterima',
    { ...txDasar, jenis: 'BELANJA', bank_keluar: 4020481, alokasi: [{ anggaran_key: KEY, nilai: 4020481 }],
      potongan: [{ jenis: 'PPN', nilai: 398426 }, { jenis: 'PPH_22', nilai: 54331 }] }, true],
  ['Potongan pada transfer netral ditolak',
    { ...txDasar, jenis: 'AMBIL_BANK', bank_keluar: 1e6, kas_masuk: 1e6, potongan: [{ jenis: 'PPN', nilai: 1e5 }] }, false],
  ['Potongan melebihi pembayaran ditolak',
    { ...txDasar, jenis: 'BELANJA', kas_keluar: 1e6, alokasi: [{ anggaran_key: KEY, nilai: 1e6 }],
      potongan: [{ jenis: 'PPN', nilai: 2e6 }] }, false],

  ['Baris anggaran kembar ditolak',
    { ...txDasar, jenis: 'BELANJA', kas_keluar: 2e6,
      alokasi: [{ anggaran_key: KEY, nilai: 1e6 }, { anggaran_key: KEY, nilai: 1e6 }] }, false],
  ['Dibagi ke dua baris diterima',
    { ...txDasar, jenis: 'BELANJA', kas_keluar: 2e6,
      alokasi: [{ anggaran_key: KEY, nilai: 12e5 }, { anggaran_key: KEY2, nilai: 8e5 }] }, true],
]

console.log('\n── Lapis 2: TransaksiInputSchema (skema asli route) ──')
for (const [nama, body, harapLolos] of KASUS_SKEMA) {
  const hasil = TransaksiInputSchema.safeParse(body)
  const benar = hasil.success === harapLolos
  const pesan = hasil.success ? 'diterima' : `ditolak: ${hasil.error.issues[0]?.message?.slice(0, 58) ?? ''}`
  periksa(nama.padEnd(46), benar, ` ${pesan}`)
}

// ─── Lapis 3: S1 — tanggal terikat ke (tahun, bulan) ────────────────────────
// BKU & Tutup Kas mengelompokkan dari kolom `bulan`, lembar GU & register dari
// kolom `tanggal`. Selama keduanya lepas, dua lembar dari data yang sama bisa
// tidak cocok — dan tanggal di bulan yang sudah ditutup bisa disusupkan lewat
// bulan yang masih buka.
const { CreateTxBodySchema } = skema
const txSah = { ...txDasar, jenis: 'BELANJA', kas_keluar: 1e6, alokasi: [{ anggaran_key: KEY, nilai: 1e6 }] }

/** [nama, body, apakah skema harus MENERIMA] */
const KASUS_TANGGAL = [
  ['Tanggal di dalam bulannya diterima',
    { tahun_anggaran: 2026, bulan: 6, transaksi: { ...txSah, tanggal: '2026-06-15' } }, true],
  ['Tanggal bulan lain ditolak',
    { tahun_anggaran: 2026, bulan: 7, transaksi: { ...txSah, tanggal: '2026-06-30' } }, false],
  ['Tanggal tahun lain ditolak',
    { tahun_anggaran: 2026, bulan: 7, transaksi: { ...txSah, tanggal: '2025-07-15' } }, false],
  // Awalan wajib ber-padding: tanpa itu `2026-1-` cocok dengan Oktober–Desember.
  ['Oktober tidak lolos sebagai Januari',
    { tahun_anggaran: 2026, bulan: 1, transaksi: { ...txSah, tanggal: '2026-10-01' } }, false],
  ['Bulan satu digit tetap cocok',
    { tahun_anggaran: 2026, bulan: 9, transaksi: { ...txSah, tanggal: '2026-09-05' } }, true],
  ['Tanggal terakhir bulan diterima',
    { tahun_anggaran: 2026, bulan: 2, transaksi: { ...txSah, tanggal: '2026-02-28' } }, true],
]

console.log('\n── Lapis 3: CreateTxBodySchema — tanggal ↔ (tahun, bulan) ──')
for (const [nama, body, harapLolos] of KASUS_TANGGAL) {
  const hasil = CreateTxBodySchema.safeParse(body)
  const benar = hasil.success === harapLolos
  const pesan = hasil.success ? 'diterima' : `ditolak: ${hasil.error.issues[0]?.message?.slice(0, 58) ?? ''}`
  periksa(nama.padEnd(46), benar, ` ${pesan}`)
}

const total = KASUS.length + 4 + KASUS_SKEMA.length + KASUS_TANGGAL.length
console.log(gagal === 0 ? `\n${total} pemeriksaan LULUS` : `\n${gagal} dari ${total} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
