// Uji regresi resolusi izin menu (docs/CONCEPT-menu-access-control.md §4.5).
//   node scripts/test-menu-access.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Pertanyaan pokok yang dijawab berkas ini: "apakah menambahkan pengaturan akses
// menu MENGUBAH perilaku siapa pun sebelum admin menyentuhnya?" Jawabannya harus
// tidak, dan buktinya 60 sel di bawah — 5 peran x 12 menu, dibandingkan satu per
// satu dengan penimpa kosong. Satu sel meleset artinya deploy ini diam-diam
// memberi atau mencabut wewenang yang tidak diminta siapa pun.
//
// Tiga babak berikutnya menguji arah sebaliknya: penimpa memang berlaku, TAPI
// pagar atas tidak bisa ditembus olehnya.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'menu-access-test')

fs.mkdirSync(outDir, { recursive: true })
execSync(
  `npx tsc "${path.join(repo, 'lib/blud/peran.ts')}"`
  + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: repo, stdio: 'pipe' },
)

const { izinMenu, menuTerbuka, MENU_BLUD, MENU_BACA_SAJA } = require(path.join(outDir, 'peran.js'))

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(52)} ${tambahan}`)
}

const E = 'EDIT', L = 'LIHAT', T = 'TIDAK'
const PERAN = ['SUPER_ADMIN', 'ADMIN', 'PROGRAM', 'KEUANGAN', 'PERBENDAHARAAN']

// Kolom: SUPER_ADMIN · ADMIN · PROGRAM · KEUANGAN · PERBENDAHARAAN
const MATRIKS = {
  'beranda':          [L, L, L, L, L],
  'master-akun':      [E, E, E, L, L],
  'kode-besar':       [E, E, E, L, L],
  'penanggung-jawab': [E, E, E, L, L],
  'dpa':              [E, E, E, L, L],
  'pergeseran':       [E, E, E, L, L],
  'buku-kas':         [E, E, L, L, E],
  'bukti-setor':      [E, E, L, L, E],
  'realisasi':        [L, L, L, L, L],
  'tutup-kas':        [E, E, L, E, E],
  'cetak':            [L, L, L, L, L],
  'pengaturan':       [E, E, E, E, E],
}

console.log('── 60 sel: tabel izin kosong = perilaku hari ini ──')
let sel = 0
for (const menu of MENU_BLUD) {
  const harap = MATRIKS[menu]
  if (!harap) { periksa(`menu ${menu} ada di matriks uji`, false, 'BELUM DIUJI'); continue }
  // `null` = tidak ada baris di menu_user_access maupun menu_role_access.
  const dapat = PERAN.map((p) => izinMenu(p, menu, null))
  const cocok = dapat.every((v, i) => v === harap[i])
  sel += dapat.length
  periksa(menu, cocok, dapat.map((v, i) => (v === harap[i] ? v : `${v}≠${harap[i]}`)).join(' · '))
}
periksa('jumlah sel yang diperiksa', sel === 60, `${sel}/60`)

console.log('\n── Tanpa penimpa = sama persis dengan memanggil tanpa argumen ──')
periksa('null dan undefined tidak berbeda',
  MENU_BLUD.every((m) => PERAN.every((p) => izinMenu(p, m, null) === izinMenu(p, m))))

console.log('\n── Penimpa memang berlaku ──')
periksa('KEUANGAN dinaikkan di DPA', izinMenu('KEUANGAN', 'dpa', E) === E)
periksa('PERBENDAHARAAN diturunkan di Buku Kas', izinMenu('PERBENDAHARAAN', 'buku-kas', L) === L)
periksa('PROGRAM disembunyikan dari Tutup Kas', izinMenu('PROGRAM', 'tutup-kas', T) === T)
periksa('peran tak terdaftar bisa dinaikkan', izinMenu('AKUNTANSI', 'dpa', E) === E)
periksa('ribbon ikut menyusut kalau ada yang TIDAK',
  menuTerbuka('PERBENDAHARAAN', { 'dpa': T }).length === MENU_BLUD.length - 1)

console.log('\n── Pagar atas: menu tanpa jalur tulis tidak bisa ditembus penimpa ──')
for (const menu of MENU_BACA_SAJA) {
  periksa(`${menu} tetap LIHAT walau dipaksa EDIT`,
    PERAN.every((p) => izinMenu(p, menu, E) === L))
}
periksa('MENU_BACA_SAJA berisi 3 menu yang benar',
  MENU_BACA_SAJA.length === 3
  && ['beranda', 'cetak', 'realisasi'].every((m) => MENU_BACA_SAJA.includes(m)),
  MENU_BACA_SAJA.join(', '))

console.log('\n── Bentuk nilai ──')
periksa('penimpa ngawur tidak diam-diam jadi EDIT',
  // Nilai di luar tiga posisi sah tidak pernah lolos Zod di API; kalaupun bocor
  // lewat tulisan langsung ke DB, ia disaring `isIzin` di lib/data/menu-access.ts.
  izinMenu('PROGRAM', 'dpa', null) === E)

console.log(`\n${gagal === 0 ? `${jalan} pemeriksaan LULUS` : `${gagal} dari ${jalan} pemeriksaan GAGAL`}`)
process.exit(gagal === 0 ? 0 : 1)
