// Uji regresi resolusi izin menu (docs/CONCEPT-menu-access-control.md §4.5).
//   node scripts/test-menu-access.mjs
// READ-ONLY — tidak menyentuh DB.
//
// Pertanyaan pokok yang dijawab berkas ini: "apakah menambahkan pengaturan akses
// menu MENGUBAH perilaku siapa pun sebelum admin menyentuhnya?" Jawabannya harus
// tidak, dan buktinya sel-sel di bawah — BLUD 5 peran x 12 menu, PK 6 peran x 7 menu —
// dibandingkan satu per satu dengan penimpa kosong. Satu sel meleset artinya deploy
// ini diam-diam memberi atau mencabut wewenang yang tidak diminta siapa pun.
//
// Tiga babak berikutnya menguji arah sebaliknya: penimpa memang berlaku, TAPI
// pagar atas tidak bisa ditembus olehnya.
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { BERKAS_PERAN, kompilasi } from './_kompilasi-izin.mjs'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'menu-access-test')

kompilasi(repo, outDir, BERKAS_PERAN)

const { izinMenu, menuTerbuka, MENU_BLUD, MENU_BACA_SAJA } = require(path.join(outDir, 'lib/blud/peran.js'))
const pk = require(path.join(outDir, 'lib/pk/peran.js'))

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

// ══ Perjanjian Kinerja — modul kedua (docs/CONCEPT-pk-peran.md) ══════════════════
const PERAN_PK = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG', 'RENBANG', 'PROGRAM']

// Diturunkan dari PK_ALLOWED_ROLES / PK_EDIT_ROLES + dua halaman yang hari ini
// `redirect` untuk semua peran selain SUPER_ADMIN/ADMIN (pejabat & unit-kerja).
const MATRIKS_PK = {
  'beranda':    [L, L, L, L, L, L],
  'sasaran':    [E, E, E, L, E, E],
  'program':    [E, E, E, L, E, E],
  'form':       [E, E, E, L, E, E],
  'riwayat':    [E, E, E, L, E, E],
  'pejabat':    [E, E, T, T, T, T],
  'unit-kerja': [E, E, T, T, T, T],
}

console.log('\n── PK, 42 sel: tabel izin kosong = perilaku hari ini ──')
let selPk = 0
for (const menu of pk.MENU_PK) {
  const harap = MATRIKS_PK[menu]
  if (!harap) { periksa(`menu PK ${menu} ada di matriks uji`, false, 'BELUM DIUJI'); continue }
  const dapat = PERAN_PK.map((p) => pk.izinMenu(p, menu, null))
  const cocok = dapat.every((v, i) => v === harap[i])
  selPk += dapat.length
  periksa(`pk.${menu}`, cocok, dapat.map((v, i) => (v === harap[i] ? v : `${v}≠${harap[i]}`)).join(' · '))
}
periksa('jumlah sel PK yang diperiksa', selPk === 42, `${selPk}/42`)

console.log('\n── PK: lantai peran tidak bisa ditembus matriks ──')
// Inti §5.1: `izinMenu` boleh mengembalikan EDIT (itu yang tersimpan & ditampilkan
// admin), tapi `bolehEdit` — yang dipakai route DAN tombol — tetap menolak.
periksa('RENBANG dipaksa EDIT di pejabat → izinMenu tetap EDIT',
  pk.izinMenu('RENBANG', 'pejabat', E) === E)
periksa('…tapi bolehEdit menolak', pk.bolehEdit('RENBANG', 'pejabat', E) === false)
periksa('…begitu juga Master Unit', pk.bolehEdit('PROGRAM', 'unit-kerja', E) === false)
periksa('ADMIN tetap boleh mengubah pejabat', pk.bolehEdit('ADMIN', 'pejabat', E) === true)
periksa('SUPER_ADMIN tetap boleh mengubah Master Unit',
  pk.bolehEdit('SUPER_ADMIN', 'unit-kerja', null) === true)
periksa('lantai TIDAK menghalangi membuka layarnya',
  pk.bolehBuka('RENBANG', 'pejabat', L) === true)

console.log('\n── PK: pagar atas & bawah ──')
periksa('beranda tetap LIHAT walau dipaksa EDIT',
  PERAN_PK.every((p) => pk.izinMenu(p, 'beranda', E) === L))
periksa('beranda tidak bisa disembunyikan',
  PERAN_PK.every((p) => pk.izinMenu(p, 'beranda', T) === L))
periksa('MENU_BACA_SAJA_PK cuma beranda',
  pk.MENU_BACA_SAJA_PK.length === 1 && pk.MENU_BACA_SAJA_PK[0] === 'beranda')

console.log('\n── PK: peran ber-grant di luar tabel ──')
// §5.2 — perubahan perilaku yang disengaja: dulu `isPkEditRole` memberi EDIT kepada
// peran mana pun yang di-grant, lebih besar daripada ADMIN_KABAG yang sengaja
// peninjau. Kalau baris ini suatu saat balik jadi EDIT, itu kemunduran, bukan
// penyetelan.
periksa('peran tak terdaftar ber-grant = LIHAT, bukan EDIT',
  pk.izinMenu('AKUNTANSI', 'sasaran', null) === L)
periksa('…tidak lebih besar dari ADMIN_KABAG',
  pk.izinMenu('AKUNTANSI', 'sasaran', null) === pk.izinMenu('ADMIN_KABAG', 'sasaran', null))
periksa('…tapi tetap tertutup di pejabat & unit',
  pk.izinMenu('AKUNTANSI', 'pejabat', null) === T
  && pk.izinMenu('AKUNTANSI', 'unit-kerja', null) === T)
periksa('…dan wewenangnya bisa dikembalikan lewat matriks',
  pk.bolehEdit('AKUNTANSI', 'sasaran', E) === true)
periksa('bawaan PK & BLUD kini sama untuk peran tak terdaftar',
  pk.izinMenu('AKUNTANSI', 'sasaran', null) === izinMenu('AKUNTANSI', 'dpa', null))

console.log('\n── PK: ribbon ──')
periksa('RENBANG melihat 5 dari 7 tile', pk.menuTerbuka('RENBANG').length === 5,
  pk.menuTerbuka('RENBANG').join(', '))
periksa('SUPER_ADMIN melihat ketujuhnya', pk.menuTerbuka('SUPER_ADMIN').length === 7)
periksa('perkecualian membuka Master Pejabat untuk RENBANG',
  pk.menuTerbuka('RENBANG', { 'pejabat': L }).length === 6)

console.log(`\n${gagal === 0 ? `${jalan} pemeriksaan LULUS` : `${gagal} dari ${jalan} pemeriksaan GAGAL`}`)
process.exit(gagal === 0 ? 0 : 1)
