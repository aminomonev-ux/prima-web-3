// Uji regresi tabel izin peran × menu BLUD (docs/CONCEPT-blud-peran.md).
//   node scripts/test-blud-peran.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Yang diuji seluruh matriksnya, bukan contoh-contoh pilihan: 12 menu × 5 peran
// ditulis lengkap di bawah lalu dibandingkan satu per satu. Tabel izin itu jenis
// data yang gampang "benar sebagian" — satu sel keliru tidak membuat apa pun
// gagal, cuma diam-diam memberi wewenang yang tidak dimaksudkan.
//
// Melonggarkan izin akan MEMBUAT SKRIP INI GAGAL. Itu disengaja: pelonggaran
// harus jadi keputusan sadar yang ikut memperbarui berkas ini, bukan efek samping.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-peran-test')

fs.mkdirSync(outDir, { recursive: true })
execSync(
  `npx tsc "${path.join(repo, 'lib/blud/peran.ts')}"`
  + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: repo, stdio: 'pipe' },
)

const { izinMenu, bolehEdit, bolehBuka, menuTerbuka, MENU_BLUD, isMenuBlud } =
  require(path.join(outDir, 'peran.js'))

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(46)} ${tambahan}`)
}

// ─── Matriks penuh ──────────────────────────────────────────────────────────
// Kolom: SUPER_ADMIN · ADMIN · PROGRAM · KEUANGAN · PERBENDAHARAAN
const E = 'EDIT', L = 'LIHAT'
const PERAN = ['SUPER_ADMIN', 'ADMIN', 'PROGRAM', 'KEUANGAN', 'PERBENDAHARAAN']

const MATRIKS = {
  'beranda':          [L, L, L, L, L],   // tidak ada jalur tulis — EDIT diturunkan
  'master-akun':      [E, E, E, L, L],
  'kode-besar':       [E, E, E, L, L],
  'penanggung-jawab': [E, E, E, L, L],
  'dpa':              [E, E, E, L, L],
  'pergeseran':       [E, E, E, L, L],
  'buku-kas':         [E, E, L, L, E],
  'bukti-setor':      [E, E, L, L, E],
  'realisasi':        [E, E, L, L, E],
  'tutup-kas':        [E, E, L, E, E],
  'cetak':            [L, L, L, L, L],   // unduh saja
  'pengaturan':       [E, E, E, E, E],   // hapus versi dijaga terpisah
}

console.log('── Matriks izin peran × menu ──')
for (const menu of MENU_BLUD) {
  const harap = MATRIKS[menu]
  if (!harap) { periksa(`menu ${menu} ada di matriks uji`, false, 'BELUM DIUJI'); continue }
  const dapat = PERAN.map((p) => izinMenu(p, menu))
  const cocok = dapat.every((v, i) => v === harap[i])
  periksa(`${menu}`, cocok, dapat.map((v, i) => (v === harap[i] ? v : `${v}≠${harap[i]}`)).join(' · '))
}
periksa('jumlah menu masih 12', MENU_BLUD.length === 12, `${MENU_BLUD.length}`)

// ─── Pemisahan yang jadi inti rancangan ─────────────────────────────────────
console.log('\n── Pemisahan pokok ──')
periksa('Bendahara tidak menyentuh DPA', !bolehEdit('PERBENDAHARAAN', 'dpa'))
periksa('Bendahara tidak menyentuh Pergeseran', !bolehEdit('PERBENDAHARAAN', 'pergeseran'))
periksa('PROGRAM tidak menyentuh Buku Kas', !bolehEdit('PROGRAM', 'buku-kas'))
periksa('PROGRAM tidak menyentuh Tutup Kas', !bolehEdit('PROGRAM', 'tutup-kas'))
periksa('KEUANGAN tidak menyentuh Buku Kas', !bolehEdit('KEUANGAN', 'buku-kas'))
periksa('KEUANGAN memegang Tutup Kas', bolehEdit('KEUANGAN', 'tutup-kas'))

// ─── LIHAT tetap boleh membuka & mengunduh ──────────────────────────────────
console.log('\n── LIHAT = boleh buka + unduh ──')
for (const peran of PERAN) {
  periksa(`${peran} bisa membuka Cetak`, bolehBuka(peran, 'cetak'))
}
periksa('Tidak ada peran terdaftar yang kehilangan menu',
  PERAN.every((p) => menuTerbuka(p).length === MENU_BLUD.length))

// ─── Peran tak terdaftar ────────────────────────────────────────────────────
console.log('\n── Peran ber-grant yang belum masuk tabel ──')
for (const peran of ['AKUNTANSI', 'PENGEMBANGAN PENDAPATAN', 'ADMIN_KABAG', 'ADMIN_KASUBAG', 'MDSI']) {
  const semuaLihat = MENU_BLUD.every((m) => izinMenu(peran, m) === 'LIHAT')
  periksa(`${peran} → LIHAT semua`, semuaLihat)
}
periksa('…dan tidak satu pun boleh menulis',
  MENU_BLUD.every((m) => !bolehEdit('AKUNTANSI', m)))
periksa('…tapi tetap bisa membuka menunya',
  MENU_BLUD.every((m) => bolehBuka('AKUNTANSI', m)))

// ─── Penjaga bentuk ─────────────────────────────────────────────────────────
console.log('\n── Penjaga bentuk ──')
periksa('isMenuBlud menolak nama asing', !isMenuBlud('dpa-blud') && isMenuBlud('dpa'))
periksa('Peran kosong tidak melempar', izinMenu('', 'dpa') === 'LIHAT')

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
